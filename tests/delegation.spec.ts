/**
 * What counts as a delegation, pinned once.
 *
 * The counter in the session chrome and the delegation row in the ledger each used
 * to answer this question for themselves, and they disagreed: the ledger knew
 * `subagent`, `workflow` and `task`, the counter knew `subagent` and `subagent_fork`.
 * A Session that delegated through `workflow` therefore showed its delegation rows
 * in the ledger and `子代理 0` in the header. These tests hold the one shared answer,
 * so the next tool family cannot be added to one reader only.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isDelegationTool } from '../src/client/delegation.ts'

describe('what counts as a delegation', () => {
  it('recognises every family the ledger draws as a delegation', () => {
    // The three the presentation already knew — the counter was missing the last two.
    assert.equal(isDelegationTool('subagent'), true)
    assert.equal(isDelegationTool('subagent_fork'), true)
    assert.equal(isDelegationTool('workflow'), true)
    assert.equal(isDelegationTool('task'), true)
  })

  it('counts future variants of the same families', () => {
    // Prefix matching, inherited from the presentation layer, on purpose: a new
    // `task_*` or `subagent_*` tool should not need this file edited to be counted.
    assert.equal(isDelegationTool('task_thing'), true)
    assert.equal(isDelegationTool('subagent_x'), true)
    // The over-match this buys, stated rather than hidden: a name that merely starts
    // with a family word is counted. workflowless is not a real tool; if one ever
    // exists, this is the line that says why it was counted.
    assert.equal(isDelegationTool('workflowless'), true)
  })

  it('does not claim ordinary tools', () => {
    for (const name of ['bash', 'read', 'write', 'edit', 'pwsh', 'ask_user_question']) {
      assert.equal(isDelegationTool(name), false, `${name} is not a delegation`)
    }
  })
})
