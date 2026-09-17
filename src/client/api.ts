/**
 * Browser-side transport and view state for the sync plugin.
 *
 * Everything goes through the Host routes this package registers under
 * {@link ROUTE_PREFIX}, so the panel is same-origin with the GUI it lives in.
 * Live state arrives on one `EventSource`; the panel and the settings page both
 * read the single snapshot this store publishes, which is why a change made on
 * one surface is already visible on the other.
 */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  COMMAND_TTL_MS,
  ROUTE_PREFIX,
  defaultConfig,
  type CommandState,
  type ConfigPatch,
  type LocalSessionRow,
  type MirrorEvent,
  type MirrorTranscript,
  type SyncConfig,
  type SyncState,
  type SyncStreamFrame,
} from '../shared/protocol.ts'

/** How often the local Session list is re-read while the panel is mounted. */
const SESSION_POLL_MS = 15_000

/**
 * How many command states to remember for a command this browser has not been
 * told about yet.
 *
 * A status frame and the POST response that mints the command's id travel by
 * different roads, and the frame routinely wins: the server hands the command to
 * the owning machine and narrates that immediately, while the response still has
 * to come back. Dropping those frames left the composer on "submitted" for a
 * command the machine had already accepted.
 */
const EARLY_COMMAND_LIMIT = 16

/** One remote Session the user has open. */
export interface OpenSession {
  machineName: string
  sessionId: string
}

/**
 * What became of the last takeover prompt this browser sent.
 *
 * The server answers the POST with an id and then narrates the rest over the
 * event stream, so "sent" is only the first of five states and the composer is
 * only honest if it renders the ones that follow.
 */
export interface CommandDelivery {
  commandId: string
  state: CommandState
  expiresAt: number
  error?: string
}

/** Everything the two surfaces render. */
export interface SyncClientSnapshot {
  /** False until the first successful read, so a blank panel is never shown as a state. */
  ready: boolean
  config: SyncConfig
  state: SyncState
  sessions: LocalSessionRow[]
  /** The remote Session currently open in the centre panel, when any. */
  open?: OpenSession
  transcript?: MirrorTranscript
  loadingTranscript: boolean
  /** The last takeover prompt's progress, cleared when another Session is opened. */
  delivery?: CommandDelivery
  /**
   * Whether this page's stream to its own host is up.
   *
   * The page is served by that host, so a restart breaks the stream and nothing
   * else in the panel can tell: every read it makes is answered by whatever is
   * listening now, and a mirror that came back empty looks exactly like a mirror
   * nobody has published to yet.
   */
  stream: 'connecting' | 'open'
  /**
   * How many times a reopened stream has found the mirror empty after it had
   * held machines — what a server restart leaves behind, because the mirror is
   * memory-only.
   *
   * A count rather than a flag: the notice is the reader's to dismiss, and a
   * later restart has to raise it again. Measured on the real host, the empty
   * window lasts only about two to four seconds before the machines re-publish,
   * which is far too short to notice on its own.
   */
  mirrorResets: number
  /** Streaming text for the open Session's current step; replaced by the durable message. */
  live: { reasoning: string; text: string }
  /** Last failure text, cleared by the next successful action. */
  error?: string
}

/** The neutral state rendered before the Host has answered. */
function idleState(): SyncState {
  return {
    role: 'client',
    machineName: '',
    serverUrl: '',
    listening: false,
    linked: false,
    machines: [],
    published: 0,
  }
}

/** The sync plugin's browser client. */
export class SyncClient {
  private readonly store: SnapshotStore<SyncClientSnapshot>
  private source: EventSource | undefined
  private poll: ReturnType<typeof setInterval> | undefined
  private started = false
  /** Status frames that arrived before this browser knew their command's id. */
  private readonly earlyCommands = new Map<string, CommandDelivery>()
  /** Whether this page has ever held an open stream. */
  private sawOpen = false
  /** Whether this page has ever seen a machine in the mirror. */
  private sawMachines = false

  constructor() {
    this.store = createSnapshotStore<SyncClientSnapshot>({
      ready: false,
      config: defaultConfig(''),
      state: idleState(),
      sessions: [],
      loadingTranscript: false,
      live: { reasoning: '', text: '' },
      stream: 'connecting',
      mirrorResets: 0,
    })
  }

  /** The observable the slot registrations bind as a renderer-provided hook. */
  get snapshot(): SnapshotStore<SyncClientSnapshot> {
    return this.store
  }

  /** Begin reading and hold the live stream open. Idempotent. */
  start(): void {
    if (this.started) return
    this.started = true
    void this.refresh()
    this.openStream()
    // The mirror is push-driven, so nothing announces a machine that simply
    // went quiet. Polling the same cadence as the Session list is what retires
    // a stale "online" badge.
    this.poll = setInterval(() => {
      void this.refreshSessions()
      void this.refreshState()
    }, SESSION_POLL_MS)
  }

  /** Stop polling and close the stream. Idempotent. */
  stop(): void {
    this.started = false
    if (this.poll !== undefined) clearInterval(this.poll)
    this.poll = undefined
    this.source?.close()
    this.source = undefined
  }

  /** Re-read configuration, role state, and the local Session list. */
  async refresh(): Promise<void> {
    try {
      const [configResponse, sessionsResponse] = await Promise.all([
        getJson<{ config: SyncConfig; state: SyncState }>(`${ROUTE_PREFIX}/config`),
        getJson<{ sessions: LocalSessionRow[] }>(`${ROUTE_PREFIX}/sessions`),
      ])
      this.update({
        ready: true,
        config: configResponse.config,
        state: configResponse.state,
        sessions: sessionsResponse.sessions,
        error: undefined,
      })
    } catch (error: unknown) {
      this.update({ ready: true, error: describe(error) })
    }
  }

  /** Re-read only the local Session list. */
  async refreshSessions(): Promise<void> {
    try {
      const { sessions } = await getJson<{ sessions: LocalSessionRow[] }>(`${ROUTE_PREFIX}/sessions`)
      this.update({ sessions })
    } catch {
      // A failed background poll is not worth surfacing; the next one retries.
    }
  }

  /** Re-read the authoritative mirror view, which is what retires a stale badge. */
  async refreshState(): Promise<void> {
    try {
      const { state } = await getJson<{ state: SyncState }>(`${ROUTE_PREFIX}/state`)
      if (!isCompleteState(state)) return
      this.update({ state })
    } catch {
      // Same: the stream is the primary path and the poll is the backstop.
    }
  }

  /**
   * Write one partial configuration change.
   * @param patch - fields to change.
   * @returns true when the Host accepted the write.
   */
  async configure(patch: ConfigPatch): Promise<boolean> {
    try {
      const result = await postJson<{
        config: SyncConfig
        state: SyncState
        sessions: LocalSessionRow[]
      }>(`${ROUTE_PREFIX}/config`, patch)
      this.update({
        config: result.config,
        state: result.state,
        sessions: result.sessions,
        error: undefined,
      })
      return true
    } catch (error: unknown) {
      this.update({ error: describe(error) })
      return false
    }
  }

  /**
   * Flip one Session's publish switch.
   * @param sessionId - the Session to publish or stop publishing.
   * @param synced - the requested state.
   * @returns true when the Host accepted the write.
   */
  async setSessionSync(sessionId: string, synced: boolean): Promise<boolean> {
    return await this.configure({ sessionSync: { sessionId, synced } })
  }

  /**
   * Open one mirrored Session in the centre panel.
   * @param machineName - owning machine.
   * @param sessionId - published Session.
   */
  async openSession(machineName: string, sessionId: string): Promise<void> {
    this.update({
      open: { machineName, sessionId },
      transcript: undefined,
      loadingTranscript: true,
      // Delivery belongs to the prompt that was sent, not to the panel: another
      // Session's composer must not inherit the previous one's outcome.
      delivery: undefined,
    })
    try {
      const { transcript } = await getJson<{ transcript: MirrorTranscript }>(
        `${ROUTE_PREFIX}/transcript?machine=${encodeURIComponent(machineName)}&session=${encodeURIComponent(sessionId)}`,
      )
      this.update({ transcript, loadingTranscript: false, error: undefined })
    } catch (error: unknown) {
      this.update({ loadingTranscript: false, error: describe(error) })
    }
  }

  /** Leave the open remote Session. */
  closeSession(): void {
    this.update({ open: undefined, transcript: undefined, delivery: undefined })
  }

  /**
   * Send one takeover prompt to the machine that owns the open Session.
   * @param text - the prompt text.
   * @returns true when the server accepted and forwarded it.
   */
  async sendPrompt(text: string): Promise<boolean> {
    const open = this.store.getSnapshot().open
    if (open === undefined) return false
    try {
      const result = await postJson<{ ok: true; commandId: string }>(`${ROUTE_PREFIX}/command`, {
        machineName: open.machineName,
        sessionId: open.sessionId,
        text,
      })
      // The machine may have answered before this response landed; adopt what it
      // said rather than restarting the story at "queued".
      const known = this.earlyCommands.get(result.commandId)
      this.earlyCommands.delete(result.commandId)
      this.update({
        error: undefined,
        delivery: known ?? {
          commandId: result.commandId,
          state: 'queued',
          expiresAt: Date.now() + COMMAND_TTL_MS,
        },
      })
      return true
    } catch (error: unknown) {
      this.update({ error: describe(error) })
      return false
    }
  }

  private openStream(): void {
    if (typeof EventSource === 'undefined') return
    const source = new EventSource(`${ROUTE_PREFIX}/events`)
    source.onopen = () => {
      const first = !this.sawOpen
      this.sawOpen = true
      const snapshot = this.store.getSnapshot()
      // A stream that comes back after it was open before means the host went
      // away: restarting it is the ordinary cause, and its mirror is memory-only,
      // so an empty one now is a reset rather than a quiet fleet. Say so, and
      // re-read everything instead of trusting what is still on screen.
      const reset = !first && this.sawMachines && snapshot.state.machines.length === 0
      this.update({
        stream: 'open',
        ...(reset ? { mirrorResets: snapshot.mirrorResets + 1 } : {}),
      })
      if (!first) void this.refresh()
    }
    source.onerror = () => {
      this.update({ stream: 'connecting' })
    }
    source.onmessage = (event: MessageEvent<string>) => {
      let frame: SyncStreamFrame
      try {
        frame = JSON.parse(event.data) as SyncStreamFrame
      } catch {
        return
      }
      this.consume(frame)
    }
    this.source = source
  }

  private consume(frame: SyncStreamFrame): void {
    if (frame.type === 'state') {
      const previous = this.store.getSnapshot().state
      // The producer sends the complete view, and it is adopted wholesale. A
      // frame that carries only the machine list is tolerated rather than
      // applied: the snapshot backs all three surfaces, so replacing it with a
      // partial object blanks the role, listener, and link facts they all
      // render. Only the part that actually arrived is taken.
      const state: SyncState = isCompleteState(frame.state)
        ? frame.state
        : {
            ...previous,
            machines: Array.isArray(frame.state.machines) ? frame.state.machines : previous.machines,
          }
      this.update({ state, ready: true })
      // A machine or Session appearing or disappearing invalidates the current
      // local list too: the rows carry switch state that may have moved.
      if (previous.published !== state.published) void this.refreshSessions()
      return
    }
    if (frame.type === 'events') {
      const snapshot = this.store.getSnapshot()
      const open = snapshot.open
      if (open === undefined) return
      if (open.machineName !== frame.machineName || open.sessionId !== frame.sessionId) return
      const transcript = snapshot.transcript
      if (transcript === undefined) return
      this.update({
        transcript: { ...transcript, events: [...transcript.events, ...frame.events] },
        // A durable message ends the streaming step it belongs to.
        ...(frame.events.some(event => event.type === 'assistant/message') ? { live: { reasoning: '', text: '' } } : {}),
      })
      return
    }
    if (frame.type === 'stream') {
      const snapshot = this.store.getSnapshot()
      const open = snapshot.open
      if (open === undefined) return
      if (open.machineName !== frame.machineName || open.sessionId !== frame.sessionId) return
      // The origin sends the whole text so far, so this replaces rather than
      // appends: a lost frame heals on the next one. The durable message that
      // ends the step is what retires it.
      const live = this.store.getSnapshot().live
      this.update({ live: frame.kind === 'reasoning' ? { ...live, reasoning: frame.text } : { ...live, text: frame.text } })
      return
    }
    if (frame.type === 'command') {
      const delivery: CommandDelivery = {
        commandId: frame.command.commandId,
        state: frame.command.state,
        expiresAt: frame.command.expiresAt,
        ...(frame.command.error === undefined ? {} : { error: frame.command.error }),
      }
      const current = this.store.getSnapshot().delivery
      // Only the prompt this browser sent is narrated in the composer. A command
      // another browser issued is that browser's business, and a frame that
      // arrives after this one was already superseded must not resurrect it.
      if (current !== undefined && current.commandId === frame.command.commandId) {
        this.update({ delivery })
        return
      }
      // Unknown id: the frame outran the response that mints it. Keep the newest
      // state per command so the composer can pick the story up where it is.
      this.earlyCommands.delete(frame.command.commandId)
      this.earlyCommands.set(frame.command.commandId, delivery)
      while (this.earlyCommands.size > EARLY_COMMAND_LIMIT) {
        const oldest = this.earlyCommands.keys().next()
        if (oldest.done === true) break
        this.earlyCommands.delete(oldest.value)
      }
      return
    }
    this.update({ error: frame.message })
  }

  /**
   * Publish one patch, remembering that this page once held machines.
   *
   * That memory is what makes an empty mirror a reset rather than a fleet that
   * never connected: the empty window itself is only a couple of seconds wide,
   * so the notice has to be raised by the reconnect rather than by what the
   * next read happens to find.
   */
  private update(patch: Partial<SyncClientSnapshot>): void {
    const next = { ...this.store.getSnapshot(), ...patch }
    if (next.state.machines.length > 0) this.sawMachines = true
    this.store.set(next)
  }
}

/** Read one JSON response, turning a non-2xx into a thrown error carrying the server's reason. */
async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' })
  return await decode<T>(response)
}

/** Post one JSON body and read the JSON response. */
async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return await decode<T>(response)
}

/** Decode a response, preferring the server's own failure reason. */
async function decode<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    let reason = `HTTP ${String(response.status)}`
    try {
      const parsed = JSON.parse(text) as { error?: unknown; reason?: unknown }
      if (typeof parsed.reason === 'string') reason = parsed.reason
      else if (typeof parsed.error === 'string') reason = parsed.error
    } catch {
      // A non-JSON failure body leaves the status as the reason.
    }
    throw new Error(reason)
  }
  return JSON.parse(text) as T
}

/** Human-readable one-line failure text. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Whether a state frame carries the whole view rather than just a mirror slice.
 * @param state - the frame's state payload.
 * @returns true when every field the surfaces render is present.
 */
function isCompleteState(state: SyncState): boolean {
  return (state.role === 'server' || state.role === 'client')
    && Array.isArray(state.machines)
    && typeof state.machineName === 'string'
    && typeof state.published === 'number'
}
