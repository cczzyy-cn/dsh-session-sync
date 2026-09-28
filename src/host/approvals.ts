/**
 * The two-sided race for one approval — the approval domain of
 * {@link HandoffRelay}.
 *
 * This is the same race as a question's, with a different stake. An answer to a
 * question is *information*; an outcome here is **permission**: `allowed-once`
 * releases a tool call that this machine's own permission preset was gating. Three
 * consequences shape this module, and all three are deliberate:
 *
 *  - **Two decisions, not four outcomes.** The upstream vocabulary
 *    (`allowed-once`/`rejected`/`cancelled`/`unavailable`) mixes decisions a human
 *    makes with states of an *answerer*. A console may only produce the first two —
 *    `cancelled` and `unavailable` describe the machine's own chain giving up, and a
 *    wire validator plus {@link invalidDecisionReason} both refuse them.
 *  - **The policy still wins.** A `never` preset is enforced by the upstream service
 *    *before* it dispatches `approval/request`, so no listener here can turn a
 *    denied operation into an allowed one. What this module decides is only what the
 *    policy left open — and only for Sessions a user opted in by name.
 *  - **Failing closed is the default.** Every way this can go wrong — a TTL, an
 *    aborted turn, a decision refused as late, a machine going offline — ends with
 *    the operation *not* granted, because the upstream caller treats anything but
 *    `allowed-once` as a refusal.
 *
 * The request itself carries no arguments, and that is not an omission: it names
 * the tool and the exact `callId`, and the console reads the call out of the
 * transcript it is already mirroring. So a card can say what is being approved
 * without a second copy of the log crossing the wire.
 */

import {
  APPROVAL_TTL_MS,
  type ApprovalOutcome,
  type RelayedApproval,
  type RelayedApprovalDecision,
} from '../shared/protocol.ts'
import type { ApprovalOutcomeLike, ApprovalRequestLike } from './dsh.ts'
import { HandoffRelay, type HandoffSink } from './handoff.ts'

/** Where the relay reaches the console. Absent when this machine is a server itself. */
export type ApprovalSink = HandoffSink<RelayedApproval, ApprovalOutcome>

/** What this machine's relayed approvals did, for the state view. */
export interface ApprovalCounts {
  offered: number
  open: number
  decidedLocally: number
  decidedRemotely: number
  lateDecisions: number
  aborted: number
}

/** Whether one console decision claimed the approval, or why it did not. */
export type ApprovalClaim = { ok: true } | { ok: false; reason: string }

/**
 * Cut one live approval down to what crosses a wire.
 * @param request - the pending approval request.
 * @returns the relayable shape.
 */
export function relayedApproval(request: ApprovalRequestLike): RelayedApproval {
  // The asker's own sentence wins over the localized presentation: it is the text
  // written for exactly this decision, while `displayReason` is a generic string
  // rendered into whatever locale the *asking* side happened to use.
  const reason = request.reason ?? request.displayReason?.en
  return {
    toolName: request.toolName,
    ...(request.callId === undefined ? {} : { callId: request.callId }),
    ...(reason === undefined ? {} : { reason }),
  }
}

/**
 * Check one console decision against what a console may decide.
 *
 * The wire validator already refuses anything outside the two decisions; this is the
 * same rule at the domain boundary, so a forged or stale frame cannot reach a tool
 * call by a road the validator does not cover — and so `unavailable` in particular
 * can never be *claimed* by remote, which would let a console hand a caller the
 * fail-closed value while pretending to have decided.
 * @param decision - what the console decided.
 * @returns undefined when it is a decision a console may make, else the reason.
 */
export function invalidDecisionReason(decision: unknown): string | undefined {
  if (decision === 'allowed-once' || decision === 'rejected') return undefined
  return `a console may only allow once or reject, not ${JSON.stringify(decision)}`
}

/**
 * How one local outcome is reported to the console.
 *
 * The console is told which way it lost, not merely that it lost: "the machine's
 * own human allowed this" and "the machine's own human refused it" are opposite
 * facts about the same operation, and a reader who could not tell them apart would
 * misread their own audit trail.
 * @param outcome - what the local answerer returned.
 * @returns the outcome to close the card with.
 */
export function localApprovalOutcome(outcome: ApprovalOutcomeLike): ApprovalOutcome {
  if (outcome === 'allowed-once') return 'allowed-at-origin'
  if (outcome === 'rejected') return 'rejected-at-origin'
  // `cancelled` is somebody deciding not to decide, and `unavailable` is no
  // answerer at all: neither is a decision, and the card says so rather than
  // implying the machine granted or refused anything.
  return outcome === 'cancelled' ? 'aborted' : 'unavailable'
}

/** The approval relay: what this machine offered the console, and who decided. */
export class ApprovalRelay {
  private readonly core: HandoffRelay<RelayedApproval, RelayedApprovalDecision, ApprovalOutcome>

  /**
   * @param sink - how this relay reaches the console.
   * @param ttlMs - how long a relayed approval stays decidable.
   */
  constructor(sink: ApprovalSink, private readonly ttlMs: number = APPROVAL_TTL_MS) {
    this.core = new HandoffRelay(sink, {
      settled: 'this approval was already decided on the machine that asked for it',
      claimed: 'this approval was already decided from the console',
      unknown: 'no such approval is waiting on this machine',
      expired: 'the approval expired before the decision arrived',
    })
  }

  /**
   * Offer one approval to the console and race it against the local answerer.
   * @param sessionId - the Session asking; absent means "not relayable".
   * @param request - the approval the agent is blocked on.
   * @param local - the delegated local answerer.
   * @returns the winning outcome, in the upstream vocabulary.
   */
  async race(
    sessionId: string | undefined,
    request: ApprovalRequestLike,
    local: () => Promise<ApprovalOutcomeLike>,
  ): Promise<ApprovalOutcomeLike> {
    return this.core.race<ApprovalOutcomeLike>({
      sessionId,
      offer: relayedApproval(request),
      ttlMs: this.ttlMs,
      local,
      // The console's decision *is* the local outcome: there is nothing to convert,
      // which is exactly why the two vocabularies had to be kept apart above.
      remote: decision => decision,
      validate: decision => invalidDecisionReason(decision),
      closeOnLocal: localApprovalOutcome,
      // Any local rejection lands here — a cancellation and "no answerer at all"
      // alike — and both mean the same thing to a reader: the machine's side did not
      // decide, so this operation was not granted here.
      closeOnAbort: 'aborted',
    })
  }

  /**
   * Claim one pending approval for the console's decision.
   * @param approvalId - the approval the console decided.
   * @param decision - what it decided.
   * @param commandId - the command carrying it, so a retry is recognisable.
   * @returns whether the decision was claimed.
   */
  claim(approvalId: string, decision: RelayedApprovalDecision, commandId: string): ApprovalClaim {
    return this.core.claim(approvalId, decision, commandId)
  }

  /** What this machine's relayed approvals did. */
  counts(): ApprovalCounts {
    const counts = this.core.counts()
    return {
      offered: counts.offered,
      open: counts.open,
      decidedLocally: counts.decidedLocally,
      decidedRemotely: counts.decidedRemotely,
      lateDecisions: counts.lateAnswers,
      aborted: counts.aborted,
    }
  }

  /**
   * Withdraw every approval still pending, because this machine is going away.
   *
   * `aborted` rather than anything that reads like a decision: a shutdown is not a
   * refusal, and the upstream caller fails closed either way.
   * @param outcome - what to tell the console.
   */
  withdrawAll(outcome: ApprovalOutcome = 'aborted'): void {
    this.core.withdrawAll(outcome)
  }
}
