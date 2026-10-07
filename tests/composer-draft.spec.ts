/**
 * The takeover prompt, shared by the console's two composer seats.
 *
 * The bug this prevents is not exotic: switching the pane to the trajectory tab
 * unmounts the seat inside the shipped composer stack and mounts the console's own
 * one, and a draft held in either seat's local state dies with it. The reader sees
 * their sentence vanish because they looked at something else.
 *
 * The identity rules are pinned too. Every seat re-reads on a change, and React
 * only bails out of the re-render when the snapshot it is handed is the *same
 * object* — so an untouched Session has to answer one frozen instance rather than
 * a fresh empty one.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ComposerDrafts, draftKey } from '../src/client/composer-draft.ts'

describe('one Session’s unsent prompt', () => {
  it('starts empty and stays one object, so an untouched seat never re-renders', () => {
    const drafts = new ComposerDrafts()
    assert.deepEqual(drafts.read('a'), { text: '', sending: false })
    assert.equal(drafts.read('a'), drafts.read('b'))
  })

  it('carries one draft across the seats that read the same Session', () => {
    const drafts = new ComposerDrafts()
    drafts.setText('a', 'hello')
    // The second seat is this same read: it is what makes the card survive a tab
    // switch, which unmounts the first one.
    assert.equal(drafts.read('a').text, 'hello')
  })

  it('keeps two Sessions apart, including the same id on two machines', () => {
    const drafts = new ComposerDrafts()
    drafts.setText(draftKey('laptop', 's1'), 'from the laptop')
    assert.equal(drafts.read(draftKey('desktop', 's1')).text, '')
  })

  it('tells every seat about a change, and stops when they unsubscribe', () => {
    const drafts = new ComposerDrafts()
    let heard = 0
    const stop = drafts.subscribe(() => { heard += 1 })
    drafts.setText('a', 'x')
    assert.equal(heard, 1)
    // A no-op write is not a change: the textarea's own onChange would otherwise
    // notify on every keystroke that changed nothing.
    drafts.setText('a', 'x')
    assert.equal(heard, 1)
    drafts.setSending('a', true)
    assert.equal(heard, 2)
    stop()
    drafts.setText('a', 'y')
    assert.equal(heard, 2)
  })

  it('survives a listener unsubscribing while it is being told', () => {
    const drafts = new ComposerDrafts()
    const order: string[] = []
    const stop = drafts.subscribe(() => { order.push('first'); stop() })
    drafts.subscribe(() => { order.push('second') })
    drafts.setText('a', 'x')
    assert.deepEqual(order, ['first', 'second'])
    drafts.setText('a', 'y')
    assert.deepEqual(order, ['first', 'second', 'second'])
  })

  it('holds the in-flight flag apart from the text', () => {
    const drafts = new ComposerDrafts()
    drafts.setText('a', 'prompt')
    drafts.setSending('a', true)
    assert.deepEqual(drafts.read('a'), { text: 'prompt', sending: true })
    drafts.setSending('a', false)
    assert.deepEqual(drafts.read('a'), { text: 'prompt', sending: false })
  })

  it('takes a delivered prompt down to the empty seat', () => {
    const drafts = new ComposerDrafts()
    drafts.setText('a', 'prompt')
    drafts.setSending('a', true)
    drafts.clear('a')
    assert.deepEqual(drafts.read('a'), { text: '', sending: false })
  })
})
