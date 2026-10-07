/**
 * The two dictionaries, held to each other.
 *
 * `en` is declared as `Record<SessionSyncKey, string>`, so a key added to one
 * dictionary and forgotten in the other is a *type* error — and the type gate this
 * package runs lists type mismatches without failing on them (they are noise from
 * the half whose upstream packages only resolve under the bundler). So the one
 * thing the declaration cannot be trusted to catch is checked here instead, where
 * it fails the build.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { en, zh } from '../src/client/locales.ts'

describe('the plugin’s dictionaries', () => {
  it('carry exactly the same keys', () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  })

  it('carry exactly the same placeholders', () => {
    // A key like `{n} missing` is filled by name, so a dictionary that spells the
    // placeholder differently prints it literally — the failure ships as visible
    // braces rather than as an error, which is why it is checked rather than
    // assumed. (An empty string is legitimate: English needs no plural suffix
    // where Chinese writes one, and `retryAttempts` is exactly that.)
    for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
      assert.deepEqual(placeholders(zh[key]), placeholders(en[key]), `placeholders of ${key}`)
    }
  })
})

/** The `{name}` slots one template carries, in the order they appear. */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map(match => match[1] ?? '')
}
