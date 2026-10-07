/**
 * The plugin's mirror, projected onto the shipped DSH conversation renderer.
 *
 * The console hand-draws a remote Session's conversation because a browser
 * plugin cannot import another plugin's components. A build that offers
 * `ctx.sessions.retainAgentScope` removes that limit: the plugin retains the
 * remote Session under a synthetic local identity, drives the window that
 * retention hands it with the mirror's own envelopes, and lets the shipped
 * `conversation.content` factory draw it — so the pane is the product's real
 * conversation rather than a copy of it.
 *
 * Everything in this module is feature-detected and structurally typed. That
 * seam is not in every build this plugin has to keep working on, so nothing here
 * may assume it exists: {@link OfficialSessions.supported} is false without it,
 * and the console then keeps its own pane untouched.
 */
import * as React from 'react'
import type { MirrorEvent, MirrorTranscript } from '../shared/protocol.ts'
import {
  isSettlement,
  type OpenSession,
  type SyncEventsFrame,
  type SyncLiveDelta,
  type SyncTransportObserver,
} from './api.ts'
import { envelopePlacement, highestOf } from './envelope-placement.ts'
import { nextWatermark } from './footer-projections.ts'
import { LiveText, liveChunkOf } from './live-text.ts'
import { scopeCapable } from './routing.ts'

/**
 * The child slot the console's `main` entry declares for the shipped
 * Conversation.
 *
 * A non-root child is what hands the panel its `SessionProvider` and
 * `renderSlot` seats, and `session` is the scope the shipped content needs: the
 * occurrence is bound to the retained Session the panel holds. This is the
 * shape ui-subagent's `SidebarChatTab` uses for its own embedded chat.
 */
export const OFFICIAL_SLOT = 'session-sync.conversation'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Session-scoped occurrence of the shipped Conversation, hosted by the console's panel. */
    'session-sync.conversation': { kind: 'single'; scope: 'session' }
  }
}

/**
 * Synthetic local identity of one retained remote Session.
 *
 * Local identities are minted as `session-<uuid>`; this prefix cannot come out
 * of that generator, so a retained Session can never collide with a local one —
 * the one rule the retention seam states about the id it is given.
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
  /** The Session face: the running flag, and the projection store when there is one. */
  readonly session?: {
    handleRunning?(running: boolean): void
    /**
     * The Session's projection store, when this build hands one out.
     *
     * The shipped renderer reads every session projection through exactly this
     * object — `ui-session` binds `useProjection(key)` to
     * `session.projections.faceOf(key)` — which is why the console can give the
     * shipped footer real values for a Session no Host has ever computed one for.
     * Typed structurally and feature-detected: a build whose Session face does not
     * carry it simply gets the shipped fold over the window instead.
     */
    readonly projections?: ProjectionsSinkLike
  }
  readonly eventSource?: SessionEventSourceLike
}

/**
 * The one projection-store verb this console calls.
 *
 * The store is a push model whose only documented writer is the Host, so this is
 * a seam rather than a public API: it is read structurally off the Session face,
 * checked for shape where it is used, and its absence costs a reading rather than
 * a render. `footer-projections.ts` says why the console publishes at all.
 */
export interface ProjectionsSinkLike {
  /**
   * Land one finished value for a projection key.
   * @param key - the projection key.
   * @param value - the whole value; `undefined` means "no such reading".
   * @param seq - the watermark it is consistent with. A lower-or-equal seq loses
   *   to a value already held, so a publisher only ever moves forward.
   */
  apply(key: string, value: unknown, seq: number): void
}

/**
 * How this build lets the console draw a Session it does not own.
 *
 * One route, because one is what a released DSH offers. `scope` retains without
 * any catalog or history I/O, so a Session the Host has never heard of is born
 * cold instead of erroring, and the window that retention hands out is driven by
 * this console. It is read-only by construction: the shipped composer would send
 * its prompt to a Host that does not know the Session, so the pane hides it and
 * the console's takeover composer stands in.
 *
 * Two other routes were built and are gone. `adopt` (`ctx.sessions.adopt`) exists
 * in no released DSH — it was a client-only addition, carried in `patches/` for
 * `dsh-v0.1.7-alpha.2`, and its one advantage was a shipped composer whose prompt
 * the plugin could answer; that patch died with the next `dsh` install and no
 * longer has a build to apply to. `address` (`retain` with a catalogued parent
 * identity) needed only released surfaces, but the reference's own Host history
 * read could not succeed, so its only visible effect was a failure line the pane
 * then had to hide.
 */
export type OfficialRoute = 'scope'

/** The subset of the client Sessions service this half needs. */
export interface ScopeCapableSessions {
  /**
   * Retain without catalog or history I/O: the seam that makes a Session the
   * Host has never heard of renderable.
   * @param id - the synthetic identity.
   * @returns the reference the renderer binds.
   */
  retainAgentScope(id: string): SessionReferenceLike
  /**
   * The live binding for one identity, when the service holds one.
   *
   * This is where the pane's window comes from: `eventSource` is what the console
   * fills and what the shipped renderer folds.
   * @param id - the synthetic identity.
   * @returns the binding, whose event source the console can drive.
   */
  binding(id: string): SessionBindingLike | undefined
}

/** The composer-block registry: `ctx.conversation.blocks` in the shipped client. */
export interface ComposerBlocksLike {
  set(sessionId: string, block: { reason: string } | undefined): void
}

/** The one context capability this module uses: the client service lookup. */
export interface OfficialContext {
  get?(name: string): unknown
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
   * Operator-visible on purpose: the pane's abilities follow from the route, and
   * which one a build takes is not something to discover by reading a bundle.
   */
  readonly route: OfficialRoute | undefined
  /**
   * The sequence range the shipped window currently covers, when it is drawn.
   *
   * The low end is the one that moves when older history is paged in, so it is
   * also the only way to see from the outside that paging reached the pane.
   */
  windowRange(): { first: number; last: number } | undefined
  /**
   * Whether the console must draw the composer itself.
   *
   * True on the scope route, which drives the window directly: the shipped
   * composer would send its prompt through the Host, which has never heard of
   * this Session, so it is blocked and the console's takeover composer stands in.
   */
  readonly composerOwned: boolean
  /**
   * The reference to bind for one remote Session.
   * @param machineName - owning machine.
   * @param sessionId - the remote Session's own id.
   * @returns the reference while exactly that Session is drawn, else undefined.
   */
  referenceFor(machineName: string, sessionId: string): SessionReferenceLike | undefined
  /**
   * Whether the Session being drawn through the shipped renderer is this identity.
   *
   * The synthetic id of the retained Session, not the id of the remote one: it is
   * what a session-scoped occurrence in the shipped composer stack receives as its
   * own `sessionId`. False when nothing is retained, which is what keeps the
   * console's composer out of every other Session's composer stack.
   * @param sessionId - the identity an occurrence was mounted for.
   * @returns true while the mirror holds exactly that Session.
   */
  owns(sessionId: string): boolean
  /**
   * Publish the footer's numbers into the retained Session's projection store.
   *
   * A no-op unless the shipped renderer is drawing a Session and its face hands
   * out a projection sink — a build that offers neither keeps the console's own
   * footer, which reads these totals directly.
   * @param values - whole projection values by key; a key mapped to `undefined`
   *   takes that reading down.
   * @param floor - the sequence this publication is consistent with. The counter
   *   the store compares against only ever moves forward, and it is seeded above
   *   this so a re-opened Session's fresh numbers are never refused as stale.
   */
  publishFooter(values: Readonly<Record<string, unknown>>, floor: number): void
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
 * The projection sink one Session face carries, when it carries a usable one.
 *
 * Checked rather than assumed: `projections` is read off another plugin's Session
 * object, so a build that renamed it, or that hands out a face with only the read
 * half, has to end as "no sink here" — the shipped footer then shows the fold over
 * the window, exactly as it does on a Session whose Host unit is not mounted.
 * @param session - the Session face of a retained binding, when there is one.
 * @returns the sink, or undefined when this face cannot take a value.
 */
function projectionsSink(
  session: { projections?: ProjectionsSinkLike } | undefined,
): ProjectionsSinkLike | undefined {
  const candidate = session?.projections
  return candidate !== undefined && typeof candidate.apply === 'function' ? candidate : undefined
}

/**
 * One retained remote Session, and the frames fed into it.
 *
 * One instance per opened remote Session. Every method is safe to call after
 * {@link OfficialMirror.release}: a Session switch and the panel closing can
 * both ask for the end, and a frame that was in flight may still arrive.
 */
export class OfficialMirror {
  /** The reference the shipped pane binds this Session with. */
  readonly reference: SessionReferenceLike
  /** The window this console drives directly, which is where the events go. */
  private readonly source: SessionEventSourceLike | undefined
  /** The Session face, when the binding exposes one that reports running. */
  private readonly face: { handleRunning?(running: boolean): void } | undefined
  /**
   * The Session's projection store, when this build hands one out.
   *
   * Where the console's footer numbers go so that the *shipped* statistics row and
   * context meter can render them: those components read the store, and a retained
   * Session has no Host behind it to fill it.
   */
  private readonly projections: ProjectionsSinkLike | undefined
  /** The live attempt whose text is on screen, by the plugin's turn|step key. */
  private liveAttempt: string | undefined
  /**
   * Whole text already shown, per attempt **and per kind**.
   *
   * One entry per attempt was wrong, and the symptom was subtle enough to be
   * reported as "the thinking only appears once it has finished": a step streams its
   * reasoning and *then* its answer through the same attempt id, so the first answer
   * delta is never an extension of the reasoning text — which took the restart path
   * in {@link OfficialSession.feedLive}, and the restart path retires the attempt's
   * transient rows. The thinking a reader was watching was therefore torn down at the
   * exact moment the answer began, leaving only the durable reasoning block that
   * arrives with the settlement. Nothing about an answer means the reasoning before
   * it stopped being live, so the two accumulate apart.
   */
  private readonly liveText = new LiveText()
  /** Dense transient position, so a live row sorts above the durable window. */
  private transient = 0
  /** Highest durable sequence seen, the base of a transient row's position. */
  private lastSeq = -1
  /**
   * Sequences the drawn window already carries.
   *
   * An older page reaches the mirror twice — once as the page this console read,
   * once as ordinary frames when the origin replays it — and the second arrival
   * must not be appended on top of the first. The shipped conversation's
   * assembler requires each node's matches in sequence order, so a redelivered
   * event, like an older one, would break the pane rather than merely duplicate.
   */
  private fed = new Set<number>()
  /**
   * The highest sequence this mirror has handed the shipped assembler.
   *
   * Not the same as the window's newest entry: the window is a view, and a page
   * this console prepends can move its oldest end down while the assembler has
   * already taken matches from further up. Monotonicity has to be measured
   * against what the assembler saw, or the window's own shape lies about it.
   */
  private highestFed: number | undefined
  private released = false

  /**
   * Take one remote Session up through the route this build offers.
   * @param service - the client Sessions service.
   * @param open - the remote Session's own address.
   */
  constructor(
    service: ScopeCapableSessions,
    open: OpenSession,
  ) {
    const sessionId = officialSessionId(open)
    this.reference = service.retainAgentScope(sessionId)
    // Observed rather than awaited: the pane draws from the window this console
    // fills, and a refused read must not surface as an unhandled rejection.
    void this.reference.ready?.catch(() => {})
    const binding = service.binding(sessionId)
    this.source = binding?.eventSource
    this.face = binding?.session
    this.projections = projectionsSink(binding?.session)
  }

  /**
   * Land one finished projection value on the Session's store.
   *
   * Safety is in the ordering and the gate, not in the store: a released mirror
   * writes nothing, and a build whose face carries no sink writes nothing. An
   * `undefined` value is a real write — it is how a reading the log no longer
   * states is taken down rather than left on screen.
   * @param key - the projection key.
   * @param value - the whole value.
   * @param seq - the watermark, already above everything published before.
   */
  applyProjection(key: string, value: unknown, seq: number): void {
    if (this.released) return
    this.projections?.apply(key, value, seq)
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
    this.fed = new Set(events.map(event => event.seq))
    // The window this call installs is what the assembler has taken so far.
    this.highestFed = events.reduce<number | undefined>(
      (highest, event) => (highest === undefined || event.seq > highest ? event.seq : highest),
      undefined,
    )
    // A mirrored window is everything the server holds: it never reports older
    // history as reachable, so `hasMore` is false. Claiming otherwise would make
    // the shipped renderer offer a page that cannot arrive.
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
   *
   * Two of these envelopes are not news, and neither may be appended:
   *
   * - one the window already carries, because an older page reaches this console
   *   both as the page it read and as the origin's ordinary replay frames;
   * - one below the window, which is that replay: it is history, and the shipped
   *   conversation's assembler requires each node's matches in sequence order, so
   *   appending it breaks the pane instead of merely duplicating a row. The test
   *   for this is "not newer than everything the window holds" rather than "below
   *   its first sequence", because a page this console prepended moves that first
   *   sequence down and the replay then sits *inside* the range.
   *
   * @param events - the frame's envelopes.
   */
  appendEvents(events: readonly MirrorEvent[]): void {
    if (this.released) return
    const history: MirrorEvent[] = []
    for (const event of events) {
      if (isPanelOnly(event)) {
        this.observe(event.seq)
        continue
      }
      if (this.fed.has(event.seq)) continue
      // Where this belongs is decided by `envelopePlacement`, which exists as its
      // own module because getting it wrong is what broke "load older": see the
      // note there. Only `newer` may be appended — everything else is merged in
      // below, because the shipped assembler requires each Context's matches in
      // increasing sequence order, and a throw from it fails the whole feed.
      //
      // So anything not newer than the window goes through the merge path, which
      // takes entries in sequence order and replays what they touch. That covers
      // both an older page and an event inside a range a page just extended.
      //
      // The comparison is against the highest sequence ever *fed*, not against the
      // window's newest entry: a page this console prepends can leave the window's
      // newest entry untouched while the assembler has already taken that page's
      // neighbours, and appending then hands it a match below one it accepted —
      // measured as `conversation Context 25:trajectory-assistant-step7:31 received
      // an update before its start Match`, which fails the whole feed. The only
      // sound rule is monotonicity against what the assembler itself has seen.
      if (envelopePlacement(event.seq, this.highestFed, this.fed) === 'history') {
        history.push(event)
        continue
      }
      if (isSettlement(event)) {
        this.settle(event)
        continue
      }
      this.fed.add(event.seq)
      // `highestOf`, not `Math.max`: with no window yet the first argument is
      // undefined, `Math.max` answers NaN, and every later `seq > NaN` is false — so
      // live events would all be filed as history and the pane would stop appending.
      this.highestFed = highestOf(this.highestFed, event.seq)
      this.observe(event.seq)
      this.source?.append(entryOf(event))
    }
    // One batch per frame, in the order the frame carried it: a later frame
    // belongs to a page further down, and prepending it puts it before this one.
    if (history.length > 0) this.prependOlder({ events: history, hasMore: true })
  }

  /**
   * The sequence range the window this console drives covers.
   * @returns the range, or undefined while no window is drawn.
   */
  windowRange(): { first: number; last: number } | undefined {
    const entries = this.source?.getSnapshot().entries
    if (entries === undefined || entries.length === 0) return undefined
    const first = entries[0]?.event.seq
    const last = entries[entries.length - 1]?.event.seq
    if (first === undefined || last === undefined) return undefined
    return { first, last }
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
  prependOlder(page: { readonly events: readonly MirrorEvent[]; readonly hasMore: boolean }): void {
    if (this.released) return
    const entries = this.source?.getSnapshot().entries ?? []
    // A page may already be here by the other road: the origin replays its window
    // as ordinary frames, and a replay carries events the mirror now holds below
    // the window — which `appendEvents` puts through this same prepend. The
    // shipped conversation's assembler refuses a Match whose sequence is not
    // greater than the last one it took (`received non-appended Match`), and that
    // refusal is not local: it fails the whole event-feed subscriber, so the pane
    // stops updating until it is reopened. So membership is checked here too, not
    // only on the way in from a frame: an entry already in the window is skipped
    // rather than re-inserted.
    const held = new Set<number>()
    for (const entry of entries) held.add(entry.event.seq)
    const events = page.events.filter(event =>
      !held.has(event.seq) && !isPanelOnly(event) && !this.fed.has(event.seq))
    if (events.length === 0) return
    for (const event of events) {
      this.fed.add(event.seq)
      this.observe(event.seq)
    }
    // `hasMore` is the page's own claim about what lies below it. The console's
    // control reads the client store for that, not this flag, so claiming more
    // only keeps the shipped pane's (hidden) control from claiming the end.
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
    this.feedLive(attemptId, frame)
  }

  /**
   * Report the origin's running flag, which the mirror tracks apart from events.
   * @param running - whether the origin reports a turn in flight.
   */
  setRunning(running: boolean): void {
    if (this.released) return
    this.face?.handleRunning?.(running)
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
    // A refusal is not a reason to leak the reference, and cleanup that throws
    // would detach the whole mirror.
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
   * and a text that is not an extension of the last one restarts **that kind**
   * rather than inventing a chunk the fold would rebaseline on.
   *
   * The accumulator is per kind ({@link OfficialSession.liveText} explains why): a
   * step's reasoning and its answer are two separate streams through one attempt id,
   * so an answer that begins after a reasoning run is not a restart at all — and
   * treating it as one is what used to retire the thinking row mid-stream.
   */
  private feedLive(attemptId: string, frame: SyncLiveDelta): void {
    const step = this.liveText.take(attemptId, frame.kind, frame.text)
    if (step.restarted) this.closeLive({ attemptId })
    const delta = step.delta
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
          // The live vocabulary, not the durable one: see `liveChunkOf`. The durable
          // run shape (`text-chunks`/`reasoning-chunks`) is consumed by no shipped
          // renderer, so sending it made every synthesized live row invisible — which
          // is why thinking only ever arrived with its settlement.
          chunk: liveChunkOf(frame.kind, delta),
        },
      },
    })
  }

  /** Close one live attempt with its durable settlement, or with nothing. */
  private closeLive(o: { attemptId: string; event?: MirrorEvent }): void {
    // Every kind of this attempt: settling it means neither its reasoning nor its
    // answer is live any more.
    this.liveText.forget(o.attemptId)
    if (o.event === undefined) {
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
 * reported, and it keeps one retained Session for whichever remote Session is
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
   * The last watermark this bridge published a projection value at.
   *
   * One counter for the whole bridge rather than one per mirror, and monotonic for
   * the plugin's lifetime: a Session's projection store outlives the mirror that
   * was retained for it, so a counter that restarted would have its first
   * publication of a re-opened Session refused as stale — and the footer would keep
   * the previous reading while looking perfectly healthy.
   */
  private projectionSeq = 0

  /**
   * @param ctx - the client context, read for the Sessions service and the
   *   composer-block registry.
   * @param composerBlockReason - the localized reason shown in a blocked
   *   composer; read at the moment of blocking so it follows the locale.
   */
  constructor(
    private readonly ctx: OfficialContext,
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

  /** The sequence range the shipped window covers, for the panel to name. */
  windowRange(): { first: number; last: number } | undefined {
    return this.current?.mirror.windowRange()
  }

  /**
   * Whether the console must draw the composer itself.
   *
   * The scope route drives the window directly, so the shipped composer would
   * carry its prompt to a Host that has never heard of this Session.
   */
  get composerOwned(): boolean {
    return this.routeOf() !== undefined
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
   * Whether the retained Session is one identity.
   * @param sessionId - the identity an occurrence was mounted for.
   * @returns true while the mirror holds exactly that Session.
   */
  owns(sessionId: string): boolean {
    return this.current?.id === sessionId
  }

  /**
   * Publish the footer's numbers on the retained Session's projection store.
   * @param values - whole projection values by key.
   * @param floor - the sequence the publication is consistent with.
   */
  publishFooter(values: Readonly<Record<string, unknown>>, floor: number): void {
    const mirror = this.current?.mirror
    if (mirror === undefined) return
    for (const [key, value] of Object.entries(values)) {
      // Above the previous publication *and* above the sequence floor, in one step:
      // see `nextWatermark`, which owns that rule and the two ways of losing it.
      this.projectionSeq = nextWatermark(this.projectionSeq, floor)
      mirror.applyProjection(key, value, this.projectionSeq)
    }
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
    // The pane drives the window itself and cannot take a prompt, so the shipped
    // composer is blocked with the console's own reason and the console's
    // takeover composer stands in its place.
    this.blockComposer(id)
    // Rendering is the enhancement, so a failure here is left to the transport:
    // it detaches the observer and says why, and the console keeps its own pane
    // rather than rendering under a Session it could not take up.
    this.current = { key, id, mirror: new OfficialMirror(service, open) }
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
   * this route rather than trusting this write to survive.
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
   * The route this build offers.
   *
   * One route is all a released DSH has, and {@link service} has already checked
   * both of its halves, so this is a naming step rather than a search.
   * @returns the route, or undefined when the build offers none.
   */
  private routeOf(): OfficialRoute | undefined {
    return this.service() === undefined ? undefined : 'scope'
  }

  /**
   * The Sessions service, feature-detected on the client context.
   *
   * `sessions` is deliberately absent from this plugin's `inject` list: the
   * console has to load on builds that predate the retention seam, and a
   * required service the half cannot use would stop the whole half from
   * applying. The lookup is lazy because the service may be registered after
   * this plugin applies, and cheap because it runs once per panel render.
   */
  private service(): ScopeCapableSessions | undefined {
    const service = this.ctx.get?.('sessions')
    return scopeCapable(service) ? service as ScopeCapableSessions : undefined
  }

  /** Whether the Session being drawn is the one a frame names. */
  private matches(open: OpenSession): boolean {
    return this.current?.key === remoteKey(open.machineName, open.sessionId)
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
 * The content shell is drawn whole, composer included, even though that
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
