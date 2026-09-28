/**
 * The two-sided race for one question.
 *
 * A question has two legitimate answerers — the person at the machine that owns
 * the Session, and the person watching it in the sync console — and upstream's
 * seam is a waterfall where the first answer to return claims the request. So
 * both are asked at once and the first one wins.
 *
 * What these tests pin is the part that is easy to get wrong and impossible to
 * see from either end: that a race has exactly one winner, that the loser is
 * *told* rather than silently ignored, and that a console answering a question
 * the machine already answered is refused with a reason instead of overwriting a
 * decision a human already made.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SyncHub } from '../src/host/hub.ts'
import { InteractionRelay } from '../src/host/interactions.ts'
import type { AskUserQuestionAnswerLike, AskUserQuestionItemLike } from '../src/host/dsh.ts'
import {
  OFFLINE_AFTER_MS,
  type DownstreamCommand,
  type SyncStreamFrame,
} from '../src/shared/protocol.ts'

const MACHINE = 'race-origin'
const SESSION = 'session-race-0000-0000-000000000000'
const LOGGER = { info: () => {}, warn: () => {}, error: () => {} }

/** One question, with two options and a single-select default. */
const QUESTIONS: AskUserQuestionItemLike[] = [
  { id: 'q1', question: 'Which one?', options: [{ label: 'a' }, { label: 'b' }] },
]

/** One answer the local UI would produce. */
function localAnswer(label: string): AskUserQuestionAnswerLike {
  return { answers: [{ id: 'q1', selected: [label] }] }
}

/** A relay with a recording sink and a clock a test can move. */
function bench(ttlMs?: number): {
  relay: InteractionRelay
  frames: { kind: 'open' | 'close'; questionId: string; outcome?: string }[]
  advance: (ms: number) => void
} {
  const frames: { kind: 'open' | 'close'; questionId: string; outcome?: string }[] = []
  let clock = 1_700_000_000_000
  const relay = new InteractionRelay({
    open: (_sessionId, questionId) => { frames.push({ kind: 'open', questionId }) },
    close: (_sessionId, questionId, outcome) => { frames.push({ kind: 'close', questionId, outcome }) },
    now: () => clock,
  }, ttlMs)
  return { relay, frames, advance: (ms: number) => { clock += ms } }
}

/** An answerer that never answers, for the tests where the console must win. */
function silent(): Promise<AskUserQuestionAnswerLike> {
  return new Promise<AskUserQuestionAnswerLike>(() => {})
}

describe('the race between the console and the machine', () => {
  it('does not touch the link for a question with no Session to relay it for', async () => {
    const { relay, frames } = bench()
    let asked = false
    const answer = await relay.race(undefined, QUESTIONS, async () => {
      asked = true
      return localAnswer('a')
    })
    assert.equal(asked, true)
    assert.deepEqual(answer, localAnswer('a'))
    assert.equal(frames.length, 0)
  })

  it('takes the local answer and withdraws the card when the machine answers first', async () => {
    const { relay, frames } = bench()
    const answer = await relay.race(SESSION, QUESTIONS, async () => localAnswer('a'))
    assert.deepEqual(answer, localAnswer('a'))
    assert.deepEqual(relay.counts(), {
      open: 0, answeredLocally: 1, answeredRemotely: 0, lateAnswers: 0, aborted: 0,
    })
    // Opened, then withdrawn *with the reason*: a console that only saw the card
    // vanish could not tell "answered here" from "the machine went away".
    assert.deepEqual(frames.map(frame => frame.kind), ['open', 'close'])
    assert.equal(frames[1]?.outcome, 'answered-at-origin')
  })

  it('takes the console answer and leaves the card to the console to close', async () => {
    const { relay, frames } = bench()
    const pending = relay.race(SESSION, QUESTIONS, silent)
    const questionId = frames[0]?.questionId ?? ''
    assert.deepEqual(relay.claim(questionId, [{ id: 'q1', selected: ['b'] }], 'cmd-1'), { ok: true })
    assert.deepEqual(await pending, localAnswer('b'))
    assert.equal(relay.counts().answeredRemotely, 1)
    // No close frame: the server closed this card itself the moment it accepted
    // the answer, and telling it again would be telling it what it just did.
    assert.deepEqual(frames.map(frame => frame.kind), ['open'])
  })

  it('refuses a console answer that arrived after the machine answered, and counts it', async () => {
    const { relay, frames } = bench()
    await relay.race(SESSION, QUESTIONS, async () => localAnswer('a'))
    const questionId = frames[0]?.questionId ?? ''
    const late = relay.claim(questionId, [{ id: 'q1', selected: ['b'] }], 'cmd-1')
    assert.equal(late.ok, false)
    assert.match(late.ok ? '' : late.reason, /already answered on the machine/)
    assert.equal(relay.counts().lateAnswers, 1)
  })

  it('accepts a retry of the same command but refuses a second decision', async () => {
    const { relay, frames } = bench()
    const pending = relay.race(SESSION, QUESTIONS, silent)
    const questionId = frames[0]?.questionId ?? ''
    assert.deepEqual(relay.claim(questionId, [{ id: 'q1', selected: ['a'] }], 'cmd-1'), { ok: true })
    // The same command again is the same decision, so it acknowledges as taken.
    assert.deepEqual(relay.claim(questionId, [{ id: 'q1', selected: ['a'] }], 'cmd-1'), { ok: true })
    // A different command is a second decision, and must not overwrite the first.
    const second = relay.claim(questionId, [{ id: 'q1', selected: ['b'] }], 'cmd-2')
    assert.equal(second.ok, false)
    assert.match(second.ok ? '' : second.reason, /already answered from the console/)
    assert.deepEqual(await pending, localAnswer('a'))
  })

  it('propagates an aborted ask and withdraws the card', async () => {
    const { relay, frames } = bench()
    await assert.rejects(
      relay.race(SESSION, QUESTIONS, async () => { throw new Error('the turn was aborted') }),
      /the turn was aborted/,
    )
    assert.equal(relay.counts().aborted, 1)
    assert.deepEqual(frames.map(frame => frame.kind), ['open', 'close'])
    assert.equal(frames[1]?.outcome, 'aborted')
  })

  it('refuses a choice the asker never offered', async () => {
    const { relay, frames } = bench()
    const pending = relay.race(SESSION, QUESTIONS, silent)
    const questionId = frames[0]?.questionId ?? ''
    const forged = relay.claim(questionId, [{ id: 'q1', selected: ['never-offered'] }], 'cmd-1')
    assert.equal(forged.ok, false)
    assert.match(forged.ok ? '' : forged.reason, /never offered/)
    const unknown = relay.claim(questionId, [{ id: 'q-other', selected: [] }], 'cmd-1')
    assert.equal(unknown.ok, false)
    assert.match(unknown.ok ? '' : unknown.reason, /which was not asked/)
    const multi = relay.claim(questionId, [{ id: 'q1', selected: ['a', 'b'] }], 'cmd-1')
    assert.equal(multi.ok, false)
    assert.match(multi.ok ? '' : multi.reason, /single-select/)
    // Nothing above claimed it, so the honest answer still works.
    assert.deepEqual(relay.claim(questionId, [{ id: 'q1', selected: ['a'] }], 'cmd-1'), { ok: true })
    await pending
  })

  it('answers every question the machine asked, in the order it asked them', async () => {
    const { relay, frames } = bench()
    const two: AskUserQuestionItemLike[] = [
      { id: 'q1', question: 'First?', options: [{ label: 'a' }] },
      { id: 'q2', question: 'Second?', options: [{ label: 'x' }, { label: 'y' }], multiSelect: true },
    ]
    const pending = relay.race(SESSION, two, silent)
    const questionId = frames[0]?.questionId ?? ''
    assert.deepEqual(relay.claim(questionId, [{ id: 'q2', selected: ['x', 'y'] }], 'cmd-1'), { ok: true })
    // The skipped question stays in the batch as an empty choice — the shape the
    // local UI produces — rather than disappearing from the tool's result.
    assert.deepEqual(await pending, {
      answers: [{ id: 'q1', selected: [] }, { id: 'q2', selected: ['x', 'y'] }],
    })
  })

  it('refuses an answer that outlived the question', async () => {
    const { relay, frames, advance } = bench(60_000)
    const pending = relay.race(SESSION, QUESTIONS, silent)
    const questionId = frames[0]?.questionId ?? ''
    advance(60_001)
    const late = relay.claim(questionId, [{ id: 'q1', selected: ['a'] }], 'cmd-1')
    assert.equal(late.ok, false)
    assert.match(late.ok ? '' : late.reason, /expired/)
    // The local side is still in the race, so the ask itself is not failed here.
    assert.equal(relay.counts().open, 1)
    void pending
  })

  it('withdraws every open question when the machine goes away', () => {
    const { relay, frames } = bench()
    void relay.race(SESSION, QUESTIONS, silent)
    relay.withdrawAll()
    assert.equal(relay.counts().open, 0)
    assert.deepEqual(frames.map(frame => frame.kind), ['open', 'close'])
    assert.equal(frames[1]?.outcome, 'aborted')
  })
})

/** A hub with one published Session and a recording origin stream. */
function hubBench(): {
  hub: SyncHub
  frames: SyncStreamFrame[]
  sent: DownstreamCommand[]
  detach: () => void
} {
  const frames: SyncStreamFrame[] = []
  const sent: DownstreamCommand[] = []
  const hub = new SyncHub(frame => { frames.push(frame) }, () => ({}) as never, LOGGER)
  hub.publishIndex({
    machineName: MACHINE,
    sessions: [{ sessionId: SESSION, title: 'x', updatedAt: 1, running: false }],
  })
  const detach = hub.attachOrigin(MACHINE, {
    send: (command: DownstreamCommand) => { sent.push(command) },
    resync: () => {},
    older: () => {},
  })
  return { hub, frames, sent, detach }
}

/** The question frames a hub emitted, open or closed. */
function questions(frames: readonly SyncStreamFrame[]): { questionId: string; closed?: string }[] {
  return frames.flatMap(frame => frame.type === 'question'
    ? [{ questionId: frame.question.questionId, ...(frame.question.closed === undefined ? {} : { closed: frame.question.closed }) }]
    : [])
}

describe('relayed questions at the server', () => {
  it('offers a question for a published Session and holds it while it is open', () => {
    const { hub, frames } = hubBench()
    hub.openQuestion(MACHINE, {
      sessionId: SESSION, questionId: 'q-1', questions: [{ id: 'q1', question: '?' }],
      expiresAt: Date.now() + 60_000,
    })
    assert.deepEqual(questions(frames), [{ questionId: 'q-1' }])
    assert.equal(hub.questions().length, 1)
  })

  it('ignores a question for a Session this server does not mirror', () => {
    const { hub, frames } = hubBench()
    hub.openQuestion(MACHINE, {
      sessionId: 'session-not-published', questionId: 'q-1', questions: [{ id: 'q1', question: '?' }],
      expiresAt: Date.now() + 60_000,
    })
    assert.deepEqual(questions(frames), [])
    assert.equal(hub.questions().length, 0)
  })

  it('refuses an answer to a question that is no longer waiting', () => {
    const { hub } = hubBench()
    const refused = hub.submitAnswer(MACHINE, 'q-gone', [{ id: 'q1', selected: ['a'] }], 'console')
    assert.equal(refused.ok, false)
    assert.match(refused.ok ? '' : refused.reason, /no longer waiting/)
  })

  it('sends an answer down the command lifecycle and closes the card when claimed', () => {
    const { hub, frames, sent } = hubBench()
    hub.openQuestion(MACHINE, {
      sessionId: SESSION, questionId: 'q-1', questions: [{ id: 'q1', question: '?' }],
      expiresAt: Date.now() + 60_000,
    })
    const accepted = hub.submitAnswer(MACHINE, 'q-1', [{ id: 'q1', selected: ['a'] }], 'console')
    assert.equal(accepted.ok, true)
    const command = sent[0]
    assert.equal(command?.kind, 'answer')
    assert.equal(command !== undefined && command.kind === 'answer' ? command.questionId : '', 'q-1')
    const commandId = accepted.ok ? accepted.commandId : ''
    hub.ackCommand(MACHINE, { commandId, sessionId: SESSION, ok: true })
    // Claimed by the machine, so the console stops offering a taken decision.
    assert.deepEqual(questions(frames).at(-1), { questionId: 'q-1', closed: 'answered-at-console' })
    assert.equal(hub.questions().length, 0)
  })

  it('leaves an open question alone when a prompt is acknowledged', () => {
    const { hub, sent } = hubBench()
    hub.openQuestion(MACHINE, {
      sessionId: SESSION, questionId: 'q-1', questions: [{ id: 'q1', question: '?' }],
      expiresAt: Date.now() + 60_000,
    })
    const prompt = hub.submitCommand(MACHINE, SESSION, 'hello', 'console')
    assert.equal(prompt.ok, true)
    assert.equal(sent.length, 1)
    hub.ackCommand(MACHINE, { commandId: prompt.ok ? prompt.commandId : '', sessionId: SESSION, ok: true })
    assert.equal(hub.questions().length, 1)
  })

  it('retires a question whose TTL passed, and one whose machine stopped appearing', () => {
    const { hub, frames, detach } = hubBench()
    const now = Date.now()
    hub.openQuestion(MACHINE, {
      sessionId: SESSION, questionId: 'q-ttl', questions: [{ id: 'q1', question: '?' }],
      expiresAt: now + 1_000,
    })
    hub.sweepQuestions(now + 2_000)
    assert.deepEqual(questions(frames).at(-1), { questionId: 'q-ttl', closed: 'expired' })

    hub.openQuestion(MACHINE, {
      sessionId: SESSION, questionId: 'q-offline', questions: [{ id: 'q1', question: '?' }],
      expiresAt: now + 10 * 60_000,
    })
    // The stream going away is what "stopped appearing" means; a machine with a
    // live stream is online however long its questions sit there.
    detach()
    hub.sweepQuestions(now + OFFLINE_AFTER_MS + 1_000)
    assert.deepEqual(questions(frames).at(-1), { questionId: 'q-offline', closed: 'offline' })
    assert.equal(hub.questions().length, 0)
  })

  it('bounds how many questions one machine may leave open', () => {
    const { hub, frames } = hubBench()
    for (let index = 0; index < 33; index += 1) {
      hub.openQuestion(MACHINE, {
        sessionId: SESSION,
        questionId: `q-${String(index)}`,
        questions: [{ id: 'q1', question: '?' }],
        expiresAt: Date.now() + 60_000,
      })
    }
    assert.equal(hub.questions().length, 32)
    // The oldest ask is the one that goes, and it goes with a reason so a reader
    // is never left wondering where the card went.
    assert.deepEqual(
      questions(frames).filter(question => question.closed !== undefined),
      [{ questionId: 'q-0', closed: 'expired' }],
    )
  })
})
