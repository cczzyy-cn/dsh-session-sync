/**
 * The official Assistant stream, as this plugin relays and folds it.
 *
 * The relay used to carry two whole-text strings and drop every other chunk,
 * which is why live Tool calls, block boundaries and usage never reached either
 * pane. These cases pin the replacement contract: the opening's compact runs
 * expand into dense frames, a fold consumes only the dense next frame and says so
 * when a chunk is missing, and a re-stated baseline keeps the cursor it was taken
 * at so frames after it still land.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import {
  LiveAttemptFold,
  LiveBatch,
  expandLiveBaseline,
  wireChunk,
} from '../src/shared/live-stream.ts'
import { SyncHub } from '../src/host/hub.ts'
import { OriginLink, startSyncServer } from '../src/host/transport.ts'
import type { SyncState, SyncStreamFrame } from '../src/shared/protocol.ts'

/** Wait until `check` answers, or fail naming what was waited for. */
async function until<T>(check: () => T | undefined, label: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = check()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await delay(25)
  }
}

describe('the opening baseline', () => {
  it('expands packed text, reasoning, Tool-call and raw records into dense frames', () => {
    const baseline = expandLiveBaseline({
      attemptId: 'attempt-1',
      turn: 2,
      step: 3,
      nextIndex: 6,
      stream: [
        { type: 'reasoning-chunks', time0: 1_000, index: 0, dt: [10], texts: ['think', 'ing'] },
        { type: 'text-chunks', time0: 2_000, index: 1, dt: [], texts: ['answer'] },
        { type: 'tool-call-chunks', time0: 3_000, index: 2, dt: [], id: 'call-1', name: 'read', args: ['{"path":'] },
        { type: 'chunk', time: 4_000, chunk: { type: 'block-end', index: 2, block: { type: 'tool-call', id: 'call-1', name: 'read', arguments: '{"path":"a"}' } } },
        { type: 'chunk', time: 5_000, chunk: { type: 'usage', usage: { input: 10, output: 2 } } },
      ],
    })
    if (baseline === undefined) throw new Error('the baseline must expand')
    assert.equal(baseline.nextIndex, 6)
    assert.deepEqual(baseline.chunks.map(frame => frame.index), [0, 1, 2, 3, 4, 5])
    assert.deepEqual(baseline.chunks.map(frame => frame.chunk['type']), [
      'reasoning-delta', 'reasoning-delta', 'text-delta', 'tool-call-delta', 'block-end', 'usage',
    ])
    // The packed run's own dt is what places its members in time.
    assert.deepEqual(baseline.chunks.slice(0, 2).map(frame => frame.time), [1_000, 1_010])
  })

  it('refuses a baseline it cannot represent whole', () => {
    // `nextIndex` promises six frames; two records can only produce two. A
    // partial baseline is a row with a hole in the middle, not a shorter row.
    assert.equal(expandLiveBaseline({
      attemptId: 'attempt-1',
      turn: 0,
      step: 0,
      nextIndex: 6,
      stream: [{ type: 'text-chunks', time0: 0, index: 0, dt: [], texts: ['a', 'b'] }],
    }), undefined)
  })
})

describe('the live fold', () => {
  it('keeps reasoning and the answer in separate blocks, in authored order', () => {
    const fold = new LiveAttemptFold({ attemptId: 'attempt-1', turn: 1, step: 2 })
    // The official stream gives a new block index to a new block; both stay.
    fold.apply({ index: 0, time: 0, chunk: { type: 'reasoning-delta', index: 0, text: 'think ' } })
    fold.apply({ index: 1, time: 0, chunk: { type: 'reasoning-delta', index: 0, text: 'more' } })
    fold.apply({ index: 2, time: 0, chunk: { type: 'text-delta', index: 1, text: 'answer' } })
    const view = fold.view()
    assert.deepEqual(view.blocks.map(block => block.kind), ['reasoning', 'text'])
    assert.equal(view.reasoning, 'think more')
    assert.equal(view.text, 'answer')
  })

  it('accumulates a Tool call while its arguments stream', () => {
    const fold = new LiveAttemptFold({ attemptId: 'attempt-1', turn: 0, step: 0 })
    fold.apply({ index: 0, time: 0, chunk: { type: 'tool-call-delta', index: 0, id: 'call-1', name: 'read', argumentsDelta: '{"path":' } })
    fold.apply({ index: 1, time: 0, chunk: { type: 'tool-call-delta', index: 0, id: 'call-1', argumentsDelta: '"a.txt"}' } })
    assert.deepEqual(fold.view().tools, [{ index: 0, id: 'call-1', name: 'read', arguments: '{"path":"a.txt"}' }])
  })

  it('replaces streamed content when the block ends', () => {
    const fold = new LiveAttemptFold({ attemptId: 'attempt-1', turn: 0, step: 0 })
    fold.apply({ index: 0, time: 0, chunk: { type: 'text-delta', index: 0, text: 'partial' } })
    fold.apply({ index: 1, time: 0, chunk: { type: 'block-end', index: 0, block: { type: 'text', text: 'final' } } })
    assert.equal(fold.view().text, 'final')
  })

  it('refuses a frame that is not the dense next one', () => {
    const fold = new LiveAttemptFold({ attemptId: 'attempt-1', turn: 0, step: 0 })
    assert.equal(fold.apply({ index: 1, time: 0, chunk: { type: 'text-delta', index: 0, text: 'late' } }), false)
    assert.equal(fold.view().text, '')
  })

  it('re-states itself with its cursor, so the next real frame still lands', () => {
    const fold = new LiveAttemptFold({ attemptId: 'attempt-1', turn: 4, step: 5 })
    for (const text of ['Hel', 'lo']) {
      fold.apply({ index: fold.nextIndex, time: 0, chunk: { type: 'text-delta', index: 0, text } })
    }
    const baseline = fold.baseline()
    assert.equal(baseline.nextIndex, 2)
    assert.equal(baseline.chunks.length, 1)
    assert.equal(baseline.chunks[0]?.chunk['text'], 'Hello')

    // A reader that arrives late seeds from the baseline and then applies the
    // attempt's real frame — at the cursor, not at the baseline's frame count.
    const late = new LiveAttemptFold({ attemptId: baseline.attemptId, turn: 4, step: 5 })
    late.seed(baseline)
    assert.equal(late.nextIndex, 2)
    assert.equal(late.apply({ index: 2, time: 0, chunk: { type: 'text-delta', index: 0, text: '!' } }), true)
    assert.equal(late.view().text, 'Hello!')
  })
})

describe('one relay batch', () => {
  it('merges adjacent deltas of one block and numbers the frames densely', () => {
    const batch = new LiveBatch(5)
    batch.push(1, { type: 'text-delta', index: 0, text: 'Hel' })
    batch.push(2, { type: 'text-delta', index: 0, text: 'lo' })
    batch.push(3, { type: 'tool-call-delta', index: 1, id: 'call-1', name: 'read', argumentsDelta: '{"p' })
    batch.push(4, { type: 'tool-call-delta', index: 1, id: 'call-1', name: 'read', argumentsDelta: '":"a"}' })

    const frames = batch.drain()
    assert.deepEqual(frames.map(frame => frame.index), [5, 6])
    assert.deepEqual(frames[0]?.chunk, { type: 'text-delta', index: 0, text: 'Hello' })
    assert.deepEqual(frames[1]?.chunk, {
      type: 'tool-call-delta',
      index: 1,
      id: 'call-1',
      name: 'read',
      argumentsDelta: '{"p":"a"}',
    })
    // The next batch continues from the cursor the first one left.
    assert.equal(batch.nextIndex, 7)
    batch.push(5, { type: 'text-delta', index: 0, text: '!' })
    assert.equal(batch.drain()[0]?.index, 7)
  })

  it('keeps chunks that are not same-block deltas apart', () => {
    const batch = new LiveBatch()
    batch.push(1, { type: 'text-delta', index: 0, text: 'a' })
    batch.push(2, { type: 'reasoning-delta', index: 0, text: 'b' })
    batch.push(3, { type: 'usage', usage: { input: 1 } })
    assert.equal(batch.drain().length, 3)
  })

  it('drops what a broken attempt buffered', () => {
    const batch = new LiveBatch()
    batch.push(1, { type: 'text-delta', index: 0, text: 'gone' })
    batch.clear()
    assert.equal(batch.size, 0)
    assert.deepEqual(batch.drain(), [])
  })
})

describe('one relayed chunk', () => {
  it('drops the adapter replay envelope from a finish chunk', () => {
    const chunk = wireChunk({
      type: 'finish',
      reason: 'stop',
      replayState: { response: { huge: 'x'.repeat(1000) } },
    })
    assert.deepEqual(chunk, { type: 'finish', reason: 'stop' })
  })

  it('keeps the chunks a renderer folds, and refuses anything else', () => {
    assert.deepEqual(wireChunk({ type: 'text-delta', index: 0, text: 'a' }), { type: 'text-delta', index: 0, text: 'a' })
    assert.equal(wireChunk({ type: 'mystery' }), undefined)
    assert.equal(wireChunk('text-delta'), undefined)
  })
})

/** The complete state a hub's notifier can be built with in these tests. */
const idle: SyncState = {
  role: 'server',
  machineName: 'server',
  serverUrl: '',
  pluginVersion: 'test',
  listening: true,
  linked: true,
  machines: [],
  published: 0,
}

describe('the live path through the real link', () => {
  it('posts a run in order and re-states it for a late reader', async () => {
    const machine = 'synthetic-live-origin'
    const sessionId = 'session-synthetic-live-000000000000'
    const password = 'synth-live-pw'
    const port = 18_802
    const quiet = { info: () => {}, warn: () => {}, error: () => {} }
    const hub = new SyncHub(() => {}, () => idle, quiet)
    const server = await startSyncServer({
      host: '127.0.0.1',
      port,
      password: () => password,
      serverName: () => 'synthetic-server',
      hub,
      logger: quiet,
    })
    const link = new OriginLink({
      serverUrl: `http://127.0.0.1:${String(port)}`,
      password: () => password,
      machineName: () => machine,
      logger: quiet,
      onCommand: () => {},
      onStatus: () => {},
      onResync: () => {},
      onOlder: () => {},
    })
    link.start()
    try {
      await until(() => link.linked || undefined, 'the origin link to come up')
      link.publishIndex({
        machineName: machine,
        sessions: [{ sessionId, title: 'live', updatedAt: 1, running: true }],
      })
      await until(() => hub.machines().some(item => item.machineName === machine) || undefined, 'the index to arrive')

      // Three posts in one tick. They must reach the mirror in this order: a batch
      // that overtook its predecessor would be a dense-index gap, and the fold
      // would drop the attempt.
      link.publishLive({ type: 'start', sessionId, attemptId: 'attempt-1', turn: 0, step: 0, startedAfterSeq: -1 })
      link.publishLive({
        type: 'chunks',
        sessionId,
        attemptId: 'attempt-1',
        chunks: [{ index: 0, time: 1, chunk: { type: 'text-delta', index: 0, text: 'Hel' } }],
      })
      link.publishLive({
        type: 'chunks',
        sessionId,
        attemptId: 'attempt-1',
        chunks: [{ index: 1, time: 2, chunk: { type: 'tool-call-delta', index: 1, id: 'call-1', name: 'read', argumentsDelta: '{"p' } }],
      })

      const baseline = await until(() => {
        const live = hub.liveOf(machine, sessionId)
        if (live?.type !== 'baseline') return undefined
        return live.nextIndex === 2 ? live : undefined
      }, 'the live attempt to reach the mirror')
      assert.equal(baseline.chunks.length, 2)
      assert.deepEqual(baseline.chunks[0]?.chunk, { type: 'text-delta', index: 0, text: 'Hel' })
      assert.deepEqual(baseline.chunks[1]?.chunk, {
        type: 'tool-call-delta',
        index: 1,
        id: 'call-1',
        name: 'read',
        argumentsDelta: '{"p',
      })

      // The durable settlement is the other half: it retires the live row even if
      // the origin's own `clear` never arrives.
      link.publishFrames(sessionId, [{
        type: 'assistant/message',
        seq: 0,
        time: 3,
        data: { turn: 0, step: 0 },
      }])
      await until(
        () => (hub.liveOf(machine, sessionId) === undefined ? true : undefined),
        'the settlement to retire the live row',
      )
    } finally {
      link.stop()
      await server.close()
    }
  })
})
describe('the server-side legacy translation', () => {
  it('turns a whole-text origin into the same start/chunk vocabulary', () => {
    const frames: SyncStreamFrame[] = []
    const hub = new SyncHub(frame => { frames.push(frame) }, () => idle)
    hub.publishIndex({ machineName: 'origin', sessions: [{ sessionId: 'session-1', title: 't', updatedAt: 1, running: true }] })

    hub.publishLegacyStream('origin', { sessionId: 'session-1', turn: 1, step: 2, kind: 'text', text: 'Hel' })
    hub.publishLegacyStream('origin', { sessionId: 'session-1', turn: 1, step: 2, kind: 'text', text: 'Hello' })

    const live = frames.flatMap(frame => frame.type === 'stream' ? [frame.live] : [])
    assert.deepEqual(live.map(event => event.type), ['start', 'chunks', 'chunks'])
    assert.deepEqual(live[1]?.type === 'chunks' ? live[1].chunks[0]?.chunk : undefined, {
      type: 'text-delta',
      index: 1,
      text: 'Hel',
    })
    // The second post carries only the extension, which is what a current origin
    // would have sent; the whole-text form must not duplicate "Hel".
    assert.deepEqual(live[2]?.type === 'chunks' ? live[2].chunks[0]?.chunk : undefined, {
      type: 'text-delta',
      index: 1,
      text: 'lo',
    })
  })
})
