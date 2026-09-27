/**
 * The console's tree, as a decision rather than as rendering.
 *
 * The tree is where a reader decides what to open, and its ordering rules are
 * deliberate enough to be worth pinning: machines by name so rows do not swap as
 * they publish, directories by path, Sessions newest first with a running one
 * lifted to the top. It lives here, with no imports but the wire types, so
 * `node --test` can reach it — a test cannot import `SyncPanel.tsx`, which needs
 * `react` and the shipped UI packages.
 */
import type { MirroredMachine, MirroredSession } from '../shared/protocol.ts'

/** One directory's Sessions, inside one machine. */
export interface ProjectGroup {
  cwd: string
  sessions: MirroredSession[]
}

/** One machine and its directories. */
export interface MachineGroup {
  machine: MirroredMachine
  projects: ProjectGroup[]
}

/**
 * Group the mirror into machines, their directories, and their Sessions.
 *
 * A machine or directory with no match is dropped when a search is being asked:
 * a search is a question about the whole tree, so a match hidden inside a
 * collapsed or empty-looking branch is the same as no match at all.
 * @param machines - every machine the server mirrors, in whatever order it lists them.
 * @param query - the current search text.
 * @returns the tree to render.
 */
export function buildTree(machines: readonly MirroredMachine[], query: string): MachineGroup[] {
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

/**
 * Whether one Session matches the search text.
 *
 * The needle is expected lower-cased and trimmed by the caller; the id is
 * matched as well as the title because an un-published or never-titled Session is
 * only findable by its id, which is exactly what the panel shows for it.
 * @param session - the Session to test.
 * @param needle - the lower-cased search text.
 * @returns whether the row should stay.
 */
export function matches(session: MirroredSession, needle: string): boolean {
  return session.title.toLowerCase().includes(needle)
    || (session.cwd ?? '').toLowerCase().includes(needle)
    || session.sessionId.toLowerCase().includes(needle)
}
