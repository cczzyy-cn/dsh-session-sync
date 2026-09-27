/**
 * The version a running build states about itself.
 *
 * This is the reading that would have caught the deployment where the origin ran
 * `0.7.1` for hours against a server on `0.7.3`: nothing in the protocol said
 * which build was on either end, so the only way to find out was to read both
 * lockfiles by hand.
 *
 * The function is deliberately forgiving about *where* the manifest is — the
 * built bundle sits in `lib/`, the sources in `src/host/`, and both have to
 * resolve the same file — but not about *what* it finds: a manifest that is not
 * this package's is reported as `unknown` rather than as a version that belongs
 * to something else.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pluginVersion } from '../src/host/version.ts'

describe('the plugin version a build states', () => {
  it('reads this package\u2019s own manifest', () => {
    // Run from `src/`, so this also pins the source-side candidate list: the
    // answer has to be a real version, not `unknown`.
    assert.match(pluginVersion(), /^\d+\.\d+\.\d+/u)
  })
})
