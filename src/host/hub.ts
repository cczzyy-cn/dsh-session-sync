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
  COMMAND_TTL_MS,
  OFFLINE_AFTER_MS,
  type CommandAckPayload,
  type CommandState,
  type CommandStatus,
  type DownstreamCommand,
  type MirrorEvent,
  type MirrorTranscript,
  type MirroredMachine,
  type MirroredSession,
  type PublishFramesPayload,
  type PublishIndexPayload,
  type StreamDeltaPayload,
  type SyncState,
  type SyncStreamFrame,
} from '../shared/protocol.ts'

/** Upper bound on the events retained per mirrored Session. */
const EVENT_LIMIT = 4_000

/** Upper bound on commands held for a machine whose origin stream is down. */
const PENDING_LIMIT = 32

/** Upper bound on retained command states per machine, newest kept. */
const STATUS_LIMIT = 64

/** States a command never leaves; the expiry sweep and acks ignore these. */
const TERMINAL_STATES: readonly CommandState[] = ['accepted', 'failed', 'expired']

/** One mirrored Session. */
interface SessionRecord {
  sessionId: string
  title: string
  updatedAt: number
  running: boolean
  cwd?: string
  events: MirrorEvent[]
  /**
   * Every sequence this Session's events currently hold, one entry per event.
   *
   * Membership is what decides whether an arriving event is new. A high-water
   * mark cannot decide that: "nothing at or below the newest sequence I hold is
   * new" is true of a replay, and equally true of a run that never arrived, so
   * the two are indistinguishable to it.
   */
  readonly seqs: Set<number>
  /** Highest sequence ever accepted; with `events[0]` it is the whole extent. */
  maxSeq: number
}

/** The one logger method the mirror needs, so it does not own a logging seam. */
export interface MirrorLogger {
  warn(message: string): void
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
  /** Every command this machine was sent, by id, so an ack can retire it. */
  readonly commands: Map<string, CommandStatus>
}

/** The server-role mirror and its subscribers. */
export class SyncHub {
  private readonly records = new Map<string, MachineRecord>()
  /** Sessions whose mirror has already been reported as incomplete. */
  private readonly gapReported = new Set<string>()

  /**
   * @param notify - receives every frame the mirror produces. The owner decides
   *   who is watching, because the same browser stream also carries client-role
   *   status in a process that is not acting as a server at all.
   * @param stateOf - builds the complete browser-facing state. The mirror only
   *   knows the machine list; role, listener, and link facts belong to the
   *   engine. The engine's owner is the one place that can see both, so a state
   *   frame is always assembled there — publishing a partial object here would
   *   silently blank every field this class does not own.
   * @param logger - where an incomplete mirror is reported. Optional so a test
   *   or a headless composition can build a hub that says nothing.
   */
  constructor(
    private readonly notify: (frame: SyncStreamFrame) => void,
    private readonly stateOf: () => SyncState,
    private readonly logger?: MirrorLogger,
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
          seqs: new Set<number>(),
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
   * Relay one streaming update. Nothing is stored: streaming is presentation,
   * and the durable events that follow are what the mirror keeps.
   * @param machineName - the publishing machine.
   * @param payload - the step's whole text so far for one kind.
   */
  publishStream(machineName: string, payload: StreamDeltaPayload): void {
    const record = this.records.get(machineName)
    if (record === undefined) return
    record.lastSeen = Date.now()
    this.broadcast({
      type: 'stream',
      machineName,
      sessionId: payload.sessionId,
      turn: payload.turn,
      step: payload.step,
      kind: payload.kind,
      text: payload.text,
    })
  }

  /**
   * Append durable events to one mirrored Session, dropping only what the
   * mirror already holds so a reconnect that replays a window stays idempotent.
   *
   * The Session is created when the index has not listed it yet. A reconnect
   * restarts the origin's follows immediately while its index waits for the
   * next reconcile tick, so a replayed snapshot routinely arrives first;
   * dropping it left an idle Session with an empty transcript until something
   * happened to re-open its follow. The index publish that follows corrects the
   * placeholder's title, and a Session the origin really did stop publishing is
   * removed by that same publish.
   *
   * Dedupe is by membership, never by a high-water mark. The origin flushes
   * batches on a 150 ms timer and the posts were unordered, so a later batch
   * could land first; against a high-water mark that discarded the earlier batch
   * in full — nine contiguous events in one real Session, and the mirror could
   * never be repaired afterwards, because filling a hole means accepting a
   * sequence below the mark. Order of arrival is now irrelevant, and a replay
   * fills whatever a lost batch left behind.
   * @param machineName - publishing machine.
   * @param payload - the Session id and its new events.
   */
  publishFrames(machineName: string, payload: PublishFramesPayload): void {
    const record = this.machine(machineName)
    record.lastSeen = Date.now()
    const session = this.session(record, payload.sessionId)
    const fresh: MirrorEvent[] = []
    for (const event of payload.events) {
      if (session.seqs.has(event.seq)) continue
      session.seqs.add(event.seq)
      fresh.push(event)
    }
    if (fresh.length === 0) {
      this.reportGap(machineName, session)
      return
    }
    fresh.sort((left, right) => left.seq - right.seq)
    session.events.push(...fresh)
    // A late batch belongs where its sequence says, not at the end: the
    // transcript is rendered in this order.
    session.events.sort((left, right) => left.seq - right.seq)
    if (session.events.length > EVENT_LIMIT) {
      for (const dropped of session.events.splice(0, session.events.length - EVENT_LIMIT)) {
        session.seqs.delete(dropped.seq)
      }
    }
    session.maxSeq = fresh.reduce((highest, event) => Math.max(highest, event.seq), session.maxSeq)
    session.updatedAt = Date.now()
    this.broadcast({
      type: 'events',
      machineName,
      sessionId: payload.sessionId,
      events: fresh,
    })
    this.reportGap(machineName, session)
  }

  /**
   * Say so when the mirror is not holding a contiguous run.
   *
   * A hole used to be invisible from both ends: the origin believed it had
   * published, the mirror believed it had received, and the only symptom was a
   * conversation that stopped mid-sentence — which read as a display problem
   * for as long as it took to decode the origin's own session file and compare.
   * The extent is O(1) to compute from the record, so it is checked per batch,
   * and one line is emitted per episode rather than per batch.
   * @param machineName - owning machine, for the message.
   * @param session - the record just updated.
   */
  private reportGap(machineName: string, session: SessionRecord): void {
    const lowest = session.events[0]?.seq
    if (lowest === undefined) return
    const missing = session.maxSeq - lowest + 1 - session.seqs.size
    const key = `${machineName}|${session.sessionId}`
    if (missing <= 0) {
      this.gapReported.delete(key)
      return
    }
    if (this.gapReported.has(key)) return
    this.gapReported.add(key)
    this.logger?.warn(
      `dsh-session-sync: mirror for "${session.sessionId}" on "${machineName}" is missing `
      + `${String(missing)} event(s) between seq ${String(lowest)} and ${String(session.maxSeq)}; `
      + 'only re-publishing the Session clears it',
    )
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
    const now = Date.now()
    const queued = record.pending.splice(0, record.pending.length)
    for (const command of queued) {
      // A command that outlived its TTL while the machine was away is reported
      // as expired rather than delivered late: the human who typed it has long
      // stopped watching for it, and the Session has moved on.
      if (command.expiresAt <= now) {
        this.transition(record, command, 'expired')
        continue
      }
      sink.send(command)
      this.transition(record, command, 'delivered')
    }
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
   * @returns the accepted command's id, or why it was refused.
   */
  submitCommand(
    machineName: string,
    sessionId: string,
    text: string,
    from: string,
  ): { ok: true; commandId: string } | { ok: false; reason: string } {
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
      expiresAt: Date.now() + COMMAND_TTL_MS,
    }
    if (record.origin === undefined) {
      record.pending.push(command)
      this.transition(record, command, 'queued')
      if (record.pending.length > PENDING_LIMIT) {
        // Bounded so a machine that never comes back cannot grow the server's
        // memory, and honest about what it dropped.
        for (const dropped of record.pending.splice(0, record.pending.length - PENDING_LIMIT)) {
          this.transition(record, dropped, 'expired', 'the queue for this machine was full')
        }
      }
    } else {
      record.origin.send(command)
      this.transition(record, command, 'delivered')
    }
    return { ok: true, commandId: command.commandId }
  }

  /**
   * Retire one command with the owning machine's own outcome.
   * @param machineName - the machine that answered.
   * @param payload - the command id and whether it was admitted.
   */
  ackCommand(machineName: string, payload: CommandAckPayload): void {
    const record = this.records.get(machineName)
    if (record === undefined) return
    // An ack is proof of life, so the machine stops looking offline at once.
    record.lastSeen = Date.now()
    const status = record.commands.get(payload.commandId)
    if (status === undefined) return
    if (TERMINAL_STATES.includes(status.state)) return
    if (payload.ok) this.transition(record, status, 'accepted')
    else this.transition(record, status, 'failed', payload.error ?? 'the owning machine refused the prompt')
  }

  /**
   * Retire every command that outlived its TTL, queued or already sent.
   *
   * A command written to an origin's stream is not confirmed by that write: if
   * the link died in the same instant, nothing else would ever move it out of
   * `delivered`. The origin refuses an expired prompt on its own, so this is the
   * server's half of the same rule, and the half that tells the browser.
   */
  expireCommands(): void {
    const now = Date.now()
    for (const record of this.records.values()) {
      for (const status of [...record.commands.values()]) {
        if (TERMINAL_STATES.includes(status.state)) continue
        if (status.expiresAt > now) continue
        this.transition(record, status, 'expired')
      }
      const kept = record.pending.filter(command => command.expiresAt > now)
      if (kept.length !== record.pending.length) {
        record.pending.length = 0
        record.pending.push(...kept)
      }
    }
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
    const created: MachineRecord = {
      machineName,
      sessions: new Map(),
      lastSeen: Date.now(),
      pending: [],
      commands: new Map(),
    }
    this.records.set(machineName, created)
    return created
  }

  /**
   * Read one mirrored Session, creating its placeholder when frames arrive
   * before the index that names it.
   * @param record - the owning machine.
   * @param sessionId - the Session the frames belong to.
   * @returns the record to append to.
   */
  private session(record: MachineRecord, sessionId: string): SessionRecord {
    const existing = record.sessions.get(sessionId)
    if (existing !== undefined) return existing
    const created: SessionRecord = {
      sessionId,
      // Until the index arrives the id is the only name the events came with;
      // `publishIndex` replaces it with the Session's own title.
      title: sessionId,
      updatedAt: Date.now(),
      running: false,
      events: [],
      seqs: new Set<number>(),
      maxSeq: -1,
    }
    record.sessions.set(sessionId, created)
    return created
  }

  /**
   * Move one command to a new state and tell every watching browser.
   *
   * The seed only needs the three fields every command carries, so a live
   * `DownstreamCommand`, an existing status, and a status being replaced are all
   * accepted without a second code path.
   * @param record - the owning machine.
   * @param seed - command identity, Session, and TTL.
   * @param state - the state to record.
   * @param error - optional human-readable reason.
   */
  private transition(
    record: MachineRecord,
    seed: { commandId: string; sessionId: string; expiresAt: number },
    state: CommandState,
    error?: string,
  ): void {
    const status: CommandStatus = {
      commandId: seed.commandId,
      machineName: record.machineName,
      sessionId: seed.sessionId,
      state,
      expiresAt: seed.expiresAt,
      ...(error === undefined ? {} : { error }),
      time: Date.now(),
    }
    record.commands.set(status.commandId, status)
    while (record.commands.size > STATUS_LIMIT) {
      // The map keeps insertion order and every transition re-inserts, so the
      // first key is the least recently changed command in this machine.
      const oldest = record.commands.keys().next()
      if (oldest.done === true || oldest.value === status.commandId) break
      record.commands.delete(oldest.value)
    }
    this.broadcast({ type: 'command', command: status })
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
