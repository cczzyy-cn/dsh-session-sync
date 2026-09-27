/**
 * The console's tree, as a decision under test.
 *
 * The ordering rules are the ones a reader feels rather than sees: machines that
 * swap rows as they publish look like the list is jumping, a running Session
 * buried under finished ones hides the one thing that is happening, and a search
 * that keeps an empty machine shows a branch with nothing in it. Each of those is
 * pinned here, in a module with no imports to resolve.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildTree } from '../src/client/tree.ts'
import type { MirroredMachine, MirroredSession } from '../src/shared/protocol.ts'

/** One mirrored Session row, with everything the tree reads. */
function session(id: string, extra: Partial<MirroredSession> = {}): MirroredSession {
  return {
    sessionId: id,
    title: id,
    updatedAt: 1,
    running: false,
    eventCount: 0,
    missingEvents: 0,
    holes: 0,
    behind: 0,
    ...extra,
  }
}

/** One machine row. */
function machine(name: string, sessions: MirroredSession[], lastSeen = 1): MirroredMachine {
  return { machineName: name, online: true, lastSeen, sessions }
}

describe('the console tree', () => {
  it('orders machines by name, not by the order the mirror lists them', () => {
    // The mirror lists machines by last activity, so a publish from either one
    // would swap the rows and the list would appear to jump.
    const tree = buildTree([
      machine('zeta', [session('a')], 100),
      machine('alpha', [session('b')], 1),
    ], '')
    assert.deepEqual(tree.map(group => group.machine.machineName), ['alpha', 'zeta'])
  })

  it('lifts a running Session above finished ones, then takes the newest', () => {
    const tree = buildTree([machine('m', [
      session('old', { updatedAt: 1 }),
      session('live', { running: true, updatedAt: 1 }),
      session('new', { updatedAt: 50 }),
    ])], '')
    assert.deepEqual(tree[0]?.projects[0]?.sessions.map(row => row.sessionId), ['live', 'new', 'old'])
  })

  it('groups Sessions by directory, ordered by path', () => {
    const tree = buildTree([machine('m', [
      session('b', { cwd: 'C:\\work\\b' }),
      session('a', { cwd: 'C:\\work\\a' }),
      session('a2', { cwd: 'C:\\work\\a' }),
    ])], '')
    assert.deepEqual(tree[0]?.projects.map(project => project.cwd), ['C:\\work\\a', 'C:\\work\\b'])
    assert.deepEqual(tree[0]?.projects[0]?.sessions.map(row => row.sessionId), ['a', 'a2'])
  })

  it('keeps a Session with no directory in its own group', () => {
    // A Session whose index carried no `cwd` still has to be listed somewhere.
    const tree = buildTree([machine('m', [session('nocwd'), session('cwd', { cwd: 'C:\\work' })])], '')
    assert.deepEqual(tree[0]?.projects.map(project => project.cwd), ['', 'C:\\work'])
  })

  it('drops a machine and a directory with nothing left after a search', () => {
    const tree = buildTree([
      machine('hit', [session('one', { title: 'needle here' })]),
      machine('miss', [session('two', { title: 'nothing' })]),
    ], 'needle')
    assert.deepEqual(tree.map(group => group.machine.machineName), ['hit'])
  })

  it('matches on title, directory and id, case-insensitively', () => {
    const tree = buildTree([machine('m', [
      session('id-abc', { title: 'Title', cwd: 'C:\\Work\\Dir' }),
      session('other', { title: 'elsewhere' }),
    ])], '  WORK\\d  ')
    assert.deepEqual(tree[0]?.projects[0]?.sessions.map(row => row.sessionId), ['id-abc'])
    assert.deepEqual(
      buildTree([machine('m', [session('SESSION-XYZ')])], 'session-xyz')[0]?.projects[0]?.sessions.length,
      1,
      'the id is searchable, which is all an un-published row has',
    )
  })
})
