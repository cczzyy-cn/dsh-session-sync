/**
 * A long Session's opening snapshot reaches the mirror whole.
 *
 * This is the end-to-end shape of the fault that froze backfill: the origin's
 * `follow` opening for a long Session is megabytes, the server refuses a body
 * over its limit, and a sender that puts the whole window in one POST is refused
 * forever — so the follow never finishes, its cursor stays unset, and every page
 * read behind the mirror is refused for want of that cursor.
 *
 * Everything here is this plugin's own code: a real sync-server listener, a real
 * mirror, the real client-role engine, and a Session controller stand-in whose
 * opening is as large as the real one measured on this deployment (3,478 events,
 * ~3.6 KB each ≈ 12 MB).
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

/** The window one long Session's follow opening carried, measured on this deployment. */
const SNAPSHOT_EVENTS = 3_478
const EVENT_BYTES = 3_600
const SESSION_ID = 'session-f6ba2b3b-6fe2-4aa1-9810-147c60bb7126'
const MACHINE = 'mat-origin'
const PASSWORD = 'test-password'
const SERVER_PORT = 18_791
const CLIENT_PORT = 18_792

const homes: string[] = []
const disposers: (() => Promise<void> | void)[] = []

after(async () => {
  for (const dispose of disposers.reverse()) await dispose()
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

/** One event of about {@link EVENT_BYTES}, like a real log entry. */
function snapshotEvent(seq: number): { type: string; seq: number; time: number; data: unknown } {
  const envelope = JSON.stringify({ seq, time: 1_700_000_000_000 + seq, data: {} })
  return {
    type: 'assistant/message',
    seq,
    time: 1_700_000_000_000,
    data: { text: 'x'.repeat(Math.max(0, EVENT_BYTES - envelope.length)) },
  }
}

/** A Session controller that opens on a tail window of a long log. */
function fakeController(events: readonly ReturnType<typeof snapshotEvent>[]): {
  controller: SessionControllerLike
  pages: { beforeSeq: number; throughSeq: number; records: number }[]
} {
  const pages: { beforeSeq: number; throughSeq: number; records: number }[] = []
  const controller: SessionControllerLike = {
    list: () => Promise.resolve({
      items: [{
        sessionId: SESSION_ID,
        updatedAt: 1_700_000_000_000,
        running: false,
        blank: false,
        cwd: 'C:\\work',
        projections: { asOfSeq: events.length - 1, values: { title: 'long session' } },
      }],
    }),
    follow: (_request, signal) => (async function* () {
      yield {
        type: 'snapshot',
        header: { id: SESSION_ID, createdAt: 1_700_000_000_000, cwd: 'C:\\work' },
        cursor: events.at(-1)?.seq ?? -1,
        records: events.map(event => ({ type: 'event', event })),
        hasMore: true,
        projections: { values: {} },
      } satisfies FollowFrame
      // Stay open like a real follow, so the service keeps its handle — and with
      // it the cursor a page read is cut against.
      await new Promise<void>(resolve => {
        signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
    })(),
    page: (request) => {
      const before = request.beforeSeq ?? request.throughSeq + 1
      const below = events.filter(event => event.seq < before)
      const take = below.slice(-3)
      pages.push({ beforeSeq: before, throughSeq: request.throughSeq, records: take.length })
      return Promise.resolve({
        records: take.map(event => ({ type: 'event', event })),
        hasMore: below.length > take.length,
      })
    },
    prompt: () => Promise.resolve({ accepted: true as const }),
  }
  return { controller, pages }
}

/** A Host context exposing only the controller, which is all the engine asks for. */
function fakeContext(controller: SessionControllerLike): HostContext {
  return {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    effect: () => {},
    get: (name: string) => (name === 'sessionController' ? controller : undefined),
    inject: () => {},
  }
}

/** Write the plugin's own config document into a throwaway home. */
async function clientHome(serverUrl: string): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'sync-frames-'))
  homes.push(home)
  await writeFile(join(home, 'dsh-session-sync.json'), JSON.stringify({
    machineName: MACHINE,
    serverUrl,
    isServer: false,
    password: PASSWORD,
    listenHost: '127.0.0.1',
    listenPort: CLIENT_PORT,
    syncSessions: { [SESSION_ID]: true },
  }), 'utf8')
  return home
}

/** Poll until `check` answers, or throw naming what was waited for. */
async function until<T>(check: () => T | undefined, label: string, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = check()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await new Promise<void>(resolve => { setTimeout(resolve, 100) })
  }
}

describe('a long Session\u2019s opening snapshot', () => {
  it('lands in the mirror whole, and unlocks the page read that needs its cursor', async () => {
    const events = Array.from({ length: SNAPSHOT_EVENTS }, (_, index) => snapshotEvent(index))
    const { controller, pages } = fakeController(events)
    const quiet = { info: () => {}, warn: () => {}, error: () => {} }

    // The server half: a real listener and a real mirror.
    const hub = new SyncHub(() => {}, () => ({}) as never, quiet)
    const server: SyncServerHandle = await startSyncServer({
      host: '127.0.0.1',
      port: SERVER_PORT,
      password: () => PASSWORD,
      serverName: () => 'mat-server',
      hub,
      logger: quiet,
    })
    disposers.push(async () => { await server.close() })

    // The origin half: the real client-role engine over a fake controller.
    const service = await SessionSyncService.create(
      fakeContext(controller),
      await clientHome(`127.0.0.1:${String(SERVER_PORT)}`),
    )
    service.start()
    disposers.push(async () => { await service.dispose() })

    const mirrored = await until(() => {
      const session = hub.machines()
        .find(item => item.machineName === MACHINE)
        ?.sessions.find(item => item.sessionId === SESSION_ID)
      if (session === undefined) return undefined
      return session.eventCount === SNAPSHOT_EVENTS && session.missingEvents === 0 ? session : undefined
    }, `all ${String(SNAPSHOT_EVENTS)} events in the mirror`)

    assert.equal(mirrored.eventCount, SNAPSHOT_EVENTS)
    assert.equal(mirrored.missingEvents, 0)

    // The whole point: the opening completed, so the follow holds the cut a page
    // read is measured against.
    const follow = await until(() => {
      const handle = service.view().follows?.find(item => item.sessionId === SESSION_ID)
      return handle?.opened === true ? handle : undefined
    }, 'the opening snapshot to set a cursor')
    assert.equal(follow.cursor, SNAPSHOT_EVENTS - 1)

    // A reader asking for what is below the mirror's edge now reaches the
    // origin's page API, cut against that cursor instead of refused for want of
    // one. Reading the window is what a scrolling reader does, and it is the
    // shipped route from "the mirror is short" to "ask the origin".
    const reached = hub.transcript(MACHINE, SESSION_ID, { limit: 1, before: 1 })
    assert.notEqual(reached, undefined)
    await until(() => (pages.length > 0 ? pages[0] : undefined), 'the origin to read a page')
    assert.equal(pages[0]?.throughSeq, SNAPSHOT_EVENTS - 1)
    assert.ok((pages[0]?.records ?? 0) > 0, 'the page must carry the events below the edge')
  })

  it('refuses a page read only when the opening really never happened', async () => {
    // A follow that yields nothing keeps the cursor unset, and the state has to
    // say so by name — this is the reading the frozen deployment was missing.
    const silent: SessionControllerLike = {
      list: () => Promise.resolve({
        items: [{
          sessionId: SESSION_ID,
          updatedAt: 1,
          running: false,
          blank: false,
          cwd: 'C:\\work',
        }],
      }),
      follow: (_request, signal) => (async function* () {
        await new Promise<void>(resolve => {
          signal.addEventListener('abort', () => { resolve() }, { once: true })
        })
      })(),
      page: () => Promise.resolve({ records: [], hasMore: false }),
      prompt: () => Promise.resolve({ accepted: true as const }),
    }
    const service = await SessionSyncService.create(fakeContext(silent), await clientHome(''))
    service.start()
    disposers.push(async () => { await service.dispose() })

    const handle = await until(() => service.view().follows?.[0], 'the follow to be listed')
    assert.equal(handle.opened, false)
    assert.equal(handle.cursor, -1)
  })
})
