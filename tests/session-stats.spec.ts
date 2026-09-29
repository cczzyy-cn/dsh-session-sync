/**
 * Reading a Session's own log on the machine that owns it.
 *
 * The console can only count the events the mirror retained, and that is a window
 * — so the footer understates a long Session by everything below it, no matter how
 * far the console pages. The authority has to be the machine, which means this
 * half has to read a log that DSH writes as concatenated Zstandard frames, and it
 * has to read it the way DSH lays it out. Both are reproduced here rather than
 * imported, so both are pinned here.
 *
 * A wrong reading must never become a published total: every failure path in
 * `readLogEvents` ends as "undefined", and the console falls back to counting what
 * it holds. What these tests hold to is that a *correct* log reads correctly —
 * across frames, with a line split over a frame boundary, with the version taken
 * from the filename rather than assumed.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { zstdCompressSync } from 'node:zlib'
import { findLogPath, projectKey, readLogEvents } from '../src/host/session-stats.ts'
import { logStats } from '../src/shared/log-stats.ts'
import type { MirrorEvent } from '../src/shared/protocol.ts'

const homes: string[] = []
after(async () => {
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

/** One JSONL row, as DSH writes it. */
function row(event: { type: string; seq: number; time?: number; data?: unknown }): string {
  return JSON.stringify({ type: event.type, seq: event.seq, time: event.time ?? 1_700_000_000_000 + event.seq, data: event.data })
}

/** The header line DSH puts first, which carries no sequence and is not an event. */
function header(): string {
  return JSON.stringify({ type: 'session', version: 4, id: 'session-x', createdAt: 1, cwd: 'C:\\work', isSeeded: false, delegationDepth: 0 })
}

/** Compress a batch the way the log does: one checksummed frame per durable batch. */
function frame(text: string): Buffer {
  return zstdCompressSync(Buffer.from(text, 'utf8'), { params: { 201: 1 } })
}

describe('reading the machine\'s own Session log', () => {
  it('derives the project directory the way the persistence backend does', () => {
    // Measured against a real DSH home: `C:\Users\14339\Desktop\git\dsh-session-sync`
    // lives in `--C-Users-14339-Desktop-git-dsh-session-sync--`.
    assert.equal(projectKey('C:\\Users\\14339\\Desktop\\git\\dsh-session-sync'), '--C-Users-14339-Desktop-git-dsh-session-sync--')
    // Separators collapse, a leading separator run is dropped, and anything
    // outside the safe set is escaped rather than dropped — the directory name is
    // the only way back to the log.
    assert.equal(projectKey('/home/u/my proj'), '--home-u-my~0020proj--')
    assert.equal(projectKey('C:\\'), '--C---', 'a trailing separator run collapses to one dash')
  })

  it('finds the newest generation of a Session log, compressed or not', async () => {
    const root = await mkdtemp(join(tmpdir(), 'log-path-'))
    homes.push(root)
    const cwd = 'C:\\work\\demo'
    const sessionId = 'session-1e8f7811'
    const directory = join(root, projectKey(cwd), sessionId)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'session.v3.jsonl.zstd'), frame(`${header()}\n`))
    await writeFile(join(directory, 'session.v4.jsonl'), `${header()}\n`)

    const found = await findLogPath(root, cwd, sessionId)
    assert.equal(found, join(directory, 'session.v4.jsonl'), 'the highest generation wins')

    await writeFile(join(directory, 'session.v4.jsonl.zstd'), frame(`${header()}\n`))
    assert.equal(await findLogPath(root, cwd, sessionId), join(directory, 'session.v4.jsonl.zstd'), 'compressed beats plain at one generation')
    assert.equal(await findLogPath(root, cwd, 'session-absent'), undefined, 'an absent Session has no log')
  })

  it('reads every frame, including a line split across two of them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'log-read-'))
    homes.push(root)
    const path = join(root, 'session.v4.jsonl.zstd')
    // A durable batch ends mid-row — the writer was interrupted between the bytes
    // of one JSON object — so the reader must carry that fragment into the next
    // frame and parse the row whole. Note the rows that *do* end are terminated:
    // DSH writes a newline per row, and two objects glued together are not a row.
    const first = `${header()}\n${row({ type: 'turn/start', seq: 0, data: { turn: 1 } })}\n`
    const split = row({ type: 'assistant/message', seq: 1, data: { usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 90 } } })
    const cut = Math.floor(split.length / 2)
    const second = `${split.slice(cut)}\n${row({ type: 'step/end', seq: 2, data: { turn: 1, step: 1 } })}\n${row({ type: 'turn/end', seq: 3 })}`
    await writeFile(path, Buffer.concat([frame(first + split.slice(0, cut)), frame(second)]))

    const read = await readLogEvents(path)
    assert.notEqual(read, undefined)
    assert.equal(read?.truncated, false)
    assert.deepEqual(read?.events.map(event => event.seq), [0, 1, 2, 3], 'every row survived the frame boundary')

    const stats = logStats(read?.events ?? [])
    assert.equal(stats.turns, 1)
    assert.equal(stats.usage.outputTokens, 4)
    assert.equal(stats.usage.cacheReadTokens, 90)
    assert.equal(stats.cacheHitPercent, 90)
  })

  it('reads a plain (uncompressed) log too', async () => {
    const root = await mkdtemp(join(tmpdir(), 'log-plain-'))
    homes.push(root)
    const path = join(root, 'session.v4.jsonl')
    await writeFile(path, `${header()}\n${row({ type: 'turn/start', seq: 0, data: { turn: 3 } })}\n${row({ type: 'step/start', seq: 1, data: { turn: 3, step: 1 } })}\n`)
    const read = await readLogEvents(path)
    assert.deepEqual(read?.events.map(event => event.seq), [0, 1])
    assert.equal(logStats(read?.events ?? []).turns, 3)
  })

  it('refuses a file it cannot read rather than reporting totals for it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'log-bad-'))
    homes.push(root)
    // A file whose bytes are not a Zstandard frame at all.
    const path = join(root, 'session.v4.jsonl.zstd')
    await writeFile(path, Buffer.from('not a session log', 'utf8'))
    const read = await readLogEvents(path)
    // Either an empty reading or undefined; never rows invented from garbage.
    assert.equal(read?.events.length ?? 0, 0)
    assert.equal(await readLogEvents(join(root, 'missing.zstd')), undefined, 'an unreadable path is undefined, not empty')
  })

  it('computes the same totals the console computes, from the same rows', () => {
    // The two halves must not disagree about the arithmetic, only about how much
    // log each of them holds — which is the whole reason one implementation is
    // shared. Rows chosen to exercise every branch: an open turn, an unmatched
    // step end, a message with no usage, and one with it.
    const events: MirrorEvent[] = [
      { type: 'turn/start', seq: 0, time: 1_000, data: { turn: 1 } },
      { type: 'step/start', seq: 1, time: 1_100, data: { turn: 1, step: 1 } },
      { type: 'assistant/message', seq: 2, time: 1_600, data: { usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, reasoningTokens: 5 } } },
      { type: 'step/end', seq: 3, time: 2_100, data: { turn: 1, step: 1 } },
      { type: 'step/end', seq: 4, time: 2_200, data: { turn: 9, step: 9 } },
      { type: 'turn/start', seq: 5, time: 3_000, data: { turn: 2 } },
      { type: 'assistant/message', seq: 6, time: 3_500, data: {} },
    ]
    const stats = logStats(events)
    assert.equal(stats.turns, 2, 'the highest turn ordinal, so a turn in flight counts')
    assert.equal(stats.steps, 1)
    assert.equal(stats.usage.outputTokens, 20)
    assert.equal(stats.usage.inputTokens, 10)
    assert.equal(stats.usage.cacheReadTokens, 30)
    assert.equal(stats.usage.reasoningTokens, 5)
    // 20 output tokens over the step that wrote it: the newest `step/start` before
    // the message is 1_100, and the message carries seq 2 at 1_600 — 500 ms. Neither
    // the whole step (1_100 → 2_100, which runs on through a tool call) nor the gap
    // to the next message (1_600 → 3_500, which is mostly idle) is the rate.
    assert.equal(stats.outputPerSecond, 40)
    assert.equal(stats.stepMs, 1_000)
    assert.equal(stats.cacheHitPercent, 75)
    assert.equal(stats.firstTime, 1_000)
    assert.equal(stats.lastTime, 3_500)
  })

  it('reads context occupancy the way the shipped meter does', () => {
    // The window comes from the newest `request/context`, the reading from the newest
    // `assistant/message`, and a stated `totalTokens` wins over input+output because
    // it already counts the cached reads. The shipped composer's meter is the
    // reference: a footer that disagreed with it would be a third number for one fact.
    const stats = logStats([
      { type: 'request/context', seq: 0, time: 1_000, data: { contextWindow: 128_000 } },
      { type: 'assistant/message', seq: 1, time: 2_000, data: { usage: { inputTokens: 1_000, outputTokens: 500, cacheReadTokens: 40_000 } } },
      // A newer window and a newer reading, which is what must be reported.
      { type: 'request/context', seq: 2, time: 3_000, data: { contextWindow: 64_000 } },
      { type: 'assistant/message', seq: 3, time: 4_000, data: { usage: { totalTokens: 32_000, inputTokens: 1, outputTokens: 1 } } },
    ])
    assert.deepEqual(stats.context, { window: 64_000, used: 32_000, percent: 50 })

    // Half-stated is not stated: a window with no reading, or a reading with no
    // window, gives nothing to show rather than a zero that reads as "empty".
    assert.equal(logStats([
      { type: 'request/context', seq: 0, time: 1_000, data: { contextWindow: 128_000 } },
    ]).context, undefined)
    assert.equal(logStats([
      { type: 'assistant/message', seq: 0, time: 1_000, data: { usage: { inputTokens: 10, outputTokens: 5 } } },
    ]).context, undefined)

    // A reading above the window clamps, exactly as the meter's own arithmetic does.
    assert.equal(logStats([
      { type: 'request/context', seq: 0, time: 1_000, data: { contextWindow: 1_000 } },
      { type: 'assistant/message', seq: 1, time: 2_000, data: { usage: { totalTokens: 4_000 } } },
    ]).context?.percent, 100)
  })
})
