/**
 * Which pane owns the console when the panel is too narrow for two.
 *
 * The console is a 280px list column beside a conversation. That pair needs about
 * 720px to be two panes at all; below it the list stops being a column and becomes
 * the whole panel, with the conversation as the seat it covers.
 *
 * The reading is the *panel's* own width, not the window's. The rule this replaces
 * asked the media query for `max-width: 719px`, and the two answer the same
 * question only while the console happens to own the whole window: this panel is a
 * surface inside the Host's frame, so a wide window whose centre column is narrow
 * (a docked sidebar, a split view, a phone-shaped frame) is narrow for the console
 * and wide for the window. Under the media query that mismatch is what a reader
 * sees as a squeezed conversation: the fixed 280px column takes nearly all of the
 * panel and the talk column is left a strip beside it, with nothing able to give
 * the list the screen.
 *
 * The measurement itself (`ResizeObserver` on the panel) lives in the panel; these
 * are the decisions it feeds, kept apart from the DOM so the boundary and the state
 * machine have a test that needs no browser.
 */

/** The widest panel that still counts as narrow, inclusive (the shipped phone edge). */
export const NARROW_MAX_WIDTH = 719

/**
 * Whether this many pixels is a narrow panel.
 * @param width - the panel's own inline size, in CSS pixels.
 * @returns true when one pane has to own the panel.
 */
export function isNarrowPanel(width: number): boolean {
  // A panel that is not laid out — another panel of the frame is showing — measures
  // 0, which is not a statement about its width, so it does not count as narrow.
  // The observer skips those readings rather than flipping the layout off-screen.
  return width > 0 && width <= NARROW_MAX_WIDTH
}

/**
 * Whether the list pane is drawn.
 *
 * With no Session open the list is the only thing this console can show, so it
 * cannot be put away: on a narrow panel there would be nothing behind the
 * conversation and no control left to bring the list back, because the way back is
 * the conversation header's and that header exists only with a Session open.
 * @param hasSession - whether a mirrored Session is open.
 * @param listHidden - whether the reader has put the list away.
 * @returns true when the list pane is on screen.
 */
export function listPaneShown(hasSession: boolean, listHidden: boolean): boolean {
  return !hasSession || !listHidden
}

/**
 * Whether the list covers the conversation rather than standing beside it.
 * @param narrow - the panel's width reading.
 * @param listShown - whether the list pane is on screen.
 * @returns true when the conversation is underneath the list, not next to it.
 */
export function listOverlaysConversation(narrow: boolean, listShown: boolean): boolean {
  return narrow && listShown
}
