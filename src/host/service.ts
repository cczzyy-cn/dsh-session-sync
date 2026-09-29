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
import { join } from 'node:path'
import {
  serverOrigin,
  type ConfigPatch,
  type DownstreamCommand,
  type LocalSessionRow,
  type MirrorEvent,
  type MirrorTranscript,
  type PublishIndexPayload,
  type RelayedAnswerItem,
  type RelayedApprovalDecision,
  type StreamDeltaPayload,
  type SyncConfig,
  type SyncState,
  type SyncStreamFrame,
} from '../shared/protocol.ts'
import { loadConfig, saveConfig } from './config.ts'
import type {
  ApprovalNext,
  ApprovalOutcomeLike,
  ApprovalRequestLike,
  AskUserQuestionAnswerLike,
  AskUserQuestionItemLike,
  AskUserQuestionNext,
  FollowFrame,
  HostContext,
  SessionControllerLike,
  SessionSummaryRow,
  WireEvent,
} from './dsh.ts'
import { SyncHub, type BrowserSink } from './hub.ts'
import { ApprovalRelay } from './approvals.ts'
import { InteractionRelay } from './interactions.ts'
import { resolveHome } from './config.ts'
import { OriginLink, startSyncServer, type SyncServerHandle } from './transport.ts'
import { SessionStatsReader } from './session-stats.ts'
import { pluginVersion } from './version.ts'

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
   * Sessions whose log this machine has read back to its beginning, by proof.
   *
   * Service-scoped rather than per-follow because it is a fact about what has
   * been *published*, not about one attempt at opening a window — and a follow
   * handle is replaced by every reconnect and every replay the server asks for.
   * Kept per Session because the alternative is worse than the bug it fixes: a
   * handle's opening frame reports `hasMore` for its own tail window, which is
   * true of every Session longer than that window, so trusting it on each
   * re-open put the reader's "older" control back on screen forever.
   *
   * The value is the *evidence*, not a flag, because the claim has to be
   * falsifiable after the fact: a read that reported "nothing older" while its
   * window never reached the log's first sequence is not proof of a beginning,
   * and treating it as one latched `hasOlder` to false for the rest of the
   * episode — the origin then denied history it was holding, the mirror's floor
   * froze, and nothing left running could clear it.
   */
  private readonly startProven = new Map<string, { at: number; throughSeq: number; records: number; source: 'opening' | 'page' }>()
  /**
   * Owns the signal for the history reads a reader's paging triggers.
   *
   * Service-scoped on purpose: a page read is a read of the Session's log, not a
   * step of any follow attempt, so tying it to a follow's lifecycle is what made
   * a page read die with "this operation was aborted" whenever the follow was
   * replaced underneath it.
   */
  private readonly pageAbort = new AbortController()

  /**
   * What the last history read did, for the settings page.
   *
   * The host half writes its log where this deployment cannot read it, and a
   * page that comes back empty is indistinguishable from a machine that has
   * nothing older — so the one fact that separates them is published here.
   */
  private lastPageRead: SyncState['page']
  /**
   * Why the most recent attempt to read history did not run.
   *
   * Kept apart from {@link lastPageRead} because they answer different questions
   * and the second must not erase the first: the sweep re-asks for a gap while a
   * read floor is still active, and a skipped attempt recorded *as* the read made
   * a served page look like a refused one — the diagnosis of the next fault would
   * have been the limiter's, not the fault's.
   */
  private lastPageAttempt: SyncState['pageAttempt']
  /** Reads this machine's own Session logs for the whole-log totals the index carries. */
  private readonly stats: SessionStatsReader

  /** The last publish attempt, as the settings page reports it. */
  private lastPublish: { at: number; ok: boolean; error?: string } | undefined
  /**
   * The two-sided race for the questions this machine's Sessions ask.
   *
   * Owned here because the link is: the relay's sink reads {@link link} at call
   * time, so a question asked while the link is down is simply answered locally
   * rather than queued against a stream that may never come back.
   */
  private readonly relay: InteractionRelay
  /**
   * The approval half of the same idea, and the reason it is a separate object:
   * an approval's outcome is *permission*, so it is offered only for Sessions a
   * user opted in by name (see {@link approveable}) and its TTL is shorter.
   */
  private readonly approvals: ApprovalRelay
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
    this.relay = new InteractionRelay({
      open: (sessionId, questionId, questions, expiresAt) => {
        this.link?.publishQuestion({ sessionId, questionId, questions, expiresAt })
      },
      close: (sessionId, questionId, outcome) => {
        this.link?.publishQuestionClose({ sessionId, questionId, outcome })
      },
      now: () => Date.now(),
    })
    this.approvals = new ApprovalRelay({
      open: (sessionId, approvalId, approval, expiresAt) => {
        this.link?.publishApproval({ sessionId, approvalId, approval, expiresAt })
      },
      close: (sessionId, approvalId, outcome) => {
        this.link?.publishApprovalClose({ sessionId, approvalId, outcome })
      },
      now: () => Date.now(),
    })
    // The whole-log totals the index carries. Read from this machine's own Session
    // logs, because a mirror's window is all a console can count.
    this.stats = new SessionStatsReader(join(home, 'sessions'))
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
      // And the half of the delivery rule a write cannot give: a command accepted by
      // a stream that was closing has to be handed over again. Safe only because the
      // origin refuses a command id it has already admitted.
      this.hub.retryCommands()
      this.hub.sweepGaps()
      // Same pass, same reason: a relayed question outlives its usefulness when
      // its TTL passes or the machine that asked stops appearing, and nothing
      // else would ever revisit the card.
      this.hub.sweepQuestions()
      // And an approval, which outlives its usefulness sooner: the machine's tool
      // call is blocked on it, so a card that stayed past its TTL would offer a
      // permission whose call has already failed closed.
      this.hub.sweepApprovals()
      void this.reconcile()
    }, RECONCILE_MS)
    this.flushTimer = setInterval(() => { this.flushStream(); this.flush() }, FLUSH_MS)
    void this.applyRole()
  }

  /** Stop every timer and connection, and drop every subscriber. */
  async dispose(): Promise<void> {
    this.disposed = true
    // Tell the console that any question this machine was waiting on is gone:
    // a card for a process that has exited offers a decision nobody can take.
    this.relay.withdrawAll('aborted')
    // An approval matters more, not less: a card for an exited process would offer
    // a *permission* over a call that no longer exists, and the reader would have no
    // way to tell that approving it decides nothing.
    this.approvals.withdrawAll('aborted')
    if (this.reconcileTimer !== undefined) clearInterval(this.reconcileTimer)
    if (this.flushTimer !== undefined) clearInterval(this.flushTimer)
    for (const handle of this.follows.values()) handle.abort.abort()
    this.follows.clear()
    this.link?.stop()
    this.link = undefined
    await this.stopServer()
    this.stats.dispose()
    this.browsers.clear()
  }

  /** The configuration as the browser should render it. */
  configView(): SyncConfig {
    return {
      ...this.config,
      syncSessions: { ...this.config.syncSessions },
      // Copied for the same reason, and one more: this is the map that decides
      // whether another machine may grant permissions here, so a caller must not be
      // able to mutate the engine's copy by holding on to the view.
      approveSessions: { ...this.config.approveSessions },
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
      pluginVersion: pluginVersion(),
      listening,
      ...(this.listenError === undefined ? {} : { listenError: this.listenError }),
      linked,
      ...(this.linkError === undefined ? {} : { linkError: this.linkError }),
      machines: this.config.isServer ? this.hub.machines() : [],
      ...(this.config.isServer ? { questions: this.hub.questions() } : {}),
      ...(this.config.isServer ? { approvals: this.hub.approvals() } : {}),
      published: Object.values(this.config.syncSessions).filter(Boolean).length,
      ...(this.lastPublish === undefined ? {} : { publish: this.lastPublish }),
      ...(this.config.isServer ? {} : {
        // A race has one winner and one invisible loser, so the losing side is
        // counted: without these numbers "the console never offered it" and "the
        // console offered it and this machine answered first" are the same
        // observation, and this deployment's logger writes nowhere readable.
        interactions: this.relay.counts(),
        // Counted the same way and for the same reason, with one addition: an
        // approval that was never *offered* (its Session is not opted in) must be
        // distinguishable from one that was offered and lost the race, because the
        // first is a configuration fact and the second is a race outcome.
        approvalCounts: this.approvals.counts(),
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
          pending: handle.pending.length,
          events: handle.seen,
          ...(handle.ended === undefined ? {} : { ended: handle.ended }),
        })),
        ...(this.lastPageRead === undefined ? {} : { page: this.lastPageRead }),
        ...(this.lastPageAttempt === undefined ? {} : { pageAttempt: this.lastPageAttempt }),
        ...(this.startProven.size === 0 ? {} : {
          started: [...this.startProven].map(([sessionId, evidence]) => ({
            sessionId,
            at: evidence.at,
            throughSeq: evidence.throughSeq,
            records: evidence.records,
            source: evidence.source,
          })),
        }),
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
      approveSessions: { ...previous.approveSessions },
    }
    if (patch.sessionSync !== undefined) {
      if (patch.sessionSync.synced) next.syncSessions[patch.sessionSync.sessionId] = true
      else delete next.syncSessions[patch.sessionSync.sessionId]
    }
    if (patch.sessionApprovals !== undefined) {
      // Un-publishing a Session drops its approval opt-in in the same write: the
      // console cannot decide an approval for a Session it cannot see, so leaving
      // the grant behind would be a switch that reads "on" while doing nothing —
      // and would silently arm itself again if the Session were published later.
      if (patch.sessionApprovals.approved && next.syncSessions[patch.sessionApprovals.sessionId] === true) {
        next.approveSessions[patch.sessionApprovals.sessionId] = true
      } else {
        delete next.approveSessions[patch.sessionApprovals.sessionId]
      }
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
   * @param page - page size and the exclusive upper sequence to read below.
   * @returns the page, or undefined when nothing is mirrored under that address.
   */
  transcript(
    machineName: string,
    sessionId: string,
    page?: { limit: number; before?: number },
  ): MirrorTranscript | undefined {
    return this.hub.transcript(machineName, sessionId, page)
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
   * Issue the console's answer to one relayed question.
   * @param machineName - the machine that asked.
   * @param questionId - the question being answered.
   * @param answers - the console's answers.
   * @returns the accepted command's id, or why it was refused.
   */
  submitAnswer(
    machineName: string,
    questionId: string,
    answers: readonly RelayedAnswerItem[],
  ): { ok: true; commandId: string } | { ok: false; reason: string } {
    if (!this.config.isServer) return { ok: false, reason: 'this instance is not the sync server' }
    return this.hub.submitAnswer(machineName, questionId, answers, this.config.machineName)
  }

  /**
   * Issue the console's decision on one relayed approval.
   *
   * Server role only, like {@link submitAnswer}: the decision exists to be handed
   * to the machine that is blocked, and only a server holds those links. The
   * machine still has the last word — it claims the decision only while it is
   * still waiting — so what this method's caller gets back is a *delivery*
   * acknowledgement, not a grant.
   * @param machineName - the machine that is blocked.
   * @param approvalId - the approval being decided.
   * @param decision - allow once, or reject.
   * @returns the accepted command's id, or why it was refused.
   */
  submitApproval(
    machineName: string,
    approvalId: string,
    decision: RelayedApprovalDecision,
  ): { ok: true; commandId: string } | { ok: false; reason: string } {
    if (!this.config.isServer) return { ok: false, reason: 'this instance is not the sync server' }
    // The console's own identity, not the origin's: the status a browser reads says
    // who decided, and a machine relaying its own decision is never this path.
    return this.hub.submitApproval(machineName, approvalId, decision, this.config.machineName)
  }

  /**
   * Ask the console and the machine's own UI at once, and take the first answer.
   *
   * Registered ahead of the shipped browser answerer so that both are asked: the
   * local side through `next()`, which is what actually reaches that answerer
   * (the Remote waterfall bridge), and the console down the sync link. The first
   * to answer claims the question, and the other is told so.
   *
   * Only a published Session is relayed, and only while this machine is a
   * publisher with a link: for anything else this listener delegates on the first
   * line and the product behaves exactly as it does without this plugin.
   * @param ctx - the Host context that owns the registration.
   */
  answerQuestions(ctx: HostContext): void {
    const listener = (
      request: { questions: readonly AskUserQuestionItemLike[]; agent?: { id: string } },
      next: AskUserQuestionNext,
    ): Promise<AskUserQuestionAnswerLike> => {
      const sessionId = request.agent?.id
      if (sessionId === undefined || !this.relayable(sessionId)) return next()
      return this.relay.race(sessionId, request.questions, next)
    }
    ctx.effect(
      () => ctx.on('user-questions/request', listener, { prepend: true }),
      'dsh-session-sync: question relay',
    )
  }

  /**
   * Whether one Session's questions are worth offering to a console.
   * @param sessionId - the Session being asked in.
   * @returns true when this machine publishes it to a server it is linked to.
   */
  private relayable(sessionId: string): boolean {
    if (this.config.isServer) return false
    if (this.config.syncSessions[sessionId] !== true) return false
    return this.link !== undefined
  }

  /**
   * Ask the console and the machine's own UI at once, and take the first decision.
   *
   * Registered ahead of the shipped browser answerer, exactly like the question
   * relay, and gated one notch tighter. A question may be relayed for any published
   * Session; an approval only for a Session the user opted in by name, because the
   * outcome is permission rather than information: `allowed-once` releases a tool
   * call this machine's own preset was gating, and that authority must not follow
   * from the act of publishing a conversation.
   *
   * What this listener cannot do is *widen* a denial. A `never` policy is enforced by
   * the upstream service before it dispatches this event, so a Session whose policy
   * refuses an operation never reaches an answerer at all — the console is offered
   * only what the machine left open.
   * @param ctx - the Host context that owns the registration.
   */
  answerApprovals(ctx: HostContext): void {
    const listener = (
      request: ApprovalRequestLike,
      next: ApprovalNext,
    ): Promise<ApprovalOutcomeLike> => {
      const sessionId = request.agent?.id
      if (sessionId === undefined || !this.approveable(sessionId)) return next()
      return this.approvals.race(sessionId, request, next)
    }
    ctx.effect(
      () => ctx.on('approval/request', listener, { prepend: true }),
      'dsh-session-sync: approval relay',
    )
  }

  /**
   * Whether one Session's approvals may be decided from a console.
   *
   * Two switches, not one, and the published one is required as well: the console
   * resolves what is being approved from the mirrored transcript, so an approval for
   * an un-published Session would ask a reader to grant something they cannot see.
   * @param sessionId - the Session the approval belongs to.
   * @returns true when this Session's approvals are offered to the console.
   */
  private approveable(sessionId: string): boolean {
    if (!this.relayable(sessionId)) return false
    return this.config.approveSessions[sessionId] === true
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
    // What the controller is asked to read against: the reader's own bound, so the
    // page ends exactly where the reader asked. The controller cuts a page at
    // `min(throughSeq + 1, beforeSeq)`, and passing the follow's cut here instead
    // let that cut win — a follow sits at the top of the log, so every read
    // returned everything from the log's start up to that cut. The mirror then
    // trims to its retention limit, keeping the oldest and newest of what arrived
    // and dropping the middle, so the *next* read produced the same page again and
    // the backfill frontier never moved: measured as a mirror pinned at
    // `[0, 2283] ∪ [5975, 6257]` with `missing: 3691` that no sweep could close.
    //
    // The handle's cut is still what a *follow* opens on; it is simply not the
    // bound of a backwards page.
    const pageThrough = beforeSeq - 1
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
    // What this attempt is, kept apart from what the last read *found*. Writing it
    // into the read record would erase a served page the moment the mirror's own
    // sweep re-asked while the read floor was active — the diagnosis of the next
    // fault would then be the limiter's, not the fault's.
    const now = Date.now()
    if (skip !== undefined) {
      this.lastPageAttempt = { sessionId, beforeSeq, reason: skip, at: now }
      // Nothing was read, so there is no read to report — unless nothing ever was.
      if (this.lastPageRead?.records === undefined) this.lastPageRead = { sessionId, beforeSeq, reason: skip }
      return
    }
    const previous = this.pageAsked.get(sessionId)
    if (previous !== undefined && now - previous < PAGE_FLOOR_MS) {
      this.lastPageAttempt = { sessionId, beforeSeq, reason: 'rate-limited', at: now }
      if (this.lastPageRead?.records === undefined) {
        this.lastPageRead = { sessionId, beforeSeq, reason: 'rate-limited' }
      }
      return
    }
    // A real read is about to happen, so the attempt's own shape is the honest
    // stand-in until the answer replaces it.
    this.lastPageAttempt = { sessionId, beforeSeq, at: now }
    this.lastPageRead = {
      sessionId,
      beforeSeq,
      ...(handle === undefined ? {} : { throughSeq: handle.cursor }),
    }
    if (handle === undefined || controller === undefined) return
    this.pageAsked.set(sessionId, now)
    try {
      // Aborted by this service, never by the follow. The read is a cold read of
      // the Session's own log — it does not depend on the follow's attempt — and
      // its result is posted straight to the outbox for the same reason. Passed the
      // follow's signal, it was killed whenever the origin resynced that follow,
      // which is often: measured as `page … error: "This operation was aborted"`,
      // and it is why a mirror could never be walked back to the Session's
      // beginning — which in turn is the only way a long Session can be written at
      // all, since a copy has to start at seq 0.
      const page = await controller.page(
        {
          address: { kind: 'session', sessionId },
          throughSeq: pageThrough,
          beforeSeq,
          maxMessages,
        },
        this.pageAbort.signal,
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
      // "older" control finally goes away. That fact outlives this handle: a page
      // read back to the beginning is about the log, and a reconnect that re-opens
      // the follow must not re-open the question with it.
      //
      // Claimed on evidence, not on the answer alone: a page whose lowest event is
      // still above seq 0 was cut before the log's beginning and says nothing about
      // where that beginning is. Recording it as "reached the start" is what made
      // the origin deny history it was holding, permanently and invisibly.
      const lowest = lowestSeqOf(page.records)
      const reachedStart = page.hasMore === false && lowest === 0
      const hadOlder = handle.hasOlder
      if (reachedStart) {
        this.startProven.set(sessionId, {
          at: Date.now(), throughSeq: pageThrough, records: page.records.length, source: 'page',
        })
      }
      handle.hasOlder = page.hasMore
      // ...and the index has to be re-sent for that to reach the mirror: it is
      // published on a reconcile, and `hasOlder` is only ever *named* when true,
      // so a page that reached the beginning would otherwise leave the mirror
      // believing there is more forever.
      if (hadOlder !== handle.hasOlder) void this.reconcile()
      this.lastPageRead = {
        sessionId,
        beforeSeq,
        throughSeq: pageThrough,
        // What the read asked its log for. Kept because a page that ignores the
        // message budget looks exactly like a page that honours it, except in its
        // size — and its size is what tells the two apart from outside.
        maxMessages,
        records: page.records.length,
        hasMore: page.hasMore,
        ...(lowest === undefined ? {} : { lowestSeq: lowest }),
        ...(reachedStart ? { reachedStart: true } : {}),
      }
      // The read just happened, so no skip is pending to explain.
      this.lastPageAttempt = undefined
      if (added > 0) {
        this.ctx.logger.info(`dsh-session-sync: sent ${String(added)} earlier event(s) of "${sessionId}"`)
      }
    } catch (error: unknown) {
      this.lastPageRead = {
        sessionId,
        beforeSeq,
        throughSeq: pageThrough,
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
      // A Session that stopped publishing starts a new episode if it comes back:
      // what was read back to the beginning belonged to the publish that ended,
      // and the honest starting point for a fresh one is "unknown" again.
      this.startProven.delete(sessionId)
      // Totals belong to the log that was read, so they go with the episode.
      this.stats.forget(sessionId)
    }
    for (const sessionId of desired) {
      if (!this.follows.has(sessionId)) this.startFollow(sessionId)
    }
    this.link?.publishIndex({
      machineName: this.config.machineName,
      pluginVersion: pluginVersion(),
      sessions: rows.filter(row => row.synced).map(row => {
        const handle = this.follows.get(row.sessionId)
        const lastSeq = handle?.lastSeq
        const stats = this.stats.cached(row.sessionId)
        // A Session whose totals are missing or stale is read in the background;
        // this index carries whatever is already known, and the next reconcile —
        // ten seconds away — carries the new ones. The read is deliberately not
        // awaited here: a five-megabyte log must not hold up a publish.
        if (stats === undefined || (lastSeq !== undefined && stats.seq < lastSeq)) {
          void this.refreshStats(row.sessionId, row.cwd, lastSeq)
        }
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
          // The one thing a console cannot compute for itself: what the whole log
          // holds, including everything below the mirror's retained window.
          ...(stats === undefined ? {} : { stats: stats.stats }),
        }
      }),
    } satisfies PublishIndexPayload)
  }

  /**
   * Read one Session's whole log for its totals, and publish them when they land.
   *
   * The reconcile that notices the totals are missing does not wait for this: the
   * read is disk work over a log that can be megabytes, and an index publish that
   * waits on one Session would delay every other machine's mirror. So the result
   * is published by triggering the next reconcile, which is where an index is
   * assembled anyway.
   * @param sessionId - the Session to read.
   * @param cwd - its working directory, which is where its log sits.
   * @param lastSeq - the highest sequence this machine has published for it.
   */
  private async refreshStats(sessionId: string, cwd: string | undefined, lastSeq: number | undefined): Promise<void> {
    if (this.disposed) return
    try {
      const computed = await this.stats.compute(sessionId, cwd, lastSeq ?? 0)
      if (computed !== undefined && !this.disposed) void this.reconcile()
    } catch (error: unknown) {
      // Never fatal: the console falls back to counting what it holds, which is
      // exactly what it did before this existed.
      this.ctx.logger.info(`dsh-session-sync: whole-log totals for "${sessionId}" unavailable: ${describe(error)}`)
    }
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
      if (typeof carrier['hasMore'] === 'boolean') {
        // An opening reports `hasMore` for the tail window it just took, which is
        // true of every Session longer than that window — so it can raise the
        // claim only while the log's beginning is still unknown. Once a page read
        // has walked back to the start, this machine has published everything
        // there is, and every later opening sits above history it already sent.
        if (carrier['hasMore'] === false) {
          // The same evidence rule as a page read: only an opening that actually
          // carried the log's first sequence establishes where the log begins.
          const opening = Array.isArray(carrier['records'])
            ? carrier['records'] as readonly { event?: unknown }[]
            : Array.isArray((carrier['page'] as Record<string, unknown> | undefined)?.['records'])
              ? (carrier['page'] as Record<string, unknown>)['records'] as readonly { event?: unknown }[]
              : []
          if (lowestSeqOf(opening) === 0) {
            this.startProven.set(handle.sessionId, {
              at: Date.now(), throughSeq: handle.cursor, records: opening.length, source: 'opening',
            })
          }
        }
        handle.hasOlder = carrier['hasMore'] === true && !this.startProven.has(handle.sessionId)
      }
      // The opening is the frame a page read depends on, so whether it ever
      // arrived is recorded rather than inferred from the cursor: an empty
      // Session legitimately cuts at -1, and a follow that never opened must not
      // look like one that did.
      if (typeof carrier['cursor'] === 'number') handle.opened = true
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

  /** Admit a takeover prompt, or claim a relayed question or approval, into the local Session it names. */
  private async runCommand(command: DownstreamCommand): Promise<void> {
    const link = this.link
    // An answer is settled by one question — does this machine still have that
    // question pending? — and that check *is* the finish line of the race. So a
    // console that answered a question the machine had already answered itself
    // gets `failed` carrying exactly that sentence, which is the honest result of
    // a race already decided rather than an error to retry.
    if (command.kind === 'answer') {
      const claimed = this.relay.claim(command.questionId, command.answers, command.commandId)
      link?.ackCommand(
        command.commandId,
        command.sessionId,
        claimed.ok,
        claimed.ok ? undefined : claimed.reason,
      )
      return
    }
    // An approval is the same shape of decision with a different stake, and the
    // claim is the same question: is this machine still blocked on it? If it is not
    // — because its own human decided, because the call was aborted, because the TTL
    // passed — the console's decision must be *refused*, not applied late. That
    // refusal is the safety property of this whole feature: a permission granted
    // after the fact is not a permission anybody is waiting for.
    if (command.kind === 'approval') {
      const claimed = this.approvals.claim(command.approvalId, command.decision, command.commandId)
      link?.ackCommand(
        command.commandId,
        command.sessionId,
        claimed.ok,
        claimed.ok ? undefined : claimed.reason,
      )
      return
    }
    const controller = this.controller()
    if (controller === undefined) return
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
      // Reported next to the publish switch because the two are related and
      // deliberately separate: publishing shares the conversation, and this grants
      // the authority to release a gated operation inside it. The page shows the
      // second switch only where the first is on, which is also the engine's rule.
      approved: this.config.approveSessions[item.sessionId] === true,
    }
  }

  /** Push the current state to every subscribed browser. */
  private broadcastState(): void {
    this.broadcast({ type: 'state', state: this.view() })
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

/**
 * The lowest durable sequence in one page of records.
 *
 * The evidence half of "this page reached the log's beginning": the controller
 * slices a page from the log's own first index, so a page that walked all the way
 * back carries seq 0. Absent when the page carries no durable event at all, which
 * proves nothing either way.
 * @param records - the page's records, in log order.
 * @returns the lowest sequence, or undefined when the page holds none.
 */
function lowestSeqOf(records: readonly { readonly event?: unknown }[]): number | undefined {
  let lowest: number | undefined
  for (const record of records) {
    const seq = (record.event as { seq?: unknown } | undefined)?.seq
    if (typeof seq !== 'number') continue
    if (lowest === undefined || seq < lowest) lowest = seq
  }
  return lowest
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
