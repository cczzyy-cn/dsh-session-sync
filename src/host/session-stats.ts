/**
 * The machine's own answer to "how much is in this Session" — read from the
 * Session's whole log and published with the index.
 *
 * The console can only ever count what it *holds*, and what it holds is what the
 * mirror retained: a window. So the two footers disagreed for a reason no amount
 * of console-side arithmetic could fix — a 6,257-event Session whose mirror kept
 * 4,000 showed 632 steps against the machine's 967. This half is the authority:
 * the machine that owns the log reads all of it, computes the same totals the
 * console computes, and states them.
 *
 * It is deliberately optional and off the critical path. Every failure ends as
 * "no stats this round" — an unreadable log, a Session that has no file yet, a
 * build without `node:zlib` zstd support, a frame layout that changed. The index
 * still carries the Session; the console then falls back to counting what it
 * holds, which is exactly today's behaviour.
 *
 * The total is cached against the sequence it was computed at, so a Session that
 * grew by one event does not re-decode five megabytes, and a Session that has not
 * changed is answered from memory.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { logStats, type LogStats } from '../shared/log-stats.ts'
import type { MirrorEvent } from '../shared/protocol.ts'

/** The Zstandard frame magic, little-endian. */
const ZSTD_MAGIC = 0xFD2FB528

/** One Session's totals, and the sequence they were computed at. */
export interface SessionLogStats {
  /** Highest sequence the computation saw. */
  seq: number
  stats: LogStats
}

/** Where one Session's own log lives, and what it looked like when read. */
export interface LogRead {
  events: readonly MirrorEvent[]
  /** True when the tail of the log was still being written. */
  truncated: boolean
}

/**
 * The path segment DSH uses for one project directory.
 *
 * Mirrored from the persistence backend's `projectKey`: separators collapse to a
 * single `-`, unsafe code units become `~XXXX`, and the whole is wrapped in `--`.
 * Reproduced rather than imported because this plugin must not depend on DSH's
 * internals; a mismatch ends as "no stats", never as a wrong number, because the
 * totals are only published when a log was actually read.
 * @param cwd - the Session's working directory.
 * @returns the directory name under the sessions root.
 */
export function projectKey(cwd: string): string {
  let readable = ''
  let separatorRun = false
  for (let index = 0; index < cwd.length; index += 1) {
    const code = cwd.charCodeAt(index)
    const character = String.fromCharCode(code)
    if (character === '/' || character === '\\' || character === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (character !== '~' && /^[A-Za-z0-9._-]$/.test(character)) {
      readable += character
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return `--${slug.slice(0, 251)}--`
}

/**
 * Find the newest log file for one Session.
 *
 * The format generation is in the filename (`session.v4.jsonl.zstd`), so the
 * version is not hardcoded: the highest generation present wins, and its
 * compression is read off the suffix.
 * @param root - the sessions root, `<DSH_HOME>/sessions`.
 * @param cwd - the Session's working directory; undefined means "no cwd recorded".
 * @param sessionId - the Session id, used verbatim as the directory name.
 * @returns the absolute path, or undefined when the Session has no log yet.
 */
export async function findLogPath(root: string, cwd: string | undefined, sessionId: string): Promise<string | undefined> {
  const directory = cwd === undefined ? join(root, '_no-cwd', sessionId) : join(root, projectKey(cwd), sessionId)
  let names: string[]
  try {
    names = await readdir(directory)
  } catch {
    return undefined
  }
  const candidates = names
    .map(name => /^session\.v(\d+)\.jsonl(\.zstd)?$/.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(match => ({ name: match[0], version: Number(match[1]), compressed: match[2] === '.zstd' }))
    // Newest generation first, and at one generation the compressed artifact —
    // which is what DSH writes by default. Both can exist after a format change,
    // and picking the plain one there would read a stale prefix of the log.
    .sort((left, right) => right.version - left.version
      || Number(right.compressed) - Number(left.compressed))
  const best = candidates[0]
  return best === undefined ? undefined : join(directory, best.name)
}

/**
 * Walk the structurally complete Zstandard frames in one concatenated stream.
 *
 * DSH writes a Session log as one frame per durable batch, and Node's decompressor
 * stops after the first — so the frames have to be found first. A torn final frame
 * is reported rather than thrown: the log is being appended to while it is read.
 * @param buffer - the whole file.
 * @returns each complete frame's byte range, and where an incomplete one starts.
 */
function scanZstdFrames(buffer: Buffer): { frames: { start: number; end: number }[]; tornStart?: number } {
  const frames: { start: number; end: number }[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return { frames, tornStart: start }
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return { frames, tornStart: start }
    offset += 4
    if (offset === buffer.length) return { frames, tornStart: start }
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) return { frames, tornStart: start }
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start }
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) return { frames, tornStart: start }
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start }
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return { frames }
}

/** One parsed JSONL row, as the loose shape the log writes. */
interface LogRow {
  type?: unknown
  seq?: unknown
  time?: unknown
  data?: unknown
}

/**
 * Read one Session's log as events.
 *
 * The file is a header line plus one JSON object per line, either plain or inside
 * concatenated Zstandard frames. Only the fields the totals need are kept, so the
 * decoded text does not stay resident after the call.
 * @param path - the log file.
 * @returns the events in log order, or undefined when the file cannot be read as
 *   a Session log at all — the caller then publishes no totals rather than wrong ones.
 */
export async function readLogEvents(path: string): Promise<LogRead | undefined> {
  let bytes: Buffer
  try {
    bytes = await readFile(path)
  } catch {
    return undefined
  }

  if (!path.endsWith('.zstd')) {
    const plain = splitLines(bytes.toString('utf8'), false)
    return { events: parseLines([...plain.lines, ...(plain.carry === '' ? [] : [plain.carry])]), truncated: false }
  }

  const scan = scanZstdFrames(bytes)
  const lines: string[] = []
  // One carry per reading, threaded through the frames: a durable batch can end
  // mid-line, and its remainder belongs to the next frame's first line.
  let carry = ''
  for (const frame of scan.frames) {
    let plain: Buffer
    try {
      plain = zstdDecompressSync(bytes.subarray(frame.start, frame.end))
    } catch {
      return undefined
    }
    const part = splitLines(carry + plain.toString('utf8'), false)
      carry = part.carry
    lines.push(...part.lines)
  }
  const tail = splitLines(carry, true)
  lines.push(...tail.lines)
  return { events: parseLines(lines), truncated: scan.tornStart !== undefined }
}

/**
 * Split one decoded chunk into complete lines.
 * @param text - the decoded text, with any incomplete line from the previous chunk
 *   already prepended.
 * @param flush - whether to accept the remaining text as a complete final line.
 * @returns the complete lines, and the new incomplete tail.
 */
function splitLines(text: string, flush: boolean): { lines: string[]; carry: string } {
  if (flush) return { lines: text === '' ? [] : [text], carry: '' }
  const parts = text.split('\n')
  const next = parts.pop() ?? ''
  return { lines: parts.filter(part => part.trim() !== ''), carry: next }
}

/** Parse JSONL rows into the event shape the totals read, ignoring what will not parse. */
function parseLines(lines: readonly string[]): MirrorEvent[] {
  const events: MirrorEvent[] = []
  for (const line of lines) {
    let row: LogRow
    try {
      row = JSON.parse(line) as LogRow
    } catch {
      continue
    }
    if (typeof row.type !== 'string' || typeof row.seq !== 'number') continue
    events.push({
      type: row.type,
      seq: row.seq,
      time: typeof row.time === 'number' ? row.time : 0,
      data: row.data,
    })
  }
  return events
}

/** One Session's totals, cached against the sequence they were computed at. */
interface CacheEntry extends SessionLogStats {
  at: number
}

/** How long one Session's totals are reused before the log is read again. */
const CACHE_MS = 30_000

/**
 * Reads Session logs and remembers their totals.
 *
 * One instance per engine. The cache is what keeps this off the notice of the
 * periodic reconcile: a five-megabyte log is decoded once per interval per
 * Session, not once per publish.
 */
export class SessionStatsReader {
  private readonly root: string
  private readonly cache = new Map<string, CacheEntry>()
  private readonly reading = new Set<string>()

  /**
   * @param root - the sessions root, `<DSH_HOME>/sessions`.
   */
  constructor(root: string) {
    this.root = root
  }

  /** The totals already computed for one Session, without reading anything. */
  cached(sessionId: string): SessionLogStats | undefined {
    const entry = this.cache.get(sessionId)
    return entry === undefined ? undefined : { seq: entry.seq, stats: entry.stats }
  }

  /**
   * Read one Session's log and compute its totals, unless a fresh reading exists.
   * @param sessionId - the Session whose log to read.
   * @param cwd - the Session's working directory, as its own index states it.
   * @param seq - the highest sequence the machine has published for it.
   * @returns the totals and the sequence they cover, or undefined when there is
   *   nothing to read yet.
   */
  async compute(sessionId: string, cwd: string | undefined, seq: number): Promise<SessionLogStats | undefined> {
    const entry = this.cache.get(sessionId)
    const now = Date.now()
    if (entry !== undefined && entry.seq >= seq && now - entry.at < CACHE_MS) {
      return { seq: entry.seq, stats: entry.stats }
    }
    if (this.reading.has(sessionId)) return entry
    this.reading.add(sessionId)
    try {
      const path = await findLogPath(this.root, cwd, sessionId)
      if (path === undefined) return undefined
      const read = await readLogEvents(path)
      if (read === undefined) return undefined
      const stats = logStats(read.events)
      const computed: CacheEntry = { seq: read.events.at(-1)?.seq ?? -1, stats, at: Date.now() }
      this.cache.set(sessionId, computed)
      return { seq: computed.seq, stats: computed.stats }
    } finally {
      this.reading.delete(sessionId)
    }
  }

  /** Drop a Session's totals — its publish switch went off, or its log went away. */
  forget(sessionId: string): void {
    this.cache.delete(sessionId)
  }

  /** Release everything. */
  dispose(): void {
    this.cache.clear()
    this.reading.clear()
  }
}
