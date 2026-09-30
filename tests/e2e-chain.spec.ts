/**
 * The whole chain, over the real link, in one process.
 *
 * Every other Host-side test pins one seam. This one runs the two halves as they
 * actually run — a real server-role engine owning the listener, a real
 * client-role engine owning the link, a real mirror in between, and a Session
 * controller stand-in at the far end — and then walks the four things a reader
 * does: see the Session listed, read its window, page below the window, and take
 * a prompt back to the machine that owns it.
 *
 * It exists because that path has only ever been exercised by hand, in a browser,
 * against the deployed pair. The last leg — takeover — is the one nothing else
 * covers at all: `runCommand` has to accept a downstream command, admit it into
 * the owning Session, and report the outcome back to the server, and only the
 * real link carries those three steps.
 *
 * It also guards the shape of the state contract: the retired "write real
 * Sessions" feature is gone, and `state` must not quietly grow its fields back.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SessionSyncService } from '../src/host/service.ts'
import type { FollowFrame, HostContext, SessionControllerLike } from '../src/host/dsh.ts'
import type { CommandStatus, SyncConfig, SyncStreamFrame } from '../src/shared/protocol.ts'

const SESSION_ID = 'session-chain-2222-2222-222222222222'
const ORIGIN = 'chain-origin'
const SERVER = 'chain-server'
const PASSWORD = 'chain-pw'
const SERVER_PORT = 18_805
const CLIENT_PORT = 18_806
/** Events in the origin's Session; the opening window carries the newest three. */
const EVENTS = 6
const WINDOW = 3

const homes: string[] = []
const disposers: (() => Promise<void> | void)[] = []
const quiet = { info: () => {}, warn: () => {}, error: () => {} }

after(async () => {
  for (const dispose of disposers.reverse()) await dispose()
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

function event(seq: number): { type: string; seq: number; time: number; data: unknown } {
  return { type: 'assistant/message', seq, time: 1_700_000_000_000 + seq, data: { seq } }
}

/** One throwaway Harness home carrying the plugin's own config document. */
async function home(config: Partial<SyncConfig> & { machineName: string }): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'sync-chain-'))
  homes.push(path)
  await writeFile(join(path, 'dsh-session-sync.json'), JSON.stringify({
    serverUrl: '',
    isServer: false,
    password: PASSWORD,
    listenHost: '127.0.0.1',
    listenPort: CLIENT_PORT,
    syncSessions: {},
    ...config,
  }), 'utf8')
  return path
}

/**
 * The origin's Session, as DSH presents it: a tail window, a page API behind it,
 * and prompts that are either admitted or refused.
 */
function originController(): {
  value: SessionControllerLike
  prompts: string[]
  pages: { throughSeq: number; beforeSeq: number }[]
} {
  const all = Array.from({ length: EVENTS }, (_, index) => event(index))
  const prompts: string[] = []
  const pages: { throughSeq: number; beforeSeq: number }[] = []
  const value: SessionControllerLike = {
    list: () => Promise.resolve({
      items: [{
        sessionId: SESSION_ID,
        updatedAt: 1_700_000_000_000,
        running: false,
        blank: false,
        cwd: 'C:\\work',
        projections: { asOfSeq: EVENTS - 1, values: { title: 'chain' } },
      }],
    }),
    follow: (_request, signal) => (async function* () {
      yield {
        type: 'snapshot',
        cursor: EVENTS - 1,
        records: all.slice(-WINDOW).map(item => ({ type: 'event', event: item })),
        hasMore: true,
        projections: { values: {} },
      } satisfies FollowFrame
      // Stay open like a real follow: the link is what the server's commands
      // travel down, so a follow that ended would take takeover with it.
      await new Promise<void>(resolve => {
        signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
    })(),
    page: (request) => {
      const before = request.beforeSeq ?? Number.MAX_SAFE_INTEGER
      pages.push({ throughSeq: request.throughSeq, beforeSeq: before })
      const below = all.filter(item => item.seq < before)
      return Promise.resolve({
        records: below.map(item => ({ type: 'event', event: item })),
        hasMore: false,
      })
    },
    prompt: (request) => {
      prompts.push(request.content.map(part => part.text).join(''))
      return Promise.resolve({ accepted: true as const })
    },
  }
  return { value, prompts, pages }
}

/** A Host context exposing only the controller, which is all the engine asks for. */
const context = (value: SessionControllerLike | undefined): HostContext => ({
  logger: quiet,
  effect: () => {},
  get: (name: string) => (name === 'sessionController' ? value : undefined),
  inject: () => {},
  on: () => () => {},
})

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

describe('the whole chain over the real link', () => {
  it('mirrors a published Session, pages it, and takes a prompt back to its machine', async () => {
    const serverHome = await home({
      machineName: SERVER,
      isServer: true,
      listenPort: SERVER_PORT,
    })
    const originHome = await home({
      machineName: ORIGIN,
      serverUrl: `127.0.0.1:${String(SERVER_PORT)}`,
      listenPort: CLIENT_PORT + 10,
      syncSessions: { [SESSION_ID]: true },
    })

    // The server half: a real service owning the listener, watched the way a
    // browser watches it — through `attachBrowser`, which is the SSE sink.
    const server = await SessionSyncService.create(context(undefined), serverHome)
    const frames: SyncStreamFrame[] = []
    const detach = server.attachBrowser({ send: frame => { frames.push(frame) } })
    server.start()
    disposers.push(async () => { detach(); await server.dispose() })

    const { value, prompts, pages } = originController()
    const origin = await SessionSyncService.create(context(value), originHome)
    origin.start()
    disposers.push(async () => { await origin.dispose() })

    // 1. The mirror holds the window the origin opened with — and nothing is
    //    missing from it: the origin says its own log goes further back, which is
    //    what `hasOlder` means, and that is not a gap.
    const mirrored = await until(() => {
      const session = server.view().machines
        .find(machine => machine.machineName === ORIGIN)
        ?.sessions.find(item => item.sessionId === SESSION_ID)
      return session !== undefined && session.eventCount === WINDOW && session.missingEvents === 0
        ? session
        : undefined
    }, 'the mirror to hold the window the origin opened with')
    assert.equal(mirrored.title, 'chain')
    // The two readings a reader is shown, apart. This mirror is not *behind* —
    // the origin's stated watermark is its own follow's end, and the snapshot it
    // just sent reaches it — and it holds no *hole* either: what it lacks is the
    // history below the window, which is `hasOlder` and one page away.
    assert.equal(mirrored.behind, 0, 'a delivered snapshot is not behind')
    assert.equal(mirrored.holes, 0, 'a tail window is not a hole')

    // 2. The console reads that window, and the page below it is read from the
    //    machine that owns the Session — the road the "load older" control takes.
    const window = server.transcript(ORIGIN, SESSION_ID, { limit: WINDOW })
    assert.equal(window?.events.length, WINDOW)
    const oldest = window?.events[0]?.seq
    assert.equal(oldest, EVENTS - WINDOW)
    const page = server.transcript(ORIGIN, SESSION_ID, { limit: WINDOW, before: oldest })
    assert.notEqual(page, undefined)
    const read = await until(
      () => (pages.length > 0 ? pages[0] : undefined),
      'the origin to read the page below the window',
    )
    // The ask is cut one *past* the reader's lowest held sequence, so that event
    // is inside the page rather than left out. That boundary is the one this
    // project got wrong three times — a page ending on the edge's own neighbour
    // looks perfectly normal from both ends and silently loses one event per
    // page.
    assert.equal(read.beforeSeq, oldest + 1, 'the page must be cut below what the reader holds')

    // 3. And the page really arrives: the mirror grows to the whole Session, which
    //    is the difference between "the origin was asked" and "the reader can see
    //    it" — the two that looked identical when a delivered page was buffered on
    //    a follow handle that resync replaced underneath it.
    const whole = await until(() => {
      const session = server.view().machines
        .find(machine => machine.machineName === ORIGIN)
        ?.sessions.find(item => item.sessionId === SESSION_ID)
      return session !== undefined && session.eventCount === EVENTS ? session : undefined
    }, 'the page below the window to reach the mirror')
    assert.equal(whole.missingEvents, 0)
    assert.equal(whole.behind, 0, 'nothing is left above the mirror once the page arrives')
    assert.equal(whole.holes, 0)

    // 3b. Once a page read has walked back to the beginning of the log, the
    //     reader's "older" control is finished — and a reconnect must not bring it
    //     back. A follow opens on a *tail* window, and that window's own `hasMore`
    //     is true of every Session longer than the window, so trusting each
    //     re-opened window over what the page read already learned left the control
    //     on screen forever: the reader pages to the start, and the next resync or
    //     blip turns it back on.
    assert.equal(
      server.transcript(ORIGIN, SESSION_ID, { limit: 1_000 })?.hasMore,
      false,
      'reading back to the start leaves nothing older to offer',
    )
    const settled = origin.view().follows?.find(item => item.sessionId === SESSION_ID)
    assert.equal(settled?.hasOlder, false, 'and the machine stops claiming history below its window')
    // A reconnect is what a network blip does, and it re-opens every follow on a
    // fresh tail window. Asserted on the machine's own reading, which flips the
    // instant that window arrives, rather than on the mirror's copy — that one
    // follows on the next index, up to a reconcile away.
    await origin.patch({ listenPort: CLIENT_PORT + 11 })
    const reopened = await until(() => {
      const handle = origin.view().follows?.find(item => item.sessionId === SESSION_ID)
      return handle !== undefined && handle.opened ? handle : undefined
    }, 'the re-opened follow to deliver its window')
    assert.equal(reopened.hasOlder, false, 'a re-opened tail window must not resurrect the older control')
    assert.equal(
      server.transcript(ORIGIN, SESSION_ID, { limit: 1_000 })?.hasMore,
      false,
      'and the mirror must not start offering older history again',
    )
    // The link itself has to be back before the next step. A command handed to a
    // stream that is already dying is written nowhere and marked delivered anyway
    // (nothing re-sends a command that was "sent"), so asserting takeover *inside*
    // the reconnect window asserts a different, currently broken property — see
    // PROGRESS §4. Waiting here keeps this test about takeover.
    await until(() => (origin.view().linked ? true : undefined), 'the origin link to come back')

    // 4. Takeover: one prompt typed in the console reaches the owning machine's
    //    Session, and the console hears that it was admitted.
    const submitted = server.submitCommand(ORIGIN, SESSION_ID, '  hello from the console  ')
    assert.equal(submitted.ok, true)
    const commandId = submitted.ok ? submitted.commandId : ''
    assert.notEqual(commandId, '')
    const admitted = await until(() => prompts[0], 'the origin to admit the prompt')
    assert.equal(admitted, 'hello from the console')
    const accepted = await until<CommandStatus>(
      () => frames
        .filter((frame): frame is Extract<SyncStreamFrame, { type: 'command' }> => frame.type === 'command')
        .map(frame => frame.command)
        .find(command => command.commandId === commandId && command.state === 'accepted'),
      'the console to hear the prompt was admitted',
    )
    assert.equal(accepted.sessionId, SESSION_ID)

    // 5. The retired feature stays retired: `state` carries neither the switch nor
    //    the list of written copies, on either half.
    const state = server.view() as unknown as Record<string, unknown>
    assert.equal('materialize' in state, false)
    assert.equal('materialized' in state, false)
    const originState = origin.view() as unknown as Record<string, unknown>
    assert.equal('materialize' in originState, false)
    assert.equal('materialized' in originState, false)

    // 6. A machine may not be driven for a Session it never published.
    const refused = server.submitCommand(ORIGIN, 'session-not-published-0000', 'hi')
    assert.equal(refused.ok, false)

    // 7. Version handshake: the server states the version the *origin* says it is
    //    running, not the one it happens to have installed — that difference is
    //    what a two-build deployment looks like from here.
    const originVersion = origin.view().pluginVersion
    assert.match(originVersion, /^\d+\.\d+\.\d+/u)
    assert.equal(server.view().pluginVersion, originVersion)
    const mirroredMachine = server.view().machines.find(machine => machine.machineName === ORIGIN)
    assert.equal(mirroredMachine?.pluginVersion, originVersion)
  })
})
