/**
 * Where one arriving envelope belongs relative to the drawn window.
 *
 * This decides between the two roads into the shipped conversation: appending to
 * the tail, or merging in below. The wrong answer does not merely misplace a row —
 * the shipped assembler requires every Context's matches in increasing sequence
 * order, so appending an envelope that is not newer than the window throws
 * `received non-appended Match`, and that throw fails the whole event-feed
 * subscriber: the pane stops updating until it is reopened, and the anchoring that
 * keeps the reader's place never runs.
 *
 * The case that shipped as a bug is the second one below: after "load older"
 * prepends a page, the window's first sequence moves *down*, so the origin's replay
 * of that same page arrives *inside* the window's range. Asking "is it below the
 * window's first sequence?" answers "no" and appends it; asking "is it newer than
 * the window?" answers "no" and merges it, which is correct.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { envelopePlacement } from '../src/client/envelope-placement.ts'

/** The window after one older page: seqs 1308..2105 are drawn. */
const OLDEST = 1308
const NEWEST = 2105

describe('where an arriving envelope belongs', () => {
  it('appends an envelope newer than everything the window holds', () => {
    assert.equal(envelopePlacement(NEWEST + 1, NEWEST, new Set()), 'newer')
    assert.equal(envelopePlacement(NEWEST + 50, NEWEST, new Set()), 'newer')
  })

  it('merges an envelope inside the window range that it does not hold yet', () => {
    // The regression: this is the origin replaying the page this console just
    // prepended, so it is *above* the window's first sequence (1308) and below its
    // newest. Appending it throws; merging it is what the pane can take.
    assert.equal(envelopePlacement(1705, NEWEST, new Set()), 'history')
    assert.equal(envelopePlacement(OLDEST + 1, NEWEST, new Set()), 'history')
    // Including the window's own newest, which a replay can carry again.
    assert.equal(envelopePlacement(NEWEST, NEWEST, new Set()), 'history')
  })

  it('merges an envelope below the window', () => {
    assert.equal(envelopePlacement(OLDEST - 1, NEWEST, new Set()), 'history')
    assert.equal(envelopePlacement(0, NEWEST, new Set()), 'history')
  })

  it('drops an envelope the window already carries, wherever it sits', () => {
    const fed = new Set([OLDEST - 1, OLDEST, 1705, NEWEST, NEWEST + 1])
    assert.equal(envelopePlacement(OLDEST - 1, NEWEST, fed), 'drop')
    assert.equal(envelopePlacement(1705, NEWEST, fed), 'drop')
    assert.equal(envelopePlacement(NEWEST + 1, NEWEST, fed), 'drop')
  })

  it('appends into an empty window, which has nothing to mis-order against', () => {
    assert.equal(envelopePlacement(1705, undefined, new Set()), 'newer')
    assert.equal(envelopePlacement(0, undefined, new Set()), 'newer')
  })
})
