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

/** Anything the server writes down one machine's stream. */
export type DownstreamFrame = DownstreamCommand | DownstreamResync

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
  }[]
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
