/**
 * The browser half's one decision, under test.
 *
 * The rest of that half is rendering, which needs `react` and the shipped UI
 * packages — neither resolves from this package, which is why every other test
 * here is Host-side. Whether a build can draw a foreign Session at all is the
 * part that decides *what happens* rather than what it looks like, so it lives
 * in `routing.ts` with no imports and is pinned here.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { scopeCapable } from '../src/client/routing.ts'

describe('whether a build offers the scope route', () => {
  const retainAgentScope = (): object => ({ release: () => undefined })
  const binding = (): undefined => undefined

  it('takes a service that has both halves', () => {
    assert.equal(scopeCapable({ retainAgentScope, binding }), true)
  })

  it('refuses a service that cannot hand out a window', () => {
    // Retaining without a binding draws an empty pane, which is worse than the
    // console's own conversation — so the route needs both, not either.
    assert.equal(scopeCapable({ retainAgentScope }), false)
  })

  it('refuses a service that cannot retain', () => {
    assert.equal(scopeCapable({ binding }), false)
  })

  it('refuses verbs that are not functions', () => {
    assert.equal(scopeCapable({ retainAgentScope: true, binding: true }), false)
  })

  it('refuses whatever the context did not hold', () => {
    assert.equal(scopeCapable(undefined), false)
    assert.equal(scopeCapable(null), false)
    assert.equal(scopeCapable('sessions'), false)
  })
})
