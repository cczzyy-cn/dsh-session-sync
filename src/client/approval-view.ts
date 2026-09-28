/**
 * What one relayed approval is asking a reader to allow.
 *
 * The offer itself names only the tool and the exact `callId` — the upstream seam
 * does not hand out the arguments — so the card resolves what would actually run
 * from the transcript this console is already mirroring. That is deliberate on both
 * sides: the log is already here (the mirror is how the reader sees the
 * conversation at all), and a second copy of every call's arguments on the question
 * wire would be a second thing to keep honest.
 *
 * What matters for a *permission* card is that the fallback is honest. When the
 * call is not in the window the card says so rather than showing a bare tool name
 * as if that were the whole story: "allow bash" and "allow the bash command the
 * mirror can no longer show you" are different questions to answer, and this module
 * is where that difference is decided.
 */

import type { RelayedApproval } from '../shared/protocol.ts'
import type { TranscriptRow } from './transcript.ts'

/** What a card can say about the operation a decision would release. */
export interface ApprovalPresentation {
  /** The tool the decision is about — the mirror's name when it has the call. */
  toolName: string
  /** One-line gist of the arguments, empty when nothing is known. */
  summary: string
  /** The call's arguments as written, empty when nothing is known. */
  argumentsText: string
  /**
   * Whether the mirrored window still holds the call the offer names.
   *
   * False when the offer carries no `callId` (a hook-driven ask has no call) or the
   * window has moved past it. The card must present that as an absence of
   * information, never as an absence of arguments.
   */
  held: boolean
}

/**
 * Resolve one offer against the rows this console is already showing.
 * @param rows - the open Session's transcript rows, in log order.
 * @param approval - the relayed offer.
 * @returns what the card can say, and whether the call itself is in view.
 */
export function approvalPresentation(
  rows: readonly TranscriptRow[],
  approval: RelayedApproval,
): ApprovalPresentation {
  const call = approval.callId === undefined
    ? undefined
    : rows.find(row => row.kind === 'tool' && row.callId === approval.callId)
  if (call === undefined || call.kind !== 'tool') {
    return { toolName: approval.toolName, summary: '', argumentsText: '', held: false }
  }
  return {
    // The mirror's name wins when it has the call: the offer's name comes from the
    // approval seam, and a card that disagreed with the row right above it would be
    // worse than either alone.
    toolName: call.name === '' ? approval.toolName : call.name,
    summary: call.errorSummary === '' ? call.summary : call.errorSummary,
    argumentsText: call.argumentsText,
    held: true,
  }
}
