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
  type RelayedAnswerItem,
  type RelayedApprovalDecision,
  type RelayedApprovalView,
  type RelayedQuestionView,
  type SyncConfig,
  type SyncState,
  type SyncStreamFrame,
} from '../shared/protocol.ts'
import {
  LiveAttemptFold,
  type LiveAttemptView,
  type LiveStreamPayload,
} from '../shared/live-stream.ts'

/** How often the local Session list is re-read while the panel is mounted. */
const SESSION_POLL_MS = 15_000

/**
 * How long one "load older" click waits for a page the mirror had to fetch.
 *
 * The page may not exist in the mirror yet, in which case the server asks the
 * machine that owns the Session and the events arrive over the ordinary stream:
 * a read of its log, a POST back, and a trip through a proxy, which measured at
 * ten to twenty seconds on a cross-border link. Those events also queue behind
 * everything else that machine is publishing, so the wait has to cover a
 * backlog and not just one round trip — measured live, a page that had been read
 * and was sitting 1,766 events deep in the origin's outbox.
 *
 * Waiting is also what makes the click reliable: the page arrives as an ordinary
 * event frame, and the browser's stream to the server is the least dependable leg
 * of the whole path (`net::ERR_HTTP2_PROTOCOL_ERROR` on a proxied idle SSE).
 * So the wait re-asks the endpoint and accepts either arrival: the page itself, or
 * the window having moved below where it started.
 */
const OLDER_ATTEMPTS = 30
const OLDER_WAIT_MS = 3_000

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
   * The live Assistant attempt for the open Session, folded from the official
   * chunk stream and replaced by the durable settlement.
   *
   * `blocks` is the authored order — reasoning, answer and Tool calls as the model
   * emitted them — and is what the console draws. `turn` and `step` say which step
   * the row belongs to, so a frame that arrives late cannot overwrite a newer one.
   */
  live: LiveAttemptView
  /**
   * Questions this server is offering to this console, oldest ask first.
   *
   * Transient by nature: a question is answerable only while the machine that
   * asked is still waiting, and it disappears the moment either side answers.
   * Keeping the *view* rather than a count is what lets the card show the
   * question, its options, and which machine asked.
   */
  questions: RelayedQuestionView[]
  /**
   * What became of an answer this console sent, per question.
   *
   * The ordinary failure is a race already lost — the machine's own human
   * answered first — and the card is the only place that can say so. `sent` is
   * the in-flight mark, cleared when the question itself closes.
   */
  answers: Record<string, { sent?: boolean; error?: string }>
  /**
   * Approvals this server is offering to this console, oldest offer first.
   *
   * Transient like the questions above, and for a harder reason: each of these is a
   * tool call *blocked* on this console's reader. The card resolves what is being
   * approved from the mirrored transcript by `callId`, which is why the offer
   * carries no arguments of its own.
   */
  approvals: RelayedApprovalView[]
  /**
   * What became of a decision this console sent, per approval.
   *
   * Two ordinary failures, and the card must tell them apart: the machine's own
   * human decided first (a lost race, nothing to retry) and the machine *refused*
   * the decision (which is a real answer, and a refusal). `sent` is the in-flight
   * mark, cleared when the approval itself closes.
   */
  decisions: Record<string, { sent?: boolean; error?: string }>
  /** Last failure text, cleared by the next successful action. */
  error?: string
  /**
   * Whether that failure was a settings revision conflict the Host already re-read
   * and retried.
   *
   * The one failure a page reload recovers: the values this page's form was seeded
   * from are behind another writer's save, so saving the same edit again loses the
   * same race. Taken from the Host's own classification of the refusal, never
   * guessed from the message text.
   */
  errorConflict?: boolean
}

/** The neutral state rendered before the Host has answered. */
function idleState(): SyncState {
  return {
    role: 'client',
    machineName: '',
    serverUrl: '',
    // The Host answers with its own reading on the first state frame; until then
    // this browser knows nothing about the build it is talking to, which is what
    // "unknown" is for.
    pluginVersion: 'unknown',
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
 * A complete view rather than `undefined`: the panel asks whether there is
 * anything to draw, and a step's first chunk is what fills one. The identity is
 * empty so no real attempt can be mistaken for it.
 */
function noLive(): LiveAttemptView {
  return { attemptId: '', turn: NO_STEP, step: NO_STEP, blocks: [], reasoning: '', text: '', tools: [] }
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

/** One `stream` frame: an official Assistant-stream event for the open Session. */
export type SyncLiveFrame = Extract<SyncStreamFrame, { type: 'stream' }>

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
  /**
   * One older page arrived, below everything the consumer already holds.
   *
   * Separate from {@link SyncTransportObserver.loaded} because it is the one
   * arrival that goes *before* the window rather than replacing it: a consumer
   * that draws the mirror's window has to prepend it, or the transcript would
   * jump back to where the page begins.
   */
  older(open: OpenSession, page: MirrorTranscript): void
  /** One `events` frame's durable envelopes, in order. */
  appended(open: OpenSession, frame: SyncEventsFrame): void
  /** One accepted live frame. */
  streamed(open: OpenSession, frame: SyncLiveFrame): void
  /** The mirror moved the open Session's running flag. */
  running(open: OpenSession, running: boolean): void
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
  /**
   * The open Session's live attempt, folded locally.
   *
   * Held beside the snapshot because it is the only thing a chunk batch can be
   * applied to: the snapshot is a value, and a dense run needs the cursor and the
   * blocks from the previous frame. Replaced by a `start` or `baseline`, dropped
   * by a `clear` and by opening another Session.
   */
  private liveFold: LiveAttemptFold | undefined

  constructor() {
    this.store = createSnapshotStore<SyncClientSnapshot>({
      ready: false,
      config: defaultConfig(''),
      state: idleState(),
      sessions: [],
      loadingTranscript: false,
      loadingOlder: false,
      live: noLive(),
      questions: [],
      answers: {},
      approvals: [],
      decisions: {},
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
        // Cleared together: a conflict is a property of the failure that is being
        // cleared, and leaving it behind would keep offering the reload hint for a
        // failure nothing on screen describes any more.
        error: undefined,
        errorConflict: false,
      })
    } catch (error: unknown) {
      this.update({ ready: true, error: describe(error), errorConflict: false })
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
        errorConflict: false,
      })
      return true
    } catch (error: unknown) {
      // Re-read before reporting. A refused save means this page's snapshot is what
      // the Host no longer holds — another writer replaced it, or a half-applied
      // write landed — and the next attempt must start from the values in force
      // rather than from the ones that just lost. The read comes first because a
      // successful one clears `error`, which is what carries the failure text.
      await this.refresh()
      this.update({
        error: describe(error),
        errorConflict: error instanceof HostFailure && error.conflict,
      })
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
   * Flip one Session's approval switch.
   *
   * Separate from {@link setSessionSync} on the page and here, because it grants
   * something publishing does not: the authority, for whoever reads this console, to
   * *allow* a tool call the machine's own permission preset was gating. The Host
   * refuses the write for a Session that is not published, since the console could
   * not show what it was approving.
   * @param sessionId - the Session to open or close to remote approvals.
   * @param approved - the requested state.
   * @returns true when the Host accepted the write.
   */
  async setSessionApprovals(sessionId: string, approved: boolean): Promise<boolean> {
    return await this.configure({ sessionApprovals: { sessionId, approved } })
  }

  /**
   * Open one mirrored Session in the centre panel.
   * @param machineName - owning machine.
   * @param sessionId - published Session.
   */
  async openSession(machineName: string, sessionId: string): Promise<void> {
    const open: OpenSession = { machineName, sessionId }
    // Told before the store publishes the opening, for the reason `observe`
    // gives: a Session switch releases the old retention, and no render may see
    // a reference that has already been released.
    this.reportedRunning = undefined
    this.notify(observer => { observer.opened(open) })
    this.liveFold = undefined
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
      const { transcript, live } = await getJson<{ transcript: MirrorTranscript; live?: LiveStreamPayload }>(
        `${ROUTE_PREFIX}/transcript?machine=${encodeURIComponent(machineName)}&session=${encodeURIComponent(sessionId)}`,
      )
      this.notify(observer => { observer.loaded(open, transcript) })
      this.update({ transcript, loadingTranscript: false, error: undefined })
      // After the window, never before: the baseline is drawn on top of the
      // replace, and a reader opening a running Session sees the step it is in.
      if (live !== undefined) this.consume({ type: 'stream', machineName, sessionId, live })
    } catch (error: unknown) {
      this.update({ loadingTranscript: false, error: describe(error), errorConflict: false })
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
  /**
   * Page this console all the way back to the start of the Session's log.
   *
   * The footer counts what this console holds, and the machine's own page counts the
   * whole log — so the only way the two can agree without the machine sending its own
   * totals is for the console to *hold* the whole log. Paging does that: every page it
   * fetches stays in its transcript even after the server's mirror trims its window.
   * @returns when the log's start is reached, or when a page was already in flight.
   */
  async loadAllOlder(): Promise<void> {
    // Bounded, so a server that keeps claiming more cannot spin here forever.
    for (let page = 0; page < 500; page += 1) {
      // A page still in flight is waited for, not treated as the end. Returning on
      // it was this control's worst failure: the button is disabled while loading,
      // so a reader saw nothing happen, pressed again, and the count settled at
      // whatever the first page happened to hold — a footer that says "3 turns, 65
      // steps" for a Session whose machine log holds 392.
      for (let wait = 0; wait < 200 && this.store.getSnapshot().loadingOlder; wait += 1) {
        await new Promise<void>(resolve => { setTimeout(resolve, 50) })
      }
      const snapshot = this.store.getSnapshot()
      const transcript = snapshot.transcript
      if (transcript === undefined || !transcript.hasMore) return
      await this.loadOlder()
      // The mirror only reads a page from the owning machine once its own ask floor
      // has passed; a burst of requests inside that window is answered empty and
      // would leave this loop walking nowhere. Paced just past the floor.
      await new Promise<void>(resolve => { setTimeout(resolve, 350) })
    }
  }
  async loadOlder(): Promise<void> {
    const snapshot = this.store.getSnapshot()
    const open = snapshot.open
    const transcript = snapshot.transcript
    if (open === undefined || transcript === undefined) return
    if (!transcript.hasMore || snapshot.loadingOlder) return
    const first = transcript.events[0]?.seq
    if (first === undefined) return
    this.update({ loadingOlder: true })
    // The mirror may hold nothing below the window and have to ask the machine
    // that owns the Session, so an empty answer is not the end of the story: the
    // page is read over there and arrives as ordinary events. Waiting for it is
    // what makes one click feel like one click.
    for (let attempt = 0; attempt < OLDER_ATTEMPTS; attempt += 1) {
      const current = this.store.getSnapshot()
      // Another Session may have been opened while this one was in flight, and
      // that Session's own transcript must not receive this page.
      if (current.open?.sessionId !== open.sessionId) return
      const held = current.transcript
      if (held === undefined) return
      let older: MirrorTranscript
      try {
        ({ transcript: older } = await getJson<{ transcript: MirrorTranscript }>(
          `${ROUTE_PREFIX}/transcript?machine=${encodeURIComponent(open.machineName)}`
          + `&session=${encodeURIComponent(open.sessionId)}`
          // The page already held sets the size of the next one: a Session short
          // enough to arrive whole has nothing older to ask for, and a paged one
          // holds exactly the window the server chose — so the client never has
          // to know that number, and pages stay the same size as the reader
          // walks up.
          + `&limit=${String(Math.max(1, held.events.length))}`
          + `&before=${String(first)}`,
        ))
      } catch (error: unknown) {
        this.update({ loadingOlder: false, error: describe(error), errorConflict: false })
        return
      }
      if (older.events.length > 0) {
        this.update({
          transcript: {
            ...held,
            events: mergeEvents(held.events, older.events),
            hasMore: older.hasMore,
          },
          loadingOlder: false,
        })
        // The consumer is told the page itself, not the merged list: it holds its
        // own window, and a page is the part of it that goes before.
        this.notify(observer => { observer.older(open, older) })
        return
      }
      // An empty answer is not the end of the story: the page was read on the
      // machine that owns the Session and is on its way as ordinary event frames,
      // which may have arrived between this request and the last. A window that
      // now begins below where it did is the page, already merged.
      const moved = current.transcript?.events[0]?.seq
      if (moved !== undefined && moved < first) {
        this.update({ loadingOlder: false })
        return
      }
      if (!older.hasMore) {
        this.update({ transcript: { ...held, hasMore: false }, loadingOlder: false })
        return
      }
      await new Promise(resolve => { setTimeout(resolve, OLDER_WAIT_MS) })
    }
    this.update({ loadingOlder: false })
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
      this.update({ error: describe(error), errorConflict: false })
      return false
    }
  }

  /**
   * Answer one question this console was offered.
   *
   * The answer goes to the machine that asked rather than being applied here: it
   * is a claim on a decision, and the machine is the only side that can say
   * whether the question was still open when it arrived. So the ordinary refusal
   * — a 409 carrying "already answered on the machine that asked it" — is shown on
   * the card, because the honest story is a race that was lost and not a failure
   * to retry.
   * @param machineName - the machine that asked.
   * @param questionId - the question being answered.
   * @param answers - the choices, one per question the batch asked.
   * @returns true when the machine's server accepted the answer for delivery.
   */
  async answerQuestion(
    machineName: string,
    questionId: string,
    answers: RelayedAnswerItem[],
  ): Promise<boolean> {
    this.setAnswer(questionId, { sent: true })
    try {
      const result = await postJson<{ ok: true; commandId: string }>(`${ROUTE_PREFIX}/answer`, {
        machineName,
        questionId,
        answers,
      })
      if (result.ok !== true) throw new Error('the server did not accept the answer')
      return true
    } catch (error: unknown) {
      this.setAnswer(questionId, { error: describe(error) })
      return false
    }
  }

  /** Record one question's answer progress without disturbing the others. */
  private setAnswer(questionId: string, state: { sent?: boolean; error?: string }): void {
    this.update({ answers: { ...this.store.getSnapshot().answers, [questionId]: state } })
  }

  /**
   * Send the console's decision on one relayed approval.
   *
   * The ordinary failure is a race already lost — the machine's own human decided —
   * and the server answers 409 with that sentence. It is *not* an error to retry:
   * it is the race's honest result, and the approval is gone either way, so the card
   * is the only place that can say so.
   * @param machineName - the machine that is blocked.
   * @param approvalId - the approval being decided.
   * @param decision - allow once, or reject.
   * @returns true when the machine's server accepted the decision for delivery.
   */
  async decideApproval(
    machineName: string,
    approvalId: string,
    decision: RelayedApprovalDecision,
  ): Promise<boolean> {
    this.setDecision(approvalId, { sent: true })
    try {
      const result = await postJson<{ ok: true; commandId: string }>(`${ROUTE_PREFIX}/approval`, {
        machineName,
        approvalId,
        decision,
      })
      if (result.ok !== true) throw new Error('the server did not accept the decision')
      return true
    } catch (error: unknown) {
      this.setDecision(approvalId, { error: describe(error) })
      return false
    }
  }

  /** Record one approval's decision progress without disturbing the others. */
  private setDecision(approvalId: string, state: { sent?: boolean; error?: string }): void {
    this.update({ decisions: { ...this.store.getSnapshot().decisions, [approvalId]: state } })
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

  /**
   * Apply one live event to the open Session's attempt.
   *
   * The fold is official: a `start` replaces the attempt, a `baseline` seeds it
   * mid-run, a chunk batch is dense, and a gap drops the row rather than drawing a
   * hole. `end`/`clear` close it. A frame for an attempt this browser never saw is
   * ignored — a `chunks` batch that outran its `start` cannot be folded.
   * @param live - one live event from the browser stream.
   * @returns the view to publish, or undefined when the event changes nothing.
   */
  private foldLive(live: LiveStreamPayload): LiveAttemptView | undefined {
    switch (live.type) {
      case 'baseline': {
        const fold = new LiveAttemptFold({ attemptId: live.attemptId, turn: live.turn, step: live.step })
        fold.seed(live)
        this.liveFold = fold
        return fold.view()
      }
      case 'start': {
        // A retried step re-opens the same turn and step; announcing it starts the
        // row over, exactly as the shipped renderer would.
        this.liveFold = new LiveAttemptFold({ attemptId: live.attemptId, turn: live.turn, step: live.step })
        return this.liveFold.view()
      }
      case 'chunks': {
        const fold = this.liveFold
        if (fold === undefined || fold.attemptId !== live.attemptId) return undefined
        for (const frame of live.chunks) {
          if (fold.apply(frame)) continue
          // A dense run with a hole cannot be repaired here; the next `start`
          // (or the opening baseline) is what a reader will see next.
          this.liveFold = undefined
          return noLive()
        }
        return fold.view()
      }
      case 'end': {
        if (this.liveFold?.attemptId !== live.attemptId) return undefined
        if (live.outcome === 'abandoned') {
          this.liveFold = undefined
          return noLive()
        }
        // A committed attempt is replaced by its own durable settlement, which is
        // the next thing the mirror sends; its live row stays until then.
        return this.liveFold.view()
      }
      case 'clear': {
        const fold = this.liveFold
        if (fold === undefined) return undefined
        if (live.turn !== fold.turn || live.step !== fold.step) return undefined
        if (live.attemptId !== undefined && live.attemptId !== '' && live.attemptId !== fold.attemptId) return undefined
        this.liveFold = undefined
        return noLive()
      }
    }
  }

  private consume(frame: SyncStreamFrame): void {
    if (frame.type === 'state') {
      const previous = this.store.getSnapshot().state
      // The producer sends the complete view, and it is adopted wholesale. A
      // frame that carries only the machine list is tolerated rather than
      // applied: the snapshot backs all three surfaces, so replacing it with a
      // partial object blanks the role, listener, and link facts they all
      // render. Only the part that actually arrived is taken.
      const complete = isCompleteState(frame.state)
      const state: SyncState = complete
        ? frame.state
        : {
            ...previous,
            machines: Array.isArray(frame.state.machines) ? frame.state.machines : previous.machines,
          }
      this.update({
        state,
        ready: true,
        // The complete state frame is authoritative for which questions are open:
        // it is what a page that just loaded has, and it is how a frame this
        // browser missed gets repaired.
        ...(complete ? { questions: frame.state.questions ?? [] } : {}),
        // Same rule for the approvals: a complete frame is the whole set, so a card
        // this browser never saw open is still removed by it.
        ...(complete ? { approvals: frame.state.approvals ?? [] } : {}),
      })
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
      const settled = frame.events.some(isSettlement)
      if (settled) this.liveFold = undefined
      this.update({
        transcript: { ...transcript, events: mergeEvents(transcript.events, frame.events) },
        // A durable settlement ends the streaming step it belongs to.
        ...(settled ? { live: noLive() } : {}),
      })
      return
    }
    if (frame.type === 'stream') {
      const snapshot = this.store.getSnapshot()
      const open = snapshot.open
      if (open === undefined) return
      if (open.machineName !== frame.machineName || open.sessionId !== frame.sessionId) return
      // An older Host posts the whole-text shape; this client was built for the
      // official chunk stream. Ignoring it is the honest degradation: no live row
      // rather than a crash on a frame it cannot read.
      if ((frame as { live?: unknown }).live === undefined) return
      const live = this.foldLive(frame.live)
      if (live === undefined) return
      this.notify(observer => { observer.streamed(open, frame) })
      this.update({ live })
      return
    }
    if (frame.type === 'question') {
      const snapshot = this.store.getSnapshot()
      const view = frame.question
      if (view.closed === undefined) {
        this.update({ questions: upsertQuestion(snapshot.questions, view) })
        return
      }
      // A closed card takes its answer progress with it: that progress existed to
      // explain this card, and leaving it behind would leak one entry per question
      // for the life of the page.
      this.update({
        questions: snapshot.questions.filter(question => question.questionId !== view.questionId),
        answers: withoutKey(snapshot.answers, view.questionId),
      })
      return
    }
    if (frame.type === 'approval') {
      const snapshot = this.store.getSnapshot()
      const view = frame.approval
      if (view.closed === undefined) {
        this.update({ approvals: upsertApproval(snapshot.approvals, view) })
        return
      }
      // A closed approval takes its decision progress with it, like a question's
      // answer: one entry per card, for the life of the page, is a leak.
      this.update({
        approvals: snapshot.approvals.filter(approval => approval.approvalId !== view.approvalId),
        decisions: withoutKey(snapshot.decisions, view.approvalId),
      })
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
    this.update({ error: frame.message, errorConflict: false })
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
      this.update({ error: describe(error), errorConflict: false })
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

/**
 * One refused Host response, with the Host's own classification of it.
 *
 * `conflict` is the settings-revision conflict the Host already re-read and retried:
 * the only refusal here that reloading the page recovers, and therefore the only one
 * the page may tell the reader to reload for. Every other refusal — a field the form
 * sent that the schema will not take, a settings row that is gone, a service that
 * went away — is a fact about the request itself, and a page reload changes nothing
 * about it.
 */
class HostFailure extends Error {
  /**
   * @param message - the Host's own sentence, shown to the reader verbatim.
   * @param conflict - whether the Host classified the refusal as a conflict.
   */
  constructor(message: string, readonly conflict: boolean) {
    super(message)
    this.name = 'HostFailure'
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
    let conflict = false
    try {
      const parsed = JSON.parse(text) as { error?: unknown; reason?: unknown; conflict?: unknown }
      if (typeof parsed.reason === 'string') reason = parsed.reason
      else if (typeof parsed.error === 'string') reason = parsed.error
      conflict = parsed.conflict === true
    } catch {
      // A non-JSON failure body leaves the status as the reason.
    }
    throw new HostFailure(reason, conflict)
  }
  return JSON.parse(text) as T
}

/** Human-readable one-line failure text. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Merge durable events into the open window, in sequence order.
 *
 * The same stream carries two arrivals: a live frame, which belongs at the end,
 * and a page the mirror fetched from behind its window, which belongs in front.
 * The sequence is the only thing that says which, and membership is what keeps a
 * replay from doubling a row.
 * @param held - the events already in the window.
 * @param incoming - the events just received.
 * @returns the merged window, in sequence order.
 */
function mergeEvents(held: readonly MirrorEvent[], incoming: readonly MirrorEvent[]): MirrorEvent[] {
  if (incoming.length === 0) return [...held]
  const seen = new Set(held.map(event => event.seq))
  const fresh = incoming.filter(event => !seen.has(event.seq))
  if (fresh.length === 0) return [...held]
  const last = held[held.length - 1]?.seq
  // The live case, and by far the common one: everything new sits above what is
  // held, so the order is already right and no sort is needed.
  if (last !== undefined && fresh.every(event => event.seq > last)) return [...held, ...fresh]
  return [...held, ...fresh].sort((left, right) => left.seq - right.seq)
}

/**
 * Put one question into the open set, in the order the asks arrived.
 *
 * A question already held is replaced rather than duplicated: the server may
 * re-state an open one (a reconnect replays state), and two cards for one
 * decision is exactly the confusion this feature exists to avoid.
 * @param held - the questions already on screen.
 * @param view - the question that just arrived.
 * @returns the new set, oldest ask first.
 */
function upsertQuestion(
  held: readonly RelayedQuestionView[],
  view: RelayedQuestionView,
): RelayedQuestionView[] {
  const without = held.filter(question => question.questionId !== view.questionId)
  return [...without, view].sort((left, right) => left.openedAt - right.openedAt)
}

/**
 * Put one approval into the open set, in the order the offers arrived.
 *
 * The same rule as a question's: one card per approval, replaced rather than
 * duplicated, because two cards for one permission is the confusion this feature
 * exists to avoid — and here a reader cannot tell which of the two is live.
 * @param held - the approvals already on screen.
 * @param view - the approval that just arrived.
 * @returns the new set, oldest offer first.
 */
function upsertApproval(
  held: readonly RelayedApprovalView[],
  view: RelayedApprovalView,
): RelayedApprovalView[] {
  const without = held.filter(approval => approval.approvalId !== view.approvalId)
  return [...without, view].sort((left, right) => left.openedAt - right.openedAt)
}

/**
 * One record's entries except a named key.
 * @param record - the record to copy.
 * @param key - the key to drop.
 * @returns a copy without that key.
 */
function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [name, value] of Object.entries(record)) {
    if (name !== key) next[name] = value
  }
  return next
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
