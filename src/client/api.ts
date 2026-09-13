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
  ROUTE_PREFIX,
  defaultConfig,
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

/** One remote Session the user has open. */
export interface OpenSession {
  machineName: string
  sessionId: string
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

  constructor() {
    this.store = createSnapshotStore<SyncClientSnapshot>({
      ready: false,
      config: defaultConfig(''),
      state: idleState(),
      sessions: [],
      loadingTranscript: false,
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
    this.update({ open: { machineName, sessionId }, transcript: undefined, loadingTranscript: true })
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
    this.update({ open: undefined, transcript: undefined })
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
      await postJson(`${ROUTE_PREFIX}/command`, {
        machineName: open.machineName,
        sessionId: open.sessionId,
        text,
      })
      this.update({ error: undefined })
      return true
    } catch (error: unknown) {
      this.update({ error: describe(error) })
      return false
    }
  }

  private openStream(): void {
    if (typeof EventSource === 'undefined') return
    const source = new EventSource(`${ROUTE_PREFIX}/events`)
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
      })
      return
    }
    this.update({ error: frame.message })
  }

  private update(patch: Partial<SyncClientSnapshot>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
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
