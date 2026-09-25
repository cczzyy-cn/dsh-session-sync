/**
 * The plugin's mirror, projected onto the shipped DSH conversation renderer.
 *
 * The console hand-draws a remote Session's conversation because a browser
 * plugin cannot import another plugin's components. A DSH build that offers
 * `ctx.sessions.adopt` removes that limit: the plugin adopts the remote Session
 * under a synthetic local identity, feeds the mirror's own envelopes into it,
 * and lets the shipped `conversation.content` factory draw it — so the pane is
 * the product's real conversation rather than a copy of it.
 *
 * Everything in this module is feature-detected and structurally typed. The
 * adoption API is newer than the builds this plugin has to keep working on, so
 * nothing here may assume it exists: {@link OfficialSessions.supported} is false
 * without it, and the console then keeps its own pane untouched.
 */
import * as React from 'react'
import type { MirrorEvent, MirrorTranscript, MirroredSession } from '../shared/protocol.ts'
import {
  isSettlement,
  type OpenSession,
  type SyncClientSnapshot,
  type SyncEventsFrame,
  type SyncLiveDelta,
  type SyncTransportObserver,
} from './api.ts'

/**
 * The child slot the console's `main` entry declares for the shipped
 * Conversation.
 *
 * A non-root child is what hands the panel its `SessionProvider` and
 * `renderSlot` seats, and `session` is the scope the shipped content needs: the
 * occurrence is bound to the adopted Session the panel retains. This is the
 * shape ui-subagent's `SidebarChatTab` uses for its own embedded chat.
 */
export const OFFICIAL_SLOT = 'session-sync.conversation'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Session-scoped occurrence of the shipped Conversation, hosted by the console's panel. */
    'session-sync.conversation': { kind: 'single'; scope: 'session' }
  }
}

/** Consumer label this plugin registers on every reference it retains. */
const OFFICIAL_SOURCE = 'sessionSync'

/**
 * Synthetic local identity of one adopted remote Session.
 *
 * Local identities are minted as `session-<uuid>`; this prefix cannot come out
 * of that generator, so an adopted Session can never collide with a local one —
 * the one rule the adoption API states about the id it is given.
 * @param open - the remote Session's own address.
 * @returns the stable synthetic id.
 */
export function officialSessionId(open: OpenSession): string {
  return `dsh-session-sync:${open.machineName}/${open.sessionId}`
}

/** A Session reference as the Client Controller hands it out. */
export interface SessionReferenceLike {
  readonly sessionId: string
  /**
   * The shared initial history read, when the hand-out carries one.
   *
   * The `address` route is the only one whose read can fail — the Host is asked
   * about a Session it has never heard of — so the console observes it and keeps
   * drawing rather than letting it surface as an unhandled rejection.
   */
  readonly ready?: Promise<unknown>
  release(): void
}

/**
 * The catalog row an adoption publishes into the client's Session list.
 *
 * A superset of the two spellings this plugin can meet: the client's own
 * `SessionSummary` row wants `id` and `displayTitle`, while this plugin's mirror
 * speaks in `sessionId` and `title`. Both are supplied so a summary stays
 * correct under either, and `retainedBy` is the empty table the service
 * replaces with its own live counts.
 */
export interface SessionSummaryLike {
  /** The adopted identity (`SessionSummary.id`). */
  id: string
  /** The remote Session's own id, which this plugin's own surfaces render. */
  sessionId: string
  /** Latest log-backed title, when the mirror has one. */
  title: string
  /** The human-facing label the client's list shows. */
  displayTitle: string
  cwd?: string
  updatedAt: number
  running: boolean
  blank: boolean
  /** Local ownership counts; the service overwrites this with the live table. */
  retainedBy: Record<string, number>
}

/** One Remote call's failure, in the shape the client Session face returns. */
export interface RemoteFailureLike {
  name: string
  /** Stable carrier/business code (`gateway/bad-request`, `gateway/internal`, …). */
  code: string
  message: string
  details: Record<string, unknown>
  /** The carrier's structural marker, so `remoteErrorOf` recognises it. */
  isDSHRemoteError: true
}

/** One Remote call's outcome (`RemoteResult`), structurally. */
export type RemoteResultLike<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RemoteFailureLike }

/**
 * One refused verb, as the client Session face returns refusals.
 *
 * The shape is structural on purpose: a `RemoteResult` error branch carrying a
 * `RemoteError`-like failure, so a consumer that checks `result.ok` or rethrows
 * `result.error` gets a real error with a stable code.
 * @param code - the failure code.
 * @param message - the human diagnostic.
 * @returns the refused outcome.
 */
function refused(code: string, message: string): { ok: false; error: RemoteFailureLike } {
  return { ok: false, error: { name: 'RemoteError', code, message, details: {}, isDSHRemoteError: true } }
}

/** The verbs the shipped composer needs from the Session it is bound to. */
export interface AdoptVerbs {
  /**
   * One prompt submission from the shipped composer.
   * @param content - the submitted content blocks.
   * @param mode - the delivery mode the composer asked for.
   * @param signal - cancellation of the composer's own submission.
   * @param requestId - the identity a registered submission echo would carry.
   * @returns the admission outcome.
   */
  prompt?(
    content: { type: string; text?: string }[],
    mode: 'queue' | 'steer',
    signal?: AbortSignal,
    requestId?: string,
  ): Promise<RemoteResultLike<{ accepted: true }>>
  /** Cancel the running turn, when the build supports it. */
  cancel?(): Promise<RemoteResultLike<{ accepted: true }>>
}

/** What one adopted Session is opened from. */
export interface AdoptSource {
  /** Synthetic identity; must not collide with a local Session id. */
  sessionId: string
  /** Row facts the renderer shows outside the event window. */
  summary?: SessionSummaryLike
  /** The composer's verbs. */
  verbs?: AdoptVerbs
  /** Whether the origin is mid-turn. */
  running?: boolean
}

/**
 * One adopted Session's handle, as `ctx.sessions.adopt` returns it.
 *
 * Structural on purpose: the adoption API is newer than this plugin's build
 * target, so the face it consumes is declared here rather than imported. A build
 * without it fails feature detection and the console keeps its own pane; a build
 * whose handle is shaped differently is a mismatch this plugin cannot detect,
 * which is why every method below is called only through this module.
 */
export interface AdoptedSessionHandle {
  /**
   * Replace the whole mirrored window.
   * @param events - durable wire envelopes, in log order.
   * @param hasMore - whether older history is reachable.
   */
  replace(events: readonly unknown[], hasMore: boolean): void
  /** Append one durable envelope. */
  append(event: unknown): void
  /** Replace the streaming text of one live attempt (the full text so far). */
  live(o: { attemptId: string; turn: number; step: number; kind: 'text' | 'reasoning'; text: string; time?: number }): void
  /** Close one live attempt with its durable settlement event. */
  settle(o: { attemptId: string; event: unknown }): void
  /** Close one live attempt that will not settle. */
  abandon(o: { attemptId: string }): void
  /** Report the origin's running flag. */
  setRunning(running: boolean): void
  /** Drop the adopted Session. Idempotent. */
  release(): void
}

/** One durable-parent address, as `SubagentAddress` carries it. */
export interface SubagentAddressLike {
  readonly parentSessionId: string
  readonly childSessionId: string
}

/**
 * One Session's event window, as its binding exposes it.
 *
 * Narrower than the shipped type on purpose — this module declares the shape it
 * calls, so a build whose window differs in some other member still matches.
 */
export interface SessionEventSourceLike {
  replace(entries: readonly unknown[], hasMore: boolean): void
  /** Put entries below the window, which is how older history is added. */
  prepend(entries: readonly unknown[], hasMore: boolean): void
  append(entry: unknown): void
  /** Retire one attempt's transient rows, inserting its durable settlement. */
  settleAssistant(attemptId: string, entry?: unknown): void
  getSnapshot(): { entries: readonly { event: { seq: number } }[]; hasMore: boolean }
}

/** One retained Session, as `ctx.sessions.binding()` hands it out. */
export interface SessionBindingLike {
  /** The Session face; only the running flag is of interest here. */
  readonly session?: { handleRunning?(running: boolean): void }
  readonly eventSource?: SessionEventSourceLike
}

/**
 * How this build lets the console draw a Session it does not own.
 *
 * Three routes, in the order they are preferred. `adopt` is the one a patched
 * DSH offers, and the only one that can hand a prompt to the plugin. `scope` and
 * `address` are built from pieces released builds already have, and drive the
 * window directly instead — read-only, with the console's own composer taking
 * the Session's prompts.
 */
export type OfficialRoute = 'adopt' | 'scope' | 'address'

/** The subset of the client Sessions service this half needs. */
export interface AdoptCapableSessions {
  /** Adopt one Session under a synthetic identity (patched builds only). */
  adopt?(source: AdoptSource): AdoptedSessionHandle
  /**
   * Retain without catalog or history I/O: the seam that makes a Session the
   * Host has never heard of renderable, and the reason `scope` comes first.
   * @param id - the synthetic identity.
   * @returns the reference the renderer binds.
   */
  retainAgentScope?(id: string): SessionReferenceLike
  /**
   * Retain an exact client generation.
   *
   * An address object is accepted as well as an id: the client resolves an
   * address without asking whether the Session is catalogued, which is what
   * makes the `address` route possible at all.
   * @param target - the adopted identity, or a durable parent address.
   * @param options - consumer source and optional cancellation.
   * @returns the reference the renderer binds.
   */
  retain(
    target: string | SubagentAddressLike,
    options: { source: string; signal?: AbortSignal },
  ): SessionReferenceLike
  /**
   * The live binding for one identity, when the service holds one.
   * @param id - the synthetic identity.
   * @returns the binding, whose event source the console can drive.
   */
  binding?(id: string): SessionBindingLike | undefined
  /** The client's Session list, read only for a parent identity to address. */
  readonly list?: { getSnapshot(): { ids?: readonly string[] } }
}

/** The composer-block registry: `ctx.conversation.blocks` in the shipped client. */
export interface ComposerBlocksLike {
  set(sessionId: string, block: { reason: string } | undefined): void
}

/** The one context capability this module uses: the client service lookup. */
export interface OfficialContext {
  get?(name: string): unknown
}

/**
 * What the adapter needs from the plugin's own transport client.
 *
 * A structural seam rather than the class itself: the adapter reads the one
 * snapshot every surface reads and sends prompts down the takeover route the
 * console's own composer already uses.
 */
export interface OfficialTransport {
  /** The snapshot store both surfaces render. */
  readonly snapshot: { getSnapshot(): SyncClientSnapshot }
  /** The plugin's existing takeover path: `POST /dsh-session-sync/command`. */
  sendPrompt(text: string): Promise<boolean>
}

/** One renderer-provided child-slot dispatch (`ui-slots`' standard seat). */
export type RenderSlotLike = (key: string, owner: object) => React.ReactNode
/**
 * The renderer-provided session-scope provider (`ui-slots`' standard seat).
 *
 * Omitting `session` inherits the surrounding binding, which is why the console
 * only renders the shipped pane while it holds a reference of its own.
 */
export type SessionProviderComponent = React.ComponentType<{
  session?: SessionReferenceLike | undefined
  empty?: (() => React.ReactNode) | undefined
  children?: React.ReactNode
}>

/** The renderer-provided Factory dispatcher (`ui-slots`' standard seat). */
export type RenderFactorySlotLike = (
  name: string,
  props: object,
  options?: { slots?: Record<string, unknown>; fallback?: React.ReactNode },
) => React.ReactNode

/** What the console's panel asks of the shipped-renderer bridge. */
export interface OfficialBridgeFace {
  /** False on any build where no route to the shipped renderer exists. */
  readonly supported: boolean
  /**
   * Which route the shipped pane is drawn through, when there is one.
   *
   * Operator-visible on purpose: the routes differ in what the pane can do and
   * in what they cost, and which one a given build takes is not something to
   * discover by reading a bundle.
   */
  readonly route: OfficialRoute | undefined
  /**
   * Whether the console must draw the composer itself.
   *
   * True on the routes that drive the window directly: the shipped composer
   * would send its prompt through the Host, which has never heard of this
   * Session, so it is blocked and the console's takeover composer stands in.
   */
  readonly composerOwned: boolean
  /**
   * The reference to bind for one remote Session.
   * @param machineName - owning machine.
   * @param sessionId - the remote Session's own id.
   * @returns the reference while exactly that Session is drawn, else undefined.
   */
  referenceFor(machineName: string, sessionId: string): SessionReferenceLike | undefined
}

/**
 * One live attempt's identity, from the plugin's own live key.
 *
 * The transport already keys a live row by turn and step, and both a live frame
 * and the settlement that ends it carry that pair — so the same attempt id is
 * derived on both sides with no hidden state to keep in step.
 * @param turn - the turn the step belongs to.
 * @param step - the step within the turn.
 * @returns the attempt id.
 */
function attemptKey(turn: number, step: number): string {
  return `${String(turn)}:${String(step)}`
}

/**
 * The turn|step a settlement event closes, when it names one.
 * @param event - one durable envelope.
 * @returns the attempt id, or undefined for an envelope without coordinates.
 */
function settlementAttemptId(event: MirrorEvent): string | undefined {
  const data = asRecord(event.data)
  const turn = data?.['turn']
  const step = data?.['step']
  return typeof turn === 'number' && typeof step === 'number' ? attemptKey(turn, step) : undefined
}

/** The adapter key of one remote Session: machine and id, in one string. */
function remoteKey(machineName: string, sessionId: string): string {
  return `${machineName}\u0000${sessionId}`
}

/**
 * Envelope types that exist only to point a Host-computed panel at its data.
 *
 * `workspace/changes` carries a turn number and nothing else; the files and
 * totals beside it are served by whichever Host owns the Session, which for a
 * mirrored one is a Host that has never heard of it. Official seats react to the
 * announcement and ask for a summary that cannot arrive — one failed request per
 * announcement, and a card left marked unavailable — so the announcement is
 * dropped from the window this console feeds. Nothing visible is lost: the card
 * it drives could never render, while the tool rows that actually changed the
 * files are ordinary events and stay.
 */
const PANEL_ONLY_TYPES: ReadonlySet<string> = new Set(['workspace/changes'])

/** Whether one envelope feeds a Host-computed panel and nothing else. */
function isPanelOnly(event: MirrorEvent): boolean {
  return PANEL_ONLY_TYPES.has(event.type)
}

/** Narrow one unknown value to a plain record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/**
 * One adopted remote Session, and the frames fed into it.
 *
 * One instance per opened remote Session. Every method is safe to call after
 * {@link OfficialMirror.release}: a Session switch and the panel closing can
 * both ask for the end, and a frame that was in flight may still arrive.
 */
export class OfficialMirror {
  /** The reference the shipped pane binds this Session with. */
  readonly reference: SessionReferenceLike
  /** The adopt handle, on the one route that has verbs to hand it. */
  private readonly handle: AdoptedSessionHandle | undefined
  /** The window this console drives directly, on the routes without a handle. */
  private readonly source: SessionEventSourceLike | undefined
  /** The Session face, when the binding exposes one that reports running. */
  private readonly face: { handleRunning?(running: boolean): void } | undefined
  /** The live attempt whose text is on screen, by the plugin's turn|step key. */
  private liveAttempt: string | undefined
  /** Whole text already shown per attempt, for the delta the window expects. */
  private readonly liveText = new Map<string, string>()
  /** Dense transient position, so a live row sorts above the durable window. */
  private transient = 0
  /** Highest durable sequence seen, the base of a transient row's position. */
  private lastSeq = -1
  private released = false

  /**
   * Take one remote Session up through whichever route this build offers.
   * @param service - the client Sessions service.
   * @param route - how this build lets a foreign Session be drawn.
   * @param parentId - a catalogued identity to address, for the `address` route.
   * @param open - the remote Session's own address.
   * @param summary - row facts for the renderer's pre-event chrome.
   * @param transport - the plugin's transport, for the composer's own verb.
   */
  constructor(
    service: AdoptCapableSessions,
    route: OfficialRoute,
    parentId: string | undefined,
    open: OpenSession,
    summary: SessionSummaryLike,
    transport: OfficialTransport,
  ) {
    const sessionId = officialSessionId(open)
    if (route === 'adopt') {
      const handle = service.adopt!({
        sessionId,
        summary,
        // The shipped composer submits through the same takeover route the
        // console's own composer uses, so a prompt typed in either place reaches
        // the origin machine by one road. `mode` and the request id are not part
        // of that route: the origin admits the text, and the sync protocol has no
        // cancel verb for a submission that was withdrawn.
        verbs: {
          prompt: async (content, _mode, signal): Promise<RemoteResultLike<{ accepted: true }>> => {
            if (signal?.aborted === true) return refused('gateway/cancelled', 'the submission was cancelled')
            // The takeover path carries text. A prompt with anything else in it
            // fails loudly rather than dropping the parts it cannot send.
            if (content.some(part => part.type !== 'text')) {
              return refused('gateway/bad-request', 'the sync takeover path carries text prompts only')
            }
            const text = content.map(part => part.text ?? '').join('\n')
            if (text.trim() === '') return refused('gateway/bad-request', 'the prompt was empty')
            if (!await transport.sendPrompt(text)) {
              return refused('gateway/internal', 'the sync server refused the prompt')
            }
            return { ok: true, value: { accepted: true } }
          },
        },
        running: summary.running,
      })
      this.handle = handle
      try {
        this.reference = service.retain(sessionId, { source: OFFICIAL_SOURCE })
      } catch (error) {
        // An adopted Session with no reference to bind renders nowhere, so the
        // adoption is undone rather than leaked.
        handle.release()
        throw error
      }
      // The window is still reached directly for the one thing the handle does
      // not carry: putting an older page below what is already drawn.
      this.source = service.binding?.(sessionId)?.eventSource
      return
    }

    this.handle = undefined
    // `scope` retains without asking anyone anything. `address` is the fallback
    // for a build without it: an address is resolved without the "unknown
    // Session" refusal an id meets, at the cost of one Host history read that
    // cannot succeed — the Host has never heard of this Session.
    this.reference = route === 'scope'
      ? service.retainAgentScope!(sessionId)
      : service.retain(
        { parentSessionId: parentId ?? '', childSessionId: sessionId },
        { source: OFFICIAL_SOURCE },
      )
    // Observed rather than awaited: the pane draws from the window this console
    // fills, and a refused read must not surface as an unhandled rejection.
    void this.reference.ready?.catch(() => {})
    const binding = service.binding?.(sessionId)
    this.source = binding?.eventSource
    this.face = binding?.session
  }

  /**
   * Replace the whole mirrored window, which is what opening a Session does.
   * @param transcript - the opening window, in log order.
   */
  replace(transcript: MirrorTranscript): void {
    if (this.released) return
    this.liveAttempt = undefined
    this.liveText.clear()
    // Announcements are dropped from the window but still counted: the newest
    // sequence is what a live row's position is measured against.
    const events = transcript.events.filter(event => !isPanelOnly(event))
    if (this.handle !== undefined) {
      // A mirrored window is everything the server holds: it never reports older
      // history as reachable, so `hasMore` is false. Claiming otherwise would
      // make the shipped renderer offer a page that cannot arrive.
      this.handle.replace(events, false)
      this.handle.setRunning(transcript.running)
      return
    }
    this.transient = 0
    this.lastSeq = -1
    for (const event of transcript.events) this.observe(event.seq)
    this.source?.replace(events.map(entryOf), false)
    this.face?.handleRunning?.(transcript.running)
  }

  /**
   * Feed one `events` frame's durable envelopes, in order.
   *
   * A settlement goes through `settle` rather than `append`: it is the durable
   * end of a live attempt, and the plugin's own rule — a settlement clears the
   * step's streaming text — is exactly that act.
   * @param events - the frame's envelopes.
   */
  appendEvents(events: readonly MirrorEvent[]): void {
    if (this.released) return
    for (const event of events) {
      if (isPanelOnly(event)) {
        this.observe(event.seq)
        continue
      }
      if (isSettlement(event)) {
        this.settle(event)
        continue
      }
      if (this.handle !== undefined) {
        this.handle.append(event)
        continue
      }
      this.observe(event.seq)
      this.source?.append(entryOf(event))
    }
  }

  /**
   * Put one older page below the window.
   *
   * This is the only way the older end is reachable in the shipped pane: the
   * shipped control asks the Host, which has never heard of this Session, so the
   * window it is given never claims more (`hasMore` stays false) and the console
   * pages through its own channel instead. What arrives goes *before* the window
   * rather than replacing it, so the reader keeps their place.
   * @param page - the older page, whose events sit below everything held.
   */
  prependOlder(page: MirrorTranscript): void {
    if (this.released) return
    const events = page.events.filter(event => !isPanelOnly(event))
    if (events.length === 0) return
    this.source?.prepend(events.map(entryOf), page.hasMore)
  }

  /**
   * Feed one live delta frame: the whole step text so far, replaced as it grows.
   * @param frame - the accepted frame, already ordered by the transport.
   */
  stream(frame: SyncLiveDelta): void {
    if (this.released) return
    const attemptId = attemptKey(frame.turn, frame.step)
    // An empty text is how the origin drops an abandoned attempt — the one
    // frame the plugin's own live row allows to regress. There is nothing to
    // show, so the attempt is abandoned rather than streamed as blank.
    if (frame.text === '') {
      if (this.liveAttempt !== attemptId) return
      this.closeLive({ attemptId })
      return
    }
    this.liveAttempt = attemptId
    // No `time`: the origin wrote the durable events, and a browser clock only
    // misplaces the live row against them.
    if (this.handle !== undefined) {
      this.handle.live({
        attemptId,
        turn: frame.turn,
        step: frame.step,
        kind: frame.kind,
        text: frame.text,
      })
      return
    }
    this.feedLive(attemptId, frame)
  }

  /**
   * Report the origin's running flag, which the mirror tracks apart from events.
   * @param running - whether the origin reports a turn in flight.
   */
  setRunning(running: boolean): void {
    if (this.released) return
    if (this.handle !== undefined) this.handle.setRunning(running)
    else this.face?.handleRunning?.(running)
  }

  /**
   * Release the Session and its reference.
   *
   * Idempotent, and total: a Session switch and the panel closing can both ask,
   * and the live attempt is abandoned first so the renderer is not left holding
   * text for an attempt that will never settle.
   */
  release(): void {
    if (this.released) return
    this.released = true
    const live = this.liveAttempt
    this.liveAttempt = undefined
    this.liveText.clear()
    if (live !== undefined) {
      try {
        this.closeLive({ attemptId: live })
      } catch {
        // The handle is being dropped anyway: a refused abandon is not a reason
        // to hold the reference open.
      }
    }
    // Both ends go regardless: a refusal from one is not a reason to leak the
    // other, and cleanup that throws would detach the whole mirror.
    try {
      this.handle?.release()
    } catch {
      // Dropped with the rest.
    }
    try {
      this.reference.release()
    } catch {
      // Dropped with the rest.
    }
  }

  /**
   * Append the delta between what is shown and what the origin just sent.
   *
   * The wire form of live Assistant text is a dense run of chunks, and the
   * relay carries the whole text so far instead — so the delta is computed here,
   * and a text that is not an extension of the last one restarts the attempt
   * rather than inventing a chunk the fold would rebaseline on.
   */
  private feedLive(attemptId: string, frame: SyncLiveDelta): void {
    let shown = this.liveText.get(attemptId) ?? ''
    if (!frame.text.startsWith(shown)) {
      this.closeLive({ attemptId })
      shown = ''
    }
    const delta = frame.text.slice(shown.length)
    this.liveText.set(attemptId, frame.text)
    if (delta === '') return
    const time = Date.now()
    this.transient += 1
    this.source?.append({
      type: 'transient',
      event: {
        type: 'assistant/live-chunk',
        // A position above the durable window, dense within its own run: the
        // same shape the client's own fold gives a transient row.
        seq: this.lastSeq + 1 - 1 / (this.transient + 1),
        time,
        data: {
          attemptId,
          turn: frame.turn,
          step: frame.step,
          chunk: {
            type: frame.kind === 'reasoning' ? 'reasoning-chunks' : 'text-chunks',
            time0: time,
            index: 0,
            dt: [0],
            texts: [delta],
          },
        },
      },
    })
  }

  /** Close one live attempt with its durable settlement, or with nothing. */
  private closeLive(o: { attemptId: string; event?: MirrorEvent }): void {
    this.liveText.delete(o.attemptId)
    if (this.handle !== undefined) {
      if (o.event === undefined) this.handle.abandon({ attemptId: o.attemptId })
      else this.handle.settle({ attemptId: o.attemptId, event: o.event })
    } else if (o.event === undefined) {
      this.source?.settleAssistant(o.attemptId)
    } else {
      // `settleAssistant` retires the attempt's transient rows and inserts the
      // durable settlement in one publication, so the entry is not appended too.
      this.observe(o.event.seq)
      this.source?.settleAssistant(o.attemptId, entryOf(o.event))
    }
    if (this.liveAttempt === o.attemptId) this.liveAttempt = undefined
  }

  /** Settle the attempt one durable event ends. */
  private settle(event: MirrorEvent): void {
    // The event's own coordinates are authoritative — a step may settle with no
    // relayed frame at all — and the live attempt is the fallback for an
    // envelope that names no step.
    const attemptId = settlementAttemptId(event) ?? this.liveAttempt ?? `settled:${String(event.seq)}`
    this.closeLive({ attemptId, event })
  }

  private observe(seq: number): void {
    if (seq > this.lastSeq) this.lastSeq = seq
  }
}

/** Wrap one wire envelope as the entry an event window carries. */
function entryOf(event: MirrorEvent): unknown {
  return { type: 'event', event }
}

/**
 * The bridge between the console's transport and the shipped renderer.
 *
 * It implements the transport observer: the console tells it what the mirror
 * reported, and it keeps one adopted Session for whichever remote Session is
 * open. The panel binds `referenceFor(...)` around the shipped content, which is
 * how the pane's Session identity reaches the renderer.
 */
export class OfficialSessions implements OfficialBridgeFace, SyncTransportObserver {
  private current: { key: string; mirror: OfficialMirror; id: string } | undefined
  /** The running flag already reported, so a poll does not restate it. */
  private lastRunning: boolean | undefined
  /** The Session whose composer this console blocked, if it blocked one. */
  private blockedComposer: string | undefined

  /**
   * @param ctx - the client context, read for the Sessions service and the
   *   composer-block registry.
   * @param transport - the plugin's transport client.
   * @param composerBlockReason - the localized reason shown in a blocked
   *   composer; read at the moment of blocking so it follows the locale.
   */
  constructor(
    private readonly ctx: OfficialContext,
    private readonly transport: OfficialTransport,
    private readonly composerBlockReason: () => string,
  ) {}

  /** Whether this build can render a Session through the shipped conversation. */
  get supported(): boolean {
    return this.routeOf() !== undefined
  }

  /** The route this build offers, for the panel to name. */
  get route(): OfficialRoute | undefined {
    return this.routeOf()
  }

  /**
   * Whether the console must draw the composer itself.
   *
   * Every route but `adopt` drives the window directly, so the shipped composer
   * would carry its prompt to a Host that has never heard of this Session.
   */
  get composerOwned(): boolean {
    const route = this.routeOf()
    return route !== undefined && route !== 'adopt'
  }

  /**
   * The reference to bind for one remote Session, for the panel's render.
   * @param machineName - owning machine.
   * @param sessionId - the remote Session's own id.
   * @returns the retained reference while exactly that Session is drawn.
   */
  referenceFor(machineName: string, sessionId: string): SessionReferenceLike | undefined {
    const current = this.current
    if (current === undefined) return undefined
    return current.key === remoteKey(machineName, sessionId) ? current.mirror.reference : undefined
  }

  /**
   * The panel opened a Session: take it up, replacing whatever was before.
   * @param open - the remote Session.
   */
  opened(open: OpenSession): void {
    const service = this.service()
    const route = this.routeOf()
    if (service === undefined || route === undefined) return
    const key = remoteKey(open.machineName, open.sessionId)
    // Re-opening the same Session is not a switch: the handle survives and the
    // opening transcript replaces its window.
    if (this.current?.key === key) return
    this.release()
    const id = officialSessionId(open)
    // A route that drives the window itself cannot take a prompt, so the shipped
    // composer is blocked with the console's own reason and the console's
    // takeover composer stands in its place.
    if (route !== 'adopt') this.blockComposer(id)
    // Rendering is the enhancement, so a failure here is left to the transport:
    // it detaches the observer and says why, and the console keeps its own pane
    // rather than rendering under a Session it could not take up.
    this.current = {
      key,
      id,
      mirror: new OfficialMirror(service, route, this.parentId(service), open, this.summaryOf(open), this.transport),
    }
  }

  /**
   * The opening window arrived.
   * @param open - the remote Session it belongs to.
   * @param transcript - the window.
   */
  loaded(open: OpenSession, transcript: MirrorTranscript): void {
    if (this.matches(open)) this.current?.mirror.replace(transcript)
  }

  /**
   * The panel paged up: one older page arrived for the open Session.
   * @param open - the remote Session it belongs to.
   * @param page - the page.
   */
  older(open: OpenSession, page: MirrorTranscript): void {
    if (this.matches(open)) this.current?.mirror.prependOlder(page)
  }

  /**
   * One `events` frame arrived.
   * @param open - the remote Session it belongs to.
   * @param frame - the frame.
   */
  appended(open: OpenSession, frame: SyncEventsFrame): void {
    if (this.matches(open)) this.current?.mirror.appendEvents(frame.events)
  }

  /**
   * One accepted live delta frame arrived.
   * @param open - the remote Session it belongs to.
   * @param frame - the frame.
   */
  streamed(open: OpenSession, frame: SyncLiveDelta): void {
    if (this.matches(open)) this.current?.mirror.stream(frame)
  }

  /**
   * The mirror moved the open Session's running flag.
   * @param open - the remote Session it belongs to.
   * @param running - the new reading.
   */
  running(open: OpenSession, running: boolean): void {
    if (!this.matches(open)) return
    if (running === this.lastRunning) return
    this.lastRunning = running
    this.current?.mirror.setRunning(running)
  }

  /** The panel left its Session. */
  closed(): void {
    this.release()
  }

  /** Release the Session the console was drawing, if any. Idempotent. */
  release(): void {
    const current = this.current
    this.current = undefined
    this.lastRunning = undefined
    current?.mirror.release()
    // The block belongs to the Session being drawn: leaving it behind would make
    // a Session the console no longer holds refuse its own composer.
    if (current !== undefined) this.unblockComposer(current.id)
  }

  /** Block one Session's shipped composer, remembering which one. */
  private blockComposer(id: string): void {
    this.unblockComposer(this.blockedComposer)
    const blocks = this.composerBlocks()
    if (blocks === undefined) return
    try {
      blocks.set(id, { reason: this.composerBlockReason() })
      this.blockedComposer = id
    } catch {
      // A registry that refuses the block is not a reason to lose the pane: the
      // console's own composer is drawn beside it, and the pane hides the
      // shipped one regardless.
    }
  }

  /** Clear one Session's block, when this console raised it. */
  private unblockComposer(id: string | undefined): void {
    if (id === undefined) return
    if (this.blockedComposer === id) this.blockedComposer = undefined
    const blocks = this.composerBlocks()
    if (blocks === undefined) return
    try {
      blocks.set(id, undefined)
    } catch {
      // Dropped with the Session.
    }
  }

  /**
   * The composer-block registry, feature-detected on the client context.
   *
   * `ctx.conversation.blocks` is the shipped plugin-facing registry for making
   * one Session's composer inert. It is raised here so the shipped composer
   * carries the console's own reason while the pane is held — but it is only an
   * affordance, and another plugin that publishes its own state for the same
   * Session can clear it, so the pane hides the shipped composer outright on
   * these routes rather than trusting this write to survive.
   */
  private composerBlocks(): ComposerBlocksLike | undefined {
    const conversation = this.ctx.get?.('conversation')
    if (typeof conversation !== 'object' || conversation === null) return undefined
    const blocks = (conversation as { blocks?: unknown }).blocks
    if (typeof blocks !== 'object' || blocks === null) return undefined
    const candidate = blocks as Partial<ComposerBlocksLike>
    return typeof candidate.set === 'function' ? candidate as ComposerBlocksLike : undefined
  }

  /**
   * Which route this build offers, in preference order.
   *
   * `adopt` is the patched capability and the only route that can hand the pane
   * a prompt. `scope` retains without any catalog or history I/O, so the Session
   * is born cold rather than erroring. `address` is the last resort: it needs
   * only released surfaces, but the reference's own Host read cannot succeed,
   * and the pane shows that hint while the window this console fills still
   * draws.
   * @returns the route, or undefined when the build offers none.
   */
  private routeOf(): OfficialRoute | undefined {
    const service = this.service()
    if (service === undefined) return undefined
    if (typeof service.adopt === 'function') return 'adopt'
    if (typeof service.binding !== 'function') return undefined
    if (typeof service.retainAgentScope === 'function') return 'scope'
    return this.parentId(service) === undefined ? undefined : 'address'
  }

  /** One catalogued identity to address, for the `address` route. */
  private parentId(service: AdoptCapableSessions): string | undefined {
    const ids = service.list?.getSnapshot().ids
    const first = Array.isArray(ids) ? ids[0] : undefined
    return typeof first === 'string' && first !== '' ? first : undefined
  }

  /**
   * The Sessions service, feature-detected on the client context.
   *
   * `sessions` is deliberately absent from this plugin's `inject` list: the
   * console has to load on builds that predate any of these routes, and a
   * required service the half cannot use would stop the whole half from
   * applying. The lookup is lazy because the service may be registered after
   * this plugin applies, and cheap because it runs once per panel render.
   */
  private service(): AdoptCapableSessions | undefined {
    const service = this.ctx.get?.('sessions')
    if (typeof service !== 'object' || service === null) return undefined
    const candidate = service as Partial<AdoptCapableSessions>
    return typeof candidate.retain === 'function'
      ? candidate as AdoptCapableSessions
      : undefined
  }

  /** Whether the Session being drawn is the one a frame names. */
  private matches(open: OpenSession): boolean {
    return this.current?.key === remoteKey(open.machineName, open.sessionId)
  }

  /**
   * The summary the shipped renderer shows before it has read an event.
   *
   * The mirror's own row when the Session is still published, and the id as a
   * placeholder title when it is not — the console's list shows the same
   * placeholder for a Session that was un-published while it was open.
   */
  private summaryOf(open: OpenSession): SessionSummaryLike {
    const row = this.rowOf(open)
    const title = row?.title ?? open.sessionId
    return {
      id: officialSessionId(open),
      sessionId: open.sessionId,
      title,
      displayTitle: title,
      ...(row?.cwd === undefined ? {} : { cwd: row.cwd }),
      updatedAt: row?.updatedAt ?? Date.now(),
      running: row?.running ?? false,
      // A row the mirror holds no events for is a Session with nothing to draw
      // yet: the shipped content shows its blank phase for exactly that.
      blank: row !== undefined && row.eventCount === 0,
      // Replaced by the service with its own live ownership table.
      retainedBy: {},
    }
  }

  /** The mirror's row for one remote Session, while it is published. */
  private rowOf(open: OpenSession): MirroredSession | undefined {
    return this.transport.snapshot.getSnapshot().state.machines
      .find(machine => machine.machineName === open.machineName)
      ?.sessions.find(session => session.sessionId === open.sessionId)
  }
}

/** Props the renderer binds for {@link OFFICIAL_SLOT}. */
export interface OfficialConversationProps {
  /** The Factory dispatcher handed to every renderer-created component. */
  renderFactorySlot: RenderFactorySlotLike
}

/**
 * The shipped Conversation's chat View, selected at this occurrence.
 *
 * The Factory's own default local Component renders `conversation.session` with
 * no View request; the sidebar chat pins `chat`, so a Session whose roster would
 * open elsewhere still lands on its conversation.
 */
function ChatView(props: { renderSlot: RenderSlotLike }): React.ReactElement {
  return <>{props.renderSlot('conversation.session', { view: 'chat' })}</>
}

/**
 * The shipped Conversation content, drawn for the console's open Session.
 *
 * `embedded` is the variant the sidebar chat uses for a Session that sits
 * beside the shell's own; the console's pane is exactly that. The phase is
 * `active`: what the mirror holds is a conversation, while the hero belongs to
 * a local new Session, which a remote one never is.
 *
 * The content shell is drawn whole, composer included, even on the routes whose
 * composer is then hidden: rendering `conversation.session` directly was tried
 * and draws an empty pane, because the shell is what supplies the context that
 * View is written against. So this pane hides the furniture instead of omitting
 * it, and accepts that a session-scoped integration behind it may still start a
 * Host read that cannot succeed (see the README's limitations).
 * @param props - the renderer's Factory dispatcher.
 * @returns the shipped content occurrence.
 */
export function OfficialConversation({ renderFactorySlot }: OfficialConversationProps): React.ReactElement {
  return (
    <>
      {renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, {
        slots: { views: ChatView },
      })}
    </>
  )
}
