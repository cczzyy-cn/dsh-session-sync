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
 * would have to travel through the bundle.
 *
 * **It is read once, at module load, and then frozen.** Reading it per call answers
 * "what is installed" rather than "what is this process running", and those are the
 * two different things this whole module exists to tell apart: after `pnpm update`
 * with no restart, a per-call reading has the *running* process announce the new
 * version while its loaded code is still the old one — a false agreement, which is
 * exactly the failure the handshake was built to expose. It happened here (the
 * origin reported `0.10.4` while running `0.10.0`'s dispatcher), and the only reason
 * it was caught is that a new state *field* appeared that the old code could not
 * have produced.
 *
 * A manifest that cannot be found or parsed is `unknown` — never a guess, and never
 * a version this process cannot vouch for.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The two places `package.json` sits relative to this module's two homes. */
const CANDIDATES = ['../package.json', '../../package.json'] as const

/**
 * This package's own version, as of the moment this build was loaded.
 * @returns the `version` field of this package's manifest, or `unknown`.
 */
export const pluginVersion: () => string = (() => {
  for (const candidate of CANDIDATES) {
    try {
      const path = fileURLToPath(new URL(candidate, import.meta.url))
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { name?: unknown; version?: unknown }
      // Checked by name as well: `../../package.json` from a source checkout one
      // level deeper than expected could be some other manifest entirely, and a
      // version that belongs to another package is worse than none.
      if (parsed.name === 'dsh-session-sync' && typeof parsed.version === 'string') {
        const read = parsed.version
        return () => read
      }
    } catch {
      // Try the next location; a bundle has one, a source checkout the other.
    }
  }
  return () => 'unknown'
})()
