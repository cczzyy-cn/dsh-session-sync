/**
 * The centre panel: the server's console over every machine that publishes here.
 *
 * Two panes and a three-level tree. The list groups by machine, then by the
 * directory a Session runs in, then lists the Sessions themselves — the shape
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
  IconApiOutlineRegular,
  IconBrowseOutlineRegular,
  IconCheckOutlineRegular,
  IconChecklistOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronLeftOutlineRegular,
  IconCopyOutlineRegular,
  IconEditOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
  IconGlobeOutlineRegular,
  IconPanelLeftOutlineRegular,
  IconQuestionOutlineRegular,
  IconSearchOutlineRegular,
  IconShareOutlineRegular,
  IconSparkleRegular,
  IconThinkOutlineRegular,
  IconTriangleRightFillRegular,
  relativeTime,
  writeClipboard,
  type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MirroredMachine, MirroredSession, RelayedAnswerItem, RelayedApprovalDecision } from '../shared/protocol.ts'
import type { CommandDelivery, SyncClientSnapshot } from './api.ts'
import type { SessionSyncKey, SessionSyncTranslate } from './locales.ts'
import { ApprovalCard } from './ApprovalCard.tsx'
import { QuestionCard, QuestionElsewhere } from './QuestionCard.tsx'
import { pagingScrollTop, type PagingMetrics } from './paging-anchor.ts'
import { logCoverage } from './log-coverage.ts'
import { buildTree } from './tree.ts'
import { draftKey, type ComposerDrafts } from './composer-draft.ts'
import { footerProjections, projectionRecord } from './footer-projections.ts'
import { MirrorComposer } from './MirrorComposer.tsx'
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
  formatMessageClock,
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
import { toRows, type AssistantBlock, type NoticeRow, type RetryRow, type ToolRow, type TranscriptRow, type TurnFacts } from './transcript.ts'
import { toolPresentation, type ToolGlyph } from './tool-presentation.ts'
import {
  OFFICIAL_SLOT,
  type OfficialBridgeFace,
  type RenderSlotLike,
  type SessionProviderComponent,
} from './official-session.tsx'
import a11yCss from './accessibility.module.css'
import css from './sync.module.css'
// Verbatim copies of the shipped stylesheets for the rows this console renders
// itself: the class vocabulary below is theirs, so a future upstream change is
// re-copied rather than re-derived.
import actionsCss from './MessageIconActions.module.css'
import thinkCss from './ReasoningRow.module.css'
import toolCss from './ToolRow.module.css'
import { TurnTimePill, TurnUsagePill } from './stat-panels.tsx'

/**
 * How close to the floor still counts as being at it.
 *
 * The shipped ChatView's own constant: a reader within this many pixels of the
 * bottom is following the tail, and anything further is reading.
 */
const FOLLOW_THRESHOLD = 24

/**
 * The element inside the shipped pane that actually scrolls.
 *
 * The pane is another plugin's markup, so this is a search rather than a
 * reference: the deepest, largest-scrolling element that carries a scroll
 * overflow. It is read once per pane to learn where the pane opened — the
 * shipped conversation opens at its newest message, which is its floor, not its
 * top — and after that the capture-phase listener on the wrapper keeps the
 * reading current without walking this subtree again.
 * @param host - the seat the shipped conversation was rendered into.
 * @returns the scroller, or null when the pane's content fits without scrolling.
 */
function findScroller(host: HTMLElement): HTMLElement | null {
  let best: HTMLElement | null = null
  let bestOverflow = 4
  for (const node of host.querySelectorAll<HTMLElement>('*')) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue
    const overflow = node.scrollHeight - node.clientHeight
    if (overflow <= bestOverflow) continue
    best = node
    bestOverflow = overflow
  }
  return best
}

/** Props the renderer binds for the `main` cell. */
export interface SyncPanelProps {
  /** Localized copy, from the registration's `locale` namespace. */
  t: SessionSyncTranslate
  /** The bound snapshot hook, from the registration's `hooks` compartment. */
  useSync: <Value>(selector: (snapshot: SyncClientSnapshot) => Value) => Value
  /** Open one mirrored Session. */
  openSession: (machineName: string, sessionId: string) => Promise<void>
  /** Fetch the page of the open Session that sits before the one held. */
  loadOlder: () => Promise<void>
  /**
   * Page all the way back to the log's start, so the footer can count the whole log.
   *
   * Its own prop rather than a flag on `loadOlder`: one page keeps the reader's place
   * (it is inserted above), while this one is a deliberate, slow, read-everything
   * action — a long Session is several round trips through the machine that owns it.
   */
  loadAllOlder: () => Promise<void>
  /** Leave the open Session. */
  closeSession: () => void
  /** Send one takeover prompt to the open Session's machine. */
  sendPrompt: (text: string) => Promise<boolean>
  /**
   * Answer one question a machine relayed to this console.
   *
   * Separate from {@link SyncPanelProps.sendPrompt} because it is a different act:
   * a prompt says something to the Session, while an answer decides something it
   * is waiting on, and only the machine that asked can say whether the question
   * was still open.
   */
  answerQuestion: (machineName: string, questionId: string, answers: RelayedAnswerItem[]) => Promise<boolean>
  /**
   * Send this console's decision on one relayed approval.
   *
   * Its own prop rather than a flag on {@link SyncPanelProps.answerQuestion},
   * because it is a different *kind* of act: an answer supplies information, while
   * this releases a tool call on another machine. The two also fail differently —
   * a lost race is the ordinary outcome of both, but a *refused* approval is a
   * decision the reader has to be told about.
   */
  decideApproval: (
    machineName: string,
    approvalId: string,
    decision: RelayedApprovalDecision,
  ) => Promise<boolean>
  /**
   * The feature-detected bridge to the shipped conversation renderer.
   *
   * Present on every build: it reports `supported === false` where the
   * retention seam does not exist, which is what keeps the hand-drawn pane below
   * in charge there.
   */
  official: OfficialBridgeFace
  /** Dispatch of the session-scoped child slot this panel declares. */
  renderSlot: RenderSlotLike
  /** The session-scope provider the child slot's declaration seats here. */
  SessionProvider: SessionProviderComponent
  /**
   * The takeover prompt, shared with the occurrence of the shipped composer stack
   * that draws the same card on the route where the shipped pane is the footer.
   */
  drafts: ComposerDrafts
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
  // but the panel is still showing it: the placeholder keeps the talk column —
  // and therefore its back button on a narrow window — reachable.
  const session: MirroredSession | undefined = mirrored ?? (open === undefined ? undefined : {
    sessionId: open.sessionId,
    title: open.sessionId,
    updatedAt: Date.now(),
    running: false,
    eventCount: 0,
    missingEvents: 0,
    holes: 0,
    behind: 0,
  })
  const online = open === undefined
    ? false
    : machines.find(candidate => candidate.machineName === open.machineName)?.online ?? false

  // Questions waiting in a Session other than the one on screen. The open
  // Session's own are rendered as cards inside its pane, next to the composer
  // they interrupt; these are only ever a pointer to somewhere else to look.
  const questions = state.questions ?? []
  const elsewhere = open === undefined
    ? questions
    : questions.filter(question => question.machineName !== open.machineName || question.sessionId !== open.sessionId)

  return (
    <div className={css.panel} data-open={open === undefined ? 'false' : 'true'} data-list={listHidden ? 'hidden' : 'shown'}>
      <aside className={css.listPane} aria-label={t('sessionsTitle')} aria-hidden={listHidden}>
        <div className={css.listHead}>
          <Input
            icon={<IconSearchOutlineRegular />}
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
                ×
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
                        // Two readings that mean opposite things, said apart: a
                        // hole inside the mirror is a repair that is owed, while
                        // being behind is what a live Session looks like — a
                        // running turn is always a few events ahead of the
                        // mirror. Showing one badge for both made every working
                        // Session look broken.
                        const gap = candidate.holes > 0
                          ? t('mirrorGapBadge', { n: candidate.holes })
                          : candidate.behind > 0
                            ? t('sessionBehind', { n: candidate.behind })
                            : undefined
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
                            aria-label={gap === undefined
                              ? `${t('openSession')}: ${candidate.title}`
                              : `${t('openSession')}: ${candidate.title} — ${gap}`}
                            title={candidate.title}
                            onClick={() => {
                              void props.openSession(group.machine.machineName, candidate.sessionId)
                            }}
                          >
                            <span className={css.treeSlot}>
                              {candidate.running && <StateDot state="ongoing" />}
                            </span>
                            <span className={css.rowTitle}>{candidate.title}</span>
                            {candidate.holes > 0 && (
                              <span className={css.gapBadge} title={t('mirrorGaps')}>
                                {t('mirrorGapBadge', { n: candidate.holes })}
                              </span>
                            )}
                            {candidate.holes === 0 && candidate.behind > 0 && (
                              <span className={css.rowTime} title={t('sessionBehindHint')}>
                                {t('sessionBehind', { n: candidate.behind })}
                              </span>
                            )}
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
        {/* Questions for a Session this reader is *not* looking at. The card
            itself can only appear in the pane of the Session that asked, so
            without this line a machine could wait out its whole TTL unseen. */}
        {elsewhere.length > 0 && (
          <QuestionElsewhere
            t={t}
            count={elsewhere.length}
            onShow={() => {
              const first = elsewhere[0]
              if (first !== undefined) void props.openSession(first.machineName, first.sessionId)
            }}
          />
        )}
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
              answerQuestion={props.answerQuestion}
              decideApproval={props.decideApproval}
              loadOlder={props.loadOlder}
              loadAllOlder={props.loadAllOlder}
              official={props.official}
              renderSlot={props.renderSlot}
              SessionProvider={props.SessionProvider}
              drafts={props.drafts}
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
          ? <IconGlobeOutlineRegular size={16} />
          : (props.open ? <IconFolderOpenRegular /> : <IconFolderCloseRegular />)}
      </span>
      <span className={`${css.treeSlot} ${css.treeChevron}`}>
        <IconTriangleRightFillRegular className={props.open ? css.arrowOpen : undefined} />
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
  /** Send this console's answer to a question the machine relayed. */
  answerQuestion: (machineName: string, questionId: string, answers: RelayedAnswerItem[]) => Promise<boolean>
  /** Send this console's decision on an approval the machine is blocked on. */
  decideApproval: (
    machineName: string,
    approvalId: string,
    decision: RelayedApprovalDecision,
  ) => Promise<boolean>
  /** Fetch the page of this Session that sits before the one held. */
  loadOlder: () => Promise<void>
  /**
   * Page all the way back to the log's start, so the footer can count the whole log.
   *
   * Its own prop rather than a flag on `loadOlder`: one page keeps the reader's place
   * (it is inserted above), while this one is a deliberate, slow, read-everything
   * action — a long Session is several round trips through the machine that owns it.
   */
  loadAllOlder: () => Promise<void>
  official: OfficialBridgeFace
  renderSlot: RenderSlotLike
  SessionProvider: SessionProviderComponent
  /** The takeover prompt, shared with the shipped composer stack's own occurrence. */
  drafts: ComposerDrafts
  listHidden: boolean
  toggleList: () => void
}): React.ReactElement {
  const { t, state, session } = props
  const [tab, setTab] = React.useState<'chat' | 'trajectory'>('chat')
  const body = React.useRef<HTMLDivElement | null>(null)
  /** The reading column, whose height is what growth moves. */
  const column = React.useRef<HTMLDivElement | null>(null)
  /** The seat the shipped conversation draws itself in, on the route that uses it. */
  const pane = React.useRef<HTMLDivElement | null>(null)
  /** Whether the reader is at the floor of the transcript. */
  const [atBottom, setAtBottom] = React.useState(true)
  /**
   * Whether the shipped pane's own scroller is at *its* top.
   *
   * The console's "older" row marks the top of a transcript page, and on the
   * hand-drawn route it lives inside this console's scroller so it travels with
   * the conversation. The shipped pane brings its own scroll body instead, so the
   * row cannot live in it: drawn beside the pane it would sit above the
   * conversation forever, offering history to a reader who is nowhere near the
   * end it belongs to. This is what puts it back where the row it stands in for
   * lives — visible at the top, gone once the reader is reading.
   */
  const [atPaneTop, setAtPaneTop] = React.useState(true)
  /** The shipped pane's own scroller, once found: read every commit, never re-searched. */
  const paneScroller = React.useRef<HTMLElement | null>(null)
  /**
   * The window and scroller as they stood at the previous commit.
   *
   * Read on every commit and written back after it, so a page arriving below the
   * window can be told apart from growth at the tail — and compensated for before
   * the browser paints.
   */
  const paneMetrics = React.useRef<PagingMetrics>({ first: undefined, top: 0, height: 0 })
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
  // Where the shipped pane's scroller is, tracked on the wrapper rather than on
  // its own handlers in the capture phase: a scroll event does not bubble, but it
  // does descend, so one listener here hears every scrollable inside the pane
  // without this console reaching into markup it does not own. Finding the
  // scroller is done once per pane (a fresh pane opens at its newest message, so
  // the answer is usually "not at the top") instead of on every frame.
  React.useEffect(() => {
    const host = pane.current
    if (host === null) return
    const scroller = findScroller(host)
    paneScroller.current = scroller
    if (scroller !== null) setAtPaneTop(scroller.scrollTop <= FOLLOW_THRESHOLD)
    // The pane's own content may not be laid out at the first commit, in which
    // case its scroller still looks like one whose content fits. One frame later
    // it is the real thing — and because the shipped conversation opens at its
    // newest message, learning that is the difference between a boundary row and
    // a permanent banner.
    const frame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => {
        const settled = findScroller(host)
        paneScroller.current = settled
        if (settled !== null) setAtPaneTop(settled.scrollTop <= FOLLOW_THRESHOLD)
      })
      : undefined
    const onScroll = (event: Event): void => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.scrollHeight <= target.clientHeight) return
      setAtPaneTop(target.scrollTop <= FOLLOW_THRESHOLD)
    }
    host.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      host.removeEventListener('scroll', onScroll, { capture: true })
    }
    // `state.transcript` rather than the rendered pane: this effect is declared
    // before the pane's own reference resolves, and the transcript is what its
    // existence depends on. A null ref simply means there is no pane to watch.
  }, [tab, state.open?.sessionId, state.transcript !== undefined])
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
  // The machine's own totals for this Session, when it states them. Preferred over
  // anything countable here, because what is here is what the mirror retained —
  // a window — and a footer computed from a window understates a long Session by
  // everything below it, no matter how far this console pages.
  const reportedStats = props.session.stats
  const coverage = React.useMemo(
    () => logCoverage(state.transcript?.events ?? []),
    [state.transcript],
  )
  // "The whole log" has to be true in one of exactly two ways: the machine stated
  // its own whole-log totals, or this console holds a contiguous run and the chain
  // offered nothing older. The chain alone used to be enough, and it claimed the
  // whole log while holding 849 of the machine's 956 steps.
  const wholeLog = reportedStats !== undefined
    || (state.transcript?.hasMore === false && coverage.gaps === 0)

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

  const delivery = state.delivery
  // The shipped conversation, when this DSH build can retain the open Session,
  // the mirror has something to replace it with, and the renderer gave this
  // panel the seats the child slot's declaration earns it. The reference must
  // exist before the pane renders: the SessionProvider binds it, and an absent
  // one would inherit whatever local Session the shell has selected.
  const shipped = props.official.supported
    && props.renderSlot !== undefined
    && props.SessionProvider !== undefined
    && state.transcript !== undefined
    ? props.official.referenceFor(props.machineName, session.sessionId)
    : undefined
  /**
   * Whether the shipped pane is drawing this Session's footer right now.
   *
   * The chat tab on a build that renders the retained Session: there the console
   * hides only the shipped input capsule, the shipped statistics row and context
   * meter stay mounted below it, and this console's own card rides the shipped
   * composer stack (`conversation.input.dock`) instead of the footer block below.
   * Everything else — the trajectory tab, which the shipped content does not draw,
   * and a build with no retention seam at all — keeps the console's own card and
   * its own status row, which is also the only footer those two have.
   */
  const shippedFooter = tab === 'chat' && shipped !== undefined
  /**
   * Whether the scope badge is also the control that changes what it states.
   *
   * Only while the console is the one counting: the machine's own totals are
   * already over the whole log, so there is nothing for paging to do, and a click
   * that silently did nothing would be worse than no click at all.
   */
  const scopeActionable = shippedFooter && reportedStats === undefined && !wholeLog
  /**
   * The totals every footer on this page states.
   *
   * One binding, read by the console's own status row and published to the shipped
   * footer's projection store, so the two can never disagree about which scope
   * they are reporting: the machine's whole-log answer when it states one, this
   * console's count over what it holds otherwise.
   */
  const totals = reportedStats ?? chrome.stats
  // Hand the shipped footer the numbers it would otherwise have no source for.
  //
  // The shipped statistics row and context meter read *projections*, which only a
  // Host computes, and this Session's Host has never heard of it — so without this
  // the row would fold the window the mirror holds and the meter would render
  // nothing at all. Laid out rather than effected so the values are in the store
  // before the browser paints: the shipped components render once with whatever is
  // there, and a plain effect would put the empty fold on screen for a frame. The
  // floor is the newest durable sequence held; `nextWatermark` owns what the store
  // does with it.
  React.useLayoutEffect(() => {
    if (shipped === undefined) return
    props.official.publishFooter(
      projectionRecord(footerProjections(totals)),
      coverage.last ?? 0,
    )
  }, [props.official, shipped, totals, coverage.last])
  // Read on every render of an open pane: the low end is what moves when older
  // history is paged in, and a frame arriving is what re-renders this panel.
  const paneRange = shipped === undefined ? undefined : props.official.windowRange()
  // Keep the reader's place when this console pages older history into the pane.
  //
  // The shipped chat arms its own paging anchor before it asks for a page
  // (`use-chat-navigation.ts` — `beginPaging()` + `pauseFollowing()` + `loadOlder()`),
  // and its viewport restores that anchor once the page commits. This console
  // pages through its own channel, so nothing arms it: the inserted page moves the
  // content down while the scroller stays put, and the reader is shown the top of
  // the newly inserted range. Laid out here so the correction lands before the
  // browser paints. `pagingScrollTop` holds the conditions, because compensating
  // at the wrong moment would be a new bug rather than a fix.
  React.useLayoutEffect(() => {
    const scroller = paneScroller.current
    const before = paneMetrics.current
    const first = paneRange?.first
    if (scroller === null) {
      paneMetrics.current = { first, top: 0, height: 0 }
      return
    }
    const target = pagingScrollTop(
      before,
      { first, top: scroller.scrollTop, height: scroller.scrollHeight, clientHeight: scroller.clientHeight },
      FOLLOW_THRESHOLD,
    )
    if (target !== undefined) scroller.scrollTop = target
    paneMetrics.current = { first, top: scroller.scrollTop, height: scroller.scrollHeight }
  })
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
            icon={<IconPanelLeftOutlineRegular />}
            aria-label={props.listHidden ? t('listShow') : t('listHide')}
            onClick={props.toggleList}
          />          <Button
            variant="ghost"
            size="sm"
            className={css.narrowOnly}
            icon={<IconChevronLeftOutlineRegular />}
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
          {session.holes > 0 && (
            <span className={css.gapBadge} title={t('mirrorGaps')}>
              {t('mirrorGapBadge', { n: session.holes })}
            </span>
          )}
          {session.holes === 0 && session.behind > 0 && (
            <span className={css.routeBadge} title={t('sessionBehindHint')}>
              {t('sessionBehind', { n: session.behind })}
            </span>
          )}
          {/* Only when the route is actually named: `原件 · {route}` with no route
              renders a dangling separator, which reads as a stray dot glued to the
              badge rather than as "this build has no shipped pane". */}
          {props.official.supported && props.official.route !== undefined && (
            <span
              className={css.routeBadge}
              // The window's extent is a diagnostic — it is how paging reaching the
              // pane is visible from outside — so it belongs in the tooltip, not
              // appended to the label, where it read as a dot and two numbers
              // stuck onto the route's name.
              title={paneRange === undefined
                ? t('paneRouteHint')
                : `${t('paneRouteHint')} · ${t('paneWindow', { from: paneRange.first, to: paneRange.last })}`}
            >
              {t('paneRoute', { route: props.official.route })}
            </span>
          )}
          {/* Where the numbers come from. The footer itself is the product's own
              now (or the console's own row on the two seats that have no shipped
              footer), and neither can say which log its figures counted — the
              shipped one has no place for it, and the console's own row states it
              in the document order a reader scanning the header has already left.
              So the statement lives here, beside the other facts about this pane,
              and it is also where the one action that changes it lives: while the
              console is counting its own window, the badge is the control that
              pages the log back to its start.

              A `button` in both states, but `aria-disabled` rather than `disabled`
              when there is nothing to do: a disabled control swallows the pointer,
              and the tooltip is the only place the authoritative case explains
              itself. */}
          {shippedFooter && (
            <button
              type="button"
              className={scopeActionable
                ? `${css.scopeBadge} ${css.scopeBadgeAction}`
                : css.scopeBadge}
              {...(scopeActionable ? {} : { 'aria-disabled': true })}
              title={reportedStats !== undefined
                ? t('statusAuthoritativeHint')
                : coverage.gaps > 0
                  ? `${t('statusScopeHint')} · ${t('statusScopeGap', { n: coverage.gaps })}`
                  : t('statusCountHint')}
              onClick={scopeActionable ? () => { void props.loadAllOlder() } : undefined}
            >
              {reportedStats !== undefined || wholeLog ? t('statusWholeLog') : t('statusCount')}
            </button>
          )}
          <span className={css.viewSpacer} />

          <ChromeChips t={t} chrome={chrome} context={reportedStats?.context ?? chrome.context} />
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
        : shipped !== undefined
          ? (
            // The shipped conversation draws the Session, its own scroll body,
            // and its own composer: this pane hands it the reference and nothing
            // else. The one exception is a route that drives the window itself —
            // there the shipped composer would carry its prompt to a Host that
            // has never heard of this Session, so its seat is hidden and the
            // console's own takeover composer stands in.
            <>
              {/* The shipped conversation's own older-end control asks the Host,
                  which has never heard of this Session, so the window it is given
                  never claims more. Paging is this console's own road — it reads
                  the older page over the sync link and hands it to the same
                  window — and this is its control. Shown only while the reader is
                  at the top of that window: it marks where the fetched range
                  begins, so beside the pane it would sit above the conversation
                  forever instead of at the end it belongs to. */}
              {state.transcript?.hasMore === true && atPaneTop && (
                <div className={css.olderRow}>
                  <button
                    type="button"
                    className={css.olderButton}
                    disabled={state.loadingOlder}
                    onClick={() => { void props.loadOlder() }}
                  >
                    {state.loadingOlder ? t('loadingOlder') : t('loadOlder')}
                  </button>
                </div>
              )}
              <div
                ref={pane}
                className={props.official.composerOwned ? `${css.officialPane} ${css.drivesWindow}` : css.officialPane}
              >
                <props.SessionProvider session={shipped}>
                  {props.renderSlot(OFFICIAL_SLOT, {})}
                </props.SessionProvider>
              </div>
            </>
          )
          : (
            <div className={css.viewScroll} ref={body}>
              <div className={css.viewColumn} ref={column}>
                {state.error !== undefined && <div className={css.error}>{state.error}</div>}
                {/* The mirror serves the newest window, so the older end is a
                    control rather than a gap: without it a long Session would
                    simply look like it began mid-conversation. */}
                {state.transcript?.hasMore === true && (
                  <div className={css.olderRow}>
                    <button
                      type="button"
                      className={css.olderButton}
                      disabled={state.loadingOlder}
                      onClick={() => { void props.loadOlder() }}
                    >
                      {state.loadingOlder ? t('loadingOlder') : t('loadOlder')}
                    </button>
                  </div>
                )}
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
                    <IconChevronDownOutlineRegular />
                  </button>
                </div>
              )}
            </div>
          )}
      {/* The questions this Session is waiting on, offered to whoever is reading
          it here as well as to whoever is at the machine. Above the composer
          because that is what they interrupt: the model is stopped mid-turn until
          one of the two answers, and the answer this reader gives travels to the
          machine rather than to this Host. */}
      {(state.questions ?? [])
        .filter(question => question.machineName === props.machineName && question.sessionId === session.sessionId)
        .map(question => (
          <QuestionCard
            key={question.questionId}
            t={t}
            question={question}
            {...(state.answers[question.questionId] === undefined
              ? {}
              : { answer: state.answers[question.questionId] })}
            onAnswer={(answers) => {
              void props.answerQuestion(question.machineName, question.questionId, answers)
            }}
          />
        ))}
      {/* The approvals this Session's machine is blocked on. Drawn next to the
          questions and for the same reason, but a reader should know what is
          different about them: a question is asking *them* something, while this is
          asking them to release something the machine's own preset was gating. So
          the card shows the call itself and where to refuse. */}
      {(state.approvals ?? [])
        .filter(approval => approval.machineName === props.machineName && approval.sessionId === session.sessionId)
        .map(approval => (
          <ApprovalCard
            key={approval.approvalId}
            t={t}
            approval={approval}
            rows={rows}
            {...(state.decisions[approval.approvalId] === undefined
              ? {}
              : { decision: state.decisions[approval.approvalId] })}
            onDecide={(decision) => {
              void props.decideApproval(approval.machineName, approval.approvalId, decision)
            }}
          />
        ))}
      {/* The console's own composer block, and its own footer, on every seat that
          has no shipped one: the trajectory tab (which the shipped content does not
          draw) and a build with no retention seam. On the chat tab of a build that
          draws the retained Session it is *also* mounted — and hidden by CSS — for
          one reason only: the card that takes over lives inside the shipped
          composer stack, an occurrence whose mounting rules this panel cannot see
          (`ConversationContent` renders that seat only while it can resolve the
          Session's input shell). Keeping this one mounted means an unusable
          composer is not a state this page can reach: the shipped card wins while
          it is there, and this one is what is left if it never arrives.
          `data-sync-composer` marks the shipped copy; the rule that hides this one
          is on `.officialPane:has(...)` in `sync.module.css`. */}
      <div className={css.composerRoot}>
        <MirrorComposer
          t={t}
          drafts={props.drafts}
          draftKey={draftKey(props.machineName, session.sessionId)}
          machineName={props.machineName}
          delivery={delivery}
          online={props.online}
          send={props.sendPrompt}
        />
        {/* The machine's totals when it states them, this console's count otherwise. */}
        <StatusRow
          t={t}
          stats={totals}
          context={reportedStats?.context ?? chrome.context}
          all={wholeLog}
          gaps={coverage.gaps}
          authoritative={reportedStats !== undefined}
          onCount={() => { void props.loadAllOlder() }}
        />
      </div>
    </>
  )
}

/**
 * The header's right-hand cluster: the context-occupancy ring, and the model,
 * preset and subagent facts the log reports.
 *
 * Every one of these is a **reading**, not a control: the mirror can see what
 * the owning machine is doing and cannot change it. The shipped session header
 * carries selectors in these seats; this console shows the same facts without
 * pretending a click would do something.
 *
 * The ring is handed its reading rather than reading the log again, because the
 * footer states the same fact: one scope for one number, or the header and the
 * footer of the same page would print two percentages for one window.
 */
function ChromeChips({ t, chrome, context }: {
  t: SessionSyncTranslate
  chrome: SessionChrome
  /** Context occupancy, already resolved to the scope the footer reports. */
  context?: SessionContext
}): React.ReactElement {
  const { model, policy, subagents } = chrome
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
function StatusRow({ t, stats, context, all, gaps, authoritative, onCount }: {
  t: SessionSyncTranslate
  stats: SessionStats
  /** The machine's own occupancy reading, when it states one. */
  context?: SessionContext
  /** True when the held events are contiguous *and* nothing older was offered. */
  all: boolean
  /** Ordinals missing between the lowest and highest held sequence. */
  gaps: number
  /**
   * Whether these totals are the machine's own whole-log answer.
   *
   * Then the scope needs no label and the paging control has nothing left to do:
   * this console's window is not what the numbers came from, so neither "整份日志"
   * nor a button that walks the window back can change them.
   */
  authoritative: boolean
  /** Page back to the log's start, so they can become so. */
  onCount: () => void
}): React.ReactElement | null {
  if (stats.turns === 0 && stats.steps === 0) return null
  // Without the machine's totals these count the events this console has fetched,
  // and saying so is what keeps two footers from reading as one measurement
  // disagreeing — which is how this was reported in the first place.
  const scope = authoritative ? '' : all ? t('statusWholeLog') : t('statusLoaded')
  // The gaps are counted here rather than trusted from the chain: `hasMore === false`
  // only says nothing older was offered, and a console that held 849 of 956 steps still
  // showed "整份日志" until this check existed.
  const gapNote = gaps > 0 && !authoritative ? ` · ${t('statusGaps', { n: String(gaps) })}` : ''
  const head = scope === '' ? '' : `${scope}${gapNote} `
  const parts: string[] = [`${head}${String(stats.turns)} ${t('statusTurns')}`, `${String(stats.steps)} ${t('statusSteps')}`]
  if (stats.outputPerSecond !== undefined) parts.push(t('statusOutputRate', { tps: String(stats.outputPerSecond) }))
  // The occupancy the shipped composer shows below its card, in the footer for the
  // same reason everything else is here: a mirrored Session draws this console's
  // input bar, so the shipped meter's own seat is not mounted for it. The reading is
  // the meter's (`~used / window`), and it comes from the machine when it states one
  // — a console holding part of a log cannot see the newest request's window.
  if (context !== undefined) parts.push(`${t('statusContext')} ${String(context.percent)}%`)
  const total = stats.usage.inputTokens + stats.usage.cacheReadTokens + stats.usage.outputTokens
  const tail: string[] = []
  if (total > 0) tail.push(t('statusTotalTokens', { total: compactTokens(total) }))
  if (stats.cacheHitPercent !== undefined) tail.push(`${t('statusCacheHit')} ${String(stats.cacheHitPercent)}%`)
  return (
    <div className={css.statusRow} title={authoritative ? t('statusAuthoritativeHint') : t('statusScopeHint')}>
      <span>{parts.join(' · ')}</span>
      {tail.length > 0 && <span>{tail.join(' · ')}</span>}
      {context !== undefined && (
        <span title={`~${compactTokens(context.used)} / ${compactTokens(context.window)}`}>
          {t('statusContextDetail', { used: compactTokens(context.used), window: compactTokens(context.window) })}
        </span>
      )}
      {!authoritative && (
        <button
          type="button"
          title={t('statusCountHint')}
          disabled={all}
          onClick={onCount}
        >
          {all ? t('statusWholeLog') : t('statusCount')}
        </button>
      )}
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
    // A turn's actions belong to its closing message: one answer, one copy
    // button, however many steps the turn took. A turn that is still running has
    // no closing message yet, so its narration stays chrome-free — the shipped
    // footer "never appears and then moves" (chat-view.client.spec:
    // 'withholds assistant IconActions while the turn is still running'). The
    // previous turn keeps its seat meanwhile, and the recency rule below is what
    // retires it to hover.
    const settled = row.tail && row.facts?.running !== true
    return (
      <div
        className={css.assistantRow}
        data-chat-flow-kind="assistant"
        data-chat-turn={row.turn}
        // Shipped semantics (ui-chat TurnTailNodeView): the newest turn's
        // actions are always there, an older turn's appear on hover or focus.
        {...settled
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
        {settled && (
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
 * row plus the two turn-stat pills that sit in it.
 *
 * The copy feedback is local because the primitive that owns it
 * (`useCopyFeedback`) is not part of the published surface; the behaviour is the
 * shipped one: a one-second check swap, and no second write while it shows. Both
 * pills are the shipped ones (`stat-panels.tsx`): a click opens their detail
 * dialog in a portal above the trigger.
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
  return (
    <div className={place === 'user' ? actionsCss.actions : `${actionsCss.actions} ${css.messageActions}`}>
      {place === 'user' && clock}
      {text !== '' && (
        <Tooltip label={label} side="bottom">
          <button type="button" className={actionsCss.action} aria-label={label} onClick={onCopy}>
            {copied ? <IconCheckOutlineRegular /> : <IconCopyOutlineRegular />}
          </button>
        </Tooltip>
      )}
      {facts !== undefined && total > 0 && (
        <TurnUsagePill t={t} usage={facts.usage} metrics={facts.metrics} />
      )}
      {facts !== undefined && facts.runMs !== undefined && (
        <TurnTimePill t={t} runMs={facts.runMs} metrics={facts.metrics} />
      )}
      {place === 'assistant' && clock}
    </div>
  )
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
        icon={<IconThinkOutlineRegular size={14} />}
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
      return <IconBrowseOutlineRegular size={14} />
    case 'edit':
      return <IconEditOutlineRegular size={14} />
    case 'search':
      return <IconSearchOutlineRegular size={14} />
    case 'terminal':
      return <IconApiOutlineRegular size={14} />
    case 'globe':
      return <IconGlobeOutlineRegular size={14} />
    case 'question':
      return <IconQuestionOutlineRegular size={14} />
    case 'plan':
      return <IconChecklistOutlineRegular size={14} />
    case 'share':
      return <IconShareOutlineRegular size={14} />
    default:
      // No family claims it: the shipped generic card leads with this same
      // neutral mark (GenericToolCard's own fallback).
      return <IconSparkleRegular size={14} />
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
