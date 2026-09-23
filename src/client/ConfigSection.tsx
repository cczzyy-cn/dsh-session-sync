/**
 * The Session sync settings page.
 *
 * Registered into `settings.section`, so it gets a navigation entry of its own
 * rather than a card inside the plugin tab: the page carries a per-Session list
 * that needs the full column.
 *
 * Edits are staged and written on save. Each write is a durable document
 * mutation on the Host, and the switch list is long enough that committing per
 * keystroke would turn one intention into a dozen writes.
 */
import * as React from 'react'
import { Button, Input, StateDot, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConfigPatch, LocalSessionRow, SyncConfig } from '../shared/protocol.ts'
import type { SyncClientSnapshot } from './api.ts'
import type { SessionSyncKey } from './locales.ts'
import css from './sync.module.css'

/** Props the renderer binds for a `settings.section` entry. */
export interface ConfigSectionProps {
  /** Localized copy, from the registration's `locale` namespace. */
  t: (key: SessionSyncKey) => string
  /** Close the settings panel; supplied by the section's owner. */
  close: () => void
  /** The bound snapshot hook, from the registration's `hooks` compartment. */
  useSync: <Value>(selector: (snapshot: SyncClientSnapshot) => Value) => Value
  /** Write one partial configuration change. */
  configure: (patch: ConfigPatch) => Promise<boolean>
  /** Flip one Session's publish switch. */
  setSessionSync: (sessionId: string, synced: boolean) => Promise<boolean>
}

/** The text fields this page stages. */
interface Draft {
  machineName: string
  serverUrl: string
  isServer: boolean
  password: string
  listenHost: string
  listenPort: string
}

/** Seed the draft from the served configuration. */
function draftOf(config: SyncConfig): Draft {
  return {
    machineName: config.machineName,
    serverUrl: config.serverUrl,
    isServer: config.isServer,
    password: config.password,
    listenHost: config.listenHost,
    listenPort: String(config.listenPort),
  }
}

/** How the last save ended, for the status line beside the buttons. */
type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

/**
 * Render the Session sync settings page.
 * @param props - copy, the snapshot hook, and the write actions.
 * @returns the section.
 */
export function ConfigSection(props: ConfigSectionProps): React.ReactElement {
  const state = props.useSync(snapshot => snapshot)
  const { t } = props
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(state.config))
  const [dirty, setDirty] = React.useState(false)
  const [status, setStatus] = React.useState<SaveStatus>('idle')
  const seeded = React.useRef(state.config)
  // Read inside the re-seed effect without making `dirty` one of its triggers:
  // a staged edit must survive an unrelated state frame.
  const dirtyRef = React.useRef(false)
  dirtyRef.current = dirty

  React.useEffect(() => {
    if (seeded.current === state.config) return
    seeded.current = state.config
    if (dirtyRef.current) return
    setDraft(draftOf(state.config))
  }, [state.config])

  const edit = (patch: Partial<Draft>): void => {
    setDraft(current => ({ ...current, ...patch }))
    setDirty(true)
    setStatus('idle')
  }

  const discard = (): void => {
    setDraft(draftOf(state.config))
    setDirty(false)
    setStatus('idle')
  }

  const save = (): void => {
    setStatus('saving')
    void props.configure({
      machineName: draft.machineName,
      serverUrl: draft.serverUrl,
      isServer: draft.isServer,
      password: draft.password,
      listenHost: draft.listenHost,
      listenPort: Number.parseInt(draft.listenPort, 10),
    }).then((accepted) => {
      setStatus(accepted ? 'saved' : 'failed')
      if (accepted) setDirty(false)
    })
  }

  return (
    <section className={css.section} aria-label={t('sectionTitle')}>
      <p className={css.lede}>{t('sectionDescription')}</p>

      <div className={css.group}>
        <h3 className={css.groupTitle}>{t('machineGroup')}</h3>
        <div className={css.card}>
          <label className={css.field}>
            <span className={css.label}>{t('machineName')}</span>
            <Input
              value={draft.machineName}
              onChange={(event) => { edit({ machineName: event.target.value }) }}
            />
            <span className={css.hint}>{t('machineNameHint')}</span>
          </label>

          <label className={css.field}>
            <span className={css.label}>{t('serverUrl')}</span>
            <Input
              value={draft.serverUrl}
              placeholder="192.168.1.10:8791"
              disabled={draft.isServer}
              onChange={(event) => { edit({ serverUrl: event.target.value }) }}
            />
            <span className={css.hint}>{t('serverUrlHint')}</span>
          </label>

          <div className={css.fieldRow}>
            <span className={css.fieldText}>
              <span className={css.label}>{t('isServer')}</span>
              <span className={css.hint}>{t('isServerHint')}</span>
            </span>
            <Switch
              checked={draft.isServer}
              label={t('isServer')}
              onChange={(next) => { edit({ isServer: next }) }}
            />
          </div>

          <label className={css.field}>
            <span className={css.label}>{t('password')}</span>
            <Input
              type="password"
              autoComplete="off"
              value={draft.password}
              onChange={(event) => { edit({ password: event.target.value }) }}
            />
            <span className={css.hint}>{t('passwordHint')}</span>
          </label>

          <div className={css.pair}>
            <label className={css.field}>
              <span className={css.label}>{t('listenHost')}</span>
              <Input
                value={draft.listenHost}
                disabled={!draft.isServer}
                onChange={(event) => { edit({ listenHost: event.target.value }) }}
              />
            </label>
            <label className={css.field}>
              <span className={css.label}>{t('listenPort')}</span>
              <Input
                inputMode="numeric"
                value={draft.listenPort}
                disabled={!draft.isServer}
                onChange={(event) => { edit({ listenPort: event.target.value }) }}
              />
            </label>
          </div>
        </div>

        <div className={css.actions}>
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || status === 'saving'}
            onClick={save}
          >
            {t('save')}
          </Button>
          <Button variant="ghost" size="sm" disabled={!dirty} onClick={discard}>
            {t('discard')}
          </Button>
          {status === 'saved' && <span className={css.saved}>{t('saved')}</span>}
          {status === 'failed' && <span className={css.failed}>{t('saveFailed')}</span>}
          {dirty && status === 'idle' && <span className={css.dirty}>{t('unsaved')}</span>}
        </div>
      </div>

      <StatusBlock t={t} state={state} />

      <div className={css.group}>
        <h3 className={css.groupTitle}>{t('sessions')}</h3>
        <span className={css.hint}>{t('sessionsHint')}</span>
        <SessionList
          t={t}
          ready={state.ready}
          sessions={state.sessions}
          setSessionSync={props.setSessionSync}
        />
      </div>
    </section>
  )
}

/** The role, listener, and link facts, gathered in one place. */
function StatusBlock({ t, state }: {
  t: (key: SessionSyncKey) => string
  state: SyncClientSnapshot
}): React.ReactElement {
  const { role, listening, linked, machines, published } = state.state
  const connected = role === 'server'
    ? (listening ? t('statusListening') : t('statusNotListening'))
    : (state.config.serverUrl.trim() === ''
      ? t('statusNotConfigured')
      : (linked ? t('statusLinked') : t('statusUnlinked')))
  const healthy = role === 'server' ? listening : linked
  const detail = state.state.listenError ?? state.state.linkError
  // A mirror that is missing events cannot repair itself, so the one number an
  // operator has to act on is shown only when it is not zero.
  const missing = machines.reduce(
    (total, machine) => total + machine.sessions.reduce(
      (sum, session) => sum + (session.missingEvents ?? 0),
      0,
    ),
    0,
  )
  return (
    <div className={css.group}>
      <h3 className={css.groupTitle}>{t('statusTitle')}</h3>
      <div className={css.card}>
        <div className={css.status}>
          <span className={css.statusItem}>
            <StateDot state={healthy ? 'done' : 'idle'} />
            {t('statusTitle')}
            <span className={healthy ? css.statusGood : css.statusBad}>{connected}</span>
          </span>
          <span className={css.statusItem}>
            {role === 'server' ? t('roleServer') : t('roleClient')}
          </span>
          <span className={css.statusItem}>
            {t('publishedCount')}
            <span className={css.statusValue}>{String(published)}</span>
          </span>
          {role === 'server' && (
            <span className={css.statusItem}>
              {t('machineSessions')}
              <span className={css.statusValue}>{String(machines.length)}</span>
            </span>
          )}
          {role === 'server' && missing > 0 && (
            <span className={css.statusItem}>
              {t('mirrorGaps')}
              <span className={css.statusBad}>{String(missing)}</span>
            </span>
          )}
        </div>
        {detail !== undefined && detail !== '' && <span className={css.failed}>{detail}</span>}
        {state.error !== undefined && <span className={css.failed}>{state.error}</span>}
      </div>
    </div>
  )
}

/** The per-Session publish switches. */
function SessionList({ t, ready, sessions, setSessionSync }: {
  t: (key: SessionSyncKey) => string
  ready: boolean
  sessions: readonly LocalSessionRow[]
  setSessionSync: (sessionId: string, synced: boolean) => Promise<boolean>
}): React.ReactElement {
  if (!ready) return <span className={css.empty}>{t('sessionsLoading')}</span>
  if (sessions.length === 0) return <span className={css.empty}>{t('sessionsEmpty')}</span>
  return (
    <div className={css.sessionList}>
      {sessions.map(session => (
        <div key={session.sessionId} className={css.sessionRow}>
          <span className={css.sessionText}>
            <span className={css.sessionTitle}>{session.title}</span>
            <span className={css.sessionMeta}>
              {session.running && (
                <>
                  <StateDot state="ongoing" />
                  <span>{t('sessionRunning')}</span>
                </>
              )}
              {session.cwd !== undefined && <span>{session.cwd}</span>}
            </span>
          </span>
          <Switch
            checked={session.synced}
            label={`${t('sessionSyncLabel')}: ${session.title}`}
            onChange={(next) => { void setSessionSync(session.sessionId, next) }}
          />
        </div>
      ))}
    </div>
  )
}
