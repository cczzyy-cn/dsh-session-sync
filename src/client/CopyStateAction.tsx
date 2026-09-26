/**
 * A chip in DSH's own Session header for a Session this Host has written.
 *
 * The console already badges these rows, but the reader who needs this reading
 * is the one looking at DSH's own page — and that page cannot be annotated from
 * the log, because a copy is behind *precisely* when someone has it open: the
 * live Session owns its log, so the plugin's append is refused until it goes
 * cold. That makes this chip the one place the state can reach the reader who
 * is waiting for the content it describes.
 *
 * It renders nothing at all for a Session this Host has not written, which is
 * every other Session in every other header.
 */
import * as React from 'react'
import type { SyncClientSnapshot } from './api.ts'
import type { SessionSyncKey } from './locales.ts'
import css from './sync.module.css'

/** Props the renderer binds: the slot's standard Session props plus the snapshot hook. */
export interface CopyStateActionProps {
  /** The Session this header belongs to; absent without one. */
  sessionId?: string
  /** Localized copy, from the registration's `locale` namespace. */
  t: (key: SessionSyncKey) => string
  /** The bound snapshot hook, from the registration's `hooks` compartment. */
  useSync: <Value>(selector: (snapshot: SyncClientSnapshot) => Value) => Value
}

/**
 * Render the chip, or nothing when this Session is not one of ours.
 * @param props - the Session id, copy, and the snapshot hook.
 * @returns the chip.
 */
export function CopyStateAction(props: CopyStateActionProps): React.ReactElement | null {
  const snapshot = props.useSync(current => current)
  const entry = (snapshot.state.materialized ?? [])
    .find(row => row.sessionId === props.sessionId)
  if (entry === undefined) return null
  const mirrored = (snapshot.state.machines ?? [])
    .flatMap(machine => machine.sessions)
    .find(session => session.sessionId === props.sessionId)?.eventCount
  const behind = mirrored === undefined ? 0 : Math.max(0, mirrored - entry.events)
  const stopped = entry.stopped !== undefined
  const label = stopped
    ? props.t('materializedStopped')
    : behind === 0
      ? props.t('materializedBadge')
      : `${props.t('materializedBadge')} · ${props.t('materializedBehind')} ${String(behind)}`
  const hint = stopped
    ? props.t('materializedStoppedHint')
    : entry.waiting === undefined
      ? props.t('materializedHint')
      : `${props.t('materializedWaitingHint')}\n${entry.waiting}`
  return <span className={stopped ? css.failed : css.realBadge} title={hint}>{label}</span>
}
