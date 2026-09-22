/**
 * The shipped tool cards, derived here because the console cannot call them.
 *
 * `ui-tool` builds a card per tool family out of the raw call arguments, the
 * result's content blocks, and the result's persisted `meta`, then renders it
 * with a `ui-primitives` block (`TerminalBlock`, `ReadBlock`, `DiffBlock`,
 * `SearchBlock`, `WebBlock`). A plugin cannot import another plugin's
 * components, so this reproduces the derivations — validation, fallbacks, and
 * the card priority — and lets the panel render the same primitives.
 *
 * Two inputs the shipped models take are absent on purpose: the Session's `cwd`
 * and the Host account `home` only shorten a displayed path, and both default to
 * a no-op exactly as they do upstream when the caller has neither.
 */
import type { SessionSyncKey, SessionSyncTranslate } from './locales.ts'
import type { ToolRow } from './transcript.ts'

/** The card caps the shipped chat rows use (half the primitives' own defaults). */
export const CHAT_READ_MAX_LINES = 8
export const CHAT_DIFF_MAX_LINES = 8
export const CHAT_SEARCH_MAX_LINES = 8

/** The variant a wire tool name renders as — `classifyTool`. */
export type ToolVariant = 'bash' | 'read' | 'search' | 'write' | 'edit' | 'code' | 'others'

/** One tool row, reduced to what its chassis renders. */
export interface ToolRowModel {
  variant: ToolVariant
  titleKey: SessionSyncKey
  summary: string
  /** Present only for the file-oriented variants, and never a URL. */
  filePath?: string
  /** The raw arguments, or null when the call carried none. */
  bodyRaw: string | null
  /** The flattened result text, or null when a card owns the body instead. */
  output: string | null
  errorSummary: string | null
  state: 'running' | 'ok' | 'error' | 'stopped'
}

/** Variant titles, plus the wire names the shipped client titles individually. */
const VARIANT_TITLE_KEYS: Record<ToolVariant, SessionSyncKey> = {
  search: 'toolLabelSearch',
  read: 'toolLabelRead',
  bash: 'toolTitleBash',
  write: 'toolTitleWrite',
  edit: 'toolLabelEdit',
  code: 'toolLabelCode',
  others: 'toolLabelGeneric',
}

const TOOL_TITLE_KEYS: Record<string, SessionSyncKey> = {
  pwsh: 'toolTitlePwsh',
  bash: 'toolTitleBash',
  write: 'toolTitleWrite',
  grep: 'toolTitleGrep',
  glob: 'toolTitleGlob',
  web_search: 'toolTitleWebSearch',
  web_fetch: 'toolTitleWebFetch',
  read_image: 'toolTitleReadImage',
}

/** `deriveSummary`'s key priority per variant. */
const SUMMARY_KEYS: Record<ToolVariant, readonly string[]> = {
  bash: ['description', 'command'],
  read: ['path', 'file_path', 'url'],
  search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  code: ['description'],
  others: [],
}

/** Variants whose path argument is worth opening, and the keys it can hide in. */
const FILE_PATH_VARIANTS: readonly ToolVariant[] = ['read', 'write', 'edit']
const FILE_PATH_KEYS: readonly string[] = ['path', 'file_path']

/** Classify one wire tool name — `TOOL_VARIANTS`. */
export function classifyTool(name: string): ToolVariant {
  const wire = name.trim().toLowerCase()
  if (wire === 'bash' || wire === 'pwsh') return 'bash'
  if (wire === 'read' || wire === 'read_image' || wire === 'web_fetch'
    || wire === 'cordis_package_inspect' || wire === 'cordis_runtime_inspect') return 'read'
  if (wire === 'web_search' || wire === 'grep' || wire === 'glob') return 'search'
  if (wire === 'write') return 'write'
  if (wire === 'edit') return 'edit'
  if (wire === 'run_code') return 'code'
  return 'others'
}

/**
 * Reduce one mirrored tool row to the shipped row model.
 * @param row - the projected tool row.
 * @param cwd - the Session workspace, when the mirror knows it.
 * @param home - the Host account home, when the mirror knows it.
 * @returns the variant, title key, summary, state, and body inputs.
 */
export function toolRowModel(row: ToolRow, cwd?: string, home?: string): ToolRowModel {
  const variant = classifyTool(row.name)
  const argsRaw = row.argumentsRaw
  const state: ToolRowModel['state'] = row.pending
    ? 'running'
    : row.errorCode === 'interrupted' ? 'stopped' : row.isError ? 'error' : 'ok'
  const titleKey = TOOL_TITLE_KEYS[row.name.trim().toLowerCase()] ?? VARIANT_TITLE_KEYS[variant]
  const base = argsRaw === ''
    ? row.callId
    : abbreviateHomePath(relativizeToCwd(deriveSummary(variant, argsRaw), cwd), home)
  const wireNamed = variant === 'others' && row.name !== ''
  const summary = wireNamed ? `${row.name} · ${base}` : base
  const filePath = FILE_PATH_VARIANTS.includes(variant)
    ? pickString(parseArgs(argsRaw), FILE_PATH_KEYS)
    : undefined
  const output = row.pending ? null : (resultText(row) || null)
  return {
    variant,
    titleKey,
    summary,
    ...(filePath === undefined ? {} : { filePath }),
    bodyRaw: argsRaw === '' ? null : argsRaw,
    output,
    errorSummary: state === 'error' && output !== null ? firstLine(output) : null,
    state,
  }
}

/** One-line gist for a row that has no card — `deriveSummary`. */
function deriveSummary(variant: ToolVariant, argsRaw: string): string {
  const args = parseArgs(argsRaw)
  if (args === undefined) return firstLine(argsRaw)
  if (variant === 'search' && Array.isArray(args['queries'])) {
    const queries = args['queries']
      .filter((entry): entry is string => typeof entry === 'string' && entry !== '')
      .map(firstLine)
    if (queries.length > 0) return queries.join(', ')
  }
  const named = pickString(args, SUMMARY_KEYS[variant])
  if (named !== undefined) return firstLine(named)
  for (const value of Object.values(args)) {
    if (typeof value === 'string' && value !== '') return firstLine(value)
  }
  return firstLine(argsRaw)
}

/* ------------------------------------------------------------------ *
 * Terminal card
 * ------------------------------------------------------------------ */

/** What one shell or terminal-send call is, once validated. */
type TerminalCall =
  | { kind: 'shell'; command: string; description: string | undefined; workdir: string | undefined; background: boolean; persistent: boolean }
  | { kind: 'terminal-send'; text: string; sessionId: string }

/** Props for {@link TerminalCard}. */
export interface TerminalCard {
  command: string
  cwd?: string
  output?: string
  exitCode?: number
  signal?: string
  running: boolean
  /** The call's own description, which the collapsed row shows instead. */
  description?: string
}

/**
 * Derive the terminal card — `terminalCardModel`.
 * @param row - the projected tool row.
 * @param sessionCwd - the Session workspace, used when the call names no workdir.
 * @returns the card, or null when the shipped card declines this call.
 */
export function terminalCard(row: ToolRow, sessionCwd?: string): TerminalCard | null {
  const parsed = parseCall(row)
  if (parsed === undefined) return null
  const call = shellCall(parsed.name, parsed.args) ?? terminalSendCall(parsed.name, parsed.args)
  if (call === null || (call.kind === 'shell' && call.background)) return null
  const cwd = resolveTerminalCwd(call.kind === 'shell' ? call.workdir : undefined, sessionCwd)
  if (row.pending) {
    return {
      command: call.kind === 'shell' ? call.command : call.text,
      ...(cwd === undefined ? {} : { cwd }),
      running: true,
    }
  }
  // A persistent shell settles without a result envelope, and spilled output
  // hides the exit marker: both fall back to the generic row upstream.
  if (row.isError || (call.kind === 'shell' && call.persistent) || isSpilledShell(row, call)) return null
  const text = singleResultText(row)
  if (text === undefined) return null
  const status = call.kind === 'terminal-send' ? { output: text } : parseExitStatus(text)
  return {
    command: call.kind === 'shell' ? call.command : call.text,
    ...(cwd === undefined ? {} : { cwd }),
    output: status.output,
    ...(status.exitCode === undefined ? {} : { exitCode: status.exitCode }),
    ...(status.signal === undefined ? {} : { signal: status.signal }),
    ...(call.kind === 'shell' && call.description !== undefined ? { description: call.description } : {}),
    running: false,
  }
}

/** Whether a settled terminal card reports failure — `terminalFailed`. */
export function terminalFailed(card: TerminalCard): boolean {
  return card.running !== true
    && ((card.exitCode !== undefined && card.exitCode !== 0) || card.signal !== undefined)
}

/** Validate one `bash`/`pwsh` call — `shellCall`. */
function shellCall(name: string, args: Record<string, unknown>): TerminalCall | null {
  if (name !== 'bash' && name !== 'pwsh') return null
  const command = args['command']
  if (typeof command !== 'string' || command.trim() === '') return null
  const timeoutMs = args['timeoutMs']
  if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0)) return null
  const workdir = args['workdir']
  if (workdir !== undefined && typeof workdir !== 'string') return null
  const background = args['run_in_background']
  if (background !== undefined && typeof background !== 'boolean') return null
  if (!validEscalationFields(args)) return null
  const description = args['description']
  if (description === undefined) {
    // A persistent-shell provider omits the description; its workdir is dropped
    // upstream, and the running prompt then shows the Session workspace.
    return { kind: 'shell', command, description: undefined, workdir: undefined, background: false, persistent: true }
  }
  if (typeof description !== 'string' || description.trim() === '') return null
  return {
    kind: 'shell',
    command,
    description,
    workdir: typeof workdir === 'string' ? workdir : undefined,
    background: background === true,
    persistent: false,
  }
}

/** Validate one `terminal_send` call. */
function terminalSendCall(name: string, args: Record<string, unknown>): TerminalCall | null {
  if (name !== 'terminal_send') return null
  const sessionId = args['sessionId']
  const text = args['text']
  if (typeof sessionId !== 'string' || sessionId === '' || typeof text !== 'string') return null
  return { kind: 'terminal-send', text, sessionId }
}

/** Split a settled shell's trailing status marker off its output. */
function parseExitStatus(text: string): { output: string; exitCode?: number; signal?: string } {
  const killed = /\n\[killed by signal: ([^\]\n]+)\]$/.exec(text)
  if (killed !== null) return { output: text.slice(0, killed.index), signal: killed[1] }
  const exit = /\n\[exit code: (\d+)\]$/.exec(text)
  if (exit !== null) return { output: text.slice(0, exit.index), exitCode: Number(exit[1]) }
  return { output: text, exitCode: 0 }
}

/** Whether a settled shell's output was spilled to a file — `isSpilledShellCall`. */
function isSpilledShell(row: ToolRow, call: TerminalCall): boolean {
  if (call.kind !== 'shell' || call.background) return false
  const text = singleResultText(row)
  return text !== undefined && hasSpillNotice(text)
}

/**
 * Whether text ends with the spill notice that hides a result behind a file.
 * @param text - the result text.
 * @returns true when the last segment is that notice.
 */
function hasSpillNotice(text: string): boolean {
  const segment = text.split('\n\n').at(-1) ?? ''
  if (!segment.startsWith('(')) return false
  const locator = ' Full formatted result stored at: '
  const at = segment.indexOf(locator)
  if (at < 0) return false
  const omitted = segment.slice(1, at)
  const valid = omitted === '' || omitted === 'More bytes were omitted.' || /^Omitted \d+ bytes\.$/.test(omitted)
  return valid && segment.slice(at + locator.length).includes('. ')
}

/* ------------------------------------------------------------------ *
 * Read card
 * ------------------------------------------------------------------ */

/** One numbered line of a read result — `ReadBlockLine`. */
export interface ReadLine {
  number: number
  text: string
}

/** Props for {@link ReadCard}. */
export interface ReadCard {
  label?: string
  lines: readonly ReadLine[]
  totalLines: number
  lang?: string
}

/**
 * Derive the read card — `readCardModel`.
 * @param row - the projected tool row.
 * @param cwd - the Session workspace, when known.
 * @param home - the Host account home, when known.
 * @returns the card, or null when the shipped card declines this read.
 */
export function readCard(row: ToolRow, cwd?: string, home?: string): ReadCard | null {
  if (!row.pending && row.isError) return null
  if (row.pending) return null
  const parsed = parseCall(row)
  if (parsed === undefined || parsed.name !== 'read') return null
  const filePath = parsed.args['file_path']
  if (typeof filePath !== 'string' || filePath.trim() === '') return null
  if (!validPositiveInteger(parsed.args['offset']) && parsed.args['offset'] !== undefined) return null
  if (!validPositiveInteger(parsed.args['limit']) && parsed.args['limit'] !== undefined) return null
  const meta = readMeta(row)
  if (meta === undefined) return null
  const text = singleResultText(row)
  if (text === undefined) return null
  // The envelope proves the result is a read; the lines themselves come from
  // `meta`, which is what the shipped card renders.
  if (!/^<path>[^\n]*<\/path>\n<type>file<\/type>\n<content>\n([\s\S]*)\n<\/content>$/u.test(text)) return null
  const label = abbreviateHomePath(relativizeToCwd(meta.path, cwd), home)
  return {
    label,
    lines: meta.lines,
    totalLines: meta.totalLines,
    ...(meta.lang === undefined ? {} : { lang: meta.lang }),
  }
}

/** The read `meta` shape, validated line by line. */
function readMeta(row: ToolRow): { path: string; offset: number; lines: ReadLine[]; totalLines: number; lang?: string } | undefined {
  const meta = asRecord(row.meta)
  if (meta === undefined) return undefined
  const path = meta['path']
  if (typeof path !== 'string') return undefined
  const offset = meta['offset']
  if (!validPositiveInteger(offset)) return undefined
  const totalLines = meta['totalLines']
  if (typeof totalLines !== 'number' || !Number.isInteger(totalLines) || totalLines < 0) return undefined
  const raw = meta['lines']
  if (!Array.isArray(raw)) return undefined
  const lang = meta['lang']
  if (lang !== undefined && typeof lang !== 'string') return undefined
  const lines: ReadLine[] = []
  let previous = offset - 1
  for (const candidate of raw) {
    const line = asRecord(candidate)
    if (line === undefined) return undefined
    const number = line['number']
    if (typeof number !== 'number' || !Number.isInteger(number) || number <= previous) return undefined
    if (number > totalLines) return undefined
    if (typeof line['text'] !== 'string') return undefined
    previous = number
    lines.push({ number, text: line['text'] })
  }
  return { path, offset, lines, totalLines, ...(lang === undefined ? {} : { lang }) }
}

/* ------------------------------------------------------------------ *
 * Diff card
 * ------------------------------------------------------------------ */

/** One file's change — `DiffHunk`. */
export interface DiffHunk {
  path: string
  oldText: string | null
  newText: string
}

/** Props for {@link DiffCard}. */
export interface DiffCard {
  diffs: readonly DiffHunk[]
}

/**
 * Derive the file-mutation card — `diffCardModel`.
 * @param row - the projected tool row.
 * @returns the card, or null when the shipped card declines this call.
 */
export function diffCard(row: ToolRow): DiffCard | null {
  const intended = intendedDiff(row)
  if (intended === null) return null
  if (row.pending) return { diffs: [intended.diff] }
  if (intended.tool === 'str_replace_editor' || row.isError) return null
  const applied = appliedDiffs(row.meta)
  if (applied === null || applied === 'empty') {
    // A successful write may carry no diff payload; its own arguments are then
    // the whole-file change. An edit has no such fallback.
    return intended.tool === 'write' ? { diffs: [intended.diff] } : null
  }
  return { diffs: applied }
}

/** The change a call intends, before any result is read. */
function intendedDiff(row: ToolRow): { tool: string; diff: DiffHunk } | null {
  const parsed = parseCall(row)
  if (parsed === undefined) return null
  const args = parsed.args
  if (parsed.name === 'str_replace_editor') {
    const path = args['path']
    if (typeof path !== 'string' || path.trim() === '') return null
    const command = args['command']
    if (command === 'create') {
      const fileText = args['file_text']
      if (fileText !== undefined && typeof fileText !== 'string') return null
      return { tool: parsed.name, diff: { path, oldText: null, newText: typeof fileText === 'string' ? fileText : '' } }
    }
    if (command === 'str_replace') {
      const oldStr = args['old_str']
      const newStr = args['new_str']
      if (oldStr !== undefined && typeof oldStr !== 'string') return null
      if (newStr !== undefined && typeof newStr !== 'string') return null
      return {
        tool: parsed.name,
        diff: {
          path,
          oldText: typeof oldStr === 'string' ? oldStr : null,
          newText: typeof newStr === 'string' ? newStr : '',
        },
      }
    }
    return null
  }
  const filePath = args['file_path']
  if (typeof filePath !== 'string' || filePath.trim() === '') return null
  if (!validEscalationFields(args)) return null
  if (parsed.name === 'write') {
    const content = args['content']
    if (typeof content !== 'string') return null
    return { tool: 'write', diff: { path: filePath, oldText: null, newText: content } }
  }
  if (parsed.name === 'edit') {
    const oldString = args['old_string']
    const newString = args['new_string']
    if (typeof oldString !== 'string' || typeof newString !== 'string') return null
    const replaceAll = args['replace_all']
    if (replaceAll !== undefined && typeof replaceAll !== 'boolean') return null
    return { tool: 'edit', diff: { path: filePath, oldText: oldString || null, newText: newString } }
  }
  return null
}

/** The applied hunks a result carries, all-or-nothing. */
function appliedDiffs(meta: unknown): DiffHunk[] | 'empty' | null {
  const record = asRecord(meta)
  if (record === undefined) return null
  const diffs = record['diffs']
  if (!Array.isArray(diffs)) return null
  if (diffs.length === 0) return 'empty'
  const hunks: DiffHunk[] = []
  for (const candidate of diffs) {
    const hunk = asRecord(candidate)
    if (hunk === undefined) return null
    const path = hunk['path']
    const oldText = hunk['oldText']
    const newText = hunk['newText']
    if (typeof path !== 'string') return null
    if (oldText !== null && typeof oldText !== 'string') return null
    if (typeof newText !== 'string') return null
    hunks.push({ path, oldText, newText })
  }
  return hunks
}

/** `+added -removed` over every hunk, as the shipped footer counts them. */
export function diffStat(diffs: readonly DiffHunk[]): string {
  let added = 0
  let removed = 0
  for (const hunk of diffs) {
    if (hunk.oldText !== null) removed += contentLines(hunk.oldText).length
    added += contentLines(hunk.newText).length
  }
  return `+${String(added)} -${String(removed)}`
}

/** A diff side's content lines: a single trailing newline is a terminator. */
function contentLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines.length > 1 && lines.at(-1) === '') lines.pop()
  return lines
}

/* ------------------------------------------------------------------ *
 * Search card
 * ------------------------------------------------------------------ */

/** One matched line — `SearchBlockLineMatch`. */
export interface SearchMatch {
  lineNumber: number
  line: string
}

/** One file's matches — `SearchFileGroup`. */
export interface SearchFile {
  path: string
  matches: SearchMatch[]
}

/** Props for {@link SearchCard}, plus the capped result's recovery text. */
export type SearchCard =
  | { card: { kind: 'matches'; files: SearchFile[]; truncated: boolean; total: number }; recovery?: string }
  | { card: { kind: 'paths'; paths: string[]; truncated: boolean; total: number }; recovery?: string }

/**
 * Derive the search card — `searchCardModel`.
 * @param row - the projected tool row.
 * @returns the card and the recovery text, or null when the card declines.
 */
export function searchCard(row: ToolRow): SearchCard | null {
  if (row.pending || row.isError) return null
  const parsed = parseCall(row)
  if (parsed === undefined) return null
  const name = parsed.name
  if (name !== 'grep' && name !== 'glob') return null
  const pattern = parsed.args['pattern']
  if (typeof pattern !== 'string') return null
  if (name === 'grep' && pattern === '') return null
  if (name === 'glob' && pattern.trim() === '') return null
  const path = parsed.args['path']
  if (path !== undefined && (typeof path !== 'string' || path.trim() === '')) return null
  const include = parsed.args['include']
  if (include !== undefined && (typeof include !== 'string' || !validInclude(include))) return null
  const meta = asRecord(row.meta)
  if (meta === undefined) return null
  const truncated = meta['truncated']
  const total = meta['total']
  if (typeof truncated !== 'boolean') return null
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) return null
  const recovery = truncated ? (flattenContent(row) || undefined) : undefined
  if (name === 'grep') {
    if (meta['shape'] !== 'matches') return null
    const files = searchFiles(meta['files'])
    if (files === null) return null
    return { card: { kind: 'matches', files, truncated, total }, ...(recovery === undefined ? {} : { recovery }) }
  }
  if (meta['shape'] !== 'paths' || !Array.isArray(meta['paths'])) return null
  if (!meta['paths'].every(entry => typeof entry === 'string')) return null
  return { card: { kind: 'paths', paths: [...meta['paths']] as string[], truncated, total }, ...(recovery === undefined ? {} : { recovery }) }
}

/** An include glob the tool actually accepts. */
function validInclude(include: string): boolean {
  if (include.trim() === '') return false
  if (include.startsWith('!')) return false
  let depth = 0
  for (const character of include) {
    if (character === '{') depth += 1
    else if (character === '}') depth = Math.max(0, depth - 1)
    else if (character === ',' && depth === 0) return false
  }
  return true
}

/** Validate one result's file groups. */
function searchFiles(value: unknown): SearchFile[] | null {
  if (!Array.isArray(value)) return null
  const files: SearchFile[] = []
  for (const candidate of value) {
    const group = asRecord(candidate)
    if (group === undefined) return null
    const path = group['path']
    const matches = group['matches']
    if (typeof path !== 'string' || !Array.isArray(matches)) return null
    const lines: SearchMatch[] = []
    for (const entry of matches) {
      const match = asRecord(entry)
      if (match === undefined) return null
      const lineNumber = match['lineNumber']
      if (typeof lineNumber !== 'number' || !Number.isInteger(lineNumber) || lineNumber < 1) return null
      if (typeof match['line'] !== 'string') return null
      lines.push({ lineNumber, line: match['line'] })
    }
    files.push({ path, matches: lines })
  }
  return files
}

/* ------------------------------------------------------------------ *
 * Web card
 * ------------------------------------------------------------------ */

/** One cited source — `WebSourceView`. */
export interface WebSource {
  url: string
  title?: string
  snippet?: string
  publishedAt?: string
}

/** Props for {@link WebCard}. */
export type WebCard =
  | { kind: 'search'; answer?: string; sources: WebSource[]; truncated: boolean }
  | { kind: 'fetch'; url: string; statusCode: number; truncated: boolean }

/**
 * Derive the web card — `webCardModel`.
 * @param row - the projected tool row.
 * @returns the card, or null when the shipped card declines this call.
 */
export function webCard(row: ToolRow): WebCard | null {
  if (row.pending || row.isError) return null
  const parsed = parseCall(row)
  if (parsed === undefined) return null
  const meta = asRecord(row.meta)
  if (meta === undefined || typeof meta['truncated'] !== 'boolean') return null
  const truncated = meta['truncated']
  if (parsed.name === 'web_search') {
    const queries = parsed.args['queries']
    if (!Array.isArray(queries) || queries.length === 0) return null
    if (!queries.every(entry => typeof entry === 'string' && entry.trim() !== '')) return null
    const answer = meta['answer']
    if (answer !== undefined && typeof answer !== 'string') return null
    const sources = webSources(meta['sources'])
    if (sources === null) return null
    return { kind: 'search', ...(answer === undefined ? {} : { answer }), sources, truncated }
  }
  if (parsed.name === 'web_fetch') {
    const url = parsed.args['url']
    if (typeof url !== 'string' || url.trim() === '') return null
    if (typeof meta['url'] !== 'string') return null
    const statusCode = meta['statusCode']
    if (typeof statusCode !== 'number' || !Number.isInteger(statusCode)) return null
    return { kind: 'fetch', url: meta['url'], statusCode, truncated }
  }
  return null
}

/** Validate one result's cited sources. */
function webSources(value: unknown): WebSource[] | null {
  if (!Array.isArray(value)) return null
  const sources: WebSource[] = []
  for (const candidate of value) {
    const source = asRecord(candidate)
    if (source === undefined) return null
    const url = source['url']
    if (typeof url !== 'string') return null
    const titles: { title?: string; snippet?: string; publishedAt?: string } = {}
    for (const key of ['title', 'snippet', 'publishedAt'] as const) {
      const field = source[key]
      if (field === undefined) continue
      if (typeof field !== 'string') return null
      titles[key] = field
    }
    sources.push({ url, ...titles })
  }
  return sources
}

/* ------------------------------------------------------------------ *
 * Labels for the primitives
 * ------------------------------------------------------------------ */

/** Localized chrome for `TerminalBlock`. */
export function terminalBlockLabels(t: SessionSyncTranslate): Record<string, unknown> {
  return {
    signal: (signal: string) => t('terminalSignal', { signal }),
    exitCode: (code: number) => t('terminalExitCode', { code }),
    noExitCode: t('terminalNoExitCode'),
    running: t('terminalRunning'),
    failed: t('terminalFailed'),
    done: t('terminalDone'),
    copy: t('copyCode'),
    copied: t('copiedCode'),
    noOutput: t('terminalNoOutput'),
    collapseAria: t('terminalCollapseAria'),
    collapse: t('collapse'),
    expandAria: (hidden: number) => t('terminalExpandAria', { n: hidden }),
    expand: (hidden: number) => t('terminalExpandRest', { n: hidden }),
  }
}

/** Localized chrome for `DiffBlock`. */
export function diffBlockLabels(t: SessionSyncTranslate): Record<string, unknown> {
  return {
    copy: t('copyCode'),
    copied: t('copiedCode'),
    collapseAria: t('diffCollapseAria'),
    expandAria: (count: number) => t('diffExpandAria', { count }),
    collapse: t('collapse'),
    expand: (count: number) => t('diffExpandRest', { count }),
    files: (count: number) => t(count === 1 ? 'diffFilesOne' : 'diffFilesOther', { count }),
  }
}

/** Localized chrome for `ReadBlock`. */
export function readBlockLabels(t: SessionSyncTranslate): Record<string, unknown> {
  return {
    window: (shown: number, total: number) => t('readWindow', { shown, total }),
    copy: t('copyCode'),
    copied: t('copiedCode'),
    collapseAria: t('readCollapseAria'),
    expandAria: (count: number) => t('readExpandAria', { count }),
    collapse: t('collapse'),
    expand: (count: number) => t('readExpandRest', { count }),
  }
}

/** Localized chrome for `SearchBlock`. */
export function searchBlockLabels(t: SessionSyncTranslate): Record<string, unknown> {
  return {
    pathsSummary: (shown: number, total: number, truncated: boolean) =>
      t(truncated ? 'searchPathsTruncated' : 'searchPaths', { shown, total }),
    matchesSummary: (shown: number, total: number, files: number, truncated: boolean) =>
      t(truncated ? 'searchMatchesTruncated' : 'searchMatches', { shown, total, files }),
    copy: t('copyCode'),
    copied: t('copiedCode'),
    noResults: t('searchNoResults'),
    collapseAria: t('searchCollapseAria'),
    expandAria: (count: number) => t('searchExpandAria', { count }),
    collapse: t('collapse'),
    expand: (count: number) => t('searchExpandRest', { count }),
  }
}

/** Localized chrome for `WebBlock`. */
export function webBlockLabels(t: SessionSyncTranslate): Record<string, unknown> {
  return {
    noResults: t('webNoResults'),
    sourcesTruncated: t('webSourcesTruncated'),
    http: t('webHttp'),
    contentTruncated: t('webContentTruncated'),
    markdown: {
      code: { copyLabel: t('copyCode'), copiedLabel: t('copiedCode') },
      footnotes: t('footnotes'),
    },
  }
}

/* ------------------------------------------------------------------ *
 * Shared readers
 * ------------------------------------------------------------------ */

/** A parsed tool call, or undefined when the arguments are not an object. */
function parseCall(row: ToolRow): { name: string; args: Record<string, unknown> } | undefined {
  const args = parseArgs(row.argumentsRaw)
  if (args === undefined) return undefined
  return { name: row.name, args }
}

/** Parse a raw arguments string into an object — `parsedToolCall`. */
function parseArgs(raw: string): Record<string, unknown> | undefined {
  return asRecord(parseJson(raw))
}

/** The result's text when it is exactly one text block — `singleResultText`. */
function singleResultText(row: ToolRow): string | undefined {
  if (row.resultBlocks.length !== 1) return undefined
  const only = asRecord(row.resultBlocks[0])
  return only?.['type'] === 'text' && typeof only['text'] === 'string' ? only['text'] : undefined
}

/** Every text block joined — `flattenContent`. */
function flattenContent(row: ToolRow): string {
  const parts: string[] = []
  for (const block of row.resultBlocks) {
    const record = asRecord(block)
    if (record?.['type'] === 'text' && typeof record['text'] === 'string') parts.push(record['text'])
  }
  return parts.join('\n')
}

/** The flattened result text a generic row shows — `resultText`. */
function resultText(row: ToolRow): string {
  const parts: string[] = []
  for (const block of row.resultBlocks) {
    const record = asRecord(block)
    if (record === undefined) continue
    if (record['type'] === 'text' && typeof record['text'] === 'string') parts.push(record['text'])
    else parts.push(JSON.stringify(record, null, 2))
  }
  return parts.join('\n')
}

/** Both escalation fields must be absent, or a valid pair. */
function validEscalationFields(args: Record<string, unknown>): boolean {
  const permissions = args['sandbox_permissions']
  const justification = args['justification']
  if (permissions === undefined && justification === undefined) return true
  if (permissions !== 'workspace-write' && permissions !== 'danger-full-access') return false
  return typeof justification === 'string' && justification.trim() !== ''
}

/** First key in `keys` whose value is a non-empty string. */
function pickString(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

/** One optional positive integer. */
function validPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/** The first line of a possibly multi-line value. */
function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/** Resolve a call's workdir against the Session workspace — `resolveTerminalCwd`. */
function resolveTerminalCwd(workdir: string | undefined, sessionCwd: string | undefined): string | undefined {
  if (workdir === undefined || workdir === '') return sessionCwd
  if (sessionCwd === undefined || sessionCwd === '') return normalizeSegments(workdir)
  return normalizeSegments(resolveWorkspacePath(sessionCwd, workdir))
}

/** Collapse `.`/`..` segments without changing the authored separators. */
function normalizeSegments(path: string): string {
  const separator = path.includes('\\') ? '\\' : '/'
  const segments = path.split(/[/\\]+/)
  const kept: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..' && kept.length > 0 && kept.at(-1) !== '..') kept.pop()
    else if (segment === '..' && kept.length === 0) kept.push(segment)
    else kept.push(segment)
  }
  const absolute = /^[/\\]/.test(path)
  return (absolute ? separator : '') + kept.join(separator)
}

/** Resolve a workspace-relative path — `resolveWorkspacePath`. */
function resolveWorkspacePath(cwd: string, path: string): string {
  if (/^([/\\]|[A-Za-z]:[/\\])/.test(path)) return path
  const separator = /^[A-Za-z]:\\/.test(cwd) && cwd.includes('\\') ? '\\' : '/'
  const base = cwd.replace(/[/\\]+$/, '')
  const relative = path.replace(/^[/\\]+/, '')
  return `${base}${separator}${relative}`
}

/** Strip the Session workspace prefix — `relativizeToCwd`. */
function relativizeToCwd(text: string, cwd: string | undefined): string {
  if (cwd === undefined || cwd === '') return text
  const root = cwd.replace(/[/\\]+$/, '')
  if (text.startsWith(`${root}/`) || text.startsWith(`${root}\\`)) return text.slice(root.length + 1)
  return text
}

/** Collapse a POSIX path under the account home — `abbreviateHomePath`. */
function abbreviateHomePath(path: string, home: string | undefined): string {
  if (home === undefined || home === '') return path
  if (/^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\')) return path
  if (/^[A-Za-z]:[/\\]/.test(home) || home.startsWith('\\\\')) return path
  const root = home.replace(/\/+$/, '')
  if (root === '' || root === '/') return path
  if (path.replace(/\/+$/, '') === root) return '~'
  if (path.startsWith(`${root}/`)) return `~${path.slice(root.length)}`
  return path
}

/** One optional JSON object. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/** Parse JSON, treating failure as "not an object". */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}
