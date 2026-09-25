/**
 * What the writer refuses, and the one shape it must not report success over.
 *
 * Events are validated one at a time against the next sequence the log needs, so
 * a hole in the middle does not produce a hole: it produces a log that stops
 * there, with everything after it counted as "skipped" for being out of order.
 * Measured live on a real mirror, that outcome arrived as
 * `ok: true, written: 767, skipped: 9323` — a log of seq 0..766 standing in for
 * an 11,835-event conversation, and nothing in the result said so. These tests
 * pin the refusal.
 *
 * The Session is written, not archived. Archiving was the first design's way of
 * making the copy read-only, and it turned out to make the copy unreadable too:
 * DSH refuses to open an archived row and hides it behind the default archived
 * filter (`ui-workspace/rows/WorkspaceBrowser.tsx:851-859`). Read-only is the
 * plugin's own `agent/pre-step` gate over `MirrorLedger` instead, so the writer's
 * result no longer carries an `archived` flag at all — this file asserts the
 * shape it does carry.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  catchUpSession,
  materializeSession,
  type MaterializeInput,
  type SessionWriteHandleLike,
  type SessionPersistenceLike,
} from '../src/host/materialize.ts'

/** Events for the given sequences, shaped the way a mirrored envelope is. */
function events(seqs: readonly number[]): MaterializeInput['events'] {
  return seqs.map(seq => ({ type: 'assistant/message', seq, time: 1_700_000_000_000 + seq, data: { seq } }))
}

/** The complete range 0..count-1. */
function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index)
}

/** Storage that records what it was asked to write, and with which header. */
function storage(stored?: number): {
  persistence: SessionPersistenceLike
  written: unknown[][]
  headers: Record<string, unknown>[]
  opened: string[]
} {
  const written: unknown[][] = []
  const headers: Record<string, unknown>[] = []
  const opened: string[] = []
  const handle = (): SessionWriteHandleLike => ({
    append: (batch: readonly unknown[]) => { written.push([...batch]); return Promise.resolve() },
    flush: () => Promise.resolve(),
    close: () => Promise.resolve(),
  })
  return {
    written,
    headers,
    opened,
    persistence: {
      create: (header: Record<string, unknown>) => {
        headers.push(header)
        return Promise.resolve(handle())
      },
      open: (id: string) => {
        opened.push(id)
        return Promise.resolve(handle())
      },
      stat: () => Promise.resolve(stored === undefined ? undefined : { eventCount: stored }),
    },
  }
}

describe('materializing a mirrored log', () => {
  it('writes a contiguous run and reports what it stores', async () => {
    const { persistence, written } = storage()
    const result = await materializeSession(persistence, {
      sessionId: 'session-ok',
      createdAt: 1,
      cwd: 'C:\\work',
      events: events(range(500)),
    })
    assert.deepEqual(result, { ok: true, written: 500, skipped: 0, stored: 500, created: true })
    assert.equal(written[0]?.length, 500)
  })

  it('refuses when a hole ends the run, rather than writing what came before it', async () => {
    const { persistence, written } = storage()
    const seqs = range(1_000)
    seqs.splice(767, 1)
    const result = await materializeSession(persistence, {
      sessionId: 'session-holed',
      createdAt: 1,
      events: events(seqs),
    })
    assert.equal(result.ok, false)
    assert.equal(result.written, 0)
    assert.equal(written.length, 0, 'nothing may reach storage')
    assert.match(result.reason ?? '', /stops at seq 766/u)
  })

  it('refuses a window that does not begin at the Session\u2019s beginning', async () => {
    const { persistence } = storage()
    const result = await materializeSession(persistence, {
      sessionId: 'session-tail',
      createdAt: 1,
      events: events([5_000, 5_001, 5_002]),
    })
    assert.equal(result.ok, false)
    assert.match(result.reason ?? '', /backfill is required/u)
  })

  it('refuses a window that begins at seq 1, because the log it writes is not seeded', async () => {
    // The writer always states `isSeeded: false`, so the log's first event has to
    // be seq 0. Accepting seq 1 here would hand the storage layer a log whose
    // beginning is missing — the shape it refuses to read at all.
    const { persistence, written } = storage()
    const result = await materializeSession(persistence, {
      sessionId: 'session-seeded',
      createdAt: 1,
      events: events([1, 2, 3]),
    })
    assert.equal(result.ok, false)
    assert.equal(written.length, 0)
    assert.match(result.reason ?? '', /backfill is required/u)
  })

  it('carries the origin\u2019s own header fields rather than rebuilding without them', async () => {
    const { persistence, headers } = storage()
    await materializeSession(persistence, {
      sessionId: 'session-preset',
      createdAt: 1_790_261_151_160,
      cwd: '/C:/work',
      agentPreset: 'standard',
      events: events(range(3)),
    })
    const header = headers[0] ?? {}
    // The Session's own start, not its first event's time.
    assert.equal(header['createdAt'], 1_790_261_151_160)
    assert.equal(header['agentPreset'], 'standard')
    assert.equal(header['isSeeded'], false)
    assert.equal(header['version'], 4)
  })

  it('leaves a preset out when the origin named none', async () => {
    const { persistence, headers } = storage()
    await materializeSession(persistence, {
      sessionId: 'session-plain',
      createdAt: 1,
      events: events(range(3)),
    })
    assert.equal(Object.hasOwn(headers[0] ?? {}, 'agentPreset'), false)
  })
})

describe('continuing an existing mirror log', () => {
  it('appends only what the log is missing', async () => {
    const { persistence, written, opened } = storage(4)
    const result = await catchUpSession(persistence, 'session-grow', events(range(9)))
    assert.deepEqual(opened, ['session-grow'])
    assert.equal(result.ok, true)
    assert.equal(result.written, 5, 'seqs 4..8')
    assert.equal(result.stored, 9)
    assert.deepEqual((written[0] as { seq: number }[]).map(event => event.seq), [4, 5, 6, 7, 8])
  })

  it('does nothing when the log is already level with the mirror', async () => {
    const { persistence, written } = storage(9)
    const result = await catchUpSession(persistence, 'session-level', events(range(9)))
    assert.equal(result.ok, true)
    assert.equal(result.written, 0)
    assert.equal(written.length, 0, 'no handle is taken when there is nothing to append')
  })

  it('refuses to invent the events between the log and the mirror', async () => {
    // The log holds 0..3 and the mirror's next event is seq 6: a hole below the
    // log's end can never be repaired by appending, so the pass must record why it
    // stopped rather than write an event at the wrong sequence.
    const { persistence, written } = storage(4)
    const result = await catchUpSession(persistence, 'session-gap', events([0, 1, 2, 3, 6, 7]))
    assert.equal(result.ok, false)
    assert.equal(written.length, 0)
    assert.equal(result.stored, 4)
  })

  it('says so when nothing is on disk to continue', async () => {
    const { persistence } = storage()
    const result = await catchUpSession(persistence, 'session-absent', events(range(3)))
    assert.equal(result.ok, false)
    assert.match(result.reason ?? '', /created first/u)
  })
})
