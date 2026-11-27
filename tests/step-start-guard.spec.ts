/**
 * The one durable event the shipped conversation assembler refuses.
 *
 * `trajectory-assistant-step` contexts take exactly one start; a second start (a
 * retried step) or a start after any other event for that step (live chunks
 * arriving before the durable batch) throws from the assembler, and that throw
 * kills the session-controller's whole event feed. These cases pin the drop rule.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { StepStartGuard, stepKeyOf } from '../src/client/step-start-guard.ts'

const turnStart = (turn: number) => ({ type: 'turn/start', data: { turn } })
const stepStart = (turn: number, step: number) => ({ type: 'step/start', data: { turn, step } })
const assistant = (turn: number, step: number) => ({ type: 'assistant/message', data: { turn, step } })

describe('the step-start guard', () => {
  it('lets the first start through and refuses the retried second one', () => {
    const guard = new StepStartGuard()
    assert.equal(guard.refuses(stepStart(1, 2).type, stepStart(1, 2).data), false)
    guard.note(stepStart(1, 2).type, stepStart(1, 2).data)
    assert.equal(guard.refuses(stepStart(1, 2).type, stepStart(1, 2).data), true)
  })

  it('refuses a start after any other event for the same step', () => {
    const guard = new StepStartGuard()
    guard.note(assistant(3, 4).type, assistant(3, 4).data)
    assert.equal(guard.refuses(stepStart(3, 4).type, stepStart(3, 4).data), true)
    // A different step is untouched.
    assert.equal(guard.refuses(stepStart(3, 5).type, stepStart(3, 5).data), false)
  })

  it('takes a step-only start after the turn/start that names its turn', () => {
    const guard = new StepStartGuard()
    guard.note(turnStart(7).type, turnStart(7).data)
    const start = { type: 'step/start', data: { step: 2 } }
    assert.equal(guard.refuses(start.type, start.data), false)
    guard.note(start.type, start.data)
    assert.equal(guard.refuses(assistant(7, 2).type, assistant(7, 2).data), false)
    assert.equal(guard.refuses(start.type, start.data), true)
  })

  it('marks a step active from the live stream before its durable start', () => {
    const guard = new StepStartGuard()
    guard.noteLive(5, 6)
    assert.equal(guard.refuses(stepStart(5, 6).type, stepStart(5, 6).data), true)
    // A durable start that carries only the step is attributed to the live turn.
    const stepOnly = { type: 'step/start', data: { step: 6 } }
    assert.equal(guard.refuses(stepOnly.type, stepOnly.data), true)
    // A start for another step is still legal.
    assert.equal(guard.refuses(stepStart(5, 7).type, stepStart(5, 7).data), false)
  })

  it('stays out of the way when the identity cannot be named', () => {
    const guard = new StepStartGuard()
    assert.equal(guard.refuses('step/start', { step: 1 }), false)
    assert.equal(guard.refuses('step/start', undefined), false)
    assert.equal(guard.refuses('assistant/message', { step: 1 }), false)
  })

  it('forgets every mark when the window is replaced', () => {
    const guard = new StepStartGuard()
    guard.note(stepStart(1, 1).type, stepStart(1, 1).data)
    assert.equal(guard.refuses(stepStart(1, 1).type, stepStart(1, 1).data), true)
    guard.reset()
    assert.equal(guard.refuses(stepStart(1, 1).type, stepStart(1, 1).data), false)
  })

  it('keys a step the way the assembler does', () => {
    assert.equal(stepKeyOf({ turn: 4, step: 15 }), '4:15')
  })
})
