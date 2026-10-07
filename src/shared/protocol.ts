/**
 * Wire and persisted shapes shared by the Host half, the sync server, and the
 * browser half.
 *
 * Every shape here is plain JSON. The one rule that shapes this file: the Host
 * half never hands a live DSH object (a Session, an Agent, a projection) across
 * a boundary. It reads the leaf scalars it needs and builds one of these.
 */

/** The transport path prefix every browser-facing route lives under. */
export const ROUTE_PREFIX = '/dsh-session-sync'

/** Where the plugin keeps its own persisted configuration inside the Harness home. */
export const CONFIG_FILE_NAME = 'dsh-session-sync.json'

/** Default listen port of the sync server. */
export const DEFAULT_LISTEN_PORT = 8791

/** How long a machine may go without a publish before the server marks it offline. */
export const OFFLINE_AFTER_MS = 45_000

/** Heartbeat/keepalive cadence for both SSE directions. */
export const KEEPALIVE_MS = 15_000

/**
 * Largest request body the sync server will read, in bytes.
 *
 * This is a hard limit, not a preference: a body over it is refused rather than
 * buffered, because the alternative is a peer deciding how much memory this
 * process uses. It is shared rather than private to the listener because the
 * *sender* has to respect it too — one `follow` opening on a long Session is
 * megabytes of history, and a sender that hands all of it to one POST is
 * refused, retries the same batch, and is refused again forever.
 */
export const MAX_BODY_BYTES = 4 * 1024 * 1024

/**
 * Largest one published frame batch may be, in bytes.
 *
 * Deliberately well under {@link MAX_BODY_BYTES}: the sender's estimate is of
 * the event array, while the server measures the whole JSON envelope, and a
 * batch that is near the limit on one side of the wire must not be over it on
 * the other. Half the limit keeps that disagreement harmless.
 */
export const FRAMES_BODY_BYTES = MAX_BODY_BYTES / 2

/** Shared encoder: this module is also bundled for the browser, where `Buffer` does not exist. */
const utf8 = new TextEncoder()

/** Bytes one serialized event costs, or -1 when it cannot be measured. */
export function eventBytes(event: unknown): number {
  try {
    return utf8.encode(JSON.stringify(event) ?? '').byteLength
  } catch {
    // A value JSON cannot hold is not publishable, and the count-limit still
    // bounds the batch the caller builds from it.
    return -1
  }
}

/** One run of events split for the wire, with what the split actually cost. */
export interface EventBatches<T> {
  /** Non-empty batches, in order; every input event appears exactly once. */
  batches: T[][]
  /** Largest batch, in bytes, as the sender measured it. */
  bytes: number
  /** Largest batch, as a number of events. */
  size: number
}

/**
 * Split one run of events into batches that respect a byte budget and a count.
 *
 * Order is preserved and nothing is dropped. A single event larger than the
 * whole budget still travels alone — refusing to send it would turn a wire limit
 * into silent data loss, and an event that big fails at the server with a named
 * refusal instead of a size the sender quietly invented.
 * @param events - the events to publish, in the order they were observed.
 * @param budget - largest serialized event array, in bytes.
 * @param countLimit - largest number of events per batch, as a second bound.
 * @returns the batches and the size of the largest one.
 */
export function batchEvents<T>(
  events: readonly T[],
  budget: number,
  countLimit: number,
): EventBatches<T> {
  const batches: T[][] = []
  let current: T[] = []
  let currentBytes = 0
  let bytes = 0
  let size = 0
  const flush = (): void => {
    if (current.length === 0) return
    batches.push(current)
    bytes = Math.max(bytes, currentBytes)
    size = Math.max(size, current.length)
    current = []
    currentBytes = 0
  }
  for (const event of events) {
    const eventSize = Math.max(0, eventBytes(event))
    if (current.length > 0 && (currentBytes + eventSize > budget || current.length >= countLimit)) {
      flush()
    }
    current.push(event)
    currentBytes += eventSize
  }
  flush()
  return { batches, bytes, size }
}

/**
 * How long a takeover command stays deliverable after the server accepted it.
 *
 * A prompt is a human act addressed at a Session that may have moved on: a
 * command that sat in a queue while the owning machine was asleep must not be
 * admitted hours later as if it had just been typed. Both ends enforce this —
 * the server retires it and says so, and the origin refuses it even if the
 * server's sweep has not run yet.
 */
export const COMMAND_TTL_MS = 120_000

/**
 * How long the console keeps offering an open question.
 *
 * This is the *card's* lifetime, not the asker's. The origin is never waiting on
 * the console alone: the local answerer is still in the race (the whole point of
 * the two-sided design), so dropping a card late costs nothing but the chance to
 * answer it — while keeping it forever would let a console left open overnight
 * accumulate questions whose asker finished hours ago.
 */
export const QUESTION_TTL_MS = 10 * 60_000

/**
 * How long the console may decide one relayed approval.
 *
 * Much shorter than a question's, because an approval is not a request for
 * information: the machine's tool call is *blocked* on it, and the upstream
 * service fails closed when the answerer gives up. A card that outlived the call by
 * ten minutes would offer a decision that can no longer be taken — and, worse,
 * invite a reader to grant an operation whose context has moved on. Five minutes is
 * long enough for a human to read a card and short enough that a stale one dies
 * while the caller is still waiting.
 */
export const APPROVAL_TTL_MS = 5 * 60_000

/** Persisted plugin configuration — the five settings the user asked for, plus the listener. */
export interface SyncConfig {
  /** This machine's display name, shown to every peer. */
  machineName: string
  /** Domain or IP (optionally with scheme/port) of the sync server this machine publishes to. */
  serverUrl: string
  /** Whether this instance IS the sync server rather than a publisher. */
  isServer: boolean
  /** Shared secret both sides must agree on. */
  password: string
  /** Interface the sync server binds when `isServer` is on. */
  listenHost: string
  /** Port the sync server binds when `isServer` is on. */
  listenPort: number
  /** Per-Session publish switch, keyed by Session id. */
  syncSessions: Record<string, boolean>
  /**
   * Per-Session switch allowing the console to decide this machine's approvals.
   *
   * Off unless a Session is named here, and that default is the whole point: an
   * approval is a *permission* decision, and relaying it hands a reader on another
   * machine the authority this machine's own human would have exercised — to
   * release a tool call the local permission preset was gating. Publishing a
   * conversation is a read; deciding an approval is not, so it is a separate
   * opt-in per Session rather than something `syncSessions` implies.
   */
  approveSessions: Record<string, boolean>
}

/** One locally listed Session, as the configuration page renders it. */
export interface LocalSessionRow {
  sessionId: string
  /** Latest logged title, or the id when the Session has none yet. */
  title: string
  updatedAt: number
  running: boolean
  blank: boolean
  cwd?: string
  /** Whether this Session is currently published to the server. */
  synced: boolean
  /**
   * Whether this Session's approvals may be decided from a console.
   *
   * Always false for a Session that is not also published: the console resolves a
   * card's arguments from the mirror, so an approval for a Session it cannot see
   * would ask a reader to release something they cannot read.
   */
  approved: boolean
}

/** One Session the server holds a mirror of. */
export interface MirroredSession {
  sessionId: string
  title: string
  updatedAt: number
  running: boolean
  cwd?: string
  /** How many durable events the mirror currently holds. */
  eventCount: number
  /**
   * How many events this mirror is short of what the origin holds.
   *
   * Both kinds of shortfall count: sequences missing *inside* the run the mirror
   * holds, and everything above it up to the watermark the origin states in its
   * index. A positive number is the one fact that says a replay is owed, and it
   * is the only thing an operator has to act on, so it is rendered rather than
   * folded into a log this deployment cannot read.
   */
  missingEvents: number
  /**
   * Sequences missing *inside* the range this mirror holds.
   *
   * The repairable half of {@link MirroredSession.missingEvents}: a hole is a
   * fact about the mirror rather than about timing, and the sweep asks the origin
   * for exactly the page that covers it.
   */
  holes: number
  /**
   * Events the origin has published above this mirror's top.
   *
   * The other half, and *not* a fault: a running Session is always a little
   * behind, so a reader must not be shown the same "missing" badge for the normal
   * case of a turn in flight as for a mirror that lost a batch.
   */
  behind: number
  /**
   * The totals the owning machine computed from its whole log.
   *
   * Present only while that machine is publishing and its log could be read. A
   * reader prefers these over anything countable from the events held here,
   * because the held events are a window and these are not.
   */
  stats?: MirrorStats
}

/** One machine the server knows about, online or not. */
export interface MirroredMachine {
  machineName: string
  online: boolean
  lastSeen: number
  /**
   * The plugin version this machine last stated with its index.
   *
   * Absent for a machine that has not published since this field existed, or
   * whose build could not state a version at all. It travels because the two
   * halves of one deployment are loaded at different times: an origin keeps the
   * Host half it started with, a server keeps what `pnpm install` last put
   * there, and the only other way to notice the difference was reading both
   * lockfiles by hand.
   */
  pluginVersion?: string
  sessions: MirroredSession[]
}

/** Which side of the link this instance is on right now. */
export type SyncRole = 'server' | 'client'

/** The complete live view one browser renders. */
export interface SyncState {
  role: SyncRole
  machineName: string
  serverUrl: string
  /** The plugin version this Host half is running; `unknown` when it cannot say. */
  pluginVersion: string
  /** True when the sync server listener is up (server role). */
  listening: boolean
  /** Listener failure text, when binding failed. */
  listenError?: string
  /** True when the origin link to the server is established (client role). */
  linked: boolean
  /** Link failure text, when the last attempt failed (client role). */
  linkError?: string
  /** Server role: every connected and remembered machine. Client role: empty. */
  machines: MirroredMachine[]
  /**
   * Server role: the questions relayed to this console and still answerable.
   *
   * A question is *not* mirrored state: it lives only as long as the asker is
   * waiting, and the origin withdraws it the moment its own human answers. So
   * this is the one part of the view that is deliberately transient — a restart
   * of this server loses it, and the origin's next question re-opens a fresh one.
   */
  questions?: RelayedQuestionView[]
  /**
   * Server role: the approvals relayed to this console and still decidable.
   *
   * Transient for the same reason questions are: an approval exists only while the
   * machine is blocked on it. A restart of this server loses the cards, and the
   * machine's own answerer still decides — which is the fail-closed direction,
   * because losing an approval means the operation is *not* granted here.
   */
  approvals?: RelayedApprovalView[]
  /**
   * Client role: what this machine's relayed questions did.
   *
   * Counted because a race has exactly one winner and the loser is invisible:
   * without these numbers, "the console never offered the question" and "the
   * console offered it and the machine answered first" look the same from both
   * ends, and this deployment's logger writes nowhere anyone can read.
   */
  interactions?: {
    /** Questions currently waiting on either side. */
    open: number
    /** Answered by the local UI before the console did. */
    answeredLocally: number
    /** Answered by the console, and claimed by this machine. */
    answeredRemotely: number
    /** Answers that arrived too late to claim, with the local answer already taken. */
    lateAnswers: number
    /** Questions withdrawn because the asking turn was aborted. */
    aborted: number
  }
  /**
   * Client role: what this machine's relayed approvals did.
   *
   * The same reasoning as `interactions`, and the same need: an approval has one
   * winner, the loser is silent, and "the console never saw it" is otherwise
   * indistinguishable from "the machine's own human decided first". `offered` is
   * counted separately from `open` because an approval that was never relayed at
   * all (the session is not opted in) must not look like one that was offered.
   *
   * Named apart from the server's `approvals` list on purpose — that one is a list
   * of cards, this one is a set of counters — and apart from `interactions`, which
   * keeps its name because builds already in the field read it for questions.
   */
  approvalCounts?: {
    /** Approvals this machine relayed to the console. */
    offered: number
    /** Approvals currently waiting on either side. */
    open: number
    /** Decided by the local UI before the console did. */
    decidedLocally: number
    /** Decided by the console, and claimed by this machine. */
    decidedRemotely: number
    /** Decisions that arrived too late to claim, with the local one already taken. */
    lateDecisions: number
    /** Approvals withdrawn because the asking turn was aborted. */
    aborted: number
  }
  /** Client role: the Sessions this machine is publishing. */
  published: number
  /**
   * The last publish the server accepted, or the last one it refused.
   *
   * `linked` says the downstream stream is up; this says whether anything is
   * actually reaching the mirror. Without it, a link that stopped publishing
   * looked exactly like a healthy one — and the mark count above read as
   * success, which is how a client could show 已同步会话数 3 while the server
   * held nothing at all.
   */
  publish?: { at: number; ok: boolean; error?: string }
  /**
   * What the follow streams are doing: the last failure, the frame types
   * actually seen, and how many events arrived. The host half's logger output
   * reaches no file this deployment can read, so the contract is reported here
   * instead -- this is what says whether a follow yields anything at all.
   */
  follow?: { error?: string; sessionId?: string; frames: string[]; events: number; historyMisses?: number; localItems?: number; localRows?: number; shapes?: string[]; posts?: string[] }
  /**
   * How the last published frame batch was split, and how much is still queued.
   *
   * The server refuses a body over its own limit, and the sender's only other
   * evidence of that is a refusal with no size attached. This is where the size
   * lives: it is the number that says whether a Session is delivered in one
   * batch or several, and whether anything is stuck waiting to be accepted.
   */
  batch?: {
    bytes?: number
    size?: number
    batches?: number
    waiting?: number
  }
  /**
   * Per-Session follow facts, newest first, bounded.
   *
   * `cursor` and `opened` together answer the question this feature has had to
   * guess at twice: has the opening snapshot of this Session's follow ever been
   * taken? A page read behind the mirror is cut against that cursor, so while it
   * is unset, "the origin will not page" and "the origin never finished its
   * opening" are indistinguishable from the mirror's side.
   */
  follows?: {
    sessionId: string
    cursor: number
    firstSeq: number
    /**
     * Lowest sequence this machine has ever sent, or -1 before any.
     *
     * The backfill's frontier, and not the same as {@link firstSeq}: a reconnect
     * replays the opening window, whose lowest sequence rises with the log, so the
     * window counter climbs while the frontier must only descend.
     */
    sentFirstSeq?: number
    lastSeq: number
    hasOlder: boolean
    opened: boolean
    pending: number
    events: number
    /** Why the follow's last attempt ended, when it ended without an abort. */
    ended?: string
  }[]
  /**
   * What the last backwards history read did.
   *
   * Reported for the same reason the follow is: a page that comes back empty or
   * refuses is invisible in the mirror — it looks exactly like a machine with
   * nothing older to give — and the logger that would have said otherwise writes
   * nowhere this deployment can read.
   */
  page?: {
    sessionId?: string
    beforeSeq?: number
    throughSeq?: number
    /**
     * The message budget this read asked its log for.
     *
     * Published because a page that ignored the budget looks exactly like one that
     * honoured it — same fields, same shape — except in its size, and the size is
     * what a diagnosis has to compare against.
     */
    maxMessages?: number
    records?: number
    hasMore?: boolean
    /**
     * Lowest durable sequence the page carried.
     *
     * The evidence a page read is judged on: `hasMore === false` with a lowest
     * sequence of 0 means the read walked back to the log's beginning, while a
     * lowest sequence above 0 means it stopped short of it — and that difference
     * is what decides whether this machine is allowed to stop offering older
     * history. Absent when the page carried no durable event.
     */
    lowestSeq?: number
    /** Set when this read is what proved the log's beginning was reached. */
    reachedStart?: true
    /** Which precondition failed, when the read never happened. */
    reason?: 'no-controller' | 'no-page-api' | 'no-follow' | 'no-cursor' | 'rate-limited'
    error?: string
  }
  /**
   * Why the most recent attempt at a history read did not run.
   *
   * Apart from {@link SyncState.page} on purpose: the periodic gap sweep re-asks
   * while a read floor is still active, and recording that skip *as* the read made
   * a page that was served read as a page that was refused — which is the
   * diagnosis, not the limiter, that the next fault needs.
   */
  pageAttempt?: {
    sessionId?: string
    beforeSeq?: number
    reason?: 'no-controller' | 'no-page-api' | 'no-follow' | 'no-cursor' | 'rate-limited'
    at?: number
  }
  /**
   * The Sessions this machine has proven it read back to their first event.
   *
   * Reported because the claim is what turns "the origin has older history" off
   * for the rest of an episode: when it is wrong, the origin denies history it is
   * holding, the mirror's floor freezes, and nothing in the transcript shows why.
   * The value is the evidence, so a wrong claim can be argued with instead of
   * merely believed.
   */
  started?: {
    sessionId: string
    at: number
    throughSeq: number
    records: number
    /** Which read proved it: the opening window itself, or a backwards page. */
    source: 'opening' | 'page'
  }[]
}

/** Where one event sits on the Session surface — `SessionWireSurfaceOp`. */
export type MirrorSurfaceOp =
  | 'append'
  | { op: 'replace'; startSeq: number; endSeq: number }

/** One mirrored Session event, carried verbatim from the origin's log. */
export interface MirrorEvent {
  type: string
  seq: number
  time: number
  data: unknown
  /**
   * The earlier events this one supersedes on the surface, verbatim.
   *
   * `surfaceOp` says *that* a window was replaced; this says *which* earlier
   * events it replaced, so a reader can tell a superseded frame apart from one
   * that merely shares its type. Opaque here: whatever the origin wrote is what
   * the mirror carries.
   */
  sourceEventSeqs?: unknown
  /**
   * The event's surface placement.
   *
   * Carried because a durable event can *replace* a range of earlier ones — a
   * compaction, or a replay after a fork — and a reader that ignores that shows
   * the replaced history beside the window that superseded it.
   */
  surfaceOp?: MirrorSurfaceOp
}

/**
 * One page of a mirrored Session, newest end first.
 *
 * A transcript is read from its newest end, and a full mirror is megabytes of
 * JSON — so the route serves a tail window and says whether asking for more is
 * worthwhile, which is the same bargain the origin's own follow snapshot makes.
 */
export interface MirrorTranscript {
  machineName: string
  sessionId: string
  events: MirrorEvent[]
  /** True while the origin reports the Session as mid-turn. */
  running: boolean
  /** Whether the mirror holds events older than this page's first one. */
  hasMore: boolean
}

/** One selectable answer on a relayed question — `AskUserQuestionOption` cut to JSON. */
export interface RelayedQuestionOption {
  label: string
  /** Extra context a capable UI renders under the label. */
  description?: string
}

/**
 * One question relayed to the server's console — `AskUserQuestionItem` cut to JSON.
 *
 * A live `AbortSignal`, an `Agent`, and a `plan-review` intent are all
 * deliberately dropped: the first two cannot cross a wire, and the third's
 * `callId` points into a log the console's readers do not hold. What survives is
 * what a human needs in order to choose.
 */
export interface RelayedQuestion {
  /** The asker's stable id, echoed back so a batch stays routable. */
  id: string
  question: string
  header?: string
  detail?: string
  options?: RelayedQuestionOption[]
  /** Whether more than one option may be selected; single-select when absent. */
  multiSelect?: boolean
}

/** One answer a console chose for one relayed question. */
export interface RelayedAnswerItem {
  id: string
  selected: string[]
  /** Free-text "Other" answer, which overrides `selected` on a single-select. */
  custom?: string
}

/**
 * One approval relayed to the server's console — `ApprovalRequestEvent` cut to JSON.
 *
 * The request carries no arguments: an approval names the *tool* and the exact
 * `callId`, and the console already holds the call itself in the mirrored
 * transcript, so the card resolves what is being approved from the window it is
 * showing rather than from a second copy on the wire.
 */
export interface RelayedApproval {
  /** The tool whose operation needs a decision. */
  toolName: string
  /** The exact tool call, when the asker had one — the console's key to its arguments. */
  callId?: string
  /** The asker's human-readable explanation. */
  reason?: string
}

/**
 * What one console decided about a relayed approval.
 *
 * The server's own vocabulary is the upstream one (`allowed-once`/`rejected`), and
 * only those two: a console grants one operation or declines it. `cancelled` and
 * `unavailable` are states of an *answerer*, not decisions a human makes.
 */
export type RelayedApprovalDecision = 'allowed-once' | 'rejected'

/**
 * Why a relayed approval stopped being answerable.
 *
 * Named from the whole deployment's point of view, like `QuestionOutcome`: the
 * machine's own answer and the console's are both legitimate, and a reader must be
 * able to tell which one decided — and which way.
 */
export type ApprovalOutcome =
  | 'allowed-at-origin'
  | 'rejected-at-origin'
  | 'allowed-at-console'
  | 'rejected-at-console'
  /** The machine's answerer cancelled, or the asking turn was aborted. */
  | 'aborted'
  /** No answerer on the machine could take it; the caller fails closed. */
  | 'unavailable'
  /** The TTL passed with the approval unanswered at the console. */
  | 'expired'
  /** The machine that asked stopped appearing. */
  | 'offline'
  /** The machine refused the console's decision, and said why. */
  | 'refused'

/** Origin → server: one approval is waiting for a decision, here or there. */
export interface ApprovalOpenPayload {
  sessionId: string
  /** Origin-minted identity of this asking episode. */
  approvalId: string
  approval: RelayedApproval
  /** Epoch ms after which the console should stop offering it. */
  expiresAt: number
}

/** Origin → server: this approval is no longer pending, and why. */
export interface ApprovalClosePayload {
  sessionId: string
  approvalId: string
  outcome: ApprovalOutcome
}

/** Server → browser: one approval this server is offering, or the news that it closed. */
export interface RelayedApprovalView {
  machineName: string
  sessionId: string
  approvalId: string
  approval: RelayedApproval
  openedAt: number
  expiresAt: number
  /** Present once the approval stopped being answerable; the console drops the card. */
  closed?: ApprovalOutcome
}

/** Server → origin: the console's decision on one approval the origin relayed. */
export interface DownstreamApproval {
  commandId: string
  sessionId: string
  kind: 'approval'
  /** The approval this decides, as the origin named it. */
  approvalId: string
  decision: RelayedApprovalDecision
  /** Which console decided, for the origin's own presentation. */
  from: string
  /** Epoch ms after which the origin must refuse this decision. */
  expiresAt: number
}

/** Origin → server: one question is waiting for a human, here or there. */
export interface QuestionOpenPayload {
  sessionId: string
  /** Origin-minted identity of this asking episode. */
  questionId: string
  questions: RelayedQuestion[]
  /** Epoch ms after which the console should stop offering it. */
  expiresAt: number
}

/** Origin → server: this question is no longer pending, and why. */
export interface QuestionClosePayload {
  sessionId: string
  questionId: string
  outcome: QuestionOutcome
}

/**
 * Why an open question stopped being answerable.
 *
 * Named from the whole deployment's point of view rather than from either end's,
 * because the two ends mean opposite things by "local": the machine's own human
 * answering first is the ordinary outcome of the race and is *not* a failure, and
 * so is the console answering first. Which side produced which value is stated
 * per member — a reader that had to guess would report a lost race as a fault.
 */
export type QuestionOutcome =
  /** The machine's own human answered first. Sent by the origin. */
  | 'answered-at-origin'
  /** The console answered first and the machine claimed it. Raised by the server. */
  | 'answered-at-console'
  /**
   * The machine refused the console's answer and said why. Raised by the server.
   *
   * A refusal has to close the card like any other outcome: the answer was
   * delivered and refused, so leaving the card up would show a reader "waiting for
   * the machine to confirm" forever, for a decision the machine has already
   * declined.
   */
  | 'refused'
  /** The asking turn was aborted, so nobody can answer it any more. */
  | 'aborted'
  /** The TTL passed with the question unanswered at the console. */
  | 'expired'
  /** The machine that asked stopped appearing. */
  | 'offline'

/** Server → browser: one question this server is offering, or the news that it closed. */
export interface RelayedQuestionView {
  machineName: string
  sessionId: string
  questionId: string
  questions: RelayedQuestion[]
  openedAt: number
  expiresAt: number
  /** Present once the question stopped being answerable; the console drops the card. */
  closed?: QuestionOutcome
}

/** Server → origin: one instruction to act on a published Session. */
export interface DownstreamPrompt {
  /** Server-minted identity, echoed back in the origin's ack. */
  commandId: string
  sessionId: string
  kind: 'prompt'
  text: string
  /** Who asked, for the origin's own presentation. */
  from: string
  /** Epoch ms after which the origin must refuse this prompt. */
  expiresAt: number
}

/**
 * Server → origin: the console's answer to one question the origin relayed.
 *
 * It travels as a command rather than as its own frame because it needs exactly
 * what a prompt needs: a queue for a machine that is away, a TTL, one at-most-once
 * delivery, and an ack that says whether the origin *claimed* it. The origin
 * claims it only while that question is still pending — so the ack is where the
 * two-sided race is decided, and `failed` with the reason is the honest answer to
 * a console that answered a question the machine had already answered itself.
 */
export interface DownstreamAnswer {
  commandId: string
  sessionId: string
  kind: 'answer'
  /** The question this answers, as the origin named it. */
  questionId: string
  answers: RelayedAnswerItem[]
  /** Which console asked, for the origin's own presentation. */
  from: string
  /** Epoch ms after which the origin must refuse this answer. */
  expiresAt: number
}

/** Anything the server asks one origin to do about a published Session. */
export type DownstreamCommand = DownstreamPrompt | DownstreamAnswer | DownstreamApproval

/**
 * Server → origin: re-open one Session's follow so its snapshot replays.
 *
 * The mirror repairs itself no other way. A batch can be lost before it is
 * written — a failed post, a follow that ended mid-turn — and the only copy of
 * those events is the origin's own store, so the machine that owns them has to
 * be asked. The replay is idempotent because the mirror decides what is new by
 * membership, which is exactly why this can be repeated safely.
 *
 * It carries no identity and expects no ack: unlike a prompt it changes nothing
 * on the origin, and a request that goes missing costs one more round of the
 * mirror noticing.
 */
export interface DownstreamResync {
  kind: 'resync'
  sessionId: string
}

/**
 * Server → origin: read a page of history from behind the mirror's window.
 *
 * A follow opens on a tail window, so the mirror begins mid-conversation and no
 * amount of paging inside it reaches the start. Only the machine that holds the
 * log can answer for what came before, and only a reader asking for it is worth
 * the transfer — which is why this is a request rather than a backfill.
 */
export interface DownstreamOlder {
  kind: 'older'
  sessionId: string
  /** Read the history strictly below this sequence. */
  beforeSeq: number
  /** How many messages the page should span, at most. */
  maxMessages: number
}

/** Anything the server writes down one machine's stream. */
export type DownstreamFrame = DownstreamCommand | DownstreamResync | DownstreamOlder

/** Where one takeover command stands, as the server knows it. */
export type CommandState =
  /** Accepted by the server, not yet handed to the owning machine. */
  | 'queued'
  /** Written down the owning machine's stream; nothing confirmed yet. */
  | 'delivered'
  /** The owning machine admitted the prompt into its Session. */
  | 'accepted'
  /** The owning machine refused it, or the attempt threw. */
  | 'failed'
  /** The TTL passed before the owning machine confirmed it. */
  | 'expired'

/** One takeover command's current state, for the composer's feedback. */
export interface CommandStatus {
  commandId: string
  machineName: string
  sessionId: string
  state: CommandState
  /**
   * What this command asked the origin to do.
   *
   * A prompt, an answer and an approval travel the same lifecycle but mean
   * different things to a reader — one said something, one decided a question, one
   * granted or refused an operation — so the console needs the discriminator to
   * narrate them apart. Absent only for a status minted before this field existed.
   */
  kind?: 'prompt' | 'answer' | 'approval'
  /** For an answer: the question it decided. */
  questionId?: string
  /** For an approval: the approval it decided. */
  approvalId?: string
  /**
   * For an approval: what the console decided.
   *
   * Carried on the status because the ack that closes the card says only *that*
   * the machine took the decision, not which way — and "allowed" and "rejected" are
   * opposite facts a reader must be told apart.
   */
  decision?: RelayedApprovalDecision
  /**
   * How many times this command had been handed to the machine before this status.
   *
   * Absent for the first attempt. It exists because "sent once and waiting" and
   * "sent four times and still nothing" are different faults — a reader that is slow
   * to answer versus a machine that is up but not answering — and only the count
   * tells them apart.
   */
  retries?: number
  /** Epoch ms after which this command is no longer deliverable. */
  expiresAt: number
  /** Human-readable reason, present for `failed` (and `expired` when explained). */
  error?: string
  /** Epoch ms of the last transition. */
  time: number
}

/** Origin -> server: streaming text for one step, never stored in the mirror.
 *
 * The whole text so far rather than an increment: a lost frame then self-heals
 * on the next one, and the reader never sees a gap. The durable events remain
 * the source of truth -- the completed message replaces this.
 */
export interface StreamDeltaPayload {
  sessionId: string
  turn: number
  step: number
  kind: 'reasoning' | 'text'
  text: string
}

/** Origin -> server: the outcome of one downstream command. */
export interface CommandAckPayload {
  commandId: string
  sessionId: string
  ok: boolean
  error?: string
}

/** Origin → server: the identity and Session index this machine publishes. */
export interface PublishIndexPayload {
  machineName: string
  /**
   * The publishing build's plugin version.
   *
   * Small, idempotent, and sent with every index, so a server always states the
   * version the machine is actually running rather than the one it installed.
   */
  pluginVersion?: string
  sessions: {
    sessionId: string
    title: string
    updatedAt: number
    running: boolean
    cwd?: string
    /**
     * Highest durable sequence this machine holds for the Session, when it has
     * read one.
     *
     * The index is the only place an origin states its own extent, and the
     * mirror needs it: from events alone, a Session holding none is
     * indistinguishable from one whose entire history never arrived — and the
     * second is exactly what a replay repairs. Absent means "not read yet",
     * never "empty", so a machine that has not finished its opening snapshot
     * cannot be mistaken for one that lost everything.
     */
    lastSeq?: number
    /**
     * Whether this machine's own log holds history below what it published.
     *
     * A follow opens on a tail window, so the lowest sequence it delivered says
     * nothing about where the Session begins — the window's own `hasMore` does.
     * Without this the mirror cannot tell "the Session started here" from "the
     * beginning never arrived", and a reader asking for older history would be
     * told there is none.
     */
    hasOlder?: boolean
    /**
     * The lowest sequence this machine has ever sent for the Session.
     *
     * The frontier a backfill walks down, and it has to come from this side: a page
     * arrives by prepending, so the mirror's own lowest sequence jumps to 0 while
     * the run between that page and the window is still missing — and a reader
     * asking below 0 asks for the page it already holds. This number only moves
     * down as pages are delivered, which is what a frontier is.
     * Absent before the first page, which leaves the mirror to use its own floor.
     */
    firstSeq?: number
    /**
     * The totals this machine computed from the Session's *whole* log.
     *
     * The console can only count what it holds, and what it holds is a window —
     * the mirror retains a bounded number of events, so a long Session's footer
     * understates it by whatever sits below that window. No console-side
     * arithmetic can recover that; only the machine that owns the log can state
     * it. Absent when the log could not be read, which leaves the console
     * counting what it has — today's behaviour, not a wrong number.
     */
    stats?: MirrorStats
  }[]
}

/**
 * One Session's whole-log totals, as its owning machine computed them.
 *
 * The shape mirrors the console's own footer arithmetic field for field, because
 * a reader compares the two: the same rules over the same log, computed by the
 * half that holds all of it.
 */
export interface MirrorStats {
  turns: number
  steps: number
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    reasoningTokens: number
  }
  /**
   * How full the context is, from the log's own newest window and reading.
   *
   * Stated by the machine for the same reason the totals are: a console holding part
   * of a log cannot see the newest `request/context` or the newest usage, and a
   * footer that fell silent there would read as "nothing to report" rather than
   * "this console cannot see it".
   */
  context?: {
    window: number
    used: number
    percent: number
  }
  cacheHitPercent?: number
  stepMs: number
  /**
   * Wall time the writing itself had, summed over the steps that produced a message.
   *
   * The denominator of {@link outputPerSecond}, sent beside it for the same reason
   * the rate is: a console drawing the shipped composer statistics folds decode
   * time and decode tokens itself, so the pair is what it needs, and a rate alone
   * cannot be taken apart again. Absent from an older origin, which leaves that
   * fold without a speed reading rather than with an invented one.
   */
  generationMs?: number
  outputPerSecond?: number
  firstTime?: number
  lastTime?: number
}

/** Origin → server: durable events appended to one published Session. */
export interface PublishFramesPayload {
  sessionId: string
  events: MirrorEvent[]
}

/** Handshake request body. */
export interface HandshakeRequest {
  machineName: string
  password: string
}

/** Handshake response body. */
export interface HandshakeResponse {
  token: string
  serverName: string
}

/**
 * A partial configuration write from the browser.
 * Absent keys are left alone; `syncSessions` is merged rather than replaced.
 */
export interface ConfigPatch {
  machineName?: string
  serverUrl?: string
  isServer?: boolean
  password?: string
  listenHost?: string
  listenPort?: number
  /** One Session's publish switch. */
  sessionSync?: { sessionId: string; synced: boolean }
  /**
   * One Session's approval switch.
   *
   * Separate from {@link ConfigPatch.sessionSync} because it grants something a
   * publish does not: the authority for a reader elsewhere to *allow* a gated tool
   * call on this machine. Turning it on for a Session that is not published is
   * refused (see the engine's `approveable`), since the console could not show what
   * it was approving.
   */
  sessionApprovals?: { sessionId: string; approved: boolean }
}

/** One browser-facing SSE frame. */
export type SyncStreamFrame =
  | { type: 'state'; state: SyncState }
  | { type: 'events'; machineName: string; sessionId: string; events: MirrorEvent[] }
  | { type: 'command'; command: CommandStatus }
  /** One relayed question opened or closed; the console renders the current set. */
  | { type: 'question'; question: RelayedQuestionView }
  /** One relayed approval opened, updated, or closed on the server this console reads. */
  | { type: 'approval'; approval: RelayedApprovalView }
  /** Transient streaming text for the open Session; never mirrored. */
  | { type: 'stream'; machineName: string; sessionId: string; turn: number; step: number; kind: 'reasoning' | 'text'; text: string }
  | { type: 'error'; message: string }

/** Build the config a fresh install starts from. */
export function defaultConfig(machineName: string): SyncConfig {
  return {
    machineName,
    serverUrl: '',
    isServer: false,
    password: '',
    listenHost: '0.0.0.0',
    listenPort: DEFAULT_LISTEN_PORT,
    syncSessions: {},
    approveSessions: {},
  }
}

/**
 * Coerce one parsed JSON document into a complete configuration.
 * @param raw - the persisted document, or anything else.
 * @param fallbackMachineName - name to use when the document carries none.
 * @returns a complete configuration with every field of the right type.
 */
export function normalizeConfig(raw: unknown, fallbackMachineName: string): SyncConfig {
  const base = defaultConfig(fallbackMachineName)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return base
  const source = raw as Record<string, unknown>
  const syncSessions: Record<string, boolean> = {}
  const rawSync = source['syncSessions']
  if (typeof rawSync === 'object' && rawSync !== null && !Array.isArray(rawSync)) {
    for (const [sessionId, value] of Object.entries(rawSync as Record<string, unknown>)) {
      if (value === true) syncSessions[sessionId] = true
    }
  }
  // Read the same way, and *not* derived from `syncSessions`: a config written by a
  // build that predates this field must come out with no Session opted in, which is
  // exactly what an absent key means. Anything else would opt Sessions in by the act
  // of upgrading — the one outcome this switch exists to prevent.
  const approveSessions: Record<string, boolean> = {}
  const rawApprove = source['approveSessions']
  if (typeof rawApprove === 'object' && rawApprove !== null && !Array.isArray(rawApprove)) {
    for (const [sessionId, value] of Object.entries(rawApprove as Record<string, unknown>)) {
      if (value === true) approveSessions[sessionId] = true
    }
  }
  const port = source['listenPort']
  return {
    machineName: text(source['machineName']) ?? base.machineName,
    serverUrl: text(source['serverUrl']) ?? base.serverUrl,
    isServer: source['isServer'] === true,
    password: text(source['password']) ?? base.password,
    listenHost: text(source['listenHost']) ?? base.listenHost,
    listenPort: typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65_536
      ? port
      : base.listenPort,
    syncSessions,
    approveSessions,
  }
}

/** Read one optional non-empty string field. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

/**
 * Normalize a user-typed server address into an origin URL.
 * A bare host or `host:port` is assumed to speak plain HTTP, which is what a
 * LAN or loopback deployment uses; an explicit scheme is preserved so an
 * operator behind TLS can say `https://…`.
 * @param serverUrl - the configured value.
 * @returns the origin to call, without a trailing slash; empty when unset.
 */
export function serverOrigin(serverUrl: string): string {
  const trimmed = serverUrl.trim().replace(/\/+$/, '')
  if (trimmed === '') return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `http://${trimmed}`
}
