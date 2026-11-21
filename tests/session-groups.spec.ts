/**
 * The settings page's publish list, grouped by workspace directory.
 *
 * The grouping is a decision, not styling: which Sessions share a project and
 * which project comes first is what a reader scans before publishing anything —
 * so it lives in `session-groups.ts` with no imports and is pinned here. The
 * panel that renders it needs React and the shipped UI packages, neither of which
 * resolves from this package.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sessionGroupsOf } from '../src/client/session-groups.ts'

describe('grouping the publish list by workspace', () => {
  it('keeps Sessions in the order the machine reported them', () => {
    const groups = sessionGroupsOf([
      { sessionId: 'a', cwd: 'C:\\work\\alpha' },
      { sessionId: 'b', cwd: 'C:\\work\\alpha' },
      { sessionId: 'c', cwd: 'C:\\work\\beta' },
    ])
    assert.deepEqual(groups.map(group => group.cwd), ['C:\\work\\alpha', 'C:\\work\\beta'])
    assert.deepEqual(groups[0].sessions.map(session => session.sessionId), ['a', 'b'])
    assert.deepEqual(groups[1].sessions.map(session => session.sessionId), ['c'])
  })

  it('puts Sessions with no directory in one group, after the directories', () => {
    const groups = sessionGroupsOf([
      { sessionId: 'loose' },
      { sessionId: 'a', cwd: 'C:\\work\\alpha' },
      { sessionId: 'also-loose' },
    ])
    assert.deepEqual(groups.map(group => group.cwd), ['C:\\work\\alpha', undefined])
    assert.deepEqual(groups[1].sessions.map(session => session.sessionId), ['loose', 'also-loose'])
  })

  it('orders directories by path', () => {
    const groups = sessionGroupsOf([
      { sessionId: 'b', cwd: 'C:\\work\\beta' },
      { sessionId: 'a', cwd: 'C:\\work\\alpha' },
    ])
    assert.deepEqual(groups.map(group => group.cwd), ['C:\\work\\alpha', 'C:\\work\\beta'])
  })

  it('returns nothing for a machine with no Sessions', () => {
    assert.deepEqual(sessionGroupsOf([]), [])
  })
})
