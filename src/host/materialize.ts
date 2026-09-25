/**
 * Materializing a mirrored Session into this Host's own session store.
 *
 * The console can draw a mirrored Session, but every part of DSH that reads a
 * Session *through the Host* — history paging, the jump loader, the panels built
 * on Host state — asks for it by id, and a Host that has never heard of the id
 * answers `session/not-found`. Writing the mirror into the Host's own storage is
 * what ends that: from then on DSH reads it like any other Session.
 *
 * Two rules come from the storage layer itself (`sessionPersistence`):
 *
 * - events are contiguous from the beginning and never rewritten, so a Session
 *   whose beginning the mirror never held cannot be materialized from what is
 *   here — {@link materializeSession} refuses rather than writing a log with a
 *   hole at the front;
 * - every event is validated on the way in, so this module checks each one before
 *   it is written and counts what it refused. A log with one bad record is not a
 *   log with one missing row: readers refuse the whole Session.
 *
 * The Session is archived once it is written. Archiving is what makes it
 * read-only: `agent/pre-step` rejects every step of an archived Session, so a
 * prompt that reaches this Host cannot start a turn and cannot grow a second
 * truth beside the machine that owns the Session.
 */

import { isAbsolute } from 'node:path'

/** The format version this Host writes. */
export const MATERIALIZE_FORMAT_VERSION = 4

/**
 * Restate a Windows drive path so a POSIX Host reads it as absolute.
 *
 * The format validator asks `node:path.isAbsolute`, which answers for *this*
 * Host's platform: on Linux it rejects `C:\\work`, so a Session mirrored from a
 * Windows machine could never be written — every event was refused with
 * `format v4 header cwd must be absolute` before a single byte was written. The
 * drive is kept, only its notation changes: `C:\\a\\b` becomes `/C:/a/b`, which is
 * absolute everywhere and still says which drive it was.
 *
 * Anything already absolute is left exactly as it is, and a path this cannot
 * restate is dropped rather than guessed at — a wrong working directory is worse
 * than none.
 * @param cwd - the working directory the mirror reported.
 * @param absolute - the platform's own test, injectable for tests.
 * @returns a path this Host will accept, or undefined to leave it out.
 */
export function portableCwd(
  cwd: string | undefined,
  absolute: (path: string) => boolean,
): string | undefined {
  if (cwd === undefined) return undefined
  if (absolute(cwd)) return cwd
  const drive = /^([A-Za-z]):[\\/]/u.exec(cwd)
  if (drive === null) return undefined
  return `/${drive[1] ?? ''}:${cwd.slice(2).replaceAll('\\', '/')}`
}

/** One durable envelope, as the mirror holds it. */
export interface MirrorEnvelope {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: unknown
}

/** The write handle the Host's durable storage hands out. */
export interface SessionWriteHandleLike {
  append(events: readonly unknown[]): Promise<void>
  flush(): Promise<void>
  close(): Promise<void>
}

/** The Host's durable Session storage. */
export interface SessionPersistenceLike {
  create(header: Record<string, unknown>): Promise<SessionWriteHandleLike>
}

/** The Host's workspace registry, for the archive that keeps a Session read-only. */
export interface WorkspaceRegistryLike {
  archiveSession(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<void>
}

/** What the writer needs to know about the Session it is materializing. */
export interface MaterializeInput {
  /** The Session's own id — the same one the origin's log names. */
  readonly sessionId: string
  /** When the Session began, in epoch ms; the earliest mirrored event's time. */
  readonly createdAt: number
  /** The Session's working directory, when the mirror knows it. */
  readonly cwd?: string
  /** The mirrored events, in log order. */
  readonly events: readonly MirrorEnvelope[]
}

/** What the writer did. */
export interface MaterializeResult {
  readonly ok: boolean
  /** Events written to the new log. */
  readonly written: number
  /** Events refused before the write, which is why a count of zero is worth reading. */
  readonly skipped: number
  /** Whether the Session is now archived (read-only) in this Host. */
  readonly archived: boolean
  /** Why nothing was written, when nothing was. */
  readonly reason?: string
}

/**
 * Whether one envelope can be written as-is.
 *
 * The storage layer owns the format; this is the check that keeps a malformed
 * mirror record from making the whole Session unreadable. It is deliberately
 * about shape and order rather than vocabulary: an event type this Host does not
 * know is still a legitimate record.
 * @param envelope - the candidate.
 * @param expectedSeq - the sequence the log needs next.
 * @returns whether the envelope may be appended.
 */
export function writable(envelope: unknown, expectedSeq: number): envelope is MirrorEnvelope {
  if (typeof envelope !== 'object' || envelope === null) return false
  const candidate = envelope as Partial<MirrorEnvelope>
  if (typeof candidate.type !== 'string' || candidate.type === '') return false
  if (candidate.seq !== expectedSeq) return false
  if (typeof candidate.time !== 'number' || !Number.isFinite(candidate.time)) return false
  const data = candidate.data
  return typeof data === 'object' && data !== null && !Array.isArray(data)
}

/**
 * Write one mirrored Session into this Host's storage and archive it.
 *
 * A Session that already exists under this id is left alone: the caller may be
 * looking at a mirror of a Session this Host ran itself, and overwriting that log
 * would destroy the original.
 * @param persistence - the Host's durable Session storage, when it is mounted.
 * @param workspaces - the Host's workspace registry, when it is mounted.
 * @param input - the Session and the events the mirror holds for it.
 * @returns what was written, or why nothing was.
 */
export async function materializeSession(
  persistence: SessionPersistenceLike | undefined,
  workspaces: WorkspaceRegistryLike | undefined,
  input: MaterializeInput,
): Promise<MaterializeResult> {
  const none = (reason: string): MaterializeResult => ({ ok: false, written: 0, skipped: 0, archived: false, reason })
  if (persistence === undefined) return none('this Host has no session storage mounted')
  if (input.events.length === 0) return none('the mirror holds no events for this Session')

  // The log has to begin at its beginning. A window that starts later is a gap
  // the storage layer refuses, so the caller has to backfill first.
  const first = input.events[0]
  if (first === undefined || first.seq > 1) return none('the mirror holds only the newest window; backfill is required')

  const written: unknown[] = []
  let skipped = 0
  let expected = first.seq
  for (const event of input.events) {
    if (!writable(event, expected)) {
      skipped += 1
      continue
    }
    written.push(event)
    expected += 1
  }
  if (written.length === 0) return { ok: false, written: 0, skipped, archived: false, reason: 'no event passed the write check' }
  // A log is a contiguous run from its beginning, so one hole ends it: every
  // event after the hole is skipped for being "out of order" whether it is or
  // not. Writing what came before the hole reports success over a Session that
  // stops mid-conversation, which is the one outcome worse than refusing — the
  // mirror was short, and now a log claims otherwise. Measured live: a mirror
  // missing one early event produced `ok: true, written: 767, skipped: 9323`,
  // and the log it archived held seq 0..766 of 11,835.
  if (expected < input.events.at(-1)!.seq + 1) {
    return {
      ok: false,
      written: 0,
      skipped,
      archived: false,
      reason: `the mirror's run stops at seq ${String(expected - 1)}; the rest is not contiguous, `
        + 'so nothing was written — the Session needs its gaps filled first',
    }
  }

  let handle: SessionWriteHandleLike
  try {
    // Restated for this Host's platform: the format validator's notion of
    // "absolute" is the one in force here, not the one where the Session ran.
    const cwd = portableCwd(input.cwd, isAbsolute)
    handle = await persistence.create({
      version: MATERIALIZE_FORMAT_VERSION,
      id: input.sessionId,
      createdAt: input.createdAt,
      // A mirrored Session is an ordinary conversation this Host did not run:
      // not seeded, not a subagent, no preset of its own.
      isSeeded: false,
      ...(cwd === undefined ? {} : { cwd }),
    })
  } catch (error: unknown) {
    return { ok: false, written: 0, skipped, archived: false, reason: `cannot create the log: ${String(error)}` }
  }

  try {
    await handle.append(written)
    await handle.flush()
  } catch (error: unknown) {
    return { ok: false, written: 0, skipped, archived: false, reason: `cannot write the log: ${String(error)}` }
  } finally {
    await handle.close().catch(() => undefined)
  }

  // Archiving is the read-only half: it has to happen after the log exists,
  // because the registry refuses a Session it does not know.
  let archived = false
  if (workspaces !== undefined) {
    try {
      await workspaces.archiveSession(input.sessionId, { stopActivity: true })
      archived = true
    } catch (error: unknown) {
      return { ok: true, written: written.length, skipped, archived: false, reason: `written but not archived: ${String(error)}` }
    }
  }

  return { ok: true, written: written.length, skipped, archived }
}
