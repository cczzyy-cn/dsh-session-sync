/**
 * A hole repaired through the real DSH-facing path.
 *
 * `tests/hole-repair.spec.ts` pins the hub-side rules and
 * `tests/hole-repair-link.spec.ts` drives a synthetic origin over the real link;
 * this one goes through the client-role engine itself, so the page is read by the
 * real `pullOlder` and delivered as ordinary frames. It is what caught the first
 * version's off-by-one — the hub named the sequence *below* the hole, the origin
 * translated it faithfully, and the page came back ending before the hole began.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SessionSyncService } from '../src/host/service.ts'
import { SyncHub } from '../src/host/hub.ts'
import { startSyncServer, type SyncServerHandle } from '../src/host/transport.ts'
import type { FollowFrame, HostContext, SessionControllerLike } from '../src/host/dsh.ts'

const SESSION_ID = 'session-hole-1111-1111-111111111111'
const MACHINE = 'hole-e2e-origin'
const PASSWORD = 'hole-pw'
const SERVER_PORT = 18_797
const SESSION_EVENTS = 400
/** The sequence the opening window will not carry. */
const MISSING = 150

const homes: string[] = []
const disposers: (() => Promise<void> | void)[] = []
const quiet = { info: () => {}, warn: () => {}, error: () => {} }

after(async () => {
  for (const dispose of disposers.reverse()) await dispose()
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

function event(seq: number): { type: string; seq: number; time: number; data: unknown } {
  return { type: 'assistant/message', seq, time: 1_700_000_000_000 + seq, data: { seq } }
}

/** A controller whose opening window is missing one event, and a recording page API. */
function controller(): {
  value: SessionControllerLike
  pages: { throughSeq: number; beforeSeq: number; records: number; withMissing: boolean }[]
} {
  const all = Array.from({ length: SESSION_EVENTS }, (_, index) => event(index))
  const pages: { throughSeq: number; beforeSeq: number; records: number; withMissing: boolean }[] = []
  return {
    pages,
    value: {
      list: () => Promise.resolve({
        items: [{ sessionId: SESSION_ID, updatedAt: 1_700_000_000_000, running: false, blank: false, cwd: 'C:\\work' }],
      }),
      follow: (_request, signal) => (async function* () {
        yield {
          type: 'snapshot',
          header: { id: SESSION_ID, createdAt: 1_700_000_000_000, cwd: 'C:\\work' },
          cursor: SESSION_EVENTS - 1,
          // One event short, which is what a dropped batch leaves behind.
          records: all.filter(item => item.seq !== MISSING).map(item => ({ type: 'event', event: item })),
          hasMore: false,
          projections: { values: {} },
        } satisfies FollowFrame
        await new Promise<void>(resolve => {
          signal.addEventListener('abort', () => { resolve() }, { once: true })
        })
      })(),
      page: (request) => {
        // Exclusive, exactly like `SessionHistoryController.page`.
        const below = all.filter(item => item.seq < (request.beforeSeq ?? Number.MAX_SAFE_INTEGER))
        pages.push({
          throughSeq: request.throughSeq,
          beforeSeq: request.beforeSeq ?? -1,
          records: below.length,
          withMissing: below.some(item => item.seq === MISSING),
        })
        return Promise.resolve({ records: below.map(item => ({ type: 'event', event: item })), hasMore: false })
      },
      prompt: () => Promise.resolve({ accepted: true as const }),
    },
  }
}

const context = (value: SessionControllerLike): HostContext => ({
  logger: quiet,
  effect: () => {},
  get: (name: string) => (name === 'sessionController' ? value : undefined),
  inject: () => {},
})

async function until<T>(check: () => T | undefined, label: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = check()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await new Promise<void>(resolve => { setTimeout(resolve, 100) })
  }
}

describe('a hole reported by a live mirror', () => {
  it('makes the origin read the page that carries the missing event', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hole-e2e-'))
    homes.push(home)
    await writeFile(join(home, 'dsh-session-sync.json'), JSON.stringify({
      machineName: MACHINE,
      serverUrl: `127.0.0.1:${String(SERVER_PORT)}`,
      isServer: false,
      password: PASSWORD,
      listenHost: '127.0.0.1',
      listenPort: 18_798,
      syncSessions: { [SESSION_ID]: true },
    }), 'utf8')

    const hub = new SyncHub(() => {}, () => ({}) as never, quiet, { olderAskFloorMs: 0 })
    const server: SyncServerHandle = await startSyncServer({
      host: '127.0.0.1',
      port: SERVER_PORT,
      password: () => PASSWORD,
      serverName: () => 'hole-server',
      hub,
      logger: quiet,
    })
    disposers.push(async () => { await server.close() })

    const { value, pages } = controller()
    const service = await SessionSyncService.create(context(value), home)
    service.start()
    disposers.push(async () => { await service.dispose() })

    // The sweep is what notices a hole nothing else mentions.
    hub.sweepGaps()

    const read = await until(() => pages[0], 'the origin to read a page for the hole')
    // The hub names the hole's first sequence; the origin's page API is exclusive,
    // so one past it is the bound that puts the missing event inside the page.
    assert.equal(read.throughSeq, SESSION_EVENTS - 1)
    assert.equal(read.beforeSeq, MISSING + 1)
    assert.equal(read.withMissing, true, 'the page must carry the event the mirror lacks')

    // And the page really closes the hole: it is delivered as ordinary frames, and
    // the mirror becomes whole without the log being replayed.
    const whole = await until(() => {
      const session = hub.machines()
        .find(machine => machine.machineName === MACHINE)
        ?.sessions.find(item => item.sessionId === SESSION_ID)
      return session !== undefined && session.missingEvents === 0 ? session : undefined
    }, 'the mirror to become whole')
    assert.equal(whole.eventCount, SESSION_EVENTS)
  })
})
