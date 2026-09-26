/**
 * Surgery on one durable Session log, for the one case that needs it.
 *
 * A copy of a mirrored Session has to stay aligned with the origin sequence by
 * sequence, and DSH itself breaks that alignment: resuming a Session with a seed
 * makes it append its own `session/end-seed` marker into the log
 * (`core/session/src/index.ts:616-620`), which takes a sequence the origin's next
 * event needs. On the origin that marker is ordinary bookkeeping; in a copy it
 * displaces a mirrored event, and a log with a displaced inbox splice cannot be
 * projected at all.
 *
 * The marker is always *trailing* — DSH appends it at the end — so the repair is
 * to take it back out, which is far cheaper than rebuilding a multi-megabyte log
 * and, unlike a rebuild, needs nothing from the storage layer: the Session's id
 * stays exactly as it was. Two rules keep it safe, and both are the caller's:
 * the records dropped must be markers only, and the Session must be cold (a live
 * one holds its log in memory, and cutting the file under it would leave its next
 * append writing over a hole).
 */
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'

/** The zstd frame magic that separates one append from the next in a log. */
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** The type of the marker DSH appends when it resumes a Session with a seed. */
export const RESUME_MARKER = 'session/end-seed'

/** Where the Host keeps every Session log, under the Harness home. */
const SESSIONS_DIR = 'sessions'

/** Where the Host caches derived projections, one file per Session. */
const PROJECTION_CACHE_DIR = join('storages', 'session_projcache', 'sessions')

/**
 * Find one Session's durable log.
 *
 * The directory is named for the Session but sits under a slug of its working
 * directory, so the slug is searched rather than reconstructed: the layout is the
 * Host's, not this plugin's, and guessing it is how a repair silently does
 * nothing.
 * @param home - the Harness home directory.
 * @param sessionId - the Session whose log to find.
 * @returns the log's absolute path, or `undefined` when there is none.
 */
export async function findLogFile(home: string, sessionId: string): Promise<string | undefined> {
  let slugs: string[]
  try {
    slugs = await readdir(join(home, SESSIONS_DIR))
  } catch {
    return undefined
  }
  for (const slug of slugs) {
    const dir = join(home, SESSIONS_DIR, slug, sessionId)
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      continue
    }
    // The format version is part of the name and moves with the Host's storage
    // format, so it is matched rather than written down.
    const log = files.find(file => /^session\.v\d+\.jsonl\.zstd$/u.test(file))
    if (log !== undefined) return join(dir, log)
  }
  return undefined
}

/** One readable log: its zstd frames, and the records they decode to. */
interface DecodedLog {
  /** Each frame's byte range and record count, in order. */
  readonly frames: { readonly start: number; readonly end: number; readonly count: number }[]
  /** Every record, in file order. */
  readonly records: unknown[]
}

/**
 * Decode a log's concatenated zstd frames.
 *
 * The format appends one frame per write, so a single decompression call decodes
 * only the first one — the mistake that makes a 4000-record log look like it has
 * three records.
 * @param path - the log file.
 * @returns the frames and their records.
 * @throws when the file cannot be read or a frame cannot be decoded.
 */
export async function readLog(path: string): Promise<DecodedLog> {
  const buffer = await readFile(path)
  const starts: number[] = []
  for (let index = 0; index + FRAME_MAGIC.length <= buffer.length; index += 1) {
    if (buffer.compare(FRAME_MAGIC, 0, FRAME_MAGIC.length, index, index + FRAME_MAGIC.length) === 0) {
      starts.push(index)
    }
  }
  if (starts.length === 0) throw new Error('the log holds no zstd frame')
  const frames: { start: number; end: number; count: number }[] = []
  const records: unknown[] = []
  for (const [index, start] of starts.entries()) {
    const end = starts[index + 1] ?? buffer.length
    const text = zstdDecompressSync(buffer.subarray(start, end)).toString('utf8')
    const lines = text.split('\n').filter(line => line.length > 0)
    for (const line of lines) records.push(JSON.parse(line))
    frames.push({ start, end, count: lines.length })
  }
  return { frames, records }
}

/** Whether one decoded record is DSH's resume marker. */
function isMarker(record: unknown): boolean {
  return typeof record === 'object' && record !== null
    && (record as { type?: unknown }).type === RESUME_MARKER
}

/**
 * Take DSH's trailing resume markers back out of a log.
 *
 * Drops at most `limit` trailing records, and only while every one of them is a
 * marker: the moment a real event is reached the log is left alone, because a log
 * whose *content* diverges is not something this function may decide about. The
 * rewrite keeps every frame untouched except the one the cut falls in, so the
 * bytes of the records that remain are the bytes that were there.
 * @param path - the log file.
 * @param limit - the most markers to drop.
 * @returns how many were dropped; zero means the log was not written.
 * @throws when the log cannot be read or written.
 */
export async function dropTrailingMarkers(path: string, limit: number): Promise<number> {
  if (limit <= 0) return 0
  const { frames, records } = await readLog(path)
  let dropped = 0
  while (dropped < limit && records.length > 0 && isMarker(records[records.length - 1])) {
    records.pop()
    dropped += 1
  }
  if (dropped === 0) return 0

  const keep = records.length
  // The frame the cut falls in: everything before it survives byte for byte, and
  // that one frame is re-compressed from the records that remain.
  let seen = 0
  let cut = frames.length
  for (const [index, frame] of frames.entries()) {
    if (seen + frame.count > keep) { cut = index; break }
    seen += frame.count
  }
  const original = await readFile(path)
  const head = original.subarray(0, frames[cut]?.start ?? original.length)
  const tail = records.slice(seen)
  const rewritten = tail.length === 0
    ? head
    : Buffer.concat([
      head,
      zstdCompressSync(Buffer.from(tail.map(record => `${JSON.stringify(record)}\n`).join(''), 'utf8')),
    ])
  const temporary = `${path}.repair`
  await writeFile(temporary, rewritten)
  await rename(temporary, path)
  return dropped
}

/**
 * Drop the Host's cached projections for one Session.
 *
 * Derived state, so removing it is always safe; it has to go whenever a log is
 * rewritten, because a cached fold continues from a sequence whose content just
 * changed — which reproduces the very failure the rewrite was undoing.
 * @param home - the Harness home directory.
 * @param sessionId - the Session whose cache to drop.
 * @returns whether a cached file was there.
 */
export async function clearProjectionCache(home: string, sessionId: string): Promise<boolean> {
  const path = join(home, PROJECTION_CACHE_DIR, `${sessionId}.json`)
  try {
    await rm(path)
    return true
  } catch {
    return false
  }
}
