/**
 * Where the configuration is offered, and the one line that describes it.
 *
 * The Plugins page's detail section renders on *every* detail page, so the guard
 * is not decoration: without it this plugin's form would appear under every
 * installed plugin's page. Both functions here are pure, which is why the
 * decision can be asserted without a renderer — and why they live in a `.ts`
 * module, since the test runner cannot load a `.tsx` one.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ownsSubject, summaryOf } from '../src/client/config-entry.ts'
import { defaultConfig } from '../src/shared/protocol.ts'
import type { SyncConfig } from '../src/shared/protocol.ts'

/** The dictionary the summary reads, spelled out rather than imported. */
const t = (key: string): string => ({ roleServer: 'Server', roleClient: 'Client' })[key] ?? key

/** A configuration with the fields the summary reads. */
function config(extra: Partial<SyncConfig> = {}): SyncConfig {
  return { ...defaultConfig('DESKTOP-TEST'), ...extra }
}

describe('the pages this plugin puts its configuration on', () => {
  it('claims its own bundle page', () => {
    assert.equal(ownsSubject({ kind: 'bundle', pkg: { name: 'dsh-session-sync' } }), true)
  })

  it('claims its own row page', () => {
    assert.equal(ownsSubject({
      kind: 'row',
      pkg: { name: 'dsh-session-sync' },
      row: { rowId: 'session-sync' },
    }), true)
  })

  it('leaves every other plugin\'s pages alone', () => {
    // The failure this pins is the form appearing under another plugin's page,
    // which is what an unguarded section contribution does.
    assert.equal(ownsSubject({ kind: 'bundle', pkg: { name: 'vision' } }), false)
    assert.equal(ownsSubject({ kind: 'row', pkg: { name: 'vision' }, row: { rowId: 'session-sync' } }), false)
  })

  it('leaves another row of this bundle alone', () => {
    assert.equal(ownsSubject({
      kind: 'row',
      pkg: { name: 'dsh-session-sync' },
      row: { rowId: 'something-else' },
    }), false)
  })

  it('claims nothing for an official plugin card, and nothing without a subject', () => {
    assert.equal(ownsSubject({ kind: 'item', id: 'session-sync' }), false)
    assert.equal(ownsSubject(undefined), false)
    assert.equal(ownsSubject({ kind: 'bundle' }), false)
  })
})

describe('the summary line', () => {
  it('reads a publisher as a machine with somewhere to publish to', () => {
    const line = summaryOf(t, config({ machineName: 'origin', serverUrl: '10.0.0.9:8791' }))
    assert.equal(line, 'origin · Client · 10.0.0.9:8791')
  })

  it('reads a server by the address it listens on, not by a server it publishes to', () => {
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
    const line = summaryOf(t, config({ machineName: '', serverUrl: 'hub:8791' }))
    assert.equal(line, 'Client · hub:8791')
  })
})
