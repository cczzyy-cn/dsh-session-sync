/**
 * Grouping for the settings page's publish list.
 *
 * The list used to be flat, with each row repeating its own directory. A machine
 * usually has several Sessions per project, so the directory a Session runs in is
 * what a reader picks first — this module is that grouping, kept dependency-free
 * so the decision is testable under `node --test` (the panel that renders it
 * imports React and the shipped UI packages, neither of which resolves there).
 */

/** One row of the machine's own Session list, as the settings page receives it. */
export interface GroupableSession {
  readonly sessionId: string
  /** The directory the Session runs in; absent when the machine named none. */
  readonly cwd?: string
}

/** One workspace directory and the Sessions that run in it. */
export interface SessionGroup<Row extends GroupableSession> {
  /** The workspace directory, or undefined for Sessions that name none. */
  readonly cwd: string | undefined
  readonly sessions: readonly Row[]
}

/**
 * Group the machine's Sessions by working directory.
 *
 * Order is the point as much as the grouping: real directories come first in path
 * order, and Sessions that name no directory form one group at the end — they are
 * the exception, not the first thing a reader should scan.
 * @param sessions - every Session the machine reported, in the order it reported them.
 * @returns the groups, directories in path order and the unnamed group last.
 */
export function sessionGroupsOf<Row extends GroupableSession>(sessions: readonly Row[]): SessionGroup<Row>[] {
  const groups = new Map<string, Row[]>()
  for (const session of sessions) {
    const key = session.cwd ?? ''
    const rows = groups.get(key)
    if (rows === undefined) groups.set(key, [session])
    else rows.push(session)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === '') return 1
      if (right === '') return -1
      return left.localeCompare(right)
    })
    .map(([cwd, rows]) => ({ cwd: cwd === '' ? undefined : cwd, sessions: rows }))
}
