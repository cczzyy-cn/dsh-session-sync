/**
 * The browser half's one decision, in a module with no imports.
 *
 * A test here cannot import `SyncPanel.tsx` (it needs `react` and the shipped UI
 * packages, neither of which resolves from this package), so the part that
 * decides *whether a build can draw a foreign Session at all* is named and kept
 * dependency-free. That puts it under `node --test` on both sides of the build,
 * and it leaves the renderer with nothing but rendering to get wrong.
 */

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
