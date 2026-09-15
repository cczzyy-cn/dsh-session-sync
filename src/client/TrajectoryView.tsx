/**
 * The trajectory view: the shipped ledger, rebuilt over the mirror.
 *
 * Three parts, copied to the figure from `ui-trajectory`:
 *
 *  - a 32px toolbar — recorded-versus-equal widths, fold every turn, fold every
 *    assistant's calls, and one search box;
 *  - a 50px timeline strip in three lanes (bookkeeping, messages, tools) with a
 *    44px label gutter and a hairline where each turn begins;
 *  - the ledger table beside a right-hand inspector that opens on the row you
 *    click.
 *
 * It reads rows the projection layer already built from the mirrored log, so the
 * one thing this file owns is presentation and the selection state a reader
 * drives. Counts and colours follow the shipped sheet; nothing here invents a
 * metric the log does not carry.
 */
import * as React from 'react'
import { MarkdownText, StateDot, IconSearchOutline16, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionSyncKey } from './locales.ts'
import {
  clockLabel,
  collapseWhitespace,
  compactTokens,
  trajectoryTimeline,
  type SessionStats,
  type TrajectoryCell,
  type TrajectoryKind,
  type TrajectoryScale,
  type TrajectorySpan,
} from './session-chrome.ts'
import css from './sync.module.css'

/** Props the console binds for the trajectory tab. */
export interface TrajectoryViewProps {
  t: (key: SessionSyncKey) => string
  cells: readonly TrajectoryCell[]
  stats: SessionStats
  /** Markdown chrome for the assistant payloads. */
  labels: MarkdownLabels
}

/** One rendered row: a cell, or the summary that stands in for a folded turn. */
interface DisplayRow {
  cell: TrajectoryCell
  /** Index into the cell list; a folded turn keeps its first cell's index. */
  index: number
  /** Rows this summary stands in for, when the turn is folded. */
  folded?: number
  /** Whether the row matches the active search. */
  match: boolean
}

/**
 * Render the trajectory tab.
 * @param props - copy, the projected rows, the Session's totals, and markdown chrome.
 * @returns the toolbar, the strip, the ledger and the inspector.
 */
export function TrajectoryView(props: TrajectoryViewProps): React.ReactElement {
  const { t, cells } = props
  const [scale, setScale] = React.useState<TrajectoryScale>('sequence')
  const [foldedTurns, setFoldedTurns] = React.useState<ReadonlySet<number>>(new Set())
  const [foldCalls, setFoldCalls] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [selected, setSelected] = React.useState<number | null>(null)

  const rows = React.useMemo(
    () => displayRows(cells, foldedTurns, foldCalls, query),
    [cells, foldedTurns, foldCalls, query],
  )
  const timeline = React.useMemo(() => trajectoryTimeline(cells, scale), [cells, scale])
  const selectedCell = selected === null ? undefined : cells[selected]
  const collapsibleTurns = React.useMemo(() => {
    const counts = new Map<number, number>()
    for (const cell of cells) {
      if (cell.turn === undefined || cell.kind === 'turn' || cell.kind === 'system') continue
      counts.set(cell.turn, (counts.get(cell.turn) ?? 0) + 1)
    }
    return [...counts].filter(([, count]) => count > 1).map(([turn]) => turn)
  }, [cells])
  const allTurnsFolded = collapsibleTurns.length > 0 && collapsibleTurns.every(turn => foldedTurns.has(turn))

  const toggleAllTurns = (): void => {
    setFoldedTurns(allTurnsFolded ? new Set() : new Set(collapsibleTurns))
  }
  const toggleTurn = (turn: number): void => {
    setFoldedTurns((current) => {
      const next = new Set(current)
      if (next.has(turn)) next.delete(turn)
      else next.add(turn)
      return next
    })
  }
  const selectSpan = (span: TrajectorySpan): void => { setSelected(span.index) }

  return (
    <div className={css.tjRoot}>
      <div className={css.tjToolbar} role="toolbar" aria-label={t('tabTrajectory')}>
        <button
          type="button"
          className={css.tjToggle}
          aria-pressed={scale === 'duration'}
          title={scale === 'duration' ? t('tjEqualWidth') : t('tjActualDuration')}
          onClick={() => { setScale(current => (current === 'sequence' ? 'duration' : 'sequence')) }}
        >
          <svg className={css.tjToggleIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="5.25" />
            <path d="M8 4.75V8l2.25 1.5" />
          </svg>
          {t('tjDuration')}
        </button>
        <button
          type="button"
          className={css.tjAction}
          aria-pressed={allTurnsFolded}
          title={allTurnsFolded ? t('tjExpandTurns') : t('tjFoldTurns')}
          onClick={toggleAllTurns}
        >
          <span className={css.tjActionIcon} aria-hidden="true">{allTurnsFolded ? '⊞' : '⊟'}</span>
          {t('tjTurns')}
        </button>
        <button
          type="button"
          className={css.tjAction}
          aria-pressed={foldCalls}
          title={foldCalls ? t('tjExpandCalls') : t('tjFoldCalls')}
          onClick={() => { setFoldCalls(current => !current) }}
        >
          <span className={css.tjActionIcon} aria-hidden="true">{foldCalls ? '⊞' : '⊟'}</span>
          {t('tjCalls')}
        </button>
        <span className={css.tjSearch}>
          <IconSearchOutline16 size={11} className={css.tjSearchIcon} />
          <input
            type="search"
            className={css.tjSearchInput}
            aria-label={t('tjSearch')}
            placeholder={t('tjSearchPlaceholder')}
            value={query}
            onChange={(event) => { setQuery(event.currentTarget.value) }}
          />
        </span>
      </div>

      {timeline !== null && (
        <div className={css.tjStrip}>
          <div className={css.tjPlot}>
            <div className={css.tjLaneLabels} aria-hidden="true">
              <span>{t('tjLaneSystem')}</span>
              <span>{t('tjLaneMessage')}</span>
              <span>{t('tjLaneTool')}</span>
            </div>
            <div className={css.tjTrack}>
              <span className={css.tjLanes}>
                {timeline.spans.map(span => (
                  <button
                    type="button"
                    key={span.key}
                    className={css.tjSpan}
                    data-kind={span.kind}
                    data-error={span.isError ? 'true' : undefined}
                    data-selected={query === '' || matchSpan(span, cells, query) ? undefined : 'false'}
                    data-current={selected === span.index ? 'true' : undefined}
                    aria-label={span.label}
                    title={span.label}
                    style={spanStyle(span, timeline.start, timeline.end)}
                    onClick={() => { selectSpan(span) }}
                  />
                ))}
              </span>
              <span className={css.tjTurnBoundaries} aria-hidden="true">
                {timeline.turns.map(turn => (
                  <span
                    key={turn.turn}
                    className={css.tjTurnBoundary}
                    style={{ left: `${String(domainPercent(turn.at, timeline.start, timeline.end))}%` }}
                  />
                ))}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className={css.tjSplit}>
        <div className={css.tjTablePane}>
          <table className={css.ledgerTable}>
            <thead>
              <tr>
                <th className={css.ledgerEventHead}>{t('ledgerEvent')}</th>
                <th>{t('ledgerContent')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.cell.key}
                  data-kind={row.cell.kind}
                  data-turn-start={row.cell.turnStart ? 'true' : undefined}
                  data-error={row.cell.isError ? 'true' : undefined}
                  data-folded={row.folded === undefined ? undefined : 'true'}
                  data-selected={selected === row.index ? 'true' : undefined}
                  data-dimmed={query !== '' && !row.match ? 'true' : undefined}
                  onClick={() => {
                    if (row.folded !== undefined && row.cell.turn !== undefined) toggleTurn(row.cell.turn)
                    else setSelected(row.index)
                  }}
                >
                  <td className={css.ledgerEventCell}>
                    <span className={css.ledgerRail} aria-hidden="true" />
                    {row.cell.turnStart && row.cell.turn !== undefined && (
                      <span className={css.ledgerTurnLabel}>{`T${String(row.cell.turn)}`}</span>
                    )}
                    <span className={css.ledgerKindSlot}>
                      <span className={`${css.ledgerKind} ${css[`kind_${row.cell.kind}`] ?? ''}`}>
                        {row.cell.label}
                      </span>
                    </span>
                  </td>
                  <td className={css.ledgerContentCell}>
                    {row.folded === undefined
                      ? (
                        <Content cell={row.cell} t={t} />
                      )
                      : (
                        <span className={css.tjFolded}>
                          <span className={css.tjFoldedEllipsis} aria-hidden="true">…</span>
                          <span className={css.tjFoldedText}>
                            {`${t('tjFoldedRows')} ${String(row.folded)}`}
                          </span>
                          <span className={css.tjFoldedText}>{row.cell.title}</span>
                        </span>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Inspector
          t={t}
          labels={props.labels}
          stats={props.stats}
          cell={selectedCell}
          onClose={() => { setSelected(null) }}
        />
      </div>
    </div>
  )
}

/** One ledger row's content cell. */
function Content({ cell, t }: {
  cell: TrajectoryCell
  t: (key: SessionSyncKey) => string
}): React.ReactElement {
  if (cell.request === undefined) {
    return <span className={cell.mono ? css.ledgerMono : css.ledgerText}>{cell.title}</span>
  }
  const result = cell.result === undefined || cell.result === ''
    ? (cell.durationMs === undefined ? t('toolRunning') : t('toolNoOutput'))
    : collapseWhitespace(cell.result)
  return (
    <>
      <span className={css.ledgerResult}>
        <span className={css.ledgerMono}>
          {cell.title}
          {cell.request === '' ? '' : ` ${cell.request}`}
        </span>
        <span className={cell.isError ? `${css.ledgerMono} ${css.ledgerErrorText}` : css.ledgerMono}>
          {result}
        </span>
      </span>
      {cell.durationMs !== undefined && cell.durationMs > 0 && (
        <span className={css.ledgerDuration}>{`${String(cell.durationMs)} ms`}</span>
      )}
      {cell.tokens !== undefined && (
        <span className={css.ledgerDuration}>{`${String(cell.tokens)} tok`}</span>
      )}
    </>
  )
}

/**
 * The right-hand inspector, in the shipped panel's shape: a 42px header naming
 * the row, a 34px tab strip, and a body that draws the row's own payloads.
 */
function Inspector(props: {
  t: (key: SessionSyncKey) => string
  labels: MarkdownLabels
  stats: SessionStats
  cell: TrajectoryCell | undefined
  onClose: () => void
}): React.ReactElement | null {
  const { t, cell } = props
  const tabs = React.useMemo(() => {
    if (cell === undefined) return [] as { id: string; label: string }[]
    const available: { id: string; label: string }[] = [{ id: 'overview', label: t('tjOverview') }]
    if (cell.request !== undefined) available.push({ id: 'request', label: t('tjRequest') })
    if (cell.result !== undefined) available.push({ id: 'response', label: t('tjResponse') })
    if (cell.request === undefined && cell.result === undefined && cell.title !== '') {
      available.push({ id: 'body', label: t('tjBody') })
    }
    return available
  }, [cell, t])
  const [tab, setTab] = React.useState('overview')
  const close = props.onClose
  React.useEffect(() => { setTab('overview') }, [cell?.key])
  React.useEffect(() => {
    if (cell === undefined) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [cell, close])

  if (cell === undefined) return null
  const location = [
    cell.turn === undefined ? undefined : `T${String(cell.turn)}`,
    cell.step === undefined ? undefined : `S${String(cell.step)}`,
    `#${String(cell.seq)}`,
  ].filter((part): part is string => part !== undefined).join(' · ')

  return (
    <div className={css.tjDetails} role="complementary" aria-label={t('tjOverview')}>
      <div className={css.tjDetailsHeader}>
        <span className={css.tjDetailsTitle}>
          <span className={css.tjDetailsDot} aria-hidden="true" />
          <span className={css.tjDetailsName}>{cell.label}</span>
          <span className={css.tjDetailsLocation}>{location}</span>
        </span>
        <button type="button" className={css.tjClose} aria-label={t('tjClose')} onClick={props.onClose}>
          ×
        </button>
      </div>
      {tabs.length > 1 && (
        <div className={css.tjDetailTabs} role="tablist">
          {tabs.map(entry => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={tab === entry.id ? `${css.tjDetailTab} ${css.tjDetailTabActive}` : css.tjDetailTab}
              onClick={() => { setTab(entry.id) }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
      <div className={css.tjDetailBody}>
        {tab === 'overview' && (
          <dl className={css.tjOverview}>
            <div><dt>{t('tjKind')}</dt><dd>{cell.label}</dd></div>
            <div><dt>{t('ledgerTurn')}</dt><dd>{cell.turn === undefined ? '—' : String(cell.turn)}</dd></div>
            <div><dt>{t('tjStep')}</dt><dd>{cell.step === undefined ? '—' : String(cell.step)}</dd></div>
            <div><dt>{t('tjSeq')}</dt><dd>{String(cell.seq)}</dd></div>
            <div><dt>{t('tjTime')}</dt><dd>{clockLabel(cell.time)}</dd></div>
            <div>
              <dt>{t('tjElapsed')}</dt>
              <dd>{cell.durationMs === undefined ? '—' : `${String(cell.durationMs)} ms`}</dd>
            </div>
            <div><dt>{t('tjTokens')}</dt><dd>{cell.tokens === undefined ? '—' : String(cell.tokens)}</dd></div>
            <div><dt>{t('tjCacheHit')}</dt><dd>{props.stats.cacheHitPercent === undefined ? '—' : `${String(props.stats.cacheHitPercent)}%`}</dd></div>
            <div><dt>{t('tjTotalTokens')}</dt><dd>{compactTokens(props.stats.usage.inputTokens + props.stats.usage.cacheReadTokens + props.stats.usage.outputTokens)}</dd></div>
          </dl>
        )}
        {tab === 'request' && <pre className={css.tjPayload}>{cell.request ?? ''}</pre>}
        {tab === 'response' && (
          <pre className={cell.isError ? `${css.tjPayload} ${css.ledgerErrorText}` : css.tjPayload}>
            {cell.result ?? t('toolNoOutput')}
          </pre>
        )}
        {tab === 'body' && (
          cell.kind === 'assistant' || cell.kind === 'think'
            ? <div className={css.tjMarkdown}><MarkdownText text={cell.title} labels={props.labels} /></div>
            : <pre className={css.tjPayload}>{cell.title}</pre>
        )}
      </div>
    </div>
  )
}

/** Position one span inside the strip's domain. */
function spanStyle(span: TrajectorySpan, start: number, end: number): React.CSSProperties {
  const left = domainPercent(span.start, start, end)
  const width = domainPercent(span.end, start, end) - left
  return {
    '--tj-span-left': `${String(left)}%`,
    '--tj-span-width': `${String(Math.max(width, 0))}%`,
    '--tj-span-lane': String(span.lane),
  } as React.CSSProperties
}

/** One position as a share of the strip's domain. */
function domainPercent(value: number, start: number, end: number): number {
  const span = end - start
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, ((value - start) / span) * 100))
}

/** Whether one span's row matches the active search. */
function matchSpan(span: TrajectorySpan, cells: readonly TrajectoryCell[], query: string): boolean {
  const cell = cells[span.index]
  return cell === undefined ? true : matches(cell, query)
}

/** Whether one row's own text carries the search text. */
function matches(cell: TrajectoryCell, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return cell.title.toLowerCase().includes(needle)
    || (cell.request ?? '').toLowerCase().includes(needle)
    || (cell.result ?? '').toLowerCase().includes(needle)
    || cell.label.toLowerCase().includes(needle)
}

/**
 * Fold the ledger's rows down to what the reader asked to see.
 *
 * A folded turn keeps one 20px summary row in its first row's place — the
 * shipped ledger's own treatment — and a folded assistant drops the tool rows
 * that follow it, which is what "fold calls" means in that ledger.
 * @param cells - every row, in order.
 * @param foldedTurns - turns the reader folded.
 * @param foldCalls - whether tool rows after an assistant row are hidden.
 * @param query - the active search text; a row that misses it renders dimmed.
 * @returns the rows to draw, each carrying its own search verdict.
 */
function displayRows(
  cells: readonly TrajectoryCell[],
  foldedTurns: ReadonlySet<number>,
  foldCalls: boolean,
  query: string,
): DisplayRow[] {
  const rows: DisplayRow[] = []
  const folded = new Set<number>()
  let previousKind: TrajectoryKind | undefined
  for (const [index, cell] of cells.entries()) {
    if (cell.turn !== undefined && foldedTurns.has(cell.turn)) {
      if (folded.has(cell.turn)) continue
      folded.add(cell.turn)
      const summary = cells.find(candidate => candidate.turn === cell.turn && candidate.title !== '')
      rows.push({
        // The row keeps the turn's own tag and takes the first readable line of
        // the turn as its text, so a folded turn still says what it was.
        cell: summary === undefined ? cell : { ...cell, title: summary.title },
        index,
        folded: cells.filter(candidate => candidate.turn === cell.turn).length,
        match: summary === undefined ? matches(cell, query) : matches(summary, query),
      })
      continue
    }
    if (foldCalls && cell.kind === 'tool' && (previousKind === 'assistant' || previousKind === 'think')) {
      continue
    }
    rows.push({ cell, index, match: matches(cell, query) })
    previousKind = cell.kind
  }
  return rows
}
