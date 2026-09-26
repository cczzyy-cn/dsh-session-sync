/**
 * The two decisions this half makes about a Session that has been written into
 * the Host's own storage, kept in a module with no imports.
 *
 * Both are pure, and both were previously inline in a React component — which is
 * why the browser half had no tests at all: a test here cannot import
 * `SyncPanel.tsx` (it needs `react` and the shipped UI packages, neither of
 * which resolves from this package). Naming the decisions and keeping them
 * dependency-free is what puts them under `node --test` on both sides of the
 * build, and it leaves the component with nothing but rendering to get wrong.
 */

/**
 * The Sessions named in the state that have not been announced yet.
 *
 * The state frame is rebuilt on every broadcast, so "the list changed" is not a
 * fact a caller can read off an array identity — and announcing the same Session
 * twice would re-run a shell refresh for nothing. The caller keeps what it has
 * announced; this says what is genuinely new, in the order the state named it.
 * @param announced - the ids already announced; not mutated.
 * @param ids - the ids the current state names.
 * @returns the ids to announce, possibly empty.
 */
export function freshIds(announced: ReadonlySet<string>, ids: readonly string[]): string[] {
  const fresh: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (id === '' || announced.has(id) || seen.has(id)) continue
    seen.add(id)
    fresh.push(id)
  }
  return fresh
}

/**
 * What clicking one row in the console's tree should do.
 *
 * A Session this Host has written *is* a real Session, so it opens in DSH's own
 * conversation page — its header, its tabs, its history paging — rather than in
 * the console's pane. The pane is what a mirror looks like when there is nothing
 * else to show it with, so it stays the answer for every other row, and for
 * every row on a build whose shell offers no way to open a Session.
 * @param materialized - the Sessions the state says are written, by id.
 * @param sessionId - the row that was clicked.
 * @param officialAvailable - whether the shell's own open is reachable.
 * @returns which pane the click means.
 */
export function rowTarget(
  materialized: ReadonlySet<string>,
  sessionId: string,
  officialAvailable: boolean,
): 'official' | 'mirror' {
  return officialAvailable && materialized.has(sessionId) ? 'official' : 'mirror'
}
