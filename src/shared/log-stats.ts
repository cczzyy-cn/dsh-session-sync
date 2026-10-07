/**
 * The footer's numbers, computed from one Session's whole log.
 *
 * Both ends need the same answer from the same rows: the machine that owns the
 * Session reads its entire log and publishes the totals, and a console that only
 * *holds* part of that log computes an answer from what it has. Keeping one
 * implementation is the point — two would drift, and the drift would look exactly
 * like the bug this exists to settle: two footers showing different steps for one
 * conversation and neither able to say which is short.
 *
 * This is deliberately a pure walk over `MirrorEvent`-shaped rows with no DSH and
 * no filesystem, so it can run in either half. The chrome that needs more than
 * totals (model, context window, policy, subagent cards) stays in the client's
 * `session-chrome.ts`, which computes its own extras from the same rows.
 *
 * The rules, each of which a reader can check against the log:
 *  - a *turn* is the highest `turn` ordinal seen, so a turn in flight still counts;
 *  - a *step* is one `step/start`;
 *  - usage is summed over `assistant/message` events only, because that is where
 *    the provider's own report lives;
 *  - throughput is output tokens over the time their own step had been running when
 *    the message arrived — from that step's `step/start` to the message. Neither
 *    the whole step nor the gap to the next message will do: a step keeps running
 *    through its tool calls (57 tok/s measured that way for a Session whose replies
 *    came at 138), and the gap between messages is mostly tool time and idle
 *    (38 tok/s the same way). What a reader is asking is how fast the model wrote,
 *    which is the step-start-to-message interval.
 */
import type { MirrorEvent } from './protocol.ts'

/** Token totals summed over a Session's assistant messages. */
export interface LogUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  reasoningTokens: number
}

/** Context occupancy: what the provider reported against the route's window. */
export interface LogContext {
  window: number
  used: number
  percent: number
}

/** Totals the composer's status row renders. */
export interface LogStats {
  turns: number
  steps: number
  usage: LogUsage
  /**
   * How full the context is, when the log states both a window and a reading.
   *
   * The same rule the shipped composer's meter uses, because a footer that disagreed
   * with the meter would be a third number for one fact: the window is the newest
   * `request/context`'s, the reading is the newest `assistant/message`'s own total.
   */
  context?: LogContext
  /** Share of input tokens served from cache, when any input was reported. */
  cacheHitPercent?: number
  /** Summed wall time of the steps that produced an assistant message. */
  stepMs: number
  /**
   * Wall time the writing itself had, summed over the steps that produced a message.
   *
   * The interval {@link outputPerSecond} is computed from, published as its own
   * number because a reader of the totals can want the rate *and* the denominator
   * behind it: the shipped composer's statistics fold takes decode time and decode
   * tokens, so a footer built on the shipped components needs both rather than the
   * rate alone.
   */
  generationMs: number
  /**
   * Output tokens per second while a step was writing.
   *
   * Measured from the step's own `step/start` to the message that reported its
   * usage — not the whole step (which runs on through tool calls) and not the gap
   * to the next message (which is mostly tool time and idle).
   */
  outputPerSecond?: number
  firstTime?: number
  lastTime?: number
}

/** One record, read as the loose shape these rows arrive in. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** One finite number field, or undefined. */
function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Compute the footer's totals for one Session log.
 * @param events - the Session's events, in log order.
 * @returns the totals; every field is present, and zero when the log says nothing.
 */
export function logStats(events: readonly MirrorEvent[]): LogStats {
  const usage: LogUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0 }
  let turns = 0
  let steps = 0
  let firstTime: number | undefined
  let lastTime: number | undefined
  let stepMs = 0
  // The generation interval: from the step that is currently running to the message
  // it produced. A message belongs to the newest `step/start` before it, which is
  // the only attribution available without trusting a per-event turn/step the older
  // rows do not always carry.
  let generationMs = 0
  let openStepStart: number | undefined
  // Context occupancy, from the same two rows the shipped meter reads: the newest
  // stated window, and the newest reading of what fills it.
  let contextWindow: number | undefined
  let contextUsed: number | undefined
  const stepStarts = new Map<string, number>()

  for (const event of events) {
    const data = asRecord(event.data)
    if (firstTime === undefined) firstTime = event.time
    lastTime = event.time

    if (event.type === 'turn/start') {
      const turn = number(data?.['turn'])
      if (turn !== undefined) turns = Math.max(turns, turn)
      continue
    }
    if (event.type === 'step/start') {
      steps += 1
      openStepStart = event.time
      const turn = number(data?.['turn'])
      const step = number(data?.['step'])
      if (turn !== undefined && step !== undefined) stepStarts.set(`${String(turn)}\u0000${String(step)}`, event.time)
      continue
    }
    if (event.type === 'step/end') {
      const turn = number(data?.['turn'])
      const step = number(data?.['step'])
      const started = turn === undefined || step === undefined
        ? undefined
        : stepStarts.get(`${String(turn)}\u0000${String(step)}`)
      if (started !== undefined && started === openStepStart) stepMs += Math.max(0, event.time - started)
      // The step is over, so a message arriving after this one is not its answer:
      // leaving the start open would charge a later turn's message to this step's
      // generation time and drag the rate down for no reason in the data.
      if (started !== undefined && started === openStepStart) openStepStart = undefined
      continue
    }
    if (event.type === 'request/context') {
      const reported = number(data?.['contextWindow'])
      if (reported !== undefined && reported > 0) contextWindow = reported
      continue
    }
    if (event.type === 'assistant/message') {
      const reported = asRecord(data?.['usage'])
      usage.inputTokens += number(reported?.['inputTokens']) ?? 0
      usage.outputTokens += number(reported?.['outputTokens']) ?? 0
      usage.cacheReadTokens += number(reported?.['cacheReadTokens']) ?? 0
      usage.reasoningTokens += number(reported?.['reasoningTokens']) ?? 0
      // What fills the window is the request's own total when the provider states
      // one, and its input plus output otherwise. Not the cache reads separately:
      // a stated total already counts them.
      const total = number(reported?.['totalTokens'])
      const surface = total ?? ((number(reported?.['inputTokens']) ?? 0) + (number(reported?.['outputTokens']) ?? 0))
      if (surface > 0) contextUsed = surface
      // The step that was running when this answer arrived is the one that wrote it.
      if (openStepStart !== undefined) generationMs += Math.max(0, event.time - openStepStart)
    }
  }

  const inputTotal = usage.inputTokens + usage.cacheReadTokens
  const outputPerSecond = generationMs > 0 && usage.outputTokens > 0
    ? Math.round(usage.outputTokens / (generationMs / 1000))
    : undefined
  const context = contextWindow === undefined || contextUsed === undefined
    ? undefined
    : {
        window: contextWindow,
        used: contextUsed,
        percent: Math.min(100, Math.round((contextUsed / contextWindow) * 100)),
      }
  return {
    turns,
    steps,
    usage,
    ...(context === undefined ? {} : { context }),
    ...(inputTotal > 0 ? { cacheHitPercent: Math.round((usage.cacheReadTokens / inputTotal) * 1000) / 10 } : {}),
    stepMs,
    generationMs,
    ...(outputPerSecond === undefined ? {} : { outputPerSecond }),
    ...(firstTime === undefined ? {} : { firstTime }),
    ...(lastTime === undefined ? {} : { lastTime }),
  }
}
