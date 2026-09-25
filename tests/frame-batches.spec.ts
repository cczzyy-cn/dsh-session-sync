/**
 * The published frame batch must survive the wire it travels on.
 *
 * The failure this file exists for: one `follow` opening on a long Session is
 * megabytes of history, the sync server refuses a request body over its own
 * limit, and the origin retried the *same* oversized batch forever. The follow
 * therefore never finished, its cursor stayed unset, and every page read that
 * needed that cursor was refused — a mirror frozen at one window with no error
 * that named the size.
 *
 * Both halves are covered here: the splitter, and a real listener answering a
 * real oversized request.
 */
import { createServer, type Server } from 'node:http'
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  batchEvents,
  FRAMES_BODY_BYTES,
  MAX_BODY_BYTES,
  type MirrorEvent,
} from '../src/shared/protocol.ts'

/** One event whose serialized form is about `bytes` long, like a real log entry. */
function event(seq: number, bytes: number): MirrorEvent {
  const envelope = JSON.stringify({ seq, time: 1_700_000_000_000 + seq, data: {} })
  const filler = 'x'.repeat(Math.max(0, bytes - envelope.length))
  return { type: 'assistant/message', seq, time: 1_700_000_000_000, data: { text: filler } }
}

/** Bytes one event costs once it is serialized for the body. */
function sizeOf(value: MirrorEvent): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

/** Bytes a whole `/frames` body takes for one batch, envelope included. */
function bodyBytes(sessionId: string, batch: readonly MirrorEvent[]): number {
  return Buffer.byteLength(JSON.stringify({ sessionId, events: batch }), 'utf8')
}

/** The window one long Session's follow opening actually carried, measured live. */
const SNAPSHOT_EVENTS = 3_478
const EVENT_BYTES = 3_600

const servers: Server[] = []
after(() => {
  for (const server of servers) server.close()
})

describe('published frame batches', () => {
  it('keeps every batch under the body the server will read', () => {
    const events = Array.from({ length: SNAPSHOT_EVENTS }, (_, index) => event(index, EVENT_BYTES))
    const { batches, bytes } = batchEvents(events, FRAMES_BODY_BYTES, 1_000)

    assert.ok(batches.length > 1, 'a 12 MB snapshot must not travel as one batch')
    assert.ok(bytes <= FRAMES_BODY_BYTES, `largest batch was ${String(bytes)} bytes`)
    for (const batch of batches) {
      assert.ok(
        bodyBytes('session-x', batch) <= MAX_BODY_BYTES,
        'no batch may exceed what the server accepts',
      )
    }
    // Nothing is dropped and nothing is reordered.
    assert.deepEqual(batches.flat().map(item => item.seq), events.map(item => item.seq))
  })

  it('splits a 12 MB window into batches the server accepts', () => {
    const events = Array.from({ length: SNAPSHOT_EVENTS }, (_, index) => event(index, EVENT_BYTES))
    const total = bodyBytes('session-x', events)
    assert.ok(total > MAX_BODY_BYTES, `the whole window is ${String(total)} bytes`)

    const { batches } = batchEvents(events, FRAMES_BODY_BYTES, 1_000)
    for (const batch of batches) assert.ok(bodyBytes('session-x', batch) <= MAX_BODY_BYTES)
  })

  it('sends one oversized event alone rather than dropping it', () => {
    const huge = event(0, FRAMES_BODY_BYTES * 2)
    const rest = [event(1, 10), event(2, 10)]
    const { batches } = batchEvents([huge, ...rest], FRAMES_BODY_BYTES, 1_000)
    assert.equal(batches.length, 2)
    assert.deepEqual(batches[0], [huge])
    assert.deepEqual(batches[1], rest)
  })

  it('bounds a batch by count when the events are tiny', () => {
    const events = Array.from({ length: 2_500 }, (_, index) => event(index, 4))
    const { batches, size } = batchEvents(events, FRAMES_BODY_BYTES, 1_000)
    assert.equal(size, 1_000)
    assert.equal(batches.length, 3)
  })

  it('measures the bytes a batch will actually cost on the wire', () => {
    const events = [event(0, 100), event(1, 100)]
    const { bytes } = batchEvents(events, FRAMES_BODY_BYTES, 1_000)
    assert.equal(bytes, sizeOf(events[0]) + sizeOf(events[1]))
  })
})

describe('the sync server\u2019s body limit', () => {
  /**
   * A listener with the same body handling as `startSyncServer`, so the answer an
   * oversized publish gets is observable without a whole mirror behind it.
   */
  async function listen(): Promise<{ port: number; seen: number[] }> {
    const seen: number[] = []
    const server = createServer((request, response) => {
      const declared = Number(request.headers['content-length'] ?? Number.NaN)
      if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
        response.writeHead(413, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: `request body over ${String(MAX_BODY_BYTES)} bytes` }))
        return
      }
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { events: MirrorEvent[] }
        seen.push(body.events.length)
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{"ok":true}')
      })
    })
    servers.push(server)
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    return { port, seen }
  }

  it('refuses a body over the limit by name, and keeps the connection usable', async () => {
    const { port, seen } = await listen()
    const oversized = await fetch(`http://127.0.0.1:${String(port)}/frames`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-x',
        events: Array.from({ length: SNAPSHOT_EVENTS }, (_, index) => event(index, EVENT_BYTES)),
      }),
    })
    assert.equal(oversized.status, 413)
    const payload = await oversized.json() as { error: string }
    assert.match(payload.error, /over \d+ bytes/)

    // A refusal that took the listener down with it would be useless: the very
    // next batch has to get through on the same server.
    const accepted = await fetch(`http://127.0.0.1:${String(port)}/frames`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-x', events: [event(0, 100)] }),
    })
    assert.equal(accepted.status, 200)
    assert.deepEqual(seen, [1])
  })

  it('accepts every batch a split snapshot produces', async () => {
    const { port, seen } = await listen()
    const events = Array.from({ length: SNAPSHOT_EVENTS }, (_, index) => event(index, EVENT_BYTES))
    const { batches } = batchEvents(events, FRAMES_BODY_BYTES, 1_000)
    for (const batch of batches) {
      const response = await fetch(`http://127.0.0.1:${String(port)}/frames`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session-x', events: batch }),
      })
      assert.equal(response.status, 200)
    }
    assert.equal(seen.reduce((sum, count) => sum + count, 0), SNAPSHOT_EVENTS)
  })
})
