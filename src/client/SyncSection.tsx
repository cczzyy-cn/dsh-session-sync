/**
 * The sidebar's own sync section, wearing the workspace browser's clothes.
 *
 * It is a section of the browsing region rather than a global panel row, and it
 * is rendered to look like one more workspace directory: the same
 * folder-plus-chevron lead-in, the same 32px row with a hover fill, and the
 * same indented session rows carrying a trailing time. A remote Session should
 * be as easy to scan as a local one, and the column should not read as "some
 * workspaces, then a plugin widget".
 *
 * Clicking the row folds it, as a workspace row does; the hover action opens
 * this plugin's centre panel, which carries the longer explanations and the
 * takeover composer.
 */
import * as React from 'react'
import {
  IconFolderClose16,
  IconFolderOpen16,
  IconShareOutline16,
  IconTriangleRightFill14,
  StateDot,
  relativeTime,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SyncClientSnapshot } from './api.ts'
import type { SessionSyncKey } from './locales.ts'
import css from './sync.module.css'

/** Props the renderer binds for the `sidebar.region.section` entry. */
export interface SyncSectionProps {
  /** Localized copy, from the registration's `locale` namespace. */
  t: (key: SessionSyncKey) => string
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
  /** The bound snapshot hook, from the registration's `hooks` compartment. */
  useSync: <Value>(selector: (snapshot: SyncClientSnapshot) => Value) => Value
  /** Open one mirrored Session in the centre column. */
  openSession: (machineName: string, sessionId: string) => Promise<void>
  /** Show this plugin's centre panel, which carries the longer explanations. */
  openOverview: () => void
}

/**
 * Render the sidebar sync section.
 * @param props - copy, the column state, the snapshot hook, and the actions.
 * @returns the section, or null in the collapsed rail where a grouped list has
 *   no room — the rail is an icon column and the settings page remains the way
 *   in.
 */
export function SyncSection(props: SyncSectionProps): React.ReactElement | null {
  const state = props.useSync(snapshot => snapshot)
  const { t, wide } = props
  const [open, setOpen] = React.useState(true)
  if (!wide) return null

  const { role, machines } = state.state
  // Named only when there is more than one; with a single machine the section
  // is indistinguishable from a plain workspace, which is the point.
  const named = machines.length > 1

  const toggle = (): void => { setOpen(current => !current) }

  return (
    <section className={css.sectionRoot} aria-label={t('panelTitle')}>
      <div
        className={css.wsRow}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          toggle()
        }}
      >
        <span className={`${css.wsSlot} ${css.wsFolder}`}>
          {open ? <IconFolderOpen16 /> : <IconFolderClose16 />}
        </span>
        <span className={`${css.wsSlot} ${css.wsChevron}`}>
          <IconTriangleRightFill14 className={open ? css.wsArrowOpen : undefined} />
        </span>
        <span className={css.wsText}>
          <span className={css.wsTitle}>{t('panelTitle')}</span>
        </span>
        <span className={css.wsActions}>
          <button
            type="button"
            className={css.wsIconButton}
            aria-label={t('openOverview')}
            onClick={(event) => {
              // The row's own handler folds the section; this must not.
              event.stopPropagation()
              props.openOverview()
            }}
          >
            <IconShareOutline16 size={16} />
          </button>
        </span>
      </div>

      {!open
        ? null
        : role !== 'server'
          ? <p className={css.sectionEmpty}>{t('sectionClientHint')}</p>
          : machines.length === 0
            ? <p className={css.sectionEmpty}>{t('sectionEmptyServer')}</p>
            : (
              <div className={css.wsList}>
                {machines.map(machine => (
                  <React.Fragment key={machine.machineName}>
                    {named && <div className={css.wsMachine}>{machine.machineName}</div>}
                    {machine.sessions.map(session => (
                      <button
                        key={session.sessionId}
                        type="button"
                        className={css.wsSession}
                        aria-label={`${t('openSession')}: ${session.title}`}
                        onClick={() => { void props.openSession(machine.machineName, session.sessionId) }}
                      >
                        <span className={css.wsSlot}>
                          {session.running && <StateDot state="ongoing" />}
                        </span>
                        <span className={css.wsSessionTitle}>{session.title}</span>
                        <span className={css.wsSessionTime}>
                          {session.running ? t('sessionRunning') : timeLabel(session.updatedAt, t)}
                        </span>
                      </button>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            )}
    </section>
  )
}

/**
 * One relative-time label, from the shared bucketing and this plugin's words.
 * @param at - epoch ms of the Session's last activity.
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
