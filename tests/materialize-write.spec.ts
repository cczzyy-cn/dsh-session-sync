/**
 * What the writer refuses, and the one shape it must not report success over.
 *
 * Events are validated one at a time against the next sequence the log needs, so
 * a hole in the middle does not produce a hole: it produces a log that stops
 * there, with everything after it counted as "skipped" for being out of order.
 * Measured live on a real mirror, that outcome arrived as
 * `ok: true, written: 767, skipped: 9323, archived: true` — a read-only log of
 * seq 0..766 standing in for an 11,835-event conversation, and nothing in the
 * result said so. These tests pin the refusal.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  materializeSession,
  type MaterializeInput,
  type SessionPersistenceLike,
  type WorkspaceRegistryLike,
} from '../src/host/materialize.ts'

/** Events for the given sequences, shaped the way a mirrored envelope is. */
function events(seqs: readonly number[]): MaterializeInput['events'] {
  return seqs.map(seq => ({ type: 'assistant/message', seq, time: 1_700_000_000_000 + seq, data: { seq } }))
}

/** Storage that records what it was asked to write, and with which header. */
function storage(): {
  persistence: SessionPersistenceLike
  written: unknown[][]
  headers: Record<string, unknown>[]
} {
  const written: unknown[][] = []
  const headers: Record<string, unknown>[] = []
  return {
    written,
    headers,
    persistence: {
      create: (header: Record<string, unknown>) => {
        headers.push(header)
        return Promise.resolve({
          append: (batch: readonly unknown[]) => { written.push([...batch]); return Promise.resolve() },
          flush: () => Promise.resolve(),
          close: () => Promise.resolve(),
        })
      },
    },
  }
}

/** A registry that archives whatever it is handed. */
const archiving: WorkspaceRegistryLike = { archiveSession: () => Promise.resolve() }

/** The complete range 0..count-1. */
function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index)
}

describe('materializing a mirrored log', () => {
  it('writes a contiguous run and archives it', async () => {
    const { persistence, written } = storage()
    const result = await materializeSession(persistence, archiving, {
      sessionId: 'session-ok',
      createdAt: 1,
      cwd: 'C:\\work',
      events: events(range(500)),
    })
    assert.deepEqual(result, { ok: true, written: 500, skipped: 0, archived: true })
    assert.equal(written[0]?.length, 500)
  })

  it('refuses when a hole ends the run, rather than archiving what came before it', async () => {
    const { persistence, written } = storage()
    const seqs = range(1_000)
    seqs.splice(767, 1)
    const result = await materializeSession(persistence, archiving, {
      sessionId: 'session-holed',
      createdAt: 1,
      events: events(seqs),
    })
    assert.equal(result.ok, false)
    assert.equal(result.written, 0)
    assert.equal(result.archived, false)
    assert.equal(written.length, 0, 'nothing may reach storage')
    assert.match(result.reason ?? '', /stops at seq 766/u)
  })

  it('refuses a window that does not begin at the Session\u2019s beginning', async () => {
    const { persistence } = storage()
    const result = await materializeSession(persistence, archiving, {
      sessionId: 'session-tail',
      createdAt: 1,
      events: events([5_000, 5_001, 5_002]),
    })
    assert.equal(result.ok, false)
    assert.match(result.reason ?? '', /backfill is required/u)
  })

  it('writes a run that begins at seq 1, since a seeded log may start there', async () => {
    const { persistence } = storage()
    const result = await materializeSession(persistence, archiving, {
      sessionId: 'session-seeded',
      createdAt: 1,
      events: events([1, 2, 3]),
    })
    assert.equal(result.ok, true)
    assert.equal(result.written, 3)
  })

  it('carries the origin\u2019s own header fields rather than rebuilding without them', async () => {
    const { persistence, headers } = storage()
    await materializeSession(persistence, archiving, {
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
    await materializeSession(persistence, archiving, {
      sessionId: 'session-plain',
      createdAt: 1,
      events: events(range(3)),
    })
    assert.equal(Object.hasOwn(headers[0] ?? {}, 'agentPreset'), false)
  })
})
