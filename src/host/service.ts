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
} from './dsh.ts'
import { SyncHub, type BrowserSink } from './hub.ts'
import { OriginLink, startSyncServer, type SyncServerHandle } from './transport.ts'

/** How often the local index is re-read and the follow set reconciled. */
const RECONCILE_MS = 10_000

/** How often buffered events are handed to the link. */
const FLUSH_MS = 400

/** Bound on events buffered per Session while the link is down. */
const BUFFER_LIMIT = 4_000

/** One tracked `follow` stream. */
interface FollowHandle {
  readonly abort: AbortController
  /** Durable events observed since the last successful flush. */
  readonly pending: MirrorEvent[]
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
  /** The Session whose frames are being absorbed right now. */
  private streamSessionId = ''
  /** The running attempt's turn and step, taken from its start frame. */
  private streamTurn = 0
  private streamStep = 0

  /** Streaming text per step, keyed session|turn|step|kind; relayed, never mirrored. */
  private readonly liveText = new Map<string, StreamDeltaPayload>()
  private readonly liveDirty = new Set<string>()

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
    // the role, listener, and link facts live alongside the machine list.
    this.hub = new SyncHub(frame => { this.broadcast(frame) }, () => this.view())
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
      // one periodic pass over the mirror is one place to reason about.
      this.hub.expireCommands()
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
   * Read one mirrored Session's transcript.
   * @param machineName - owning machine.
   * @param sessionId - published Session.
   * @returns the transcript, or undefined when nothing is mirrored under that address.
   */
  transcript(machineName: string, sessionId: string): MirrorTranscript | undefined {
    return this.hub.transcript(machineName, sessionId)
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
    if (status.linked && !wasLinked) this.restartFollows()
    this.broadcast({ type: 'state', state: this.view() })
  }

  /** Re-open every tracked follow so each one replays its opening snapshot. */
  private restartFollows(): void {
    const sessionIds = [...this.follows.keys()]
    for (const handle of this.follows.values()) handle.abort.abort()
    this.follows.clear()
    for (const sessionId of sessionIds) this.startFollow(sessionId)
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
      sessions: rows.filter(row => row.synced).map(row => ({
        sessionId: row.sessionId,
        title: row.title,
        updatedAt: row.updatedAt,
        running: row.running,
        ...(row.cwd === undefined ? {} : { cwd: row.cwd }),
      })),
    } satisfies PublishIndexPayload)
  }

  /**
   * Record what became of one publish attempt.
   *
   * The settings page used to call "marked in the config" published, which is
   * how a client that stopped publishing entirely could still read 已同步会话数 3
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

  /** Open one `follow` stream and absorb its frames into the pending buffer. */  private startFollow(sessionId: string): void {
    const controller = this.controller()
    if (controller === undefined) return
    this.streamSessionId = sessionId
    const handle: FollowHandle = { abort: new AbortController(), pending: [] }
    this.follows.set(sessionId, handle)
    void (async () => {
      try {
        const stream = controller.follow(
          { address: { kind: 'session', sessionId }, assistantStream: true },
          handle.abort.signal,
        )
        for await (const frame of stream) this.absorb(handle, frame)
      } catch (error: unknown) {
        if (!handle.abort.signal.aborted) {
          this.followError = describe(error)
          this.followErrorSession = sessionId
          this.ctx.logger.warn(`dsh-session-sync: follow for "${sessionId}" ended: ${describe(error)}`)
        }
      } finally {
        if (this.follows.get(sessionId) === handle) this.follows.delete(sessionId)
      }
    })()
  }

  /** Record one follow frame's durable events. */
  /**
   * Take whatever streaming text a follow frame carries.
   *
   * The frame family is not ours to define: the contract is structural and the
   * stream rides it as a variant we cannot name from here, so this reads the
   * shapes defensively -- an opening baseline, a stream frame, or a bare chunk
   * -- and accumulates the text each one carries. Anything it does not
   * recognise is left alone, so the durable path is never at risk.
   * @param frame - one frame from the follow stream.
   */
  private absorbStream(frame: unknown): void {
    const seen = new Set<unknown>()
    const visit = (value: unknown): void => {
      // A chunk may arrive as serialised JSON (the contract types it JsonValue),
      // in which case the object this reader needs is one parse away. Bounded to
      // one level: a string that is not JSON is simply not a chunk.
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try { visit(JSON.parse(trimmed) as unknown) } catch { /* not JSON: not a chunk */ }
        }
        return
      }
      if (typeof value !== 'object' || value === null || seen.has(value)) return
      seen.add(value)
      const record = value as Record<string, unknown>
      // A chunk frame carries no turn/step of its own: the attempt's start frame
      // does, so it is remembered here and used for whatever follows.
      if (record['type'] === 'start') {
        if (typeof record['turn'] === 'number') this.streamTurn = record['turn']
        if (typeof record['step'] === 'number') this.streamStep = record['step']
      }
      if (Array.isArray(record['stream'])) { for (const item of record['stream']) visit(item) }
      visit(record['chunk'])
      visit(record['frame'])
      visit(record['assistantStream'])
      if (Array.isArray(record['chunks'])) { for (const item of record['chunks']) visit(item) }
      // The compact record families the Session stream carries: each is one run
      // of deltas for a kind, in `texts`. This is the shape an assistant-stream
      // frame actually holds (see @deepseek-ai/dsh-llm's AssistantStreamRecord),
      // and it is why reading only a { type: 'text', text } chunk found nothing.
      const recordType = record['type']
      const texts = record['texts']
      if (Array.isArray(texts) && (recordType === 'text-chunks' || recordType === 'reasoning-chunks')) {
        const kind = recordType === 'reasoning-chunks' ? 'reasoning' : 'text'
        const text = texts.filter(part => typeof part === 'string').join('')
        if (text !== '') {
          const sessionId = this.streamSessionId
          if (sessionId !== '') {
            const turn = typeof record['turn'] === 'number' ? record['turn'] : 0
            const step = typeof record['step'] === 'number' ? record['step'] : 0
            const key = sessionId + '|' + String(turn) + '|' + String(step) + '|' + kind
            const previous = this.liveText.get(key)
            this.liveText.set(key, { sessionId, turn, step, kind, text: (previous?.text ?? '') + text })
            this.liveDirty.add(key)
          }
        }
        return
      }
      const inner = record['chunk'] as Record<string, unknown> | undefined
      const source = inner !== undefined && typeof inner === 'object' ? inner : record
      // The model's own chunk types: text-delta and reasoning-delta carry `text`.
      // Matching the bare words 'text'/'reasoning' is what kept this reader from
      // ever taking a delta, so both spellings are accepted.
      const sourceType = source['type']
      const kind = sourceType === 'reasoning-delta' || sourceType === 'reasoning'
        ? 'reasoning'
        : sourceType === 'text-delta' || sourceType === 'text' ? 'text' : undefined
      if (kind === undefined) return
      const text = typeof source['text'] === 'string' ? source['text'] : typeof source['delta'] === 'string' ? source['delta'] : undefined
      if (text === undefined || text === '') return
      const turn = typeof record['turn'] === 'number' ? record['turn'] : this.streamTurn
      const step = typeof record['step'] === 'number' ? record['step'] : this.streamStep
      const sessionId = this.streamSessionId
      if (sessionId === '') return
      const key = `${sessionId}|${String(turn)}|${String(step)}|${kind}`
      const previous = this.liveText.get(key)
      const base = previous?.text ?? ''
      if (text !== '' && base.endsWith(text)) { this.liveDirty.add(key); return }
      this.liveText.set(key, { sessionId, turn, step, kind, text: base + text })
      this.liveDirty.add(key)
    }
    visit(frame)
  }

  private absorb(handle: FollowHandle, frame: FollowFrame): void {
    const frameType = typeof (frame as { type?: unknown }).type === 'string' ? (frame as { type: string }).type : 'unknown'
    if (this.followFrameTypes.size < 12) this.followFrameTypes.add(frameType)
    this.followEvents += 1
    // The streaming frame's field names, recorded once. The durable side needed
    // no such reading; the stream has now cost three attempts, so it stops being
    // guessed at.
    if (frameType === 'assistant-stream' && this.followShapes.length < 8) {
      const keysOf = (value: unknown): string => value !== null && typeof value === 'object' ? Object.keys(value as Record<string, unknown>).slice(0, 10).join(',') : typeof value
      const outer = frame as unknown as Record<string, unknown>
      const inner = outer['frame'] ?? outer['assistantStream'] ?? outer
      const chunk = inner !== null && typeof inner === 'object' ? (inner as Record<string, unknown>)['chunk'] : undefined
      this.followShapes.push('assistant-stream{' + keysOf(outer) + '} inner{' + keysOf(inner) + '} chunk{' + keysOf(chunk) + '}')
    }
    this.absorbStream(frame)
    // The opening frame carries the Session's history. The transport writes it as
    // { type: 'opened', cursor, page }, while this half's own contract says
    // { type: 'snapshot', records }, so both are read: whichever arrives is not
    // ours to choose, and a history nobody reads is a Session that looks empty.
    const carrier = frame as unknown as Record<string, unknown>
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
          buffer(handle, record.event as MirrorEvent)
        }
      }
      return
    }
    if (frameType === 'snapshot' || frameType === 'opened') this.historyMisses += 1
    if (frame.type === 'event') buffer(handle, frame.event)
  }

  /** Hand every buffered batch to the link, when there is a link to hand it to. */
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

/** Append one durable event to the buffer, bounded so memory cannot run away. */
function buffer(handle: FollowHandle, event: MirrorEvent): void {
  handle.pending.push({ type: event.type, seq: event.seq, time: event.time, data: event.data })
  if (handle.pending.length > BUFFER_LIMIT) {
    handle.pending.splice(0, handle.pending.length - BUFFER_LIMIT)
  }
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
