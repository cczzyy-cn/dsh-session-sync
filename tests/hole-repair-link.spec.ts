/**
 * A hole repaired through the real link, with the resync race forced.
 *
 * The DSH-based test could only observe the failure this file exists for: the
 * origin reads the correct page, buffers it, and the mirror stays short because a
 * `resync` tears the follow down while the page is being buffered. Here the origin
 * is synthetic, so the hole and the race are both on purpose and the outcome is
 * asserted.
 *
 * Everything in the path is the plugin's own code: a real sync-server listener, a
 * real mirror, and a real `OriginLink` whose `onOlder` reads its own log and posts
 * the page back exactly as `pullOlder` does.
 */
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SyncHub } from '../src/host/hub.ts'
import { OriginLink, startSyncServer, type SyncServerHandle } from '../src/host/transport.ts'
import type { MirrorEvent } from '../src/shared/protocol.ts'

const MACHINE = 'synthetic-origin'
const SESSION = 'session-synthetic-0000-000000000000'
const PASSWORD = 'synth-pw'
const PORT = 18_801
const EVENTS = 400
/** The sequence this origin's first window will not carry. */
const MISSING = 150

const quiet = { info: () => {}, warn: () => {}, error: () => {} }

/** A Session log: every sequence from 0, in order. */
function log(): MirrorEvent[] {
  return Array.from({ length: EVENTS }, (_, seq) => ({
    type: 'assistant/message',
    seq,
    time: 1_700_000_000_000 + seq,
    data: { seq },
  }))
}

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

/** Wait for the link to come up, so the first publish is not dropped. */
async function linked(link: OriginLink): Promise<void> {
  await until(() => (link.linked ? true : undefined), 'the origin link to come up')
}

/** Record one observation, for a failing run to explain itself. */
const observations: string[] = []
function save(value: unknown): void {
  const line = `${String(Date.now() % 100_000)} ${JSON.stringify(value)}`
  if (observations.at(-1)?.slice(6) === JSON.stringify(value)) return
  observations.push(line)
  writeFileSync(join(tmpdir(), 'hole-link-trace.txt'), observations.join('\n'), 'utf8')
}

/** What one mirror holds for the synthetic Session. */
function windowOf(hub: SyncHub): { low: number; high: number; count: number; holes: number[]; missing: number } | undefined {
  const session = hub.machines()
    .find(machine => machine.machineName === MACHINE)
    ?.sessions.find(item => item.sessionId === SESSION)
  if (session === undefined) return undefined
  const report = hub.transcript(MACHINE, SESSION, { limit: 100_000 })
  const seqs = (report?.events ?? []).map(event => event.seq).sort((left, right) => left - right)
  if (seqs.length === 0) return { low: -1, high: -1, count: 0, holes: [], missing: session.missingEvents }
  const held = new Set(seqs)
  const holes: number[] = []
  for (let seq = seqs[0] ?? 0; seq <= (seqs.at(-1) ?? 0); seq += 1) if (!held.has(seq)) holes.push(seq)
  return { low: seqs[0] ?? -1, high: seqs.at(-1) ?? -1, count: seqs.length, holes, missing: session.missingEvents }
}

/** One synthetic origin wired to the server, serving page asks from its own log. */
function makeOrigin(all: readonly MirrorEvent[], asks: { beforeSeq: number }[]): OriginLink {
  const link = new OriginLink({
    // The scheme matters: `OriginLink` takes a URL, and production passes one that
    // `serverOrigin()` has already normalized. Without it every post is dropped and
    // the link never comes up — which reads, from the mirror's side, exactly like a
    // page that was read and lost.
    serverUrl: `http://127.0.0.1:${String(PORT)}`,
    password: () => PASSWORD,
    machineName: () => MACHINE,
    logger: quiet,
    onCommand: () => {},
    onStatus: () => {},
    onResync: () => {},
    onOlder: (sessionId, throughSeq, maxMessages) => {
      if (sessionId !== SESSION) return
      asks.push({ beforeSeq: throughSeq + 1 })
      // The real `pullOlder`: read strictly below one past the inclusive bound,
      // never past what the origin's own page ceiling allows.
      const below = all.filter(event => event.seq < throughSeq + 1)
      const page = below.slice(-Math.max(1, maxMessages))
      console.log('DBG origin page', JSON.stringify({ beforeSeq: throughSeq + 1, size: page.length, hasMissing: page.some(e => e.seq === MISSING) }))
      link.publishFrames(SESSION, page)
    },
  })
  return link
}

describe('a hole repaired through the real link', () => {
  it('fills the hole and leaves the window contiguous', async () => {
    const all = log()
    const hub = new SyncHub(() => {}, () => ({}) as never, quiet, { olderAskFloorMs: 0, resyncRetryMs: 0 })
    const server: SyncServerHandle = await startSyncServer({
      host: '127.0.0.1',
      port: PORT,
      password: () => PASSWORD,
      serverName: () => 'synthetic-server',
      hub,
      logger: quiet,
    })

    const asks: { beforeSeq: number }[] = []
    const link = makeOrigin(all, asks)
    link.start()
    await linked(link)

    // The origin's index claims the whole log, and its first window is missing one
    // event — exactly what a dropped batch leaves behind.
    link.publishIndex({
      machineName: MACHINE,
      sessions: [{ sessionId: SESSION, title: 'synthetic', updatedAt: 1, running: false, lastSeq: EVENTS - 1 }],
    })
    // The window is published and the repair may already be under way by the time
    // this returns, so the short state is captured rather than waited for: asserting
    // "exactly one short" would race the repair this test is about.
    link.publishFrames(SESSION, all.filter(event => event.seq !== MISSING))

    const whole = await until(() => {
      const window = windowOf(hub)
      save(window)
      return window !== undefined && window.missing === 0 ? window : undefined
    }, 'the mirror to be whole')
    assert.deepEqual(whole.holes, [])
    assert.equal(whole.count, EVENTS)
    // The hole really was there: the origin was asked for the page that carries it.
    assert.ok(asks.some(ask => ask.beforeSeq === MISSING + 1), `asks: ${JSON.stringify(asks)}`)

    link.stop()
    await server.close()
  })

  it('survives a resync that lands while the page is in flight', async () => {
    const all = log()
    // The retry floor is zero, so the sweep replays the Session as fast as it can —
    // which is the condition the DSH-based test kept hitting by accident.
    const hub = new SyncHub(() => {}, () => ({}) as never, quiet, { olderAskFloorMs: 0, resyncRetryMs: 0 })
    const server: SyncServerHandle = await startSyncServer({
      host: '127.0.0.1',
      port: PORT + 1,
      password: () => PASSWORD,
      serverName: () => 'synthetic-server',
      hub,
      logger: quiet,
    })

    const asks: { beforeSeq: number }[] = []
    const link = new OriginLink({
      serverUrl: `http://127.0.0.1:${String(PORT + 1)}`,
      password: () => PASSWORD,
      machineName: () => MACHINE,
      logger: quiet,
      onCommand: () => {},
      onStatus: () => {},
      // A resync makes the real service re-open the follow, which replays the same
      // window — and that replay is what races the page read. Reproduce it by
      // publishing the window again, synchronously, before the page goes out.
      onResync: () => { link.publishFrames(SESSION, all.filter(event => event.seq !== MISSING)) },
      onOlder: (sessionId, throughSeq, maxMessages) => {
        if (sessionId !== SESSION) return
        asks.push({ beforeSeq: throughSeq + 1 })
        const below = all.filter(event => event.seq < throughSeq + 1)
        link.publishFrames(SESSION, below.slice(-Math.max(1, maxMessages)))
      },
    })
    link.start()
    await linked(link)

    link.publishIndex({
      machineName: MACHINE,
      sessions: [{ sessionId: SESSION, title: 'synthetic', updatedAt: 1, running: false, lastSeq: EVENTS - 1 }],
    })
    link.publishFrames(SESSION, all.filter(event => event.seq !== MISSING))

    // Sweep repeatedly while every resync replays the window underneath the page
    // read: the repair has to survive the replay it is racing.
    for (let round = 0; round < 8; round += 1) {
      hub.sweepGaps()
      await delay(500)
      save(windowOf(hub))
      if (windowOf(hub)?.missing === 0) break
    }

    const whole = await until(() => {
      const window = windowOf(hub)
      return window !== undefined && window.missing === 0 ? window : undefined
    }, 'the hole to be filled while resyncs keep landing')
    assert.deepEqual(whole.holes, [])
    assert.equal(whole.count, EVENTS)

    link.stop()
    await server.close()
  })
})
