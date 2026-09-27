/**
 * The version of this plugin, as the running build states it.
 *
 * Two halves of one deployment are routinely different builds: an origin loads
 * its Host half at process start and keeps it until it is restarted, while a
 * server's Host half follows whatever `pnpm install` last put there. Nothing in
 * the protocol used to say so, and the way that was noticed was reading two
 * lockfiles by hand — the origin ran `0.7.1` for hours against a server on
 * `0.7.3`, and a state frame that had carried one string would have said it at a
 * glance.
 *
 * The manifest is located relative to this module rather than imported: the
 * built bundle lives in `lib/` and the sources in `src/host/`, a JSON import
 * would have to travel through the bundle, and the value is read once at
 * runtime. A manifest that cannot be found or parsed is `unknown` — never a
 * guess, and never a version this process cannot vouch for.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The two places `package.json` sits relative to this module's two homes. */
const CANDIDATES = ['../package.json', '../../package.json'] as const

/**
 * Read this package's own version.
 * @returns the `version` field of this package's manifest, or `unknown`.
 */
export function pluginVersion(): string {
  for (const candidate of CANDIDATES) {
    try {
      const path = fileURLToPath(new URL(candidate, import.meta.url))
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { name?: unknown; version?: unknown }
      // Checked by name as well: `../../package.json` from a source checkout one
      // level deeper than expected could be some other manifest entirely, and a
      // version that belongs to another package is worse than none.
      if (parsed.name === 'dsh-session-sync' && typeof parsed.version === 'string') return parsed.version
    } catch {
      // Try the next location; a bundle has one, a source checkout the other.
    }
  }
  return 'unknown'
}
