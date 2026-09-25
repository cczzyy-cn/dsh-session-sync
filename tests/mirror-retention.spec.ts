/**
 * The mirror's retention ceiling, and the one caller allowed to raise it.
 *
 * The mirror is a tail by design: it keeps the newest `EVENT_LIMIT` events and
 * trims the front. Materializing needs the *beginning*, so walking the origin
 * back through that cap did nothing — each page arrived and was trimmed away
 * again by the events above it, and the low edge parked at the cap with the
 * Session looking whole while being short. Measured live: a walk that had reached
 * `10958..11835` stopped dead at exactly `7836..11835` (4,000 events) and stayed
 * there for the rest of its rounds.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SyncHub } from '../src/host/hub.ts'

const quiet = { info: () => {}, warn: () => {}, error: () => {} }
const MACHINE = 'retain-origin'
const SESSION = 'session-retain-0000-0000-000000000000'

/** A hub holding one machine's Session, ready to be published into. */
function hub(): SyncHub {
  const mirror = new SyncHub(() => {}, () => ({}) as never, quiet)
  mirror.publishIndex({ machineName: MACHINE, sessions: [{ sessionId: SESSION, title: 'x', updatedAt: 1, running: false }] })
  return mirror
}

/** Push `count` events, continuing the sequence this hub already holds. */
function publish(mirror: SyncHub, count: number): void {
  const held = mirror.transcript(MACHINE, SESSION, { limit: 100_000 })?.events.length ?? 0
  mirror.publishFrames(MACHINE, {
    sessionId: SESSION,
    events: Array.from({ length: count }, (_, index) => ({
      type: 'assistant/message',
      seq: held + index,
      time: 1_700_000_000_000 + held + index,
      data: { seq: held + index },
    })),
  })
}

describe('the mirror retention ceiling', () => {
  it('trims the front at its own cap by default', () => {
    const mirror = hub()
    publish(mirror, 4_500)
    const held = mirror.transcript(MACHINE, SESSION, { limit: 100_000 })
    assert.equal(held?.events.length, 4_000)
    assert.equal(held?.events[0]?.seq, 500)
  })

  it('keeps the history a caller asked to retain', () => {
    const mirror = hub()
    publish(mirror, 1)
    // The caller raises the ceiling before reading, exactly as materializing does.
    mirror.transcript(MACHINE, SESSION, { limit: 1, retain: 20_000 })
    publish(mirror, 4_499)
    const held = mirror.transcript(MACHINE, SESSION, { limit: 100_000 })
    assert.equal(held?.events.length, 4_500, 'nothing may be trimmed below the raised ceiling')
    assert.equal(held?.events[0]?.seq, 0)
  })

  it('never lowers a raised ceiling, and never exceeds its own hard bound', () => {
    const mirror = hub()
    mirror.transcript(MACHINE, SESSION, { limit: 1, retain: 20_000 })
    // An ordinary read that names a smaller budget must not shrink what a backfill
    // is holding: the hold is a high-water mark, not a per-read setting.
    mirror.transcript(MACHINE, SESSION, { limit: 400, retain: 4_000 })
    publish(mirror, 4_500)
    assert.equal(mirror.transcript(MACHINE, SESSION, { limit: 100_000 })?.events.length, 4_500)

    // A caller cannot name its own memory budget: the hub's bound wins. 4,500 +
    // 45,500 events published, 40,000 kept, so the front is trimmed to 10,000.
    mirror.transcript(MACHINE, SESSION, { limit: 1, retain: 10_000_000 })
    publish(mirror, 45_500)
    const held = mirror.transcript(MACHINE, SESSION, { limit: 100_000 })
    assert.equal(held?.events.length, 40_000, 'the hard ceiling is the hub’s, not the caller’s')
    assert.equal(held?.events[0]?.seq, 10_000)
  })

  it('drops the hold when the caller that asked for it is done', () => {
    const mirror = hub()
    mirror.transcript(MACHINE, SESSION, { limit: 1, retain: 20_000 })
    publish(mirror, 4_500)
    assert.equal(mirror.transcript(MACHINE, SESSION, { limit: 100_000 })?.events.length, 4_500)

    mirror.transcript(MACHINE, SESSION, { limit: 1, release: true })
    // Back to the ordinary cap, so the next batch trims the front again: the hold
    // is for the walk, not for the Session's life.
    mirror.publishFrames(MACHINE, {
      sessionId: SESSION,
      events: [{ type: 'assistant/message', seq: 4_500, time: 1, data: {} }],
    })
    const held = mirror.transcript(MACHINE, SESSION, { limit: 100_000 })
    assert.equal(held?.events.length, 4_000)
    assert.equal(held?.events[0]?.seq, 501)
  })
})
