/**
 * The card that offers one relayed question to the reader watching this console.
 *
 * Two people can answer a question a remote Session asked — whoever is at the
 * machine, and whoever is watching it here — and upstream's seam lets the first
 * answer win. So this card never claims the Session is blocked; it offers a
 * decision, and it says plainly when the machine got there first. That refusal is
 * the ordinary outcome of a race, not an error to retry, and the only place a
 * reader can learn it is here.
 *
 * A batch is rendered whole: the asker's questions share one answer, and a
 * question left untouched travels back as an empty choice — the same shape the
 * machine's own UI produces for a skipped question.
 */
import * as React from 'react'
import type { RelayedAnswerItem, RelayedQuestionView } from '../shared/protocol.ts'
import type { SessionSyncTranslate } from './locales.ts'
import css from './QuestionCard.module.css'

/** One question's draft answer, as the reader is assembling it. */
interface Draft {
  selected: string[]
  custom: string
}

/** What became of an answer this console already sent for this question. */
export interface QuestionAnswerState {
  sent?: boolean
  error?: string
}

export interface QuestionCardProps {
  t: SessionSyncTranslate
  question: RelayedQuestionView
  /** This console's own answer progress for it, when any. */
  answer?: QuestionAnswerState
  /** Send the assembled answer to the machine that asked. */
  onAnswer: (answers: RelayedAnswerItem[]) => void
}

/** The empty draft for one question. */
function emptyDraft(): Draft {
  return { selected: [], custom: '' }
}

/**
 * Turn the drafts into the wire answer.
 *
 * A single-select question answered with free text sends *only* the text, because
 * that is what "Other" means to the asker; a multi-select may carry both. A
 * question with neither is skipped explicitly rather than omitted, so the tool's
 * result covers every question it asked.
 * @param questions - the questions this batch asked.
 * @param drafts - one draft per question id.
 * @returns the answer to send.
 */
export function answerOf(
  questions: RelayedQuestionView['questions'],
  drafts: Readonly<Record<string, Draft>>,
): RelayedAnswerItem[] {
  return questions.map(question => {
    const draft = drafts[question.id] ?? emptyDraft()
    const custom = draft.custom.trim()
    if (question.multiSelect === true) {
      return {
        id: question.id,
        selected: [...draft.selected],
        ...(custom === '' ? {} : { custom }),
      }
    }
    // Single-select: the asker's own rule is that free text overrides the
    // chosen option, so sending both would describe a decision nobody made.
    if (custom !== '') return { id: question.id, selected: [], custom }
    return { id: question.id, selected: [...draft.selected] }
  })
}

/** Whether one draft decides anything at all. */
function decides(draft: Draft): boolean {
  return draft.selected.length > 0 || draft.custom.trim() !== ''
}

/**
 * Render one relayed question batch.
 * @param props - copy, the question, its answer progress, and the send action.
 * @returns the card.
 */
export function QuestionCard(props: QuestionCardProps): React.ReactElement {
  const { t, question } = props
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})

  const draftOf = (id: string): Draft => drafts[id] ?? emptyDraft()

  const setDraft = (id: string, next: Draft): void => {
    setDrafts(current => ({ ...current, [id]: next }))
  }

  const choose = (id: string, label: string, multi: boolean): void => {
    const draft = draftOf(id)
    setDraft(id, {
      ...draft,
      selected: multi
        ? (draft.selected.includes(label)
            ? draft.selected.filter(held => held !== label)
            : [...draft.selected, label])
        : [label],
    })
  }

  const ready = question.questions.some(candidate => decides(draftOf(candidate.id)))
  const answers = answerOf(question.questions, drafts)

  return (
    <form
      className={css.card}
      aria-label={t('questionTitle')}
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready) return
        props.onAnswer(answers)
      }}
    >
      <div className={css.head}>
        <span className={css.title}>{t('questionTitle')}</span>
        <span className={css.origin}>{t('questionFrom', { machine: question.machineName })}</span>
      </div>
      {question.questions.map(item => {
        const draft = draftOf(item.id)
        const multi = item.multiSelect === true
        return (
          <React.Fragment key={item.id}>
            {item.header !== undefined && <span className={css.origin}>{item.header}</span>}
            <span className={css.question}>{item.question}</span>
            {item.detail !== undefined && <p className={css.detail}>{item.detail}</p>}
            {item.options !== undefined && item.options.length > 0 && (
              <div className={css.options}>
                {item.options.map(option => (
                  <button
                    key={option.label}
                    type="button"
                    className={css.option}
                    aria-pressed={draft.selected.includes(option.label)}
                    title={option.description ?? option.label}
                    onClick={() => { choose(item.id, option.label, multi) }}
                  >
                    {option.label}
                    {option.description !== undefined && (
                      <span className={css.optionDescription}>{` · ${option.description}`}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <input
              className={css.other}
              value={draft.custom}
              placeholder={t('questionOther')}
              aria-label={`${item.question} — ${t('questionOther')}`}
              onChange={(event) => { setDraft(item.id, { ...draft, custom: event.target.value }) }}
            />
          </React.Fragment>
        )
      })}
      <div className={css.bar}>
        {props.answer?.error !== undefined
          ? <span className={css.error}>{props.answer.error}</span>
          : props.answer?.sent === true
            ? <span className={css.sent}>{t('questionSent')}</span>
            : <span className={css.hint}>
                {question.questions.some(item => item.multiSelect === true) ? t('questionMultiHint') : ''}
              </span>}
        <span className={css.spacer} />
        <button
          type="submit"
          className={css.submit}
          disabled={!ready || props.answer?.sent === true}
        >
          {t('questionSubmit')}
        </button>
      </div>
    </form>
  )
}

export interface QuestionElsewhereProps {
  t: SessionSyncTranslate
  count: number
  /** Open the oldest Session that is waiting, so the reader can act on it. */
  onShow: () => void
}

/**
 * The line that says questions are waiting somewhere else.
 *
 * The card can only appear in the pane of the Session that asked, and a reader
 * looking at a different Session would otherwise never learn that a machine is
 * waiting — a question that expires unread is exactly the failure this prevents.
 * @param props - copy, how many are waiting, and how to go to them.
 * @returns the notice.
 */
export function QuestionElsewhere(props: QuestionElsewhereProps): React.ReactElement {
  return (
    <div className={css.elsewhere} role="status">
      <span>{props.t('questionElsewhere', { n: props.count })}</span>
      <button type="button" className={css.elsewhereGo} onClick={props.onShow}>
        {props.t('questionElsewhereGo')}
      </button>
    </div>
  )
}
