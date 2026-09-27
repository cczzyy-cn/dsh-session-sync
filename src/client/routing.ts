/**
 * The browser half's decisions, in a module with no imports.
 *
 * Three of them: which Sessions a shell refresh has not been asked about yet,
 * what a row click means, and whether the build offers the seam the console
 * draws a foreign Session through. Each is pure, and each was previously inline
 * in a class or a React component — which is why the browser half had no tests
 * at all: a test here cannot import `SyncPanel.tsx` (it needs `react` and the
 * shipped UI packages, neither of which resolves from this package). Naming the
 * decisions and keeping them dependency-free is what puts them under
 * `node --test` on both sides of the build, and it leaves the components with
 * nothing but rendering to get wrong.
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

/**
 * Whether a client Sessions service offers the seam the console draws through.
 *
 * Both halves are required and neither is enough. `retainAgentScope` is what
 * makes a Session the Host has never heard of renderable at all; `binding` is
 * where the window comes from, and a build that retained without one would draw
 * an empty pane — so a service with only the first is read as "no route", which
 * keeps the console's own conversation in charge.
 * @param service - whatever `ctx.get('sessions')` answered, of any shape.
 * @returns whether the scope route is available.
 */
export function scopeCapable(service: unknown): boolean {
  if (typeof service !== 'object' || service === null) return false
  const candidate = service as { retainAgentScope?: unknown; binding?: unknown }
  return typeof candidate.retainAgentScope === 'function' && typeof candidate.binding === 'function'
}
