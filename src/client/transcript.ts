/**
 * Turn one mirrored Session log into rows a human can read.
 *
 * The mirror carries the origin's events verbatim, which is deliberate: the
 * server never has to agree with the origin about what an event means, so a
 * newer DSH on the other side cannot break this side. The cost is that reading
 * them happens here, and every accessor below therefore treats `data` as
 * unknown and falls through to "nothing to show" instead of throwing.
 */
import type { MirrorEvent } from '../shared/protocol.ts'

/** One renderable transcript row. */
export type TranscriptRow =
  | { kind: 'user'; key: string; time: number; text: string }
  | { kind: 'assistant'; key: string; time: number; text: string; reasoning: string }
  | { kind: 'tool'; key: string; time: number; name: string; detail: string }
  | { kind: 'toolResult'; key: string; time: number; text: string; isError: boolean }

/** Longest tool-result excerpt rendered inline. */
const TOOL_EXCERPT_LIMIT = 600

/**
 * Project a mirrored log onto readable rows, dropping bookkeeping events.
 * @param events - the mirrored events in log order.
 * @returns the rows to render, oldest first.
 */
export function toRows(events: readonly MirrorEvent[]): TranscriptRow[] {
  const rows: TranscriptRow[] = []
  for (const event of events) {
    const row = toRow(event)
    if (row !== undefined) rows.push(row)
  }
  return rows
}

/** Project one event, or undefined when it is not conversation. */
function toRow(event: MirrorEvent): TranscriptRow | undefined {
  const key = String(event.seq)
  const data = asRecord(event.data)
  if (data === undefined) return undefined

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
    const text = textOf(message?.['content'])
    const reasoning = reasoningOf(message?.['content'])
    if (text === '' && reasoning === '') return undefined
    return { kind: 'assistant', key, time: event.time, text, reasoning }
  }

  if (event.type === 'tool/call') {
    const name = typeof data['name'] === 'string' ? data['name'] : 'tool'
    const raw = typeof data['arguments'] === 'string' ? data['arguments'] : ''
    return { kind: 'tool', key, time: event.time, name, detail: truncate(raw, TOOL_EXCERPT_LIMIT) }
  }

  if (event.type === 'tool/result') {
    const message = asRecord(data['message'])
    const blocks = Array.isArray(message?.['content']) ? message['content'] : []
    const first = blocks.length > 0 ? asRecord(blocks[0]) : undefined
    const text = truncate(textOf(first?.['content']), TOOL_EXCERPT_LIMIT)
    return {
      kind: 'toolResult',
      key,
      time: event.time,
      text,
      isError: first?.['isError'] === true || data['error'] !== undefined,
    }
  }

  return undefined
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

/** Join the reasoning blocks of one content array. */
function reasoningOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    const record = asRecord(block)
    if (record === undefined) continue
    if (record['type'] === 'reasoning' && typeof record['text'] === 'string') parts.push(record['text'])
  }
  return parts.join('\n').trim()
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
