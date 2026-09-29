/**
 * Whether the events a console holds are the whole log, provable on this side.
 *
 * The regression this pins was reported with two screenshots: the machine said 956
 * steps and the console said 849 while its own label claimed "整份日志". The chain had
 * stopped saying "there is more", which is not the same as holding everything — so the
 * label now rests on counting the held sequences instead.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { logCoverage } from '../src/client/log-coverage.ts'
import type { MirrorEvent } from '../src/shared/protocol.ts'

/** One durable event at a sequence. */
function at(seq: number): MirrorEvent {
  return { seq, time: seq, type: 'turn/start', data: {} } as unknown as MirrorEvent
}

describe('what the held events cover', () => {
  it('reports no gaps for a contiguous run', () => {
    assert.deepEqual(logCoverage([at(0), at(1), at(2), at(3)]), { gaps: 0, first: 0, last: 3 })
  })

  it('counts a hole in the middle', () => {
    // The reported case: a range that stops short of the log's start looks much like
    // this, and the point is that it *shows*.
    assert.deepEqual(logCoverage([at(0), at(1), at(4), at(5)]), { gaps: 2, first: 0, last: 5 })
  })

  it('does not care about the order events arrived in', () => {
    assert.deepEqual(logCoverage([at(5), at(0), at(4), at(1)]), { gaps: 2, first: 0, last: 5 })
  })

  it('ignores transient rows, which sit between durable sequences', () => {
    const transient = { seq: 2.5, time: 3, type: 'assistant/live-chunk', data: {} } as unknown as MirrorEvent
    assert.deepEqual(logCoverage([at(0), at(1), at(2), transient]), { gaps: 0, first: 0, last: 2 })
  })

  it('says nothing about nothing', () => {
    assert.deepEqual(logCoverage([]), { gaps: 0, first: undefined, last: undefined })
  })
})