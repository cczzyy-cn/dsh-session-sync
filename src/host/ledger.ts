/**
 * The ledger of Sessions this Host mirrored into its own storage.
 *
 * Writing a mirrored Session into `sessionPersistence` makes DSH treat it as an
 * ordinary Session: it appears in the browser, opens in the official
 * conversation page, and pages its history through the Host. What it must never
 * do is *run*: a step on this Host would grow a second truth beside the machine
 * that owns the Session.
 *
 * Archiving would be the shipped way to say that, and it is the wrong tool here
 * — a closed Session cannot be opened at all (`WorkspaceBrowser.guardedOpen`
 * answers an archived row with `archivedNotOpenable`) and the default archived
 * filter hides it, so an archived mirror is a Session nobody can read. So the
 * read-only half is this ledger plus the plugin's own `agent/pre-step` gate:
 * the Session stays listed and openable, and every proposed step is refused.
 *
 * The ledger is durable on purpose. The mirror is memory-only and rebuilds from
 * the origin's next publish, so membership derived from the mirror would leave a
 * window after every restart — and would disappear entirely for a Session the
 * origin stops publishing, which is exactly when a runnable copy is most
 * dangerous. A file the plugin owns answers "is this one of ours" in every one
 * of those states.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { MATERIALIZED_FILE_NAME } from '../shared/protocol.ts'

/** What the ledger remembers about one mirrored Session. */
export interface MaterializedEntry {
  /** The machine that owns the Session, as it published it. */
  readonly machineName: string
  /** When this Host wrote the log, in epoch ms. */
  readonly at: number
  /** How many events the log held when it was last written. */
  readonly events: number
  /** When the openable copy stopped tracking the mirror, and why. */
  readonly stopped?: string
}

/** The document as it sits on disk. */
interface LedgerDocument {
  version: 1
  sessions: Record<string, MaterializedEntry>
}

/**
 * The set of Sessions this Host has written a mirror log for.
 *
 * Every mutation persists before it resolves: the gate reads this from memory on
 * a hot path, and a mark that survived only until the next restart would fail
 * open exactly once per boot.
 */
export class MirrorLedger {
  private constructor(
    private readonly path: string,
    private sessions: Map<string, MaterializedEntry>,
  ) {}

  /**
   * Read the ledger, treating a missing or unreadable document as empty.
   * @param home - Harness home directory.
   * @returns the ledger, ready to answer `owns`.
   */
  static async open(home: string): Promise<MirrorLedger> {
    const path = join(home, MATERIALIZED_FILE_NAME)
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(path, 'utf8'))
    } catch {
      parsed = undefined
    }
    return new MirrorLedger(path, readEntries(parsed))
  }

  /** Path of the document this ledger owns. */
  get file(): string {
    return this.path
  }

  /**
   * Whether this Host wrote (and therefore gates) one Session.
   * @param sessionId - the Session under test.
   * @returns whether a mirror log exists for it.
   */
  owns(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  /**
   * One entry, for reporting.
   * @param sessionId - the Session asked about.
   * @returns the entry, or undefined when the ledger does not hold it.
   */
  get(sessionId: string): MaterializedEntry | undefined {
    return this.sessions.get(sessionId)
  }

  /** Every mirrored Session this Host holds, in insertion order. */
  list(): { sessionId: string; entry: MaterializedEntry }[] {
    return [...this.sessions].map(([sessionId, entry]) => ({ sessionId, entry }))
  }

  /**
   * Record that a log was written, or that it grew.
   * @param sessionId - the Session.
   * @param machineName - the machine that owns it.
   * @param events - how many events the log now holds.
   */
  async mark(sessionId: string, machineName: string, events: number): Promise<void> {
    const previous = this.sessions.get(sessionId)
    // A Session that stopped tracking is not silently resumed by a later append:
    // the reason it stopped is a fact about the log's continuity, and clearing it
    // would hide the hole the next reader is about to meet.
    if (previous?.stopped !== undefined) return
    this.sessions.set(sessionId, { machineName, at: previous?.at ?? Date.now(), events })
    await this.persist()
  }

  /**
   * Note that the openable copy no longer tracks the mirror.
   * @param sessionId - the Session.
   * @param reason - what stopped it.
   */
  async stop(sessionId: string, reason: string): Promise<void> {
    const previous = this.sessions.get(sessionId)
    if (previous === undefined || previous.stopped === reason) return
    this.sessions.set(sessionId, { ...previous, stopped: reason })
    await this.persist()
  }

  /**
   * Forget one Session, so it may run on this Host again.
   *
   * The log is deliberately left on disk: this drops the gate, not the Session.
   * @param sessionId - the Session to release.
   * @returns whether the ledger held it.
   */
  async release(sessionId: string): Promise<boolean> {
    if (!this.sessions.delete(sessionId)) return false
    await this.persist()
    return true
  }

  /** Write the document atomically, so a crash cannot truncate it. */
  private async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const document: LedgerDocument = {
      version: 1,
      sessions: Object.fromEntries(this.sessions),
    }
    const temporary = `${this.path}.${process.pid.toString()}.tmp`
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    await rename(temporary, this.path)
  }
}

/**
 * Read the persisted map, ignoring anything that is not the shape this
 * document has. A ledger that cannot be read is an empty ledger — which fails
 * *closed* for the log and *open* for the gate, so the entries are validated
 * field by field rather than trusted.
 * @param parsed - the parsed document, or undefined.
 * @returns the entries it states.
 */
function readEntries(parsed: unknown): Map<string, MaterializedEntry> {
  const entries = new Map<string, MaterializedEntry>()
  if (typeof parsed !== 'object' || parsed === null) return entries
  const sessions = (parsed as { sessions?: unknown }).sessions
  if (typeof sessions !== 'object' || sessions === null) return entries
  for (const [sessionId, value] of Object.entries(sessions as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue
    const candidate = value as Partial<MaterializedEntry>
    if (typeof candidate.machineName !== 'string') continue
    entries.set(sessionId, {
      machineName: candidate.machineName,
      at: typeof candidate.at === 'number' ? candidate.at : 0,
      events: typeof candidate.events === 'number' ? candidate.events : 0,
      ...(typeof candidate.stopped === 'string' ? { stopped: candidate.stopped } : {}),
    })
  }
  return entries
}
