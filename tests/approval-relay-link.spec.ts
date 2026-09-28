/**
 * One relayed approval, over the real link.
 *
 * The same journey a question takes — the server holds the card, mints the decision
 * as a downstream command, and the machine's link must recognise it and hand it to
 * the engine — with the one difference that makes it worth its own test: this
 * command grants *permission*. A dropped one is bad for a question and worse here,
 * because the machine's tool call is blocked on it, and the console cannot tell
 * "granted" from "never arrived" without the ack.
 *
 * That is exactly the bug this shape of test caught for questions (the dispatcher
 * only knew `kind: 'prompt'`, so answers vanished in silence). This test drives the
 * real `OriginLink` against the real listener, and asserts the approval command
 * arrives, carries its direction, and closes the card as granted.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { SyncHub } from '../src/host/hub.ts'
import { OriginLink, startSyncServer, type SyncServerHandle } from '../src/host/transport.ts'
import type { DownstreamCommand, SyncStreamFrame } from '../src/shared/protocol.ts'

const MACHINE = 'approval-origin'
const SESSION = 'session-approval-0000-000000000000'
const APPROVAL = 'a-1'
const PASSWORD = 'a-pw'
const PORT = 18_811

const quiet = { info: () => {}, warn: () => {}, error: () => {} }

/** Wait until `check` answers, or fail naming what was waited for. */
async function until<T>(check: () => T | undefined, label: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = check()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await delay(50)
  }
}

describe('a relayed approval over the real link', () => {
  it('carries the console decision to the machine, and the ack closes the card as granted', async () => {
    const frames: SyncStreamFrame[] = []
    const hub = new SyncHub(frame => { frames.push(frame) }, () => ({}) as never, quiet)
    const server: SyncServerHandle = await startSyncServer({
      host: '127.0.0.1',
      port: PORT,
      password: () => PASSWORD,
      serverName: () => 'a-server',
      hub,
      logger: quiet,
    })
    hub.publishIndex({
      machineName: MACHINE,
      sessions: [{ sessionId: SESSION, title: 'a', updatedAt: 1, running: false }],
    })
    hub.openApproval(MACHINE, {
      sessionId: SESSION,
      approvalId: APPROVAL,
      approval: { toolName: 'bash', callId: 'call-1', reason: 'the preset gates shell commands' },
      expiresAt: Date.now() + 60_000,
    })
    assert.equal(hub.approvals().length, 1, 'the server offers the approval')

    const commands: DownstreamCommand[] = []
    const link = new OriginLink({
      serverUrl: `http://127.0.0.1:${String(PORT)}`,
      password: () => PASSWORD,
      machineName: () => MACHINE,
      logger: quiet,
      onCommand: (command: DownstreamCommand) => { commands.push(command) },
      onStatus: () => {},
      onResync: () => {},
      onOlder: () => {},
    })
    try {
      link.start()
      await until(() => (link.linked ? true : undefined), 'the origin link to come up')

      const accepted = hub.submitApproval(MACHINE, APPROVAL, 'allowed-once', 'console')
      assert.equal(accepted.ok, true, 'a decision on an open approval is accepted')

      const delivered = await until(
        () => commands.find(command => command.kind === 'approval'),
        'the console decision to reach the machine',
      )
      assert.equal(delivered.kind === 'approval' ? delivered.approvalId : '', APPROVAL)
      // The direction has to survive the whole way: a console that rejected must
      // never be delivered as a grant.
      assert.equal(delivered.kind === 'approval' ? delivered.decision : '', 'allowed-once')

      const commandId = accepted.ok ? accepted.commandId : ''
      link.ackCommand(commandId, SESSION, true)
      await until(
        () => (hub.approvals().length === 0 ? true : undefined),
        'the card to close once the machine took the decision',
      )
      const closed = frames.filter(frame => frame.type === 'approval').at(-1)
      assert.equal(
        closed?.type === 'approval' ? closed.approval.closed : '',
        'allowed-at-console',
        'the card is closed as granted, not merely closed',
      )
    } finally {
      link.stop()
      await server.close()
    }
  })

  it('refuses to offer an approval for a Session the console cannot see', () => {
    // The card names a tool and resolves its arguments out of the mirrored
    // transcript, so an un-published Session would offer a reader an unnamed
    // permission over a conversation they cannot read.
    const hub = new SyncHub(() => {}, () => ({}) as never, quiet)
    hub.publishIndex({ machineName: MACHINE, sessions: [] })
    hub.openApproval(MACHINE, {
      sessionId: SESSION,
      approvalId: APPROVAL,
      approval: { toolName: 'bash' },
      expiresAt: Date.now() + 60_000,
    })
    assert.deepEqual(hub.approvals(), [])
    assert.deepEqual(hub.submitApproval(MACHINE, APPROVAL, 'allowed-once', 'console'), {
      ok: false,
      reason: 'this approval is no longer waiting',
    })
  })

  it('refuses a decision for a machine the server does not know', () => {
    const hub = new SyncHub(() => {}, () => ({}) as never, quiet)
    assert.deepEqual(hub.submitApproval('nobody', APPROVAL, 'rejected', 'console'), {
      ok: false,
      reason: 'unknown machine',
    })
  })
})
