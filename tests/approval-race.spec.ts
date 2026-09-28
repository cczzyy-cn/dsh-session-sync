/**
 * The two-sided race for one approval.
 *
 * The mechanics are the question race's — one winner, a loser that is told why,
 * counters that name which side won — but the stake is permission: `allowed-once`
 * releases a tool call this machine's own preset was gating. So these tests pin the
 * parts that make that safe as well as the parts that make it work:
 *
 *  - only the two decisions a *human* can mean may be claimed from a console
 *    (`cancelled` and `unavailable` describe an answerer, and `unavailable` is the
 *    fail-closed value a caller must get from its own side, never from a remote);
 *  - a decision that arrives after the machine's own human decided is refused with a
 *    reason, not applied late — a permission granted after the fact is not a
 *    permission anybody is waiting for;
 *  - every way this can end without a console grant leaves the caller in the
 *    fail-closed direction.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ApprovalRelay, invalidDecisionReason, localApprovalOutcome } from '../src/host/approvals.ts'
import type { ApprovalOutcomeLike, ApprovalRequestLike } from '../src/host/dsh.ts'

const SESSION = 'session-approval-0000-000000000000'

/** One approval the upstream seam would dispatch. */
const REQUEST: ApprovalRequestLike = {
  toolName: 'bash',
  callId: 'call-1',
  reason: 'the preset gates shell commands',
}

/** A relay with a recording sink and a clock a test can move. */
function bench(ttlMs?: number): {
  relay: ApprovalRelay
  frames: { kind: 'open' | 'close'; approvalId: string; outcome?: string; toolName?: string }[]
  advance: (ms: number) => void
} {
  const frames: { kind: 'open' | 'close'; approvalId: string; outcome?: string; toolName?: string }[] = []
  let clock = 1_700_000_000_000
  const relay = new ApprovalRelay({
    open: (_sessionId, approvalId, approval) => {
      frames.push({ kind: 'open', approvalId, toolName: approval.toolName })
    },
    close: (_sessionId, approvalId, outcome) => { frames.push({ kind: 'close', approvalId, outcome }) },
    now: () => clock,
  }, ttlMs)
  return { relay, frames, advance: (ms: number) => { clock += ms } }
}

/** An answerer that never decides, for the tests where the console must win. */
function silent(): Promise<ApprovalOutcomeLike> {
  return new Promise<ApprovalOutcomeLike>(() => {})
}

/** The id the relay minted for the only offer it made. */
function offeredId(frames: { kind: 'open' | 'close'; approvalId: string }[]): string {
  const open = frames.find(frame => frame.kind === 'open')
  assert.ok(open !== undefined, 'the relay must have offered the approval')
  return open.approvalId
}

describe('the race between the console and the machine over one approval', () => {
  it('offers the tool and its call to the console, and nothing for an un-relayable Session', async () => {
    const { relay, frames } = bench()
    const outcome = await relay.race(undefined, REQUEST, async () => 'rejected')
    assert.equal(outcome, 'rejected')
    assert.deepEqual(frames, [], 'an approval with no Session to relay it for never reaches the link')

    const { relay: second, frames: secondFrames } = bench()
    void second.race(SESSION, REQUEST, silent)
    assert.deepEqual(secondFrames, [
      { kind: 'open', approvalId: offeredId(secondFrames), toolName: 'bash' },
    ])
    assert.equal(second.counts().offered, 1)
    assert.equal(second.counts().open, 1)
  })

  it('takes the local grant and tells the console which way it lost', async () => {
    const { relay, frames } = bench()
    const outcome = await relay.race(SESSION, REQUEST, async () => 'allowed-once')
    assert.equal(outcome, 'allowed-once')
    const close = frames.find(frame => frame.kind === 'close')
    assert.equal(close?.outcome, 'allowed-at-origin')
    assert.equal(relay.counts().decidedLocally, 1)
    assert.equal(relay.counts().decidedRemotely, 0)
  })

  it('tells the console when the machine refused rather than allowed', async () => {
    const { relay, frames } = bench()
    assert.equal(await relay.race(SESSION, REQUEST, async () => 'rejected'), 'rejected')
    // The distinction matters more here than anywhere: a reader who could not tell
    // "the machine allowed it" from "the machine refused it" would misread their own
    // audit trail of a permission.
    assert.equal(frames.find(frame => frame.kind === 'close')?.outcome, 'rejected-at-origin')
  })

  it('reports a cancelled local answerer as an abort, not as a decision', async () => {
    const { relay, frames } = bench()
    assert.equal(await relay.race(SESSION, REQUEST, async () => 'cancelled'), 'cancelled')
    assert.equal(frames.find(frame => frame.kind === 'close')?.outcome, 'aborted')
  })

  it('rethrows a local failure after withdrawing the card, and counts it', async () => {
    const { relay, frames } = bench()
    await assert.rejects(
      relay.race(SESSION, REQUEST, async () => { throw new Error('no answerer') }),
      /no answerer/,
    )
    assert.equal(frames.find(frame => frame.kind === 'close')?.outcome, 'aborted')
    assert.equal(relay.counts().aborted, 1)
    // Fail closed: the caller sees its own answerer's failure, never a grant.
    assert.equal(relay.counts().decidedRemotely, 0)
  })

  it('lets the console decide when the machine is still waiting', async () => {
    const { relay, frames } = bench()
    const racing = relay.race(SESSION, REQUEST, silent)
    const id = offeredId(frames)
    assert.deepEqual(relay.claim(id, 'allowed-once', 'cmd-1'), { ok: true })
    assert.equal(await racing, 'allowed-once')
    assert.equal(relay.counts().decidedRemotely, 1)
    // No close for the console's own decision: the server closes that card when it
    // accepts the decision, and telling it again would be telling it what it did.
    assert.equal(frames.filter(frame => frame.kind === 'close').length, 0)
  })

  it('refuses a decision for an approval the machine already decided itself', async () => {
    const { relay, frames } = bench()
    await relay.race(SESSION, REQUEST, async () => 'rejected')
    const late = relay.claim(offeredId(frames), 'allowed-once', 'cmd-1')
    assert.match(late.ok ? '' : late.reason, /already decided on the machine/)
    // The counter is what makes the refusal visible in `/state`: without it, "the
    // console never saw this" and "the console decided too late" look the same.
    assert.equal(relay.counts().lateDecisions, 1)
  })

  it('refuses an unknown id and an expired approval, each with its own reason', async () => {
    const { relay, frames, advance } = bench(1_000)
    assert.match(
      (relay.claim('never-offered', 'allowed-once', 'cmd-1') as { reason: string }).reason,
      /no such approval/,
    )
    void relay.race(SESSION, REQUEST, silent)
    advance(1_001)
    const expired = relay.claim(offeredId(frames), 'allowed-once', 'cmd-1')
    assert.match(expired.ok ? '' : expired.reason, /expired/)
  })

  it('accepts a re-delivered decision and refuses a different one', async () => {
    const { relay, frames } = bench()
    const racing = relay.race(SESSION, REQUEST, silent)
    const id = offeredId(frames)
    assert.deepEqual(relay.claim(id, 'allowed-once', 'cmd-1'), { ok: true })
    // The same command twice is the same decision: the console is asking about
    // something it already did, and a refusal would read as a lost race.
    assert.deepEqual(relay.claim(id, 'allowed-once', 'cmd-1'), { ok: true })
    const second = relay.claim(id, 'rejected', 'cmd-2')
    assert.match(second.ok ? '' : second.reason, /already decided from the console/)
    assert.equal(await racing, 'allowed-once')
  })

  it('refuses the outcomes a console is not allowed to produce', async () => {
    const { relay, frames } = bench()
    const racing = relay.race(SESSION, REQUEST, silent)
    const id = offeredId(frames)
    for (const forged of ['unavailable', 'cancelled', 'allow', 'allowed']) {
      const refused = relay.claim(id, forged as never, 'cmd-1')
      assert.match(refused.ok ? '' : refused.reason, /may only allow once or reject/)
    }
    // Nothing was claimed: the caller is still waiting, and can still be decided
    // properly. That is the point — a forged frame must not end the request.
    assert.equal(relay.counts().open, 1)
    assert.deepEqual(relay.claim(id, 'rejected', 'cmd-2'), { ok: true })
    assert.equal(await racing, 'rejected')
  })

  it('withdraws everything still pending when the machine goes away', async () => {
    const { relay, frames } = bench()
    void relay.race(SESSION, REQUEST, silent)
    relay.withdrawAll()
    assert.equal(frames.find(frame => frame.kind === 'close')?.outcome, 'aborted')
    assert.equal(relay.counts().open, 0)
  })

  it('names each local outcome the way the console needs to read it', () => {
    assert.equal(localApprovalOutcome('allowed-once'), 'allowed-at-origin')
    assert.equal(localApprovalOutcome('rejected'), 'rejected-at-origin')
    assert.equal(localApprovalOutcome('cancelled'), 'aborted')
    assert.equal(localApprovalOutcome('unavailable'), 'unavailable')
    assert.equal(invalidDecisionReason('allowed-once'), undefined)
    assert.match(invalidDecisionReason('unavailable') ?? '', /may only allow once or reject/)
  })
})
