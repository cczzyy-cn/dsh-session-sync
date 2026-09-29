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
 *  - throughput is output tokens over the wall time of the steps that produced an
 *    assistant message, so a long tool call does not read as a slow model.
 */
import type { MirrorEvent } from './protocol.ts'

/** Token totals summed over a Session's assistant messages. */
export interface LogUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  reasoningTokens: number
}

/** Totals the composer's status row renders. */
export interface LogStats {
  turns: number
  steps: number
  usage: LogUsage
  /** Share of input tokens served from cache, when any input was reported. */
  cacheHitPercent?: number
  /** Summed wall time of the steps that produced an assistant message. */
  stepMs: number
  /** Output tokens per second over those steps. */
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
      if (started !== undefined) stepMs += Math.max(0, event.time - started)
      continue
    }
    if (event.type === 'assistant/message') {
      const reported = asRecord(data?.['usage'])
      usage.inputTokens += number(reported?.['inputTokens']) ?? 0
      usage.outputTokens += number(reported?.['outputTokens']) ?? 0
      usage.cacheReadTokens += number(reported?.['cacheReadTokens']) ?? 0
      usage.reasoningTokens += number(reported?.['reasoningTokens']) ?? 0
    }
  }

  const inputTotal = usage.inputTokens + usage.cacheReadTokens
  const outputPerSecond = stepMs > 0 && usage.outputTokens > 0
    ? Math.round(usage.outputTokens / (stepMs / 1000))
    : undefined
  return {
    turns,
    steps,
    usage,
    ...(inputTotal > 0 ? { cacheHitPercent: Math.round((usage.cacheReadTokens / inputTotal) * 1000) / 10 } : {}),
    stepMs,
    ...(outputPerSecond === undefined ? {} : { outputPerSecond }),
    ...(firstTime === undefined ? {} : { firstTime }),
    ...(lastTime === undefined ? {} : { lastTime }),
  }
}
