/**
 * The live text one attempt is showing, per kind.
 *
 * The bug this pins was reported as "the thinking only appears once it has
 * finished". A step streams its reasoning and then its answer through one attempt
 * id, and the relay carries each kind's whole text so far. With a single
 * accumulator per attempt, the first answer delta is not an extension of the
 * reasoning text, so it looked like the one case that must restart — and the restart
 * path retires the attempt's live rows, tearing the thinking down exactly when the
 * answer began.
 *
 * So the regression case is the middle one below: reasoning, then answer, on one
 * attempt, with a healthy delta and no restart.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { LiveText } from '../src/client/live-text.ts'

const ATTEMPT = 'attempt-1'

describe('the live text one attempt is showing', () => {
  it('reports only the new part of a growing text', () => {
    const live = new LiveText()
    assert.deepEqual(live.take(ATTEMPT, 'text', 'Hel'), { delta: 'Hel', restarted: false })
    assert.deepEqual(live.take(ATTEMPT, 'text', 'Hello'), { delta: 'lo', restarted: false })
    assert.deepEqual(live.take(ATTEMPT, 'text', 'Hello'), { delta: '', restarted: false })
  })

  it('does not treat an answer after reasoning as a restart', () => {
    // The regression: one attempt, two kinds, neither replacing the other.
    const live = new LiveText()
    live.take(ATTEMPT, 'reasoning', 'let me check the file')
    const answer = live.take(ATTEMPT, 'text', 'Here is the answer')
    assert.deepEqual(answer, { delta: 'Here is the answer', restarted: false })
    // And the reasoning is still its own text afterwards, not clobbered by it.
    assert.deepEqual(
      live.take(ATTEMPT, 'reasoning', 'let me check the file twice'),
      { delta: ' twice', restarted: false },
    )
  })

  it('still calls a text that was replaced a restart', () => {
    const live = new LiveText()
    live.take(ATTEMPT, 'text', 'first attempt')
    // Different text for the same kind: the caller must retire the row, because the
    // shipped fold would otherwise append it onto the text already shown.
    assert.deepEqual(live.take(ATTEMPT, 'text', 'second'), { delta: 'second', restarted: true })
  })

  it('forgets every kind of one attempt, and only that attempt', () => {
    const live = new LiveText()
    live.take(ATTEMPT, 'reasoning', 'r')
    live.take(ATTEMPT, 'text', 't')
    live.take('attempt-2', 'text', 'other')
    live.take('attempt-10', 'text', 'the trap: a prefix of attempt-1')
    live.forget(ATTEMPT)
    // Both kinds of the settled attempt start over...
    assert.equal(live.take(ATTEMPT, 'reasoning', 'r').restarted, false)
    assert.equal(live.take(ATTEMPT, 'text', 't').restarted, false)
    // ...while another attempt's text is untouched, including one whose id merely
    // starts with the same characters.
    assert.deepEqual(live.take('attempt-2', 'text', 'other!'), { delta: '!', restarted: false })
    assert.deepEqual(live.take('attempt-10', 'text', 'the trap: a prefix of attempt-1!'), {
      delta: '!',
      restarted: false,
    })
  })

  it('clears everything when the whole window is replaced', () => {
    const live = new LiveText()
    live.take(ATTEMPT, 'text', 'shown')
    live.clear()
    assert.deepEqual(live.take(ATTEMPT, 'text', 'fresh'), { delta: 'fresh', restarted: false })
  })
})
