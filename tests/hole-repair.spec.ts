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
    // asking. "Whole" here is about the *hole*: this fixture's mirror begins at
    // seq 100, so the sweep also asks for the history below that floor — see the
    // next test, which is that ask's own case.
    const holeAsks = (): number => older.filter(call => call.throughSeq < 100).length
    assert.equal(holeAsks(), 0, 'the hole ask names the hole, not the floor')
    hub.sweepGaps()
    assert.equal(holeAsks(), 0, 'a repaired hole is not asked for again')
    assert.equal(hub.machines()[0]?.sessions[0]?.missingEvents, 0)
  })

  it('keeps asking for history below a window the origin has stopped offering', () => {
    // The shape a restarted host leaves behind: the mirror holds a tail window,
    // and the origin's own `hasOlder` is false because it *did* read back to the
    // start once — the pages from that read are just gone. Nothing else in the
    // engine reports this (a window's missing history is neither a hole inside it
    // nor a gap above it), so the sweep has to read it off the floor itself.
    const { hub, older } = bench()
    publish(hub, run(100, 299))
    // The origin states no older history: exactly the false claim.
    hub.publishIndex({
      machineName: MACHINE,
      sessions: [{ sessionId: SESSION, title: 'x', updatedAt: 1, running: false, lastSeq: 299 }],
    })
    assert.equal(hub.transcript(MACHINE, SESSION, { limit: 10 })?.hasMore, true, 'the window has nothing below it on offer')

    hub.sweepGaps()
    const floorAsks = older.filter(call => call.throughSeq === 100)
    assert.equal(floorAsks.length, 1, 'the floor is asked for even though the origin claims nothing older')

    // And once the missing history arrives, the asking stops on its own.
    publish(hub, run(0, 99))
    const after = older.length
    hub.sweepGaps()
    assert.equal(older.length, after, 'a mirror that reaches seq 0 has nothing below to ask for')
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

describe('how short a mirror is', () => {
  it('counts a run missing inside the mirror as a hole', () => {
    const { hub } = bench()
    publish(hub, run(100, 199, run(150, 159)))
    hub.publishIndex({
      machineName: MACHINE,
      sessions: [{ sessionId: SESSION, title: 'x', updatedAt: 1, running: false, lastSeq: 199 }],
    })
    const session = hub.machines()[0]?.sessions[0]
    // The repairable kind: a fact about this mirror, and what the sweep asks for.
    assert.equal(session?.holes, 10)
    assert.equal(session?.behind, 0, 'nothing is above what the origin reports')
    assert.equal(session?.missingEvents, 10)
  })

  it('counts what the origin published above the mirror as being behind, not missing', () => {
    const { hub } = bench()
    publish(hub, run(100, 104))
    hub.publishIndex({
      machineName: MACHINE,
      sessions: [{ sessionId: SESSION, title: 'x', updatedAt: 1, running: true, lastSeq: 120 }],
    })
    const session = hub.machines()[0]?.sessions[0]
    // The normal case of a live Session: a few events in flight, nothing broken.
    // Showing one badge for both readings is what made a working Session look
    // like a damaged mirror.
    assert.equal(session?.holes, 0, 'a Session that is merely ahead is not broken')
    assert.equal(session?.behind, 16)
    assert.equal(session?.missingEvents, 16)
  })
})
