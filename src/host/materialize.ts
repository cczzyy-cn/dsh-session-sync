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
 * The Session is deliberately **not** archived, and that is a change from the
 * first design. Archiving is the shipped way to make a Session read-only, but a
 * closed Session cannot be read either: the workspace browser refuses to open an
 * archived row (`archivedNotOpenable`) and hides it behind the default archived
 * filter, so "materialize + archive" produced a Session that could not be looked
 * at. The read-only half is the plugin's own `agent/pre-step` gate over
 * {@link MirrorLedger} instead: the Session stays listed and openable, and any
 * step proposed for it is refused before a model request.
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

/** What `stat` says about a stored Session. */
export interface SessionStoredSnapshot {
  /** How many events the log holds, when the backend reports it. */
  readonly eventCount?: number
}

/** The Host's durable Session storage. */
export interface SessionPersistenceLike {
  create(header: Record<string, unknown>): Promise<SessionWriteHandleLike>
  /**
   * Take a write handle on an *existing* log and continue it.
   *
   * This is what makes the openable copy durable rather than one-shot: the
   * handle starts at the stored event count, so an append has to begin at that
   * sequence. It is also the single-writer claim — a Session already owned by a
   * live run refuses it (`SessionAlreadyOwnedError`), which is the right answer
   * for a mirror.
   */
  open(id: string, access: 'read' | 'write'): Promise<SessionWriteHandleLike>
  /** Read a stored Session's shape without taking a handle. */
  stat(id: string): Promise<SessionStoredSnapshot | undefined>
}

/** What the writer needs to know about the Session it is materializing. */
export interface MaterializeInput {
  /** The Session's own id — the same one the origin's log names. */
  readonly sessionId: string
  /** When the Session began, in epoch ms; the earliest mirrored event's time. */
  readonly createdAt: number
  /** The Session's working directory, when the mirror knows it. */
  readonly cwd?: string
  /**
   * The agent preset the Session ran under, when the origin named one.
   *
   * Not a detail the writer can infer and not one it may invent: the format allows
   * it, and a materialized Session that loses it is not the Session the origin ran.
   * Measured against a real materialization, where `agentPreset: "standard"` went
   * missing because the header was rebuilt here instead of carried.
   */
  readonly agentPreset?: string
  /** Set when the Session belongs to a subagent, as the origin stated it. */
  readonly origin?: string
  /** The mirrored events, in log order. */
  readonly events: readonly MirrorEnvelope[]
}

/** What the writer did. */
export interface MaterializeResult {
  readonly ok: boolean
  /** Events written by this call. */
  readonly written: number
  /** Events refused before the write, which is why a count of zero is worth reading. */
  readonly skipped: number
  /**
   * How many events the log holds after this call.
   *
   * The ledger records this rather than the per-call count: it is the sequence
   * the *next* append has to continue from, and a resumed write needs to know it
   * without reading the whole log back.
   */
  readonly stored: number
  /** Whether this call created the log (false when it continued an existing one). */
  readonly created: boolean
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
 * What to do about one mirrored Session whose log may already exist.
 *
 * `create` refuses an id that is already on disk, which is right — overwriting a
 * log destroys whatever it held — but it is not an answer, because the caller has
 * three different situations behind that one refusal:
 *
 * - **nothing on disk**: write it;
 * - **a log this Host itself ran** (`owner` is this Host): leave it alone. The
 *   Session belongs to this Host, and gating or rewriting it would damage the
 *   original — this is the case the writer's "an existing id is left alone" rule
 *   exists for;
 * - **a log under an id another machine owns**: this Host wrote it from a mirror
 *   in an earlier life — before a restart, before the ledger existed, or under a
 *   build that did not keep one. It is a copy, so it is *ours to own*: adopting it
 *   into the ledger is what puts it back under the gate.
 *
 * Without the third case the automatic pass retries `create` forever — measured
 * live, against a log an earlier manual materialization had left: `materialized`
 * stayed empty, the copy stopped tracking the mirror, and it was outside the gate
 * the whole time.
 * @param stored - what `stat` says about the id, or undefined when nothing is on disk.
 * @param owner - the machine the mirror says owns the Session.
 * @param self - this Host's own machine name.
 * @returns which of the three situations this is.
 */
export function startFor(
  stored: SessionStoredSnapshot | undefined,
  owner: string,
  self: string,
): 'create' | 'adopt' | 'ours' {
  if (stored === undefined) return 'create'
  return owner === self ? 'ours' : 'adopt'
}

/**
 * Write one mirrored Session into this Host's own storage.
 *
 * A Session that already exists under this id is left alone: the caller may be
 * looking at a mirror of a Session this Host ran itself, and overwriting that log
 * would destroy the original. Continuing an existing *mirror* log is a different
 * call ({@link catchUpSession}), which appends only what the log is missing.
 * @param persistence - the Host's durable Session storage, when it is mounted.
 * @param input - the Session and the events the mirror holds for it.
 * @returns what was written, or why nothing was.
 */
export async function materializeSession(
  persistence: SessionPersistenceLike | undefined,
  input: MaterializeInput,
): Promise<MaterializeResult> {
  const none = (reason: string): MaterializeResult =>
    ({ ok: false, written: 0, skipped: 0, stored: 0, created: false, reason })
  if (persistence === undefined) return none('this Host has no session storage mounted')
  if (input.events.length === 0) return none('the mirror holds no events for this Session')

  // The log has to begin at its beginning — seq 0, not "somewhere near zero". A
  // window that starts later is a gap the storage layer refuses, so the caller
  // has to backfill first.
  const first = input.events[0]
  if (first === undefined || first.seq !== 0) return none('the mirror holds only the newest window; backfill is required')

  const { written, skipped, endsAt } = contiguous(input.events, 0)
  if (written.length === 0) {
    return { ok: false, written: 0, skipped, stored: 0, created: false, reason: 'no event passed the write check' }
  }
  // A log is a contiguous run from its beginning, so one hole ends it: every
  // event after the hole is skipped for being "out of order" whether it is or
  // not. Writing what came before the hole reports success over a Session that
  // stops mid-conversation, which is the one outcome worse than refusing — the
  // mirror was short, and now a log claims otherwise. Measured live: a mirror
  // missing one early event produced `ok: true, written: 767, skipped: 9323`,
  // and the log it wrote held seq 0..766 of 11,835.
  if (endsAt < input.events.at(-1)!.seq) {
    return {
      ok: false,
      written: 0,
      skipped,
      stored: 0,
      created: false,
      reason: `the mirror's run stops at seq ${String(endsAt - 1)}; the rest is not contiguous, `
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
      // A mirrored Session is an ordinary conversation this Host did not run, so it
      // is not seeded and inherits nothing. What it *was* — its preset, and whether
      // it belongs to a subagent — is carried from the origin's own header rather
      // than assumed here.
      isSeeded: false,
      ...(cwd === undefined ? {} : { cwd }),
      ...(input.agentPreset === undefined ? {} : { agentPreset: input.agentPreset }),
      ...(input.origin === undefined ? {} : { origin: input.origin }),
    })
  } catch (error: unknown) {
    return { ok: false, written: 0, skipped, stored: 0, created: false, reason: `cannot create the log: ${String(error)}` }
  }

  try {
    await handle.append(written)
    await handle.flush()
  } catch (error: unknown) {
    return { ok: false, written: 0, skipped, stored: 0, created: false, reason: `cannot write the log: ${String(error)}` }
  } finally {
    await handle.close().catch(() => undefined)
  }

  return { ok: true, written: written.length, skipped, stored: written.length, created: true }
}

/**
 * Continue an existing mirror log with whatever the mirror has grown since.
 *
 * The log is append-only and never rewritten, so this can only ever move it
 * forward: it starts at the stored count, takes the contiguous run from there,
 * and leaves the rest where it is. A mirror with a hole below the log's end
 * cannot be repaired through this path, which is why the caller records why it
 * stopped rather than retrying forever.
 * @param persistence - the Host's durable Session storage.
 * @param sessionId - the Session being continued.
 * @param events - the mirrored events, in log order.
 * @returns what was appended, or why nothing was.
 */
export async function catchUpSession(
  persistence: SessionPersistenceLike | undefined,
  sessionId: string,
  events: readonly MirrorEnvelope[],
): Promise<MaterializeResult> {
  const none = (stored: number, reason: string): MaterializeResult =>
    ({ ok: false, written: 0, skipped: 0, stored, created: false, reason })
  if (persistence === undefined) return none(0, 'this Host has no session storage mounted')

  let stored = 0
  try {
    stored = (await persistence.stat(sessionId))?.eventCount ?? 0
  } catch (error: unknown) {
    return none(0, `cannot stat the log: ${String(error)}`)
  }
  if (stored === 0) return none(0, 'the log is not on disk; it has to be created first')

  const pending = events.filter(event => event.seq >= stored)
  if (pending.length === 0) return { ok: true, written: 0, skipped: 0, stored, created: false }
  const { written, skipped, endsAt } = contiguous(pending, stored)
  if (written.length === 0) return none(stored, `the mirror holds nothing at seq ${String(stored)}`)

  let handle: SessionWriteHandleLike
  try {
    handle = await persistence.open(sessionId, 'write')
  } catch (error: unknown) {
    return none(stored, `cannot open the log: ${String(error)}`)
  }
  try {
    await handle.append(written)
    await handle.flush()
  } catch (error: unknown) {
    return none(stored, `cannot append to the log: ${String(error)}`)
  } finally {
    await handle.close().catch(() => undefined)
  }

  return {
    ok: true,
    written: written.length,
    skipped,
    stored: endsAt,
    created: false,
    // The mirror's own later events may still be missing here; the caller reads
    // `stored` against what the origin claims and records the shortfall.
    ...(endsAt === events.at(-1)!.seq ? {} : { reason: `the mirror's run stops at seq ${String(endsAt - 1)}` }),
  }
}

/**
 * The leading run of events that can be appended from `from`.
 *
 * The write check is about shape and order rather than vocabulary: an event type
 * this Host does not know is still a legitimate record, and the storage layer's
 * own contiguity assertion is the backstop.
 * @param events - the candidates, in log order.
 * @param from - the sequence the log needs next.
 * @returns the writable prefix, how many were refused, and where the run ends.
 */
function contiguous(
  events: readonly MirrorEnvelope[],
  from: number,
): { written: MirrorEnvelope[]; skipped: number; endsAt: number } {
  const written: MirrorEnvelope[] = []
  let skipped = 0
  let expected = from
  for (const event of events) {
    if (!writable(event, expected)) {
      skipped += 1
      continue
    }
    written.push(event)
    expected += 1
  }
  return { written, skipped, endsAt: expected }
}
