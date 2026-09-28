/**
 * What one relayed approval card says, resolved against the mirrored transcript.
 *
 * Two things are worth pinning here, and both are about not lying to the person
 * granting a permission:
 *
 *  - when the mirror holds the call, the card shows *what would run* — the same row
 *    the console is already rendering above it, so the card and the ledger cannot
 *    disagree about the same call;
 *  - when it does not, the card says the call is not in view instead of showing a
 *    bare tool name as though that were the whole story. "Allow bash" and "allow a
 *    bash call this window can no longer show you" are different questions.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { approvalPresentation } from '../src/client/approval-view.ts'
import { toRows } from '../src/client/transcript.ts'
import type { MirrorEvent } from '../src/shared/protocol.ts'

/** One `tool/call` as the mirror carries it. */
function call(seq: number, callId: string, name: string, args: string): MirrorEvent {
  return {
    seq,
    time: 1_700_000_000_000 + seq,
    type: 'tool/call',
    data: { callId, name, arguments: args },
  } as unknown as MirrorEvent
}

const ROWS = toRows([
  call(1, 'call-1', 'bash', '{"command":"rm -rf /tmp/x","description":"clean the temp dir"}'),
])

describe('what a card can say about the operation being allowed', () => {
  it('shows the call the mirror holds, named as the ledger names it', () => {
    const view = approvalPresentation(ROWS, { toolName: 'bash', callId: 'call-1' })
    assert.equal(view.held, true)
    assert.equal(view.toolName, 'bash')
    assert.match(view.argumentsText, /rm -rf \/tmp\/x/)
    assert.notEqual(view.summary, '', 'the card has a one-line gist, not just a name')
  })

  it('says the call is not in view rather than showing a bare tool name', () => {
    const view = approvalPresentation(ROWS, { toolName: 'bash', callId: 'call-gone' })
    assert.equal(view.held, false)
    assert.equal(view.toolName, 'bash')
    assert.equal(view.argumentsText, '')
  })

  it('treats an offer with no call as an absence of information, not an absence of arguments', () => {
    // A hook-driven ask has no call id at all; the card still has to say which tool.
    const view = approvalPresentation(ROWS, { toolName: 'write', reason: 'a hook gated this' })
    assert.equal(view.held, false)
    assert.equal(view.toolName, 'write')
  })

  it('prefers the mirror name when the two disagree', () => {
    // The offer's name comes from the approval seam and the row's from the call
    // itself; a card contradicting the row directly above it helps nobody.
    const view = approvalPresentation(ROWS, { toolName: 'Bash', callId: 'call-1' })
    assert.equal(view.toolName, 'bash')
  })
})
