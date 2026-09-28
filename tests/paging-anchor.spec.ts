/**
 * Keeping the reader's place when this console loads older history.
 *
 * The shipped chat arms its own paging anchor before asking for a page; this
 * console cannot, because it pages through its own channel. So the compensation
 * happens here, and these tests pin the conditions that decide when writing a
 * scroll position is right — including the one where it would be wrong: a reader
 * at the floor is following the tail, and moving them would be a new bug rather
 * than a fix.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pagingScrollTop } from '../src/client/paging-anchor.ts'

/** A reader parked at the top of a 1000px transcript in a 600px scroller. */
const AT_TOP = { first: 1707, top: 0, height: 1_000 }
const THRESHOLD = 24

describe('keeping the reader in place across an older page', () => {
  it('adds the inserted height when the head moved up and the reader is reading', () => {
    // An older page of 500px lands above: without this the reader is shown the top
    // of the inserted range instead of the content they were on.
    assert.equal(
      pagingScrollTop(AT_TOP, { first: 1308, top: 0, height: 1_500, clientHeight: 600 }, THRESHOLD),
      500,
    )
  })

  it('compensates from wherever the reader stood, not only from the top', () => {
    assert.equal(
      pagingScrollTop(
        { first: 1707, top: 300, height: 1_500 },
        { first: 1308, top: 300, height: 2_000, clientHeight: 600 },
        THRESHOLD,
      ),
      800,
    )
  })

  it('leaves a reader who is following the tail alone', () => {
    // The pane moves a tail-follower to the new floor itself; writing here would
    // drag them back up by the inserted height.
    assert.equal(
      pagingScrollTop(
        { first: 1707, top: 400, height: 1_000 },
        { first: 1308, top: 400, height: 1_500, clientHeight: 600 },
        THRESHOLD,
      ),
      undefined,
    )
  })

  it('does nothing when the head did not move', () => {
    assert.equal(
      pagingScrollTop(AT_TOP, { first: 1707, top: 0, height: 1_200, clientHeight: 600 }, THRESHOLD),
      undefined,
    )
  })

  it('does nothing when the window moved down instead of up', () => {
    // A replacement opens a new window; its head can be anywhere, and fighting it
    // would put the reader somewhere neither end asked for.
    assert.equal(
      pagingScrollTop(AT_TOP, { first: 1900, top: 0, height: 1_500, clientHeight: 600 }, THRESHOLD),
      undefined,
    )
  })

  it('does nothing when no height was inserted', () => {
    assert.equal(
      pagingScrollTop(AT_TOP, { first: 1308, top: 0, height: 1_000, clientHeight: 600 }, THRESHOLD),
      undefined,
    )
  })

  it('does nothing while no window is drawn', () => {
    assert.equal(
      pagingScrollTop(
        { first: undefined, top: 0, height: 1_000 },
        { first: 1308, top: 0, height: 1_500, clientHeight: 600 },
        THRESHOLD,
      ),
      undefined,
    )
    assert.equal(
      pagingScrollTop(AT_TOP, { first: undefined, top: 0, height: 1_500, clientHeight: 600 }, THRESHOLD),
      undefined,
    )
  })
})
