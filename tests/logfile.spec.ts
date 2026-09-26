/**
 * The log surgery that lets a copy survive the Host's own bookkeeping.
 *
 * This rewrites durable Session data, so every rule it relies on is pinned here:
 * only trailing markers are dropped, a real event ends the drop, frames are
 * preserved byte for byte except the one the cut falls in, and a refused drop
 * leaves the file exactly as it was.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { clearProjectionCache, dropTrailingMarkers, findLogFile, readLog, RESUME_MARKER } from '../src/host/logfile.ts'

/** One record, shaped like a log line. */
function record(seq: number, type = 'assistant/message'): string {
  return `${JSON.stringify({ seq, type, time: 1_700_000_000_000 + seq, data: { seq } })}\n`
}

/** One frame, as the Host writes them: a batch of records compressed together. */
function frame(...lines: string[]): Buffer {
  return zstdCompressSync(Buffer.from(lines.join(''), 'utf8'))
}

/** A scratch Harness home with one Session log built from the given frames. */
async function home(sessionId: string, ...frames: Buffer[]): Promise<{ home: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-logfile-'))
  const dir = join(root, 'sessions', '--C-work--', sessionId)
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'session.v4.jsonl.zstd')
  await writeFile(path, Buffer.concat(frames))
  return { home: root, path }
}

describe('finding one Session log', () => {
  it('finds it under the working directory slug the Host chose', async () => {
    const { home: root, path } = await home('session-a', frame(record(0)))
    assert.equal(await findLogFile(root, 'session-a'), path)
    await rm(root, { recursive: true, force: true })
  })

  it('says nothing when there is no such log', async () => {
    const { home: root } = await home('session-a', frame(record(0)))
    assert.equal(await findLogFile(root, 'session-missing'), undefined)
    assert.equal(await findLogFile(join(root, 'nowhere'), 'session-a'), undefined)
    await rm(root, { recursive: true, force: true })
  })
})

describe('reading a log', () => {
  it('decodes every frame, not just the first', async () => {
    // One frame per append is what the format does, and a single decompression
    // call decodes only the first — which reads as a 3-record log.
    const { home: root, path } = await home('session-a', frame(record(0)), frame(record(1)), frame(record(2)))
    const { frames, records } = await readLog(path)
    assert.equal(frames.length, 3)
    assert.deepEqual(records.map(r => (r as { seq: number }).seq), [0, 1, 2])
    assert.deepEqual(frames.map(f => f.count), [1, 1, 1])
    await rm(root, { recursive: true, force: true })
  })
})

describe('taking a resume marker back out', () => {
  it('drops a trailing marker and leaves the rest readable', async () => {
    const { home: root, path } = await home(
      'session-a',
      frame(record(0), record(1)),
      frame(`${JSON.stringify({ seq: 2, type: RESUME_MARKER, time: 1, data: {} })}\n`),
    )
    assert.equal(await dropTrailingMarkers(path, 1), 1)
    const { records } = await readLog(path)
    assert.deepEqual(records.map(r => (r as { seq: number }).seq), [0, 1])
    await rm(root, { recursive: true, force: true })
  })

  it('stops at the first real event, whatever the limit says', async () => {
    // A log whose content diverges is not this function's decision to make.
    const { home: root, path } = await home(
      'session-a',
      frame(record(0)),
      frame(`${JSON.stringify({ seq: 1, type: RESUME_MARKER, time: 1, data: {} })}\n`, record(2)),
    )
    assert.equal(await dropTrailingMarkers(path, 5), 0)
    assert.deepEqual((await readLog(path)).records.map(r => (r as { seq: number }).seq), [0, 1, 2])
    await rm(root, { recursive: true, force: true })
  })

  it('drops a marker that shares a frame with the event before it', async () => {
    const { home: root, path } = await home(
      'session-a',
      frame(record(0)),
      frame(record(1), `${JSON.stringify({ seq: 2, type: RESUME_MARKER, time: 1, data: {} })}\n`),
    )
    assert.equal(await dropTrailingMarkers(path, 1), 1)
    assert.deepEqual((await readLog(path)).records.map(r => (r as { seq: number }).seq), [0, 1])
    await rm(root, { recursive: true, force: true })
  })

  it('drops no more than it was asked to', async () => {
    const marker = (seq: number): string => `${JSON.stringify({ seq, type: RESUME_MARKER, time: 1, data: {} })}\n`
    const { home: root, path } = await home('session-a', frame(record(0)), frame(marker(1), marker(2)))
    assert.equal(await dropTrailingMarkers(path, 1), 1)
    assert.deepEqual((await readLog(path)).records.map(r => (r as { seq: number }).seq), [0, 1])
    await rm(root, { recursive: true, force: true })
  })

  it('leaves the file byte-identical when there is nothing to drop', async () => {
    const { home: root, path } = await home('session-a', frame(record(0), record(1)))
    const before = await readFile(path)
    assert.equal(await dropTrailingMarkers(path, 3), 0)
    assert.deepEqual(await readFile(path), before)
    await rm(root, { recursive: true, force: true })
  })

  it('does nothing at all when asked for zero', async () => {
    const { home: root, path } = await home('session-a', frame(record(0)))
    const before = await readFile(path)
    assert.equal(await dropTrailingMarkers(path, 0), 0)
    assert.deepEqual(await readFile(path), before)
    await rm(root, { recursive: true, force: true })
  })
})

describe('dropping a cached projection', () => {
  it('removes the file, and says whether there was one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-logfile-'))
    const dir = join(root, 'storages', 'session_projcache', 'sessions')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'session-a.json'), '{"version":7}')
    assert.equal(await clearProjectionCache(root, 'session-a'), true)
    assert.equal(await clearProjectionCache(root, 'session-a'), false)
    await rm(root, { recursive: true, force: true })
  })
})
