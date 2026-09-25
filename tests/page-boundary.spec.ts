/**
 * The page bound the origin asks its log for.
 *
 * The mirror asks for "the page below what I hold" by naming the lowest sequence
 * it holds, and that is an *inclusive* upper bound. The controller's
 * `page(beforeSeq)` is exclusive. Reading the first as if it were already the
 * second — which the hub did, by subtracting one upstream — left the boundary
 * event out of every page, so a backfill put a hole at every page boundary: a
 * 3,478-event Session came back as 3,468 events with ten one-event holes.
 *
 * This pins the translation, because nothing else can: the page comes back
 * looking perfectly well formed, just one event short, every time.
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

const SESSION_ID = 'session-boundary-0000-0000-000000000000'
const MACHINE = 'pg-origin'
const PASSWORD = 'pgpw'
const SERVER_PORT = 18_795
const SESSION_EVENTS = 1_200

const homes: string[] = []
const disposers: (() => Promise<void> | void)[] = []
const quiet = { info: () => {}, warn: () => {}, error: () => {} }

after(async () => {
  for (const dispose of disposers.reverse()) await dispose()
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

function event(seq: number): { type: string; seq: number; time: number; data: unknown } {
  return { type: 'assistant/message', seq, time: 1_700_000_000_000 + seq, data: { text: `e${String(seq)}` } }
}

/** A controller whose `page` is exclusive below `beforeSeq`, like the real one. */
function controller(): { value: SessionControllerLike; calls: { throughSeq: number; beforeSeq: number }[] } {
  const all = Array.from({ length: SESSION_EVENTS }, (_, index) => event(index))
  const calls: { throughSeq: number; beforeSeq: number }[] = []
  return {
    calls,
    value: {
      list: () => Promise.resolve({
        items: [{ sessionId: SESSION_ID, updatedAt: 1, running: false, blank: false, cwd: 'C:\\work' }],
      }),
      follow: (_request, signal) => (async function* () {
        yield {
          type: 'snapshot',
          header: { id: SESSION_ID, createdAt: 1, cwd: 'C:\\work' },
          cursor: SESSION_EVENTS - 1,
          // The mirror starts on a tail window, exactly like a real follow.
          records: all.slice(-100).map(item => ({ type: 'event', event: item })),
          hasMore: true,
          projections: { values: {} },
        } satisfies FollowFrame
        await new Promise<void>(resolve => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      })(),
      page: (request) => {
        calls.push({ throughSeq: request.throughSeq, beforeSeq: request.beforeSeq ?? -1 })
        const below = all.filter(item => item.seq < (request.beforeSeq ?? Number.MAX_SAFE_INTEGER))
        const take = below.slice(-50)
        return Promise.resolve({
          records: take.map(item => ({ type: 'event', event: item })),
          hasMore: below.length > take.length,
        })
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
    await new Promise<void>(resolve => { setTimeout(resolve, 50) })
  }
}

describe('the page bound', () => {
  it('asks the log for one past the lowest sequence the mirror holds', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pg-boundary-'))
    homes.push(home)
    await writeFile(join(home, 'dsh-session-sync.json'), JSON.stringify({
      machineName: MACHINE,
      serverUrl: `127.0.0.1:${String(SERVER_PORT)}`,
      isServer: false,
      password: PASSWORD,
      listenHost: '127.0.0.1',
      listenPort: 18_796,
      syncSessions: { [SESSION_ID]: true },
    }), 'utf8')

    const hub = new SyncHub(() => {}, () => ({}) as never, quiet)
    const server: SyncServerHandle = await startSyncServer({
      host: '127.0.0.1',
      port: SERVER_PORT,
      password: () => PASSWORD,
      serverName: () => 'pg-server',
      hub,
      logger: quiet,
    })
    disposers.push(async () => { await server.close() })

    const { value, calls } = controller()
    const service = await SessionSyncService.create(context(value), home)
    service.start()
    disposers.push(async () => { await service.dispose() })

    // The tail window arrives, so the mirror's lowest held sequence is known.
    const session = await until(() => {
      const found = hub.machines()
        .find(machine => machine.machineName === MACHINE)
        ?.sessions.find(item => item.sessionId === SESSION_ID)
      return found === undefined ? undefined : found
    }, 'the tail window to reach the mirror')
    assert.equal(session.eventCount, 100)

    // A reader reaching the mirror's lower edge names that edge; the origin must
    // read the page that *ends* there, which means asking its log for one past it.
    hub.transcript(MACHINE, SESSION_ID, { limit: 1, before: 1_100 })
    const call = await until(() => calls[0], 'the origin to read a page')
    assert.equal(call.throughSeq, SESSION_EVENTS - 1)
    assert.equal(call.beforeSeq, 1_101, 'the boundary event must be inside the page')

    // And the event named by the reader really is delivered, which is what the
    // off-by-one used to lose.
    const held = await until(() => {
      const events = hub.transcript(MACHINE, SESSION_ID, { limit: 100_000 })?.events ?? []
      return events.some(item => item.seq === 1_100) ? events : undefined
    }, 'the boundary event to reach the mirror')
    assert.ok(held.some(item => item.seq === 1_100))
  })
})
