/**
 * Where the scroller must land so that loading older history does not move what
 * the reader is reading.
 *
 * The shipped chat does this itself: its "load earlier" path arms a paging anchor
 * and stops tail-following *before* it asks for a page
 * (`use-chat-navigation.ts`: `beginPaging()` + `pauseFollowing()` + `loadOlder()`),
 * and the viewport then restores that anchor once the page commits. This console
 * pages through its own channel instead — the shipped control would ask a Host
 * that has never heard of the mirrored Session — so nothing arms the anchor, and
 * the inserted page moves the content down while the scroller stays where it was.
 * The reader is shown the top of the newly inserted range, which reads as "loading
 * jumped to the top".
 *
 * The arithmetic is one line, but the *conditions* are the part worth pinning:
 * compensating when the head did not move, when nothing was inserted, or while the
 * reader is following the tail would each be a new bug (the last one fights the
 * pane's own follow-the-tail behaviour).
 */

/** Where the drawn window and the scroller stand at one commit. */
export interface PagingMetrics {
  /** Lowest sequence the window covers, or undefined when it covers none. */
  readonly first: number | undefined
  /** The scroller's `scrollTop`. */
  readonly top: number
  /** The scroller's `scrollHeight`. */
  readonly height: number
}

/**
 * The scroll position that keeps the reader's content where it was.
 * @param before - the window and scroller as they stood before this commit.
 * @param after - the same readings now, plus the scroller's visible height.
 * @param threshold - distance from the floor that still counts as following the tail.
 * @returns the `scrollTop` to write, or undefined when nothing should move.
 */
export function pagingScrollTop(
  before: PagingMetrics,
  after: PagingMetrics & { readonly clientHeight: number },
  threshold: number,
): number | undefined {
  // No head on either side means no window is drawn; nothing to keep in place.
  if (before.first === undefined || after.first === undefined) return undefined
  // Only a page *below* the window moves the head up. A replacement (a new window,
  // a jump) moves it wherever it likes, and compensating for that would fight it.
  if (after.first >= before.first) return undefined
  const inserted = after.height - before.height
  // A prepend that added no height (or shrank, which a replacement can do) is not
  // something to compensate for.
  if (inserted <= 0) return undefined
  // A reader at the floor is following the tail, and the pane moves them to the
  // new floor itself. Writing a position here would drag them back up.
  const fromFloor = before.height - before.top - after.clientHeight
  if (fromFloor <= threshold) return undefined
  return before.top + inserted
}
