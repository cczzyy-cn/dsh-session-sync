/**
 * The card that asks a reader to allow or refuse one operation on another machine.
 *
 * It is deliberately heavier than the question card, because the decision is: this
 * grants a *permission* the owning machine's own preset was gating. So the card
 * shows three things before it shows a button —
 *
 *  - **which machine** is asking, and which tool the decision is about;
 *  - **what would actually run**, resolved from the mirrored transcript by `callId`
 *    (`approval-view.ts`), because a bare tool name is not something anyone should
 *    be asked to grant;
 *  - **the asker's reason**, when it gave one.
 *
 * And when the mirror no longer holds the call, it says *that* instead of quietly
 * showing less. Two buttons, never one, and neither is the default: refusal is a
 * decision too, and a card whose only affordance is "allow" is not a choice.
 */

import * as React from 'react'
import css from './ApprovalCard.module.css'
import {
  type RelayedApprovalDecision,
  type RelayedApprovalView,
} from '../shared/protocol.ts'
import { approvalPresentation } from './approval-view.ts'
import type { TranscriptRow } from './transcript.ts'
import type { SessionSyncTranslate } from './locales.ts'

export interface ApprovalCardProps {
  t: SessionSyncTranslate
  approval: RelayedApprovalView
  /** The transcript rows this console is showing, for resolving the call. */
  rows: readonly TranscriptRow[]
  /** What became of a decision already sent for this approval. */
  decision?: { sent?: boolean; error?: string }
  onDecide: (decision: RelayedApprovalDecision) => void
}

/**
 * One relayed approval, as a card.
 * @param props - the offer, the rows to resolve it against, and how to decide.
 * @returns the card.
 */
export function ApprovalCard(props: ApprovalCardProps): React.ReactElement {
  const { t, approval } = props
  const view = React.useMemo(
    () => approvalPresentation(props.rows, approval.approval),
    [props.rows, approval.approval],
  )
  const sent = props.decision?.sent === true

  return (
    <div className={css.card} role="group" aria-label={t('approvalTitle')}>
      <div className={css.head}>
        <span className={css.title}>{t('approvalTitle')}</span>
        <span className={css.origin}>
          {t('approvalFrom', { machine: approval.machineName, tool: view.toolName })}
        </span>
      </div>
      {view.held
        ? (view.summary === ''
            ? null
            : <span className={css.summary}>{view.summary}</span>)
        : <span className={css.missing}>{t('approvalCallMissing')}</span>}
      {view.argumentsText !== '' && (
        <pre className={css.arguments}>{view.argumentsText}</pre>
      )}
      {approval.approval.reason !== undefined && (
        <p className={css.reason}>
          {t('approvalReason', { reason: approval.approval.reason })}
        </p>
      )}
      <div className={css.bar}>
        {props.decision?.error !== undefined
          ? <span className={css.error}>{props.decision.error}</span>
          : sent
            ? <span className={css.sent}>{t('approvalSent')}</span>
            : <span className={css.hint}>{t('approvalHint')}</span>}
        <span className={css.spacer} />
        <button
          type="button"
          className={css.reject}
          disabled={sent}
          onClick={() => { props.onDecide('rejected') }}
        >
          {t('approvalReject')}
        </button>
        <button
          type="button"
          className={css.allow}
          disabled={sent}
          onClick={() => { props.onDecide('allowed-once') }}
        >
          {t('approvalAllow')}
        </button>
      </div>
    </div>
  )
}

export interface ApprovalElsewhereProps {
  t: SessionSyncTranslate
  count: number
  /** Open the oldest Session that is blocked, so the reader can act on it. */
  onShow: () => void
}

/**
 * The line that says an operation is waiting on a decision somewhere else.
 *
 * The same reasoning as {@link QuestionElsewhere}, with more at stake: a machine
 * whose tool call is blocked stays blocked, and the console's reader never learns
 * about it from a Session they are not looking at.
 * @param props - copy, how many are waiting, and how to go to them.
 * @returns the notice.
 */
export function ApprovalElsewhere(props: ApprovalElsewhereProps): React.ReactElement {
  return (
    <div className={css.elsewhere} role="status">
      <span>{props.t('approvalElsewhere', { n: props.count })}</span>
      <button type="button" className={css.elsewhereGo} onClick={props.onShow}>
        {props.t('questionElsewhereGo')}
      </button>
    </div>
  )
}
