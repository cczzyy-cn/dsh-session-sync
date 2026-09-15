/**
 * The centre panel: the server's console over every machine that publishes here.
 *
 * Three panes, because the job has three steps: pick a machine, pick one of its
 * Sessions, then read it and take it over. On a wide column all three are
 * visible at once, so the list never has to be re-navigated to see what a
 * Session is doing; below 960px the same DOM becomes a drill-down, and the two
 * back buttons that only exist in that mode are hidden by CSS rather than by a
 * measured width.
 *
 * Registered into the `main` slot under the same key as this plugin's sidebar
 * row, so the frame's panel selector and the sidebar entry resolve to the same
 * place without either knowing about the other.
 */
import * as React from 'react'
import {
  Button,
  DisclosureRow,
  Input,
  MarkdownText,
  Pill,
  StateDot,
  Tag,
  IconChevronLeftOutline14,
  IconSearchOutline16,
  IconThinkOutline14,
  relativeTime,
  type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MirroredMachine, MirroredSession } from '../shared/protocol.ts'
import type { CommandDelivery, SyncClientSnapshot } from './api.ts'
import type { SessionSyncKey } from './locales.ts'
import { toRows, type ToolRow, type TranscriptRow } from './transcript.ts'
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

/** One machine's Sessions, grouped by the directory they run in. */
interface SessionGroup {
  cwd: string
  sessions: MirroredSession[]
}

/**
 * Render the sync panel.
 * @param props - copy, the snapshot hook, and the actions.
 * @returns the panel.
 */
export function SyncPanel(props: SyncPanelProps): React.ReactElement {
  const state = props.useSync(snapshot => snapshot)
  const { t } = props
  const [selected, setSelected] = React.useState<string | undefined>(undefined)
  const [query, setQuery] = React.useState('')
  const [runningOnly, setRunningOnly] = React.useState(false)

  const machines = state.state.machines
  const open = state.open
  // Opening a Session from the sidebar arrives with no machine selection, so the
  // panes follow the Session rather than showing an unrelated machine's list.
  const openMachine = open?.machineName
  React.useEffect(() => {
    if (openMachine !== undefined) setSelected(openMachine)
  }, [openMachine])
  const active = selected ?? openMachine ?? machines[0]?.machineName
  const machine = machines.find(candidate => candidate.machineName === active)
  const sessions = React.useMemo(
    () => filterSessions(machine, query, runningOnly),
    [machine, query, runningOnly],
  )
  const groups = React.useMemo(() => groupByCwd(sessions), [sessions])
  const step = open !== undefined ? 'detail' : selected !== undefined ? 'sessions' : 'machines'
  const mirrored = open === undefined
    ? undefined
    : (machine?.sessions.find(candidate => candidate.sessionId === open.sessionId)
      ?? machines
        .find(candidate => candidate.machineName === open.machineName)
        ?.sessions.find(candidate => candidate.sessionId === open.sessionId))
  // A Session that was un-published while it was open has no mirror row left,
  // but the panel is still showing it: the placeholder keeps the detail pane —
  // and therefore its back button — reachable instead of stranding a narrow
  // reader in a pane with no way out.
  const session: MirroredSession | undefined = mirrored ?? (open === undefined ? undefined : {
    sessionId: open.sessionId,
    title: open.sessionId,
    updatedAt: Date.now(),
    running: false,
    eventCount: 0,
  })

  return (
    <div className={css.console} data-step={step}>
      <aside className={css.machinePane} aria-label={t('machinesTitle')}>
        <div className={css.paneHead}>
          <span className={css.paneTitle}>{t('machinesTitle')}</span>
          <span className={css.statusLine}>{roleLine(state, t)}</span>
        </div>
        <div className={css.paneBody}>
          {!state.ready && <p className={css.empty}>{t('sessionsLoading')}</p>}
          {state.ready && state.state.role !== 'server' && (
            <p className={css.empty}>{t('panelEmptyClient')}</p>
          )}
          {state.ready && state.state.role === 'server' && machines.length === 0 && (
            <p className={css.empty}>{t('panelEmptyServer')}</p>
          )}
          {machines.map(candidate => (
            <button
              key={candidate.machineName}
              type="button"
              className={candidate.machineName === active ? `${css.machineRow} ${css.machineRowActive}` : css.machineRow}
              aria-current={candidate.machineName === active ? 'true' : undefined}
              onClick={() => { setSelected(candidate.machineName) }}
            >
              <StateDot state={candidate.online ? 'done' : 'idle'} />
              <span className={css.machineRowText}>
                <span className={css.machineRowName}>{candidate.machineName}</span>
                <span className={css.machineRowMeta}>{machineMeta(candidate, t)}</span>
              </span>
              <Tag tone="quiet">{String(candidate.sessions.length)}</Tag>
            </button>
          ))}
        </div>
      </aside>

      <section className={css.sessionPane} aria-label={t('sessionsTitle')}>
        <div className={css.paneHead}>
          <span className={css.paneRow}>
            <Button
              variant="ghost"
              size="sm"
              className={css.narrowOnly}
              icon={<IconChevronLeftOutline14 />}
              aria-label={t('back')}
              onClick={() => { setSelected(undefined) }}
            />
            <span className={css.paneTitle}>{machine?.machineName ?? t('sessionsTitle')}</span>
          </span>
          <Input
            icon={<IconSearchOutline16 />}
            className={css.inputWrap}
            value={query}
            placeholder={t('searchSessions')}
            aria-label={t('searchSessions')}
            onChange={(event) => { setQuery(event.target.value) }}
          />
          <span className={css.filters}>
            <Pill active={!runningOnly} onClick={() => { setRunningOnly(false) }}>{t('filterAll')}</Pill>
            <Pill active={runningOnly} onClick={() => { setRunningOnly(true) }}>{t('filterRunning')}</Pill>
          </span>
        </div>
        <div className={css.paneBody}>
          {machine === undefined
            ? <p className={css.empty}>{t('selectMachine')}</p>
            : sessions.length === 0
              ? <p className={css.empty}>{query.trim() === '' && !runningOnly ? t('machineNoSessions') : t('searchEmpty')}</p>
              : groups.map(group => (
                <React.Fragment key={group.cwd === '' ? '·' : group.cwd}>
                  {groups.length > 1 && (
                    <div className={css.groupLabel} title={group.cwd}>{group.cwd === '' ? t('noCwd') : group.cwd}</div>
                  )}
                  {group.sessions.map(session => (
                    <button
                      key={session.sessionId}
                      type="button"
                      className={css.listRow}
                      aria-label={`${t('openSession')}: ${session.title}`}
                      onClick={() => { void props.openSession(machine.machineName, session.sessionId) }}
                    >
                      <span className={css.listRowTop}>
                        {session.running && <StateDot state="ongoing" />}
                        <span className={css.listRowTitle}>{session.title}</span>
                        <span className={css.listRowTime}>
                          {session.running ? t('sessionRunning') : timeLabel(session.updatedAt, t)}
                        </span>
                      </span>
                      <span className={css.listRowMeta}>{sessionMeta(session, t)}</span>
                    </button>
                  ))}
                </React.Fragment>
              ))}
        </div>
      </section>

      <section className={css.detailPane} aria-label={t('panelTitle')}>
        {open === undefined || session === undefined
          ? <p className={css.empty}>{t('selectSession')}</p>
          : (
            <Conversation
              t={t}
              state={state}
              session={session}
              machineName={open.machineName}
              online={machines.find(candidate => candidate.machineName === open.machineName)?.online ?? false}
              closeSession={props.closeSession}
              sendPrompt={props.sendPrompt}
            />
          )}
      </section>
    </div>
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
  const body = React.useRef<HTMLDivElement | null>(null)
  const rows = React.useMemo(
    () => toRows(state.transcript?.events ?? []),
    [state.transcript],
  )
  // MarkdownText caches a streaming render against the labels object's identity,
  // so a fresh object on every render would discard that cache each time.
  const markdownLabels = React.useMemo(
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
      <div className={css.detailHeader}>
        <Button
          variant="ghost"
          size="sm"
          className={css.narrowOnly}
          icon={<IconChevronLeftOutline14 />}
          aria-label={t('back')}
          onClick={props.closeSession}
        />
        <h2 className={css.detailTitle}>{session.title}</h2>
        <Tag tone="neutral">{props.machineName}</Tag>
        {session.running && (
          <>
            <StateDot state="ongoing" />
            <span className={css.machineMeta}>{t('sessionRunning')}</span>
          </>
        )}
      </div>
      <div className={css.detailBody} ref={body}>
        {state.error !== undefined && <div className={css.error}>{state.error}</div>}
        {state.transcript === undefined && !state.loadingTranscript
          ? <p className={css.empty}>{t('transcriptGone')}</p>
          : state.loadingTranscript
            ? <p className={css.empty}>{t('transcriptLoading')}</p>
            : rows.length === 0
              ? <p className={css.empty}>{t('transcriptEmpty')}</p>
              : rows.map(row => <Row key={row.key} t={t} row={row} labels={markdownLabels} />)}
      </div>
      <form
        className={css.composer}
        onSubmit={(event) => { event.preventDefault(); send() }}
      >
        <div className={css.composerField}>
          <textarea
            className={css.composerInput}
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
          <div className={css.composerMeta}>
            <span className={css.composerTarget}>
              {t('composerTarget')}
              {' '}
              {props.machineName}
            </span>
            {delivery !== undefined && (
              <span className={css.composerDelivery}>{deliveryLine(delivery, t)}</span>
            )}
            {!props.online && <span className={css.composerOffline}>{t('offlineQueueHint')}</span>}
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={sending || draft.trim() === ''}
        >
          {sending ? t('sending') : t('send')}
        </Button>
      </form>
    </>
  )
}

/** One transcript row. */
function Row({ t, row, labels }: {
  t: (key: SessionSyncKey) => string
  row: TranscriptRow
  labels: MarkdownLabels
}): React.ReactElement {
  if (row.kind === 'user') {
    return (
      <div className={`${css.turn} ${css.turnUser}`}>
        <span className={css.turnLabel}>{t('you')}</span>
        <div className={css.bubble}>{row.text}</div>
      </div>
    )
  }
  if (row.kind === 'assistant') {
    return (
      <div className={css.turn}>
        <span className={css.turnLabel}>{t('assistant')}</span>
        {row.reasoning !== '' && <ReasoningRow t={t} reasoning={row.reasoning} />}
        {row.text !== '' && <MarkdownText text={row.text} labels={labels} />}
      </div>
    )
  }
  return <ToolRowRow t={t} row={row} />
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
      className={css.reasoningRow}
      titleClassName={css.turnLabel}
    >
      <div className={css.reasoning}>{reasoning}</div>
    </DisclosureRow>
  )
}

/** One tool call and its result, folded into a single row. */
function ToolRowRow({ t, row }: {
  t: (key: SessionSyncKey) => string
  row: ToolRow
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const label = row.name === '' ? t('toolResult') : row.name
  const status = row.pending ? t('sessionRunning') : row.isError ? t('deliveryFailed') : timeLabel(row.time, t)
  return (
    <DisclosureRow
      icon={<StateDot state={row.pending ? 'ongoing' : row.isError ? 'error' : 'done'} />}
      title={row.summary === '' ? label : `${label} · ${row.summary}`}
      open={open}
      expandable
      expandOnRowClick
      onToggle={() => { setOpen(current => !current) }}
      className={row.isError ? `${css.toolRow} ${css.toolError}` : css.toolRow}
      titleClassName={css.toolName}
      collapsedContent={<span className={css.toolDetail}>{status}</span>}
    >
      <div className={css.toolBody}>
        {row.argumentsText !== '' && (
          <>
            <span className={css.toolSection}>{t('toolArguments')}</span>
            <pre className={css.toolCode}>{row.argumentsText}</pre>
          </>
        )}
        <span className={css.toolSection}>{t('toolResult')}</span>
        {row.resultText === ''
          ? <div className={css.reasoning}>{row.pending ? t('toolRunning') : t('toolNoOutput')}</div>
          : <pre className={css.toolCode}>{row.resultText}</pre>}
      </div>
    </DisclosureRow>
  )
}

/** The role and link line above the machine list. */
function roleLine(state: SyncClientSnapshot, t: (key: SessionSyncKey) => string): string {
  const role = state.state.role === 'server' ? t('roleServer') : t('roleClient')
  if (state.state.role === 'server') {
    return `${role} · ${state.state.listening ? t('statusListening') : t('statusNotListening')}`
  }
  if (state.state.serverUrl.trim() === '') return `${role} · ${t('statusNotConfigured')}`
  return `${role} · ${state.state.linked ? t('statusLinked') : t('statusUnlinked')}`
}

/** One machine's activity line. */
function machineMeta(machine: MirroredMachine, t: (key: SessionSyncKey) => string): string {
  const online = machine.online ? t('machineOnline') : t('machineOffline')
  if (machine.online) return online
  return `${online} · ${t('lastSeen')} ${timeLabel(machine.lastSeen, t)}`
}

/** One Session's second line inside the middle pane. */
function sessionMeta(session: MirroredSession, t: (key: SessionSyncKey) => string): string {
  const place = session.cwd ?? session.sessionId
  return `${place} · ${String(session.eventCount)} ${t('eventsCount')}`
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
 * The machine's Sessions, filtered and running-first.
 * @param machine - the selected machine, when one is.
 * @param query - the current search text.
 * @param runningOnly - whether the running filter is on.
 * @returns the Sessions to list, in render order.
 */
function filterSessions(
  machine: MirroredMachine | undefined,
  query: string,
  runningOnly: boolean,
): MirroredSession[] {
  const needle = query.trim().toLowerCase()
  return (machine?.sessions ?? [])
    .filter(session => {
      if (runningOnly && !session.running) return false
      if (needle === '') return true
      return session.title.toLowerCase().includes(needle)
        || (session.cwd ?? '').toLowerCase().includes(needle)
        || session.sessionId.toLowerCase().includes(needle)
    })
    .sort((left, right) => Number(right.running) - Number(left.running) || right.updatedAt - left.updatedAt)
}

/**
 * Group Sessions by the directory they run in, preserving the incoming order.
 * @param sessions - already-filtered Sessions.
 * @returns one group per directory, in first-appearance order.
 */
function groupByCwd(sessions: readonly MirroredSession[]): SessionGroup[] {
  const groups = new Map<string, MirroredSession[]>()
  for (const session of sessions) {
    const key = session.cwd ?? ''
    const existing = groups.get(key)
    if (existing === undefined) groups.set(key, [session])
    else existing.push(session)
  }
  return [...groups].map(([cwd, members]) => ({ cwd, sessions: members }))
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
