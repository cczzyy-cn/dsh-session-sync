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
  type ApprovalClosePayload,
  type ApprovalOpenPayload,
  type ApprovalOutcome,
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
  type QuestionClosePayload,
  type QuestionOpenPayload,
  type QuestionOutcome,
  type RelayedAnswerItem,
  type RelayedApprovalDecision,
  type RelayedApprovalView,
  type RelayedQuestionView,
  type StreamDeltaPayload,
  type SyncState,
  type SyncStreamFrame,
} from '../shared/protocol.ts'

/** Upper bound on the events retained per mirrored Session. */
const EVENT_LIMIT = 4_000

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

/**
 * How long an unacknowledged command waits before it is handed over again.
 *
 * Short, because the window this covers is the one where a write vanished into a
 * stream that was already closing — measured at roughly 300 ms — and because a
 * prompt a reader typed is worth re-offering quickly. The command's own two-minute
 * TTL is the outer bound; this is the retry cadence inside it.
 */
const RETRY_AFTER_MS = 5_000

/**
 * How many times one command may be re-sent before the hub stops trying.
 *
 * Bounded so a machine that is up but never acks cannot make the server talk to it
 * forever: after this many attempts the TTL is what ends it, and `expired` is
 * reported rather than an endless `delivered`.
 */
const MAX_RETRIES = 4

/** One command owed to a machine until it acknowledges it. */
interface PendingCommand {
  readonly command: DownstreamCommand
  /** When the machine was last handed this command; 0 while it has never been sent. */
  sentAt: number
  /** How many times it has been handed over already. */
  retries: number
}

/** Upper bound on retained command states per machine, newest kept. */
const STATUS_LIMIT = 64

/**
 * Upper bound on questions one machine may have open at the console.
 *
 * A question is a *live* ask, so this is a runaway guard and not a retention
 * policy: a machine that somehow opened a hundred would be a machine nobody is
 * answering, and the console is the wrong place to find that out.
 */
const QUESTION_LIMIT = 32

/**
 * Upper bound on approvals one machine may have open at the console.
 *
 * Lower than a question's would be if approvals were as cheap to forget: each one
 * holds a *blocked tool call* on the machine, so a machine with thirty-two of them
 * pending is a machine in trouble, and a console showing a wall of permission cards
 * is a console whose reader will start approving without reading.
 */
const APPROVAL_LIMIT = 16

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
 * messages, so a reader asks for the whole of it and gets ten times as much per
 * click.
 */
const OLDER_PAGE_MESSAGES = 500

/**
 * Messages one hole-repair page spans.
 *
 * A hole is repaired by re-reading the log around it, so the page is asked for as
 * large as the origin will serve: the whole point is to arrive at the missing run
 * in as few reads as the hole is deep.
 */
const HOLE_PAGE_MESSAGES = 500

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
  /**
   * The plugin version this machine last stated with its index.
   *
   * Reported so two halves of one deployment can be compared without reading a
   * lockfile on each: an origin keeps the Host half it loaded at start, and a
   * server keeps whatever `pnpm install` last put there.
   */
  pluginVersion?: string
  origin?: OriginSink
  /**
   * Commands this machine is owed until it acknowledges them.
   *
   * *Owed*, not merely "queued while away": a write to a stream that is already
   * dying succeeds locally and arrives nowhere, so a command handed over and never
   * acked has to stay here. That is what {@link SyncHub.retryCommands} re-sends, and
   * re-sending is only safe because the origin refuses a command id it has already
   * admitted (`RecentCommands`) — without that, a retry would prompt a Session twice.
   */
  readonly pending: PendingCommand[]
  /** Every command this machine was sent, by id, so an ack can retire it. */
  readonly commands: Map<string, CommandStatus>
  /**
   * Questions this machine relayed and the console may still answer, by id.
   *
   * Held only while they are answerable: a question is not mirrored state, and
   * the origin withdraws it the moment its own human answers. Dropping the entry
   * is therefore the normal end of one, and the console learns it from the
   * frame that carried the closure.
   */
  readonly questions: Map<string, RelayedQuestionView>
  /**
   * Approvals this machine relayed and the console may still decide, by id.
   *
   * Transient like the questions above, and for a sharper reason: an approval lives
   * only while the machine is *blocked* on it. Dropping one is the normal end, and
   * losing the map (a restart) fails closed — the operation is simply not granted
   * from here.
   */
  readonly approvals: Map<string, RelayedApprovalView>
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
   * @param timings - the two retry floors, injectable so a test does not have to
   *   wait out a production interval to see the second ask.
   */
  constructor(
    private readonly notify: (frame: SyncStreamFrame) => void,
    private readonly stateOf: () => SyncState,
    private readonly logger?: MirrorLogger,
    private readonly timings: { resyncRetryMs?: number; olderAskFloorMs?: number } = {},
  ) {}

  /** Shortest gap between two replay asks for one Session. */
  private get resyncRetryMs(): number {
    return this.timings.resyncRetryMs ?? RESYNC_RETRY_MS
  }

  /** Shortest gap between two reader-driven history asks for one Session. */
  private get olderAskFloorMs(): number {
    return this.timings.olderAskFloorMs ?? OLDER_ASK_FLOOR_MS
  }

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
    // Replaced, never merged: an origin that stopped stating a version must not
    // keep looking like the build it used to be.
    if (payload.pluginVersion === undefined) delete record.pluginVersion
    else record.pluginVersion = payload.pluginVersion
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
    const ceiling = EVENT_LIMIT
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
    if (asked !== undefined && now - asked < this.resyncRetryMs) return
    this.gapAsked.set(key, now)
    // The replay ask fills a window, which reaches what is behind and what is near
    // the top. A hole *below* the window is not reachable that way — the snapshot
    // replays the newest window and stops — so each one is asked for as a page read
    // aimed at it: the page that ends at the last sequence held above the hole, read
    // from the origin's own log. Both asks travel the same downstream stream, and
    // both are idempotent at the mirror (membership decides what is new).
    const holes = holesOf(session)
    for (const hole of holes) {
      // `throughSeq` is inclusive and the page it asks for ends there, so the value
      // is the hole's own first sequence: the origin reads strictly below one past
      // it, which is the run itself. Naming the sequence *below* the hole (the
      // obvious-looking `hole.from - 1`) asks for a page that ends before the hole
      // starts and repairs nothing — the ask looks right and the mirror never
      // becomes whole, which is exactly what the end-to-end test caught.
      record.origin?.older(session.sessionId, hole.from, HOLE_PAGE_MESSAGES)
    }
    if (asked === undefined) {
      this.logger?.warn(
        `dsh-session-sync: mirror for "${session.sessionId}" on "${record.machineName}" is missing `
        + `${String(missing)} event(s): it holds up to seq ${String(session.maxSeq)}, the origin `
        + `reports ${String(session.originSeq)}`
        + (holes.length === 0
          ? '; asked that machine to replay the Session'
          : `; asked for ${String(holes.length)} hole page(s) and a replay`),
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
    for (const owed of queued) {
      // A command that outlived its TTL while the machine was away is reported
      // as expired rather than delivered late: the human who typed it has long
      // stopped watching for it, and the Session has moved on.
      if (owed.command.expiresAt <= now) {
        this.transition(record, owed.command, 'expired')
        continue
      }
      // Re-sent even if a previous stream was handed it: that stream may have died
      // with the write inside it, and the origin dedups by command id.
      this.handOver(record, owed)
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
    return this.enqueue(record, {
      commandId: mintId(),
      sessionId,
      kind: 'prompt',
      text: trimmed,
      from,
      expiresAt: Date.now() + COMMAND_TTL_MS,
    })
  }

  /**
   * Queue the console's answer to one question a machine relayed.
   *
   * An answer rides the prompt lifecycle rather than a channel of its own
   * because it needs exactly what a prompt needs: held while the machine is
   * away, one delivery, a TTL, and an ack that says whether the machine
   * *claimed* it. That last part is the whole feature — the machine claims an
   * answer only while the question is still pending there, so a console that
   * answered after the machine's own human did gets `failed` with the reason,
   * which is the truthful outcome of a race that has already been decided.
   * @param machineName - the machine that asked.
   * @param questionId - the question being answered.
   * @param answers - the console's answers.
   * @param from - the answering console's display name.
   * @returns the accepted command's id, or why it was refused.
   */
  submitAnswer(
    machineName: string,
    questionId: string,
    answers: readonly RelayedAnswerItem[],
    from: string,
  ): { ok: true; commandId: string } | { ok: false; reason: string } {
    const record = this.records.get(machineName)
    if (record === undefined) return { ok: false, reason: 'unknown machine' }
    const question = record.questions.get(questionId)
    if (question === undefined) {
      return { ok: false, reason: 'this question is no longer waiting' }
    }
    if (answers.length === 0) return { ok: false, reason: 'an answer must decide something' }
    return this.enqueue(record, {
      commandId: mintId(),
      sessionId: question.sessionId,
      kind: 'answer',
      questionId,
      answers: answers.map(answer => ({
        id: answer.id,
        selected: [...answer.selected],
        ...(answer.custom === undefined ? {} : { custom: answer.custom }),
      })),
      from,
      expiresAt: Date.now() + COMMAND_TTL_MS,
    })
  }

  /**
   * Hold one command for a machine and say where it stands.
   * @param record - the owning machine.
   * @param command - the command to deliver or park.
   * @returns the accepted command's id.
   */
  private enqueue(record: MachineRecord, command: DownstreamCommand): { ok: true; commandId: string } {
    const owed: PendingCommand = { command, sentAt: 0, retries: 0 }
    // Queued in both branches: the entry is what the machine is *owed*, and only an
    // ack retires it. A command that was written into a dying stream and never
    // arrived therefore stays owed, and `retryCommands` hands it over again.
    record.pending.push(owed)
    if (record.origin === undefined) {
      this.transition(record, command, 'queued')
    } else {
      this.handOver(record, owed)
    }
    if (record.pending.length > PENDING_LIMIT) {
      // Bounded so a machine that never comes back cannot grow the server's
      // memory, and honest about what it dropped.
      for (const dropped of record.pending.splice(0, record.pending.length - PENDING_LIMIT)) {
        this.transition(record, dropped.command, 'expired', 'the queue for this machine was full')
      }
    }
    return { ok: true, commandId: command.commandId }
  }

  /**
   * Hand one owed command to the machine's stream and record that it went.
   *
   * The write is not proof of arrival — a stream that is closing accepts it locally
   * — so this only marks the attempt. What makes the attempt safe to repeat is the
   * origin's `RecentCommands`: it acks a command id it has already admitted without
   * acting on it twice.
   * @param record - the machine that is owed the command.
   * @param owed - the command and its delivery bookkeeping.
   */
  private handOver(record: MachineRecord, owed: PendingCommand): void {
    const origin = record.origin
    if (origin === undefined) return
    origin.send(owed.command)
    owed.sentAt = Date.now()
    owed.retries += 1
    this.transition(record, owed.command, 'delivered', undefined, owed.retries - 1)
  }

  /**
   * Hand over again every command a machine has not acknowledged.
   *
   * This is the half of the delivery rule a write cannot provide. The other half is
   * {@link SyncHub.ackCommand}: a command is owed until the machine says it acted on
   * it, so a write lost inside a closing stream is repaired on the next pass instead
   * of being recorded as delivered and forgotten.
   * @param now - the clock, injectable so a test can age a command without waiting.
   */
  retryCommands(now: number = Date.now()): void {
    for (const record of this.records.values()) {
      if (record.origin === undefined) continue
      for (const owed of [...record.pending]) {
        if (owed.sentAt === 0) continue
        if (owed.retries > MAX_RETRIES) continue
        if (now - owed.sentAt < RETRY_AFTER_MS) continue
        this.handOver(record, owed)
      }
    }
  }

  /**
   * Offer one relayed question to the browsers watching this server.
   * @param machineName - the machine that asked.
   * @param payload - the question, its Session, and its TTL.
   */
  openQuestion(machineName: string, payload: QuestionOpenPayload): void {
    const record = this.records.get(machineName)
    if (record === undefined) return
    record.lastSeen = Date.now()
    // A question is only answerable while its Session is published here: an
    // un-published Session has no console surface to answer it from, and the
    // origin will not accept an answer it no longer offers.
    if (!record.sessions.has(payload.sessionId)) return
    const view: RelayedQuestionView = {
      machineName,
      sessionId: payload.sessionId,
      questionId: payload.questionId,
      questions: payload.questions,
      openedAt: Date.now(),
      expiresAt: payload.expiresAt,
    }
    record.questions.set(payload.questionId, view)
    while (record.questions.size > QUESTION_LIMIT) {
      // Insertion-ordered, so the oldest ask is the one to drop; its card goes
      // away with it, and the origin is not waiting on this side anyway.
      const oldest = record.questions.keys().next()
      if (oldest.done === true || oldest.value === payload.questionId) break
      this.closeQuestion(machineName, {
        sessionId: record.questions.get(oldest.value)?.sessionId ?? payload.sessionId,
        questionId: oldest.value,
        outcome: 'expired',
      })
    }
    this.broadcast({ type: 'question', question: view })
  }

  /**
   * Stop offering one question, and tell every watching browser why.
   * @param machineName - the machine that asked.
   * @param payload - the question and the outcome to report.
   */
  closeQuestion(machineName: string, payload: QuestionClosePayload): void {
    const record = this.records.get(machineName)
    const view = record?.questions.get(payload.questionId)
    if (record === undefined || view === undefined) return
    record.questions.delete(payload.questionId)
    this.broadcast({
      type: 'question',
      question: { ...view, closed: payload.outcome },
    })
    this.broadcastState()
  }

  /** Questions the console may still answer, oldest ask first. */
  questions(): RelayedQuestionView[] {
    return [...this.records.values()]
      .flatMap(record => [...record.questions.values()])
      .sort((left, right) => left.openedAt - right.openedAt)
  }

  /**
   * Retire the questions that stopped being answerable while nobody was looking.
   *
   * Run on the same periodic pass as the command sweep, and for the same reason:
   * nothing else would ever revisit them. A question outlives its usefulness two
   * ways — its TTL passes, or the machine that asked stops appearing at all — and
   * a card left on screen for either is a card offering a decision that can no
   * longer be taken.
   */
  sweepQuestions(now: number = Date.now()): void {
    for (const record of this.records.values()) {
      const offline = record.origin === undefined && now - record.lastSeen >= OFFLINE_AFTER_MS
      for (const view of [...record.questions.values()]) {
        if (view.expiresAt > now && !offline) continue
        this.closeQuestion(record.machineName, {
          sessionId: view.sessionId,
          questionId: view.questionId,
          outcome: offline ? 'offline' : 'expired',
        })
      }
    }
  }

  /**
   * Decide one relayed approval as the console, and hand the decision to the machine.
   *
   * The mirror image of {@link submitAnswer}, with one difference that matters: a
   * decision here is a *permission*. The hub does not judge it — the machine that
   * owns the call does, in `ApprovalRelay.claim`, against a request it is still
   * waiting on — so what this method guarantees is only that the console decided
   * something the server was actually offering, and that the machine's own refusal
   * comes back as a closed card rather than a stuck one.
   * @param machineName - the machine whose approval it is.
   * @param approvalId - the approval the console decided.
   * @param decision - allow once, or reject.
   * @param from - the deciding console's display name.
   * @returns the accepted command's id, or why it was refused.
   */
  submitApproval(
    machineName: string,
    approvalId: string,
    decision: RelayedApprovalDecision,
    from: string,
  ): { ok: true; commandId: string } | { ok: false; reason: string } {
    const record = this.records.get(machineName)
    if (record === undefined) return { ok: false, reason: 'unknown machine' }
    const approval = record.approvals.get(approvalId)
    if (approval === undefined) {
      return { ok: false, reason: 'this approval is no longer waiting' }
    }
    return this.enqueue(record, {
      commandId: mintId(),
      sessionId: approval.sessionId,
      kind: 'approval',
      approvalId,
      decision,
      from,
      expiresAt: Date.now() + COMMAND_TTL_MS,
    })
  }

  /**
   * Offer one relayed approval to the browsers watching this server.
   * @param machineName - the machine that is blocked on it.
   * @param payload - the approval, its Session, and its TTL.
   */
  openApproval(machineName: string, payload: ApprovalOpenPayload): void {
    const record = this.records.get(machineName)
    if (record === undefined) return
    record.lastSeen = Date.now()
    // Same rule as a question: the console can only decide an approval for a
    // Session it can see. Here it matters more — the card names a tool and resolves
    // its arguments out of the mirrored transcript, so an un-published Session would
    // offer a reader an unnamed permission over a conversation they cannot read.
    if (!record.sessions.has(payload.sessionId)) return
    const view: RelayedApprovalView = {
      machineName,
      sessionId: payload.sessionId,
      approvalId: payload.approvalId,
      approval: payload.approval,
      openedAt: Date.now(),
      expiresAt: payload.expiresAt,
    }
    record.approvals.set(payload.approvalId, view)
    while (record.approvals.size > APPROVAL_LIMIT) {
      const oldest = record.approvals.keys().next()
      if (oldest.done === true || oldest.value === payload.approvalId) break
      this.closeApproval(machineName, {
        sessionId: record.approvals.get(oldest.value)?.sessionId ?? payload.sessionId,
        approvalId: oldest.value,
        outcome: 'expired',
      })
    }
    this.broadcast({ type: 'approval', approval: view })
  }

  /**
   * Stop offering one approval, and tell every watching browser why.
   * @param machineName - the machine that asked.
   * @param payload - the approval and the outcome to report.
   */
  closeApproval(machineName: string, payload: ApprovalClosePayload): void {
    const record = this.records.get(machineName)
    const view = record?.approvals.get(payload.approvalId)
    if (record === undefined || view === undefined) return
    record.approvals.delete(payload.approvalId)
    this.broadcast({
      type: 'approval',
      approval: { ...view, closed: payload.outcome },
    })
    this.broadcastState()
  }

  /** Approvals the console may still decide, oldest offer first. */
  approvals(): RelayedApprovalView[] {
    return [...this.records.values()]
      .flatMap(record => [...record.approvals.values()])
      .sort((left, right) => left.openedAt - right.openedAt)
  }

  /**
   * Retire the approvals that stopped being decidable while nobody was looking.
   *
   * Its own sweep rather than a share of the question one, because the two expire
   * on different clocks (an approval's TTL is shorter, and the tool call behind it
   * is blocked), and because a stale approval is the more dangerous of the two: it
   * is an offer to grant an operation whose context has moved on.
   */
  sweepApprovals(now: number = Date.now()): void {
    for (const record of this.records.values()) {
      const offline = record.origin === undefined && now - record.lastSeen >= OFFLINE_AFTER_MS
      for (const view of [...record.approvals.values()]) {
        if (view.expiresAt > now && !offline) continue
        this.closeApproval(record.machineName, {
          sessionId: view.sessionId,
          approvalId: view.approvalId,
          outcome: offline ? 'offline' : 'expired',
        })
      }
    }
  }

  /**
   * Every command one machine has been sent, oldest first.
   *
   * A browser reads these as they are broadcast; this accessor exists for the two
   * readers that cannot — the reconcile pass deciding what to retry, and a test
   * asking whether a retry was recorded. Nothing here is private state: a status is
   * what the console already sees.
   * @param machineName - the machine whose commands to read.
   * @returns the statuses, in the order they were last changed.
   */
  commands(machineName: string): CommandStatus[] {
    return [...(this.records.get(machineName)?.commands.values() ?? [])]
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
    // And it is what retires the debt: a command the machine has answered is no
    // longer owed, so `retryCommands` stops offering it. Done here rather than in
    // the terminal-state branch below, because a machine that answered `failed`
    // answered — re-sending it would only ask the same question again.
    const owed = record.pending.findIndex(entry => entry.command.commandId === payload.commandId)
    if (owed >= 0) record.pending.splice(owed, 1)
    const status = record.commands.get(payload.commandId)
    if (status === undefined) return
    if (TERMINAL_STATES.includes(status.state)) return
    if (payload.ok) {
      this.transition(record, status, 'accepted')
      // An accepted answer means the machine still had the question pending and
      // claimed this decision, so the card is spent. Closing it here — rather
      // than waiting for the origin to say so — is what makes the console drop a
      // question the instant it is answered, instead of leaving a second console
      // offering a decision that has already been taken.
      if (status.kind === 'answer' && status.questionId !== undefined) {
        this.closeQuestion(machineName, {
          sessionId: status.sessionId,
          questionId: status.questionId,
          outcome: 'answered-at-console',
        })
      }
      // An accepted approval is spent the same way, and the direction has to be
      // carried through: "the console allowed this" and "the console rejected this"
      // are opposite facts about a permission, and the ack says only that the machine
      // took the decision. Every approval status carries its decision, because the
      // only command that mints one is `submitApproval`.
      if (status.kind === 'approval' && status.approvalId !== undefined) {
        this.closeApproval(machineName, {
          sessionId: status.sessionId,
          approvalId: status.approvalId,
          outcome: status.decision === 'rejected' ? 'rejected-at-console' : 'allowed-at-console',
        })
      }
      return
    }
    this.transition(record, status, 'failed', payload.error ?? 'the owning machine refused the prompt')
    // A *refused* answer closes the card too, for the same reason an accepted one
    // does: the decision came back with an outcome. Leaving it up would tell the
    // reader "waiting for the machine to confirm" about an answer the machine has
    // already declined, which is the same stuck card a dropped command produced.
    if (status.kind === 'answer' && status.questionId !== undefined) {
      this.closeQuestion(machineName, {
        sessionId: status.sessionId,
        questionId: status.questionId,
        outcome: 'refused',
      })
    }
    // A refused approval especially: the machine said no to the console's decision,
    // and a card that stayed up would invite a second attempt at the same permission
    // — or, worse, look like it had already been granted.
    if (status.kind === 'approval' && status.approvalId !== undefined) {
      this.closeApproval(machineName, {
        sessionId: status.sessionId,
        approvalId: status.approvalId,
        outcome: 'refused',
      })
    }
  }

  /**
   * Retire every command that outlived its TTL, queued or already sent.
   *
   * A command written to an origin's stream is not confirmed by that write: if
   * the link died in the same instant, nothing else would ever move it out of
   * `delivered`. The origin refuses an expired prompt on its own, so this is the
   * server's half of the same rule, and the half that tells the browser.
   */
  expireCommands(now: number = Date.now()): void {
    for (const record of this.records.values()) {
      for (const status of [...record.commands.values()]) {
        if (TERMINAL_STATES.includes(status.state)) continue
        if (status.expiresAt > now) continue
        this.transition(record, status, 'expired')
      }
      // A command whose TTL passed is no longer owed: dropping it here is also what
      // stops `retryCommands` from re-offering it to a machine that is not answering.
      const kept = record.pending.filter(owed => owed.command.expiresAt > now)
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
        ...(record.pluginVersion === undefined ? {} : { pluginVersion: record.pluginVersion }),
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
   * @param page - page size and the exclusive upper sequence to read below.
   * @returns the page, or undefined when the mirror holds no such Session.
   */
  transcript(
    machineName: string,
    sessionId: string,
    page: { limit: number; before?: number } = { limit: TRANSCRIPT_WINDOW },
  ): MirrorTranscript | undefined {
    const record = this.records.get(machineName)
    const session = record?.sessions.get(sessionId)
    if (record === undefined || session === undefined) return undefined
    // Held in sequence order, so the window's start is a slice index rather than
    // a search — and a `before` that lands inside the window is where paging
    // overlaps and cannot silently skip a row.
    const before = page.before
    const end = before === undefined
      ? session.events.length
      : session.events.findIndex(event => event.seq >= before)
    const stop = end < 0 ? session.events.length : end
    const size = Math.min(Math.max(1, page.limit), EVENT_LIMIT)
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
      if (asked === undefined || now - asked >= this.olderAskFloorMs) {
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
   * scroll. A hole is not a scroll: it is a known gap, so the page that covers it
   * is asked for directly and in the largest pages the origin serves.
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
      questions: new Map(),
      approvals: new Map(),
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
    seed: {
      commandId: string
      sessionId: string
      expiresAt: number
      kind?: 'prompt' | 'answer' | 'approval'
      questionId?: string
      approvalId?: string
      decision?: RelayedApprovalDecision
    },
    state: CommandState,
    error?: string,
    retries?: number,
  ): void {
    const status: CommandStatus = {
      commandId: seed.commandId,
      machineName: record.machineName,
      sessionId: seed.sessionId,
      state,
      ...(seed.kind === undefined ? {} : { kind: seed.kind }),
      ...(seed.questionId === undefined ? {} : { questionId: seed.questionId }),
      ...(seed.approvalId === undefined ? {} : { approvalId: seed.approvalId }),
      ...(seed.decision === undefined ? {} : { decision: seed.decision }),
      // Reported so a reader can tell "sent once, waiting" from "sent four times and
      // still nothing": the second is a machine that is up but not answering, which
      // is a different problem from a link that is down.
      ...(retries === undefined ? {} : { retries }),
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
    ...shortfallOf(session),
  }
}

/**
 * How short one mirror is, split by what the reader has to act on.
 *
 * Two things can be missing, and they are counted separately because only the
 * first is a fault:
 *
 *  - holes *inside* the held range, which a replacement window or an out-of-order
 *    arrival can leave, and which the retained run's extent reveals; and
 *  - everything above the highest sequence held, up to the watermark the origin
 *    states in its index. Nothing below the top says that a run never arrived —
 *    an empty mirror is the extreme case of that — so without the stated
 *    watermark a mirror that lost everything is indistinguishable from one whose
 *    Session has simply done nothing yet.
 *
 * Reported apart because they mean opposite things to a reader: a hole is a
 * repair that is owed, while being behind is what a live Session looks like.
 * @param session - the record to measure.
 * @returns the two counts.
 */
function shortfallOf(session: SessionRecord): { holes: number; behind: number } {
  const lowest = session.events[0]?.seq
  const holes = lowest === undefined
    ? 0
    : Math.max(0, session.maxSeq - lowest + 1 - session.seqs.size)
  return { holes, behind: Math.max(0, session.originSeq - session.maxSeq) }
}

/**
 * How many events one mirror is short of what its origin holds — both kinds.
 *
 * The sum is what an episode is cleared by, so it stays the number the sweep and
 * the repair logic reason about; the split above is what a reader is shown.
 * @param session - the record to measure.
 * @returns the count of events the origin has and this mirror does not.
 */
function missingOf(session: SessionRecord): number {
  const { holes, behind } = shortfallOf(session)
  return holes + behind
}

/** One run of sequences the mirror is missing inside the range it holds. */
interface Hole {
  /** First missing sequence. */
  readonly from: number
  /** Last missing sequence. */
  readonly to: number
}

/**
 * The runs of sequences missing *inside* the range this mirror holds.
 *
 * A count is enough to report, but not to repair: the replay ask fills a hole near
 * the top of the window, and a hole below it needs a page read aimed at that hole.
 * Events are held in sequence order, so one walk finds every run.
 * @param session - the record to measure.
 * @returns the holes, lowest first.
 */
function holesOf(session: SessionRecord): Hole[] {
  const holes: Hole[] = []
  let expected: number | undefined
  for (const event of session.events) {
    if (expected !== undefined && event.seq > expected) holes.push({ from: expected, to: event.seq - 1 })
    expected = event.seq + 1
  }
  return holes
}

/** Read an origin's stated watermark, which is never a negative claim. */
function reported(value: number | undefined): number {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : -1
}

/** Mint one opaque identity. */
function mintId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
