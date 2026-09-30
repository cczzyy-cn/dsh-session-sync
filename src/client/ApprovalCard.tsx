/**
 * The card that asks a reader to allow or refuse one operation on another machine.
 *
 * It wears the product's own approval takeover: the shipped panel
 * (`@deepseek-ai/dsh-client-ui-approval`) cannot be imported from a plugin — its
 * package is not in the shell's frozen module table — so this is that panel's
 * markup and stylesheet, copied, over this console's data. What the card says is
 * deliberately heavier than a bare tool name, because the decision grants a
 * *permission* the owning machine's own preset was gating:
 *
 *  - the shipped strip and headline, so it reads as the same surface;
 *  - **what would actually run**, resolved from the mirrored transcript by `callId`
 *    (`approval-view.ts`), because a bare tool name is not something anyone should
 *    be asked to grant;
 *  - **which machine** is asking and **the asker's reason**, in the notes the
 *    shipped panel has no equivalent for.
 *
 * When the mirror no longer holds the call it says *that* instead of quietly
 * showing less. Two buttons, never one, and neither is the default: refusal is a
 * decision too, and a card whose only affordance is "allow" is not a choice.
 * Enter grants and Escape refuses, as the shipped panel binds them.
 */

import * as React from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
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
 * One relayed approval, as the product's own panel.
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

  // Enter grants, Escape refuses, and neither fires from inside a field or from a
  // focused control that handles the key itself. A key event during an IME
  // composition is not a decision either — the same guard the shipped panel uses.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || event.key !== 'Enter' && event.key !== 'Escape') return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable]') !== null) return
    if (event.key === 'Enter' && target.closest('button, a[href], [role="button"]') !== null) return
    // `keyCode` 229 is the legacy IME signal engines emit without `isComposing`.
    if (event.repeat || event.nativeEvent.isComposing || event.keyCode === 229 || sent) return
    event.preventDefault()
    event.stopPropagation()
    props.onDecide(event.key === 'Enter' ? 'allowed-once' : 'rejected')
  }

  return (
    <div className={css.root} onKeyDown={onKeyDown}>
      <div
        className={css.card}
        role="group"
        aria-label={t('approvalTitle')}
        aria-busy={sent}
      >
        <div className={css.strip}>
          <StateDot state={sent ? 'ongoing' : 'warning'} />
          {t('approvalFrom', { machine: approval.machineName, tool: view.toolName })}
        </div>
        <div className={css.body}>
          <div className={css.headline}>{t('approvalTitle')}</div>
          {view.held
            ? (view.summary === ''
                ? null
                : <div className={css.command}>{view.summary}</div>)
            : <div className={css.missing}>{t('approvalCallMissing')}</div>}
          {view.argumentsText !== '' && (
            <pre className={css.command}>{view.argumentsText}</pre>
          )}
          {approval.approval.reason !== undefined && (
            <div className={css.note}>{t('approvalReason', { reason: approval.approval.reason })}</div>
          )}
        </div>
        <div className={css.actionRow}>
          {props.decision?.error !== undefined
            ? <span className={css.error}>{props.decision.error}</span>
            : sent
              ? <span className={css.sent}>{t('approvalSent')}</span>
              : <span className={css.hint}>{t('approvalHint')}</span>}
          <Button
            variant="outline"
            className={css.reject}
            disabled={sent}
            onClick={() => { props.onDecide('rejected') }}
          >
            {t('approvalReject')}
          </Button>
          <Button
            variant="primary"
            disabled={sent}
            onClick={() => { props.onDecide('allowed-once') }}
          >
            {t('approvalAllow')}
          </Button>
        </div>
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
