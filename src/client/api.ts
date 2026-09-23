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
  /** True while an older page of the open Session is being fetched. */
  loadingOlder: boolean
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
  /**
   * Streaming text for the open Session's current step, replaced by the durable
   * settlement. `turn` and `step` say which step it belongs to, so a frame that
   * arrives late cannot overwrite a newer one.
   */
  live: { reasoning: string; text: string; turn: number; step: number }
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

/** The step number that means "no step is streaming". */
const NO_STEP = -1

/**
 * The empty live row.
 *
 * A blank row rather than `undefined`: the panel asks whether either text is
 * non-empty, and a step's first frame is what fills one.
 */
function noLive(): SyncClientSnapshot['live'] {
  return { reasoning: '', text: '', turn: NO_STEP, step: NO_STEP }
}

/**
 * Whether one mirrored event settles the attempt a live row belongs to.
 *
 * Both spellings matter: a step that produced a message commits
 * `assistant/message`, while a stream that failed or was aborted with nothing
 * to keep commits `assistant/attempt`. Clearing only on the first left a
 * failed step's thinking on screen indefinitely.
 * @param event - one mirrored durable event.
 * @returns true when the live row for its step is over.
 */
export function isSettlement(event: MirrorEvent): boolean {
  return event.type === 'assistant/message' || event.type === 'assistant/attempt'
}

/** One `events` frame: durable envelopes appended to one published Session. */
export type SyncEventsFrame = Extract<SyncStreamFrame, { type: 'events' }>

/** One `stream` frame: the whole text so far for one live step. */
export type SyncLiveDelta = Extract<SyncStreamFrame, { type: 'stream' }>

/**
 * One consumer told what the mirror reported as it arrives.
 *
 * The shipped-renderer pane needs frames rather than the snapshot: a settlement
 * has to close the live attempt it belongs to, so the pane must see the same
 * ordered, de-duplicated sequence the snapshot is built from — including the
 * frames the snapshot itself drops as stale — and it must be able to bind its
 * Session reference before the store publishes the opening.
 */
export interface SyncTransportObserver {
  /** The console opened a remote Session. */
  opened(open: OpenSession): void
  /** The opening window arrived. */
  loaded(open: OpenSession, transcript: MirrorTranscript): void
  /** One `events` frame's durable envelopes, in order. */
  appended(open: OpenSession, frame: SyncEventsFrame): void
  /** One accepted live delta frame. */
  streamed(open: OpenSession, frame: SyncLiveDelta): void
  /** The mirror moved the open Session's running flag. */
  running(open: OpenSession, running: boolean): void
  /** The console left its remote Session. */
  closed(): void
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
  /**
   * The one consumer told what the mirror reported as it arrives.
   *
   * Held rather than fanned out: it is the console's shipped-renderer mirror,
   * which is a view of the same stream, not a second reader of it.
   */
  private observer: SyncTransportObserver | undefined
  /** The running flag already reported to that consumer. */
  private reportedRunning: boolean | undefined

  constructor() {
    this.store = createSnapshotStore<SyncClientSnapshot>({
      ready: false,
      config: defaultConfig(''),
      state: idleState(),
      sessions: [],
      loadingTranscript: false,
      loadingOlder: false,
      live: noLive(),
      stream: 'connecting',
      mirrorResets: 0,
    })
  }

  /** The observable the slot registrations bind as a renderer-provided hook. */
  get snapshot(): SnapshotStore<SyncClientSnapshot> {
    return this.store
  }

  /**
   * Register the one consumer told what the mirror reports as it arrives.
   *
   * Notifications are delivered before the store publishes the same fact: the
   * shipped-renderer pane binds its Session reference from the opening, so its
   * first render after the change already has a Session to draw and never has
   * to render a reference that has just been released.
   * @param observer - the consumer; at most one is held at a time.
   * @returns an idempotent disposer that detaches it.
   */
  observe(observer: SyncTransportObserver): () => void {
    this.observer = observer
    return () => {
      if (this.observer === observer) this.observer = undefined
    }
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
    const open: OpenSession = { machineName, sessionId }
    // Told before the store publishes the opening, for the reason `observe`
    // gives: a Session switch releases the old adoption, and no render may see
    // a reference that has already been released.
    this.reportedRunning = undefined
    this.notify(observer => { observer.opened(open) })
    this.update({
      open,
      transcript: undefined,
      loadingTranscript: true,
      loadingOlder: false,
      // Live text belongs to the Session that streamed it. Whatever the last
      // one left behind must not read as the new one's current step.
      live: noLive(),
      // Delivery belongs to the prompt that was sent, not to the panel: another
      // Session's composer must not inherit the previous one's outcome.
      delivery: undefined,
    })
    try {
      const { transcript } = await getJson<{ transcript: MirrorTranscript }>(
        `${ROUTE_PREFIX}/transcript?machine=${encodeURIComponent(machineName)}&session=${encodeURIComponent(sessionId)}`,
      )
      this.notify(observer => { observer.loaded(open, transcript) })
      this.update({ transcript, loadingTranscript: false, error: undefined })
    } catch (error: unknown) {
      this.update({ loadingTranscript: false, error: describe(error) })
    }
  }

  /**
   * Fetch the page of the open Session that sits before the one held.
   *
   * A transcript arrives as its newest page, so the older end is one request
   * away rather than part of every switch. The page is placed before what is
   * held, never merged into it: the two ranges are adjacent by construction, and
   * the held page already carries everything above them.
   * @returns nothing; the store is the result.
   */
  async loadOlder(): Promise<void> {
    const snapshot = this.store.getSnapshot()
    const open = snapshot.open
    const transcript = snapshot.transcript
    if (open === undefined || transcript === undefined) return
    if (!transcript.hasMore || snapshot.loadingOlder) return
    const first = transcript.events[0]?.seq
    if (first === undefined) return
    this.update({ loadingOlder: true })
    try {
      const { transcript: older } = await getJson<{ transcript: MirrorTranscript }>(
        `${ROUTE_PREFIX}/transcript?machine=${encodeURIComponent(open.machineName)}`
        + `&session=${encodeURIComponent(open.sessionId)}`
        // The page already held sets the size of the next one: a Session short
        // enough to arrive whole has nothing older to ask for, and a paged one
        // holds exactly the window the server chose — so the client never has to
        // know that number, and pages stay the same size as the reader walks up.
        + `&limit=${String(transcript.events.length)}`
        + `&before=${String(first)}`,
      )
      const current = this.store.getSnapshot()
      // Another Session may have been opened while this one was in flight, and
      // that Session's own transcript must not receive this page.
      if (current.open?.sessionId !== open.sessionId) return
      const held = current.transcript
      if (held === undefined) return
      this.update({
        transcript: {
          ...held,
          events: [...older.events, ...held.events],
          hasMore: older.hasMore,
        },
        loadingOlder: false,
      })
    } catch (error: unknown) {
      this.update({ loadingOlder: false, error: describe(error) })
    }
  }

  /** Leave the open remote Session. */
  closeSession(): void {
    this.notify(observer => { observer.closed() })
    this.update({ open: undefined, transcript: undefined, delivery: undefined, live: noLive(), loadingOlder: false })
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
      // The observer is told the frame as well as the store: a settlement has
      // to reach the shipped renderer as the close of a live attempt, which the
      // merged event list alone no longer says.
      this.notify(observer => { observer.appended(open, frame) })
      this.update({
        transcript: { ...transcript, events: [...transcript.events, ...frame.events] },
        // A durable settlement ends the streaming step it belongs to.
        ...(frame.events.some(isSettlement) ? { live: noLive() } : {}),
      })
      return
    }
    if (frame.type === 'stream') {
      const snapshot = this.store.getSnapshot()
      const open = snapshot.open
      if (open === undefined) return
      if (open.machineName !== frame.machineName || open.sessionId !== frame.sessionId) return
      const live = snapshot.live
      // Frames for an older step must not overwrite a newer one: every delta is
      // its own post, so two steps' frames can arrive out of order.
      if (frame.turn < live.turn || (frame.turn === live.turn && frame.step < live.step)) return
      // A step's text is replaced, not appended: the origin sends the whole text
      // so far, so a lost frame heals on the next one. A step that moved on
      // starts both texts over, because its reasoning is a new one.
      const advanced = frame.turn > live.turn || (frame.turn === live.turn && frame.step > live.step)
      const base = advanced ? { ...noLive(), turn: frame.turn, step: frame.step } : live
      // Within one step the text only grows, so a frame whose text is a strict
      // prefix of what is already shown is an older snapshot that arrived late:
      // every update is its own post, and the network does not order two posts
      // that were issued together. An empty text is exempt -- that is how an
      // abandoned attempt is dropped, and it is the only frame that may regress.
      const shown = frame.kind === 'reasoning' ? base.reasoning : base.text
      if (!advanced && frame.text !== '' && frame.text.length < shown.length && shown.startsWith(frame.text)) return
      this.notify(observer => { observer.streamed(open, frame) })
      this.update({ live: frame.kind === 'reasoning' ? { ...base, reasoning: frame.text } : { ...base, text: frame.text } })
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
    this.notifyRunning()
  }

  /**
   * Tell the observer something, and never let it take the transport with it.
   *
   * Mirroring into the shipped renderer is an enhancement: a consumer that
   * cannot be fed is detached (leaving the console on its own pane) and its
   * failure is reported where every other failure is, rather than thrown into
   * the action that happened to be running.
   */
  private notify(deliver: (observer: SyncTransportObserver) => void): void {
    const observer = this.observer
    if (observer === undefined) return
    try {
      deliver(observer)
    } catch (error: unknown) {
      this.observer = undefined
      this.update({ error: describe(error) })
    }
  }

  /**
   * Report the open Session's running flag when the mirror moves it.
   *
   * The flag is a mirror reading rather than an event, so it has no frame of
   * its own: every snapshot write funnels through here and the reading is
   * compared against the last one reported.
   */
  private notifyRunning(): void {
    if (this.observer === undefined) return
    const snapshot = this.store.getSnapshot()
    const open = snapshot.open
    if (open === undefined) {
      this.reportedRunning = undefined
      return
    }
    const running = snapshot.state.machines
      .find(machine => machine.machineName === open.machineName)
      ?.sessions.find(candidate => candidate.sessionId === open.sessionId)
      ?.running ?? snapshot.transcript?.running ?? false
    if (running === this.reportedRunning) return
    this.reportedRunning = running
    this.notify(observer => { observer.running(open, running) })
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
