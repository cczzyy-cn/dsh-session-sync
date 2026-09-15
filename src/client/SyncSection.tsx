/**
 * The sidebar's own sync section, wearing the workspace browser's clothes.
 *
 * It is a section of the browsing region rather than a global panel row, and it
 * is rendered to look like one more workspace directory: the same
 * folder-plus-chevron lead-in, the same 32px row with a hover fill, and the
 * same indented Session rows carrying a trailing time.
 *
 * What it holds is a **glance**, not the console. The column's lower half cannot
 * show every Session of every machine without taking that height from the
 * workspace browser above it, so this lists what a reader needs to decide
 * whether to go look — the machines that are here, what is running, and the few
 * most recent Sessions — and hands everything else to the centre panel. The
 * header row is the way in, in both directions.
 *
 * Clicking the row folds it, as a workspace row does; the hover action opens
 * this plugin's centre panel, which carries the full three-pane console.
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
import type { MirroredMachine, MirroredSession } from '../shared/protocol.ts'
import type { SyncClientSnapshot } from './api.ts'
import type { SessionSyncKey } from './locales.ts'
import css from './sync.module.css'

/** How many Session rows the glance shows before deferring to the panel. */
const GLANCE_LIMIT = 3

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
 *   no room — the rail reaches the panel through its own panel row instead.
 */
export function SyncSection(props: SyncSectionProps): React.ReactElement | null {
  const state = props.useSync(snapshot => snapshot)
  const { t, wide } = props
  const [open, setOpen] = React.useState(true)
  if (!wide) return null

  const { role, machines } = state.state
  const glance = React.useMemo(() => pickGlance(machines), [machines])

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
                <div className={css.wsSummary}>{summaryLine(machines, t)}</div>
                {glance.groups.map(group => (
                  <React.Fragment key={group.machineName}>
                    {/* Only when more than one machine publishes: a Session from
                        another machine must never read as one of our own. */}
                    {machines.length > 1 && (
                      <div className={css.wsMachine}>
                        <StateDot state={group.online ? 'done' : 'idle'} />
                        <span className={css.wsMachineName}>{group.machineName}</span>
                      </div>
                    )}
                    {group.sessions.map(session => (
                      <button
                        key={session.sessionId}
                        type="button"
                        className={css.wsSession}
                        aria-label={`${t('openSession')}: ${session.title}`}
                        onClick={() => { void props.openSession(group.machineName, session.sessionId) }}
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
                {glance.groups.length === 0 && (
                  <p className={css.sectionEmpty}>{t('machineNoSessions')}</p>
                )}
                {glance.remainder > 0 && (
                  <button
                    type="button"
                    className={css.wsMore}
                    onClick={props.openOverview}
                  >
                    {`${t('viewAll')} (${String(glance.remainder)})`}
                  </button>
                )}
              </div>
            )}
    </section>
  )
}

/** One machine's slice of the glance. */
interface GlanceGroup {
  machineName: string
  online: boolean
  sessions: MirroredSession[]
}

/**
 * Choose what the glance shows: running Sessions first, then the most recent.
 *
 * Machines keep their own groups rather than being flattened into one list —
 * the row does not carry the machine name, so a flat list across machines would
 * be exactly the ambiguity this section exists to avoid. A machine whose slice
 * is empty still counts toward the remainder, so "view all" never understates
 * what the panel holds.
 * @param machines - every machine the server mirrors, newest activity first.
 * @returns the groups to render and how many Sessions were left for the panel.
 */
function pickGlance(machines: readonly MirroredMachine[]): { groups: GlanceGroup[]; remainder: number } {
  const groups: GlanceGroup[] = []
  let shown = 0
  let total = 0
  for (const machine of machines) {
    const ordered = [...machine.sessions].sort((left, right) =>
      Number(right.running) - Number(left.running) || right.updatedAt - left.updatedAt)
    total += ordered.length
    if (shown >= GLANCE_LIMIT) continue
    const slice = ordered.slice(0, GLANCE_LIMIT - shown)
    shown += slice.length
    if (slice.length > 0) {
      groups.push({ machineName: machine.machineName, online: machine.online, sessions: slice })
    }
  }
  return { groups, remainder: Math.max(0, total - shown) }
}

/** The one-line state of the fleet: how many machines and how many running. */
function summaryLine(
  machines: readonly MirroredMachine[],
  t: (key: SessionSyncKey) => string,
): string {
  const online = machines.filter(machine => machine.online).length
  const running = machines.reduce(
    (total, machine) => total + machine.sessions.filter(session => session.running).length,
    0,
  )
  const fleet = `${String(online)}/${String(machines.length)} ${t('machinesOnline')}`
  if (running === 0) return fleet
  return `${fleet} · ${String(running)} ${t('sessionsRunning')}`
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
