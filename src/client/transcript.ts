/**
 * Turn one mirrored Session log into rows a human can read.
 *
 * The mirror carries the origin's events verbatim — plus, since the surface
 * rewrite, the placement that says whether an event appends to the conversation
 * or replaces part of it — which is deliberate: the server never has to agree
 * with the origin about what an event means, so a newer DSH on the other side
 * cannot break this side. The cost is that reading them happens here, and every
 * accessor below therefore treats `data` as unknown and falls through to
 * "nothing to show" instead of throwing.
 *
 * A tool call and its result are one row, not two: the log records them as
 * separate events, but nobody reads a call and its output as separate things.
 * `callId` is the pairing key the core itself uses, so the two are joined
 * without guessing at ordering.
 */
import type { MirrorEvent } from '../shared/protocol.ts'

/** One assistant content block, in the order the model wrote it. */
export type AssistantBlock =
  | { kind: 'reasoning'; text: string }
  | { kind: 'text'; text: string }
  /** An image block's bytes never reach the mirror; only its facts do. */
  | { kind: 'image'; detail: string }
  | { kind: 'unknown'; payload: unknown }

/** One renderable transcript row. */
export type TranscriptRow =
  | { kind: 'user'; key: string; time: number; text: string }
  | { kind: 'assistant'; key: string; time: number; blocks: AssistantBlock[]; interrupted: boolean; facts?: TurnFacts; tail: boolean }
  | NoticeRow
  | RetryRow
  | ToolRow

/** One turn's billed usage, summed over the assistant messages it committed. */
export interface TurnUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
}

/**
 * What a turn's tail shows about the turn itself.
 *
 * The shipped tail carries the turn's token total and its wall time in the
 * message's own actions row; both ride the turn's events, so nothing extra is
 * needed to render them.
 */
export interface TurnFacts {
  usage: TurnUsage
  /** Turn wall time: `turn/start` to `turn/end`, or to the newest event while it runs. */
  runMs: number
  running: boolean
}

/**
 * One turn-end notice — the shipped chat's `turn-error` / `turn-max-tokens`
 * nodes, which are what tell a reader why a turn stopped producing.
 */
export interface NoticeRow {
  kind: 'notice'
  key: string
  time: number
  tone: 'error' | 'warning'
  /** Failure message, or empty for a cap notice. */
  message: string
  code?: string
}

/**
 * One model-retry chain, as the shipped chat renders it.
 *
 * The shipped node shows the chain's *current* attempt, not every attempt, so
 * this is one row per `retryId` that updates in place as the chain moves.
 */
export interface RetryRow {
  kind: 'retry'
  key: string
  time: number
  /** 1-based attempt number. */
  retry: number
  /** `maxRetries` for a bounded policy; absent when the policy is unbounded. */
  maximum?: number
  delayMs: number
  state: 'scheduled' | 'started' | 'cancelled'
  failure: string
}

/** One tool call, joined with its result when the log holds one. */
export interface ToolRow {
  kind: 'tool'
  key: string
  time: number
  /** The call's identity; empty for a result whose call fell outside the window. */
  callId: string
  /** Wire tool name, empty when only the result was mirrored. */
  name: string
  /** One-line gist of the arguments, for the collapsed row. */
  summary: string
  /**
   * The call's own `description` argument, which the shipped terminal row shows
   * instead of the command it runs.
   */
  description: string
  /** One-line failure text, which replaces the summary on a failed call. */
  errorSummary: string
  /** The structured failure code, which says whether a call was interrupted. */
  errorCode: string
  /** The call's arguments exactly as the model wrote them, for the card models. */
  argumentsRaw: string
  /** Formatted arguments, for the fallback body. */
  argumentsText: string
  /** The result's content blocks, which the card models validate. */
  resultBlocks: readonly unknown[]
  /** Every visible result block joined, for the fallback body. */
  resultText: string
  /** The result's structured presentation metadata, verbatim. */
  meta: unknown
  isError: boolean
  /** True while the call has no matching result in the mirrored window. */
  pending: boolean
}

/** Longest argument gist shown on the collapsed row. */
const SUMMARY_LIMIT = 140

/** Longest argument or result body retained for the expanded row. */
const BODY_LIMIT = 4_000

/**
 * Argument keys worth showing on one line, most telling first.
 *
 * This is presentation, not protocol: an unknown tool falls back to its first
 * string argument, and a call with no string argument shows nothing rather than
 * a JSON blob squeezed into a row.
 */
const SUMMARY_KEYS: readonly string[] = [
  'command', 'cmd', 'file_path', 'path', 'pattern', 'query', 'objective',
  'url', 'prompt', 'text', 'title', 'description', 'id',
]

/**
 * Project a mirrored log onto readable rows, dropping bookkeeping events.
 * @param events - the mirrored events in log order.
 * @returns the rows to render, oldest first.
 */
export function toRows(events: readonly MirrorEvent[]): TranscriptRow[] {
  const rows: TranscriptRow[] = []
  const calls = new Map<string, ToolRow>()
  /** Retry chains by `retryId`, so an attempt updates its chain's one row. */
  const chains = new Map<string, RetryRow>()
  const surface = applySurface(events)
  const facts = turnFactsOf(surface)
  for (const event of surface) {
    const data = asRecord(event.data)
    if (data === undefined) continue

    if (event.type === 'tool/call') {
      const row = toolCallRow(event, data)
      rows.push(row)
      if (row.callId !== '') calls.set(row.callId, row)
      continue
    }

    if (event.type === 'tool/result') {
      const callId = callIdOf(data)
      const row = callId === '' ? undefined : calls.get(callId)
      if (row === undefined) {
        // The call is outside the mirrored window (trimmed history, or a
        // reconnect that landed mid-step): the result is still worth showing.
        rows.push(toolResultOnlyRow(event, callId, data))
        continue
      }
      row.resultText = resultTextOf(data)
      row.resultBlocks = resultBlocksOf(data)
      row.isError = isErrorOf(data)
      row.errorCode = errorCodeOf(data)
      row.errorSummary = row.isError ? firstLineOfText(row.resultText) : ''
      row.meta = data['meta']
      row.pending = false
      continue
    }

    if (event.type === 'llm/retry') {
      // One row per chain, updated in place: the shipped chat renders the
      // chain's current attempt, not one row per attempt.
      const retryId = text(data['retryId'])
      const existing = retryId === '' ? undefined : chains.get(retryId)
      const row: RetryRow = existing ?? {
        kind: 'retry',
        key: String(event.seq),
        time: event.time,
        retry: 1,
        delayMs: 0,
        state: 'scheduled',
        failure: '',
      }
      row.retry = number(data['retry']) ?? row.retry
      row.delayMs = number(data['delayMs']) ?? row.delayMs
      row.state = 'scheduled'
      row.time = event.time
      const maximum = number(data['maxRetries'])
      if (maximum === undefined) delete row.maximum
      else row.maximum = maximum
      row.failure = failureText(data['failure'])
      if (existing === undefined) {
        rows.push(row)
        if (retryId !== '') chains.set(retryId, row)
      }
      continue
    }

    if (event.type === 'llm/retry-started') {
      const retryId = text(data['retryId'])
      const row = retryId === '' ? undefined : chains.get(retryId)
      if (row !== undefined && number(data['retry']) === row.retry) row.state = 'started'
      continue
    }

    if (event.type === 'turn/end') {
      // A retry still waiting when its turn ends never ran: the shipped chat
      // marks that attempt cancelled rather than leaving it "scheduled".
      for (const row of chains.values()) {
        if (row.state === 'scheduled' && row.time <= event.time) row.state = 'cancelled'
      }
      const reason = asRecord(data['reason'])
      const kind = reason?.['kind']
      if (kind === 'error') {
        const failure = asRecord(reason?.['error'])
        rows.push({
          kind: 'notice',
          key: String(event.seq),
          time: event.time,
          tone: 'error',
          message: text(failure?.['message']),
          ...(text(failure?.['code']) === '' ? {} : { code: text(failure?.['code']) }),
        })
      } else if (kind === 'max-tokens') {
        rows.push({ kind: 'notice', key: String(event.seq), time: event.time, tone: 'warning', message: '' })
      }
      continue
    }

    const row = toRow(event, data, facts)
    if (row !== undefined) rows.push(row)
  }
  markTurnTails(rows)
  return rows
}

/**
 * Fold each turn's own facts out of its events.
 *
 * A turn carries its billed usage on the assistant messages it commits, and its
 * wall time between `turn/start` and `turn/end` — a running turn measures to its
 * newest event, so the reading moves as the mirror does rather than on a timer.
 * @param events - the surface events.
 * @returns the facts of every turn the log holds.
 */
function turnFactsOf(events: readonly MirrorEvent[]): Map<number, TurnFacts> {
  const facts = new Map<number, TurnFacts>()
  const starts = new Map<number, number>()
  for (const event of events) {
    const data = asRecord(event.data)
    const turn = number(data?.['turn'])
    if (turn === undefined) continue
    if (event.type === 'turn/start') {
      starts.set(turn, event.time)
      continue
    }
    if (event.type === 'turn/end') {
      const started = starts.get(turn) ?? event.time
      const existing = facts.get(turn)
      facts.set(turn, {
        usage: existing?.usage ?? emptyUsage(),
        runMs: Math.max(0, event.time - started),
        running: false,
      })
      continue
    }
    if (event.type !== 'assistant/message') continue
    const current = facts.get(turn) ?? { usage: emptyUsage(), runMs: 0, running: true }
    const reported = asRecord(data?.['usage'])
    current.usage.input += number(reported?.['inputTokens']) ?? 0
    current.usage.output += number(reported?.['outputTokens']) ?? 0
    current.usage.cacheRead += number(reported?.['cacheReadTokens']) ?? 0
    current.usage.cacheWrite += number(reported?.['cacheWriteTokens']) ?? 0
    current.usage.reasoning += number(reported?.['reasoningTokens']) ?? 0
    facts.set(turn, current)
  }
  // A turn that has not closed runs from its start to the newest thing it did.
  const newest = events.reduce((latest, event) => Math.max(latest, event.time), 0)
  for (const [turn, entry] of facts) {
    if (!entry.running) continue
    const started = starts.get(turn) ?? newest
    entry.runMs = Math.max(0, newest - started)
  }
  return facts
}

/** A zeroed usage total. */
function emptyUsage(): TurnUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
}

/**
 * Mark the row each turn's actions belong to.
 *
 * The shipped conversation puts a turn's actions on its closing message, so one
 * answer carries one copy button however many steps the turn took. A turn whose
 * last row is reasoning only keeps its actions on the answer that preceded it,
 * which is the row a reader copies.
 * @param rows - the projected rows, in order.
 */
function markTurnTails(rows: readonly TranscriptRow[]): void {
  const answered = new Map<number, number>()
  const anyBlock = new Map<number, number>()
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (row?.kind !== 'assistant' || row.blocks.length === 0) continue
    anyBlock.set(row.turn, index)
    if (row.blocks.some(block => block.kind === 'text')) answered.set(row.turn, index)
  }
  for (const [turn, index] of anyBlock) {
    const target = rows[answered.get(turn) ?? index]
    if (target?.kind === 'assistant') target.tail = true
  }
}

/**
 * Apply the log's surface operations.
 *
 * An event either appends to the conversation or replaces a range of it. The
 * mirror used to lose the distinction, which showed a compaction as the old
 * window *plus* the one that superseded it; keeping it makes the rows read as
 * the conversation rather than as its entire history.
 * @param events - the mirrored events in log order.
 * @returns the events the Session's surface actually holds, in order.
 */
function applySurface(events: readonly MirrorEvent[]): MirrorEvent[] {
  const surface: MirrorEvent[] = []
  for (const event of events) {
    const op = event.surfaceOp
    if (typeof op === 'object' && op !== null && op.op === 'replace') {
      if (typeof op.startSeq === 'number' && typeof op.endSeq === 'number') {
        for (let index = surface.length - 1; index >= 0; index -= 1) {
          const seq = surface[index]?.seq
          if (seq !== undefined && seq >= op.startSeq && seq <= op.endSeq) surface.splice(index, 1)
        }
      }
    }
    surface.push(event)
  }
  return surface
}

/** Project one non-tool event, or undefined when it is not conversation. */
function toRow(event: MirrorEvent, data: Record<string, unknown>, facts: ReadonlyMap<number, TurnFacts>): TranscriptRow | undefined {
  const key = String(event.seq)

  if (event.type === 'user/message') {
    // Synthetic user-role messages (injected context, skill text, cron notices)
    // share this event type; only a human-authored prompt belongs in a
    // transcript the operator is reading as a conversation.
    const source = asRecord(data['source'])
    if (source?.['kind'] !== 'user') return undefined
    const text = textOf(data['content'])
    return text === '' ? undefined : { kind: 'user', key, time: event.time, text }
  }

  if (event.type === 'assistant/message') {
    const message = asRecord(data['message'])
    const blocks = blocksOf(message?.['content'])
    const interrupted = data['interrupted'] === true
    if (blocks.length === 0 && !interrupted) return undefined
    const turn = number(data['turn'])
    const turnFacts = turn === undefined ? undefined : facts.get(turn)
    return {
      kind: 'assistant',
      key,
      time: event.time,
      blocks,
      interrupted,
      ...(turnFacts === undefined ? {} : { facts: turnFacts }),
      turn: turn ?? 0,
      tail: false,
    }
  }

  return undefined
}

/**
 * Read one assistant content array as ordered blocks.
 *
 * Order is the point: the model interleaves reasoning and prose, and collapsing
 * every reasoning block to the top would reorder what it actually wrote. Tool
 * calls are dropped here because the chat view renders them as their own rows.
 * @param content - the message's content array.
 * @returns the visible blocks, in authored order.
 */
function blocksOf(content: unknown): AssistantBlock[] {
  if (!Array.isArray(content)) return []
  const blocks: AssistantBlock[] = []
  for (const candidate of content) {
    const record = asRecord(candidate)
    if (record === undefined) continue
    const type = record['type']
    if (type === 'text') {
      const text = typeof record['text'] === 'string' ? record['text'].trim() : ''
      if (text !== '') blocks.push({ kind: 'text', text })
      continue
    }
    if (type === 'reasoning') {
      const text = typeof record['text'] === 'string' ? record['text'].trim() : ''
      if (text !== '') blocks.push({ kind: 'reasoning', text })
      continue
    }
    if (type === 'tool-call') continue
    if (type === 'image') {
      blocks.push({ kind: 'image', detail: imageDetail(record) })
      continue
    }
    blocks.push({ kind: 'unknown', payload: record })
  }
  return blocks
}

/** Describe an image block from the facts the mirror does carry. */
function imageDetail(record: Record<string, unknown>): string {
  const attachment = asRecord(record['attachment'])
  const mediaType = text(attachment?.['mediaType'])
  const bytes = number(attachment?.['bytes'])
  const parts = [mediaType]
  if (bytes !== undefined) parts.push(`${String(Math.round(bytes / 1024))} KB`)
  return parts.filter(part => part !== '').join(' · ')
}

/** Build the row for one `tool/call`. */
function toolCallRow(event: MirrorEvent, data: Record<string, unknown>): ToolRow {
  const raw = typeof data['arguments'] === 'string' ? data['arguments'] : ''
  return {
    kind: 'tool',
    key: String(event.seq),
    time: event.time,
    callId: typeof data['callId'] === 'string' ? data['callId'] : '',
    name: typeof data['name'] === 'string' ? data['name'] : '',
    summary: summarize(raw),
    description: descriptionOf(raw),
    errorSummary: '',
    errorCode: '',
    argumentsRaw: raw,
    argumentsText: formatArguments(raw),
    resultBlocks: [],
    resultText: '',
    meta: undefined,
    isError: false,
    pending: true,
  }
}

/** Build the row for a `tool/result` whose call is not in the window. */
function toolResultOnlyRow(
  event: MirrorEvent,
  callId: string,
  data: Record<string, unknown>,
): ToolRow {
  const resultText = resultTextOf(data)
  const isError = isErrorOf(data)
  return {
    kind: 'tool',
    key: String(event.seq),
    time: event.time,
    callId,
    name: '',
    summary: '',
    description: '',
    errorSummary: isError ? firstLineOfText(resultText) : '',
    errorCode: errorCodeOf(data),
    argumentsRaw: '',
    argumentsText: '',
    resultBlocks: resultBlocksOf(data),
    resultText,
    meta: data['meta'],
    isError,
    pending: false,
  }
}

/** Read the pairing id a `tool/result` carries on its message source. */
function callIdOf(data: Record<string, unknown>): string {
  const source = asRecord(asRecord(data['message'])?.['source'])
  return typeof source?.['callId'] === 'string' ? source['callId'] : ''
}

/** The result's content blocks, unwrapped from the `tool-result` envelope. */
function resultBlocksOf(data: Record<string, unknown>): readonly unknown[] {
  const message = asRecord(data['message'])
  const outer = Array.isArray(message?.['content']) ? message['content'] : []
  const first = asRecord(outer[0])
  return Array.isArray(first?.['content']) ? first['content'] : []
}

/** The structured failure code a result carries, when it carries one. */
function errorCodeOf(data: Record<string, unknown>): string {
  const error = asRecord(data['error'])
  return typeof error?.['code'] === 'string' ? error['code'] : ''
}

/** Join every visible text block of one tool result. */
function resultTextOf(data: Record<string, unknown>): string {
  const message = asRecord(data['message'])
  const blocks = Array.isArray(message?.['content']) ? message['content'] : []
  const parts: string[] = []
  for (const block of blocks) {
    const record = asRecord(block)
    if (record === undefined) continue
    const text = textOf(Array.isArray(record['content']) ? record['content'] : [record])
    if (text !== '') parts.push(text)
  }
  return truncate(parts.join('\n'), BODY_LIMIT)
}

/** Whether one tool result reports failure, in either of the two places it can. */
function isErrorOf(data: Record<string, unknown>): boolean {
  if (data['error'] !== undefined) return true
  const message = asRecord(data['message'])
  const blocks = Array.isArray(message?.['content']) ? message['content'] : []
  return blocks.some(block => asRecord(block)?.['isError'] === true)
}

/** One-line failure text out of an `LlmFailure`-shaped record. */
function failureText(value: unknown): string {
  const record = asRecord(value)
  return text(record?.['message'])
}

/**
 * The call's own one-line description.
 *
 * The shipped terminal row shows this instead of the command it runs, which is
 * the difference between a row that says what the call is for and one that
 * repeats a shell line.
 * @param raw - the call's raw arguments string.
 * @returns the description, or an empty string when the tool was given none.
 */
function descriptionOf(raw: string): string {
  if (raw === '') return ''
  const record = asRecord(parseJson(raw))
  const description = record?.['description']
  return typeof description === 'string' ? oneLine(description) : ''
}

/** The first non-empty line, which is what a failure summary shows. */
function firstLineOfText(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed !== '') return trimmed
  }
  return ''
}

/** One-line gist of a raw arguments string. */
function summarize(raw: string): string {
  if (raw === '') return ''
  const parsed = parseJson(raw)
  const record = asRecord(parsed)
  if (record !== undefined) {
    for (const key of SUMMARY_KEYS) {
      const value = record[key]
      if (typeof value === 'string' && value.trim() !== '') return truncate(oneLine(value), SUMMARY_LIMIT)
    }
    for (const value of Object.values(record)) {
      if (typeof value === 'string' && value.trim() !== '') return truncate(oneLine(value), SUMMARY_LIMIT)
    }
    return ''
  }
  return truncate(oneLine(raw), SUMMARY_LIMIT)
}

/** Pretty-print an arguments string, falling back to it verbatim when unparsable. */
function formatArguments(raw: string): string {
  if (raw === '') return ''
  const parsed = parseJson(raw)
  if (parsed === undefined) return truncate(raw, BODY_LIMIT)
  try {
    return truncate(JSON.stringify(parsed, null, 2), BODY_LIMIT)
  } catch {
    // A cycle cannot come out of JSON.parse, but a stringify failure must still
    // leave the operator with the bytes the model produced.
    return truncate(raw, BODY_LIMIT)
  }
}

/** Parse JSON, treating failure as "not an object". */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

/** Collapse every run of whitespace so one value fits on one row. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Join the visible text blocks of one content array. */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    const record = asRecord(block)
    if (record === undefined) continue
    if (record['type'] === 'text' && typeof record['text'] === 'string') parts.push(record['text'])
  }
  return parts.join('\n').trim()
}

/** One optional string. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** One optional number. */
function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Narrow one unknown value to a plain record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/** Bound one excerpt, marking that it was cut. */
function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}…`
}
