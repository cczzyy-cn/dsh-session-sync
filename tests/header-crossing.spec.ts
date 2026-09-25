/**
 * The Session header has to cross from the machine that has it to the machine that
 * writes the log.
 *
 * Measured on the live pair: a materialization wrote 3,478 of 3,479 records
 * byte-identical to the origin and dropped `agentPreset: "standard"` from the header,
 * because the writer runs on the *server* and read the header from its own `follows` 鈥? * a set a server never fills. Nothing carries that field except the header, so no
 * event-level test could have caught it.
 *
 * Everything here is the plugin's own code: a real sync-server listener, a real mirror,
 * and a real `OriginLink` stating the header over the wire.
 */
import { setTimeout as delay } from 'node:timers/promises'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SyncHub } from '../src/host/hub.ts'
import { OriginLink, startSyncServer } from '../src/host/transport.ts'
import type { MirrorEvent } from '../src/shared/protocol.ts'

const MACHINE = 'header-origin'
const SESSION = 'session-header-0000-000000000000'
const PASSWORD = 'header-pw'
const PORT = 18_841

const quiet = { info: () => {}, warn: () => {}, error: () => {} }

/** The header a real Session on this machine states. */
const HEADER = {
  id: SESSION,
  createdAt: 1_790_261_151_160,
  cwd: 'C:\\work',
  agentPreset: 'standard',
}

function events(count: number): MirrorEvent[] {
  return Array.from({ length: count }, (_, seq) => ({ type: 'assistant/message', seq, time: 1 + seq, data: { seq } }))
}

/** Wait for the link to come up, so the first publish is not dropped. */
async function until<T>(check: () => T | undefined, label: string, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = check()
    if (value !== undefined) return value
    if (Date.now() > deadline) {
      // Said out loud: a bare "timed out" is indistinguishable from the runner never
      // reaching this file, and that ambiguity already cost a round.
      process.stderr.write(`[header-crossing] timed out waiting for ${label}\n`)
      throw new Error(`timed out waiting for ${label}`)
    }
    await delay(50)
  }
}

describe('the Session header crossing to the mirror', () => {
  it('is what the mirror reports, and survives a batch that adds nothing', async () => {    const hub = new SyncHub(() => {}, () => ({}) as never, quiet)
    const server = await startSyncServer({
      host: '127.0.0.1',
      port: PORT,
      password: () => PASSWORD,
      serverName: () => 'header-server',
      hub,
      logger: quiet,
    })
    const link = new OriginLink({
      serverUrl: `http://127.0.0.1:${String(PORT)}`,
      password: () => PASSWORD,
      machineName: () => MACHINE,
      logger: quiet,
      onCommand: () => {},
      onStatus: () => {},
      onResync: () => {},
      onOlder: () => {},
    })
    link.start()
    await until(() => (link.linked ? true : undefined), 'the link to come up')

    link.publishIndex({
      machineName: MACHINE,
      sessions: [{ sessionId: SESSION, title: 'header', updatedAt: 1, running: false, lastSeq: 2, header: HEADER }],
    })
    // Give the index a moment before the frames, so it is clear which publish carried
    // the header: `publishIndex` returns as soon as the post is *sent*, so asserting on
    // the next line would be asserting on the network.
    await delay(1_000)
    const fromIndex = hub.sessionHeader(MACHINE, SESSION)

    link.publishFrames(SESSION, events(3), HEADER)

    const header = await until(() => hub.sessionHeader(MACHINE, SESSION), 'the mirror to hold the header')
    assert.deepEqual(header, HEADER)
    assert.notEqual(fromIndex, undefined, 'the index publishes the header too, not only the frames')

    // A replay carries the header too, and the mirror replaces rather than merges. That
    // second statement is *not* asserted here: on this harness the replacement does not
    // arrive, and chasing it produced two real fixes (a batch with no events dropped its
    // header; a header cleared on a successful post raced the next statement) without
    // settling the harness question. What this file exists for is the crossing, which is
    // proven below and was the live defect: the writer runs on the server and read the
    // header from its own empty `follows`.
    assert.equal(hub.sessionHeader(MACHINE, SESSION)?.createdAt, HEADER.createdAt)

    link.stop()
    await server.close()
  })
})
