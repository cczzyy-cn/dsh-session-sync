/**
 * The console's footer numbers, in the shapes the *shipped* footer reads them.
 *
 * The chat tab's footer is the product's own (`ui-chat`'s statistics pills and
 * `ui-conversation`'s context meter), not a copy of it: the console keeps the
 * shipped composer bar mounted and only hides its input capsule, so those two
 * components render themselves. What they read is not the wire — it is the
 * session's projection values, which the Host computes and pushes. A Session
 * this console *retained* under a synthetic identity has no Host-side unit
 * behind it, so nothing ever arrives and the shipped components would fold an
 * empty window: the totals below are that missing value, computed here from the
 * mirrored log (or, when the owning machine states them, from the machine's own
 * whole-log answer) and published into the same store the shipped components
 * read.
 *
 * Every field is the shipped fold's own field, fed with what this side actually
 * knows:
 *
 *  - `sessionStats` — counts and wall times. Turns and steps are the log's own;
 *    decode time and decode tokens are the pair the speed reading is computed
 *    from, and the same pair {@link LogStats.outputPerSecond} is rounded off
 *    (this side measures a step from its start, not from its first token — see
 *    `logStats`, which owns that rule and its justification). The three
 *    durations this side never measures — model time, tool time and first-token
 *    latency — are 0, which is the shipped "this window has no such figure"
 *    value: the pill then opens a dialog holding only the speed row it can stand
 *    behind, exactly as it does on a local Session whose window has no more.
 *  - `tokenUsage` — the four disjoint billing buckets. The log's
 *    `inputTokens` is the uncached bucket, which is the shipped fold's own
 *    mapping (`token-meter`'s `bucketsFrom`), so the total and the cache-hit
 *    share come out as the same two figures this console showed before.
 *  - `contextPressure` — what fills the window. `projectedTokens` is the shipped
 *    meter's numerator; this side states the newest reading the log carries,
 *    which is the same "~used / window" the meter's panel prints. Absent when the
 *    log states no window or no reading, which is what makes the shipped meter
 *    render nothing rather than 0%.
 *
 * Kept pure and free of React so the mapping is one testable function rather than
 * arithmetic spread through a component.
 */
import type { SessionStats } from './session-chrome.ts'

/** The shipped `sessionStats` projection value. */
export interface SessionStatsValue {
  turns: number
  steps: number
  llmMs: number
  toolMs: number
  ttftMs: number
  ttftSteps: number
  decodeMs: number
  decodeTokens: number
}

/** The shipped `tokenUsage` projection value. */
export interface TokenUsageValue {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** The shipped `contextPressure` projection value. */
export interface ContextPressureValue {
  projectedTokens: number
  contextWindow: number
}

/** One publication's worth of footer values, by projection key. */
export interface FooterProjections {
  sessionStats: SessionStatsValue
  tokenUsage: TokenUsageValue
  contextPressure?: ContextPressureValue
}

/**
 * Turn one set of footer totals into the values the shipped footer reads.
 * @param stats - the totals, from the owning machine or from the events held here.
 * @returns the three projection values; the context one only when the log states
 *   both a window and a reading.
 */
export function footerProjections(stats: SessionStats): FooterProjections {
  const context = stats.context
  return {
    sessionStats: {
      turns: stats.turns,
      steps: stats.steps,
      llmMs: 0,
      toolMs: 0,
      ttftMs: 0,
      ttftSteps: 0,
      // `generationMs` is what the rate is divided by. An origin that predates the
      // field sends no denominator, so the speed reading drops rather than being
      // computed from a step's whole duration (which counts its tool calls).
      decodeMs: stats.generationMs ?? (stats.outputPerSecond === undefined
        ? 0
        : Math.round(stats.usage.outputTokens / stats.outputPerSecond * 1_000)),
      decodeTokens: stats.usage.outputTokens,
    },
    tokenUsage: {
      uncachedInputTokens: stats.usage.inputTokens,
      outputTokens: stats.usage.outputTokens,
      cacheReadTokens: stats.usage.cacheReadTokens,
      // The log carries no separate cache-write bucket: a provider that bills one
      // reports it inside the same usage record this side already reads, and
      // counting it twice would inflate the total the pills print.
      cacheWriteTokens: 0,
    },
    ...(context === undefined
      ? {}
      : { contextPressure: { projectedTokens: context.used, contextWindow: context.window } }),
  }
}

/**
 * The same values as one plain record, which is the shape a projection store
 * takes them in. Its own function so the mapping stays the only place a
 * projection key is named.
 *
 * Every key is present even when its value is: the store keeps the last value it
 * was handed, so *omitting* a key would leave a reading the log no longer states
 * on screen — a Session whose log has no window would keep showing the previous
 * one. Writing `undefined` is what the shipped reader calls "capability absent",
 * and it is how the meter is taken down.
 * @param projections - the values {@link footerProjections} produced.
 * @returns one record per projection key, in a stable key order.
 */
export function projectionRecord(projections: FooterProjections): Record<string, unknown> {
  return {
    sessionStats: projections.sessionStats,
    tokenUsage: projections.tokenUsage,
    contextPressure: projections.contextPressure,
  }
}

/**
 * The watermark to publish the next value at.
 *
 * The store refuses a value whose watermark is not above the one it already
 * holds, which makes this the one rule a publisher can silently lose to — and
 * losing it is invisible: the footer keeps the previous reading and looks
 * perfectly healthy. Two ways to lose it, so two terms:
 *
 *  - a Session *re-opened* after its mirror was released. The store outlives the
 *    mirror, so a per-mirror counter that restarted at 1 would be refused by the
 *    values the previous open left behind. Hence a counter that never goes
 *    backwards for the plugin's lifetime, on the object that owns the publication.
 *  - a *repeated* publication of the same window: the machine restating its
 *    whole-log totals on a poll, with no new event to move the floor.
 *
 * The floor is the newest durable sequence held, which is the log's own order of
 * magnitude — a Session whose values came from a previous open left watermarks in
 * that range, so starting above it is what makes the first publication of the new
 * open land rather than vanish.
 * @param previous - the last watermark this publisher used, or 0 for none yet.
 * @param floor - the newest durable sequence the values are consistent with.
 * @returns the watermark to publish at, strictly above both.
 */
export function nextWatermark(previous: number, floor: number): number {
  return Math.max(previous + 1, floor + 1)
}
