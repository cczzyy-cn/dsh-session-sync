/**
 * The footer's numbers, in the shapes the *shipped* footer reads them.
 *
 * What this pins is the mapping, not the arithmetic: the totals themselves are
 * `logStats`' business (and are tested there), while these values are what the
 * product's own statistics row and context meter consume. Two failure modes are
 * worth a test of their own:
 *
 *  - a *cleared* reading. The projection store keeps the last value it was handed,
 *    so a Session whose log stops stating a context window has to publish
 *    `undefined` rather than omit the key — omitting it leaves the previous
 *    meter on screen, which reads as a live occupancy for a log that no longer
 *    has one.
 *  - the speed's denominator. The shipped row divides decode tokens by decode
 *    time, so a build whose origin predates `generationMs` has to reach for the
 *    rate it *was* sent rather than publish a step's whole duration (which counts
 *    tool waits and reads as a slower model).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { footerProjections, nextWatermark, projectionRecord } from '../src/client/footer-projections.ts'
import type { SessionStats } from '../src/client/session-chrome.ts'

/** Totals with every field the mapping reads, overridable per case. */
function stats(over: Partial<SessionStats> = {}): SessionStats {
  return {
    turns: 41,
    steps: 359,
    usage: { inputTokens: 700, outputTokens: 1_000, cacheReadTokens: 129_999_300, reasoningTokens: 0 },
    cacheHitPercent: 99.3,
    stepMs: 20_000,
    generationMs: 10_000,
    outputPerSecond: 100,
    ...over,
  }
}

describe('the footer values the shipped components read', () => {
  it('maps the counts and the rate through unchanged', () => {
    const { sessionStats } = footerProjections(stats())
    assert.equal(sessionStats.turns, 41)
    assert.equal(sessionStats.steps, 359)
    assert.equal(sessionStats.decodeTokens, 1_000)
    // 1000 tokens over 10s is the 100 tok/s the console's own row would have shown.
    assert.equal(sessionStats.decodeMs, 10_000)
  })

  it('states the three durations this side never measures as zero, not as a guess', () => {
    const { sessionStats } = footerProjections(stats())
    assert.deepEqual(
      [sessionStats.llmMs, sessionStats.toolMs, sessionStats.ttftMs, sessionStats.ttftSteps],
      [0, 0, 0, 0],
    )
  })

  it('falls back to the stated rate when an older origin sends no denominator', () => {
    const older = stats()
    delete (older as { generationMs?: number }).generationMs
    assert.equal(footerProjections(older).sessionStats.decodeMs, 10_000)
  })

  it('drops the speed reading when there is neither a denominator nor a rate', () => {
    const older = stats()
    delete (older as { generationMs?: number }).generationMs
    delete older.outputPerSecond
    assert.equal(footerProjections(older).sessionStats.decodeMs, 0)
  })

  it('keeps the log’s input bucket as the uncached one, which is what the shipped fold does', () => {
    const { tokenUsage } = footerProjections(stats())
    assert.equal(tokenUsage.uncachedInputTokens, 700)
    assert.equal(tokenUsage.cacheReadTokens, 129_999_300)
    assert.equal(tokenUsage.outputTokens, 1_000)
    // The log carries no separate cache-write bucket: counting one would inflate
    // the total the pills print.
    assert.equal(tokenUsage.cacheWriteTokens, 0)
  })

  it('states occupancy as the meter’s numerator and capacity', () => {
    const withContext = stats({ context: { window: 1_000_000, used: 628_000, percent: 63 } })
    assert.deepEqual(
      footerProjections(withContext).contextPressure,
      { projectedTokens: 628_000, contextWindow: 1_000_000 },
    )
  })

  it('clears the meter when the log states no window or no reading', () => {
    assert.equal(footerProjections(stats()).contextPressure, undefined)
    const record = projectionRecord(footerProjections(stats()))
    // Present and undefined: the store's own vocabulary for "capability absent".
    assert.ok(Object.hasOwn(record, 'contextPressure'))
    assert.equal(record['contextPressure'], undefined)
  })

  it('publishes every key on every call, so a stale reading can never survive', () => {
    assert.deepEqual(
      Object.keys(projectionRecord(footerProjections(stats()))).sort(),
      ['contextPressure', 'sessionStats', 'tokenUsage'],
    )
  })
})

describe('the watermark a publication lands at', () => {
  it('moves forward even when the window has not', () => {
    // The machine restating its totals on a poll: same floor, and the value still
    // has to land.
    assert.equal(nextWatermark(40, 40), 41)
  })

  it('clears a floor left by an earlier open of the same Session', () => {
    // A fresh publisher after a release: its counter is 0, and the store still
    // holds rows this Session published at sequence 4000.
    assert.equal(nextWatermark(0, 4_000), 4_001)
  })

  it('is strictly increasing from wherever the publisher is', () => {
    let seq = 0
    const seen: number[] = []
    for (const floor of [7, 7, 6, 9, 9, 100]) {
      seq = nextWatermark(seq, floor)
      seen.push(seq)
    }
    assert.deepEqual(seen, [8, 9, 10, 11, 12, 101])
  })
})
