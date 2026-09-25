/**
 * The ledger is what makes a written mirror read-only, so its one critical
 * property is durability: the `agent/pre-step` gate reads it at boot, and a mark
 * that survived only until the next restart would fail open exactly once per
 * boot — with a runnable copy of somebody else's Session on this Host.
 *
 * These tests run against a real temporary directory rather than a fake, because
 * the claim under test *is* about the file: "reopen and it still owns the
 * Session" cannot be shown against an in-memory double.
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MirrorLedger } from '../src/host/ledger.ts'
import { MATERIALIZED_FILE_NAME } from '../src/shared/protocol.ts'

const homes: string[] = []

after(async () => {
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

/** A throwaway Harness home. */
async function home(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'sync-ledger-'))
  homes.push(path)
  return path
}

describe('the ledger of written mirrors', () => {
  it('owns a Session it marked, and still owns it after a restart', async () => {
    const path = await home()
    const first = await MirrorLedger.open(path)
    assert.equal(first.owns('session-a'), false)
    await first.mark('session-a', 'DESKTOP-TEST', 12)
    assert.equal(first.owns('session-a'), true)

    // The restart: a fresh read of the same document.
    const second = await MirrorLedger.open(path)
    assert.equal(second.owns('session-a'), true)
    assert.deepEqual(second.get('session-a'), {
      machineName: 'DESKTOP-TEST',
      at: second.get('session-a')!.at,
      events: 12,
    })
  })

  it('does not resume tracking a Session it stopped', async () => {
    // The reason a copy stopped is a fact about the log's continuity. Clearing it
    // on the next append would hide the hole the next reader is about to meet.
    const path = await home()
    const ledger = await MirrorLedger.open(path)
    await ledger.mark('session-gap', 'DESKTOP-TEST', 4)
    await ledger.stop('session-gap', 'the mirror holds nothing at seq 4')
    await ledger.mark('session-gap', 'DESKTOP-TEST', 99)

    const reopened = await MirrorLedger.open(path)
    assert.equal(reopened.get('session-gap')?.stopped, 'the mirror holds nothing at seq 4')
    assert.equal(reopened.get('session-gap')?.events, 4)
  })

  it('releases a Session without touching anything else', async () => {
    const path = await home()
    const ledger = await MirrorLedger.open(path)
    await ledger.mark('session-keep', 'DESKTOP-TEST', 1)
    await ledger.mark('session-drop', 'DESKTOP-TEST', 2)

    assert.equal(await ledger.release('session-drop'), true)
    assert.equal(await ledger.release('session-drop'), false, 'releasing twice is not an error')
    const reopened = await MirrorLedger.open(path)
    assert.equal(reopened.owns('session-drop'), false)
    assert.equal(reopened.owns('session-keep'), true)
  })

  it('reads an unreadable document as empty rather than throwing', async () => {
    // A ledger nobody can parse is an empty ledger. That is the honest reading:
    // the gate then answers "not ours" for everything, which is the same answer a
    // Host with no mirrors gives — and the failure is visible in `state`, where
    // the operator is already looking.
    const path = await home()
    await writeFile(join(path, MATERIALIZED_FILE_NAME), '{ not json', 'utf8')
    const ledger = await MirrorLedger.open(path)
    assert.equal(ledger.owns('session-a'), false)
    assert.deepEqual(ledger.list(), [])
  })

  it('drops entries that are not the shape it writes', async () => {
    const path = await home()
    await writeFile(join(path, MATERIALIZED_FILE_NAME), JSON.stringify({
      version: 1,
      sessions: {
        'session-good': { machineName: 'M', at: 5, events: 7 },
        // No machineName: not an entry this ledger could have written.
        'session-nameless': { at: 5, events: 7 },
        'session-not-object': 3,
      },
    }), 'utf8')
    const ledger = await MirrorLedger.open(path)
    assert.deepEqual(ledger.list().map(item => item.sessionId), ['session-good'])
  })

  it('writes the document where the plugin says it lives', async () => {
    const path = await home()
    const ledger = await MirrorLedger.open(path)
    await ledger.mark('session-a', 'DESKTOP-TEST', 1)
    assert.equal(ledger.file, join(path, MATERIALIZED_FILE_NAME))
    assert.equal(existsSync(ledger.file), true)
    const document = JSON.parse(await readFile(ledger.file, 'utf8')) as { version: number }
    assert.equal(document.version, 1)
  })
})
