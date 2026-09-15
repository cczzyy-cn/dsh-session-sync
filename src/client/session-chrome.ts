/**
 * What the mirrored log says about a Session's runtime chrome, and the ledger
 * the trajectory tab renders.
 *
 * Both are read from the durable events the mirror already carries — the model
 * comes from `request/header`, the window from `request/context`, the occupancy
 * from the last `assistant/message` usage, the policy from the
 * `permission/preset` / `sandbox/mode` / `approval/policy` events the Session
 * logs at its head. Nothing here needs a projection or a new wire field, and
 * nothing here reads a live DSH object: every accessor takes `data` as unknown
 * and falls through to "unknown" rather than throwing.
 */
import type { MirrorEvent } from '../shared/protocol.ts'

/** The route the Session's last request went to. */
export interface SessionModel {
  provider: string
  model: string
  /** Reasoning effort, when the request header names one. */
  effort?: string
  maxTokens?: number
}

/** Context occupancy: what the provider reported against the route's window. */
export interface SessionContext {
  window: number
  used: number
  percent: number
}

/** Token totals summed over the Session's assistant messages. */
export interface SessionUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  reasoningTokens: number
}

/** Totals the composer's status row renders. */
export interface SessionStats {
  turns: number
  steps: number
  usage: SessionUsage
  /** Share of input tokens served from cache, when any input was reported. */
  cacheHitPercent?: number
  /** Summed wall time of the steps that produced an assistant message. */
  stepMs: number
  /** Output tokens per second over those steps. */
  outputPerSecond?: number
  firstTime?: number
  lastTime?: number
}

/** One subagent delegation seen in the log. */
export interface SeenSubagent {
  callId: string
  label: string
  time: number
  /** Whether a result for the call is in the mirrored window. */
  done: boolean
  isError: boolean
}

/** The policy events a Session writes at its head. */
export interface SessionPolicy {
  preset?: string
  sandbox?: string
  approval?: string
}

/** Everything the conversation header and composer status row render. */
export interface SessionChrome {
  model?: SessionModel
  context?: SessionContext
  policy: SessionPolicy
  stats: SessionStats
  subagents: SeenSubagent[]
  title?: string
  /** True while the log's last turn has no `turn/end`. */
  running: boolean
}

/** One ledger row of the trajectory tab. */
export type TrajectoryKind =
  | 'turn' | 'step' | 'user' | 'system' | 'assistant' | 'think'
  | 'tool' | 'policy' | 'title' | 'compaction' | 'context' | 'error' | 'other'

/** One row: a mirrored event, projected for the ledger. */
export interface TrajectoryCell {
  key: string
  kind: TrajectoryKind
  /** The kind tag's text, from the localizer. */
  label: string
  seq: number
  time: number
  turn?: number
  step?: number
  /** The content cell's text. */
  title: string
  /** Content renders in the code typeface (tool requests and payloads). */
  mono: boolean
  /** Tool request preview, when the row is a call. */
  request?: string
  /** Tool result preview, when the row is a call with a result. */
  result?: string
  isError: boolean
  durationMs?: number
  tokens?: number
  /** A turn's own rows; the ledger collapses them behind one summary row. */
  turnStart: boolean
  turnEnd: boolean
}

/** Longest content excerpt kept for one cell. */
const EXCERPT_LIMIT = 400

/** Longest subagent label kept. */
const LABEL_LIMIT = 60

/** Event types the ledger does not show: bookkeeping the reader never asked for. */
const HIDDEN_EVENTS = new Set([
  'session/end-seed',
  'agent/inbox/spliced',
  'session/title-llm-request',
])

/**
 * Read the Session's chrome from its mirrored log.
 * @param events - the mirrored events in log order.
 * @returns the chrome the console renders; every field is optional and absent
 *   when the log does not say.
 */
export function sessionChrome(events: readonly MirrorEvent[]): SessionChrome {
  let model: SessionModel | undefined
  let window: number | undefined
  let used: number | undefined
  const policy: SessionPolicy = {}
  const usage: SessionUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0 }
  let turns = 0
  let steps = 0
  let firstTime: number | undefined
  let lastTime: number | undefined
  let title: string | undefined
  let stepMs = 0
  let openTurn = false
  const subagents = new Map<string, SeenSubagent>()
  const stepStarts = new Map<string, number>()

  for (const event of events) {
    const data = asRecord(event.data)
    if (firstTime === undefined) firstTime = event.time
    lastTime = event.time

    if (event.type === 'request/header') {
      const config = asRecord(asRecord(data?.['header'])?.['config'])
      const provider = text(config?.['provider'])
      const name = text(config?.['model'])
      if (provider !== undefined && name !== undefined) {
        model = {
          provider,
          model: name,
          ...(text(config?.['reasoningEffort']) === undefined
            ? {}
            : { effort: text(config?.['reasoningEffort']) }),
          ...(number(config?.['maxTokens']) === undefined
            ? {}
            : { maxTokens: number(config?.['maxTokens']) }),
        }
      }
      continue
    }

    if (event.type === 'request/context') {
      const reported = number(data?.['contextWindow'])
      if (reported !== undefined && reported > 0) window = reported
      // The context event also names the route, which is the only model fact
      // available before the first request header lands.
      const provider = text(data?.['provider'])
      const name = text(data?.['model'])
      if (model === undefined && provider !== undefined && name !== undefined) {
        model = { provider, model: name }
      }
      continue
    }

    if (event.type === 'turn/start') {
      const turn = number(data?.['turn'])
      if (turn !== undefined) turns = Math.max(turns, turn)
      openTurn = true
      continue
    }
    if (event.type === 'turn/end') {
      openTurn = false
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
      // Occupancy follows the newest surface reading, the way the composer's
      // meter does: the last request's total is what fills the window.
      const total = number(reported?.['totalTokens'])
      const surface = total ?? ((number(reported?.['inputTokens']) ?? 0) + (number(reported?.['outputTokens']) ?? 0))
      if (surface > 0) used = surface
      continue
    }

    if (event.type === 'permission/preset') {
      policy.preset = text(data?.['preset']) ?? policy.preset
      continue
    }
    if (event.type === 'sandbox/mode') {
      policy.sandbox = text(data?.['mode']) ?? policy.sandbox
      continue
    }
    if (event.type === 'approval/policy') {
      policy.approval = text(data?.['policy']) ?? policy.approval
      continue
    }

    if (event.type === 'session/title') {
      title = text(data?.['title']) ?? title
      continue
    }

    if (event.type === 'tool/call') {
      const callId = text(data?.['callId'])
      const name = text(data?.['name'])
      if (callId === undefined || name === undefined) continue
      if (name !== 'subagent' && name !== 'subagent_fork') continue
      subagents.set(callId, {
        callId,
        label: delegationLabel(data?.['arguments']) ?? name,
        time: event.time,
        done: false,
        isError: false,
      })
      continue
    }
    if (event.type === 'tool/result') {
      const callId = text(asRecord(asRecord(data?.['message'])?.['source'])?.['callId'])
      const seen = callId === undefined ? undefined : subagents.get(callId)
      if (seen === undefined) continue
      seen.done = true
      seen.isError = data?.['error'] !== undefined
    }
  }

  const inputTotal = usage.inputTokens + usage.cacheReadTokens
  const context: SessionContext | undefined = window === undefined || used === undefined
    ? undefined
    : { window, used, percent: Math.min(100, Math.round((used / window) * 100)) }
  const outputPerSecond = stepMs > 0 && usage.outputTokens > 0
    ? Math.round(usage.outputTokens / (stepMs / 1000))
    : undefined

  return {
    ...(model === undefined ? {} : { model }),
    ...(context === undefined ? {} : { context }),
    policy,
    stats: {
      turns,
      steps,
      usage,
      ...(inputTotal > 0 ? { cacheHitPercent: Math.round((usage.cacheReadTokens / inputTotal) * 1000) / 10 } : {}),
      stepMs,
      ...(outputPerSecond === undefined ? {} : { outputPerSecond }),
      ...(firstTime === undefined ? {} : { firstTime }),
      ...(lastTime === undefined ? {} : { lastTime }),
    },
    subagents: [...subagents.values()],
    ...(title === undefined ? {} : { title }),
    running: openTurn,
  }
}

/**
 * Project the mirrored log onto the trajectory ledger's rows.
 *
 * One row per event, except that a tool result joins its call's row — the same
 * pairing the transcript uses, because the ledger's content column draws the
 * request and its result side by side.
 * @param events - the mirrored events in log order.
 * @param label - kind-tag text lookup, so the copy stays in the dictionaries.
 * @returns the rows to render, oldest first.
 */
export function trajectoryCells(
  events: readonly MirrorEvent[],
  label: (kind: TrajectoryKind) => string,
): TrajectoryCell[] {
  const cells: TrajectoryCell[] = []
  const calls = new Map<string, TrajectoryCell>()
  let openTurn: { turn: number; last: TrajectoryCell } | undefined
  // Rows inherit the turn and step they happen inside: only a handful of event
  // types carry those fields, and the ledger groups every row by them.
  let currentTurn: number | undefined
  let currentStep: number | undefined

  for (const event of events) {
    if (HIDDEN_EVENTS.has(event.type)) continue
    const data = asRecord(event.data)
    if (data === undefined) continue
    const key = String(event.seq)
    if (event.type === 'turn/start') {
      currentTurn = number(data['turn']) ?? currentTurn
      currentStep = undefined
    } else if (event.type === 'step/start') {
      currentStep = number(data['step']) ?? currentStep
    }
    const turn = number(data['turn']) ?? currentTurn
    const step = number(data['step']) ?? currentStep

    if (event.type === 'turn/start') {
      const cell = base(key, 'turn', label, event, { turn, step, mono: false })
      cell.title = turn === undefined ? '' : `#${String(turn)}`
      cell.turnStart = true
      cells.push(cell)
      openTurn = turn === undefined ? undefined : { turn, last: cell }
      continue
    }
    if (event.type === 'turn/end') {
      const reason = text(asRecord(data['reason'])?.['kind'])
      const cell = base(key, 'turn', label, event, { turn, step, mono: false })
      cell.title = reason ?? ''
      cell.turnEnd = true
      cells.push(cell)
      openTurn = undefined
      continue
    }

    if (event.type === 'tool/call') {
      const callId = text(data['callId']) ?? ''
      const name = text(data['name']) ?? 'tool'
      const raw = text(data['arguments']) ?? ''
      const cell = base(key, 'tool', label, event, { turn, step, mono: true })
      cell.title = name
      cell.request = summarizeArguments(raw)
      cell.isError = false
      cells.push(cell)
      if (callId !== '') calls.set(callId, cell)
      continue
    }
    if (event.type === 'tool/result') {
      const callId = text(asRecord(asRecord(data['message'])?.['source'])?.['callId']) ?? ''
      const cell = calls.get(callId)
      if (cell !== undefined) {
        cell.result = resultExcerpt(data)
        cell.isError = data['error'] !== undefined || resultIsError(data)
        cell.durationMs = Math.max(0, event.time - cell.time)
        continue
      }
      const orphan = base(key, 'tool', label, event, { turn, step, mono: true })
      orphan.title = ''
      orphan.result = resultExcerpt(data)
      orphan.isError = data['error'] !== undefined || resultIsError(data)
      cells.push(orphan)
      continue
    }

    const assistant = event.type === 'assistant/message'
    const kind = kindOf(event.type, data)
    const message = asRecord(data['message'])
    const textBody = textOf(message?.['content'] ?? data['content'])
    const cell = base(key, kind, label, event, { turn, step, mono: false })
    cell.title = excerpt(textBody)
    if (assistant) {
      const reported = asRecord(data['usage'])
      const output = number(reported?.['outputTokens'])
      if (output !== undefined && output > 0) cell.tokens = output
      const reasoning = reasoningOf(message?.['content'])
      if (cell.title === '' && reasoning !== '') {
        cell.title = excerpt(reasoning)
        cell.kind = 'think'
        cell.label = label('think')
      }
    }
    if (kind === 'step') cell.title = stepText(data)
    if (kind === 'policy') cell.title = excerpt(policyText(event.type, data))
    if (kind === 'title' && event.type === 'session/title') cell.title = excerpt(text(data['title']) ?? '')
    if (kind === 'context') {
      cell.title = event.type === 'request/header'
        ? excerpt(requestHeaderText(data))
        : excerpt(contextText(data))
    }
    if (kind === 'other') cell.title = event.type
    cells.push(cell)
    if (openTurn !== undefined) openTurn.last = cell
  }

  return cells
}

/**
 * Which ledger kind one event type reads as.
 *
 * A type this projection does not know is `other` rather than dropped: the
 * ledger exists to show what happened, and silently hiding an event a newer
 * origin logged would be the one failure a reader cannot detect.
 */
function kindOf(type: string, data: Record<string, unknown>): TrajectoryKind {
  switch (type) {
    case 'turn/start':
    case 'turn/end':
      return 'turn'
    case 'step/start':
    case 'step/end':
      return 'step'
    case 'assistant/message':
      return 'assistant'
    case 'user/message':
      return asRecord(data['source'])?.['kind'] === 'user' ? 'user' : 'system'
    case 'system/message':
      return 'system'
    case 'request/header':
    case 'request/context':
      return 'context'
    case 'session/title':
      return 'title'
    case 'permission/preset':
    case 'sandbox/mode':
    case 'approval/policy':
      return 'policy'
    default:
      if (type.startsWith('compaction/')) return 'compaction'
      if (type.includes('error')) return 'error'
      return 'other'
  }
}

/** Build one cell with the fields every row shares. */
function base(
  key: string,
  kind: TrajectoryKind,
  label: (kind: TrajectoryKind) => string,
  event: MirrorEvent,
  extra: { turn?: number; step?: number; mono: boolean },
): TrajectoryCell {
  return {
    key,
    kind,
    label: label(kind),
    seq: event.seq,
    time: event.time,
    ...(extra.turn === undefined ? {} : { turn: extra.turn }),
    ...(extra.step === undefined ? {} : { step: extra.step }),
    title: '',
    mono: extra.mono,
    isError: false,
    turnStart: false,
    turnEnd: false,
  }
}

/** The request header's route and tool count, as one line. */
function requestHeaderText(data: Record<string, unknown>): string {
  const header = asRecord(data['header'])
  const config = asRecord(header?.['config'])
  const tools = Array.isArray(header?.['tools']) ? header['tools'].length : undefined
  const parts: string[] = []
  const provider = text(config?.['provider'])
  const model = text(config?.['model'])
  if (provider !== undefined && model !== undefined) parts.push(`${provider}/${model}`)
  const effort = text(config?.['reasoningEffort'])
  if (effort !== undefined) parts.push(effort)
  if (tools !== undefined) parts.push(`${String(tools)} tools`)
  return parts.join(' · ')
}

/** One step boundary's turn/step pair. */
function stepText(data: Record<string, unknown>): string {
  const turn = number(data['turn'])
  const step = number(data['step'])
  if (turn === undefined || step === undefined) return ''
  return `#${String(turn)}/${String(step)}`
}

/** The route a request context was assembled for, with its window. */
function contextText(data: Record<string, unknown>): string {
  const provider = text(data['provider'])
  const model = text(data['model'])
  const window = number(data['contextWindow'])
  const parts: string[] = []
  if (provider !== undefined && model !== undefined) parts.push(`${provider}/${model}`)
  if (window !== undefined) parts.push(`${String(Math.round(window / 1000))}k window`)
  return parts.join(' · ')
}

/** One policy event as a readable line. */
function policyText(type: string, data: Record<string, unknown>): string {
  const value = text(data['preset']) ?? text(data['mode']) ?? text(data['policy']) ?? ''
  return value === '' ? '' : `${type.split('/')[0] ?? ''}: ${value}`
}

/** One-line gist of a tool call's raw arguments. */
function summarizeArguments(raw: string): string {
  if (raw === '') return ''
  try {
    const parsed: unknown = JSON.parse(raw)
    const record = asRecord(parsed)
    if (record !== undefined) {
      const preferred = ['command', 'cmd', 'file_path', 'path', 'pattern', 'query', 'description', 'prompt', 'url', 'text']
      for (const key of preferred) {
        const value = record[key]
        if (typeof value === 'string' && value.trim() !== '') return excerpt(oneLine(value), 160)
      }
      const first = Object.values(record).find(value => typeof value === 'string' && value.trim() !== '')
      if (typeof first === 'string') return excerpt(oneLine(first), 160)
      return excerpt(oneLine(raw), 160)
    }
  } catch {
    // Fall through: unparsable arguments are still worth showing verbatim.
  }
  return excerpt(oneLine(raw), 160)
}

/** The label a subagent delegation carries in its arguments. */
function delegationLabel(raw: unknown): string | undefined {
  const args = typeof raw === 'string' ? raw : ''
  if (args === '') return undefined
  try {
    const record = asRecord(JSON.parse(args) as unknown)
    const description = record === undefined ? undefined : text(record['description'])
    if (description !== undefined) return excerpt(oneLine(description), LABEL_LIMIT)
    const prompt = record === undefined ? undefined : text(record['prompt'])
    if (prompt !== undefined) return excerpt(oneLine(prompt), LABEL_LIMIT)
  } catch {
    return undefined
  }
  return undefined
}

/** Every visible result block's text, bounded. */
function resultExcerpt(data: Record<string, unknown>): string {
  const message = asRecord(data['message'])
  const blocks = Array.isArray(message?.['content']) ? message['content'] : []
  const parts: string[] = []
  for (const block of blocks) {
    const record = asRecord(block)
    if (record === undefined) continue
    const inner = Array.isArray(record['content']) ? record['content'] : [record]
    const text = textOf(inner)
    if (text !== '') parts.push(text)
  }
  return excerpt(parts.join('\n'))
}

/** Whether a tool result reports failure on any block. */
function resultIsError(data: Record<string, unknown>): boolean {
  const message = asRecord(data['message'])
  const blocks = Array.isArray(message?.['content']) ? message['content'] : []
  return blocks.some(block => asRecord(block)?.['isError'] === true)
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

/** One non-empty string, or undefined. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** One finite number, or undefined. */
function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Collapse every run of whitespace so one value fits on one line. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Bound one excerpt, marking that it was cut. */
function excerpt(value: string, limit: number = EXCERPT_LIMIT): string {
  const collapsed = value.trim()
  if (collapsed.length <= limit) return collapsed
  return `${collapsed.slice(0, limit)}…`
}
