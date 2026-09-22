/**
 * The shipped turn-stat dialogs: a database pill labelled with the turn's total
 * that click-opens the per-turn usage dialog, and a clock pill labelled with the
 * turn's wall time that click-opens the turn-time dialog.
 *
 * Ported from `ui-chat`'s `TurnUsagePanel.tsx` and `stat-dialog.ts`, which a
 * plugin cannot import: the seat (open state, viewport-clamped placement above
 * the trigger, outside-pointer and Escape close) and the panel's markup are
 * theirs, and its skin is `stat-dialog.module.css` copied verbatim. The pills
 * themselves wear the copied `TurnUsagePanel.module.css`.
 */
import * as React from 'react'
import { createPortal } from 'react-dom'
import {
  IconClockOutlineRegular,
  IconDatabaseOutlineRegular,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionSyncTranslate } from './locales.ts'
import {
  formatCacheHitPercent,
  formatExactTokens,
  formatLatencySeconds,
  formatRunDuration,
  formatTokens,
  formatTokensPerSecond,
  turnTotalTokens,
  billedInputTokens,
} from './message-stats.ts'
import type { TurnFacts, TurnUsage } from './transcript.ts'
import css from './TurnUsagePanel.module.css'
import dialogCss from './stat-dialog.module.css'

/** Viewport margin the placement clamp keeps (the shipped Menu portal margin). */
const PANEL_MARGIN = 12

/** Distance between the trigger's top edge and the panel's bottom. */
const PANEL_GAP = 8

/**
 * Unplaced portal panel: hidden but laid out, so the clamp measures real
 * dimensions (the `useAnchoredPosition` measure pass).
 */
const MEASURE_STYLE: React.CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

/** Open state, refs, and clamped placement for one stat dialog. */
interface StatDialogSeat {
  open: boolean
  setOpen: (open: boolean) => void
  rootRef: React.MutableRefObject<HTMLSpanElement | null>
  panelRef: React.MutableRefObject<HTMLDivElement | null>
  pos: React.CSSProperties | null
}

/**
 * One trigger-anchored dialog seat: open state, viewport-clamped placement, and
 * close on an outside pointer or Escape.
 * @returns the seat; spread `pos ?? MEASURE_STYLE` onto the portaled panel.
 */
function useStatDialog(): StatDialogSeat {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLSpanElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement | null>(null)

  // Portal placement: fixed above the trigger and clamped inside the viewport,
  // so a trigger near the window edge cannot push the panel off-screen.
  const pos = useAnchoredPosition({
    open,
    anchorRef: rootRef,
    panelRef,
    side: 'top',
    gap: PANEL_GAP,
    margin: PANEL_MARGIN,
  })

  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)
  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  return { open, setOpen, rootRef, panelRef, pos }
}

/** One dialog row: a term and its figure. */
function Row({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

/** The shipped exact-count spelling: the number plus its `tok` unit. */
function exactCount(value: number, t: SessionSyncTranslate): string {
  return t('turnUsageCount', { count: formatExactTokens(value, t) })
}

/**
 * Turn-usage pill with its click-open details dialog.
 *
 * The shipped dialog reads provider buckets; the mirror carries the same ones on
 * each assistant message, so `TurnUsage` maps onto them one for one. A bucket the
 * turn never reported is left out rather than shown as a zero, which is what the
 * shipped panel does with an absent field.
 * @param props - the turn's usage, its route, and the translate seat.
 * @returns the trigger and, while open, its portaled dialog.
 */
export function TurnUsagePill({ usage, metrics, t }: {
  usage: TurnUsage
  metrics?: TurnFacts['metrics']
  t: SessionSyncTranslate
}): React.ReactElement {
  const { open, setOpen, rootRef, panelRef, pos } = useStatDialog()
  const total = turnTotalTokens(usage)
  const prompt = billedInputTokens(usage)
  const cacheHit = usage.cacheRead > 0 ? formatCacheHitPercent(usage.cacheRead, prompt, 1) : null
  const routes = metrics?.routes ?? ''
  return (
    <span ref={rootRef} className={css.root}>
      <button
        type="button"
        className={css.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
      >
        <IconDatabaseOutlineRegular />
        <span className={css.label}>{t('turnUsageConsumed', { total: formatTokens(total, t) })}</span>
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className={dialogCss.panel}
          role="dialog"
          aria-label={t('turnUsageTitle')}
          style={pos ?? MEASURE_STYLE}
        >
          <div className={dialogCss.title}>
            <span className={dialogCss.titleLabel}>
              <IconDatabaseOutlineRegular />
              {t('turnUsageTitle')}
            </span>
            <span className={dialogCss.titleValue}>{exactCount(total, t)}</span>
          </div>
          <div className={dialogCss.titleRule} aria-hidden />
          <dl className={dialogCss.details} data-turn-usage-details>
            {routes !== '' && <Row label={t('turnUsageModel')}><span className={dialogCss.route}>{routes}</span></Row>}
            {cacheHit !== null && <Row label={t('turnUsageCacheHit')}>{`${cacheHit}%`}</Row>}
            <Row label={t('turnUsageInput')}>{exactCount(usage.input, t)}</Row>
            {usage.cacheRead > 0 && <Row label={t('turnUsageCacheRead')}>{exactCount(usage.cacheRead, t)}</Row>}
            {usage.cacheWrite > 0 && <Row label={t('turnUsageCacheWrite')}>{exactCount(usage.cacheWrite, t)}</Row>}
            <Row label={t('turnUsageOutput')}>
              {exactCount(usage.output, t)}
              {usage.reasoning > 0 && (
                <span className={dialogCss.reasoning}>
                  {t('turnUsageReasoning', { tokens: exactCount(usage.reasoning, t) })}
                </span>
              )}
            </Row>
          </dl>
        </div>,
        document.body,
      )}
    </span>
  )
}

/**
 * Turn-time pill with its click-open details dialog.
 *
 * The duration always stands; throughput and TTFT appear only when the turn's
 * steps recorded them, which is the shipped panel's own rule.
 * @param props - the turn's run time, its folded metrics, and the translate seat.
 * @returns the trigger and, while open, its portaled dialog.
 */
export function TurnTimePill({ runMs, metrics, t }: {
  runMs: number
  metrics?: TurnFacts['metrics']
  t: SessionSyncTranslate
}): React.ReactElement {
  const { open, setOpen, rootRef, panelRef, pos } = useStatDialog()
  const tokensPerSecond = metrics?.tokensPerSecond
  const ttftMs = metrics?.ttftMs
  return (
    <span ref={rootRef} className={css.root}>
      <button
        type="button"
        className={css.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
      >
        <IconClockOutlineRegular />
        <span className={css.label}>{t('messageRanFor', { duration: formatRunDuration(runMs, t) })}</span>
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className={dialogCss.panel}
          role="dialog"
          aria-label={t('turnTimeTitle')}
          style={pos ?? MEASURE_STYLE}
        >
          <div className={dialogCss.title}>
            <span className={dialogCss.titleLabel}>
              <IconClockOutlineRegular />
              {t('turnTimeTitle')}
            </span>
          </div>
          <div className={dialogCss.titleRule} aria-hidden />
          <dl className={dialogCss.details} data-turn-time-details>
            <Row label={t('turnTimeDuration')}>{formatRunDuration(runMs, t)}</Row>
            {tokensPerSecond !== undefined && (
              <Row label={t('turnTimeSpeed')}>
                {t('tokensPerSecond', { tps: formatTokensPerSecond(tokensPerSecond) })}
              </Row>
            )}
            {ttftMs !== undefined && (
              <Row label={t('turnTimeTtft')}>
                {t('durationSeconds', { seconds: formatLatencySeconds(ttftMs) })}
              </Row>
            )}
          </dl>
        </div>,
        document.body,
      )}
    </span>
  )
}
