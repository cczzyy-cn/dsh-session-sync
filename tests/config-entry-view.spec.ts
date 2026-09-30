/**
 * The configuration entry the Plugins page renders, at its two views.
 *
 * The page asks a configuration entry twice: once for the one-liner under the
 * row's title and once for the form. The one-liner is a fallback the page uses
 * when the row declares no description of its own, so an entry that answered
 * both questions with the form would put a whole page inside that paragraph —
 * the defect this pins. The summary is a pure function of the configuration, so
 * it is the part that can be asserted without a renderer.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { summaryOf } from '../src/client/config-entry.ts'
import { defaultConfig } from '../src/shared/protocol.ts'
import type { SyncConfig } from '../src/shared/protocol.ts'

/** The dictionary the summary reads, spelled out rather than imported. */
const t = (key: string): string => ({ roleServer: 'Server', roleClient: 'Client' })[key] ?? key

/** A configuration with the fields the summary reads. */
function config(extra: Partial<SyncConfig> = {}): SyncConfig {
  return { ...defaultConfig('DESKTOP-TEST'), ...extra }
}

describe('the summary the Plugins page shows for this row', () => {
  it('reads a publisher as a machine with somewhere to publish to', () => {
    const line = summaryOf(t, config({ machineName: 'origin', serverUrl: '10.0.0.9:8791' }))
    assert.equal(line, 'origin · Client · 10.0.0.9:8791')
  })

  it('reads a server by the address it listens on, not by a server it publishes to', () => {
    // A server's own `serverUrl` is not a fact about it: reading that field here
    // would print the address of whatever machine *it* was once configured to
    // publish to.
    const line = summaryOf(t, config({
      machineName: 'hub',
      isServer: true,
      serverUrl: 'stale.example:1',
      listenHost: '0.0.0.0',
      listenPort: 8791,
    }))
    assert.equal(line, 'hub · Server · 0.0.0.0:8791')
  })

  it('keeps the parts it has when a machine has no name yet', () => {
    // The name is empty on a first start; an empty first field must not leave a
    // leading separator behind.
    const line = summaryOf(t, config({ machineName: '', serverUrl: 'hub:8791' }))
    assert.equal(line, 'Client · hub:8791')
  })
})
