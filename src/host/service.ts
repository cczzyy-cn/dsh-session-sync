/**
 * The sync engine.
 *
 * One service instance owns both roles. As a **client** it lists local Sessions,
 * keeps a `follow` stream open for each Session the user marked for sync, and
 * publishes the index plus durable events to the server. As a **server** it runs
 * the listener, mirrors what every origin publishes, and turns a browser's
 * takeover prompt into a downstream command.
 *
 * Everything the browser sees is read from this service, and every write goes
 * through {@link SessionSyncService.patch}; there is no second source of truth.
 */
import { hostname } from 'node:os'
import {
  serverOrigin,
  type ConfigPatch,
  type DownstreamCommand,
  type LocalSessionRow,
  type MirrorEvent,
  type MirrorTranscript,
  type PublishIndexPayload,
  type StreamDeltaPayload,
  type SyncConfig,
  type SyncState,
  type SyncStreamFrame,
} from '../shared/protocol.ts'
import { loadConfig, saveConfig } from './config.ts'
import type {
  FollowFrame,
  HostContext,
  SessionControllerLike,
  SessionSummaryRow,
  WireEvent,
} from './dsh.ts'
import { SyncHub, type BrowserSink } from './hub.ts'
import {
  materializeSession,
  type MaterializeResult,
  type SessionPersistenceLike,
  type WorkspaceRegistryLike,
} from './materialize.ts'
import { OriginLink, startSyncServer, type SyncServerHandle } from './transport.ts'

/** How often the local index is re-read and the follow set reconciled. */
const RECONCILE_MS = 10_000

/**
 * How often buffered events, and the streaming text, are handed to the link.
 *
 * Measured on this deployment: the model's deltas arrive at roughly 200 a
 * second, so a whole thinking block is on the wire in under three seconds. At
 * the previous 400 ms that was three to six visible updates for an entire
 * block, which reads as one shot however it is rendered; 150 ms keeps the relay
 * ahead of the burst. Each update carries the step's whole text, so the cost of
 * the finer tick is bounded by the text, not by the number of deltas.
 */
const FLUSH_MS = 150

/** Bound on events buffered per Session while the link is down. */
const BUFFER_LIMIT = 4_000

/** Bound on steps whose streamed text is still tracked, per kind. */
const LIVE_LIMIT = 64

/**
 * Shortest gap between two replays of the same Session.
 *
 * The server asks on a 30 s timer while a hole survives, and a follow that is
 * still delivering its snapshot must not be torn down and restarted underneath
 * itself — that would turn a repair into the reason it never finishes.
 */
const RESYNC_FLOOR_MS = 5_000

/**
 * Shortest gap between two history reads for the same Session.
 *
 * A reader walking up the transcript asks repeatedly, and every answer is a page
 * of the log plus a POST. The server already collapses asks it cannot serve, and
 * this keeps a burst of clicks from becoming a burst of disk reads.
 */
const PAGE_FLOOR_MS = 1_000

/**
 * How far materializing walks an origin back before it gives up.
 *
 * The mirror holds the newest window, and a Session's log has to begin at its
 * beginning, so a long Session needs the origin to page backwards until it does.
 * One round is one ask plus one wait, so this is a time budget rather than a
 * statement about what is possible: a Session that needs more is reported, not
 * half-written. Materializing a live Session wants the whole log, which for one
 * measured here was 11,836 events, so the budget has to cover the pages that
 * takes at the latency below.
 */
const BACKFILL_ROUNDS = 40

/**
 * How long one backfill round waits, in ticks of {@link BACKFILL_TICK_MS}.
 *
 * This has to exceed a page's real round trip, which measured at ten to twenty
 * seconds on a cross-border link: the ask is a frame down the origin's stream,
 * then a read of that machine's log, then a POST of the page back. At the original
 * six seconds the walk declared a page idle while it was still in flight, gave up
 * with the low edge short, and released the retention hold — so the page that did
 * arrive was trimmed away again.
 */
const BACKFILL_TICKS = 60

/** One backfill tick: how often a waiting round re-reads the mirror's edge. */
const BACKFILL_TICK_MS = 500

/**
 * Rounds that may move nothing before materializing gives up.
 *
 * The origin reads its own log on its own schedule, so a single still round says
 * nothing; two in a row mean it has no more below, or is not answering.
 */
const BACKFILL_IDLE_ROUNDS = 2

/**
 * Messages one backfill page covers.
 *
 * Materializing is not scrolling: it wants the beginning as fast as the origin
 * will serve it, and the origin's own page ceiling is 500 messages.
 */
const BACKFILL_PAGE_MESSAGES = 500

/** The two kinds of text one step streams. */
const STREAM_KINDS = ['reasoning', 'text'] as const

/** One kind of streamed text. */
type StreamKind = typeof STREAM_KINDS[number]

/** One tracked `follow` stream. */
interface FollowHandle {
  readonly abort: AbortController
  /** Durable events observed since the last successful flush. */
  readonly pending: MirrorEvent[]
  /**
   * The Session this follow belongs to.
   *
   * A follow is already addressed to one Session and its frames carry no
   * Session id of their own, so this is where that identity is kept. It used to
   * live on the service, which meant that with more than one published Session
   * every stream was attributed to whichever follow happened to start last.
   */
  readonly sessionId: string
  /** The open attempt's identity, from its `start` frame or the opening baseline. */
  attemptId: string
  /** The open attempt's turn and step, which its `chunk` frames do not repeat. */
  turn: number
  step: number
  /**
   * Highest durable sequence this follow has delivered, or -1 before any.
   *
   * Published in the Session index so the mirror can compare its own extent
   * with the origin's: without it, a mirror holding no events cannot tell
   * "nothing has happened yet" from "everything was lost".
   */
  lastSeq: number
  /**
   * Lowest durable sequence this follow has delivered, or -1 before any.
   *
   * Kept for this half's own diagnostics: a follow opens on a tail, so this is
   * where the window starts, not where the Session does.
   */
  firstSeq: number
  /**
   * Whether this machine's log holds history below what the follow delivered.
   *
   * Taken from the opening snapshot's own `hasMore`, which is the only thing
   * that knows — the window's lowest sequence is the window's, not the log's.
   * Cleared when a page read reaches the beginning.
   */
  hasOlder: boolean
  /**
   * The opening snapshot's log cut, which a backwards page is read against.
   *
   * Required by the controller so a page read later cannot disagree with the
   * window the reader is looking at. -1 until a snapshot has been taken.
   */
  cursor: number
  /**
   * The opening snapshot's Session header, as far as this half reads it.
   *
   * The writer builds its own header, so anything this does not carry is what a
   * materialized Session silently loses. Measured against a real materialization:
   * `agentPreset: "standard"` went missing, and `createdAt` drifted by 7 ms because
   * the writer fell back to the first event's time. Only fields the format allows
   * and this half can vouch for are kept.
   */
  header?: WireSessionHeader
  /**
   * Whether the opening snapshot ever arrived, and why the last attempt ended.
   *
   * `cursor < 0` alone cannot say whether this follow is brand new or has been
   * failing its opening for an hour, and that difference is the whole diagnosis
   * for a mirror that will not page: the opening is delivered as one frame, so
   * anything that interrupts the read — a link that flaps, a batch the server
   * refuses — leaves the cut unset and every page read refused with it.
   */
  opened: boolean
  /** Durable events this follow has delivered, for the same diagnosis. */
  seen: number
  /** How the last attempt ended, when it ended without an abort. */
  ended?: string
}

/** The accumulator key of one step's text. */
function sessionLiveKey(sessionId: string, turn: number, step: number, kind: StreamKind): string {
  return `${sessionId}|${String(turn)}|${String(step)}|${kind}`
}

/** The settlement key of one step: what says that step is over. */
function sessionStepKey(sessionId: string, turn: number, step: number): string {
  return `${sessionId}|${String(turn)}|${String(step)}`
}

/** The accumulator key of the step one follow has open. */
function liveKey(handle: FollowHandle, kind: StreamKind): string {
  return sessionLiveKey(handle.sessionId, handle.turn, handle.step, kind)
}

/** The settlement key of the step one follow has open. */
function stepKey(handle: FollowHandle): string {
  return sessionStepKey(handle.sessionId, handle.turn, handle.step)
}

/** The engine. */
export class SessionSyncService {
  private config: SyncConfig
  private readonly hub: SyncHub
  private readonly browsers = new Set<BrowserSink>()
  private readonly follows = new Map<string, FollowHandle>()
  private server: SyncServerHandle | undefined
  private link: OriginLink | undefined
  private linked = false
  private listenError: string | undefined
  private linkError: string | undefined
  private reconcileTimer: ReturnType<typeof setInterval> | undefined
  private flushTimer: ReturnType<typeof setInterval> | undefined
  /** Distinct follow frame types seen, bounded; the contract made visible. */
  private readonly followFrameTypes = new Set<string>()
  private followEvents = 0
  /** Opening frames that carried no readable history. */
  private historyMisses = 0
  /** What the controller listed, and what survived the row filter. */
  private localItems = 0
  private localRows = 0
  /** Field names seen in the opening frames, recorded once. */
  private readonly followShapes: string[] = []
  /** Posts per route: the split between the origin and the server. */
  private readonly postCounts = new Map<string, { count: number; at: number; ok: boolean }>()
  private followError: string | undefined
  private followErrorSession: string | undefined

  /** Streaming text per step, keyed session|turn|step|kind; relayed, never mirrored. */
  private readonly liveText = new Map<string, StreamDeltaPayload>()
  private readonly liveDirty = new Set<string>()
  /** Steps whose settlement already arrived, so a late delta cannot revive them. */
  private readonly settled = new Set<string>()
  /** When each Session was last replayed at the server's request. */
  private readonly lastResync = new Map<string, number>()
  /** When each Session was last asked for an older page of history. */
  private readonly pageAsked = new Map<string, number>()
  /**
   * What the last history read did, for the settings page.
   *
   * The host half writes its log where this deployment cannot read it, and a
   * page that comes back empty is indistinguishable from a machine that has
   * nothing older — so the one fact that separates them is published here.
   */
  private lastPageRead: SyncState['page']

  /** The last publish attempt, as the settings page reports it. */
  private lastPublish: { at: number; ok: boolean; error?: string } | undefined
  private disposed = false

  private constructor(
    private readonly ctx: HostContext,
    private readonly home: string,
    config: SyncConfig,
  ) {
    this.config = config
    // The mirror emits data frames; every state frame is assembled here, where
    // the role, listener, and link facts live alongside the machine list. The
    // hub reports an incomplete mirror through the host logger rather than
    // keeping a counter nobody reads.
    this.hub = new SyncHub(frame => { this.broadcast(frame) }, () => this.view(), this.ctx.logger)
  }

  /**
   * Load the persisted configuration and build the engine.
   * @param ctx - the scoped Host context that already resolved `sessionController`.
   * @param home - Harness home directory.
   * @returns the ready service; the caller decides when to {@link start} it.
   */
  static async create(ctx: HostContext, home: string): Promise<SessionSyncService> {
    const config = await loadConfig(home, hostname())
    return new SessionSyncService(ctx, home, config)
  }

  /** Begin reconciling and bring the configured role up. */
  start(): void {
    this.reconcileTimer = setInterval(() => {
      // Swept here rather than on its own timer: a command's TTL is two
      // minutes, so a ten-second granularity costs the operator nothing, and
      // one periodic pass over the mirror is one place to reason about. The
      // gap sweep needs the same pass for the same reason: a mirror that lost a
      // batch hears nothing else, so nothing else would ever ask it again.
      this.hub.expireCommands()
      this.hub.sweepGaps()
      void this.reconcile()
    }, RECONCILE_MS)
    this.flushTimer = setInterval(() => { this.flushStream(); this.flush() }, FLUSH_MS)
    void this.applyRole()
  }

  /** Stop every timer and connection, and drop every subscriber. */
  async dispose(): Promise<void> {
    this.disposed = true
    if (this.reconcileTimer !== undefined) clearInterval(this.reconcileTimer)
    if (this.flushTimer !== undefined) clearInterval(this.flushTimer)
    for (const handle of this.follows.values()) handle.abort.abort()
    this.follows.clear()
    this.link?.stop()
    this.link = undefined
    await this.stopServer()
    this.browsers.clear()
  }

  /** The configuration as the browser should render it. */
  configView(): SyncConfig {
    return {
      ...this.config,
      syncSessions: { ...this.config.syncSessions },
    }
  }

  /** The live role, listener, link, and mirror state. */
  view(): SyncState {
    const listening = this.server !== undefined
    const linked = this.linked
    // Read once: each call rebuilds the object, and this view is assembled on
    // every state broadcast.
    const batch = this.link?.batchReport()
    return {
      role: this.config.isServer ? 'server' : 'client',
      machineName: this.config.machineName,
      serverUrl: this.config.serverUrl,
      listening,
      ...(this.listenError === undefined ? {} : { listenError: this.listenError }),
      linked,
      ...(this.linkError === undefined ? {} : { linkError: this.linkError }),
      machines: this.config.isServer ? this.hub.machines() : [],
      published: Object.values(this.config.syncSessions).filter(Boolean).length,
      ...(this.lastPublish === undefined ? {} : { publish: this.lastPublish }),
      ...(this.config.isServer ? {} : {
        follow: {
          frames: [...this.followFrameTypes],
          events: this.followEvents,
          historyMisses: this.historyMisses,
          localItems: this.localItems,
          localRows: this.localRows,
          posts: [...this.postCounts].map(([route, entry]) => route + ':' + String(entry.count) + (entry.ok ? '' : '!')),
          shapes: this.followShapes,
          ...(this.followError === undefined ? {} : { error: this.followError }),
          ...(this.followErrorSession === undefined ? {} : { sessionId: this.followErrorSession }),
        },
        ...(batch === undefined ? {} : { batch }),
        follows: [...this.follows.values()].map(handle => ({
          sessionId: handle.sessionId,
          cursor: handle.cursor,
          firstSeq: handle.firstSeq,
          lastSeq: handle.lastSeq,
          hasOlder: handle.hasOlder,
          opened: handle.opened,
          // The Session's own header as the origin stated it. Carried by the frame the
          // cursor comes from, and the only source of the fields a materialized log
          // would otherwise lose — so it is reported rather than inferred.
          ...(handle.header === undefined ? {} : { header: handle.header }),
          pending: handle.pending.length,
          events: handle.seen,
          ...(handle.ended === undefined ? {} : { ended: handle.ended }),
        })),
        ...(this.lastPageRead === undefined ? {} : { page: this.lastPageRead }),
      }),
    }
  }

  /**
   * Every local Session, newest activity first, with its publish switch.
   * @returns presentation rows for the configuration page.
   */
  async localSessions(): Promise<LocalSessionRow[]> {
    const controller = this.controller()
    if (controller === undefined) return []
    const { items } = await controller.list({}, new AbortController().signal)
    this.localItems = items.length
    // A top-level Session may report no parent as either null or undefined, and
    // testing only for undefined dropped every row when it was null -- which read
    // as "this machine has no Sessions" while the publish marks still said three.
    const rows = items
      // Subagent children are part of their parent's story, not separate rows.
      .filter(item => (item.parentSessionId ?? undefined) === undefined && item.origin !== 'subagent')
      .map(item => this.row(item))
    this.localRows = rows.length
    return rows.sort((left, right) => right.updatedAt - left.updatedAt)
  }

  /**
   * Apply one partial configuration write and persist it.
   * @param patch - the fields to change; absent fields keep their value.
   * @returns the complete configuration after the write.
   */
  async patch(patch: ConfigPatch): Promise<SyncConfig> {
    const previous = this.config
    const next: SyncConfig = {
      machineName: nonEmpty(patch.machineName) ?? previous.machineName,
      serverUrl: patch.serverUrl === undefined ? previous.serverUrl : patch.serverUrl.trim(),
      isServer: patch.isServer ?? previous.isServer,
      password: patch.password === undefined ? previous.password : patch.password,
      listenHost: nonEmpty(patch.listenHost) ?? previous.listenHost,
      listenPort: validPort(patch.listenPort) ?? previous.listenPort,
      syncSessions: { ...previous.syncSessions },
    }
    if (patch.sessionSync !== undefined) {
      if (patch.sessionSync.synced) next.syncSessions[patch.sessionSync.sessionId] = true
      else delete next.syncSessions[patch.sessionSync.sessionId]
    }
    this.config = next
    await saveConfig(this.home, next)

    const roleChanged = previous.isServer !== next.isServer
      || serverOrigin(previous.serverUrl) !== serverOrigin(next.serverUrl)
      || previous.listenHost !== next.listenHost
      || previous.listenPort !== next.listenPort
      // A rename must re-handshake: the server binds the mirror to the name the
      // token was issued for, so it cannot learn a new one on an open stream.
      || (!next.isServer && previous.machineName !== next.machineName)
    if (roleChanged) await this.applyRole()
    else if (patch.sessionSync !== undefined) await this.reconcile()
    this.broadcast({ type: 'state', state: this.view() })
    return this.configView()
  }

  /**
   * Read one page of a mirrored Session's transcript.
   * @param machineName - owning machine.
   * @param sessionId - published Session.
   * @param page - page size, the exclusive upper sequence to read below, and how
   *   much history to retain while the caller works.
   * @returns the page, or undefined when nothing is mirrored under that address.
   */
  transcript(
    machineName: string,
    sessionId: string,
    page?: { limit: number; before?: number; retain?: number; release?: boolean },
  ): MirrorTranscript | undefined {
    return this.hub.transcript(machineName, sessionId, page)
  }

  /**
   * Write one mirrored Session into this Host's own storage and archive it.
   *
   * The mirror holds a window, and this Host's storage refuses a log that does
   * not begin at the Session's beginning, so the whole mirrored window is handed
   * over and the writer decides: a Session short enough to arrive whole is
   * materialized, a paged one is refused with the reason rather than written
   * with a hole at the front.
   * @param machineName - the machine that owns the Session.
   * @param sessionId - the published Session.
   * @returns what was written, or why nothing was.
   */
  async materialize(machineName: string, sessionId: string): Promise<MaterializeResult> {
    // The ceiling is raised before anything is read: the mirror trims from the
    // front at its own cap, so a backfill walking past that cap would have each
    // page trimmed away again by the arrivals above it — the low edge parks at the
    // cap and the Session looks whole while being short. The writer still refuses
    // a log that does not begin at zero, so this is a budget, not a promise.
    let transcript = this.hub.transcript(machineName, sessionId, { limit: 100_000, retain: Number.MAX_SAFE_INTEGER })
    try {
      if (transcript === undefined) {
        return { ok: false, written: 0, skipped: 0, archived: false, reason: 'nothing is mirrored under that address' }
      }
      // The mirror usually holds the newest window, and the storage layer refuses a
      // log that does not begin at the Session's beginning, so the origin is walked
      // back to the start first. It is bounded: a Session too long to backfill in
      // this budget is reported rather than half-written.
      const rounds = await this.backfill(machineName, sessionId, transcript)
      if (rounds > 0) transcript = this.hub.transcript(machineName, sessionId, { limit: 100_000 })
      if (transcript === undefined) {
        return { ok: false, written: 0, skipped: 0, archived: false, reason: 'the Session left the mirror while backfilling' }
      }
      const events = transcript.events
      const first = events[0]
      if (first === undefined) {
        return { ok: false, written: 0, skipped: 0, archived: false, reason: 'the mirror holds no events for this Session' }
      }
      const row = this.hub.machines()
        .find(machine => machine.machineName === machineName)?.sessions.find(session => session.sessionId === sessionId)
      // The origin's own header is preferred over what can be inferred here: it
      // carries fields the mirror never sees (a real one lost `agentPreset`), and
      // its `createdAt` is the Session's start rather than its first event's time.
      const header = this.follows.get(sessionId)?.header
      return await materializeSession(
        this.ctx.get('sessionPersistence') as SessionPersistenceLike | undefined,
        this.ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined,
        {
          sessionId,
          createdAt: header?.createdAt ?? first.time,
          ...(row?.cwd === undefined && header?.cwd === undefined
            ? {}
            : { cwd: header?.cwd ?? row?.cwd }),
          ...(header?.agentPreset === undefined ? {} : { agentPreset: header.agentPreset }),
          ...(header?.origin === undefined ? {} : { origin: header.origin }),
          events,
        },
      )
    } finally {
      // The hold is for the walk, not for the Session's life: leaving it raised
      // would keep megabytes of history per materialized Session for as long as
      // this process lives, which is the cost the cap exists to bound.
      this.hub.transcript(machineName, sessionId, { limit: 1, release: true })
    }
  }

  /**
   * Walk the origin back until the mirror holds this Session's beginning.
   *
   * One round asks the origin for the page below what the mirror holds and waits;
   * the origin reads its own log and the page arrives as ordinary frames. The cap
   * is a budget rather than a limit on what is possible: a Session that needs more
   * rounds than this still materializes, just not inside one request.
   * @param machineName - owning machine.
   * @param sessionId - published Session.
   * @param transcript - the window the mirror holds now.
   * @returns how many rounds were spent.
   */
  private async backfill(
    machineName: string,
    sessionId: string,
    transcript: MirrorTranscript,
  ): Promise<number> {
    // The edge is the *lowest* sequence the mirror holds. It is passed through
    // as-is because the ask's bound is inclusive — the page the origin reads ends
    // at that event — and the translation to the page API's exclusive bound
    // happens in {@link pullOlder}, which is the one place that knows both.
    const edge = (): number | undefined =>
      this.hub.transcript(machineName, sessionId, { limit: 100_000 })?.events[0]?.seq
    let lowest = transcript.events[0]?.seq
    let rounds = 0
    let idle = 0
    while (lowest !== undefined && lowest > 1 && rounds < BACKFILL_ROUNDS) {
      if (!this.hub.askOlder(machineName, sessionId, lowest, BACKFILL_PAGE_MESSAGES)) return rounds
      // The origin reads its own log for that page, which takes longer than the
      // ask does, so one round waits in ticks and takes whatever arrived.
      let arrived = lowest
      for (let tick = 0; tick < BACKFILL_TICKS; tick += 1) {
        await new Promise<void>(resolve => { setTimeout(resolve, BACKFILL_TICK_MS) })
        const next = edge()
        if (next !== undefined && next < arrived) {
          arrived = next
          break
        }
      }
      rounds += 1
      // A round that moved nothing is not proof of the end — the origin may still
      // be reading — so a few of them have to pass before this gives up.
      idle = arrived < lowest ? 0 : idle + 1
      lowest = arrived
      if (idle >= BACKFILL_IDLE_ROUNDS) break
    }
    return rounds
  }

  /**
   * Issue one takeover prompt for a Session published to this server.
   * @param machineName - the machine that owns the Session.
   * @param sessionId - the published Session.
   * @param text - the prompt text.
   * @returns the accepted command's id, or why the command was refused.
   */
  submitCommand(
    machineName: string,
    sessionId: string,
    text: string,
  ): { ok: true; commandId: string } | { ok: false; reason: string } {
    if (!this.config.isServer) return { ok: false, reason: 'this instance is not the sync server' }
    return this.hub.submitCommand(machineName, sessionId, text, this.config.machineName)
  }

  /**
   * Subscribe one browser to every state and event frame.
   * @param sink - the browser's frame sink.
   * @returns the detacher.
   */
  attachBrowser(sink: BrowserSink): () => void {
    this.browsers.add(sink)
    sink.send({ type: 'state', state: this.view() })
    return () => { this.browsers.delete(sink) }
  }

  /** Bring the configured role up, replacing whatever was running. */
  private async applyRole(): Promise<void> {
    await this.stopServer()
    this.link?.stop()
    this.link = undefined
    this.linkError = undefined
    this.linked = false
    this.follows.forEach(handle => { handle.abort.abort() })
    this.follows.clear()

    if (this.config.isServer) {
      try {
        this.server = await startSyncServer({
          host: this.config.listenHost,
          port: this.config.listenPort,
          password: () => this.config.password,
          serverName: () => this.config.machineName,
          hub: this.hub,
          logger: this.ctx.logger,
        })
        this.listenError = undefined
      } catch (error: unknown) {
        this.server = undefined
        this.listenError = describe(error)
        this.ctx.logger.warn(`dsh-session-sync: sync server failed to bind: ${this.listenError}`)
      }
    } else {
      this.listenError = undefined
      const origin = serverOrigin(this.config.serverUrl)
      if (origin !== '') {
        this.link = new OriginLink({
          serverUrl: origin,
          password: () => this.config.password,
          machineName: () => this.config.machineName,
          logger: this.ctx.logger,
          onCommand: (command) => { void this.runCommand(command) },
          onStatus: (status) => { this.onLinkStatus(status) },
          onResync: (sessionId) => { this.resyncSession(sessionId) },
          onOlder: (sessionId, beforeSeq, maxMessages) => {
            void this.pullOlder(sessionId, beforeSeq, maxMessages)
          },
          onPost: (path, ok, error) => { this.notePublish(path, ok, error) },
        })
        this.link.start()
      }
    }
    await this.reconcile()
  }

  /** Tear the server-role listener down, if one is up. */
  private async stopServer(): Promise<void> {
    const server = this.server
    this.server = undefined
    if (server === undefined) return
    try {
      await server.close()
    } catch (error: unknown) {
      this.ctx.logger.warn(`dsh-session-sync: sync server shutdown failed: ${describe(error)}`)
    }
  }

  /** React to one link transition, re-reading history after a reconnect. */
  private onLinkStatus(status: { linked: boolean; error?: string }): void {
    const wasLinked = this.linked
    this.linked = status.linked
    this.linkError = status.error
    // Events published during an outage are gone with the socket. Re-opening
    // each follow replays its snapshot, and the server's sequence dedupe makes
    // the replay idempotent, so nothing is lost and nothing is doubled.
    if (status.linked && !wasLinked) {
      this.restartFollows()
      // The index follows the replay out rather than waiting for the next
      // reconcile tick: a replayed snapshot names a Session the fresh mirror has
      // not listed yet, and a mirror with no Session to append to would drop it.
      void this.reconcile()
    }
    this.broadcast({ type: 'state', state: this.view() })
  }

  /**
   * Re-open every tracked follow so each one replays its opening snapshot.
   *
   * The buffer is emptied into the link *before* the follow is torn down. A
   * follow that is aborted takes its `pending` with it, and the link flaps on
   * every failed post — so a burst sitting in that buffer when the stream
   * dropped was discarded, and because it sat above everything the mirror held,
   * the loss left no hole to notice: just a Session that was quietly a little
   * behind, forever.
   */
  private restartFollows(): void {
    const sessionIds = [...this.follows.keys()]
    for (const [sessionId, handle] of this.follows) this.drain(handle, sessionId)
    for (const handle of this.follows.values()) handle.abort.abort()
    this.follows.clear()
    for (const sessionId of sessionIds) this.startFollow(sessionId)
  }

  /**
   * Hand one follow's buffered events to the link, so aborting it loses nothing.
   * @param handle - the follow about to be replaced.
   * @param sessionId - the Session it tracks.
   */
  private drain(handle: FollowHandle, sessionId: string): void {
    if (handle.pending.length === 0) return
    this.link?.publishFrames(sessionId, handle.pending.splice(0, handle.pending.length))
  }

  /**
   * Read a page of this Session's history for the mirror.
   *
   * A follow opens on a tail window, so the mirror's copy begins
   * mid-conversation and paging inside it can never reach the start. This is the
   * only path to what came before, and it is driven by a reader asking: sending
   * the whole log for every published Session would undo the reason the mirror
   * serves a page at all.
   *
   * The page is cut against the follow's own opening cursor, so it cannot
   * disagree with the window being read, and its events go out through the same
   * buffer and outbox as live ones — which is what makes them arrive in order
   * and survive a failed post.
   *
   * `throughSeq` arrives as the *inclusive* upper bound the reader asked for —    * the lowest sequence its window holds — while the controller's `beforeSeq` is
   * exclusive, so the page is asked for one past it. Reading the reader's value
   * as if it were already exclusive left exactly that one event missing from
   * every page, which put a hole at every page boundary of a backfill.
   * @param sessionId - the Session the server wants older history for.
   * @param throughSeq - the reader's lowest held sequence; the page ends here.
   * @param maxMessages - how many messages the page should span, at most.
   */
  private async pullOlder(sessionId: string, throughSeq: number, maxMessages: number): Promise<void> {
    const handle = this.follows.get(sessionId)
    const controller = this.controller()
    // The reader's bound is inclusive; the page API's is not.
    const beforeSeq = throughSeq + 1
    // Named rather than merged: every one of these has a different repair, and
    // the merged text they used to share ("no follow or no page API") could not
    // tell an unopened follow from a missing service. That ambiguity is what
    // kept this feature's real fault invisible for a round.
    const skip: NonNullable<SyncState['page']>['reason'] =
      controller === undefined ? 'no-controller'
        : typeof controller.page !== 'function' ? 'no-page-api'
          : handle === undefined ? 'no-follow'
            : handle.cursor < 0 ? 'no-cursor'
              : undefined
    this.lastPageRead = {
      sessionId,
      beforeSeq,
      ...(handle === undefined ? {} : { throughSeq: handle.cursor }),
      ...(skip === undefined ? {} : { reason: skip }),
    }
    if (skip !== undefined || handle === undefined) return
    const now = Date.now()
    const previous = this.pageAsked.get(sessionId)
    if (previous !== undefined && now - previous < PAGE_FLOOR_MS) {
      this.lastPageRead = { ...this.lastPageRead, reason: 'rate-limited' }
      return
    }
    this.pageAsked.set(sessionId, now)
    try {
      const page = await controller.page(
        {
          address: { kind: 'session', sessionId },
          throughSeq: handle.cursor,
          beforeSeq,
          maxMessages,
        },
        handle.abort.signal,
      )
      let added = 0
      if (page.records.length === 0) {
        this.ctx.logger.info(`dsh-session-sync: no earlier event below ${String(beforeSeq)} for "${sessionId}"`)
      } else {
        // The page goes to the link *now*, as one batch, rather than into the
        // follow's pending buffer. The buffer belongs to one open attempt: a resync
        // aborts that attempt and replaces the handle, and the timer may not have
        // emptied it by then. Measured: a 151-event page read correctly, buffered,
        // and never posted, because a resync landed in between (`missingEvents`
        // stayed at 1 while the origin reported the page was served). The outbox is
        // the ordering authority either way, and it is not tied to a handle.
        const events: MirrorEvent[] = []
        for (const record of page.records) {
          const event = record.event as WireEvent | undefined
          if (event === undefined || typeof event.seq !== 'number') continue
          events.push(mirrorOf(handle, event))
        }
        added = events.length
        this.link?.publishFrames(sessionId, events)
      }
      // The page knows where the log begins, so the next index tells the truth
      // about whether anything is still below — which is how the reader's
      // "older" control finally goes away.
      const hadOlder = handle.hasOlder
      handle.hasOlder = page.hasMore
      // ...and the index has to be re-sent for that to reach the mirror: it is
      // published on a reconcile, and `hasOlder` is only ever *named* when true,
      // so a page that reached the beginning would otherwise leave the mirror
      // believing there is more forever.
      if (hadOlder !== handle.hasOlder) void this.reconcile()
      this.lastPageRead = {
        sessionId,
        beforeSeq,
        throughSeq: handle.cursor,
        records: page.records.length,
        hasMore: page.hasMore,
      }
      if (added > 0) {
        this.ctx.logger.info(`dsh-session-sync: sent ${String(added)} earlier event(s) of "${sessionId}"`)
      }
    } catch (error: unknown) {
      this.lastPageRead = {
        sessionId,
        beforeSeq,
        throughSeq: handle.cursor,
        error: describe(error),
      }
      this.ctx.logger.warn(`dsh-session-sync: reading history for "${sessionId}" failed: ${describe(error)}`)
    }
  }

  /**
   * Re-open one Session's follow because its mirror reported a hole.
   *
   * The opening snapshot is the whole retained history, so replaying it hands
   * back whatever a lost batch never delivered — and the mirror now decides
   * what is new by membership rather than by a high-water mark, which is what
   * makes that replay able to fill a hole instead of being rejected as old.
   *
   * A Session this machine does not publish is ignored: the request outlived a
   * switch that was turned off here. The rest is rate-limited, because a broken
   * mirror keeps asking and a follow is not free to open.
   * @param sessionId - the Session the server says is incomplete.
   */
  private resyncSession(sessionId: string): void {
    const handle = this.follows.get(sessionId)
    if (handle === undefined) return
    const now = Date.now()
    const previous = this.lastResync.get(sessionId)
    if (previous !== undefined && now - previous < RESYNC_FLOOR_MS) return
    this.lastResync.set(sessionId, now)
    // Same reason as a link-up restart: the buffer goes out before the follow
    // that holds it is replaced.
    this.drain(handle, sessionId)
    handle.abort.abort()
    this.follows.delete(sessionId)
    this.startFollow(sessionId)
    this.ctx.logger.info(`dsh-session-sync: replaying "${sessionId}" at the server's request`)
  }

  /** Re-list local Sessions, reconcile the follow set, and publish the index. */
  private async reconcile(): Promise<void> {
    if (this.disposed || this.controller() === undefined) return
    let rows: LocalSessionRow[]
    try {
      rows = await this.localSessions()
    } catch (error: unknown) {
      this.ctx.logger.warn(`dsh-session-sync: listing Sessions failed: ${describe(error)}`)
      return
    }
    const desired = new Set(rows.filter(row => row.synced).map(row => row.sessionId))
    for (const [sessionId, handle] of [...this.follows]) {
      if (desired.has(sessionId)) continue
      handle.abort.abort()
      this.follows.delete(sessionId)
    }
    for (const sessionId of desired) {
      if (!this.follows.has(sessionId)) this.startFollow(sessionId)
    }
    this.link?.publishIndex({
      machineName: this.config.machineName,
      sessions: rows.filter(row => row.synced).map(row => {
        const handle = this.follows.get(row.sessionId)
        const lastSeq = handle?.lastSeq
        return {
          sessionId: row.sessionId,
          title: row.title,
          updatedAt: row.updatedAt,
          running: row.running,
          ...(row.cwd === undefined ? {} : { cwd: row.cwd }),
          // Omitted rather than sent as -1: the mirror reads absence as "this
          // machine has not read a sequence yet", which is not the same claim as
          // "this Session has no events".
          ...(lastSeq === undefined || lastSeq < 0 ? {} : { lastSeq }),
          // Only said when true: the mirror reads absence as "no history below
          // the window", which is the answer for a Session that arrived whole.
          ...(handle?.hasOlder === true ? { hasOlder: true } : {}),
        }
      }),
    } satisfies PublishIndexPayload)
  }

  /**
   * Record what became of one publish attempt.
   *
   * The settings page used to call "marked in the config" published, which is
   * how a client that stopped publishing entirely could still read 宸插悓姝ヤ細璇濇暟 3
   * while the server held none. Only `/publish` and `/frames` are watched: an
   * ack or a status read saying nothing about the mirror is not a publish.
   * @param path - the route the link called.
   * @param ok - whether the server accepted it.
   * @param error - why not, when it did not.
   */
  private notePublish(path: string, ok: boolean, error?: string): void {
    // Count every route the link posts to. Which of them moves is the difference
    // between "the origin never sent it" and "the server did not take it", and
    // that difference has been guessed at twice in this feature already.
    const previous = this.postCounts.get(path)
    this.postCounts.set(path, { count: (previous?.count ?? 0) + 1, at: Date.now(), ok })
    if (path !== '/publish' && path !== '/frames') return
    this.lastPublish = {
      at: Date.now(),
      ok,
      ...(error === undefined ? {} : { error }),
    }
  }

  /** Open one `follow` stream and absorb its frames into the pending buffer. */
  private startFollow(sessionId: string): void {
    const controller = this.controller()
    if (controller === undefined) return
    const handle: FollowHandle = {
      abort: new AbortController(),
      pending: [],
      sessionId,
      attemptId: '',
      turn: 0,
      step: 0,
      lastSeq: -1,
      firstSeq: -1,
      hasOlder: false,
      cursor: -1,
      opened: false,
      seen: 0,
    }
    this.follows.set(sessionId, handle)
    void (async () => {
      try {
        const stream = controller.follow(
          { address: { kind: 'session', sessionId }, assistantStream: true },
          handle.abort.signal,
        )
        for await (const frame of stream) this.absorb(handle, frame)
        // A stream that ends without an abort is not a Session that stopped
        // being interesting: it is an attempt that failed. It is named here so
        // the index can say so, and the next reconcile re-opens it.
        if (!handle.abort.signal.aborted) handle.ended = 'the follow stream ended'
      } catch (error: unknown) {
        if (!handle.abort.signal.aborted) {
          const reason = describe(error)
          handle.ended = reason
          this.followError = reason
          this.followErrorSession = sessionId
          this.ctx.logger.warn(`dsh-session-sync: follow for "${sessionId}" ended: ${reason}`)
        }
      } finally {
        if (this.follows.get(sessionId) === handle) this.follows.delete(sessionId)
      }
    })()
  }

  /**
   * Take the streaming text out of one follow frame.
   *
   * With `assistantStream: true` a follow yields
   * `{ type: 'assistant-stream', frame }`, where the frame is a `start` (the
   * attempt's identity, turn, and step), a dense `chunk` carrying one
   * `text-delta` or `reasoning-delta`, or an `end` whose outcome says whether
   * the attempt was committed or abandoned.
   *
   * The wire sends deltas; everything this plugin relays is the whole text so
   * far, so they are accumulated here per Session, step, and kind, and a lost
   * frame heals on the next one. The durable path is not touched: a chunk this
   * reader does not recognise is simply ignored.
   * @param handle - the follow the frame arrived on, which owns the identity
   *   every field below is keyed by: several follows are open at once, and a
   *   service-wide "current Session" attributed one Session's stream to another.
   * @param frame - one frame from that follow stream.
   */
  private absorbStream(handle: FollowHandle, frame: unknown): void {
    const envelope = jsonObject(frame)
    if (envelope === undefined || envelope['type'] !== 'assistant-stream') return
    const record = jsonObject(envelope['frame'])
    if (record === undefined) return
    const type = record['type']
    if (type === 'start') {
      this.openAttempt(handle, record)
      return
    }
    if (type === 'chunk') {
      this.takeChunk(handle, record)
      return
    }
    if (type === 'end') {
      const outcome = record['outcome'] as Record<string, unknown> | undefined
      // An abandoned attempt has no durable settlement to replace its row, so
      // the reader is told the text is gone. A committed one is replaced by its
      // own `assistant/message`, which is the durable path's business.
      if (outcome !== undefined && outcome['kind'] === 'abandoned') this.dropStep(handle)
    }
  }

  /**
   * Adopt one attempt's identity and forget whatever step it replaces.
   *
   * A retried step re-opens the same turn and step, so without this the second
   * attempt's deltas would be appended to the first attempt's text.
   * @param handle - the follow the start frame arrived on.
   * @param record - one `start` frame.
   */
  private openAttempt(handle: FollowHandle, record: Record<string, unknown>): void {
    const previousTurn = handle.turn
    const previousStep = handle.step
    if (typeof record['attemptId'] === 'string') handle.attemptId = record['attemptId']
    if (typeof record['turn'] === 'number') handle.turn = record['turn']
    if (typeof record['step'] === 'number') handle.step = record['step']
    this.forgetStep(handle.sessionId, previousTurn, previousStep)
  }

  /**
   * Accumulate one streamed chunk of the open attempt.
   * @param handle - the follow the chunk arrived on.
   * @param record - one `chunk` frame.
   */
  private takeChunk(handle: FollowHandle, record: Record<string, unknown>): void {
    // A controller mounted after this attempt started has no `start` frame to
    // reset on; the first chunk of another attempt is that reset.
    if (typeof record['attemptId'] === 'string' && record['attemptId'] !== handle.attemptId) {
      handle.attemptId = record['attemptId']
      this.forgetStep(handle.sessionId, handle.turn, handle.step)
    }
    const chunk = jsonObject(record['chunk'])
    if (chunk === undefined) return
    const kind = chunk['type'] === 'reasoning-delta' ? 'reasoning' : chunk['type'] === 'text-delta' ? 'text' : undefined
    if (kind === undefined) return
    this.appendStream(handle, kind, typeof chunk['text'] === 'string' ? chunk['text'] : '')
  }

  /**
   * Append one delta to its step's text and mark that step for relay.
   * @param handle - the follow the delta belongs to.
   * @param kind - which of the step's two texts it is.
   * @param text - the delta itself.
   */
  private appendStream(handle: FollowHandle, kind: StreamKind, text: string): void {
    if (text === '' || this.settled.has(stepKey(handle))) return
    const key = liveKey(handle, kind)
    const base = this.liveText.get(key)?.text ?? ''
    this.liveText.set(key, {
      sessionId: handle.sessionId,
      turn: handle.turn,
      step: handle.step,
      kind,
      text: base + text,
    })
    this.liveDirty.add(key)
    while (this.liveText.size > LIVE_LIMIT) {
      const oldest = this.liveText.keys().next()
      if (oldest.done === true || oldest.value === key) break
      this.liveText.delete(oldest.value)
      this.liveDirty.delete(oldest.value)
    }
  }

  /**
   * Forget one step entirely: its text, its pending relay, and any settlement
   * mark it carried.
   * @param sessionId - the Session that owns the step.
   * @param turn - the step's turn.
   * @param step - the step number.
   */
  private forgetStep(sessionId: string, turn: number, step: number): void {
    for (const kind of STREAM_KINDS) {
      const key = sessionLiveKey(sessionId, turn, step, kind)
      this.liveText.delete(key)
      this.liveDirty.delete(key)
    }
    this.settled.delete(sessionStepKey(sessionId, turn, step))
  }

  /**
   * Tell the reader the open step's text is gone, and refuse any late delta for
   * it. Only an abandoned attempt needs the frame: nothing follows it, so
   * nothing else would replace the row.
   * @param handle - the follow whose attempt was abandoned.
   */
  private dropStep(handle: FollowHandle): void {
    for (const kind of STREAM_KINDS) {
      const key = liveKey(handle, kind)
      const previous = this.liveText.get(key)
      if (previous === undefined) continue
      this.liveText.set(key, { ...previous, text: '' })
      this.liveDirty.add(key)
    }
    this.settled.add(stepKey(handle))
    this.pruneSettled()
  }

  /**
   * Stop relaying one settled step, and drop what it accumulated.
   *
   * A delta and its settlement travel as two separate posts, so without this a
   * delta that lost the race would put the live row back after the durable
   * message that replaced it.
   * @param handle - the follow the event arrived on.
   * @param event - one durable mirrored event.
   */
  private retireStream(handle: FollowHandle, event: WireEvent): void {
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return
    const data = event.data as Record<string, unknown> | undefined
    const turn = typeof data?.['turn'] === 'number' ? data['turn'] : handle.turn
    const step = typeof data?.['step'] === 'number' ? data['step'] : handle.step
    this.forgetStep(handle.sessionId, turn, step)
    this.settled.add(sessionStepKey(handle.sessionId, turn, step))
    this.pruneSettled()
  }

  /** Bound the settlement marks, newest kept. */
  private pruneSettled(): void {
    while (this.settled.size > LIVE_LIMIT) {
      const oldest = this.settled.values().next()
      if (oldest.done === true) break
      this.settled.delete(oldest.value)
    }
  }

  /**
   * Adopt the opening frame's live attempt, so a follow that opens in the
   * middle of a step still shows the text that was streamed before it.
   *
   * The baseline nests its compact runs under `activeAttempt`, and `nextIndex`
   * says how many deltas they represent: DSH's own Web client expands them and
   * stops there, and so does this.
   * @param handle - the follow that just opened.
   * @param frame - its opening frame.
   */
  private seedStream(handle: FollowHandle, frame: Record<string, unknown>): void {
    const baseline = frame['assistantStream'] as Record<string, unknown> | undefined
    const attempt = baseline?.['activeAttempt'] as Record<string, unknown> | undefined
    if (attempt === undefined) return
    if (typeof attempt['attemptId'] === 'string') handle.attemptId = attempt['attemptId']
    if (typeof attempt['turn'] === 'number') handle.turn = attempt['turn']
    if (typeof attempt['step'] === 'number') handle.step = attempt['step']
    const runs = Array.isArray(attempt['stream']) ? attempt['stream'] as readonly Record<string, unknown>[] : []
    const limit = typeof attempt['nextIndex'] === 'number' ? attempt['nextIndex'] : Number.MAX_SAFE_INTEGER
    let members = 0
    for (const run of runs) {
      const kind = run['type'] === 'reasoning-chunks' ? 'reasoning' : run['type'] === 'text-chunks' ? 'text' : undefined
      if (kind === undefined) continue
      const texts = Array.isArray(run['texts']) ? run['texts'] : []
      for (const part of texts) {
        if (typeof part !== 'string' || part === '') continue
        if (members >= limit) return
        members += 1
        this.appendStream(handle, kind, part)
      }
    }
  }

  private absorb(handle: FollowHandle, frame: FollowFrame): void {
    const frameType = typeof (frame as { type?: unknown }).type === 'string' ? (frame as { type: string }).type : 'unknown'
    if (this.followFrameTypes.size < 12) this.followFrameTypes.add(frameType)
    this.followEvents += 1
    const carrier = frame as unknown as Record<string, unknown>
    // The streaming frame's field names, recorded once. The durable side needed
    // no such reading; the stream has now cost three attempts, so it stops being
    // guessed at.
    if (frameType === 'assistant-stream' && this.followShapes.length < 8) {
      const keysOf = (value: unknown): string => value !== null && typeof value === 'object' ? Object.keys(value as Record<string, unknown>).slice(0, 10).join(',') : typeof value
      const inner = carrier['frame'] ?? carrier['assistantStream'] ?? carrier
      const chunk = inner !== null && typeof inner === 'object' ? (inner as Record<string, unknown>)['chunk'] : undefined
      this.followShapes.push('assistant-stream{' + keysOf(carrier) + '} inner{' + keysOf(inner) + '} chunk{' + keysOf(chunk) + '}')
    }
    this.absorbStream(handle, frame)
    // The opening frame carries the Session's history and, when one is open, the
    // attempt that is still streaming. The transport writes it as
    // { type: 'opened', cursor, page }, while this half's own contract says
    // { type: 'snapshot', records }, so both are read: whichever arrives is not
    // ours to choose, and a history nobody reads is a Session that looks empty.
    if (frameType === 'snapshot' || frameType === 'opened') this.seedStream(handle, carrier)
    // The opening's cut, kept because a backwards page must be read against the
    // same point the window was taken at — and the opening's own `hasMore`,
    // which is the only statement about history below the window.
    if (frameType === 'snapshot' || frameType === 'opened') {
      if (typeof carrier['cursor'] === 'number') handle.cursor = carrier['cursor']
      if (typeof carrier['hasMore'] === 'boolean') handle.hasOlder = carrier['hasMore']
      // The opening is the frame a page read depends on, so whether it ever
      // arrived is recorded rather than inferred from the cursor: an empty
      // Session legitimately cuts at -1, and a follow that never opened must not
      // look like one that did.
      if (typeof carrier['cursor'] === 'number') handle.opened = true
      // The header the origin stated, kept for the writer: it builds its own log
      // header, so what is not carried here is what a materialized Session loses.
      const header = jsonObject(carrier['header'])
      if (header !== undefined) handle.header = header as unknown as WireSessionHeader
    }
    const page = carrier['page'] as Record<string, unknown> | undefined
    const records = Array.isArray(carrier['records'])
      ? carrier['records'] as readonly { event?: unknown }[]
      : Array.isArray(page?.['records']) ? page['records'] as readonly { event?: unknown }[] : undefined
    if (records !== undefined) {
      // What the opening frame actually looks like, recorded once: the field
      // names are the one thing this reader has had to guess, and a guess that
      // is wrong reads as "the Session has no history" rather than as an error.
      if (this.followShapes.length < 4 && records.length > 0) {
        const keys = (value: unknown): string => value !== null && typeof value === 'object' ? Object.keys(value as Record<string, unknown>).slice(0, 8).join(',') : typeof value
        this.followShapes.push(frameType + '{' + keys(frame) + '} rec{' + keys(records[0]) + '}')
      }
      for (const record of records) {
        if (record !== null && typeof record === 'object' && record.event !== undefined) {
          const event = record.event as WireEvent
          buffer(handle, event)
          this.retireStream(handle, event)
        }
      }
      return
    }
    if (frameType === 'snapshot' || frameType === 'opened') this.historyMisses += 1
    if (carrier['type'] === 'event' && 'event' in frame) {
      buffer(handle, frame.event)
      this.retireStream(handle, frame.event)
    }
  }

  /** Relay the streaming text accumulated since the last tick. */
  private flushStream(): void {
    if (this.liveDirty.size === 0) return
    for (const key of this.liveDirty) {
      const payload = this.liveText.get(key)
      if (payload === undefined) continue
      this.link?.publishStream(payload)
    }
    this.liveDirty.clear()
  }

  private flush(): void {
    const link = this.link
    if (link === undefined || !link.linked) return
    for (const [sessionId, handle] of this.follows) {
      if (handle.pending.length === 0) continue
      link.publishFrames(sessionId, handle.pending.splice(0, handle.pending.length))
    }
  }

  /** Admit a takeover prompt into the local Session it names. */
  private async runCommand(command: DownstreamCommand): Promise<void> {
    const controller = this.controller()
    if (controller === undefined) return
    const link = this.link
    // A machine must not be able to drive a Session it stopped publishing.
    if (this.config.syncSessions[command.sessionId] !== true) {
      link?.ackCommand(command.commandId, command.sessionId, false, 'this Session is no longer published')
      return
    }
    // The server retires an expired command on its own sweep, but the sweep is
    // periodic: this is the check that makes the rule true at the instant the
    // prompt would otherwise reach the Session.
    if (Date.now() > command.expiresAt) {
      link?.ackCommand(command.commandId, command.sessionId, false, 'the prompt expired before it arrived')
      return
    }
    try {
      await controller.prompt({
        requestId: mintRequestId(),
        sessionId: command.sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: command.text }],
      }, new AbortController().signal)
      link?.ackCommand(command.commandId, command.sessionId, true)
    } catch (error: unknown) {
      const reason = describe(error)
      this.ctx.logger.warn(`dsh-session-sync: takeover prompt failed: ${reason}`)
      link?.ackCommand(command.commandId, command.sessionId, false, reason)
    }
  }

  /** Read the Session control service, which may not be mounted in every composition. */
  private controller(): SessionControllerLike | undefined {
    const found = this.ctx.get('sessionController')
    if (found === undefined || found === null) return undefined
    return found as SessionControllerLike
  }

  /** Project one summary onto a presentation row. */
  private row(item: SessionSummaryRow): LocalSessionRow {
    const title = item.projections?.values['title']
    return {
      sessionId: item.sessionId,
      title: typeof title === 'string' && title.trim().length > 0 ? title : item.sessionId,
      updatedAt: item.updatedAt,
      running: item.running,
      blank: item.blank,
      ...(item.cwd === undefined ? {} : { cwd: item.cwd }),
      synced: this.config.syncSessions[item.sessionId] === true,
    }
  }

  /** Send one frame to every subscribed browser. */
  private broadcast(frame: SyncStreamFrame): void {
    if (frame.type === 'state' && this.browsers.size === 0) return
    for (const sink of [...this.browsers]) {
      try {
        sink.send(frame)
      } catch {
        this.browsers.delete(sink)
      }
    }
  }
}

/** Record what one event does to a follow's extent, and hand back its wire shape. */
function mirrorOf(handle: FollowHandle, event: WireEvent): MirrorEvent {
  handle.seen += 1
  // The watermark is what the index publishes, so it tracks what this follow has
  // *read* rather than what is still queued: a flush empties the buffer, and an
  // extent that forgot itself on every flush would tell the mirror nothing.
  if (typeof event.seq === 'number' && event.seq > handle.lastSeq) handle.lastSeq = event.seq
  // The lower end matters as much as the upper one now: it is how the mirror
  // learns that the tail window it received is not the whole conversation.
  if (typeof event.seq === 'number' && (handle.firstSeq < 0 || event.seq < handle.firstSeq)) {
    handle.firstSeq = event.seq
  }
  return {
    type: event.type,
    seq: event.seq,
    time: event.time,
    data: event.data,
    // What this event replaced travels with it for the same reason its
    // placement does: a reader that drops the citation cannot tell a
    // superseded frame from a live one.
    ...(event.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: event.sourceEventSeqs }),
    // Surface placement travels with the event: without it a replacement window
    // reads as an append, and the console shows the history it superseded.
    ...(event.surfaceOp === undefined ? {} : { surfaceOp: event.surfaceOp }),
  }
}

/** Append one durable event to the buffer, bounded so memory cannot run away. */
function buffer(handle: FollowHandle, event: MirrorEvent): void {
  handle.pending.push(mirrorOf(handle, event))
  if (handle.pending.length > BUFFER_LIMIT) {
    handle.pending.splice(0, handle.pending.length - BUFFER_LIMIT)
  }
}

/**
 * Read one JSON object out of a wire value.
 *
 * The frames this reader walks are typed as JSON, and a carrier that serialises
 * one leaves it as a string; a value that is neither is simply not the object
 * being looked for.
 * @param value - a frame, a frame field, or anything else.
 * @returns the object, or undefined when the value is not one.
 */
function jsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return undefined
    try { return jsonObject(JSON.parse(trimmed) as unknown) } catch { return undefined }
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** One optional non-empty string. */
function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return value.trim().length > 0 ? value.trim() : undefined
}

/** One optional listenable port. */
function validPort(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  return Number.isInteger(value) && value > 0 && value < 65_536 ? value : undefined
}

/** Mint one client-side prompt identity. */
function mintRequestId(): string {
  return `sync-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/** Human-readable one-line failure text. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
