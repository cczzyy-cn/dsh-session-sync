/**
 * One Session's unsent takeover prompt, held where both of the console's
 * composer seats can reach it.
 *
 * The console draws its input card in two places, and which one is live depends
 * on what the pane is showing: inside the *shipped* composer stack when the
 * shipped conversation is drawn (the `conversation.input.dock` seat), and in the
 * console's own footer on the trajectory tab — and on a build with no shipped
 * conversation at all. Those are two components in two different trees, so a
 * draft held in either one's own state is destroyed the moment the reader
 * switches tabs, and again in the first frames after opening a Session, before
 * the shipped pane has anything to draw. It is held here instead: keyed by the
 * Session it is addressed to, so every seat showing that Session reads and writes
 * the same text.
 *
 * `sending` rides along for the same reason: the send control's disabled state is
 * a fact about the *prompt*, not about which seat happens to be on screen, and a
 * seat mounted mid-flight has to know a prompt is already on its way.
 */

/** What one Session's composer seat shows. */
export interface ComposerDraftState {
  /** The unsent prompt. */
  readonly text: string
  /** True while a send is in flight, which is what disables the send control. */
  readonly sending: boolean
}

/**
 * The empty seat.
 *
 * One frozen instance for every Session that has never been typed into: the
 * reader of this store compares snapshot identities, so a fresh object per read
 * would re-render every seat on every change anywhere.
 */
const EMPTY: ComposerDraftState = Object.freeze({ text: '', sending: false })

/**
 * The drafts of every Session this console has shown, plus the one channel both
 * seats subscribe to.
 *
 * One instance per plugin (built in `apply`), because two registrations — the
 * console panel and the shipped composer stack's dock entry — have to share it
 * and neither may reach the other's props.
 */
export class ComposerDrafts {
  private readonly byKey = new Map<string, ComposerDraftState>()
  private readonly listeners = new Set<() => void>()

  /**
   * The state one Session's composer seat renders.
   * @param key - the Session the draft is addressed to.
   * @returns the state; the shared empty one until something is typed.
   */
  read(key: string): ComposerDraftState {
    return this.byKey.get(key) ?? EMPTY
  }

  /**
   * Replace the unsent prompt.
   * @param key - the Session the draft is addressed to.
   * @param text - the whole draft, as the textarea holds it.
   */
  setText(key: string, text: string): void {
    const current = this.read(key)
    if (current.text === text) return
    this.write(key, { text, sending: current.sending })
  }

  /**
   * Mark a prompt as on its way, or as finished.
   * @param key - the Session the draft is addressed to.
   * @param sending - the new reading.
   */
  setSending(key: string, sending: boolean): void {
    const current = this.read(key)
    if (current.sending === sending) return
    this.write(key, { text: current.text, sending })
  }

  /**
   * Take one Session's draft down to the empty seat, keeping nothing behind.
   *
   * What a delivered prompt leaves: the text has gone to the machine, and the
   * next reader of that Session — possibly this one, after looking at something
   * else — should not find it still sitting in the box.
   * @param key - the Session the draft was addressed to.
   */
  clear(key: string): void {
    this.write(key, { text: '', sending: false })
  }

  /**
   * Hear about every seat's change.
   *
   * Coarse on purpose: a seat subscribes once and re-reads its own Session's
   * state, which is one comparison against a frozen object for the Sessions it
   * does not care about.
   * @param listener - the change callback.
   * @returns the unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private write(key: string, next: ComposerDraftState): void {
    this.byKey.set(key, Object.freeze(next))
    // Over a copy: a listener that unsubscribes while being told (a seat
    // unmounting is exactly that) must not disturb the walk.
    for (const listener of [...this.listeners]) listener()
  }
}

/**
 * The key one Session's draft is filed under.
 *
 * Machine and id together, because two machines can hold Sessions whose ids were
 * generated independently — a draft written for one of them must not appear in
 * the other's composer.
 * @param machineName - the machine that owns the Session.
 * @param sessionId - the Session's own id.
 * @returns the stable key.
 */
export function draftKey(machineName: string, sessionId: string): string {
  return `${machineName}\u0000${sessionId}`
}
