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

/**
 * Hard ceiling on the raised retention a caller may ask for.
 *
 * Materializing a long Session has to hold its whole log at once, and a real one
 * on this deployment was 11,836 events. This is the bound that keeps "hold the
 * history" from becoming "let a caller decide how much memory this process uses":
 * a Session that needs more than this is refused by the writer rather than
 * buffered without limit.
 */
const RETAIN_LIMIT = 40_000

/**
 * Events one transcript page carries by default.
 *
 * A conversation reads from its newest end, so a page comfortably longer than a
 * screenful of turns is all a switch needs; anything older is one request away.
 * Long enough that a normal Session arrives whole, short enough that the worst
 * case stops being the mirror's whole 4,000-event window.
 */
const TRANSCRIPT_WINDOW = 400

/** Upper bound on commands held for a machine whose origin stream is down. */
const PENDING_LIMIT = 32

/** Upper bound on retained command states per machine, newest kept. */
const STATUS_LIMIT = 64

/**
 * How long the mirror waits before asking an origin to replay again.
 *
 * One ask per episode is the goal, but a snapshot can legitimately fail to close
 * a hole — the Session may have been un-published here, or the follow may have
 * ended inside the replay — and a repair that is never retried would leave the
 * mirror broken for the rest of the process's life. A bounded retry costs one
 * frame per half minute and always converges once the hole closes.
 */
const RESYNC_RETRY_MS = 30_000

/**
 * Messages one history page spans when a reader asks for older events.
 *
 * Asking is a round trip through the origin's own log and back over the wire —
 * `{kind:'older'}` down, a page read, a POST back — and an event is not a message:
 * measured here, one real Session carried roughly six events per message, so a
 * fifty-message page delivered under three hundred events. A long Session then
 * needs ten times the requests it should, each one queued behind everything else
 * that machine is publishing. The origin's own page ceiling is five hundred
 * messages, which is what materializing already asks for, so a reader asks the
 * same way and gets ten times as much per click.
 */
const OLDER_PAGE_MESSAGES = 500

/** Shortest gap between two history asks for the same Session. */
const OLDER_ASK_FLOOR_MS = 2_000

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
  /**
   * Highest sequence the owning machine says it holds, or -1 when it has not
   * said.
   *
   * The mirror's own extent cannot see a batch that never arrived *and* left no
   * trace above it — an empty mirror is the extreme case — so the origin's own
   * claim is what turns "I hold nothing" into "I am missing everything it has".
   */
  originSeq: number
  /**
   * Whether the owning machine says its own log holds history below what it
   * published.
   *
   * The mirror is a tail on purpose, so what it lacks below its own lowest
   * sequence is expected rather than broken — but a reader asking to see further
   * back has to be told whether there is further back to give, and only the
   * origin's own opening window knows that.
   */
  originHasOlder: boolean
  /**
   * A higher event ceiling for this Session, while a caller needs the history.
   *
   * The mirror is a tail by design and trims from the front at
   * {@link EVENT_LIMIT}. Materializing needs the *beginning*, so walking the
   * origin back through that cap achieved nothing: each page arrived and was
   * trimmed away again by the arrivals above it, and the low edge parked at the
   * cap with the Session looking whole but short. The ceiling is raised only by
   * an explicit caller, is capped by {@link RETAIN_LIMIT}, and is never lowered
   * by a later ordinary read.
   */
  retain?: number
}

/** The one logger method the mirror needs, so it does not own a logging seam. */
export interface MirrorLogger {
  warn(message: string): void
}

/** Where one origin's downstream commands are delivered. */
export interface OriginSink {
  send(command: DownstreamCommand): void
  /**
   * Ask the origin to re-open one Session's follow.
   *
   * Separate from {@link send} on purpose: a command waits in the pending queue
   * for a machine that is away, while a resync is worthless by the time one
   * comes back — the reconnect replays every snapshot on its own.
   */
  resync(sessionId: string): void
  /**
   * Ask the origin for a page of history from behind the mirror's window.
   *
   * Also not queued, and for a stronger reason than the resync: a page read for
   * a reader who has since looked away is work nobody wants.
   *
   * `throughSeq` is the mirror's *lowest held* sequence, and it is inclusive
   * because that is what "the page below what I hold" means to the reader asking.
   * The origin's own `page(beforeSeq)` is an exclusive bound, so the translation
   * happens once, in the origin's `pullOlder` — asking for one below the edge
   * (the mirror's old habit) left the edge's own event missing, one per page.
   * @param sessionId - the Session to read history for.
   * @param throughSeq - the reader's lowest held sequence; the page ends here.
   * @param maxMessages - how many messages the page should span, at most.
   */
  older(sessionId: string, throughSeq: number, maxMessages: number): void
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
  /** Sessions whose mirror is incomplete, and when the origin was last asked. */
  private readonly gapAsked = new Map<string, number>()
  /** Sessions whose history was last asked for, and when. */
  private readonly olderAsked = new Map<string, number>()

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
   * Older-history asks that arrived while their origin's stream was down.
   *
   * Keyed by machine and Session: a second ask for the same page replaces the
   * first, because asking twice for the same thing is the same request.
   */
  private readonly pendingOlder = new Map<string, { machineName: string; sessionId: string; throughSeq: number; maxMessages: number }>()

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
          originSeq: reported(session.lastSeq),
          originHasOlder: session.hasOlder === true,
        })
        continue
      }
      existing.title = session.title
      existing.updatedAt = session.updatedAt
      existing.running = session.running
      existing.originSeq = reported(session.lastSeq)
      existing.originHasOlder = session.hasOlder === true
      if (session.cwd === undefined) delete existing.cwd
      else existing.cwd = session.cwd
    }
    for (const sessionId of [...record.sessions.keys()]) {
      if (seen.has(sessionId)) continue
      record.sessions.delete(sessionId)
      // The Session is gone, so its episode is over: a later publish of the same
      // id starts one from scratch rather than inheriting a spent retry window.
      this.gapAsked.delete(`${record.machineName}|${sessionId}`)
    }
    // The index is where an origin states its extent, so it can be the only
    // thing that reveals an empty mirror. Detect here, and let the periodic
    // sweep keep asking while the shortfall lasts.
    for (const session of record.sessions.values()) this.reportGap(record, session)
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
      this.reportGap(record, session)
      return
    }
    fresh.sort((left, right) => left.seq - right.seq)
    session.events.push(...fresh)
    // A late batch belongs where its sequence says, not at the end: the
    // transcript is rendered in this order.
    session.events.sort((left, right) => left.seq - right.seq)
    const ceiling = session.retain ?? EVENT_LIMIT
    if (session.events.length > ceiling) {
      for (const dropped of session.events.splice(0, session.events.length - ceiling)) {
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
    this.reportGap(record, session)
  }

  /**
   * Ask again about every mirror that is still incomplete.
   *
   * Detection otherwise rides on arriving batches, and a lost batch is exactly
   * the case where nothing else arrives to trigger it: the first ask would be
   * the only one, and a replay that failed to close the hole would never be
   * repeated. The periodic pass over the mirror is where the retry belongs, so
   * it costs one walk and one frame per half minute while something is broken,
   * and nothing at all while the mirror is whole.
   */
  sweepGaps(): void {
    for (const record of this.records.values()) {
      for (const session of record.sessions.values()) this.reportGap(record, session)
    }
  }

  /**
   * Name an incomplete mirror, and ask its origin to replay.
   *
   * An incomplete mirror used to be invisible from both ends: the origin
   * believed it had published, the mirror believed it had received, and the only
   * symptom was a conversation that stopped mid-sentence — which read as a
   * display problem for as long as it took to decode the origin's own session
   * file and compare. Now the shortfall is O(1) from the record, the origin is
   * asked to re-open its follow, and a replayed snapshot closes it because
   * membership decides what is new.
   *
   * The ask is repeated on a slow timer for as long as the shortfall survives, and
   * said out loud once per episode. A machine that is away needs neither: its
   * reconnect replays every follow by itself.
   * @param record - the owning machine, which is where the ask goes.
   * @param session - the record just updated.
   */
  private reportGap(record: MachineRecord, session: SessionRecord): void {
    const missing = missingOf(session)
    const key = `${record.machineName}|${session.sessionId}`
    const now = Date.now()
    if (missing <= 0) {
      this.gapAsked.delete(key)
      return
    }
    const asked = this.gapAsked.get(key)
    if (asked !== undefined && now - asked < RESYNC_RETRY_MS) return
    this.gapAsked.set(key, now)
    if (asked === undefined) {
      this.logger?.warn(
        `dsh-session-sync: mirror for "${session.sessionId}" on "${record.machineName}" is missing `
        + `${String(missing)} event(s): it holds up to seq ${String(session.maxSeq)}, the origin `
        + `reports ${String(session.originSeq)}; asked that machine to replay the Session`,
      )
    }
    record.origin?.resync(session.sessionId)
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
    // Asks that arrived while this stream was down go out first: they are what a
    // reader or a backfill is waiting on.
    this.flushPendingOlder(machineName)
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
   * Read one page of a mirrored Session's retained transcript.
   *
   * The newest end, because that is the end a reader is at: the whole window is
   * megabytes for a long Session, and a console that must transfer all of it to
   * show the last exchange is a console that feels slow for no reason. `before`
   * walks older, one page at a time, and `hasMore` says whether it is worth it.
   * @param machineName - owning machine.
   * @param sessionId - published Session.
   * @param page - page size, the exclusive upper sequence to read below, how much
   *   history to retain while this caller works, and whether to drop that hold.
   * @returns the page, or undefined when the mirror holds no such Session.
   */
  transcript(
    machineName: string,
    sessionId: string,
    page: { limit: number; before?: number; retain?: number; release?: boolean } = { limit: TRANSCRIPT_WINDOW },
  ): MirrorTranscript | undefined {
    const record = this.records.get(machineName)
    const session = record?.sessions.get(sessionId)
    if (record === undefined || session === undefined) return undefined
    // Raise the ceiling before the page is read, so what this caller is about to
    // ask for is not trimmed away by the time it arrives. Never lowered by
    // implication: an ordinary read must not shrink what a backfill is holding.
    if (page.release === true) session.retain = undefined
    if (page.retain !== undefined) {
      session.retain = Math.min(Math.max(session.retain ?? EVENT_LIMIT, page.retain), RETAIN_LIMIT)
    }
    // Held in sequence order, so the window's start is a slice index rather than
    // a search — and a `before` that lands inside the window is where paging
    // overlaps and cannot silently skip a row.
    const before = page.before
    const end = before === undefined
      ? session.events.length
      : session.events.findIndex(event => event.seq >= before)
    const stop = end < 0 ? session.events.length : end
    // A page cannot be larger than what this Session is willing to hold: clamping
    // to the default cap instead of the held ceiling would return the newest
    // 4,000 of a 12,000-event window and look, from the caller's side, exactly
    // like a backfill that never advanced.
    const size = Math.min(Math.max(1, page.limit), session.retain ?? EVENT_LIMIT)
    const start = Math.max(0, stop - size)
    // Two different reasons older history exists, and a reader deserves both:
    // the mirror holds more below this page, or the Session began before the
    // mirror's window did.
    const originHasOlder = session.originHasOlder
    // Asking is what a reader does by scrolling up, so it happens only when the
    // request actually reached past the mirror's edge. The origin reads its own
    // log for it, which is worth doing once and not per click.
    if (start === 0 && before !== undefined && originHasOlder) {
      const now = Date.now()
      const asked = this.olderAsked.get(`${machineName}|${sessionId}`)
      if (asked === undefined || now - asked >= OLDER_ASK_FLOOR_MS) {
        this.olderAsked.set(`${machineName}|${sessionId}`, now)
        // The reader's window now begins at `before`, so that is the page's last
        // event, not the one beneath it.
        record.origin?.older(sessionId, before, OLDER_PAGE_MESSAGES)
      }
    }
    return {
      machineName,
      sessionId,
      events: session.events.slice(start, stop),
      running: session.running,
      hasMore: start > 0 || originHasOlder,
    }
  }

  /**
   * Ask the origin for the page below one sequence, without reading a window.
   *
   * {@link SyncHub.transcript} asks as a side effect of a reader reaching the
   * mirror's lower edge, and it is rate-limited because a reader asks once per
   * scroll. Materializing is not reading: it needs the Session's *beginning*, so
   * it asks directly and in the largest pages the origin serves.
   * @param machineName - owning machine.
   * @param sessionId - published Session.
   * @param throughSeq - the lowest sequence the mirror holds; the page ends here.
   * @param maxMessages - how many messages the origin should page back over.
   * @returns whether there was an origin to ask.
   */
  askOlder(machineName: string, sessionId: string, throughSeq: number, maxMessages: number): boolean {
    const record = this.records.get(machineName)
    if (record?.sessions.get(sessionId) === undefined) return false
    // The origin's downstream stream reconnects on its own schedule, so it is
    // absent often enough to matter. An ask made in that window is held rather
    // than dropped: a reader that scrolls up while the stream is down would
    // otherwise get nothing, and a backfill would give up on its first round.
    if (record.origin === undefined) {
      this.pendingOlder.set(`${machineName}|${sessionId}`, { machineName, sessionId, throughSeq, maxMessages })
      return true
    }
    record.origin.older(sessionId, throughSeq, maxMessages)
    return true
  }

  /** Deliver the older-history asks that waited for an origin to attach. */
  private flushPendingOlder(machineName: string): void {
    for (const [key, ask] of [...this.pendingOlder]) {
      if (ask.machineName !== machineName) continue
      this.pendingOlder.delete(key)
      this.records.get(machineName)?.origin?.older(ask.sessionId, ask.throughSeq, ask.maxMessages)
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
      originSeq: -1,
      originHasOlder: false,
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
    missingEvents: missingOf(session),
  }
}

/**
 * How many events one mirror is short of what its origin holds.
 *
 * Two things can be missing, and they are counted separately because only the
 * first is visible from the events themselves:
 *
 *  - holes *inside* the held range, which a replacement window or an out-of-order
 *    arrival can leave, and which the retained run's extent reveals; and
 *  - everything above the highest sequence held, up to the watermark the origin
 *    states in its index. Nothing below the top says that a run never arrived —
 *    an empty mirror is the extreme case of that — so without the stated
 *    watermark a mirror that lost everything is indistinguishable from one whose
 *    Session has simply done nothing yet.
 *
 * Zero is the healthy answer, and the only one that clears an episode.
 * @param session - the record to measure.
 * @returns the count of events the origin has and this mirror does not.
 */
function missingOf(session: SessionRecord): number {
  const lowest = session.events[0]?.seq
  const holes = lowest === undefined
    ? 0
    : Math.max(0, session.maxSeq - lowest + 1 - session.seqs.size)
  const behind = Math.max(0, session.originSeq - session.maxSeq)
  return holes + behind
}

/** Read an origin's stated watermark, which is never a negative claim. */
function reported(value: number | undefined): number {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : -1
}

/** Mint one opaque identity. */
function mintId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
