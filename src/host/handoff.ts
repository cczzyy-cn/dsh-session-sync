/**
 * The two-sided handoff: one interactive request, two humans who may answer it,
 * one winner.
 *
 * A Session's interactive requests have two legitimate answerers — whoever is
 * sitting at the machine that owns the Session, and whoever is watching that
 * Session in the sync console. The upstream seam is a waterfall: the first
 * answerer to return a result claims the request, and `next()` delegates to the
 * answerers behind it. Racing them is therefore a matter of asking the local side
 * through `next()` while asking the console down the sync link, and letting
 * whichever settles first be the result.
 *
 * This module is that race, with no idea what is being raced. `interactions.ts`
 * and `approvals.ts` are the two domains that use it — a question, whose answer is
 * information, and an approval, whose outcome is permission. The rules are the same
 * for both, and they are the reason this lives in one place rather than twice:
 *
 *  - **Exactly one winner.** A console's answer is claimed by id and only while the
 *    request is still pending, so one that arrives after the machine's own human
 *    replied is refused *with a reason* rather than silently overwriting a decision
 *    that was already made. A re-delivered command is the same decision and
 *    succeeds; a different one for a claimed request does not.
 *  - **A refusal is not a failure.** In a race somebody always loses, and the
 *    ordinary loser is the console. The counters tell "the machine decided first"
 *    from "the console decided first" from "the ask was aborted", because from both
 *    ends those are otherwise indistinguishable — which is what made a real
 *    deployment bug (a dropped command) invisible for three attempts.
 *  - **No dangling rejections.** The losing side of a race is never awaited, so
 *    every promise put into it stays observed; a rejected loser escaping as an
 *    unhandled rejection would take the process down over a request nobody is
 *    waiting for any more.
 *
 * It is deliberately free of Cordis, HTTP, and the link: the wiring lives in the
 * engine and the transport, and everything decided here is decided by a plain
 * function call a test can make.
 */

/** Where a relay reaches the console. Absent when this machine is a server itself. */
export interface HandoffSink<Offer, Close extends string> {
  /** Offer one request to the server's console. */
  open(sessionId: string, id: string, offer: Offer, expiresAt: number): void
  /**
   * Withdraw one request this machine no longer needs decided elsewhere.
   *
   * Never sent for the console's own decision: the server closes that card the
   * moment it accepts it, and telling it again would be telling the server what it
   * just did.
   */
  close(sessionId: string, id: string, outcome: Close): void
  /** The clock, injectable so a test can age a request without waiting. */
  now(): number
}

/** What this machine's relayed requests did, for the state view. */
export interface HandoffCounts {
  /** Requests relayed to the console since startup. */
  offered: number
  /** Requests currently waiting on either side. */
  open: number
  /** Decided by the local side before the console did. */
  decidedLocally: number
  /** Decided by the console, and claimed by this machine. */
  decidedRemotely: number
  /** Decisions that arrived too late to claim, the local one already taken. */
  lateAnswers: number
  /** Requests withdrawn because the asking turn was aborted. */
  aborted: number
}

/** Whether one console decision claimed the request, or why it did not. */
export type HandoffClaim = { ok: true } | { ok: false; reason: string }

/**
 * How one domain names its refusals.
 *
 * The reasons are read by a human at the console — they arrive as the failure text
 * on the command that carried the decision — so they have to speak that domain's
 * language: a question is *answered*, an approval is *decided*, and "this question
 * was already answered" says what happened where a generic "this request was
 * already settled" would not. The conditions are the core's; only the words are
 * the domain's.
 */
export interface HandoffWording {
  /** The decision arrived after the local side already took it. */
  readonly settled: string
  /** A different command tried to overwrite a decision already claimed here. */
  readonly claimed: string
  /** Nothing under that id is pending. */
  readonly unknown: string
  /** The decision arrived after this request's TTL. */
  readonly expired: string
}

/** One request this machine relayed and is still waiting on. */
interface Pending<Answer, Close extends string> {
  readonly sessionId: string
  readonly id: string
  readonly expiresAt: number
  /** Hand the console's decision to the waiting race. */
  readonly settle: (answer: Answer) => void
  /** Why this decision is not acceptable, or undefined when it is. */
  readonly validate: (answer: Answer) => string | undefined
  /**
   * The command that claimed this request, for the retry case.
   *
   * A duplicated command must acknowledge as success — the console is asking about
   * a decision it already made — while a *different* command must be refused.
   * Identity, not a boolean, is what tells those apart.
   */
  claimedBy?: string
}

/**
 * Requests already settled, kept only long enough to answer a late console.
 *
 * Bounded like the step-settlement marks in the engine: the ids exist to name a
 * refusal, so a few hundred remembered ones say everything a refusal can say.
 */
const SETTLED_LIMIT = 256

let sequence = 0

/** One identity per asking episode, unique within this process. */
export function mintHandoffId(): string {
  sequence += 1
  return `${Date.now().toString(36)}-${sequence.toString(36)}`
}

/** One race, for one domain's request and decision types. */
export class HandoffRelay<Offer, Answer, Close extends string> {
  private readonly pending = new Map<string, Pending<Answer, Close>>()
  private readonly settled: string[] = []
  private offered = 0
  private decidedLocally = 0
  private decidedRemotely = 0
  private lateAnswers = 0
  private aborted = 0

  /** @param sink - how this relay reaches the console. @param wording - how this domain names its refusals. */
  constructor(
    private readonly sink: HandoffSink<Offer, Close>,
    private readonly wording: HandoffWording,
  ) {}

  /**
   * Offer one request to the console and race it against the local answerer.
   *
   * The caller passes the delegated local answerer as `local`: calling it starts
   * the answerers behind this one — which is the shipped browser UI, reached
   * through the Remote waterfall bridge. Both sides are asked, and the first
   * result wins.
   * @param o.sessionId - the Session being asked in; absent means "not relayable".
   * @param o.offer - what the console is shown, or undefined when there is nothing to offer.
   * @param o.ttlMs - how long the console may decide this one.
   * @param o.local - the delegated local answerer.
   * @param o.remote - how to turn the console's decision into the local result.
   * @param o.validate - why a console decision is unacceptable, or undefined.
   * @param o.closeOnLocal - what to tell the console when the local side wins.
   * @param o.closeOnAbort - what to tell the console when the local side fails.
   * @returns the winning result.
   */
  async race<R>(o: {
    sessionId: string | undefined
    offer: Offer | undefined
    ttlMs: number
    local: () => Promise<R>
    remote: (answer: Answer) => R
    validate: (answer: Answer) => string | undefined
    closeOnLocal: (result: R) => Close
    closeOnAbort: Close
  }): Promise<R> {
    if (o.sessionId === undefined || o.offer === undefined) return o.local()
    const sessionId = o.sessionId
    const id = mintHandoffId()
    const deferred = Promise.withResolvers<Answer>()
    const expiresAt = this.sink.now() + o.ttlMs
    this.pending.set(id, {
      sessionId,
      id,
      expiresAt,
      settle: deferred.resolve,
      validate: o.validate,
    })
    this.offered += 1
    this.sink.open(sessionId, id, o.offer, expiresAt)

    // Both promises go into the race, which subscribes to each of them: a side
    // that loses and then rejects is therefore still *observed*, so the loser can
    // never surface as an unhandled rejection.
    const localResult = o.local()
    let outcome: { side: 'local'; result: R } | { side: 'remote'; answer: Answer }
    try {
      outcome = await Promise.race([
        localResult.then(result => ({ side: 'local' as const, result })),
        deferred.promise.then(answer => ({ side: 'remote' as const, answer })),
      ])
    } catch (error: unknown) {
      this.aborted += 1
      this.remember(id)
      this.sink.close(sessionId, id, o.closeOnAbort)
      throw error
    } finally {
      this.pending.delete(id)
    }
    this.remember(id)
    if (outcome.side === 'local') {
      // The machine's own human answered first, which is the ordinary outcome of a
      // race rather than a failure — say so, so the console can drop the card
      // instead of showing a request whose decision is already made.
      this.decidedLocally += 1
      this.sink.close(sessionId, id, o.closeOnLocal(outcome.result))
      return outcome.result
    }
    this.decidedRemotely += 1
    return o.remote(outcome.answer)
  }

  /**
   * Claim one pending request for the console's decision.
   *
   * The single decision point of the whole feature: this is where "the console
   * decided first" is either accepted or refused, and it is decided by whether
   * *this* request is still pending here — not by anything the server believes.
   * @param id - the request the console decided.
   * @param answer - the console's decision.
   * @param commandId - the command carrying it, so a retry is recognisable.
   * @returns whether the decision was claimed.
   */
  claim(id: string, answer: Answer, commandId: string): HandoffClaim {
    const pending = this.pending.get(id)
    if (pending === undefined) {
      if (this.settled.includes(id)) {
        this.lateAnswers += 1
        return { ok: false, reason: this.wording.settled }
      }
      return { ok: false, reason: this.wording.unknown }
    }
    if (pending.claimedBy !== undefined) {
      return pending.claimedBy === commandId
        ? { ok: true }
        : { ok: false, reason: this.wording.claimed }
    }
    if (this.sink.now() > pending.expiresAt) {
      return { ok: false, reason: this.wording.expired }
    }
    const invalid = pending.validate(answer)
    if (invalid !== undefined) return { ok: false, reason: invalid }
    pending.claimedBy = commandId
    pending.settle(answer)
    return { ok: true }
  }

  /** What this machine's relayed requests did. */
  counts(): HandoffCounts {
    return {
      offered: this.offered,
      open: this.pending.size,
      decidedLocally: this.decidedLocally,
      decidedRemotely: this.decidedRemotely,
      lateAnswers: this.lateAnswers,
      aborted: this.aborted,
    }
  }

  /**
   * Withdraw every request still pending, because this machine is going away.
   * @param outcome - what to tell the console; `aborted` for a shutdown.
   */
  withdrawAll(outcome: Close): void {
    for (const pending of [...this.pending.values()]) {
      this.pending.delete(pending.id)
      this.remember(pending.id)
      this.sink.close(pending.sessionId, pending.id, outcome)
    }
  }

  /** Remember one settled request id, oldest dropped first. */
  private remember(id: string): void {
    this.settled.push(id)
    if (this.settled.length > SETTLED_LIMIT) this.settled.splice(0, this.settled.length - SETTLED_LIMIT)
  }
}
