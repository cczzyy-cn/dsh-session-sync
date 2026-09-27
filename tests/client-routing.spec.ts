/**
 * The browser half's decisions, under test.
 *
 * The rest of that half is rendering, which needs `react` and the shipped UI
 * packages — neither resolves from this package, which is why every other test
 * here is Host-side. These are the parts that decide *what happens* rather than
 * what it looks like, so they live in `routing.ts` with no imports and are
 * pinned here. Before this file they were inline in `SyncPanel` and in the
 * renderer bridge, and had been exercised only by hand, in a browser, on the
 * deployed server.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { freshIds, rowTarget, scopeCapable } from '../src/client/routing.ts'

describe('announcing the Sessions a Host has written', () => {
  it('names only the ids that are new', () => {
    const announced = new Set(['session-a'])
    assert.deepEqual(freshIds(announced, ['session-a', 'session-b', 'session-c']), ['session-b', 'session-c'])
  })

  it('says nothing when nothing is new', () => {
    // The common case: a state frame arrives, the set is unchanged, and a shell
    // refresh must not be asked for again.
    const announced = new Set(['session-a', 'session-b'])
    assert.deepEqual(freshIds(announced, ['session-a', 'session-b']), [])
  })

  it('names an id once even when the state repeats it', () => {
    assert.deepEqual(freshIds(new Set(), ['session-a', 'session-a']), ['session-a'])
  })

  it('skips the empty id a joined set leaves behind', () => {
    // The panel joins the set into one string to keep the effect's dependency
    // stable, so an empty set arrives as a single empty field.
    assert.deepEqual(freshIds(new Set(), ['', 'session-a']), ['session-a'])
  })

  it('does not mutate what it was given', () => {
    const announced = new Set(['session-a'])
    freshIds(announced, ['session-b'])
    assert.deepEqual([...announced], ['session-a'])
  })
})

describe('what a row click means', () => {
  const written = new Set(['session-written'])

  it('opens DSH\u2019s own page for a Session this Host has written', () => {
    assert.equal(rowTarget(written, 'session-written', true), 'official')
  })

  it('keeps the console pane for a Session it has not written', () => {
    assert.equal(rowTarget(written, 'session-mirrored-only', true), 'mirror')
  })

  it('keeps the console pane when the shell offers no way to open a Session', () => {
    // A build whose client has no workspace navigation still has to be able to
    // read a mirror: the pane is the fallback, not a leftover.
    assert.equal(rowTarget(written, 'session-written', false), 'mirror')
  })
})

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
