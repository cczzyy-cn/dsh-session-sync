/**
 * Where the configuration actually lives, and how a write reaches it.
 *
 * There are two stores, and the plugin prefers the first:
 *
 *  1. **The DSH settings document** — the Loader row's `config:` mapping in the
 *     profile patch, owned by `@deepseek-ai/dsh-config-editor` and surfaced by the
 *     `settings` service on the Plugins page. This is the single source of truth
 *     whenever the row exists.
 *  2. **The plugin's own JSON document**, `$DSH_HOME/dsh-session-sync.json`. It is
 *     kept as a *fallback* for a composition without a settings layer — the plugin
 *     must still work there — and as the one-time *import* source for an existing
 *     installation, after which it is renamed aside rather than deleted.
 *
 * Why the indirection is worth it: `settings` is optional, and it may be mounted
 * with no configurable row for this plugin at all. So the choice cannot be made
 * once at build time; it is made at start-up and re-made on every access, and it
 * degrades to the file without losing whatever the file says. A store that could
 * only talk to settings would be broken in a composition without one; a store that
 * could only talk to the file is what this migration exists to replace.
 *
 * This module is also the only place the declared `Config` shape (fields behind
 * `.volatile()` references, dictionaries of `true`) is converted to and from the
 * engine's `SyncConfig` and the JSON values the settings service stores.
 */
import { readFile, rename, stat } from 'node:fs/promises'
import { hostname } from 'node:os'
import {
  defaultConfig,
  normalizeConfig,
  type ConfigPatch,
  type SyncConfig,
} from '../shared/protocol.ts'
import { configPath, loadConfig, saveConfig } from './config.ts'

/** The settings namespace of this plugin: the Loader row's patch id. */
export const SETTINGS_NAMESPACE = 'session-sync'

/**
 * One `syncSessions`/`approveSessions` entry.
 *
 * `undefined` means "no mark". A Session that was never opted in has no entry at
 * all, and an entry recording `false` would be a mark the engine has to ignore —
 * which is why {@link switchChanges} treats present-as-`false` and absent alike.
 */
export type SessionSwitchMap = Record<string, true | undefined>

/** One path-addressed edit to a settings namespace's user section. */
export type SettingsPathOp =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }

/**
 * One entry of `settings.describe()`.
 *
 * Structural, and only the members this plugin reads. `value` is the *resolved,
 * unredacted* section: schema defaults under the composition base under the user
 * layer. `revision` is what a write must send back as `expectedRevision`, so a
 * concurrent edit is refused rather than clobbered.
 */
export interface SettingsDescriptorLike {
  ns: string
  value: unknown
  revision: number
}

/** The `settings` Host service, declared only to the depth this plugin uses it. */
export interface SettingsServiceLike {
  /**
   * Read every configurable entry with its live values.
   * @param options - `redactSecrets` replaces a secret with a `set` flag; this
   *   plugin reads the real section, so it never asks for that.
   */
  describe(options?: { redactSecrets?: boolean }): SettingsDescriptorLike[]
  /**
   * Merge fields into an entry's config.
   * @param ns - profile entry id.
   * @param patch - the fields to merge.
   * @param expectedRevision - revision the caller read; a mismatch is refused.
   */
  update(ns: string, patch: object, expectedRevision?: number): Promise<void>
  /**
   * Apply path-addressed edits without restating the whole section.
   * @param ns - profile entry id.
   * @param ops - ordered edits; `unset` on an object member removes the member.
   * @param expectedRevision - revision the caller read; a mismatch is refused.
   */
  mutate(ns: string, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void>
}

/** The slice of the Host context this module needs. */
export interface ConfigHostLike {
  readonly logger: { info(message: string): void; warn(message: string): void }
  /** Read a framework-provided service without declaring a hard dependency. */
  get(name: string): unknown
}

/** One switch edit: set the mark, or remove it. */
interface SwitchChange {
  sessionId: string
  on: boolean
}

/** The precisely-known part of a patch, with its no-op cases already resolved. */
export interface PlannedPatch {
  /** Scalar fields to change; empty when the patch only moves switches. */
  scalars: Partial<SyncConfig>
  syncSessions: SwitchChange[]
  approveSessions: SwitchChange[]
}

/** Read one `.volatile()` field reference, or a plain value. */
function readField(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const candidate = value as { get?: unknown }
  return typeof candidate.get === 'function' ? (candidate.get as () => unknown)() : value
}

/** A required, non-blank string. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

/** A usable TCP port. */
function port(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 65_536 ? value : undefined
}

/** Human-readable one-line failure text. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Whether a path exists at all; any error counts as "no". */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Project the declared `Config` into the engine's plain shape.
 *
 * Each declared field arrives as a `.volatile()` reference, so it is read through
 * `.get()` at this moment; every absent or blank field falls through to
 * {@link normalizeConfig}'s defaults, exactly as a hand-written document would. A
 * value captured here is a snapshot — the settings path re-reads on every change.
 * @param config - the validated row config, or undefined when the row has none.
 * @param fallbackMachineName - name to use when nothing supplies one.
 * @returns a complete, engine-shaped configuration.
 */
export function engineConfigFrom(config: unknown, fallbackMachineName: string): SyncConfig {
  const base = defaultConfig(fallbackMachineName)
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return base
  const source = config as Record<string, unknown>
  const read = (name: string): unknown => readField(source[name])
  const switches = (name: string): Record<string, boolean> => {
    const raw = read(name)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
    const result: Record<string, boolean> = {}
    for (const [sessionId, on] of Object.entries(raw as Record<string, unknown>)) {
      if (on === true) result[sessionId] = true
    }
    return result
  }
  const password = read('password')
  return {
    machineName: text(read('machineName')) ?? base.machineName,
    serverUrl: text(read('serverUrl')) ?? base.serverUrl,
    isServer: read('isServer') === true,
    password: typeof password === 'string' ? password : base.password,
    listenHost: text(read('listenHost')) ?? base.listenHost,
    listenPort: port(read('listenPort')) ?? base.listenPort,
    syncSessions: switches('syncSessions'),
    approveSessions: switches('approveSessions'),
  }
}

/**
 * Coerce a value the settings service returned into a complete configuration.
 *
 * `settings.describe()` resolves the section against the schema, so every field
 * the schema declares is already the right shape — but the section can still be
 * short (a row whose `config` is `{}`) or absent, and a *secret* field is declared
 * without a default so that an unset password stays unset. Normalizing rather than
 * trusting is what keeps an incomplete section from becoming an incomplete engine.
 * @param value - one descriptor's `value`.
 * @param fallbackMachineName - name to use when the section carries none.
 * @returns a complete configuration.
 */
export function normalizeStoredConfig(value: unknown, fallbackMachineName: string): SyncConfig {
  return normalizeConfig(value, fallbackMachineName)
}

/**
 * A legacy JSON document, read and normalized.
 *
 * `fields` is not decoration: it is the difference between an import and an
 * overwrite. A document written by an older build carries only the keys that build
 * knew about, and copying a *normalized* document wholesale would write the
 * defaults for every key it never mentioned — so an upgrade that added a field
 * would blank it on the machine that had already set it. Only the keys the
 * document actually carries are imported.
 */
export interface LegacyDocument {
  /** The document's values, complete and normalized. */
  config: SyncConfig
  /** Top-level keys the document actually carried. */
  fields: Set<string>
}

/**
 * Parse a legacy JSON document's contents.
 *
 * Tolerant in both directions: a mark a Windows editor wrote is stripped, and a
 * document that is not JSON at all reads as "nothing to import" rather than as an
 * error that would abort start-up.
 * @param text - the document's contents.
 * @param fallbackMachineName - name to use when the document carries none.
 * @returns the document, or undefined when there is nothing readable in it.
 */
export function readConfigDocument(text: string, fallbackMachineName: string): LegacyDocument | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.charCodeAt(0) === 0xFE_FF ? text.slice(1) : text)
  } catch {
    return undefined
  }
  const fields = new Set<string>(
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? Object.keys(parsed as Record<string, unknown>)
      : [],
  )
  return { config: normalizeConfig(parsed, fallbackMachineName), fields }
}

/**
 * Where a legacy document is moved once it has been imported.
 *
 * Never deleted, and never overwritten: two imports inside one millisecond would
 * otherwise collide, and the second would destroy the only copy of the first.
 * @param home - Harness home directory.
 * @param now - the moment the import ran.
 * @returns the absolute archive path.
 */
export function archivePath(home: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  return `${configPath(home)}.imported-${stamp}.json`
}

/**
 * Decide what a patch actually changes.
 *
 * Two rules live here rather than at the call sites, because both stores must obey
 * them:
 *
 *  - a patch never writes a scalar the caller did not send. The panel sends whole
 *    scalars, but a browser may send any subset, and writing the whole section back
 *    would turn one field's edit into a rewrite of every field — including a
 *    password the sender never received.
 *  - approving an unpublished Session is refused, not stored. The console resolves
 *    a card's arguments from the mirror, so an approval for a Session nobody can
 *    see grants authority to a reader who cannot read it. Un-publishing drops the
 *    grant in the same write, for the same reason.
 * @param previous - the configuration before the patch.
 * @param patch - the fields the caller sent.
 * @returns the changes to persist.
 */
export function planPatch(previous: SyncConfig, patch: ConfigPatch): PlannedPatch {
  const next: SyncConfig = {
    machineName: text(patch.machineName) ?? previous.machineName,
    serverUrl: patch.serverUrl === undefined ? previous.serverUrl : patch.serverUrl.trim(),
    isServer: patch.isServer ?? previous.isServer,
    password: patch.password === undefined ? previous.password : patch.password,
    listenHost: text(patch.listenHost) ?? previous.listenHost,
    listenPort: port(patch.listenPort) ?? previous.listenPort,
    syncSessions: { ...previous.syncSessions },
    approveSessions: { ...previous.approveSessions },
  }
  if (patch.sessionSync !== undefined) {
    if (patch.sessionSync.synced) next.syncSessions[patch.sessionSync.sessionId] = true
    else delete next.syncSessions[patch.sessionSync.sessionId]
  }
  if (patch.sessionSync !== undefined && !patch.sessionSync.synced) {
    // Un-publishing a Session drops its approval opt-in in the same write, whichever
    // patch expressed the un-publish. The console resolves a card's arguments from
    // the mirror, so the grant is unusable the moment the Session stops being
    // published — and leaving it behind would be a switch that reads "on" while
    // doing nothing, which silently arms itself again if the Session is published
    // later. A later `sessionApprovals` entry for a Session that is not published
    // is refused for the same reason.
    delete next.approveSessions[patch.sessionSync.sessionId]
  }
  if (patch.sessionApprovals !== undefined) {
    if (patch.sessionApprovals.approved && next.syncSessions[patch.sessionApprovals.sessionId] === true) {
      next.approveSessions[patch.sessionApprovals.sessionId] = true
    } else {
      delete next.approveSessions[patch.sessionApprovals.sessionId]
    }
  }

  const scalars: Partial<SyncConfig> = {}
  const fields: { key: keyof SyncConfig; sent: boolean }[] = [
    { key: 'machineName', sent: patch.machineName !== undefined },
    { key: 'serverUrl', sent: patch.serverUrl !== undefined },
    { key: 'isServer', sent: patch.isServer !== undefined },
    { key: 'password', sent: patch.password !== undefined },
    { key: 'listenHost', sent: patch.listenHost !== undefined },
    { key: 'listenPort', sent: patch.listenPort !== undefined },
  ]
  for (const field of fields) {
    if (!field.sent) continue
    if (previous[field.key] === next[field.key]) continue
    Object.assign(scalars, { [field.key]: next[field.key] })
  }

  const changes = (before: Record<string, boolean>, after: Record<string, boolean>): SwitchChange[] => {
    const ids = new Set([...Object.keys(before), ...Object.keys(after)])
    const result: SwitchChange[] = []
    for (const sessionId of ids) {
      const was = before[sessionId] === true
      const now = after[sessionId] === true
      if (was !== now) result.push({ sessionId, on: now })
    }
    return result
  }

  return {
    scalars,
    syncSessions: changes(previous.syncSessions, next.syncSessions),
    approveSessions: changes(previous.approveSessions, next.approveSessions),
  }
}

/**
 * The DSH settings document, as this plugin's primary store.
 *
 * The descriptor is cached between reads on purpose: state broadcasts call the
 * engine's `view()` several times a second, and every `describe()` rebuilds every
 * plugin's form. The cache is dropped when the settings service reports this
 * namespace changed — the same event that tells a browser page to re-read it — so
 * an edit on the Plugins page is picked up by the next read, and no read happens
 * that nothing asked for.
 */
export class SettingsDocument {
  private cache: SettingsDescriptorLike | undefined

  /**
   * @param context - the Host context; the service is read from it on every access
   *   because it can be disposed and replaced while this plugin keeps running.
   * @param fallbackMachineName - name to use when the section carries none.
   * @param namespace - the row's patch id; `session-sync` in every real profile.
   */
  constructor(
    private readonly context: ConfigHostLike,
    private readonly fallbackMachineName: string,
    private readonly namespace: string = SETTINGS_NAMESPACE,
  ) {}

  /** The live service, or undefined when the composition no longer mounts one. */
  private service(): SettingsServiceLike | undefined {
    return settingsServiceOf(this.context)
  }

  /** Whether the namespace can still be read and written. */
  async usable(): Promise<boolean> {
    return await this.probe() !== undefined
  }

  /**
   * Confirm the row this document writes to exists, and read what it holds.
   *
   * A composition may mount `settings` while this plugin has no configurable row —
   * a hand-written composition outside a bundle, or a profile whose patch does not
   * carry us. A write would then fail with "no configurable plugin entry", so the
   * absence is discovered here, before the store commits to this path.
   * @returns the descriptor, or undefined when the row is not configurable.
   */
  async probe(): Promise<SettingsDescriptorLike | undefined> {
    return await this.refresh()
  }

  /** Drop the cached descriptor; the next read re-reads it. */
  forgetNs(): void {
    this.cache = undefined
  }

  /** The configuration the last read saw. */
  current(): SyncConfig {
    if (this.cache === undefined) return defaultConfig(this.fallbackMachineName)
    return normalizeStoredConfig(this.cache.value, this.fallbackMachineName)
  }

  /** The revision the last read saw, for the next write's conflict check. */
  private get revision(): number | undefined {
    return this.cache?.revision
  }

  /**
   * Read the namespace again.
   * @returns the descriptor, or undefined when the row is not configurable.
   */
  private async refresh(): Promise<SettingsDescriptorLike | undefined> {
    const settings = this.service()
    if (settings === undefined) {
      this.cache = undefined
      return undefined
    }
    this.cache = settings.describe().find(row => row.ns === this.namespace)
    return this.cache
  }

  /**
   * Read the namespace, re-reading first when a change was reported.
   *
   * Writes read *through* this rather than trusting the cache, and the difference
   * is the whole conflict story: a write that carried the revision this process
   * last happened to see would overwrite a change made on the Plugins page in
   * between, which is exactly what `expectedRevision` exists to refuse. Re-reading
   * costs one form projection per write, and writes are rare.
   * @returns the descriptor, or undefined when the row is not configurable.
   */
  private async fresh(): Promise<SettingsDescriptorLike | undefined> {
    return await this.refresh()
  }

  /**
   * Write one planned patch through the settings service.
   *
   * Scalar fields go through `update` (a merge, and the one call that can express
   * "this field and no other"), and the two per-Session maps go through a single
   * `mutate` that addresses exactly the entries that changed. One `mutate` for both
   * maps rather than one per map: they are two halves of a single intention, and an
   * intervening writer between them would leave a state the user never asked for.
   *
   * Every call carries the revision read immediately before it, so a concurrent
   * edit — from the generated form on the Plugins page, or from `dsh` itself — is
   * refused with a conflict rather than silently overwritten.
   * @param planned - the exact changes to persist.
   * @returns the configuration after the write.
   */
  async write(planned: PlannedPatch): Promise<SyncConfig> {
    const descriptor = await this.refresh()
    if (descriptor === undefined) {
      // Named rather than generic: this is either a composition with no row for us
      // or a row that lost its Config, and the caller's fallback depends on being
      // able to tell "the settings path is unavailable" from "the write was bad".
      throw new Error(`dsh-session-sync: settings namespace "${this.namespace}" is not configurable`)
    }
    if (Object.keys(planned.scalars).length > 0) {
      await this.requireService().update(this.namespace, planned.scalars, descriptor.revision)
      // `update` does not report the new revision, and a second write must carry
      // it. Re-reading is also the only way to see what the merge actually stored.
      await this.requireRefresh()
    }
    const ops: SettingsPathOp[] = []
    for (const change of planned.syncSessions) ops.push(switchOp(['syncSessions'], change))
    for (const change of planned.approveSessions) ops.push(switchOp(['approveSessions'], change))
    if (ops.length > 0) {
      await this.requireService().mutate(this.namespace, ops, this.revision)
      await this.requireRefresh()
    }
    return this.current()
  }

  /**
   * Import a legacy JSON document's configuration into the namespace, once.
   *
   * The row's own `config` is the base the import sits on, not a replacement for
   * it: a field the document carries is written, and a field it does not is left
   * exactly as the row had it. That is what makes a second import — after a crash
   * between the writes and the rename — harmless, and what keeps the migration from
   * blanking a field the user set on the Plugins page before the first start.
   * @param legacy - the document, with the keys it actually carried.
   */
  async importLegacy(legacy: LegacyDocument): Promise<void> {
    await this.refresh()
    if (this.cache === undefined) {
      throw new Error(`dsh-session-sync: settings namespace "${this.namespace}" is not configurable`)
    }
    const current = this.current()
    const scalars: Partial<SyncConfig> = {}
    const fields: (keyof SyncConfig)[] = [
      'machineName', 'serverUrl', 'isServer', 'password', 'listenHost', 'listenPort',
    ]
    for (const field of fields) {
      if (!legacy.fields.has(field)) continue
      if (current[field] === legacy.config[field]) continue
      Object.assign(scalars, { [field]: legacy.config[field] })
    }
    if (Object.keys(scalars).length > 0) {
      await this.requireService().update(this.namespace, scalars, this.revision)
      await this.requireRefresh()
    }
    const ops: SettingsPathOp[] = []
    // Unconditional sets, unlike `planPatch`: an import has no baseline to diff
    // against, and an idempotent set is cheaper to reason about than a diff that
    // must agree with what a previous, possibly interrupted, import stored.
    if (legacy.fields.has('syncSessions')) {
      for (const sessionId of Object.keys(legacy.config.syncSessions)) {
        ops.push({ op: 'set', path: ['syncSessions', sessionId], value: true })
      }
    }
    if (legacy.fields.has('approveSessions')) {
      for (const sessionId of Object.keys(legacy.config.approveSessions)) {
        ops.push({ op: 'set', path: ['approveSessions', sessionId], value: true })
      }
    }
    if (ops.length > 0) {
      await this.requireService().mutate(this.namespace, ops, this.revision)
    }
    await this.requireRefresh()
  }

  /** The live service, refusing to write when the composition no longer mounts one. */
  private requireService(): SettingsServiceLike {
    const settings = this.service()
    if (settings === undefined) {
      throw new Error(`dsh-session-sync: settings service is no longer available for "${this.namespace}"`)
    }
    return settings
  }

  /** Re-read the namespace, refusing to continue when the row has gone. */
  private async requireRefresh(): Promise<void> {
    if (await this.refresh() === undefined) {
      throw new Error(`dsh-session-sync: settings namespace "${this.namespace}" disappeared mid-write`)
    }
  }
}

/** One `set`/`unset` op for a per-Session switch. */
function switchOp(parent: readonly string[], change: SwitchChange): SettingsPathOp {
  const path = [...parent, change.sessionId]
  return change.on ? { op: 'set', path, value: true } : { op: 'unset', path }
}

/** Read the `settings` service, if this composition mounts one. */
export function settingsServiceOf(ctx: ConfigHostLike): SettingsServiceLike | undefined {
  const service = ctx.get('settings')
  if (typeof service !== 'object' || service === null) return undefined
  const candidate = service as Partial<SettingsServiceLike>
  if (typeof candidate.describe !== 'function') return undefined
  if (typeof candidate.update !== 'function') return undefined
  if (typeof candidate.mutate !== 'function') return undefined
  return candidate as SettingsServiceLike
}

/**
 * Move a legacy document's settings into the namespace, then archive the document.
 *
 * The order matters, and it is the opposite of what "archive" suggests:
 *
 *  1. read the document — unreadable means nothing to do, and the file stays;
 *  2. write every value into the namespace and let the service confirm it stored
 *     them (a rejected write leaves the file untouched, so the next start retries);
 *  3. **only then** rename the document to `<name>.imported-<timestamp>.json`.
 *
 * A crash between (2) and (3) therefore repeats a write that is already there,
 * which is harmless because the import is idempotent. A crash *during* (2) leaves
 * the document exactly as the user wrote it, which is the one outcome that must not
 * lose their settings. The archive is never deleted and never overwritten.
 * @param ctx - the Host context, for the one log line.
 * @param home - Harness home directory.
 * @param document - the settings document to import into.
 * @param now - the moment of the import; injectable so a test can name its archive.
 * @returns the archive path when an import happened, otherwise undefined.
 */
export async function importLegacyDocument(
  ctx: ConfigHostLike,
  home: string,
  document: SettingsDocument,
  now: Date = new Date(),
): Promise<string | undefined> {
  const path = configPath(home)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    // No document is the ordinary case on every start after the first.
    return undefined
  }
  const legacy = readConfigDocument(text, hostname())
  if (legacy === undefined) {
    ctx.logger.warn(`dsh-session-sync: ${path} is not readable as JSON; left in place, using settings as configured`)
    return undefined
  }
  try {
    await document.importLegacy(legacy)
  } catch (error: unknown) {
    ctx.logger.warn(`dsh-session-sync: could not import ${path} into settings; left in place for the next start: ${describeError(error)}`)
    return undefined
  }
  const archive = archivePath(home, now)
  try {
    await rename(path, archive)
  } catch (error: unknown) {
    // The import is already durable and idempotent, so the plugin starts normally
    // and the next start repeats both steps; failing here would refuse to start
    // over a file the user's settings no longer depend on.
    ctx.logger.warn(`dsh-session-sync: imported ${path} but could not archive it: ${describeError(error)}`)
    return undefined
  }
  ctx.logger.info(`dsh-session-sync: imported ${path} into settings and archived it as ${archive}`)
  return archive
}

/**
 * The plugin's own JSON document, as the fallback store.
 *
 * The baseline it patches from is the configuration in force, not whatever the
 * file happens to hold. That distinction matters on a machine that has already
 * migrated: the file was archived at import time, so re-reading it would find
 * nothing and a single form edit would write *defaults* over the user's settings.
 */
class FileStore {
  constructor(
    private readonly home: string,
    private baseline: SyncConfig,
  ) {}

  current(): SyncConfig {
    return this.baseline
  }

  /** Replace the baseline with the configuration now in force. */
  adopt(config: SyncConfig): void {
    this.baseline = config
  }

  /**
   * Write the patched configuration as one atomic whole-document write.
   *
   * The whole-document write is kept only here. The settings service owns its own
   * durability, and routing a form edit through the JSON file as well would be two
   * sources of truth pretending to be one.
   * @param patch - the fields to change; absent fields keep their value.
   * @returns the complete configuration after the write.
   */
  async patch(patch: ConfigPatch): Promise<SyncConfig> {
    const next = applyPlan(this.baseline, planPatch(this.baseline, patch))
    await saveConfig(this.home, next)
    this.baseline = next
    return this.baseline
  }
}

/**
 * The engine's configuration, wherever it lives.
 *
 * One holder for both paths, so the engine reads and writes one object and never
 * learns which store answered. The settings document is preferred when it is
 * usable; the JSON document is both the fallback and what a settings-enabled start
 * reads once, for the migration.
 */
export class ConfigStore {
  private currentConfig: SyncConfig
  /** Always present: the write path when there is no settings document. */
  private readonly file: FileStore

  private constructor(
    private readonly home: string,
    initial: SyncConfig,
    /** Absent in a composition with no usable settings document. */
    private readonly document: SettingsDocument | undefined,
  ) {
    this.currentConfig = initial
    this.file = new FileStore(home, initial)
  }

  /**
   * Resolve the store to use and, on the first settings-enabled start, migrate.
   *
   * The order is: the settings row (when the Loader validated a config for it and
   * the row is configurable) → the plugin's JSON document → defaults. The middle
   * step is why a failure here is not fatal: a composition that mounts no
   * `settings` service, or one with no row for this plugin, must keep working from
   * the file it has always used.
   * @param ctx - the Host context, which may carry `settings`.
   * @param home - Harness home directory, for the fallback document.
   * @param declared - the validated row config, when the Loader supplied one.
   * @returns the store, holding the configuration to start from.
   */
  static async create(ctx: ConfigHostLike, home: string, declared?: unknown): Promise<ConfigStore> {
    const fallbackMachineName = hostname()
    // Read the file first, and note whether there was one at all. The *presence* is
    // what matters below, and it cannot be inferred from the values: a machine whose
    // settings really are all defaults and a machine that has no document yet read
    // identically, and only the second may fall back to a declared config.
    const fileValues = await loadConfig(home, fallbackMachineName)
    const hasFile = await exists(configPath(home))
    let document: SettingsDocument | undefined
    if (settingsServiceOf(ctx) !== undefined) {
      const candidate = new SettingsDocument(ctx, fallbackMachineName)
      try {
        if (await candidate.usable()) document = candidate
      } catch (error: unknown) {
        // A `settings` service that cannot describe us is not a reason to refuse to
        // start: the JSON document is the fallback this plugin has always had.
        ctx.logger.warn(`dsh-session-sync: settings unavailable, using the JSON document: ${describeError(error)}`)
      }
    }
    if (document === undefined) return new ConfigStore(home, fileValues, undefined)

    // One-time import, then archive. Doing it here — inside store creation, before
    // the engine starts — is what makes the imported values the values the engine
    // boots with, rather than ones it picks up a moment later.
    const imported = await importLegacyDocument(ctx, home, document)
    // What the engine starts on, in order of authority:
    //
    //  1. the settings section, which is the source of truth — and the *resolved*
    //     one, not the row config this function was handed. `apply` receives the
    //     config the Loader validated at mount, and an import's `settings.update`
    //     reaches the running plugin through a hot commit that has not necessarily
    //     run yet, so the row config can be a moment behind. Reading the section is
    //     the same source with no ordering question attached.
    //  2. the file, when there is one the import could not consume. Booting on
    //     defaults there would take the machine off the air over a write the
    //     operator never saw fail, from a document sitting right there.
    //  3. what the Loader declared, as a last resort.
    let values = document.current()
    if (imported === undefined && hasFile) {
      values = declared === undefined ? fileValues : engineConfigFrom(declared, fallbackMachineName)
    }
    return new ConfigStore(home, values, document)
  }

  /** The configuration in force. */
  current(): SyncConfig {
    return this.currentConfig
  }

  /**
   * Merge one partial write into whichever store is live.
   *
   * A patch is planned against the values in force and then handed to the settings
   * path, which addresses exactly the fields that changed. When there is no
   * settings document — or it has gone — the same plan is applied to the JSON
   * document in one atomic whole-document write.
   * @param patch - the fields to change; absent fields keep their value.
   * @returns the configuration after the write.
   */
  async patch(patch: ConfigPatch): Promise<SyncConfig> {
    const planned = planPatch(this.currentConfig, patch)
    const document = await this.usableDocument()
    if (document === undefined) {
      this.currentConfig = await this.file.patch(patch)
      return this.currentConfig
    }
    try {
      this.currentConfig = await document.write(planned)
    } catch (error: unknown) {
      // The scalar half of a two-call write may already have landed before the
      // switch half failed. Reading the document back is what keeps memory and
      // storage from disagreeing about what the user just asked for; the error
      // still propagates, because the caller's patch did not fully apply.
      try {
        await document.probe()
        this.currentConfig = document.current()
      } catch {
        // The document is gone as well, so there is nothing left to sync with.
      }
      // Whatever landed is now the baseline the fallback store would patch from, so
      // a write that half-succeeded cannot be reverted by the next one.
      this.remember()
      throw error
    }
    this.remember()
    return this.currentConfig
  }

  /**
   * Re-read the settings document and adopt what it now says.
   *
   * Called when the settings service reports this namespace changed, which is how
   * an edit made on the Plugins page — or by `dsh` itself — reaches the engine
   * without a restart. A document that is gone leaves the last known values in
   * place: the plugin keeps running on what it had rather than resetting every
   * setting to a default.
   */
  async adoptDocument(): Promise<void> {
    const document = await this.usableDocument()
    if (document === undefined) return
    try {
      await document.probe()
      this.currentConfig = document.current()
      this.remember()
    } catch {
      // Same reasoning as above: a namespace that vanished is not a reason to
      // throw away the configuration the engine is already running with.
    }
  }

  /** Forget the cached descriptor, so the next read re-reads it. */
  forgetDocument(): void {
    this.document?.forgetNs()
  }

  /**
   * Hand the configuration in force to the fallback store as its baseline.
   *
   * Without this the fallback would still be patching from the values this process
   * started with, so a settings service that went away would make the next edit
   * silently revert everything the user changed since.
   */
  private remember(): void {
    this.file.adopt(this.currentConfig)
  }

  /** The settings document, when there is one and it is still readable. */
  private async usableDocument(): Promise<SettingsDocument | undefined> {
    const document = this.document
    if (document === undefined) return undefined
    try {
      if (await document.usable()) return document
    } catch {
      // Falls through to the JSON document, which is the documented degradation.
    }
    // Not forgotten: a settings service that comes back should be preferred again,
    // and `usable()` is cheap enough to re-ask on the next write.
    return undefined
  }
}

/** Apply a planned patch to a configuration without touching any store. */
export function applyPlan(previous: SyncConfig, planned: PlannedPatch): SyncConfig {
  const next: SyncConfig = {
    ...previous,
    ...planned.scalars,
    syncSessions: { ...previous.syncSessions },
    approveSessions: { ...previous.approveSessions },
  }
  for (const change of planned.syncSessions) {
    if (change.on) next.syncSessions[change.sessionId] = true
    else delete next.syncSessions[change.sessionId]
  }
  for (const change of planned.approveSessions) {
    if (change.on) next.approveSessions[change.sessionId] = true
    else delete next.approveSessions[change.sessionId]
  }
  return next
}
