/**
 * The centre panel: the server's console over every machine that publishes here.
 *
 * Two panes and a three-level tree. The list groups by machine, then by the
 * directory a Session runs in, then lists the Sessions themselves 鈥?the shape
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
  DisclosureRow,
  FishLogo,
  Input,
  MarkdownText,
  StateDot,
  Tooltip,
  IconApiOutline14,
  IconBrowseOutline16,
  IconChecklistOutline14,
  IconChevronLeftOutline14,
  IconEditOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  IconGlobeOutline14,
  IconQuestionOutline14,
  IconRightUpOutline16,
  IconSearchOutline16,
  IconShareOutline16,
  IconSparkle16,
  IconThinkOutline14,
  IconTriangleRightFill14,
  relativeTime,
  type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MirroredMachine, MirroredSession } from '../shared/protocol.ts'
import type { CommandDelivery, SyncClientSnapshot } from './api.ts'
import type { SessionSyncKey } from './locales.ts'
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
import { toRows, type ToolRow, type TranscriptRow } from './transcript.ts'
import { toolPresentation, type ToolGlyph } from './tool-presentation.ts'
import css from './sync.module.css'

/** Props the renderer binds for the `main` cell. */
export interface SyncPanelProps {
  /** Localized copy, from the registration's `locale` namespace. */
  t: (key: SessionSyncKey) => string
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

  const machines = state.state.machines
  const open = state.open
  const groups = React.useMemo(() => buildTree(machines, query), [machines, query])
  const searching = query.trim() !== ''
  // A search is a question about the whole tree, so nothing stays folded while
  // one is being asked: a match inside a collapsed machine would look like no
  // match at all.
  const isOpen = (key: string): boolean => (searching ? true : collapsed[key] !== true)
  const toggle = (key: string): void => {
    setCollapsed(current => ({ ...current, [key]: current[key] !== true }))
  }

  const mirrored = open === undefined
    ? undefined
    : machines
      .find(candidate => candidate.machineName === open.machineName)
      ?.sessions.find(candidate => candidate.sessionId === open.sessionId)
  // A Session that was un-published while it was open has no mirror row left,
  // but the panel is still showing it: the placeholder keeps the talk column 鈥?  // and therefore its back button on a narrow window 鈥?reachable.
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
    <div className={css.panel} data-open={open === undefined ? 'false' : 'true'}>
      <aside className={css.listPane} aria-label={t('sessionsTitle')}>
        <div className={css.listHead}>
          <Input
            icon={<IconSearchOutline16 />}
            className={css.inputWrap}
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
                  onToggle={() => { toggle(machineKey) }}
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
                        onToggle={() => { toggle(projectKey) }}
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
 * A machine wears the globe its sidebar panel row uses — the two are the same
 * thing seen from two places — while a directory keeps the folder the workspace
 * browser gives it. Both still swap to the expand arrow on hover, because that
 * arrow is the only affordance saying the row folds.
 */
function TreeRow(props: {
  level: 0 | 1
  icon: 'machine' | 'project'
  open: boolean
  dim?: boolean
  label: string
  trailing: string
  onToggle: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      role="treeitem"
      aria-expanded={props.open}
      aria-label={props.label}
      data-level={props.level}
      className={props.dim === true ? `${css.treeRow} ${css.treeRowDim}` : css.treeRow}
      onClick={props.onToggle}
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
}

/**
 * One mirrored Session opened for reading and takeover.
 *
 * The snapshot arrives as a prop rather than being re-read here: the renderer's
 * generated `use<Name>` hook belongs to the registered component, and a second
 * call site in a child would depend on how that binding is cached.
 */
function Conversation(props: {
  t: (key: SessionSyncKey) => string
  state: SyncClientSnapshot
  session: MirroredSession
  machineName: string
  online: boolean
  closeSession: () => void
  sendPrompt: (text: string) => Promise<boolean>
}): React.ReactElement {
  const { t, state, session } = props
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [tab, setTab] = React.useState<'chat' | 'trajectory'>('chat')
  const body = React.useRef<HTMLDivElement | null>(null)
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
  // MarkdownText caches a streaming render against the labels object's identity,
  // so a fresh object on every render would discard that cache each time.
  const labels = React.useMemo(
    () => ({
      code: { copyLabel: t('copyCode'), copiedLabel: t('copiedCode') },
      footnotes: t('footnotes'),
    }),
    [t],
  )

  // Follow the tail as events arrive, which is the whole point of watching a
  // Session that is running somewhere else.
  React.useEffect(() => {
    const element = body.current
    if (element === null) return
    element.scrollTop = element.scrollHeight
  }, [rows.length])

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
          <Button
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
            <div className={css.viewColumn}>
              {state.error !== undefined && <div className={css.error}>{state.error}</div>}
              {state.transcript === undefined && !state.loadingTranscript
                ? <p className={css.empty}>{t('transcriptGone')}</p>
                : state.loadingTranscript
                  ? <p className={css.empty}>{t('transcriptLoading')}</p>
                  : rows.length === 0
                    ? <p className={css.empty}>{t('transcriptEmpty')}</p>
                    : rows.map(row => <TranscriptLine key={row.key} t={t} row={row} labels={labels} />)}
            </div>
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
 * The header's right-hand cluster:上下文占用率 ring, and the model, preset and
 * subagent facts the log reports.
 *
 * Every one of these is a **reading**, not a control: the mirror can see what
 * the owning machine is doing and cannot change it. The shipped session header
 * carries selectors in these seats; this console shows the same facts without
 * pretending a click would do something.
 */
function ChromeChips({ t, chrome }: {
  t: (key: SessionSyncKey) => string
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
  t: (key: SessionSyncKey) => string
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
  t: (key: SessionSyncKey) => string
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
 * It is the client's own new-session hero — the fish, the headline, the preview
 * badge — copied to the figure (ui-conversation HeroShell), because an empty
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
function TranscriptLine({ t, row, labels }: {
  t: (key: SessionSyncKey) => string
  row: TranscriptRow
  labels: MarkdownLabels
}): React.ReactElement {
  if (row.kind === 'user') {
    return (
      <div className={css.userRow}>
        <div className={css.bubble}>{row.text}</div>
      </div>
    )
  }
  if (row.kind === 'assistant') {
    return (
      <div className={css.assistantRow}>
        {row.reasoning !== '' && <ReasoningRow t={t} reasoning={row.reasoning} />}
        {row.text !== '' && <MarkdownText text={row.text} labels={labels} />}
      </div>
    )
  }
  return <ToolCallRow t={t} row={row} />
}

/** One assistant reasoning block, folded away by default. */
function ReasoningRow({ t, reasoning }: {
  t: (key: SessionSyncKey) => string
  reasoning: string
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  return (
    <DisclosureRow
      icon={<IconThinkOutline14 />}
      title={t('reasoning')}
      open={open}
      expandable
      expandOnRowClick
      onToggle={() => { setOpen(current => !current) }}
      className={css.thinkRow}
      titleClassName={css.thinkTitle}
    >
      <div className={css.reasoning}>{reasoning}</div>
    </DisclosureRow>
  )
}

/** One tool call and its result, folded into a single row with an IN/OUT card. */
function ToolCallRow({ t, row }: {
  t: (key: SessionSyncKey) => string
  row: ToolRow
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [resultOpen, setResultOpen] = React.useState(false)
  const presentation = toolPresentation(row.name)
  const generic = presentation.glyph === 'generic' && presentation.wire !== undefined

  // A family row is titled with the family's word and its own gist below, and
  // keeps the request and the result in one card. The shipped client's generic
  // card instead spends two rows — the call, then its result — so this does the
  // same for a tool no family claims, and only then.
  const label = presentation.labelKey === undefined
    ? (row.name === '' ? t('toolResult') : row.name)
    : t(presentation.labelKey)
  const summary = presentation.wire === undefined
    ? row.summary
    : [presentation.wire, row.summary].filter(part => part !== '').join(' · ')

  const glyph = (): React.ReactElement => (
    <span className={row.isError ? `${css.toolGlyph} ${css.toolGlyphError}` : css.toolGlyph}>
      <ToolGlyphIcon glyph={presentation.glyph} />
    </span>
  )
  const argumentsCard = row.argumentsText === '' ? undefined : (
    <div className={css.ioCard}>
      <div className={css.ioSection}>
        <span className={css.ioLabel}>{t('toolArguments')}</span>
        <span className={css.ioText}>{row.argumentsText}</span>
      </div>
    </div>
  )

  if (generic) {
    return (
      <>
        <DisclosureRow
          icon={glyph()}
          title={label}
          open={open}
          expandable
          expandOnRowClick
          onToggle={() => { setOpen(current => !current) }}
          className={toolRowClass(row.pending)}
          titleClassName={css.toolName}
          collapsedContent={<span className={css.toolSummary}>{summary}</span>}
        >
          {argumentsCard}
        </DisclosureRow>
        {row.pending
          ? null
          : (
            <DisclosureRow
              icon={<span className={css.toolGlyph}><StateDot state={row.isError ? 'error' : 'done'} /></span>}
              title={t('toolResult')}
              open={resultOpen}
              expandable
              expandOnRowClick
              onToggle={() => { setResultOpen(current => !current) }}
              className={css.toolRow}
              titleClassName={css.toolName}
              collapsedContent={(
                <span className={css.toolSummary}>{timeLabel(row.time, t)}</span>
              )}
            >
              <div className={css.ioCard}>
                <div className={css.ioSection}>
                  <span className={css.ioLabel}>{t('toolResult')}</span>
                  {row.resultText === ''
                    ? <span className={css.ioText}>{t('toolNoOutput')}</span>
                    : (
                      <span className={row.isError ? `${css.ioText} ${css.ioTextError}` : css.ioText}>
                        {row.resultText}
                      </span>
                    )}
                </div>
              </div>
            </DisclosureRow>
          )}
      </>
    )
  }

  return (
    <DisclosureRow
      icon={glyph()}
      title={label}
      open={open}
      expandable
      expandOnRowClick
      onToggle={() => { setOpen(current => !current) }}
      className={toolRowClass(row.pending)}
      titleClassName={css.toolName}
      collapsedContent={(
        <>
          <span className={css.toolSep} />
          <span className={css.toolSummary}>
            {summary !== '' ? summary : timeLabel(row.time, t)}
          </span>
        </>
      )}
    >
      <div className={css.ioCard}>
        {row.argumentsText !== '' && (
          <>
            <div className={css.ioSection}>
              <span className={css.ioLabel}>{t('toolArguments')}</span>
              <span className={css.ioText}>{row.argumentsText}</span>
            </div>
            <div className={css.ioDivider} />
          </>
        )}
        <div className={css.ioSection}>
          <span className={css.ioLabel}>{t('toolResult')}</span>
          {row.resultText === ''
            ? <span className={css.ioText}>{row.pending ? t('toolRunning') : t('toolNoOutput')}</span>
            : (
              <span className={row.isError ? `${css.ioText} ${css.ioTextError}` : css.ioText}>
                {row.resultText}
              </span>
            )}
        </div>
      </div>
    </DisclosureRow>
  )
}

/**
 * A tool row's class: a call in flight carries the sweep the shipped row uses
 * for the same state, and every other row carries the plain one.
 * @param running - whether the call is still waiting for its result.
 * @returns the row's class names.
 */
function toolRowClass(running: boolean): string {
  return running ? `${css.toolRow} ${css.toolRowRunning}` : css.toolRow
}

/**
 * The glyph a tool family leads with — the same mark the shipped toolview for
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
  for (const machine of machines) {
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
      projects: [...directories].map(([cwd, members]) => ({ cwd, sessions: members })),
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
