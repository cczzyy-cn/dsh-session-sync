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
 * It wears the product's own question takeover: the shipped composer
 * (`@deepseek-ai/dsh-client-ui-user-questions`) is not importable from a plugin —
 * its package is not in the shell's frozen module table — so this is that
 * composer's markup and stylesheet, copied, over this console's data. A batch is
 * rendered whole rather than paged one question at a time (see the stylesheet),
 * because a question left untouched travels back as an empty choice — the same
 * shape the machine's own UI produces for a skipped question.
 */
import * as React from 'react'
import { Button, IconCheckOutlineRegular, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RelayedAnswerItem, RelayedQuestionOption, RelayedQuestionView } from '../shared/protocol.ts'
import { parseRecommendedLabel } from './config-entry.ts'
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

/** One option row's leading indicator: its number, or a checked multi-select box. */
function OptionIndicator(props: { multi: boolean; index: number; checked: boolean }): React.ReactElement {
  return props.multi
    ? (
      <span
        className={props.checked ? `${css.checkbox} ${css.checkboxChecked}` : css.checkbox}
        aria-hidden="true"
      >
        {props.checked && <IconCheckOutlineRegular />}
      </span>
    )
    : <span className={css.number} aria-hidden="true">{props.index + 1}</span>
}

/** One option row, as the shipped composer draws it. */
function OptionRow(props: {
  option: RelayedQuestionOption
  index: number
  multi: boolean
  checked: boolean
  t: SessionSyncTranslate
  onChoose: () => void
}): React.ReactElement {
  const recommended = parseRecommendedLabel(props.option.label)
  return (
    <button
      type="button"
      className={props.checked ? `${css.option} ${css.optionSelected}` : css.option}
      aria-pressed={props.checked}
      onClick={props.onChoose}
    >
      <OptionIndicator multi={props.multi} index={props.index} checked={props.checked} />
      <span className={css.optionCopy}>
        <span className={css.optionLine}>
          <span className={css.optionLabel}>{recommended.label}</span>
          {recommended.recommended && <span className={css.badge}>{props.t('questionRecommended')}</span>}
        </span>
        {props.option.description !== undefined && (
          <span className={css.description}>{props.option.description}</span>
        )}
      </span>
    </button>
  )
}

/**
 * Auto-growing free-text answer: a textarea over a hidden mirror that owns the
 * height, so a long answer soft-wraps and the box grows with it.
 *
 * The mirror renders the draft plus a trailing newline in normal flow and so
 * sizes the grid row (counting rows by '\n' cannot see soft wraps); the textarea
 * shares that one cell and stretches to it, and `rows={1}` keeps the control's
 * own intrinsic height out of the row sizing so the mirror alone decides. The two
 * layers MUST share font, line-height, padding and wrapping rules or their
 * heights diverge — that is what `.field > *` guarantees.
 * @param props - the draft text, its placeholder, and the change handler.
 * @returns the field.
 */
function AnswerField(props: {
  value: string
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
}): React.ReactElement {
  return (
    <span className={css.field}>
      <span aria-hidden className={css.fieldMirror}>{`${props.value}\n`}</span>
      <textarea
        className={css.fieldInput}
        value={props.value}
        disabled={props.disabled}
        rows={1}
        placeholder={props.placeholder}
        onChange={(event) => { props.onChange(event.target.value) }}
      />
    </span>
  )
}

/**
 * Render one relayed question batch in the shipped composer's own shell.
 * @param props - copy, the question, its answer progress, and the send action.
 * @returns the card.
 */
export function QuestionCard(props: QuestionCardProps): React.ReactElement {
  const { t, question } = props
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const sent = props.answer?.sent === true

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
  // The same labels the console's streaming pane binds: `MarkdownText` caches a
  // render against the object's identity, so this must not be a fresh object per
  // render.
  const labels = React.useMemo(
    () => ({
      code: { copyLabel: t('copyCode'), copiedLabel: t('copiedCode') },
      footnotes: t('footnotes'),
    }),
    [t],
  )

  return (
    <form
      className={css.frame}
      aria-label={t('questionTitle')}
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready || sent) return
        props.onAnswer(answers)
      }}
    >
      <div className={css.card}>
        <div className={css.header}>
          <div className={css.headingBlock}>
            <div className={css.eyebrow}>{t('questionFrom', { machine: question.machineName })}</div>
            <h2 className={css.title}>{t('questionTitle')}</h2>
          </div>
        </div>
        <div className={css.body}>
          {question.questions.map(item => {
            const draft = draftOf(item.id)
            const multi = item.multiSelect === true
            const options = item.options ?? []
            return (
              <React.Fragment key={item.id}>
                <div className={css.header}>
                  <div className={css.headingBlock}>
                    {item.header !== undefined && <div className={css.eyebrow}>{item.header}</div>}
                    <h2 className={css.title}>{item.question}</h2>
                  </div>
                </div>
                {item.detail !== undefined && (
                  <div className={css.detail}>
                    <MarkdownText text={item.detail} labels={labels} />
                  </div>
                )}
                {options.length > 0
                  ? (
                    <div className={css.options} role={multi ? 'group' : 'radiogroup'}>
                      {options.map((option, index) => (
                        <OptionRow
                          key={option.label}
                          option={option}
                          index={index}
                          multi={multi}
                          checked={draft.selected.includes(option.label)}
                          t={t}
                          onChoose={() => { choose(item.id, option.label, multi) }}
                        />
                      ))}
                      <div className={draft.custom !== '' ? `${css.customRow} ${css.customRowActive}` : css.customRow}>
                        <OptionIndicator multi={multi} index={options.length} checked={draft.custom !== ''} />
                        <span className={css.customInline}>
                          <AnswerField
                            value={draft.custom}
                            placeholder={t('questionOther')}
                            disabled={sent}
                            onChange={(value) => { setDraft(item.id, { ...draft, custom: value }) }}
                          />
                        </span>
                      </div>
                    </div>
                  )
                  : (
                    <div className={`${css.customBlock} ${css.field}`}>
                      <AnswerField
                        value={draft.custom}
                        placeholder={t('questionOther')}
                        disabled={sent}
                        onChange={(value) => { setDraft(item.id, { ...draft, custom: value }) }}
                      />
                    </div>
                  )}
              </React.Fragment>
            )
          })}
        </div>
        <div className={css.footer}>
          <span className={css.feedback}>
            {props.answer?.error !== undefined
              ? props.answer.error
              : sent
                ? t('questionSent')
                : question.questions.some(item => item.multiSelect === true) ? t('questionMultiHint') : ''}
          </span>
          <div className={css.footerActions}>
            <Button type="submit" variant="primary" disabled={!ready || sent}>
              {t('questionSubmit')}
            </Button>
          </div>
        </div>
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
