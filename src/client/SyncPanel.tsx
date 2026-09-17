/**
 * The centre panel: the server's console over every machine that publishes here.
 *
 * Two panes and a three-level tree. The list groups by machine, then by the
 * directory a Session runs in, then lists the Sessions themselves 閳?the shape
 * the sidebar's workspace browser uses, so a remote Session reads the way a
 * local one does. The talk column beside it is the conversation the DSH client
 * already shows, wearing that UI's own clothes: a centered content column, a
 * right-aligned user bubble, markdown answers, folded tool rows, and an elevated
 * composer card with a circular send button.
 *
 * There is no machine pane: the machine is the tree's first level, so picking one
 * is the same act as opening the list.
 *
 * Registered into the `main` slot under the same key as this plugin's sidebar
 * panel row, so the frame's panel selector and the sidebar entry resolve to the
 * same place without either knowing about the other.
 */
import * as React from 'react'
import {
  Button,
  DiffBlock,
  DisclosureRow,
  FishLogo,
  Input,
  JsonBlock,
  MarkdownText,
  ReadBlock,
  SearchBlock,
  StateDot,
  TerminalBlock,
  Tooltip,
  WebBlock,
  IconApiOutline14,
  IconBrowseOutline16,
  IconCheckOutline16,
  IconChecklistOutline14,
  IconChevronDownOutline14,
  IconChevronLeftOutline14,
  IconClockOutline16,
  IconCopyOutline16,
  IconDatabaseOutline16,
  IconEditOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  IconGlobeOutline14,
  IconPanelLeftOutline16,
  IconQuestionOutline14,
  IconRightUpOutline16,
  IconSearchOutline16,
  IconShareOutline16,
  IconSparkle16,
  IconThinkOutline14,
  IconTriangleRightFill14,
  relativeTime,
  writeClipboard,
  type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MirroredMachine, MirroredSession } from '../shared/protocol.ts'
import type { CommandDelivery, SyncClientSnapshot } from './api.ts'
import type { SessionSyncKey, SessionSyncTranslate } from './locales.ts'
import {
  compactTokens,
  sessionChrome,
  trajectoryCells,
  type SessionChrome,
  type SessionContext,
  type SessionStats,
  type TrajectoryKind,
} from './session-chrome.ts'
import { TrajectoryView } from './TrajectoryView.tsx'
import {
  billedInputTokens,
  formatCacheHitPercent,
  formatExactTokens,
  formatMessageClock,
  formatRunDuration,
  formatTokens,
  turnTotalTokens,
} from './message-stats.ts'
import {
  CHAT_DIFF_MAX_LINES,
  CHAT_READ_MAX_LINES,
  CHAT_SEARCH_MAX_LINES,
  diffBlockLabels,
  diffCard,
  diffStat,
  readBlockLabels,
  readCard,
  searchBlockLabels,
  searchCard,
  terminalBlockLabels,
  terminalCard,
  terminalFailed,
  toolRowModel,
  webBlockLabels,
  webCard,
} from './tool-cards.ts'
import { toRows, type AssistantBlock, type NoticeRow, type RetryRow, type ToolRow, type TranscriptRow, type TurnFacts, type TurnUsage } from './transcript.ts'
import { toolPresentation, type ToolGlyph } from './tool-presentation.ts'
import a11yCss from './accessibility.module.css'
import css from './sync.module.css'
// Verbatim copies of the shipped stylesheets for the rows this console renders
// itself: the class vocabulary below is theirs, so a future upstream change is
// re-copied rather than re-derived.
import actionsCss from './MessageIconActions.module.css'
import thinkCss from './ReasoningRow.module.css'
import toolCss from './ToolRow.module.css'
import usageCss from './TurnUsagePanel.module.css'

/**
 * How close to the floor still counts as being at it.
 *
 * The shipped ChatView's own constant: a reader within this many pixels of the
 * bottom is following the tail, and anything further is reading.
 */
const FOLLOW_THRESHOLD = 24

/** Props the renderer binds for the `main` cell. */
export interface SyncPanelProps {
  /** Localized copy, from the registration's `locale` namespace. */
  t: SessionSyncTranslate
  /** The bound snapshot hook, from the registration's `hooks` compartment. */
  useSync: <Value>(selector: (snapshot: SyncClientSnapshot) => Value) => Value
  /** Open one mirrored Session. */
  openSession: (machineName: string, sessionId: string) => Promise<void>
  /** Leave the open Session. */
  closeSession: () => void
  /** Send one takeover prompt to the open Session's machine. */
  sendPrompt: (text: string) => Promise<boolean>
}

/** One directory's Sessions, inside one machine. */
interface ProjectGroup {
  cwd: string
  sessions: MirroredSession[]
}

/** One machine and its directories. */
interface MachineGroup {
  machine: MirroredMachine
  projects: ProjectGroup[]
}

/**
 * Render the sync panel.
 * @param props - copy, the snapshot hook, and the actions.
 * @returns the panel.
 */
export function SyncPanel(props: SyncPanelProps): React.ReactElement {
  const state = props.useSync(snapshot => snapshot)
  const { t } = props
  const [query, setQuery] = React.useState('')
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({})
  /** The reset count the reader has already acknowledged. */
  const [dismissedResets, setDismissedResets] = React.useState(0)
  /**
   * Whether the list column is put away.
   *
   * The list is the console's own column inside the centre surface, so hiding it
   * is a view state of this component, not of the Host sidebar: the transcript
   * then gets the whole width, which is what reading a mirrored Session wants.
   */
  const [listHidden, setListHidden] = React.useState(false)

  const machines = state.state.machines
  const open = state.open
  const groups = React.useMemo(() => buildTree(machines, query), [machines, query])
  const searching = query.trim() !== ''
  // A search is a question about the whole tree, so nothing stays folded while
  // one is being asked: a match inside a collapsed machine would look like no
  // match at all.
  const isOpen = (key: string): boolean => (searching ? true : collapsed[key] !== true)
  const toggle = React.useCallback((key: string): void => {
    setCollapsed(current => ({ ...current, [key]: current[key] !== true }))
  }, [])

  const mirrored = open === undefined
    ? undefined
    : machines
      .find(candidate => candidate.machineName === open.machineName)
      ?.sessions.find(candidate => candidate.sessionId === open.sessionId)
  // A Session that was un-published while it was open has no mirror row left,
  // but the panel is still showing it: the placeholder keeps the talk column 閳?  // and therefore its back button on a narrow window 閳?reachable.
  const session: MirroredSession | undefined = mirrored ?? (open === undefined ? undefined : {
    sessionId: open.sessionId,
    title: open.sessionId,
    updatedAt: Date.now(),
    running: false,
    eventCount: 0,
  })
  const online = open === undefined
    ? false
    : machines.find(candidate => candidate.machineName === open.machineName)?.online ?? false

  return (
    <div className={css.panel} data-open={open === undefined ? 'false' : 'true'} data-list={listHidden ? 'hidden' : 'shown'}>
      <aside className={css.listPane} aria-label={t('sessionsTitle')} aria-hidden={listHidden}>
        <div className={css.listHead}>
          <Input
            icon={<IconSearchOutline16 />}
            value={query}
            placeholder={t('searchSessions')}
            aria-label={t('searchSessions')}
            onChange={(event) => { setQuery(event.target.value) }}
          />
          <span className={css.listStatus}>
            {state.stream === 'connecting'
              ? `${roleLine(state, t)} · ${t('streamReconnecting')}`
              : roleLine(state, t)}
          </span>
        </div>
        <div className={css.list} role="tree">
          {/* A host restart empties a memory-only mirror for a couple of
              seconds, which is far too short to notice. The count is raised by
              the reconnect itself and stays up until the reader closes it. */}
          {state.mirrorResets > dismissedResets && (
            <p className={css.notice} role="status">
              <span className={css.noticeText}>{t('mirrorResetNotice')}</span>
              <button
                type="button"
                className={css.noticeClose}
                aria-label={t('tjClose')}
                onClick={() => { setDismissedResets(state.mirrorResets) }}
              >
                脳
              </button>
            </p>
          )}
          {!state.ready && <p className={css.empty}>{t('sessionsLoading')}</p>}
          {state.ready && state.state.role !== 'server' && (
            <p className={css.empty}>{t('panelEmptyClient')}</p>
          )}
          {state.ready && state.state.role === 'server' && machines.length === 0 && (
            <p className={css.empty}>{t('panelEmptyServer')}</p>
          )}
          {state.ready && machines.length > 0 && groups.length === 0 && (
            <p className={css.empty}>{t('searchEmpty')}</p>
          )}
          {groups.map(group => {
            const machineKey = group.machine.machineName
            const machineOpen = isOpen(machineKey)
            return (
              <React.Fragment key={machineKey}>
                <TreeRow
                  level={0}
                  icon="machine"
                  open={machineOpen}
                  dim={!group.machine.online}
                  label={group.machine.machineName}
                  trailing={machineTrailing(group.machine, t)}
                  rowKey={machineKey}
                  onToggleKey={toggle}
                />
                {machineOpen && group.machine.sessions.length === 0 && (
                  <p className={css.empty}>{t('machineNoSessions')}</p>
                )}
                {machineOpen && group.projects.map(project => {
                  const projectKey = `${machineKey}\u0000${project.cwd}`
                  const projectOpen = isOpen(projectKey)
                  const projectLabel = project.cwd === '' ? t('noCwd') : project.cwd
                  return (
                    <React.Fragment key={projectKey}>
                      <TreeRow
                        level={1}
                        icon="project"
                        open={projectOpen}
                        label={projectLabel}
                        trailing={String(project.sessions.length)}
                        rowKey={projectKey}
                        onToggleKey={toggle}
                      />
                      {projectOpen && project.sessions.map(candidate => {
                        const selected = open?.sessionId === candidate.sessionId
                        return (
                          <button
                            key={candidate.sessionId}
                            type="button"
                            role="treeitem"
                            aria-selected={selected}
                            data-level={2}
                            className={selected
                              ? `${css.treeSession} ${css.treeSessionSelected}`
                              : css.treeSession}
                            aria-label={`${t('openSession')}: ${candidate.title}`}
                            title={candidate.title}
                            onClick={() => {
                              void props.openSession(group.machine.machineName, candidate.sessionId)
                            }}
                          >
                            <span className={css.treeSlot}>
                              {candidate.running && <StateDot state="ongoing" />}
                            </span>
                            <span className={css.rowTitle}>{candidate.title}</span>
                            <span className={css.rowTime}>
                              {candidate.running
                                ? t('sessionRunning')
                                : timeLabel(candidate.updatedAt, t)}
                            </span>
                          </button>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </React.Fragment>
            )
          })}
        </div>
      </aside>

      <section className={css.viewPane} aria-label={t('panelTitle')}>
        {open === undefined || session === undefined
          ? <HeroPlaceholder t={t} />
          : (
            <Conversation
              t={t}
              state={state}
              session={session}
              machineName={open.machineName}
              online={online}
              closeSession={props.closeSession}
              sendPrompt={props.sendPrompt}
              listHidden={listHidden}
              toggleList={() => { setListHidden(current => !current) }}
            />
          )}
      </section>
    </div>
  )
}

/**
 * One foldable tree row: the machine and project levels, which differ in their
 * depth, their leading glyph, and their trailing text.
 *
 * A machine wears the globe its sidebar panel row uses —the two are the same
 * thing seen from two places —while a directory keeps the folder the workspace
 * browser gives it. Both still swap to the expand arrow on hover, because that
 * arrow is the only affordance saying the row folds.
 */
const TreeRow = React.memo(function TreeRow(props: {
  level: 0 | 1
  icon: 'machine' | 'project'
  open: boolean
  dim?: boolean
  label: string
  trailing: string
  rowKey: string
  onToggleKey: (key: string) => void
}): React.ReactElement {
  return (
    <button
      type="button"
      role="treeitem"
      aria-expanded={props.open}
      aria-label={props.label}
      title={props.label}
      data-level={props.level}
      className={props.dim === true ? `${css.treeRow} ${css.treeRowDim}` : css.treeRow}
      onClick={() => { props.onToggleKey(props.rowKey) }}
    >
      <span className={`${css.treeSlot} ${css.treeFolder}`}>
        {props.icon === 'machine'
          ? <IconGlobeOutline14 size={16} />
          : (props.open ? <IconFolderOpen16 /> : <IconFolderClose16 />)}
      </span>
      <span className={`${css.treeSlot} ${css.treeChevron}`}>
        <IconTriangleRightFill14 className={props.open ? css.arrowOpen : undefined} />
      </span>
      <span className={css.rowTitle}>{props.label}</span>
      <span className={css.rowTime}>{props.trailing}</span>
    </button>
  )
})

/**
 * One mirrored Session opened for reading and takeover.
 *
 * The snapshot arrives as a prop rather than being re-read here: the renderer's
 * generated `use<Name>` hook belongs to the registered component, and a second
 * call site in a child would depend on how that binding is cached.
 */
function Conversation(props: {
  t: SessionSyncTranslate
  state: SyncClientSnapshot
  session: MirroredSession
  machineName: string
  online: boolean
  closeSession: () => void
  sendPrompt: (text: string) => Promise<boolean>
  listHidden: boolean
  toggleList: () => void
}): React.ReactElement {
  const { t, state, session } = props
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [tab, setTab] = React.useState<'chat' | 'trajectory'>('chat')
  const body = React.useRef<HTMLDivElement | null>(null)
  /** The reading column, whose height is what growth moves. */
  const column = React.useRef<HTMLDivElement | null>(null)
  /** Whether the reader is at the floor of the transcript. */
  const [atBottom, setAtBottom] = React.useState(true)
  const scrollToBottom = React.useCallback((smooth = true): void => {
    const el = body.current
    if (el === null) return
    if (smooth && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else el.scrollTop = el.scrollHeight
  }, [])
  // A reader who scrolled up owns the viewport until they come back down; while
  // they are at the floor the mirrored tail keeps following, which is what a live
  // Session wants (the shipped ChatView follows the same way).
  React.useEffect(() => {
    const el = body.current
    if (el === null) return
    const onScroll = (): void => {
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD)
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll) }
  }, [tab, state.open?.sessionId])
  // Growth is what the tail has to follow, and it arrives without a row count
  // change: the live row's text grows, markdown reflows, a disclosure opens. The
  // shipped ChatView watches the column for exactly this reason, and writes only
  // while the reader is pinned, so a scrolled-up reader keeps their place.
  React.useEffect(() => {
    const node = column.current
    if (node === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => { if (atBottom) scrollToBottom(false) })
    observer.observe(node)
    return () => { observer.disconnect() }
  }, [atBottom, scrollToBottom, tab, state.open?.sessionId])
  // Opening a Session is a fresh read: it starts at the floor whatever the reader
  // was doing in the previous one.
  React.useEffect(() => {
    setAtBottom(true)
    scrollToBottom(false)
  }, [state.open?.sessionId, scrollToBottom])
  const rows = React.useMemo(
    () => toRows(state.transcript?.events ?? []),
    [state.transcript],
  )
  // The header's facts and the ledger's rows read the same mirrored events the
  // transcript does; nothing extra crosses the wire for them.
  const chrome = React.useMemo(
    () => sessionChrome(state.transcript?.events ?? []),
    [state.transcript],
  )

  const cells = React.useMemo(
    () => trajectoryCells(state.transcript?.events ?? [], kindLabel(t)),
    [state.transcript, t],
  )
  // The shipped chat reveals a turn's actions by recency: the newest turn keeps
  // its row, an older one reveals it on hover. The live step counts as a turn of
  // its own, so the moment a new one starts the previous turn's row retires to
  // hover — which is what a reader sees in the conversation beside this panel.
  const latestTurn = React.useMemo(
    () => rows.reduce(
      (newest, row) => (row.kind === 'assistant' && row.turn > newest ? row.turn : newest),
      state.live.turn,
    ),
    [rows, state.live.turn],
  )
  // MarkdownText caches a streaming render against the labels object's identity,
  // so a fresh object on every render would discard that cache each time.
  const labels = React.useMemo(
    () => ({
      code: { copyLabel: t('copyCode'), copiedLabel: t('copiedCode') },
      footnotes: t('footnotes'),
    }),
    [t],
  )

  const send = (): void => {
    const text = draft.trim()
    if (text === '' || sending) return
    setSending(true)
    void props.sendPrompt(text).then((accepted) => {
      setSending(false)
      if (accepted) setDraft('')
    })
  }

  const delivery = state.delivery
  return (
    <>
      <header className={css.viewHeader}>
        <div className={css.viewTitleRow}>
          {/* The list is this console's own column, so putting it away is a
              control here rather than in the Host sidebar. It sits first, where
              the eye already looks for the column it controls. */}
          <Button
            variant="ghost"
            size="sm"
            className={css.listToggle}
            icon={<IconPanelLeftOutline16 />}
            aria-label={props.listHidden ? t('listShow') : t('listHide')}
            onClick={props.toggleList}
          />          <Button
            variant="ghost"
            size="sm"
            className={css.narrowOnly}
            icon={<IconChevronLeftOutline14 />}
            aria-label={t('back')}
            onClick={props.closeSession}
          />
          <h2 className={css.viewTitle}>{session.title}</h2>
          <span className={css.viewMachine}>{props.machineName}</span>
          {session.running && (
            <>
              <StateDot state="ongoing" />
              <span className={css.viewMachine}>{t('sessionRunning')}</span>
            </>
          )}
          <span className={css.viewSpacer} />

          <ChromeChips t={t} chrome={chrome} />
        </div>
        {/* The two views the shipped header switches between (figma Tab_Group):
            13/16 wt500, a 2px bar under the active one. */}
        <div className={css.viewTabs} role="tablist" aria-label={t('panelTitle')}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'chat'}
            className={tab === 'chat' ? `${css.viewTab} ${css.viewTabActive}` : css.viewTab}
            onClick={() => { setTab('chat') }}
          >
            {t('tabChat')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'trajectory'}
            className={tab === 'trajectory' ? `${css.viewTab} ${css.viewTabActive}` : css.viewTab}
            onClick={() => { setTab('trajectory') }}
          >
            {t('tabTrajectory')}
          </button>
        </div>
      </header>
      {tab === 'trajectory'
        ? <TrajectoryView t={t} cells={cells} stats={chrome.stats} labels={labels} />
        : (
          <div className={css.viewScroll} ref={body}>
            <div className={css.viewColumn} ref={column}>
              {state.error !== undefined && <div className={css.error}>{state.error}</div>}
              {state.transcript === undefined && !state.loadingTranscript
                ? <p className={css.empty}>{t('transcriptGone')}</p>
                : state.loadingTranscript
                  ? <p className={css.empty}>{t('transcriptLoading')}</p>
                  : rows.length === 0
                    ? <p className={css.empty}>{t('transcriptEmpty')}</p>
                    : rows.map(row => (
                      <TranscriptLine key={row.key} t={t} row={row} labels={labels} latestTurn={latestTurn} />
                    ))}
              {/* Streaming text arrives between durable settlements: reasoning
                  first, then the answer, each replacing itself as it grows. The
                  settlement that ends the step retires both. */}
              {(state.live.reasoning !== '' || state.live.text !== '') && (
                <div className={css.assistantRow}>
                  {state.live.reasoning !== '' && <ReasoningRow t={t} reasoning={state.live.reasoning} streaming />}
                  {state.live.text !== '' && <MarkdownText text={state.live.text} labels={labels} />}
                </div>
              )}
            </div>
            {/* The shipped control, copied from ui-chat's ChatView: a sticky slot
                inside the scroller, so the button rides the live edge of the
                transcript and disappears once the reader is back at the floor. */}
            {!atBottom && (
              <div className={css.toBottomSlot}>
                <button
                  type="button"
                  className={css.toBottom}
                  aria-label={t('chatToBottom')}
                  onClick={() => { scrollToBottom() }}
                >
                  <IconChevronDownOutline14 />
                </button>
              </div>
            )}
          </div>
        )}
      <div className={css.composerRoot}>
        <form
          className={css.composerCard}
          onSubmit={(event) => { event.preventDefault(); send() }}
        >
          <textarea
            className={css.composerText}
            value={draft}
            rows={2}
            placeholder={t('composerPlaceholder')}
            aria-label={t('composerPlaceholder')}
            onChange={(event) => { setDraft(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              send()
            }}
          />
          <div className={css.composerBar}>
            <span className={css.composerTarget}>
              {t('composerTarget')}
              {' '}
              {props.machineName}
            </span>
            {delivery !== undefined && (
              <span className={css.composerDelivery}>{deliveryLine(delivery, t)}</span>
            )}
            {!props.online && <span className={css.composerOffline}>{t('offlineQueueHint')}</span>}
            <span className={css.composerSpacer} />
            <button
              type="submit"
              className={css.sendButton}
              disabled={sending || draft.trim() === ''}
              aria-label={sending ? t('sending') : t('send')}
            >
              <IconRightUpOutline16 />
            </button>
          </div>
        </form>
        <StatusRow t={t} stats={chrome.stats} />
      </div>
    </>
  )
}

/**
 * The header's right-hand cluster:涓婁笅鏂囧崰鐢ㄧ巼 ring, and the model, preset and
 * subagent facts the log reports.
 *
 * Every one of these is a **reading**, not a control: the mirror can see what
 * the owning machine is doing and cannot change it. The shipped session header
 * carries selectors in these seats; this console shows the same facts without
 * pretending a click would do something.
 */
function ChromeChips({ t, chrome }: {
  t: SessionSyncTranslate
  chrome: SessionChrome
}): React.ReactElement {
  const { model, context, policy, subagents } = chrome
  const preset = policy.preset === undefined
    ? undefined
    : policy.preset === 'danger-full-access'
      ? t('presetDangerFullAccess')
      : policy.preset
  const subagentLabel = subagents.length === 0
    ? t('chromeSubagentsNone')
    : subagents.map(seen => `${seen.label}${seen.isError ? ' !' : ''}`).join('\n')
  return (
    <span className={css.chromeCluster}>
      {model !== undefined && (
        <Tooltip label={`${t('chromeModel')}: ${model.provider}/${model.model}`} side="bottom" delayMs={200}>
          <span className={css.chromeChip}>
            {model.model}
            {model.effort === undefined ? '' : ` · ${model.effort}`}
          </span>
        </Tooltip>
      )}
      {preset !== undefined && (
        <Tooltip label={`${t('chromePreset')}: ${preset}`} side="bottom" delayMs={200}>
          <span className={css.chromeChip}>{preset}</span>
        </Tooltip>
      )}
      <Tooltip label={subagentLabel} side="bottom" delayMs={200}>
        <span className={css.chromeChip}>
          {`${t('chromeSubagents')} ${String(subagents.length)}`}
        </span>
      </Tooltip>
      {context !== undefined && <ContextRing t={t} context={context} />}
    </span>
  )
}

/**
 * The composer's context-occupancy ring (14px, 2px stroke) and the panel its
 * click opens: the shipped meter's geometry, fed by the last request's own
 * numbers instead of the projection.
 */
function ContextRing({ t, context }: {
  t: SessionSyncTranslate
  context: SessionContext
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const radius = 5.5
  const circumference = 2 * Math.PI * radius
  const reading = `${String(context.percent)}%`
  const label = `${t('chromeContextUsed')} ${reading}`
  return (
    <span className={css.ringRoot}>
      <Tooltip label={label} side="bottom" delayMs={200} disabled={open}>
        <button
          type="button"
          className={css.ringTrigger}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => { setOpen(current => !current) }}
        >
          <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
            <circle className={css.ringTrack} cx="7" cy="7" r={radius} />
            <circle
              className={css.ringFill}
              cx="7"
              cy="7"
              r={radius}
              strokeDasharray={`${String(circumference * context.percent / 100)} ${String(circumference)}`}
              transform="rotate(-90 7 7)"
            />
          </svg>
        </button>
      </Tooltip>
      {open && (
        <span className={css.ringPanel} role="dialog" aria-label={label}>
          <span className={css.ringHeadline}>
            {t('chromeContextUsed')}
            {' '}
            <b>{reading}</b>
          </span>
          <span className={css.ringFigures}>
            {`~${compactTokens(context.used)} / ${compactTokens(context.window)}`}
          </span>
        </span>
      )}
    </span>
  )
}

/** The status row under the composer card: turns, steps, throughput, cache. */
function StatusRow({ t, stats }: {
  t: SessionSyncTranslate
  stats: SessionStats
}): React.ReactElement | null {
  if (stats.turns === 0 && stats.steps === 0) return null
  const parts: string[] = [`${String(stats.turns)} ${t('statusTurns')}`, `${String(stats.steps)} ${t('statusSteps')}`]
  if (stats.outputPerSecond !== undefined) parts.push(`${String(stats.outputPerSecond)} ${t('statusTokens')}/s`)
  const total = stats.usage.inputTokens + stats.usage.cacheReadTokens + stats.usage.outputTokens
  const tail: string[] = []
  if (total > 0) tail.push(`${compactTokens(total)} ${t('statusTokens')}`)
  if (stats.cacheHitPercent !== undefined) tail.push(`${t('statusCacheHit')} ${String(stats.cacheHitPercent)}%`)
  return (
    <div className={css.statusRow}>
      <span>{parts.join(' · ')}</span>
      {tail.length > 0 && <span>{tail.join(' · ')}</span>}
    </div>
  )
}

/**
 * The ledger's kind-tag text, from the dictionaries.
 * @param t - the localized copy lookup.
 * @returns a lookup from a projected kind to its tag.
 */
function kindLabel(t: (key: SessionSyncKey) => string): (kind: TrajectoryKind) => string {
  return kind => t(`kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}` as SessionSyncKey)
}

/**
 * What the talk column shows before something is open.
 *
 * It is the client's own new-session hero —the fish, the headline, the preview
 * badge —copied to the figure (ui-conversation HeroShell), because an empty
 * column in this product already has a face and inventing a second one would
 * make the console look like a different application. The one addition is the
 * hint line: unlike a new session, this column is not waiting for a draft, it is
 * waiting for a row to be picked in the list beside it.
 *
 * The hover swim morph is not copied: it is three baked path variants and an
 * SMIL interpolation, all decoration for a placeholder that is about to be
 * replaced by a conversation.
 */
function HeroPlaceholder({ t }: { t: (key: SessionSyncKey) => string }): React.ReactElement {
  return (
    <div className={css.heroRoot}>
      <div className={css.heroStack}>
        <div className={css.heroHeadline}>
          <span className={css.heroFish} aria-hidden="true">
            <FishLogo size={34} />
          </span>
          <span className={css.heroTitleGroup}>
            <span>{t('heroHeadline')}</span>
            <span className={css.heroBadge}>{t('heroPreview')}</span>
          </span>
        </div>
        <p className={css.heroHint}>{t('selectSession')}</p>
      </div>
    </div>
  )
}

/** One transcript row, in the shapes the DSH conversation uses. */
function TranscriptLine({ t, row, labels, latestTurn }: {
  t: SessionSyncTranslate
  row: TranscriptRow
  labels: MarkdownLabels
  /** The newest turn in the flow, which is the one whose actions stay visible. */
  latestTurn: number
}): React.ReactElement {
  if (row.kind === 'user') {
    return (
      // The shipped flow marks each item's kind and lets the actions sheet hide
      // an earlier prompt's row until hover; the copied rule keys on exactly
      // this attribute, so the console inherits that behaviour.
      <div className={css.userRow} data-chat-flow-kind="user">
        <div className={css.bubble}>{row.text}</div>
        <MessageActions t={t} text={row.text} place="user" time={row.time} />
      </div>
    )
  }
  if (row.kind === 'assistant') {
    return (
      <div
        className={css.assistantRow}
        data-chat-flow-kind="assistant"
        data-chat-turn={row.turn}
        // Shipped semantics (ui-chat TurnTailNodeView): the newest turn's
        // actions are always there, an older turn's appear on hover or focus.
        {...row.tail
          ? { 'data-actions-reveal': row.turn >= latestTurn ? 'always' : 'hover' }
          : {}}
      >
        {/* Blocks stay in authored order: the model interleaves reasoning and
            prose, and hoisting every reasoning block to the top would rewrite
            what it actually said. */}
        {row.blocks.map((block, index) => (
          <AssistantBlockView key={index} t={t} block={block} labels={labels} />
        ))}
        {row.interrupted && <span className={css.stopped}>{t('stopped')}</span>}
        {/* A turn's actions belong to its closing message: one answer, one copy
            button, however many steps the turn took. */}
        {row.tail && (
          <MessageActions
            t={t}
            text={assistantTextOf(row.blocks)}
            place="assistant"
            time={row.time}
            {...(row.facts === undefined ? {} : { facts: row.facts })}
          />
        )}
      </div>
    )
  }
  if (row.kind === 'notice') return <NoticeLine t={t} row={row} />
  if (row.kind === 'retry') return <RetryLine t={t} row={row} />
  return <ToolCallRow t={t} row={row} />
}

/** One block of an assistant message. */
function AssistantBlockView({ t, block, labels }: {
  t: SessionSyncTranslate
  block: AssistantBlock
  labels: MarkdownLabels
}): React.ReactElement {
  if (block.kind === 'reasoning') return <ReasoningRow t={t} reasoning={block.text} />
  if (block.kind === 'text') return <MarkdownText text={block.text} labels={labels} />
  if (block.kind === 'image') {
    // The mirror carries an image block's facts but never its bytes: the
    // shipped chat renders the picture, this can only say one was there.
    return (
      <span className={css.mediaChip}>
        {t('imageBlock')}
        {block.detail === '' ? '' : ` · ${block.detail}`}
      </span>
    )
  }
  return (
    <JsonBlock
      label={t('unknownBlock')}
      payload={block.payload}
      truncatedLabel={total => `${t('jsonTruncated')} ${String(total)}`}
    />
  )
}

/** The plain text the copy action writes for one assistant message. */
function assistantTextOf(blocks: readonly AssistantBlock[]): string {
  return blocks
    .filter((block): block is Extract<AssistantBlock, { kind: 'text' }> => block.kind === 'text')
    .map(block => block.text)
    .join('\n\n')
}

/**
 * Copy, turn usage, turn time, and the message clock — the shipped `IconActions`
 * row plus the turn-stat pills that sit in it.
 *
 * The copy feedback is local because the primitive that owns it
 * (`useCopyFeedback`) is not part of the published surface; the behaviour is the
 * shipped one: a one-second check swap, and no second write while it shows. The
 * pills are readings here: the shipped ones open detail dialogs through a
 * portal, and this row carries the same figures in a tooltip instead.
 */
function MessageActions({ t, text, place, time, facts }: {
  t: SessionSyncTranslate
  text: string
  place: 'user' | 'assistant'
  time: number
  facts?: TurnFacts
}): React.ReactElement | null {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])
  const onCopy = (): void => {
    if (copied) return
    void writeClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      timer.current = setTimeout(() => { timer.current = null; setCopied(false) }, 1_000)
    })
  }
  const label = copied ? t('copiedCode') : t('messageCopy')
  const clock = <span className={place === 'user' ? actionsCss.timeStart : actionsCss.timeEnd}>{formatMessageClock(time, t)}</span>
  const total = facts === undefined ? 0 : turnTotalTokens(facts.usage)
  const detail = facts === undefined ? '' : usageDetail(facts.usage, t)
  return (
    <div className={place === 'user' ? actionsCss.actions : `${actionsCss.actions} ${css.messageActions}`}>
      {place === 'user' && clock}
      {text !== '' && (
        <Tooltip label={label} side="bottom">
          <button type="button" className={actionsCss.action} aria-label={label} onClick={onCopy}>
            {copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
          </button>
        </Tooltip>
      )}
      {facts !== undefined && total > 0 && (
        <Tooltip label={detail} side="bottom">
          <span className={usageCss.root}>
            <span className={usageCss.trigger} tabIndex={0}>
              <IconDatabaseOutline16 size={15} />
              <span className={usageCss.label}>{t('turnUsageConsumed', { total: formatTokens(total, t) })}</span>
            </span>
          </span>
        </Tooltip>
      )}
      {facts !== undefined && (
        <Tooltip label={t('turnTimeTitle')} side="bottom">
          <span className={usageCss.root}>
            <span className={usageCss.trigger} tabIndex={0}>
              <IconClockOutline16 size={15} />
              <span className={usageCss.label}>
                {t('messageRanFor', { duration: formatRunDuration(facts.runMs, t) })}
              </span>
            </span>
          </span>
        </Tooltip>
      )}
      {place === 'assistant' && clock}
    </div>
  )
}

/** The tooltip's lines for one turn's usage, in the shipped dialog's order. */
function usageDetail(usage: TurnUsage, t: SessionSyncTranslate): string {
  const total = turnTotalTokens(usage)
  const cacheHit = formatCacheHitPercent(usage.cacheRead, billedInputTokens(usage))
  const lines = [
    `${t('turnUsageTotal')} ${formatExactTokens(total, t)}`,
    ...(cacheHit === null ? [] : [`${t('turnUsageCacheHit')} ${cacheHit}%`]),
    `${t('turnUsageInput')} ${formatExactTokens(usage.input, t)}`,
    `${t('turnUsageCacheRead')} ${formatExactTokens(usage.cacheRead, t)}`,
    ...(usage.cacheWrite === 0 ? [] : [`${t('turnUsageCacheWrite')} ${formatExactTokens(usage.cacheWrite, t)}`]),
    `${t('turnUsageOutput')} ${formatExactTokens(usage.output, t)}`,
    ...(usage.reasoning === 0
      ? []
      : [t('turnUsageReasoning', { tokens: formatExactTokens(usage.reasoning, t) })]),
  ]
  return lines.join('\n')
}

/** One turn-end notice: why a turn stopped producing. */
function NoticeLine({ t, row }: {
  t: SessionSyncTranslate
  row: NoticeRow
}): React.ReactElement {
  return (
    <div className={css.noticeRow} role="status">
      <StateDot state={row.tone === 'error' ? 'error' : 'warning'} className={css.noticeDot} />
      <div className={css.noticeCopy}>
        <span className={row.tone === 'error' ? css.noticeTitleError : css.noticeTitleWarn}>
          {row.tone === 'error' ? t('turnFailed') : t('turnMaxTokens')}
        </span>
        <span className={css.noticeMessage}>
          {row.message !== '' ? row.message : t('turnMaxTokensHint')}
        </span>
      </div>
      {row.code !== undefined && <code className={css.noticeCode}>{row.code}</code>}
    </div>
  )
}

/** One model-retry chain, as the shipped chat renders it. */
function RetryLine({ t, row }: {
  t: SessionSyncTranslate
  row: RetryRow
}): React.ReactElement {
  // The delay is counted from this row's first render, not from the event time:
  // the origin's clock and this browser's are not the same clock.
  const deadline = React.useMemo(() => Date.now() + row.delayMs, [row.delayMs, row.key])
  const [seconds, setSeconds] = React.useState(() => countdownSeconds(deadline))
  const active = row.state === 'scheduled'
  React.useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => { setSeconds(countdownSeconds(deadline)) }, 500)
    return () => { window.clearInterval(timer) }
  }, [active, deadline])
  const status = row.state === 'scheduled'
    ? t('retryActive')
    : row.state === 'started' ? t('retryStarted') : t('retryCancelled')
  const attempt = `${t('retryAttempt')} ${String(row.retry)}${row.maximum === undefined ? '' : ` ${t('retryOf')} ${String(row.maximum)}`} ${t('retryAttempts')}`.trim()
  return (
    <details className={css.retryRow} data-active={active || undefined}>
      <summary className={css.retrySummary}>
        <span className={css.retryText} role="status">
          {`${t('retryTitle')} · ${status} · ${attempt}${active ? ` · ${String(seconds)} ${t('retrySeconds')}` : ''}`}
        </span>
      </summary>
      <div className={css.retryDetails}>
        <div>
          <span className={css.retryDetailLabel}>{t('retryDelay')}</span>
          {`${String(Math.round(row.delayMs))} ms`}
        </div>
        <div>
          <span className={css.retryDetailLabel}>{t('retryFailure')}</span>
          {row.failure}
        </div>
      </div>
    </details>
  )
}

/** Whole seconds left before a scheduled attempt runs, never below one. */
function countdownSeconds(deadline: number): number {
  return Math.max(1, Math.ceil((deadline - Date.now()) / 1_000))
}

/**
 * One assistant reasoning block, folded away by default.
 *
 * A block that is still streaming is summarised by its latest line rather than
 * its first, as the shipped row does for a live block: on this deployment the
 * first line is complete within milliseconds of the step starting, so a folded
 * block summarised by it would never appear to move.
 */
function ReasoningRow({ t, reasoning, streaming }: {
  t: SessionSyncTranslate
  reasoning: string
  streaming?: boolean
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  // Its `**` markers are dropped so the gist reads as prose.
  const summary = (streaming === true ? lastLineOf(reasoning) : firstLineOf(reasoning)).replaceAll('**', '')
  return (
    <div
      className={thinkCss.root}
      data-variant="think"
      data-state={streaming === true ? 'running' : 'ok'}
      data-expanded={open || undefined}
    >
      {streaming === true && <span className={a11yCss.visuallyHidden}>{t('rowRunning')}</span>}
      <DisclosureRow
        rowClassName={thinkCss.row}
        leadingClassName={thinkCss.leading}
        titleClassName={thinkCss.title}
        chevronClassName={thinkCss.chevron}
        icon={<IconThinkOutline14 size={14} />}
        title={t('reasoning')}
        open={open}
        expandable
        expandOnRowClick
        onToggle={() => { setOpen(current => !current) }}
        collapsedContent={(
          <>
            <span className={thinkCss.separator} aria-hidden />
            <span className={thinkCss.summary} data-follow-end={streaming === true || undefined}>
              <span className={thinkCss.summaryText}>{summary}</span>
            </span>
          </>
        )}
      >
        <div className={thinkCss.thinkBody}>{reasoning}</div>
      </DisclosureRow>
    </div>
  )
}

/** The first line of a reasoning block, which is what its collapsed row shows. */
function firstLineOf(text: string): string {
  const newline = text.indexOf('\n')
  return (newline === -1 ? text : text.slice(0, newline)).trim()
}

/**
 * The newest line a streaming block has reached.
 *
 * Trailing blank lines are skipped: the text ends wherever the model is, so the
 * last line is usually still being written and often empty.
 */
function lastLineOf(text: string): string {
  const lines = text.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim()
    if (line !== '') return line
  }
  return ''
}

/**
 * One tool call, folded into a single row — the shipped `ToolRow` chassis.
 *
 * One row, never two: the shipped generic card puts the arguments and the
 * result in the expanded body's IN/OUT sections rather than spending a second
 * row on the result. The collapsed line is the failure line, or a terminal
 * card's own description, or the arguments' gist; a diff row carries its
 * `+added -removed` size; and the body is the first shipped card the call and
 * its result can build, falling back to the IN/OUT sections.
 */
function ToolCallRow({ t, row }: {
  t: SessionSyncTranslate
  row: ToolRow
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const model = toolRowModel(row)
  const terminal = terminalCard(row)
  const diff = diffCard(row)
  const read = readCard(row)
  const search = searchCard(row)
  const web = webCard(row)
  // A failing command settles as a successful call: the red state is the
  // terminal card's own reading of the exit status.
  const state = model.state === 'ok' && terminal !== null && terminalFailed(terminal) ? 'error' : model.state
  const card = terminal ?? diff ?? read ?? search ?? web
  const failureLine = state === 'error' ? model.errorSummary : null
  const summaryText = failureLine ?? terminal?.description ?? model.summary
  // A single-file tool never expands to raw arguments: its card, or nothing.
  const singleFile = model.filePath !== undefined
  const bodyRaw = singleFile ? null : model.bodyRaw
  const stat = failureLine === null && diff !== null ? diffStat(diff.diffs) : null
  const expandable = bodyRaw !== null || model.output !== null || card !== null

  const leading = (): React.ReactElement => {
    if (state === 'error') return <span className={toolCss.leading}><StateDot state="error" /></span>
    if (state === 'stopped') return <span className={toolCss.leading}><StateDot state="warning" /></span>
    return (
      <span className={toolCss.leading}>
        <ToolGlyphIcon glyph={toolPresentation(row.name).glyph} />
      </span>
    )
  }
  const status = state === 'running'
    ? t('rowRunning')
    : state === 'error' ? t('rowFailed') : state === 'stopped' ? t('rowStopped') : null

  return (
    <div className={toolCss.root} data-state={state} data-variant={model.variant} data-tool={row.name}>
      <DisclosureRow
        rowClassName={toolCss.row}
        leadingClassName={toolCss.leading}
        titleClassName={toolCss.title}
        chevronClassName={toolCss.chevron}
        icon={leading()}
        title={t(model.titleKey)}
        open={open && expandable}
        expandable={expandable}
        expandOnRowClick
        onToggle={() => { setOpen(current => !current) }}
        collapsedContent={summaryText !== '' && (
          <>
            <span className={toolCss.sep} aria-hidden />
            <span className={failureLine !== null ? toolCss.errorSummary : toolCss.summary}>
              {summaryText}
            </span>
            {stat !== null && <span className={toolCss.diffStat}>{stat}</span>}
          </>
        )}
      >
        <div className={toolCss.bodyWrap}>
          {terminal !== null
            ? <TerminalBlock {...terminal} maxLines={Infinity} labels={terminalBlockLabels(t)} className={toolCss.terminalBody} />
            : diff !== null
              ? <DiffBlock diffs={[...diff.diffs]} labels={diffBlockLabels(t)} maxLines={CHAT_DIFF_MAX_LINES} className={toolCss.diffBody} />
              : read !== null
                ? <ReadBlock {...read} labels={readBlockLabels(t)} maxLines={CHAT_READ_MAX_LINES} className={toolCss.readBody} />
                : search !== null
                  ? (
                    <>
                      <SearchBlock {...search.card} labels={searchBlockLabels(t)} maxLines={CHAT_SEARCH_MAX_LINES} className={toolCss.searchBody} />
                      {search.recovery !== undefined && <div className={toolCss.searchRecovery}>{search.recovery}</div>}
                    </>
                  )
                  : web !== null
                    ? <WebBlock {...web} labels={webBlockLabels(t)} className={toolCss.webBody} />
                    : (
                      <div className={toolCss.ioCard}>
                        {bodyRaw !== null && (
                          <>
                            <div className={toolCss.ioSection}>
                              <span className={toolCss.ioLabel}>{t('rowInput')}</span>
                              <span className={toolCss.ioText}>{row.argumentsText}</span>
                            </div>
                            {model.output !== null && <div className={toolCss.ioDivider} aria-hidden />}
                          </>
                        )}
                        {model.output !== null && (
                          <div className={toolCss.ioSection}>
                            <span className={toolCss.ioLabel}>{t('rowOutput')}</span>
                            <span className={toolCss.ioText} data-error={state === 'error' || undefined}>
                              {model.output}
                            </span>
                          </div>
                        )}
                        {bodyRaw === null && model.output === null && (
                          <div className={toolCss.ioSection}>
                            <span className={toolCss.ioLabel}>{t('rowOutput')}</span>
                            <span className={toolCss.ioText}>
                              {model.state === 'running' ? t('toolRunning') : t('toolNoOutput')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
        </div>
      </DisclosureRow>
      {status !== null && <span className={toolCss.visuallyHidden}>{status}</span>}
    </div>
  )
}

/**
 * The glyph a tool family leads with —the same mark the shipped toolview for
 * that family registers, at 14 inside the row's 16px leading box.
 */
function ToolGlyphIcon({ glyph }: { glyph: ToolGlyph }): React.ReactElement {
  switch (glyph) {
    case 'browse':
      return <IconBrowseOutline16 size={14} />
    case 'edit':
      return <IconEditOutline16 size={14} />
    case 'search':
      return <IconSearchOutline16 size={14} />
    case 'terminal':
      return <IconApiOutline14 size={14} />
    case 'globe':
      return <IconGlobeOutline14 size={14} />
    case 'question':
      return <IconQuestionOutline14 size={14} />
    case 'plan':
      return <IconChecklistOutline14 size={14} />
    case 'share':
      return <IconShareOutline16 size={14} />
    default:
      // No family claims it: the shipped generic card leads with this same
      // neutral mark (GenericToolCard's own fallback).
      return <IconSparkle16 size={14} />
  }
}

/** The role and link line under the list's search box. */
function roleLine(state: SyncClientSnapshot, t: (key: SessionSyncKey) => string): string {
  const role = state.state.role === 'server' ? t('roleServer') : t('roleClient')
  if (state.state.role === 'server') {
    return `${role} · ${state.state.listening ? t('statusListening') : t('statusNotListening')}`
  }
  if (state.state.serverUrl.trim() === '') return `${role} · ${t('statusNotConfigured')}`
  if (!state.state.linked) return `${role} · ${t('statusUnlinked')}`
  // Connected and publishing are two different claims, and the gap between them
  // was invisible: a live stream with nothing going down it read as healthy.
  const publish = state.state.publish
  if (publish === undefined) return `${role} · ${t('statusLinked')} · ${t('statusNeverPublished')}`
  if (!publish.ok) {
    return `${role} · ${t('statusLinked')} · ${t('statusPublishFailed')}${publish.error === undefined ? '' : `: ${publish.error}`}`
  }
  // The follow contract, reported on the one line that is always visible: a
  // stream that yields nothing is the failure this console could not see.
  const follow = state.state.follow
  if (follow !== undefined && follow.events === 0) {
    return `${role} · ${t('statusLinked')} · ${t('statusFollowSilent')}${follow.frames.length === 0 ? '' : ` (${follow.frames.join(', ')})`}`
  }
  return Date.now() - publish.at > 30_000
    ? `${role} · ${t('statusLinked')} · ${t('statusPublishStalled')}`
    : `${role} · ${t('statusLinked')} · ${t('statusPublishOk')}`
}

/** What a machine row says on its trailing cell. */
function machineTrailing(machine: MirroredMachine, t: (key: SessionSyncKey) => string): string {
  if (!machine.online) return `${t('machineOffline')} · ${timeLabel(machine.lastSeen, t)}`
  const running = machine.sessions.filter(session => session.running).length
  if (running > 0) return `${String(running)} ${t('sessionsRunning')}`
  return `${String(machine.sessions.length)} ${t('machineSessions')}`
}

/** The delivery state of the last prompt, as the composer renders it. */
function deliveryLine(delivery: CommandDelivery, t: (key: SessionSyncKey) => string): string {
  if (delivery.state === 'queued') return t('deliveryQueued')
  if (delivery.state === 'delivered') return t('deliveryDelivered')
  if (delivery.state === 'accepted') return t('deliveryAccepted')
  if (delivery.state === 'expired') return t('deliveryExpired')
  return delivery.error === undefined
    ? t('deliveryFailed')
    : `${t('deliveryFailed')}: ${delivery.error}`
}

/**
 * Group the mirror into machines, their directories, and their Sessions.
 * @param machines - every machine the server mirrors, newest activity first.
 * @param query - the current search text.
 * @returns the tree to render; machines and directories with no match are gone.
 */
function buildTree(machines: readonly MirroredMachine[], query: string): MachineGroup[] {
  const needle = query.trim().toLowerCase()
  const groups: MachineGroup[] = []
  // Ordered by name, not by arrival: the mirror lists machines in whatever order
  // they last published, so two machines publishing in turn would swap rows and
  // the list would appear to jump. A name order changes only when membership does.
  const ordered = [...machines]
    .sort((left, right) => left.machineName.localeCompare(right.machineName))
  for (const machine of ordered) {
    const sessions = machine.sessions
      .filter(session => needle === '' || matches(session, needle))
      .sort((left, right) =>
        Number(right.running) - Number(left.running) || right.updatedAt - left.updatedAt)
    if (needle !== '' && sessions.length === 0) continue
    const directories = new Map<string, MirroredSession[]>()
    for (const session of sessions) {
      const key = session.cwd ?? ''
      const bucket = directories.get(key)
      if (bucket === undefined) directories.set(key, [session])
      else bucket.push(session)
    }
    groups.push({
      machine,
      // Directories are ordered by path for the same reason.
      projects: [...directories]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([cwd, members]) => ({ cwd, sessions: members })),
    })
  }
  return groups
}

/** Whether one Session matches the search text. */
function matches(session: MirroredSession, needle: string): boolean {
  return session.title.toLowerCase().includes(needle)
    || (session.cwd ?? '').toLowerCase().includes(needle)
    || session.sessionId.toLowerCase().includes(needle)
}

/**
 * One relative-time label, from the shared bucketing and this plugin's words.
 * @param at - epoch ms of the moment being described.
 * @param t - the localized copy lookup.
 * @returns the trailing label for one row.
 */
function timeLabel(at: number, t: (key: SessionSyncKey) => string): string {
  const { unit, n } = relativeTime(at, Date.now())
  if (unit === 'now') return t('timeNow')
  if (unit === 'minutes') return `${String(n)} ${t('timeMinutes')}`
  if (unit === 'hours') return `${String(n)} ${t('timeHours')}`
  if (unit === 'days') return `${String(n)} ${t('timeDays')}`
  if (unit === 'months') return `${String(n)} ${t('timeMonths')}`
  return `${String(n)} ${t('timeYears')}`
}
