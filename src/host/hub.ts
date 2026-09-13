/**
 * The server-side mirror: what every connected origin has published, plus the
 * fan-out to browsers watching it.
 *
 * State is deliberately in-memory. A sync server is a live view of sessions that
 * are still running somewhere else; persisting a mirror would mean serving a
 * stale copy as if it were current, and the durable copy already exists on the
 * origin machine.
 */
import {
  OFFLINE_AFTER_MS,
  type DownstreamCommand,
  type MirrorEvent,
  type MirrorTranscript,
  type MirroredMachine,
  type MirroredSession,
  type PublishFramesPayload,
  type PublishIndexPayload,
  type SyncStreamFrame,
} from '../shared/protocol.ts'

/** Upper bound on the events retained per mirrored Session. */
const EVENT_LIMIT = 4_000

/** One mirrored Session. */
interface SessionRecord {
  sessionId: string
  title: string
  updatedAt: number
  running: boolean
  cwd?: string
  events: MirrorEvent[]
  /** Highest accepted sequence, so a re-published window cannot duplicate history. */
  maxSeq: number
}

/** Where one origin's downstream commands are delivered. */
export interface OriginSink {
  send(command: DownstreamCommand): void
}

/** One browser watching the mirror. */
export interface BrowserSink {
  send(frame: SyncStreamFrame): void
}

/** One machine's mirror. */
interface MachineRecord {
  machineName: string
  readonly sessions: Map<string, SessionRecord>
  lastSeen: number
  origin?: OriginSink
  /** Commands issued while no origin stream was attached. */
  readonly pending: DownstreamCommand[]
}

/** The server-role mirror and its subscribers. */
export class SyncHub {
  private readonly records = new Map<string, MachineRecord>()

  /**
   * @param notify - receives every frame the mirror produces. The owner decides
   *   who is watching, because the same browser stream also carries client-role
   *   status in a process that is not acting as a server at all.
   * @param stateOf - builds the complete browser-facing state. The mirror only
   *   knows the machine list; role, listener, and link facts belong to the
   *   engine. The engine's owner is the one place that can see both, so a state
   *   frame is always assembled there — publishing a partial object here would
   *   silently blank every field this class does not own.
   */
  constructor(
    private readonly notify: (frame: SyncStreamFrame) => void,
    private readonly stateOf: () => SyncState,
  ) {}

  /**
   * Replace one machine's Session index.
   * A Session that disappears from the index is dropped with its events, which
   * is what "stopped syncing" means from here. Because disappearance is the
   * only reset, an origin never has to ask for one — and a fresh record always
   * starts at sequence -1, so a re-enabled Session refills from its own opening
   * snapshot without duplicating anything.
   * @param payload - the machine's current published Session list.
   */
  publishIndex(payload: PublishIndexPayload): void {
    const record = this.machine(payload.machineName)
    record.lastSeen = Date.now()
    const seen = new Set<string>()
    for (const session of payload.sessions) {
      seen.add(session.sessionId)
      const existing = record.sessions.get(session.sessionId)
      if (existing === undefined) {
        record.sessions.set(session.sessionId, {
          sessionId: session.sessionId,
          title: session.title,
          updatedAt: session.updatedAt,
          running: session.running,
          ...(session.cwd === undefined ? {} : { cwd: session.cwd }),
          events: [],
          maxSeq: -1,
        })
        continue
      }
      existing.title = session.title
      existing.updatedAt = session.updatedAt
      existing.running = session.running
      if (session.cwd === undefined) delete existing.cwd
      else existing.cwd = session.cwd
    }
    for (const sessionId of [...record.sessions.keys()]) {
      if (!seen.has(sessionId)) record.sessions.delete(sessionId)
    }
    this.broadcastState()
  }

  /**
   * Append durable events to one mirrored Session, dropping any the mirror
   * already holds so a reconnect that replays a window stays idempotent.
   * @param machineName - publishing machine.
   * @param payload - the Session id and its new events.
   */
  publishFrames(machineName: string, payload: PublishFramesPayload): void {
    const record = this.machine(machineName)
    record.lastSeen = Date.now()
    const session = record.sessions.get(payload.sessionId)
    if (session === undefined) return
    const fresh = payload.events.filter(event => event.seq > session.maxSeq)
    if (fresh.length === 0) return
    session.events.push(...fresh)
    if (session.events.length > EVENT_LIMIT) {
      session.events.splice(0, session.events.length - EVENT_LIMIT)
    }
    session.maxSeq = fresh.reduce((highest, event) => Math.max(highest, event.seq), session.maxSeq)
    session.updatedAt = Date.now()
    this.broadcast({
      type: 'events',
      machineName,
      sessionId: payload.sessionId,
      events: fresh,
    })
  }

  /**
   * Attach one origin's downstream stream and flush what queued while it was away.
   * @param machineName - the connecting machine.
   * @param sink - where commands are written.
   * @returns the detacher, which also drops any command the origin never read.
   */
  attachOrigin(machineName: string, sink: OriginSink): () => void {
    const record = this.machine(machineName)
    record.lastSeen = Date.now()
    record.origin = sink
    const queued = record.pending.splice(0, record.pending.length)
    for (const command of queued) sink.send(command)
    this.broadcastState()
    return () => {
      if (record.origin !== sink) return
      delete record.origin
      this.broadcastState()
    }
  }

  /**
   * Queue one takeover prompt for a published Session.
   * @param machineName - the machine that owns the Session.
   * @param sessionId - the published Session.
   * @param text - the prompt text.
   * @param from - the requesting machine's display name.
   * @returns whether the command was accepted, or why not.
   */
  submitCommand(
    machineName: string,
    sessionId: string,
    text: string,
    from: string,
  ): { ok: true } | { ok: false; reason: string } {
    const record = this.records.get(machineName)
    if (record === undefined) return { ok: false, reason: 'unknown machine' }
    if (!record.sessions.has(sessionId)) return { ok: false, reason: 'session is not published' }
    const trimmed = text.trim()
    if (trimmed === '') return { ok: false, reason: 'empty prompt' }
    const command: DownstreamCommand = {
      commandId: mintId(),
      sessionId,
      kind: 'prompt',
      text: trimmed,
      from,
    }
    if (record.origin === undefined) record.pending.push(command)
    else record.origin.send(command)
    return { ok: true }
  }

  /**
   * Every machine the mirror knows, newest activity first within the list.
   * @returns the presentation view of the mirror.
   */
  machines(): MirroredMachine[] {
    const now = Date.now()
    return [...this.records.values()]
      .map(record => ({
        machineName: record.machineName,
        online: record.origin !== undefined || now - record.lastSeen < OFFLINE_AFTER_MS,
        lastSeen: record.lastSeen,
        sessions: [...record.sessions.values()]
          .map(session => summary(session))
          .sort((left, right) => right.updatedAt - left.updatedAt),
      }))
      .sort((left, right) => right.lastSeen - left.lastSeen)
  }

  /**
   * Read one mirrored Session's retained transcript.
   * @param machineName - owning machine.
   * @param sessionId - published Session.
   * @returns the transcript, or undefined when the mirror holds no such Session.
   */
  transcript(machineName: string, sessionId: string): MirrorTranscript | undefined {
    const session = this.records.get(machineName)?.sessions.get(sessionId)
    if (session === undefined) return undefined
    return {
      machineName,
      sessionId,
      events: [...session.events],
      running: session.running,
    }
  }

  /** Push the current view to every browser (used when the wire reconnects). */
  refresh(): void {
    this.broadcastState()
  }

  /** Emit one complete state frame, assembled by the engine that owns it. */
  private broadcastState(): void {
    this.broadcast({ type: 'state', state: this.stateOf() })
  }

  private machine(machineName: string): MachineRecord {
    const existing = this.records.get(machineName)
    if (existing !== undefined) return existing
    const created: MachineRecord = { machineName, sessions: new Map(), lastSeen: Date.now(), pending: [] }
    this.records.set(machineName, created)
    return created
  }

  private broadcast(frame: SyncStreamFrame): void {
    this.notify(frame)
  }
}

/** Project one record onto its presentation row. */
function summary(session: SessionRecord): MirroredSession {
  return {
    sessionId: session.sessionId,
    title: session.title,
    updatedAt: session.updatedAt,
    running: session.running,
    ...(session.cwd === undefined ? {} : { cwd: session.cwd }),
    eventCount: session.events.length,
  }
}

/** Mint one opaque identity. */
function mintId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
