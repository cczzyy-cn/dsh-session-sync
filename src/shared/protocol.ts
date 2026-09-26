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

/**
 * Where the plugin records the Sessions it wrote into this Host's own storage.
 *
 * Separate from the configuration on purpose: this is engine state, it grows by
 * itself, and the gate that keeps a mirrored Session read-only reads it at boot
 * — a document the user edits in the settings page is the wrong place for it.
 */
export const MATERIALIZED_FILE_NAME = 'dsh-session-sync-materialized.json'

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
   * Whether the server writes each mirrored Session into its own storage.
   *
   * On, a mirrored Session becomes a real Session on this Host: it appears in
   * the workspace browser and opens in DSH's own conversation page, with the
   * Host answering its history, its paging and its jumps — while the plugin's
   * `agent/pre-step` gate keeps it read-only. Off, the console's own pane is the
   * only way to read a mirror.
   */
  materialize: boolean
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
}

/** One machine the server knows about, online or not. */
export interface MirroredMachine {
  machineName: string
  online: boolean
  lastSeen: number
  sessions: MirroredSession[]
}

/** Which side of the link this instance is on right now. */
export type SyncRole = 'server' | 'client'

/** The complete live view one browser renders. */
export interface SyncState {
  role: SyncRole
  machineName: string
  serverUrl: string
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
    records?: number
    hasMore?: boolean
    /** Which precondition failed, when the read never happened. */
    reason?: 'no-controller' | 'no-page-api' | 'no-follow' | 'no-cursor' | 'rate-limited'
    error?: string
  }
  /**
   * The mirrored Sessions this Host has written into its own storage.
   *
   * This is the answer to "can I open that Session with DSH's own page instead of
   * the console's copy": a listed id is a real Session on this Host, with the
   * Host serving its history. It is also the read-only ledger — every id here is
   * refused a model step by the plugin's own `agent/pre-step` gate, so the page
   * reads and does not run.
   *
   * Reported as its own list rather than a flag on `machines[].sessions[]`
   * because the two sets differ: a Session stays written after the origin stops
   * publishing it, and that is exactly the copy the operator most needs to see.
   */
  materialized?: {
    sessionId: string
    machineName: string
    /** Events the openable log holds. */
    events: number
    /** When this Host wrote it, in epoch ms. */
    at: number
    /** Why the copy stopped tracking the mirror, when it did. */
    stopped?: string
    /**
     * The last attempt to advance this copy that could not, and why.
     *
     * A copy can be behind without being broken — most often because DSH has the
     * Session open, which makes it live on this Host and lets the live machinery
     * own its log, so the plugin's append is refused until it goes cold. That
     * state used to be reported as nothing at all: the count simply stopped
     * moving, which reads as a broken feature rather than a wait. This is what
     * says otherwise, and the mirror's own count beside it says how far behind.
     */
    waiting?: string
    /** When that attempt was made, in epoch ms. */
    waitingAt?: number
  }[]
  /**
   * Whether the server writes mirrored Sessions into its own storage at all.
   *
   * The switch is reported next to what it produced: "no Session is openable"
   * and "this Host was told not to write any" look identical from the mirror's
   * side, and the settings page is not always the page being read.
   */
  materialize: boolean
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

/** Server → origin: one instruction to act on a published Session. */
export interface DownstreamCommand {
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
     * The Session's own header, as this machine's log states it.
     *
     * It travels because the machine that *writes* a materialized Session is the
     * server, while the header only exists on the machine that owns the Session:
     * the server reads its own `follows` to find it and has none, so a field like
     * `agentPreset` — which no event carries and nothing can infer — was silently
     * dropped from every materialized log. Measured: 3,478 of 3,479 records came
     * back byte-identical and the header was the one difference.
     */
    header?: SessionHeader
  }[]
}

/**
 * The header of a Session's log, as the machine that owns it states it.
 *
 * Deliberately only the fields a writer may restate: the Session's own identity and
 * timing, plus the two the format allows and no event carries. `agentPreset` is why
 * this travels at all — a materialization wrote 3,478 of 3,479 records byte-identical
 * and dropped exactly this from the header, because the machine that writes the log
 * is not the machine that has the field.
 */
export interface SessionHeader {
  id: string
  createdAt: number
  cwd?: string
  agentPreset?: string
  origin?: string
}

/** Origin → server: durable events appended to one published Session. */
export interface PublishFramesPayload {
  sessionId: string
  events: MirrorEvent[]
  /**
   * The Session's own header, when this batch is the one that carried it.
   *
   * Sent with the frames as well as the index because the opening window is where
   * the origin reads it, and a mirror that only learns it on the next index would
   * materialize without it in the gap.
   */
  header?: SessionHeader
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
  /** Whether the server writes mirrored Sessions into its own storage. */
  materialize?: boolean
}

/** One browser-facing SSE frame. */
export type SyncStreamFrame =
  | { type: 'state'; state: SyncState }
  | { type: 'events'; machineName: string; sessionId: string; events: MirrorEvent[] }
  | { type: 'command'; command: CommandStatus }
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
    // On by default: a mirrored Session that only the console can read is the
    // state this option exists to leave behind.
    materialize: true,
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
    // Absent means on: the option was added after the first deployments, and a
    // document written before it existed must not read as "off" — that would
    // silently leave every mirror unreadable outside the console.
    materialize: source['materialize'] !== false,
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
