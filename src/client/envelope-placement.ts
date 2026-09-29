/**
 * Where one arriving envelope belongs, relative to the window the shipped pane
 * draws.
 *
 * This is one line of policy with a bug behind it, which is why it lives in a
 * module of its own and has a test: the console drives the shipped conversation's
 * window directly (the `scope` route), and the shipped assembler requires every
 * Context's matches in *increasing* sequence order. An envelope that is not newer
 * than the window must therefore never be appended to it.
 *
 * The bug was asking the wrong question — "is this below the window's first
 * sequence?" instead of "is this newer than the window's newest sequence?". An
 * older page this console prepends moves that first sequence *down*, so the
 * origin's replay of the same page (which reaches the console as ordinary frames,
 * the other road paging takes here) no longer looks like history and gets appended
 * after newer events. The assembler throws `received non-appended Match`, that
 * throw fails the whole event-feed subscriber — the pane stops updating until it is
 * reopened — and the prepend anchoring that keeps the reader's place never runs, so
 * clicking "load older" appears to jump to the top.
 *
 * Everything not newer than the window goes through the merge path instead
 * (`prepend`), which takes entries in order and replays the Contexts they touch.
 */

/** What to do with one arriving envelope. */
export type EnvelopePlacement =
  /** Already drawn: the window carries this sequence. */
  | 'drop'
  /** Not newer than the window: merge it in below, never append it. */
  | 'history'
  /** Newer than everything the window holds: it belongs at the tail. */
  | 'newer'

/**
 * Decide where one envelope belongs.
 * @param seq - the envelope's sequence.
 * @param newestHeld - highest sequence the drawn window holds, or undefined when it holds none.
 * @param fed - sequences the drawn window has already taken.
 * @returns the placement; `newer` is the only one the caller may append.
 */
export function envelopePlacement(
  seq: number,
  newestHeld: number | undefined,
  fed: ReadonlySet<number>,
): EnvelopePlacement {
  if (fed.has(seq)) return 'drop'
  // An empty window has no "newer than" to compare against, and nothing to
  // mis-order against either: the pane is not drawn yet, so the tail is the only
  // place an envelope can go.
  if (newestHeld === undefined) return 'newer'
  return seq > newestHeld ? 'newer' : 'history'
}

/**
 * The higher of two optional sequences, treating "no mark yet" as the other one.
 *
 * `Math.max(undefined, seq)` is `NaN`, and every comparison against NaN is false —
 * so a caller that starts with no mark and reaches for `Math.max` files every live
 * event as history and the pane silently stops appending. One line, two failure
 * modes, and no type error to warn you: spelled out, and tested.
 * @param current - the mark so far, or undefined when nothing has been marked.
 * @param seq - the sequence to fold in.
 * @returns the higher of the two, or `seq` when there is no mark yet.
 */
export function highestOf(current: number | undefined, seq: number): number {
  return current === undefined || seq > current ? seq : current
}
