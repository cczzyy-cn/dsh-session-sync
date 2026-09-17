/**
 * Per-turn latency, throughput and route, folded from the mirrored events.
 *
 * Ported from `ui-chat`'s `turn-metrics.ts` (and the stream first-token reader it
 * calls in `dsh-llm`), neither of which a plugin can import. The arithmetic is
 * theirs: TTFT is the turn's lowest step's request-dispatch-to-first-token
 * reading, and throughput divides summed output tokens by summed decode wall
 * time over the steps that carry both. The mirror's durable events carry the
 * same compact stream records the host reads, so the numbers are the product's
 * rather than an approximation.
 */
import type { MirrorEvent } from '../shared/protocol.ts'

/** Latency and decode-throughput readings for one turn's footer dialog. */
export interface TurnMetrics {
  /** First-step TTFT in ms; absent when that step carries no recorded timing. */
  ttftMs?: number
  /** Decode throughput over steps carrying both timing and provider usage. */
  tokensPerSecond?: number
  /** `provider/model` of the route that served the turn, when the events name it. */
  routes?: string
}

/** One assistant step's derivable latency facts; null marks an unrecorded part. */
interface StepReading {
  /** step/start → first token delta, in ms. */
  ttftMs: number | null
  /** First token delta → final message, in ms. */
  decodeMs: number | null
  /** Provider-reported completion tokens. */
  outputTokens: number | null
}

/** One turn's fold while its steps are read. */
interface TurnFold {
  firstStep: number
  firstStepTtftMs: number | null
  decodeMs: number
  outputTokens: number
  sampled: boolean
  routes?: string
}

/** A record of the compact assistant stream a durable settlement carries. */
interface StreamRecord {
  type?: unknown
  time?: unknown
  time0?: unknown
  dt?: unknown
  name?: unknown
  args?: unknown
  texts?: unknown
  chunk?: unknown
}

/** One packed delta run's fragments, in order. */
function runFragments(run: StreamRecord): readonly unknown[] | undefined {
  if (run.type === 'tool-call-chunks') return Array.isArray(run.args) ? run.args : []
  if (run.type === 'text-chunks' || run.type === 'reasoning-chunks') {
    return Array.isArray(run.texts) ? run.texts : []
  }
  return undefined
}

/** Time of the first member of one packed run that passes `predicate`. */
function firstRunMemberTime(run: StreamRecord, predicate: (fragment: string) => boolean): number | undefined {
  const fragments = runFragments(run)
  if (fragments === undefined || typeof run.time0 !== 'number') return undefined
  const deltas = Array.isArray(run.dt) ? run.dt : []
  let time = run.time0
  for (let index = 0; index < fragments.length; index += 1) {
    const delta = deltas[index - 1]
    if (index > 0) {
      if (typeof delta !== 'number') return undefined
      time += delta
    }
    if (predicate(String(fragments[index]))) return time
  }
  return undefined
}

/** Time of the first member of one packed run that carries a token. */
function runFirstTokenTime(run: StreamRecord): number | undefined {
  if (run.type === 'tool-call-chunks' && run.name !== undefined) {
    return typeof run.time0 === 'number' ? run.time0 : undefined
  }
  return firstRunMemberTime(run, fragment => fragment !== '')
}

/**
 * Whether one chunk carries the model's first output token, per the shipped
 * `isTokenDelta`: a non-empty text or reasoning fragment, or a Tool-call
 * fragment carrying arguments or a name. Block, usage and finish chunks do not.
 */
function isTokenDelta(chunk: unknown): boolean {
  if (typeof chunk !== 'object' || chunk === null) return false
  const record = chunk as Record<string, unknown>
  switch (record['type']) {
    case 'text-delta':
    case 'reasoning-delta':
      return record['text'] !== ''
    case 'tool-call-delta':
      return record['argumentsDelta'] !== '' || record['name'] !== undefined
    default:
      return false
  }
}

/**
 * Time of the first token in one durable settlement's compact stream.
 * @param stream - the settlement's stream records.
 * @returns the first token's time, or undefined when the stream carries none.
 */
export function firstTokenTimeOf(stream: unknown): number | undefined {
  if (!Array.isArray(stream)) return undefined
  for (const candidate of stream) {
    if (typeof candidate !== 'object' || candidate === null) continue
    const record = candidate as StreamRecord
    const time = record.type === 'chunk'
      ? (isTokenDelta(record.chunk) && typeof record.time === 'number' ? record.time : undefined)
      : runFirstTokenTime(record)
    if (time !== undefined) return time
  }
  return undefined
}

/** A number from an unknown value, or undefined. */
function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** One record as a plain object, or undefined. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Provider-reported completion tokens, or null when unrecorded. */
function usageOutputTokens(usage: unknown): number | null {
  const output = number(asRecord(usage)?.['outputTokens'])
  return output !== undefined && output >= 0 ? output : null
}

/** `provider/model` named by an assistant settlement's message source. */
function routeOf(message: unknown): string | undefined {
  const source = asRecord(asRecord(message)?.['source'])
  const provider = source?.['provider']
  const model = source?.['model']
  return typeof provider === 'string' && typeof model === 'string' ? `${provider}/${model}` : undefined
}

/**
 * Fold the mirrored events into per-turn footer metrics.
 *
 * The fold shares `turn-metrics.ts`'s window semantics: a step contributes its
 * TTFT only when both its start and its first token are in the mirror, and its
 * decode time and output tokens only when both are recorded.
 * @param events - the surface events.
 * @returns Turn number → available metrics; turns with none are absent.
 */
export function turnMetricsOf(events: readonly MirrorEvent[]): Map<number, TurnMetrics> {
  const folds = new Map<number, TurnFold>()
  const stepStarts = new Map<string, number>()

  for (const event of events) {
    const data = asRecord(event.data)
    const turn = number(data?.['turn'])
    const step = number(data?.['step'])
    if (turn === undefined) continue
    if (event.type === 'step/start' && step !== undefined) {
      stepStarts.set(`${turn}/${step}`, event.time)
      continue
    }
    if (event.type !== 'assistant/message' || step === undefined) continue

    const message = data?.['message']
    const firstToken = firstTokenTimeOf(data?.['stream']) ?? null
    const stepStartTime = stepStarts.get(`${turn}/${step}`) ?? null
    const reading: StepReading = {
      ttftMs: stepStartTime !== null && firstToken !== null ? Math.max(0, firstToken - stepStartTime) : null,
      decodeMs: firstToken !== null ? Math.max(0, event.time - firstToken) : null,
      outputTokens: usageOutputTokens(data?.['usage']),
    }

    let fold = folds.get(turn)
    if (fold === undefined) {
      fold = { firstStep: step, firstStepTtftMs: reading.ttftMs, decodeMs: 0, outputTokens: 0, sampled: false }
      folds.set(turn, fold)
    } else if (step < fold.firstStep) {
      fold.firstStep = step
      fold.firstStepTtftMs = reading.ttftMs
    }
    if (fold.routes === undefined) {
      const route = routeOf(message)
      if (route !== undefined) fold.routes = route
    }
    if (reading.decodeMs !== null && reading.outputTokens !== null) {
      fold.decodeMs += reading.decodeMs
      fold.outputTokens += reading.outputTokens
      fold.sampled = true
    }
  }

  const metrics = new Map<number, TurnMetrics>()
  for (const [turn, fold] of folds) {
    const entry: TurnMetrics = {}
    if (fold.firstStepTtftMs !== null) entry.ttftMs = fold.firstStepTtftMs
    if (fold.sampled && fold.decodeMs > 0) entry.tokensPerSecond = fold.outputTokens / (fold.decodeMs / 1000)
    if (fold.routes !== undefined) entry.routes = fold.routes
    metrics.set(turn, entry)
  }
  return metrics
}
