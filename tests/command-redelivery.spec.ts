/**
 * A command the server handed over and never heard about again.
 *
 * A write into a stream that is already closing is accepted locally and arrives
 * nowhere: no error on the server, no ack from the machine, and until now the hub
 * called that `delivered` and never looked again. The repair has two halves and
 * neither works alone —
 *
 *  - the **server** keeps a command owed until it is acknowledged, and hands it over
 *    again on a timer;
 *  - the **machine** refuses to act on a command id twice, acknowledging the repeat
 *    instead, so re-delivery is safe.
 *
 * Without the second half a retried prompt would be a second prompt in the same
 * Session, which is worse than the loss being repaired. So the halves are pinned
 * separately here: the hub's bookkeeping against a recording sink, and the machine's
 * refusal over a real listener and a real link.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { SyncHub, type OriginSink } from '../src/host/hub.ts'
import { OriginLink, RecentCommands, startSyncServer, type SyncServerHandle } from '../src/host/transport.ts'
import type { DownstreamCommand } from '../src/shared/protocol.ts'

const MACHINE = 'retry-origin'
const SESSION = 'session-retry-0000-0000-000000000000'
const PASSWORD = 'r-pw'
const PORT = 18_813

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

/** A hub with one published Session and a recording origin sink. */
function bench(): { hub: SyncHub; sent: DownstreamCommand[] } {
  const sent: DownstreamCommand[] = []
  const hub = new SyncHub(() => {}, () => ({}) as never, quiet)
  hub.publishIndex({
    machineName: MACHINE,
    sessions: [{ sessionId: SESSION, title: 't', updatedAt: 1, running: false }],
  })
  const sink: OriginSink = {
    send: command => { sent.push(command) },
    resync: () => {},
    older: () => {},
  }
  hub.attachOrigin(MACHINE, sink)
  return { hub, sent }
}

describe('a command that was never acknowledged', () => {
  it('is handed over again, and stops being owed once the machine answers', () => {
    const { hub, sent } = bench()
    const accepted = hub.submitCommand(MACHINE, SESSION, 'hello', 'console')
    assert.equal(accepted.ok, true)
    const commandId = accepted.ok ? accepted.commandId : ''
    assert.equal(sent.length, 1, 'a connected machine is handed it at once')

    // The lost case: the write went into a closing stream, so nothing came back.
    hub.retryCommands(Date.now() + 60_000)
    assert.equal(sent.length, 2, 'the same command is handed over again')
    assert.equal(sent[1]?.commandId, commandId, 'and it is the same command, not a new one')

    hub.ackCommand(MACHINE, { commandId, sessionId: SESSION, ok: true })
    hub.retryCommands(Date.now() + 120_000)
    assert.equal(sent.length, 2, 'an acknowledged command is no longer owed')
  })

  it('stops after a bounded number of attempts rather than trying forever', () => {
    const { hub, sent } = bench()
    hub.submitCommand(MACHINE, SESSION, 'hello', 'console')
    for (let round = 1; round <= 10; round += 1) hub.retryCommands(Date.now() + 60_000 * round)
    // One delivery plus the retry budget: a machine that is up but silent is a
    // different fault from a link that is down, and the TTL is what ends this one.
    assert.equal(sent.length, 5, 'first delivery plus four retries, then silence')
  })

  it('reports how many times a command has been handed over', () => {
    // The count is what tells "sent once, waiting" from "sent five times, nothing":
    // without it both look like `delivered` in the console's command list.
    const { hub } = bench()
    hub.submitCommand(MACHINE, SESSION, 'hello', 'console')
    hub.retryCommands(Date.now() + 60_000)
    const status = hub.commands(MACHINE).at(-1)
    assert.equal(status?.state, 'delivered')
    assert.equal(status?.retries, 1, 'the second hand-over is recorded as one retry')
  })

  it('still lets the TTL end an unacknowledged command', () => {
    const { hub, sent } = bench()
    hub.submitCommand(MACHINE, SESSION, 'hello', 'console')
    // The TTL is two minutes; ageing the clock past it owes the machine nothing.
    hub.expireCommands(Date.now() + 10 * 60_000)
    for (let round = 1; round <= 5; round += 1) hub.retryCommands(Date.now() + 10 * 60_000 + 60_000 * round)
    assert.equal(sent.length, 1, 'an expired command is not handed over again')
  })
})

describe('a command the machine has already admitted', () => {
  it('is admitted once and refused afterwards, per id', () => {
    const recent = new RecentCommands(2)
    assert.equal(recent.admit('a'), true)
    assert.equal(recent.admit('a'), false, 'the same id is not acted on twice')
    assert.equal(recent.admit('b'), true)
    assert.equal(recent.admit('c'), true, 'the oldest is evicted at the limit')
    assert.equal(recent.admit('a'), true, 'so an id older than the window is new again')
    assert.equal(recent.admit('c'), false)
  })

  it('drops a re-delivered command at the machine, over a real link', async () => {
    const hub = new SyncHub(() => {}, () => ({}) as never, quiet)
    const server: SyncServerHandle = await startSyncServer({
      host: '127.0.0.1',
      port: PORT,
      password: () => PASSWORD,
      serverName: () => 'retry-server',
      hub,
      logger: quiet,
    })
    hub.publishIndex({
      machineName: MACHINE,
      sessions: [{ sessionId: SESSION, title: 't', updatedAt: 1, running: false }],
    })
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

      const accepted = hub.submitCommand(MACHINE, SESSION, 'run once', 'console')
      assert.equal(accepted.ok, true)
      await until(() => (commands.length === 1 ? true : undefined), 'the command to arrive')

      // The server saw no ack, so it hands the same command over again — which is
      // exactly what it would do after a write vanished into a closing stream.
      hub.retryCommands(Date.now() + 60_000)
      await delay(400)
      assert.equal(commands.length, 1, 'the second copy is acknowledged, not acted on')
      assert.equal(commands[0]?.kind === 'prompt' ? commands[0].text : '', 'run once')
    } finally {
      link.stop()
      await server.close()
    }
  })
})
