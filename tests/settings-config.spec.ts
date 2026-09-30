/**
 * The configuration lives in DSH's settings document, and the old JSON document
 * is imported once and archived.
 *
 * What this file pins, and why each case is worth a test rather than a reading:
 *
 *  - a patch reaches the settings service as `update` (scalars) plus one `mutate`
 *    (the per-Session maps), each carrying the revision that was last read. The
 *    revision is the whole conflict story: without it a concurrent edit on the
 *    Plugins page is silently overwritten instead of refused.
 *  - a first start with a legacy `dsh-session-sync.json` imports it and renames it
 *    aside — never deletes it — and a second start imports nothing.
 *  - a composition with no `settings` service still reads and writes the file.
 *
 * The `settings` stand-in below is deliberately a small state machine rather than
 * a mock that returns canned values: the revision handed to `mutate` is only
 * meaningful if an earlier `update` actually moved it, and a canned value would
 * let a broken stitch pass.
 */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, describe, it, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import {
  ConfigStore,
  SETTINGS_NAMESPACE,
  archivePath,
  engineConfigFrom,
  planPatch,
  readConfigDocument,
  type SettingsDescriptorLike,
  type SettingsPathOp,
  type SettingsServiceLike,
} from '../src/host/config-store.ts'
import { configPath, loadConfig } from '../src/host/config.ts'
import { buildConfigSchema, type ConfigSchemaModule } from '../src/host/config-schema.ts'
import { defaultConfig, type SyncConfig } from '../src/shared/protocol.ts'

const homes: string[] = []
after(async () => {
  for (const home of homes) await rm(home, { recursive: true, force: true })
})

/** A throwaway Harness home. */
async function home(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'sync-store-'))
  homes.push(path)
  return path
}

/** One recorded write. */
interface RecordedCall {
  kind: 'update' | 'mutate'
  /** The revision the caller sent, or undefined when it sent none. */
  revision: number | undefined
  patch?: Record<string, unknown>
  ops?: readonly SettingsPathOp[]
}

/**
 * A `settings` service with one configurable namespace.
 *
 * It models the three facts the real one imposes on this plugin: the value is the
 * resolved section, the revision rises on every write, and a write carrying a
 * revision that no longer matches is *refused* rather than applied.
 *
 * `revision` and `actual` are separate on purpose. `revision` is what `describe()`
 * reports, and `actual` is what the service really stands at; leaving them equal
 * is the ordinary case, and moving only `actual` is how a test says "another writer
 * saved while this caller was holding a revision", which is the one state a
 * conflict check exists for and the only way to reach it without racing.
 */
class FakeSettings implements SettingsServiceLike {
  readonly calls: RecordedCall[] = []
  revision = 0
  actual = 0
  value: Record<string, unknown>

  constructor(value: Record<string, unknown> = {}) {
    this.value = value
  }

  /** Report the live revision and the live value. */
  describe(): SettingsDescriptorLike[] {
    // A copy, like the real service: a caller must not be able to mutate the
    // stored section by holding on to a descriptor.
    return [{ ns: SETTINGS_NAMESPACE, value: { ...this.value }, revision: this.revision }]
  }

  async update(ns: string, patch: object, expectedRevision?: number): Promise<void> {
    this.calls.push({
      kind: 'update',
      revision: expectedRevision,
      patch: { ...patch as Record<string, unknown> },
    })
    this.guard(ns, expectedRevision)
    this.value = { ...this.value, ...patch as Record<string, unknown> }
    this.bump()
  }

  async mutate(ns: string, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void> {
    this.calls.push({ kind: 'mutate', revision: expectedRevision, ops })
    this.guard(ns, expectedRevision)
    for (const op of ops) {
      if (op.path.length !== 2) continue
      const [parent, sessionId] = op.path as [string, string]
      const map = { ...this.value[parent] as Record<string, unknown> }
      if (op.op === 'set') map[sessionId] = op.value
      else delete map[sessionId]
      this.value = { ...this.value, [parent]: map }
    }
    this.bump()
  }

  /** Move the service on, as a save elsewhere would. */
  bump(): void {
    this.revision += 1
    this.actual += 1
  }

  /** Refuse a stale revision the way `SettingsConflictError` does. */
  private guard(ns: string, expectedRevision?: number): void {
    assert.equal(ns, SETTINGS_NAMESPACE)
    if (expectedRevision === undefined) return
    if (expectedRevision === this.actual) return
    throw new Error(
      `settings namespace "${ns}" changed since it was read (expected revision ${String(expectedRevision)}, `
      + `now ${String(this.actual)})`,
    )
  }
}
/** A Host context whose only service is the settings stand-in (or nothing). */
function context(settings: unknown): { logger: { info: () => void; warn: () => void }; get: (name: string) => unknown } {
  return {
    logger: { info: () => {}, warn: () => {} },
    get: (name: string) => (name === 'settings' ? settings : undefined),
  }
}

/**
 * The real `schemastery` builder, or nothing when it cannot be reached.
 *
 * This package resolves no `@deepseek-ai/*` types or modules from its own
 * `node_modules` — it has none, and the Host bundle is built with `schemastery`
 * declared external. The schema *is* runtime behaviour worth exercising, though:
 * whether `{}` validates, whether a dictionary accepts a Session id nobody
 * predicted, and whether `volatile`/`secret` reach the serialized envelope are all
 * things the Plugins page depends on. So the builder is loaded from the DSH
 * checkout (`vendor/schemastery`, which is what the `link:` override points at)
 * and the cases below are skipped — loudly — when no checkout is present.
 */
async function schemaModule(): Promise<ConfigSchemaModule | undefined> {
  const candidates = ['@deepseek-ai/schemastery', ...schemaCheckoutPaths()]
  for (const candidate of candidates) {
    try {
      const module = await import(candidate.startsWith('@') ? candidate : pathToFileURL(candidate).href) as { default?: ConfigSchemaModule }
      if (module.default !== undefined) return module.default
    } catch {
      // Try the next candidate; a machine with no DSH checkout skips these cases.
    }
  }
  return undefined
}

/** Where a DSH checkout's built `schemastery` might be, most specific first. */
function schemaCheckoutPaths(): string[] {
  const checkouts = [
    process.env['DSH_CHECKOUT'],
    join(homedir(), 'Desktop', 'git', 'deepseek-harness'),
    join(homedir(), 'git', 'deepseek-harness'),
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  return checkouts.map(checkout => join(checkout, 'vendor', 'schemastery', 'lib', 'index.mjs'))
}

/** Run `body` with the schema builder, or report the case as skipped. */
async function withSchema(context: TestContext, body: (Schema: ConfigSchemaModule) => void): Promise<void> {
  const Schema = await schemaModule()
  if (Schema === undefined) {
    context.skip('no DSH checkout with vendor/schemastery is reachable from this machine')
    return
  }
  body(Schema)
}

const DOCUMENT: SyncConfig = {
  machineName: 'DESKTOP-TEST',
  serverUrl: '210.16.120.228:8791',
  isServer: false,
  password: 'not-a-real-password',
  listenHost: '127.0.0.1',
  listenPort: 8791,
  syncSessions: { 'session-one': true },
  approveSessions: {},
}

describe('the configuration a settings namespace carries', () => {
  it('reads the declared volatile fields into the engine shape', () => {
    const declared = {
      machineName: { get: () => 'DESKTOP-TEST' },
      serverUrl: { get: () => 'example.test:8791' },
      isServer: { get: () => true },
      password: { get: () => 'not-a-real-password' },
      listenHost: { get: () => '0.0.0.0' },
      listenPort: { get: () => 18_792 },
      syncSessions: { get: () => ({ 'session-one': true, 'session-two': false }) },
      approveSessions: { get: () => ({ 'session-one': true }) },
    }
    assert.deepEqual(engineConfigFrom(declared, 'fallback'), {
      machineName: 'DESKTOP-TEST',
      serverUrl: 'example.test:8791',
      isServer: true,
      password: 'not-a-real-password',
      listenHost: '0.0.0.0',
      listenPort: 18_792,
      // A mark recorded as `false` is not a mark: the engine only ever treats
      // `true` as opted in, and carrying the `false` through would make the map
      // it publishes differ from the one the form shows.
      syncSessions: { 'session-one': true },
      approveSessions: { 'session-one': true },
    })
  })

  it('falls back to defaults when the row carried nothing at all', () => {
    // The row's `config` is `{}` on a fresh install, and the Loader still calls
    // `apply` with it: reading that must produce a complete configuration rather
    // than an object with holes in it.
    const config = engineConfigFrom({}, 'fallback-machine')
    assert.equal(config.machineName, 'fallback-machine')
    assert.equal(config.listenHost, '0.0.0.0')
    assert.equal(config.listenPort, 8791)
    assert.deepEqual(config.syncSessions, {})
    assert.deepEqual(config.approveSessions, {})
  })
})

describe('the declared Config schema', () => {
  it('accepts a row whose config is empty, and one carrying every field', async (context) => {
    await withSchema(context, (Schema) => {
      const Config = buildConfigSchema(Schema)
      // `{}` is what the patch file carries today, and the Loader validates it.
      assert.doesNotThrow(() => Config({}))
      assert.doesNotThrow(() => Config({
        machineName: 'M',
        serverUrl: 'host:8791',
        isServer: false,
        password: 'secret',
        listenHost: '0.0.0.0',
        listenPort: 8791,
        syncSessions: { 'session-one': true },
        approveSessions: { 'session-two': true },
      }))
    })
  })

  it('marks every field volatile and the password secret', async (context) => {
    await withSchema(context, (Schema) => {
      const json = JSON.stringify(buildConfigSchema(Schema).toJSON())
      // Every field, not most of them: `SettingsForms.write` rejects an edit to a
      // path that is not volatile, so one ordinary field would be a setting the
      // generated form renders and then refuses to save.
      const volatile = json.match(/"volatile":true/g) ?? []
      assert.equal(volatile.length, 8, `expected 8 volatile fields, saw ${String(volatile.length)}`)
      // The password is the one field the `role` marker matters on: without it the
      // resolved section — and therefore any form that reads it — carries the secret.
      assert.match(json, /"role":"secret"[^}]*"volatile":true/)
      // The generated form renders the resolved section, so a default the schema
      // does not carry reads there as no value at all.
      assert.match(json, /"default":8791[^}]*"volatile":true/)
      // Both per-Session maps are dictionaries keyed by any string, with exactly one
      // legal value: a form edit addresses `['syncSessions', '<session id>']`, and a
      // fixed-key object would leave that path with no schema node to write through.
      assert.equal((json.match(/"type":"dict"/g) ?? []).length, 2)
      assert.equal((json.match(/"value":true/g) ?? []).length, 2)
    })
  })

  it('rejects a per-Session map value that is not true', async (context) => {
    await withSchema(context, (Schema) => {
      const Config = buildConfigSchema(Schema)
      // The maps exist to *grant* something. A stray `false` is not a smaller grant,
      // it is a value no reader agrees on, and the schema is the one place that can
      // say so before it reaches a Session id.
      assert.throws(() => Config({ syncSessions: { 'session-one': false } }))
      assert.doesNotThrow(() => Config({ syncSessions: { 'session-one': true } }))
    })
  })

  it('tolerates a per-Session map key that is not a Session id', async (context) => {
    await withSchema(context, (Schema) => {
      const Config = buildConfigSchema(Schema)
      // A dictionary validates values, not keys, and it must: Session ids are not
      // known until the machine has Sessions, and a form edit adds one later through
      // `settings.mutate` without the schema being able to predict it.
      assert.doesNotThrow(() => Config({ syncSessions: { 'a.weird/id with spaces': true } }))
    })
  })
})

describe('planning a patch', () => {
  it('sends only the scalars that changed', () => {
    const planned = planPatch(DOCUMENT, { machineName: 'RENAMED', listenPort: 8791 })
    assert.deepEqual(planned.scalars, { machineName: 'RENAMED' })
    assert.deepEqual(planned.syncSessions, [])
    assert.deepEqual(planned.approveSessions, [])
  })

  it('never writes a scalar the caller did not send', () => {
    // The whole point: the panel sends whole scalars, but any browser may send a
    // subset, and writing the section back would rewrite the password with a value
    // the sender never received.
    const planned = planPatch(DOCUMENT, { serverUrl: 'other.test:8791' })
    assert.deepEqual(Object.keys(planned.scalars), ['serverUrl'])
  })

  it('turns one Session switch into one path edit', () => {
    const on = planPatch(DOCUMENT, { sessionSync: { sessionId: 'session-two', synced: true } })
    assert.deepEqual(on.syncSessions, [{ sessionId: 'session-two', on: true }])
    const off = planPatch(DOCUMENT, { sessionSync: { sessionId: 'session-one', synced: false } })
    assert.deepEqual(off.syncSessions, [{ sessionId: 'session-one', on: false }])
  })

  it('refuses to arm approvals for a Session that is not published', () => {
    const planned = planPatch(DOCUMENT, { sessionApprovals: { sessionId: 'never-published', approved: true } })
    assert.deepEqual(planned.approveSessions, [])
  })

  it('drops a Session\u2019s approval opt-in in the same write that un-publishes it', () => {
    // Leaving the grant behind would be a switch that reads "on" while doing
    // nothing, and it would silently arm itself again if the Session were
    // published later.
    const published: SyncConfig = {
      ...DOCUMENT,
      syncSessions: { 'session-one': true },
      approveSessions: { 'session-one': true },
    }
    const planned = planPatch(published, { sessionSync: { sessionId: 'session-one', synced: false } })
    assert.deepEqual(planned.syncSessions, [{ sessionId: 'session-one', on: false }])
    assert.deepEqual(planned.approveSessions, [{ sessionId: 'session-one', on: false }])
  })
})

describe('reading a legacy document', () => {
  it('reports the keys the document actually carried', () => {
    const document = readConfigDocument(JSON.stringify({ machineName: 'OLD', syncSessions: {} }), 'fallback')
    assert.notEqual(document, undefined)
    assert.deepEqual([...document!.fields].sort(), ['machineName', 'syncSessions'])
    assert.equal(document!.config.listenPort, 8791)
  })

  it('reads through a byte order mark and refuses bytes that are not JSON', () => {
    const marked = readConfigDocument(`\uFEFF${JSON.stringify(DOCUMENT)}`, 'fallback')
    assert.equal(marked?.config.serverUrl, '210.16.120.228:8791')
    assert.equal(readConfigDocument('{ not json', 'fallback'), undefined)
  })
})

describe('a patch through the settings document', () => {
  it('writes scalars with `update` and the switches with one `mutate`', async () => {
    const settings = new FakeSettings({ ...DOCUMENT, syncSessions: { 'session-one': true } })
    const store = await ConfigStore.create(context(settings), await home())
    const next = await store.patch({
      machineName: 'RENAMED',
      sessionSync: { sessionId: 'session-two', synced: true },
    })

    assert.equal(settings.calls.length, 2)
    const [update, mutate] = settings.calls
    assert.equal(update!.kind, 'update')
    // Only the field that changed: the password the sender never received must not
    // be restated, and `update` merges rather than replaces.
    assert.deepEqual(update!.patch, { machineName: 'RENAMED' })
    assert.equal(mutate!.kind, 'mutate')
    assert.deepEqual(mutate!.ops, [
      { op: 'set', path: ['syncSessions', 'session-two'], value: true },
    ])
    // The revision the first write left behind is the one the second must carry;
    // reading a stale revision twice is how a concurrent edit gets clobbered.
    assert.equal(update!.revision, 0)
    assert.equal(mutate!.revision, 1)
    assert.equal(next.machineName, 'RENAMED')
    assert.deepEqual(next.syncSessions, { 'session-one': true, 'session-two': true })
  })

  it('gives both per-Session maps to one `mutate`', async () => {
    const settings = new FakeSettings({ ...DOCUMENT, approveSessions: { 'session-one': true } })
    const store = await ConfigStore.create(context(settings), await home())
    await store.patch({
      sessionApprovals: { sessionId: 'session-one', approved: false },
      sessionSync: { sessionId: 'session-two', synced: true },
    })
    // One call for both halves of the intention: two calls would leave a window in
    // which the publish mark moved and its approval grant had not.
    assert.equal(settings.calls.length, 1)
    assert.deepEqual(settings.calls[0]!.ops, [
      { op: 'set', path: ['syncSessions', 'session-two'], value: true },
      { op: 'unset', path: ['approveSessions', 'session-one'] },
    ])
  })

  it('refuses a stale write instead of clobbering a concurrent edit', async () => {
    const settings = new FakeSettings({ ...DOCUMENT })
    const store = await ConfigStore.create(context(settings), await home())
    // The section moves on while this caller still reads the revision it held: a
    // save from the generated form on the Plugins page, say. A store that carried
    // its cached revision into the write would overwrite that edit.
    settings.actual += 1
    await assert.rejects(
      () => store.patch({ machineName: 'RENAMED' }),
      /changed since it was read \(expected revision 0, now 1\)/,
    )
    // Nothing was written, so the other writer's value is intact.
    assert.equal(settings.value['machineName'], DOCUMENT.machineName)
  })

  it('adopts a value the settings page wrote, without touching the file', async () => {
    const settings = new FakeSettings({ ...DOCUMENT })
    const directory = await home()
    await writeFile(configPath(directory), JSON.stringify(DOCUMENT), 'utf8')
    const store = await ConfigStore.create(context(settings), directory)
    settings.value = { ...settings.value, machineName: 'EDITED-ON-THE-PAGE' }
    settings.bump()
    await store.adoptDocument()
    assert.equal(store.current().machineName, 'EDITED-ON-THE-PAGE')
    // The import consumed the document on the first start, so there is nothing
    // left for a later edit to write to.
    const names = await readdir(directory)
    assert.equal(names.filter(name => name.startsWith('dsh-session-sync.json')).length, 1)
  })
})

describe('the first start after the migration', () => {
  it('imports the legacy document into the namespace and archives it', async () => {
    const settings = new FakeSettings({})
    const directory = await home()
    const path = configPath(directory)
    await writeFile(path, JSON.stringify(DOCUMENT, null, 2), 'utf8')

    const store = await ConfigStore.create(context(settings), directory)

    assert.equal(store.current().machineName, 'DESKTOP-TEST')
    assert.equal(store.current().serverUrl, '210.16.120.228:8791')
    assert.deepEqual(store.current().syncSessions, { 'session-one': true })
    // The settings section is the source of truth now, and it holds what the
    // document held.
    assert.equal(settings.value['machineName'], 'DESKTOP-TEST')
    assert.equal(settings.value['serverUrl'], '210.16.120.228:8791')
    // Archived, not deleted: exactly one archive, and the document is gone from
    // its original name.
    const names = await readdir(directory)
    const archived = names.filter(name => name.includes('.imported-') && name.endsWith('.json'))
    assert.equal(archived.length, 1)
    assert.match(archived[0]!, /^dsh-session-sync\.json\.imported-.*\.json$/)
    assert.equal(names.includes('dsh-session-sync.json'), false)
    const kept = JSON.parse(await readFile(join(directory, archived[0]!), 'utf8')) as Record<string, unknown>
    assert.equal(kept['password'], DOCUMENT.password)
  })

  it('leaves the fields the document never carried alone', async () => {
    // The upgrade case that matters: the row already carries a value the document
    // predates, and importing a *normalized* document would blank it.
    const settings = new FakeSettings({ machineName: 'SET-ON-THE-PAGE', listenPort: 9000 })
    const directory = await home()
    await writeFile(configPath(directory), JSON.stringify({
      machineName: 'FROM-THE-DOCUMENT',
      serverUrl: '210.16.120.228:8791',
    }), 'utf8')

    const store = await ConfigStore.create(context(settings), directory)

    assert.equal(store.current().machineName, 'FROM-THE-DOCUMENT')
    assert.equal(store.current().serverUrl, '210.16.120.228:8791')
    assert.equal(store.current().listenPort, 9000)
    const updates = settings.calls.filter(call => call.kind === 'update')
    assert.deepEqual(updates[0]!.patch, {
      machineName: 'FROM-THE-DOCUMENT',
      serverUrl: '210.16.120.228:8791',
    })
  })

  it('imports nothing on the second start', async () => {
    const directory = await home()
    await writeFile(configPath(directory), JSON.stringify(DOCUMENT), 'utf8')
    const first = new FakeSettings({})
    await ConfigStore.create(context(first), directory)
    assert.equal(first.calls.length > 0, true)

    const second = new FakeSettings({ ...first.value })
    const store = await ConfigStore.create(context(second), directory)
    assert.deepEqual(second.calls, [])
    assert.equal(store.current().machineName, 'DESKTOP-TEST')
    assert.deepEqual(store.current().syncSessions, DOCUMENT.syncSessions)
  })

  it('keeps the document when the import cannot be written', async () => {
    // A refused write must not consume the file: the next start has to be able to
    // try again, and the user's settings must still be somewhere.
    const settings = new FakeSettings({})
    settings.update = async () => { throw new Error('settings are read-only') }
    const directory = await home()
    await writeFile(configPath(directory), JSON.stringify(DOCUMENT), 'utf8')

    const store = await ConfigStore.create(context(settings), directory)

    const names = await readdir(directory)
    assert.equal(names.includes('dsh-session-sync.json'), true)
    assert.equal(names.some(name => name.includes('.imported-')), false)
    // The engine still starts, on the file the import could not move — booting on
    // defaults would take the machine off the air over a write nobody saw fail.
    assert.equal(store.current().machineName, 'DESKTOP-TEST')
  })

  it('imports on the start after a failed one', async () => {
    const directory = await home()
    await writeFile(configPath(directory), JSON.stringify(DOCUMENT), 'utf8')
    const broken = new FakeSettings({})
    broken.update = async () => { throw new Error('settings are read-only') }
    await ConfigStore.create(context(broken), directory)

    const working = new FakeSettings({})
    const store = await ConfigStore.create(context(working), directory)

    assert.equal(working.calls.length > 0, true)
    assert.equal(store.current().machineName, 'DESKTOP-TEST')
    const names = await readdir(directory)
    assert.equal(names.includes('dsh-session-sync.json'), false)
    assert.equal(names.filter(name => name.includes('.imported-')).length, 1)
  })

  it('names the archive after the document it came from', async () => {
    const path = archivePath('C:\\dsh-home', new Date('2026-03-04T05:06:07.008Z'))
    assert.equal(path, 'C:\\dsh-home\\dsh-session-sync.json.imported-2026-03-04T05-06-07-008Z.json')
  })

  it('starts on the file when the namespace has no configurable row', async () => {
    // `settings` is mounted, but this plugin is not in the profile's patch: every
    // write would fail with "no configurable plugin entry", so the file is the
    // store and it must not be archived.
    const settings = new FakeSettings({})
    settings.describe = () => []
    const directory = await home()
    const path = configPath(directory)
    await writeFile(path, JSON.stringify(DOCUMENT), 'utf8')

    const store = await ConfigStore.create(context(settings), directory)
    const next = await store.patch({ machineName: 'STILL-THE-FILE' })

    assert.equal(next.machineName, 'STILL-THE-FILE')
    const reloaded = await loadConfig(directory, 'fallback')
    assert.equal(reloaded.machineName, 'STILL-THE-FILE')
    const names = await readdir(directory)
    assert.equal(names.includes('dsh-session-sync.json'), true)
    assert.equal(names.some(name => name.includes('.imported-')), false)
  })
})

describe('a composition with no settings service', () => {
  it('loads from the JSON document and writes back to it', async () => {
    const directory = await home()
    await writeFile(configPath(directory), JSON.stringify(DOCUMENT), 'utf8')
    const store = await ConfigStore.create(context(undefined), directory)
    assert.deepEqual(store.current(), DOCUMENT)

    const next = await store.patch({
      machineName: 'FILE-MODE',
      sessionSync: { sessionId: 'session-two', synced: true },
    })
    assert.equal(next.machineName, 'FILE-MODE')
    assert.deepEqual(next.syncSessions, { 'session-one': true, 'session-two': true })
    // The whole-document atomic write is the fallback's write path, and what it
    // wrote has to be what a later load reads.
    assert.deepEqual(await loadConfig(directory, 'fallback'), next)
    const names = await readdir(directory)
    assert.equal(names.some(name => name.includes('.imported-')), false)
  })

  it('starts from defaults with no document at all', async () => {
    const store = await ConfigStore.create(context(undefined), await home())
    assert.deepEqual(store.current(), defaultConfig(store.current().machineName))
  })

  it('ignores a service that is not the settings service', async () => {
    // `ctx.get('settings')` is untyped at this boundary, so a foreign object must
    // read as "no settings layer" rather than as a crash on the first probe.
    const store = await ConfigStore.create(context({ nope: true }), await home())
    assert.deepEqual(store.current(), defaultConfig(store.current().machineName))
  })
})
