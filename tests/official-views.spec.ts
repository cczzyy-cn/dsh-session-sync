/**
 * Whether the console may hand a page to the shipped view.
 *
 * The failure this pins is a *fallback* that never fires or fires wrongly. The
 * console draws its own trajectory ledger where the shipped page is absent, and
 * hands the page over where it is present; the only evidence of "present" is this
 * listing, so a predicate that answered yes for an unrelated entry would trade the
 * console's own ledger for a blank pane, and one that answered no would keep the
 * ledger on every build.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CHAT_VIEW, TRAJECTORY_VIEW, hasViewEntry } from '../src/client/official-views.ts'

describe('the shipped conversation pages the console asks for', () => {
  it('names the two ids the shipped shell registers', () => {
    // ui-chat registers `chat` (order 0) and ui-trajectory `trajectory` (order 10);
    // these are the ids the pane's view request has to match.
    assert.equal(CHAT_VIEW, 'chat')
    assert.equal(TRAJECTORY_VIEW, 'trajectory')
  })

  it('finds an entry by id', () => {
    assert.equal(hasViewEntry([{ options: { id: 'chat' } }, { options: { id: 'trajectory' } }], TRAJECTORY_VIEW), true)
  })

  it('answers an undeclared or empty listing with no', () => {
    // `slots.entries()` answers an undeclared key with an empty list on purpose, so
    // this is the ordinary answer on a build whose ui-trajectory never loads.
    assert.equal(hasViewEntry([], TRAJECTORY_VIEW), false)
    assert.equal(hasViewEntry([{ options: { id: 'chat' } }], TRAJECTORY_VIEW), false)
  })

  it('is total: an entry without options or without an id is not a match', () => {
    assert.equal(hasViewEntry([{}, { options: {} }], TRAJECTORY_VIEW), false)
  })

  it('does not match on a longer id that merely starts the same way', () => {
    assert.equal(hasViewEntry([{ options: { id: 'trajectory-dev' } }], TRAJECTORY_VIEW), false)
  })
})
