/**
 * The two-sided race for one user question.
 *
 * A question is the one interactive event a Session produces, and both people
 * who could answer it are legitimately "the user": whoever is sitting at the
 * machine that owns the Session, and whoever is watching that Session in the
 * sync console. The upstream seam is a waterfall — the first answerer to return
 * an answer claims the request, and `next()` delegates to the answerers behind
 * — so *racing* the two is a matter of asking the local side through `next()`
 * while asking the console down the sync link, and letting whichever settles
 * first be the answer.
 *
 * Three rules this module exists to hold:
 *
 *  - **Exactly one winner.** The console's answer is claimed by id and only
 *    while the question is still pending, so a console that answers after the
 *    machine's own human did is refused with a reason rather than silently
 *    changing a decision that was already made.
 *  - **A refusal is not a failure.** In a race somebody always loses, and the
 *    ordinary loser is the console. The counters distinguish "the machine
 *    answered first" from "the console answered first" from "the ask was
 *    aborted", because from both ends those look identical otherwise.
 *  - **No dangling rejections.** The losing side of a race is never awaited, so
 *    every promise put into it must stay observed — a rejected loser escaping as
 *    an unhandled rejection would take the process down over a question nobody
 *    asked any more.
 *
 * It is deliberately free of Cordis, HTTP, and the link: the wiring lives in the
 * engine and the transport, and everything decided here is decided by a plain
 * function call a test can make.
 */

import {
  QUESTION_TTL_MS,
  type QuestionOutcome,
  type RelayedAnswerItem,
  type RelayedQuestion,
} from '../shared/protocol.ts'
import type { AskUserQuestionAnswerLike, AskUserQuestionItemLike } from './dsh.ts'

/** Where the relay reaches the console. Absent when this machine is a server itself. */
export interface InteractionSink {
  /** Offer one question to the server's console. */
  open(sessionId: string, questionId: string, questions: RelayedQuestion[], expiresAt: number): void
  /**
   * Withdraw one question this machine no longer needs answered elsewhere.
   *
   * Never sent for the console's own answer: the server closes that card the
   * moment it accepts the answer, and telling it again would be telling the
   * server what it just did.
   */
  close(sessionId: string, questionId: string, outcome: QuestionOutcome): void
  /** The clock, injectable so a test can age a question without waiting. */
  now(): number
}

/** What this machine's relayed questions did, for the state view. */
export interface InteractionCounts {
  open: number
  answeredLocally: number
  answeredRemotely: number
  lateAnswers: number
  aborted: number
}

/** Whether one console answer claimed the question, or why it did not. */
export type ClaimResult = { ok: true } | { ok: false; reason: string }

/** One question this machine relayed and is still waiting on. */
interface Pending {
  readonly sessionId: string
  readonly questionId: string
  readonly asked: readonly RelayedQuestion[]
  readonly expiresAt: number
  readonly settle: (answers: RelayedAnswerItem[]) => void
  /**
   * The command that claimed this question, for the retry case.
   *
   * A duplicated answer command must acknowledge as success — the console is
   * asking about a decision it already made — while a *different* command must
   * be refused. Identity, not a boolean, is what tells those apart.
   */
  claimedBy?: string
}

/**
 * Questions already settled, kept only long enough to answer a late console.
 *
 * Bounded like the step-settlement marks in the engine: the ids exist to name a
 * refusal, so a few hundred remembered ones say everything a refusal can say.
 */
const SETTLED_LIMIT = 256

let sequence = 0

/** One identity per asking episode, unique within this process. */
export function mintQuestionId(): string {
  sequence += 1
  return `${Date.now().toString(36)}-${sequence.toString(36)}`
}

/**
 * Cut one live question down to what crosses a wire.
 * @param questions - the asking agent's questions.
 * @returns the relayable shape, with the intent dropped.
 */
export function relayedQuestions(questions: readonly AskUserQuestionItemLike[]): RelayedQuestion[] {
  return questions.map(question => ({
    id: question.id,
    question: question.question,
    ...(question.header === undefined ? {} : { header: question.header }),
    ...(question.detail === undefined ? {} : { detail: question.detail }),
    ...(question.options === undefined
      ? {}
      : { options: question.options.map(option => ({
        label: option.label,
        ...(option.description === undefined ? {} : { description: option.description }),
      })) }),
    ...(question.multiSelect === undefined ? {} : { multiSelect: question.multiSelect }),
  }))
}

/**
 * Turn the console's answers into the shape the asking tool expects.
 *
 * One item per question *the machine asked*, in the order it asked them: a
 * console may answer a subset (a UI is allowed to leave a question skipped), and
 * a skipped question is an empty selection rather than a missing entry — the
 * same shape the local UI produces.
 * @param asked - the questions this episode asked.
 * @param answers - the console's answers, already validated.
 * @returns the answer to hand back to the tool call.
 */
export function relayedAnswer(
  asked: readonly RelayedQuestion[],
  answers: readonly RelayedAnswerItem[],
): AskUserQuestionAnswerLike {
  const byId = new Map(answers.map(answer => [answer.id, answer]))
  return {
    answers: asked.map(question => {
      const answer = byId.get(question.id)
      if (answer === undefined) return { id: question.id, selected: [] }
      const selected = [...new Set(answer.selected)]
      return {
        id: question.id,
        selected,
        ...(answer.custom === undefined ? {} : { custom: answer.custom }),
      }
    }),
  }
}

/**
 * Check one console answer against the questions that were actually asked.
 *
 * A choice the asker never offered is not a decision, it is a bug or a forged
 * frame, and the local UI is held to the same rule — so it is refused here,
 * where the mismatch is, rather than handed to a tool as if a human had meant it.
 * @param asked - the questions this episode asked.
 * @param answers - the console's answers.
 * @returns undefined when the answers are acceptable, else the reason.
 */
export function invalidAnswerReason(
  asked: readonly RelayedQuestion[],
  answers: readonly RelayedAnswerItem[],
): string | undefined {
  const byId = new Map(asked.map(question => [question.id, question]))
  for (const answer of answers) {
    const question = byId.get(answer.id)
    if (question === undefined) {
      return `the answer names question ${JSON.stringify(answer.id)}, which was not asked`
    }
    const offered = new Set((question.options ?? []).map(option => option.label))
    for (const label of answer.selected) {
      if (!offered.has(label)) {
        return `the answer selects ${JSON.stringify(label)}, which question ${JSON.stringify(answer.id)} never offered`
      }
    }
    if (answer.selected.length > 1 && question.multiSelect !== true) {
      return `the answer selects ${String(answer.selected.length)} options for single-select question ${JSON.stringify(answer.id)}`
    }
  }
  return undefined
}

/** The relay: what this machine asked the console, and who won each race. */
export class InteractionRelay {
  private readonly pending = new Map<string, Pending>()
  private readonly settled: string[] = []
  private answeredLocally = 0
  private answeredRemotely = 0
  private lateAnswers = 0
  private aborted = 0

  /**
   * @param sink - how this relay reaches the console.
   * @param ttlMs - how long a relayed question stays answerable.
   */
  constructor(
    private readonly sink: InteractionSink,
    private readonly ttlMs: number = QUESTION_TTL_MS,
  ) {}

  /**
   * Offer one question to the console and race it against the local answerer.
   *
   * The caller passes `next` as `local`: calling it starts the answerers behind
   * this one — which is the shipped browser UI, reached through the Remote
   * waterfall bridge. Both sides are asked, and the first answer wins.
   * @param sessionId - the Session being asked in; absent means "not relayable".
   * @param questions - the questions the agent asked.
   * @param local - the delegated local answerer.
   * @returns the winning answer.
   */
  async race(
    sessionId: string | undefined,
    questions: readonly AskUserQuestionItemLike[],
    local: () => Promise<AskUserQuestionAnswerLike>,
  ): Promise<AskUserQuestionAnswerLike> {
    const asked = relayedQuestions(questions)
    if (sessionId === undefined || asked.length === 0) return local()
    const questionId = mintQuestionId()
    const deferred = Promise.withResolvers<RelayedAnswerItem[]>()
    const expiresAt = this.sink.now() + this.ttlMs
    this.pending.set(questionId, {
      sessionId,
      questionId,
      asked,
      expiresAt,
      settle: deferred.resolve,
    })
    this.sink.open(sessionId, questionId, asked, expiresAt)

    // Both promises go into the race, which subscribes to each of them: a side
    // that loses and then rejects is therefore still *observed*, so the loser
    // can never surface as an unhandled rejection.
    const localAnswer = local()
    let outcome: { side: 'local'; answer: AskUserQuestionAnswerLike } | { side: 'remote'; answers: RelayedAnswerItem[] }
    try {
      outcome = await Promise.race([
        localAnswer.then(answer => ({ side: 'local' as const, answer })),
        deferred.promise.then(answers => ({ side: 'remote' as const, answers })),
      ])
    } catch (error: unknown) {
      this.aborted += 1
      this.remember(questionId)
      this.sink.close(sessionId, questionId, 'aborted')
      throw error
    } finally {
      this.pending.delete(questionId)
    }
    this.remember(questionId)
    if (outcome.side === 'local') {
      // The machine's own human answered first, which is the ordinary outcome of
      // a race rather than a failure — say so, so the console can drop the card
      // instead of showing a question whose decision is already made.
      this.answeredLocally += 1
      this.sink.close(sessionId, questionId, 'answered-at-origin')
      return outcome.answer
    }
    this.answeredRemotely += 1
    return relayedAnswer(asked, outcome.answers)
  }

  /**
   * Claim one pending question for the console's answer.
   *
   * The single decision point of the whole feature: this is where "the console
   * answered first" is either accepted or refused, and it is decided by whether
   * *this* question is still pending here — not by anything the server believes.
   * @param questionId - the question the console answered.
   * @param answers - the console's answers.
   * @param commandId - the command carrying them, so a retry is recognisable.
   * @returns whether the answer was claimed.
   */
  claim(
    questionId: string,
    answers: readonly RelayedAnswerItem[],
    commandId: string,
  ): ClaimResult {
    const pending = this.pending.get(questionId)
    if (pending === undefined) {
      if (this.settled.includes(questionId)) {
        this.lateAnswers += 1
        return { ok: false, reason: 'this question was already answered on the machine that asked it' }
      }
      return { ok: false, reason: 'no such question is waiting on this machine' }
    }
    // A duplicated delivery of the same command is the same decision, so it
    // succeeds; a different command for a claimed question is a second decision
    // and must not overwrite the first.
    if (pending.claimedBy !== undefined) {
      return pending.claimedBy === commandId
        ? { ok: true }
        : { ok: false, reason: 'this question was already answered from the console' }
    }
    if (this.sink.now() > pending.expiresAt) {
      return { ok: false, reason: 'the question expired before the answer arrived' }
    }
    const invalid = invalidAnswerReason(pending.asked, answers)
    if (invalid !== undefined) return { ok: false, reason: invalid }
    pending.claimedBy = commandId
    pending.settle([...answers])
    return { ok: true }
  }

  /** What this machine's relayed questions did. */
  counts(): InteractionCounts {
    return {
      open: this.pending.size,
      answeredLocally: this.answeredLocally,
      answeredRemotely: this.answeredRemotely,
      lateAnswers: this.lateAnswers,
      aborted: this.aborted,
    }
  }

  /**
   * Withdraw every question still pending, because this machine is going away.
   * @param outcome - what to tell the console; `aborted` for a shutdown.
   */
  withdrawAll(outcome: QuestionOutcome = 'aborted'): void {
    for (const pending of [...this.pending.values()]) {
      this.pending.delete(pending.questionId)
      this.remember(pending.questionId)
      this.sink.close(pending.sessionId, pending.questionId, outcome)
    }
  }

  /** Remember one settled question id, oldest dropped first. */
  private remember(questionId: string): void {
    this.settled.push(questionId)
    if (this.settled.length > SETTLED_LIMIT) this.settled.splice(0, this.settled.length - SETTLED_LIMIT)
  }
}
