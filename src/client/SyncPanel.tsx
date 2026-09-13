/**
 * The centre panel: every machine's published Sessions, and one of them opened.
 *
 * Registered into the `main` slot under the same key as this plugin's sidebar
 * row, so the frame's panel selector and the sidebar entry resolve to the same
 * place without either knowing about the other.
 *
 * Opening a Session reads a snapshot and then follows the live event frames the
 * Host streams over the same SSE channel; the composer sends a prompt the server
 * forwards to the machine that owns the Session, which is what makes taking over
 * from here possible at all.
 */
import * as React from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MirroredMachine, MirroredSession } from '../shared/protocol.ts'
import type { SyncClientSnapshot } from './api.ts'
import type { SessionSyncKey } from './locales.ts'
import { toRows, type TranscriptRow } from './transcript.ts'
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

/**
 * Render the sync panel.
 * @param props - copy, the snapshot hook, and the actions.
 * @returns the panel.
 */
export function SyncPanel(props: SyncPanelProps): React.ReactElement {
  const state = props.useSync(snapshot => snapshot)
  const { t } = props
  const open = state.open
  if (open !== undefined) {
    return (
      <Conversation
        t={t}
        state={state}
        title={titleOf(state, open.machineName, open.sessionId)}
        running={runningOf(state, open.machineName, open.sessionId)}
        missing={state.transcript === undefined && !state.loadingTranscript}
        closeSession={props.closeSession}
        sendPrompt={props.sendPrompt}
      />
    )
  }
  return (
    <div className={css.panel}>
      <div className={css.header}>
        <h2 className={css.headerTitle}>{t('panelTitle')}</h2>
        <span className={css.headerSpacer} />
        <span className={css.machineMeta}>
          {state.state.role === 'server' ? t('roleServer') : t('roleClient')}
        </span>
      </div>
      <div className={css.body}>
        {state.error !== undefined && <div className={css.error}>{state.error}</div>}
        {state.state.role !== 'server'
          ? <p className={css.empty}>{t('panelEmptyClient')}</p>
          : state.state.machines.length === 0
            ? <p className={css.empty}>{t('panelEmptyServer')}</p>
            : state.state.machines.map(machine => (
              <MachineGroup
                key={machine.machineName}
                t={t}
                machine={machine}
                onOpen={props.openSession}
              />
            ))}
      </div>
    </div>
  )
}

/** One machine's published Sessions. */
function MachineGroup({ t, machine, onOpen }: {
  t: (key: SessionSyncKey) => string
  machine: MirroredMachine
  onOpen: (machineName: string, sessionId: string) => Promise<void>
}): React.ReactElement {
  return (
    <section className={css.machine}>
      <div className={css.machineHeader}>
        <StateDot state={machine.online ? 'done' : 'idle'} />
        <span className={css.machineName}>{machine.machineName}</span>
        <span className={css.machineMeta}>
          {machine.online ? t('machineOnline') : t('machineOffline')}
          {' · '}
          {String(machine.sessions.length)}
          {' '}
          {t('machineSessions')}
        </span>
      </div>
      {machine.sessions.map(session => (
        <SessionRow key={session.sessionId} t={t} machine={machine} session={session} onOpen={onOpen} />
      ))}
    </section>
  )
}

/** One published Session's open button. */
function SessionRow({ t, machine, session, onOpen }: {
  t: (key: SessionSyncKey) => string
  machine: MirroredMachine
  session: MirroredSession
  onOpen: (machineName: string, sessionId: string) => Promise<void>
}): React.ReactElement {
  return (
    <button
      type="button"
      className={css.sessionButton}
      aria-label={`${t('openSession')}: ${session.title}`}
      onClick={() => { void onOpen(machine.machineName, session.sessionId) }}
    >
      {session.running && <StateDot state="ongoing" />}
      <span className={css.sessionButtonText}>
        <span className={css.sessionTitle}>{session.title}</span>
        <span className={css.sessionMeta}>
          {session.cwd !== undefined ? session.cwd : session.sessionId}
          {' · '}
          {String(session.eventCount)}
        </span>
      </span>
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
  title: string
  running: boolean
  missing: boolean
  closeSession: () => void
  sendPrompt: (text: string) => Promise<boolean>
}): React.ReactElement {
  const { t, state } = props
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const body = React.useRef<HTMLDivElement | null>(null)
  const rows = React.useMemo(
    () => toRows(state.transcript?.events ?? []),
    [state.transcript],
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

  return (
    <div className={css.panel}>
      <div className={css.header}>
        <Button variant="ghost" size="sm" onClick={props.closeSession}>{t('back')}</Button>
        <h2 className={css.headerTitle}>{props.title}</h2>
        <span className={css.headerSpacer} />
        {props.running && (
          <>
            <StateDot state="ongoing" />
            <span className={css.machineMeta}>{t('sessionRunning')}</span>
          </>
        )}
      </div>
      <div className={css.body} ref={body}>
        {state.error !== undefined && <div className={css.error}>{state.error}</div>}
        {props.missing
          ? <p className={css.empty}>{t('transcriptGone')}</p>
          : state.loadingTranscript
            ? <p className={css.empty}>{t('transcriptLoading')}</p>
            : rows.length === 0
              ? <p className={css.empty}>{t('transcriptEmpty')}</p>
              : rows.map(row => <Row key={row.key} t={t} row={row} />)}
      </div>
      <form
        className={css.composer}
        onSubmit={(event) => { event.preventDefault(); send() }}
      >
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
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={sending || draft.trim() === ''}
        >
          {sending ? t('sending') : t('send')}
        </Button>
      </form>
    </div>
  )
}

/** One transcript row. */
function Row({ t, row }: {
  t: (key: SessionSyncKey) => string
  row: TranscriptRow
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
        {row.reasoning !== '' && (
          <details>
            <summary className={css.turnLabel}>{t('reasoning')}</summary>
            <div className={css.reasoning}>{row.reasoning}</div>
          </details>
        )}
        {row.text !== '' && <div className={css.bubble}>{row.text}</div>}
      </div>
    )
  }
  const label = row.kind === 'tool' ? t('tool') : t('toolResult')
  const detail = row.kind === 'tool' ? row.detail : row.text
  const failed = row.kind === 'toolResult' && row.isError
  return (
    <div className={`${css.toolRow} ${failed ? css.toolError : ''}`}>
      <span className={css.toolName}>
        {label}
        {row.kind === 'tool' ? ` · ${row.name}` : ''}
      </span>
      {detail !== '' && <span className={css.toolDetail}>{detail}</span>}
    </div>
  )
}

/** Find the open Session's title in the mirror, falling back to its id. */
function titleOf(state: SyncClientSnapshot, machineName: string, sessionId: string): string {
  const machine = state.state.machines.find(candidate => candidate.machineName === machineName)
  const session = machine?.sessions.find(candidate => candidate.sessionId === sessionId)
  return session?.title ?? sessionId
}

/** Whether the open Session is mid-turn according to the mirror. */
function runningOf(state: SyncClientSnapshot, machineName: string, sessionId: string): boolean {
  const machine = state.state.machines.find(candidate => candidate.machineName === machineName)
  return machine?.sessions.find(candidate => candidate.sessionId === sessionId)?.running ?? false
}
