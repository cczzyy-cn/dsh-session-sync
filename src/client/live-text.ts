/**
 * What live text has already been shown, per attempt **and per kind** — and the
 * chunk shape a live delta becomes.
 *
 * Two bugs met here, and both were reported as one symptom ("the thinking only
 * appears once it has finished"):
 *
 *  - **One accumulator per attempt.** A step streams its reasoning and then its
 *    answer through the *same* attempt id, and the relay sends each kind's whole
 *    text so far rather than deltas, so the reader's delta is computed by
 *    subtraction. With a single entry per attempt, the first answer delta is not an
 *    extension of the reasoning text: that looks exactly like the one case that must
 *    restart — text that was *replaced* — and the restart path retires the attempt's
 *    live rows. The thinking being watched was torn down at the moment the answer
 *    began. Fixed by keying per kind.
 *  - **The wrong chunk vocabulary.** The synthesized live row carried the *durable*
 *    run shape (`text-chunks` / `reasoning-chunks`, with `time0`/`dt`/`texts`), which
 *    no shipped renderer consumes — neither string appears anywhere in
 *    `packages/client` — so every synthesized row was silently ignored. Fixed by
 *    {@link liveChunkOf}, which emits what the shipped client itself emits.
 */

/** Which of a step's two texts a delta belongs to. */
export type LiveKind = 'reasoning' | 'text'

/**
 * The chunk one live delta becomes, in the vocabulary the shipped renderer reads.
 *
 * This is the shape the shipped client itself puts in an `assistant/live-chunk`
 * event: `api/session-controller/src/client/sessions/assistant-stream.ts` wraps the
 * stream's own `chunk` unchanged, and the live stream's chunks are the singular
 * `-delta` forms from `llm`'s `StreamChunk`.
 * @param kind - which of the step's two texts this delta continues.
 * @param delta - the text to append.
 * @returns the chunk to put in the live-chunk event.
 */
export function liveChunkOf(kind: LiveKind, delta: string): { type: string; index: number; text: string } {
  return {
    type: kind === 'reasoning' ? 'reasoning-delta' : 'text-delta',
    // One index for both kinds, which is what the shipped partial projection wants:
    // it restarts the block when the type changes, so reasoning and answer stay apart
    // without needing distinct indices.
    index: 0,
    text: delta,
  }
}

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
