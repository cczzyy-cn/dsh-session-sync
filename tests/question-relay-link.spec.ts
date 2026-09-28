/**
 * One relayed question, over the real link.
 *
 * The two halves of this feature live in different processes: the server holds the
 * question and mints the answer command, and the machine's link has to recognise
 * that command and hand it to the engine. That second step is where the console's
 * answers disappeared: the downstream dispatcher compared `kind` against `'prompt'`
 * alone, so the first new command kind was dropped in silence — no ack, no error,
 * no state anywhere, and a card left on screen saying it was still waiting.
 *
 * So this test drives the real `OriginLink` against the real listener rather than
 * calling the hub, and asserts the frame arrives. Removing `answer` from the
 * dispatcher fails it.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { SyncHub } from '../src/host/hub.ts'
import { COMMAND_KINDS, OriginLink, startSyncServer, type SyncServerHandle } from '../src/host/transport.ts'
import type { DownstreamCommand } from '../src/shared/protocol.ts'

const MACHINE = 'question-origin'
const SESSION = 'session-question-0000-000000000000'
const QUESTION = 'q-1'
const PASSWORD = 'q-pw'
const PORT = 18_809

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

describe('a relayed question over the real link', () => {
  it('carries the console answer to the machine, and the ack closes the card', async () => {
    const hub = new SyncHub(() => {}, () => ({}) as never, quiet)
    const server: SyncServerHandle = await startSyncServer({
      host: '127.0.0.1',
      port: PORT,
      password: () => PASSWORD,
      serverName: () => 'q-server',
      hub,
      logger: quiet,
    })
    hub.publishIndex({
      machineName: MACHINE,
      sessions: [{ sessionId: SESSION, title: 'q', updatedAt: 1, running: false }],
    })
    hub.openQuestion(MACHINE, {
      sessionId: SESSION,
      questionId: QUESTION,
      questions: [{ id: 'q1', question: 'which one?', options: [{ label: 'a' }, { label: 'b' }] }],
      expiresAt: Date.now() + 60_000,
    })
    assert.equal(hub.questions().length, 1, 'the server offers the question')

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

      const accepted = hub.submitAnswer(MACHINE, QUESTION, [{ id: 'q1', selected: ['b'] }], 'console')
      assert.equal(accepted.ok, true, 'an answer to an open question is accepted')

      // The frame that used to be dropped: it is `kind: 'answer'`, and the
      // dispatcher only knew `prompt`.
      const delivered = await until(
        () => commands.find(command => command.kind === 'answer'),
        'the console answer to reach the machine',
      )
      assert.equal(delivered.kind === 'answer' ? delivered.questionId : '', QUESTION)
      assert.deepEqual(
        delivered.kind === 'answer' ? delivered.answers : [],
        [{ id: 'q1', selected: ['b'] }],
      )

      const commandId = accepted.ok ? accepted.commandId : ''
      link.ackCommand(commandId, SESSION, true)
      await until(
        () => (hub.questions().length === 0 ? true : undefined),
        'the card to close once the machine claims the answer',
      )
    } finally {
      link.stop()
      await server.close()
    }
  })

  it('routes every command kind the protocol defines', () => {
    // Pinned on purpose: this map is a total map over `DownstreamCommand['kind']`,
    // so adding a kind without routing it is a compile error, and this list makes
    // that edit conscious.
    assert.deepEqual(COMMAND_KINDS, { prompt: true, answer: true })
  })
})
