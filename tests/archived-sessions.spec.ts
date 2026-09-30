/**
 * An archived Session is not offered for publishing.
 *
 * `SessionController.list` reports an archived Session exactly like any other,
 * because the archive set belongs to the Workspace registry and `SessionSummary`
 * has no field for it. The settings page is a publish picker, so the row has to be
 * dropped — and dropping it *there* is also what ends its follow, since the same
 * list is what `reconcile` desires and the index it publishes is what the mirror
 * follows.
 *
 * The seam is `ctx.get('workspaceRegistry')`, which is optional in two directions:
 * a composition may not mount the registry at all, and the set itself is another
 * plugin's state. The last two cases pin that neither absence nor an unexpected
 * shape hides every Session instead of the archived ones.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SessionSyncService } from '../src/host/service.ts'
import type { HostContext, SessionControllerLike, SessionSummaryRow } from '../src/host/dsh.ts'

const ARCHIVED = 'session-archived-1111'
const PUBLISHED = 'session-published-2222'
const PLAIN = 'session-plain-3333'
const PINNED = 'session-pinned-4444'
const CHILD = 'session-child-5555'
const MACHINE = 'archived-test'

const homes: string[] = []

after(async () => {
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

/** One Session summary carrying the fields the engine reads. */
function summary(sessionId: string, extra: Partial<SessionSummaryRow> = {}): SessionSummaryRow {
  return {
    sessionId,
    updatedAt: 1_700_000_000_000,
    running: false,
    blank: false,
    cwd: 'C:\\work',
    projections: { asOfSeq: 3, values: { title: `title of ${sessionId}` } },
    ...extra,
  }
}

/** A controller that answers `list` with these rows and nothing else. */
function controller(items: readonly SessionSummaryRow[]): SessionControllerLike {
  return {
    list: () => Promise.resolve({ items }),
    follow: () => (async function* () { /* this test never follows */ })(),
    page: () => Promise.resolve({ records: [], hasMore: false }),
    prompt: () => Promise.resolve({ accepted: true as const }),
  }
}

/**
 * A Host context that answers `get` for the two services this test needs.
 *
 * `registry` is `undefined` for the "build without a registry" case: the engine
 * must then treat the archive set as absent rather than as an error.
 */
function context(items: readonly SessionSummaryRow[], registry: unknown): HostContext {
  const quiet = { info: () => {}, warn: () => {}, error: () => {} }
  return {
    logger: quiet,
    effect: () => {},
    get: (name: string) => {
      if (name === 'sessionController') return controller(items)
      if (name === 'workspaceRegistry') return registry
      return undefined
    },
    inject: () => {},
    on: () => () => {},
  }
}

/** Write a config document that marks the archived Session for publishing too. */
async function home(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sync-archived-'))
  homes.push(directory)
  await writeFile(join(directory, 'dsh-session-sync.json'), JSON.stringify({
    machineName: MACHINE,
    isServer: false,
    password: 'test-password',
    listenHost: '127.0.0.1',
    listenPort: 18_793,
    // Both marks are deliberate: an archived Session that is *also* still marked
    // for publishing is the exact state the settings page drew a row for.
    syncSessions: { [ARCHIVED]: true, [PUBLISHED]: true },
  }), 'utf8')
  return directory
}

/** Every row the engine would offer the configuration page. */
async function listed(
  items: readonly SessionSummaryRow[],
  registry: unknown,
): Promise<{ sessionId: string; synced: boolean }[]> {
  const service = await SessionSyncService.create(context(items, registry), await home())
  const rows = await service.localSessions()
  await service.dispose()
  return rows.map(row => ({ sessionId: row.sessionId, synced: row.synced }))
}

const ALL = [
  summary(ARCHIVED),
  summary(PUBLISHED),
  summary(PLAIN),
  summary(PINNED),
  summary(CHILD, { parentSessionId: PUBLISHED, origin: 'subagent' }),
]

describe('the publish picker and archived Sessions', () => {
  it('drops an archived Session, published mark and all', async () => {
    const rows = await listed(ALL, { archivedSessionIds: [ARCHIVED] })
    const ids = rows.map(row => row.sessionId)
    assert.equal(ids.includes(ARCHIVED), false, 'an archived Session is not offered')
    // The mark is still in the config; what matters is that no row carries it.
    assert.equal(rows.some(row => row.sessionId === ARCHIVED && row.synced), false)
  })

  it('still lists everything else, with its mark intact', async () => {
    const rows = await listed(ALL, { archivedSessionIds: [ARCHIVED] })
    const ids = rows.map(row => row.sessionId)
    assert.deepEqual(ids.sort(), [PINNED, PLAIN, PUBLISHED].sort())
    assert.equal(rows.find(row => row.sessionId === PUBLISHED)?.synced, true)
    assert.equal(rows.find(row => row.sessionId === PLAIN)?.synced, false)
  })

  it('leaves a pinned Session alone: archived and pinned are different facts', async () => {
    const registry = { archivedSessionIds: [ARCHIVED], pinnedSessionIds: [PINNED] }
    const ids = (await listed(ALL, registry)).map(row => row.sessionId)
    assert.equal(ids.includes(PINNED), true, 'only the archive set filters this list')
    assert.equal(ids.includes(ARCHIVED), false)
  })

  it('keeps subagent children out, archived or not', async () => {
    const ids = (await listed(ALL, { archivedSessionIds: [] })).map(row => row.sessionId)
    assert.equal(ids.includes(CHILD), false)
  })

  it('hides nothing when the composition mounts no registry', async () => {
    const ids = (await listed(ALL, undefined)).map(row => row.sessionId)
    assert.deepEqual(ids.sort(), [ARCHIVED, PINNED, PLAIN, PUBLISHED].sort())
  })

  it('hides nothing when the archive set is not a list of ids', async () => {
    const ids = (await listed(ALL, { archivedSessionIds: 'not-an-array' })).map(row => row.sessionId)
    assert.deepEqual(ids.sort(), [ARCHIVED, PINNED, PLAIN, PUBLISHED].sort())
  })
})
