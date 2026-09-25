/**
 * Repairing a hole in the middle of a mirror.
 *
 * A hole is not repaired by the replay ask: that replays the Session's *newest
 * window*, which fills what is behind and what is near the top, and cannot reach a
 * run that went missing further down. So each hole is asked for on its own, as a
 * page read aimed at it — the page that ends at the last sequence held above the
 * hole, which is what the origin's own log can serve.
 *
 * These tests use a fake origin stream, so the ask is observable: what it names,
 * and how many times it is made.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SyncHub } from '../src/host/hub.ts'
import type { DownstreamCommand } from '../src/shared/protocol.ts'

const MACHINE = 'hole-origin'
const SESSION = 'session-hole-0000-0000-000000000000'

/** A hub with one mirror, and a recording origin stream attached to it. */
function bench(retryMs = 0): {
  hub: SyncHub
  older: { throughSeq: number; maxMessages: number }[]
  resyncs: string[]
} {
  const older: { throughSeq: number; maxMessages: number }[] = []
  const resyncs: string[] = []
  // The floors are injected rather than waited out: this is about what the hub
  // asks for, not about how often it is allowed to ask.
  const hub = new SyncHub(() => {}, () => ({}) as never, { info: () => {}, warn: () => {}, error: () => {} }, {
    resyncRetryMs: retryMs,
    olderAskFloorMs: 0,
  })
  hub.publishIndex({
    machineName: MACHINE,
    sessions: [{ sessionId: SESSION, title: 'x', updatedAt: 1, running: false, lastSeq: 999 }],
  })
  hub.attachOrigin(MACHINE, {
    send: (_command: DownstreamCommand) => {},
    resync: (sessionId: string) => { resyncs.push(sessionId) },
    older: (sessionId: string, throughSeq: number, maxMessages: number) => {
      assert.equal(sessionId, SESSION)
      older.push({ throughSeq, maxMessages })
    },
  })
  return { hub, older, resyncs }
}

/** Publish the given sequences as one batch. */
function publish(hub: SyncHub, seqs: readonly number[]): void {
  hub.publishFrames(MACHINE, {
    sessionId: SESSION,
    events: seqs.map(seq => ({ type: 'assistant/message', seq, time: 1_700_000_000_000 + seq, data: { seq } })),
  })
}

/** A run of sequences, without the ones listed as missing. */
function run(from: number, to: number, missing: readonly number[] = []): number[] {
  const seqs: number[] = []
  for (let seq = from; seq <= to; seq += 1) if (!missing.includes(seq)) seqs.push(seq)
  return seqs
}

describe('a hole in the middle of a mirror', () => {
  it('asks the origin for the page that ends inside the hole', () => {
    const { hub, older, resyncs } = bench()
    // 100..199 held, 150..159 never arrived, 200..299 held.
    publish(hub, run(100, 199, run(150, 159)))
    publish(hub, run(200, 299))
    const mirrored = hub.transcript(MACHINE, SESSION, { limit: 1 })
    assert.equal(mirrored?.hasMore, true)

    const asks = older.filter(call => call.maxMessages === 500)
    assert.ok(asks.length >= 1, 'the hole must be asked for')
    // `throughSeq` is inclusive and the page it asks for ends there, so naming the
    // hole's first sequence is what carries the hole into the page. Naming the one
    // below it (`from - 1`) asks for a page that ends before the hole starts and
    // repairs nothing — the mistake the end-to-end test caught.
    assert.ok(asks.some(call => call.throughSeq === 150), `asks: ${JSON.stringify(asks)}`)
    assert.ok(asks.every(call => call.throughSeq !== 149), 'never one below the hole')
  })

  it('stops asking once the hole is filled', () => {
    const { hub, older, resyncs } = bench()
    publish(hub, run(100, 199, run(150, 159)))
    publish(hub, run(200, 299))
    // The origin's own extent is what makes "behind" zero: a mirror that holds
    // everything the origin reports is whole, holes aside.
    hub.publishIndex({
      machineName: MACHINE,
      sessions: [{ sessionId: SESSION, title: 'x', updatedAt: 1, running: false, lastSeq: 299 }],
    })
    assert.ok(older.length + resyncs.length > 0, 'the hole was asked for while it existed')

    // The origin answers with the missing run.
    publish(hub, run(150, 159))
    const before = older.length + resyncs.length
    // A repair can only be retried on the sweep, which is where a lost batch is
    // noticed; a mirror that is whole must clear the episode rather than keep
    // asking.
    hub.sweepGaps()
    assert.equal(older.length + resyncs.length, before, 'a whole mirror asks for nothing')
    assert.equal(hub.machines()[0]?.sessions[0]?.missingEvents, 0)
  })

  it('asks for every hole, lowest first', () => {
    const { hub, older } = bench()
    publish(hub, run(100, 299, [...run(150, 155), ...run(250, 253)]))
    hub.transcript(MACHINE, SESSION, { limit: 1 })
    const asked = older.map(call => call.throughSeq)
    assert.ok(asked.includes(150), `asks: ${JSON.stringify(asked)}`)
    assert.ok(asked.includes(250), `asks: ${JSON.stringify(asked)}`)
  })

  it('asks again on the sweep while the hole survives', () => {
    const { hub, older } = bench()
    publish(hub, run(100, 199, run(150, 159)))
    publish(hub, run(200, 299))
    const first = older.length
    assert.ok(first > 0, 'the first ask comes with the batch that left the hole')
    // A hole nothing else mentions has to come back around: the sweep is what
    // notices it, which is also why the retry exists at all.
    hub.sweepGaps()
    assert.ok(older.length > first, 'a surviving hole is asked for again')
  })

  it('waits out the retry floor before asking again', () => {
    // The floor is wide, so exactly one ask fits: the index is published first and
    // spends it (an origin claiming more than an empty mirror holds is a gap too),
    // and what is then checked is that the sweep does not spend another.
    const { hub, older } = bench(60_000)
    publish(hub, run(100, 199, run(150, 159)))
    publish(hub, run(200, 299))
    const asks = (): number => older.filter(call => call.throughSeq === 149).length
    assert.equal(asks(), 0, 'the floor was already spent when the hole appeared')
    hub.sweepGaps()
    assert.equal(asks(), 0, 'inside the floor nothing is asked even by the sweep')
  })
})
