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

/** The subset of the client Sessions service this half needs. */
export interface AdoptCapableSessions {
  /** Adopt one Session under a synthetic identity. */
  adopt(source: AdoptSource): AdoptedSessionHandle
  /**
   * Retain an exact client generation.
   * @param target - the adopted identity.
   * @param options - consumer source and optional cancellation.
   * @returns the reference the renderer binds.
   */
  retain(target: string, options: { source: string; signal?: AbortSignal }): SessionReferenceLike
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
  /** False on any build without the adoption API, where the console keeps its own pane. */
  readonly supported: boolean
  /**
   * The reference to bind for one remote Session.
   * @param machineName - owning machine.
   * @param sessionId - the remote Session's own id.
   * @returns the reference while exactly that Session is adopted, else undefined.
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
  private readonly handle: AdoptedSessionHandle
  /** The live attempt whose text is on screen, by the plugin's turn|step key. */
  private liveAttempt: string | undefined
  private released = false

  /**
   * Adopt one remote Session and retain the reference that binds it.
   * @param service - the adopt-capable client Sessions service.
   * @param open - the remote Session's own address.
   * @param summary - row facts for the renderer's pre-event chrome.
   * @param transport - the plugin's transport, for the composer's own verb.
   */
  constructor(
    service: AdoptCapableSessions,
    open: OpenSession,
    summary: SessionSummaryLike,
    transport: OfficialTransport,
  ) {
    const sessionId = officialSessionId(open)
    this.handle = service.adopt({
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
    try {
      this.reference = service.retain(sessionId, { source: OFFICIAL_SOURCE })
    } catch (error) {
      // An adopted Session with no reference to bind renders nowhere, so the
      // adoption is undone rather than leaked.
      this.handle.release()
      throw error
    }
  }

  /**
   * Replace the whole mirrored window, which is what opening a Session does.
   * @param transcript - the opening window, in log order.
   */
  replace(transcript: MirrorTranscript): void {
    if (this.released) return
    // A mirrored window is everything the server holds: it never reports older
    // history as reachable, so `hasMore` is false. Remote history paging is not
    // implemented (the README's limitations), and claiming otherwise would make
    // the shipped renderer offer a page that cannot arrive.
    this.handle.replace(transcript.events, false)
    this.handle.setRunning(transcript.running)
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
      if (isSettlement(event)) {
        this.settle(event)
        continue
      }
      this.handle.append(event)
    }
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
    this.handle.live({
      attemptId,
      turn: frame.turn,
      step: frame.step,
      kind: frame.kind,
      text: frame.text,
    })
  }

  /**
   * Report the origin's running flag, which the mirror tracks apart from events.
   * @param running - whether the origin reports a turn in flight.
   */
  setRunning(running: boolean): void {
    if (this.released) return
    this.handle.setRunning(running)
  }

  /**
   * Release the adopted Session and its reference.
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
    if (live !== undefined) {
      try {
        this.handle.abandon({ attemptId: live })
      } catch {
        // The handle is being dropped anyway: a refused abandon is not a reason
        // to hold the reference open.
      }
    }
    // Both ends go regardless: a refusal from one is not a reason to leak the
    // other, and cleanup that throws would detach the whole mirror.
    try {
      this.handle.release()
    } catch {
      // Dropped with the rest.
    }
    try {
      this.reference.release()
    } catch {
      // Dropped with the rest.
    }
  }

  /** Close one live attempt with its durable settlement, or with nothing. */
  private closeLive(o: { attemptId: string; event?: MirrorEvent }): void {
    if (o.event === undefined) this.handle.abandon({ attemptId: o.attemptId })
    else this.handle.settle({ attemptId: o.attemptId, event: o.event })
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
  private current: { key: string; mirror: OfficialMirror } | undefined
  /** The running flag already reported, so a poll does not restate it. */
  private lastRunning: boolean | undefined

  /**
   * @param ctx - the client context, read only for the Sessions service.
   * @param transport - the plugin's transport client.
   */
  constructor(
    private readonly ctx: OfficialContext,
    private readonly transport: OfficialTransport,
  ) {}

  /** Whether this build can render a Session through the shipped conversation. */
  get supported(): boolean {
    return this.service() !== undefined
  }

  /**
   * The reference to bind for one remote Session, for the panel's render.
   * @param machineName - owning machine.
   * @param sessionId - the remote Session's own id.
   * @returns the retained reference while exactly that Session is adopted.
   */
  referenceFor(machineName: string, sessionId: string): SessionReferenceLike | undefined {
    const current = this.current
    if (current === undefined) return undefined
    return current.key === remoteKey(machineName, sessionId) ? current.mirror.reference : undefined
  }

  /**
   * The panel opened a Session: adopt it, replacing whatever was adopted before.
   * @param open - the remote Session.
   */
  opened(open: OpenSession): void {
    const service = this.service()
    if (service === undefined) return
    const key = remoteKey(open.machineName, open.sessionId)
    // Re-opening the same Session is not a switch: the handle survives and the
    // opening transcript replaces its window.
    if (this.current?.key === key) return
    this.release()
    // Adoption is the enhancement, so a failure here is left to the transport:
    // it detaches the observer and says why, and the console keeps its own
    // pane rather than rendering under a Session it could not adopt.
    this.current = { key, mirror: new OfficialMirror(service, open, this.summaryOf(open), this.transport) }
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

  /** Release the adopted Session, if any. Idempotent. */
  release(): void {
    const current = this.current
    this.current = undefined
    this.lastRunning = undefined
    current?.mirror.release()
  }

  /** Whether the adopted Session is the one a frame names. */
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

  /**
   * The adoption API, feature-detected on the client context.
   *
   * `sessions` is deliberately absent from this plugin's `inject` list: the
   * console has to load on builds that predate the adoption API, and a required
   * service the half cannot use would stop the whole half from applying. The
   * lookup is lazy because the service may be registered after this plugin
   * applies, and cheap because it runs once per panel render.
   */
  private service(): AdoptCapableSessions | undefined {
    const service = this.ctx.get?.('sessions')
    if (typeof service !== 'object' || service === null) return undefined
    const candidate = service as Partial<AdoptCapableSessions>
    return typeof candidate.adopt === 'function' && typeof candidate.retain === 'function'
      ? candidate as AdoptCapableSessions
      : undefined
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
