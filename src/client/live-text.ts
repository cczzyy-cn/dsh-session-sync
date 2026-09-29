/**
 * What live text has already been shown, per attempt **and per kind**.
 *
 * One accumulator per attempt was wrong, and the bug it caused was reported as "the
 * thinking only appears once it has finished". A step streams its reasoning and then
 * its answer through the *same* attempt id, and the relay sends each kind's whole
 * text so far rather than deltas, so the reader's delta is computed here by
 * subtraction. With a single entry per attempt, the first answer delta is not an
 * extension of the reasoning text: that looks exactly like the one case the caller
 * must treat as a restart — text that was replaced rather than extended — and the
 * restart path retires the attempt's live rows. The thinking being watched was
 * therefore torn down at the moment the answer began, and only the durable reasoning
 * block (which arrives with the settlement) was left, which is why the reasoning
 * appeared "at the end".
 *
 * Two texts, two accumulators. A discontinuity *within* one kind is still a restart,
 * because that is what the guard exists for.
 */

/** Which of a step's two texts a delta belongs to. */
export type LiveKind = 'reasoning' | 'text'

/** What to do with one live frame. */
export interface LiveStep {
  /** The text to append — empty when this frame added nothing new. */
  readonly delta: string
  /**
   * Whether this kind's text was *replaced* rather than extended.
   *
   * The caller retires the attempt's live rows when it is true, as it always did:
   * the shipped fold would otherwise append replaced text onto the text that was
   * there before.
   */
  readonly restarted: boolean
}

/** The accumulator one mirrored Session keeps for its live text. */
export class LiveText {
  private readonly shown = new Map<string, string>()

  /**
   * Take one frame's whole text so far and return the part that is new.
   * @param attemptId - the attempt the text belongs to.
   * @param kind - which of the step's two texts it is.
   * @param text - the whole text so far, as the relay form carries it.
   * @returns the delta to append, and whether this kind restarted.
   */
  take(attemptId: string, kind: LiveKind, text: string): LiveStep {
    const key = `${attemptId}\u0000${kind}`
    const shown = this.shown.get(key) ?? ''
    const restarted = !text.startsWith(shown)
    this.shown.set(key, text)
    return { delta: text.slice(restarted ? 0 : shown.length), restarted }
  }

  /**
   * Forget every kind of one attempt, because it is no longer live.
   * @param attemptId - the attempt that settled.
   */
  forget(attemptId: string): void {
    const prefix = `${attemptId}\u0000`
    for (const key of [...this.shown.keys()]) {
      if (key.startsWith(prefix)) this.shown.delete(key)
    }
  }

  /** Forget everything, because the whole window was replaced. */
  clear(): void {
    this.shown.clear()
  }
}
