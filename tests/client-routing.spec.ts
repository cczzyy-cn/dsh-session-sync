/**
 * The browser half's two decisions, under test.
 *
 * The rest of that half is rendering, which needs `react` and the shipped UI
 * packages — neither resolves from this package, which is why every other test
 * here is Host-side. These two are the parts that decide *what happens* rather
 * than what it looks like, so they live in `routing.ts` with no imports and are
 * pinned here. Before this file they were inline in `SyncPanel` and had been
 * exercised only by hand, in a browser, on the deployed server.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { freshIds, rowTarget } from '../src/client/routing.ts'

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
