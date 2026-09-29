/**
 * What counts as proof that a log's beginning was reached.
 *
 * The machine that owns a Session tells the mirror whether history exists below
 * the window it published (`hasOlder`), and the mirror's reader only ever sees
 * another page because of that claim. The claim is turned off by reading back to
 * the Session's first event — and that off-switch has to be *earned*: a window
 * whose lowest event is still above seq 0 was cut before the beginning, so its
 * `hasMore: false` says only "this window ended", not "the log starts here".
 *
 * Recording the unearned version latched the claim off for the rest of the
 * episode: the origin denied history it was holding, the mirror's floor froze at
 * its retention cap, and nothing left running could clear it — while the
 * transcript still read as contiguous, so the loss was invisible from the
 * console. Measured on the deployed pair before this file existed: a 6,257-event
 * Session whose mirror held seq 2257..6256 and whose origin answered
 * `hasOlder: false`, so paging below the window returned nothing at all.
 *
 * Both halves are pinned here, because only the pair distinguishes a fix from a
 * regression: a read that stopped above seq 0 must not claim the beginning, and a
 * read that carried seq 0 must.
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

const SESSION = 'session-start-0000-0000-000000000000'
const MACHINE = 'start-origin'
const PASSWORD = 'start-pw'

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

/** One log, and the controller that serves it the way DSH does. */
interface Fixture {
  /** Events in the log. */
  count: number
  /** Events the opening window carries, counted from the newest. */
  window: number
  controller: SessionControllerLike
  calls: { beforeSeq: number }[]
}

/**
 * A controller shaped like the real one: the follow opens on the newest `window`
 * events and reports whether anything lies below them, and a page ends at
 * `min(throughSeq + 1, beforeSeq)` — the requested bound, but never past the cut
 * the follow was opened at. That cut is what lets a page stop above seq 0 while
 * still reporting `hasMore: false`.
 * @param count - events in the log.
 * @param window - events the opening window carries, counted from the newest.
 * @param cut - the sequence the follow's own cut sits at; `count - 1` by default.
 */
function fixture(count: number, window: number, cut = count - 1): Fixture {
  const all = Array.from({ length: count }, (_, index) => event(index))
  const calls: { beforeSeq: number }[] = []
  const controller: SessionControllerLike = {
    list: () => Promise.resolve({
      items: [{
        sessionId: SESSION,
        updatedAt: 1,
        running: false,
        blank: false,
        cwd: 'C:\\work',
        projections: { asOfSeq: count - 1, values: { title: 'start' } },
      }],
    }),
    follow: (_request, signal) => (async function* () {
      yield {
        type: 'snapshot',
        cursor: cut,
        records: all.slice(-window).map(item => ({ type: 'event', event: item })),
        hasMore: window < count,
        projections: { values: {} },
      } satisfies FollowFrame
      await new Promise<void>(resolve => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    })(),
    page: (request) => {
      const before = request.beforeSeq ?? Number.MAX_SAFE_INTEGER
      calls.push({ beforeSeq: before })
      const end = Math.max(0, Math.min(request.throughSeq + 1, before, count))
      const take = all.slice(Math.max(0, end - 50), end)
      return Promise.resolve({
        records: take.map(item => ({ type: 'event', event: item })),
        hasMore: end - 50 > 0,
      })
    },
    prompt: () => Promise.resolve({ accepted: true as const }),
  }
  return { count, window, controller, calls }
}

const context = (value: SessionControllerLike): HostContext => ({
  logger: quiet,
  effect: () => {},
  get: (name) => (name === 'sessionController' ? value : undefined),
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

/** One live pair: a real sync server, a real engine, and the given fixture. */
async function pair(port: number, built: Fixture): Promise<{
  hub: SyncHub
  service: SessionSyncService
  settled: () => { hasOlder?: boolean; events: number }
}> {
  const home = await mkdtemp(join(tmpdir(), 'pg-start-'))
  homes.push(home)
  await writeFile(join(home, 'dsh-session-sync.json'), JSON.stringify({
    machineName: MACHINE,
    serverUrl: `127.0.0.1:${String(port)}`,
    isServer: false,
    password: PASSWORD,
    listenHost: '127.0.0.1',
    listenPort: port + 1,
    syncSessions: { [SESSION]: true },
  }), 'utf8')

  const hub = new SyncHub(() => {}, () => ({}) as never, quiet)
  const server: SyncServerHandle = await startSyncServer({
    host: '127.0.0.1', port, password: () => PASSWORD, serverName: () => 'start-server', hub, logger: quiet,
  })
  disposers.push(async () => { await server.close() })

  const service = await SessionSyncService.create(context(built.controller), home)
  service.start()
  disposers.push(async () => { await service.dispose() })

  await until(
    () => (hub.transcript(MACHINE, SESSION, { limit: 100_000 })?.events.length === Math.min(built.count, built.window)
      ? true
      : undefined),
    'the opening window to reach the mirror',
  )

  return {
    hub,
    service,
    settled: () => {
      const follow = service.view().follows?.find(item => item.sessionId === SESSION)
      return { hasOlder: follow?.hasOlder, events: follow?.events ?? -1 }
    },
  }
}

describe('what proves a log began', () => {
  it('does not claim the beginning from a window cut above seq 0', async () => {
    // The opening window is the newest 30 of 1,200 events: `hasMore: true`, and the
    // log's first event is far below it. Nothing about that window says where the
    // log starts, so nothing may be claimed on the strength of it — and the claim
    // has to stay on, because the history below it is real.
    //
    // The page read cannot be pinned the same way: a page cut at the bound it was
    // asked for carries seq 0 whenever it reports "nothing older", so against a
    // conforming controller the guard below can never fire. That is why it is a
    // guard: the latch this file was written for came from the deployed pair
    // answering `hasOlder: false` for a Session holding 6,257 events, and the
    // `started`/`pageAttempt` readings this fix adds are what will name its source.
    const built = fixture(1_200, 30)
    const { service, settled } = await pair(18_790, built)

    assert.equal(settled().hasOlder, true, 'a tail window claims history below it')
    assert.equal(service.view().started, undefined, 'a tail window proves nothing about the beginning')
    assert.equal(service.view().page, undefined, 'and no read happened to be misread as one')
  })

  it('claims the beginning from a window that carries seq 0', async () => {
    // The opening window is the whole log, so the read itself establishes that
    // there is nothing below it.
    const built = fixture(120, 120)
    const { service, settled } = await pair(18_792, built)

    const started = await until(() => service.view().started, 'the machine to prove the beginning it read')
    assert.equal(started.length, 1, 'the proof is published, not just believed')
    assert.equal(started[0]?.sessionId, SESSION)
    assert.equal(started[0]?.source, 'opening', 'the opening window is what proved it')
    assert.equal(settled().hasOlder, false, 'and the machine stops claiming history below its window')
    assert.equal(service.view().page, undefined, 'no page read was needed to prove it')
  })
})
