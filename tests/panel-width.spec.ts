/**
 * When the console's list pane owns the panel instead of sharing it.
 *
 * The console used to ask the window (`@media (max-width: 719px)`) and got the
 * wrong answer whenever the panel was narrower than the window: the 280px column
 * kept its width and squeezed the conversation into the remainder. These tests pin
 * what the panel's own reading means instead — including the case that is not a
 * reading at all, a panel that is not laid out (0px) while another panel shows.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  NARROW_MAX_WIDTH,
  isNarrowPanel,
  listOverlaysConversation,
  listPaneShown,
} from '../src/client/panel-width.ts'

describe('how wide a panel has to be for two panes', () => {
  it('is narrow at the boundary and wide one pixel past it', () => {
    assert.equal(isNarrowPanel(NARROW_MAX_WIDTH), true)
    assert.equal(isNarrowPanel(NARROW_MAX_WIDTH + 1), false)
  })

  it('is narrow on a phone-width panel and wide on a desk-width one', () => {
    assert.equal(isNarrowPanel(390), true)
    assert.equal(isNarrowPanel(1440), false)
  })

  it('treats a panel that is not laid out as no reading, not as narrow', () => {
    // Another panel of the frame is showing: 0px says nothing about this one's
    // width, and flipping to the narrow layout here would be a layout change the
    // reader never sees the cause of.
    assert.equal(isNarrowPanel(0), false)
  })
})

describe('when the list pane is on screen', () => {
  it('is on screen with nothing open, even after the reader put it away', () => {
    // The only pane there is: hiding it would leave an empty hero and no control
    // to bring it back, because the way back lives in the conversation header.
    assert.equal(listPaneShown(false, true), true)
    assert.equal(listPaneShown(false, false), true)
  })

  it('follows the reader once a Session is open', () => {
    assert.equal(listPaneShown(true, false), true)
    assert.equal(listPaneShown(true, true), false)
  })
})

describe('when the list covers the conversation', () => {
  it('covers it only on a narrow panel', () => {
    assert.equal(listOverlaysConversation(true, true), true)
  })

  it('stands beside it on a wide panel', () => {
    // Both panes are usable, so the list keeps its column and the conversation
    // keeps its own width.
    assert.equal(listOverlaysConversation(false, true), false)
  })

  it('covers nothing when the list is away', () => {
    assert.equal(listOverlaysConversation(true, false), false)
  })
})
