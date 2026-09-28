/**
 * The two-sided race for one user question — the question domain of
 * {@link HandoffRelay}.
 *
 * A question is the one interactive event a Session produces whose answer is
 * *information*: which option, or a typed answer. Both people who could answer it
 * are legitimately "the user" — whoever is at the machine that owns the Session
 * and whoever is watching it in the sync console — so the race, the claim and the
 * counters all come from the shared handoff core, and this module holds only what
 * is specific to a question: how to cut one down to a wire shape, how to check an
 * answer against what was actually asked, and how the two answer shapes convert.
 */

import {
  QUESTION_TTL_MS,
  type QuestionOutcome,
  type RelayedAnswerItem,
  type RelayedQuestion,
} from '../shared/protocol.ts'
import type { AskUserQuestionAnswerLike, AskUserQuestionItemLike } from './dsh.ts'
import { HandoffRelay, type HandoffSink } from './handoff.ts'

/** Where the relay reaches the console. Absent when this machine is a server itself. */
export type InteractionSink = HandoffSink<RelayedQuestion[], QuestionOutcome>

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

export { mintHandoffId as mintQuestionId } from './handoff.ts'

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

/** The question relay: what this machine asked the console, and who won each race. */
export class InteractionRelay {
  private readonly core: HandoffRelay<RelayedQuestion[], RelayedAnswerItem[], QuestionOutcome>

  /**
   * @param sink - how this relay reaches the console.
   * @param ttlMs - how long a relayed question stays answerable.
   */
  constructor(
    sink: InteractionSink,
    private readonly ttlMs: number = QUESTION_TTL_MS,
  ) {
    this.core = new HandoffRelay(sink, {
      settled: 'this question was already answered on the machine that asked it',
      claimed: 'this question was already answered from the console',
      unknown: 'no such question is waiting on this machine',
      expired: 'the question expired before the answer arrived',
    })
  }

  /**
   * Offer one question to the console and race it against the local answerer.
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
    return this.core.race<AskUserQuestionAnswerLike>({
      sessionId,
      offer: asked.length === 0 ? undefined : asked,
      ttlMs: this.ttlMs,
      local,
      remote: answers => relayedAnswer(asked, answers),
      validate: answers => invalidAnswerReason(asked, answers),
      // The machine's own human answered first: that is the ordinary outcome of a
      // race, not a failure, so the console is told which way it lost.
      closeOnLocal: () => 'answered-at-origin',
      closeOnAbort: 'aborted',
    })
  }

  /**
   * Claim one pending question for the console's answer.
   * @param questionId - the question the console answered.
   * @param answers - the console's answers.
   * @param commandId - the command carrying them, so a retry is recognisable.
   * @returns whether the answer was claimed.
   */
  claim(questionId: string, answers: readonly RelayedAnswerItem[], commandId: string): ClaimResult {
    return this.core.claim(questionId, [...answers], commandId)
  }

  /** What this machine's relayed questions did. */
  counts(): InteractionCounts {
    const counts = this.core.counts()
    return {
      open: counts.open,
      answeredLocally: counts.decidedLocally,
      answeredRemotely: counts.decidedRemotely,
      lateAnswers: counts.lateAnswers,
      aborted: counts.aborted,
    }
  }

  /**
   * Withdraw every question still pending, because this machine is going away.
   * @param outcome - what to tell the console; `aborted` for a shutdown.
   */
  withdrawAll(outcome: QuestionOutcome = 'aborted'): void {
    this.core.withdrawAll(outcome)
  }
}
