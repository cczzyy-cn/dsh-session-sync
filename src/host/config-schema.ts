/**
 * The plugin's configuration, declared as a DSH Host `Config`.
 *
 * Declaring this is what makes the DSH Plugins page own these settings: the
 * Loader validates the row's `config` against this schema, and the `settings`
 * service projects the volatile fields into a generated form. The document the
 * plugin used to keep in the Harness home is now only an import source and a
 * fallback (see `config-store.ts`).
 *
 * Two rules from the settings service shape every line here:
 *
 *  - **every field is `.volatile()`**, because that is what makes a form edit
 *    apply to the running plugin without a remount. A non-volatile field is not
 *    merely slower to apply: `SettingsForms.write` refuses a path that is not
 *    volatile, so the page could not save it at all.
 *  - **the per-Session maps are dictionaries, not objects**. A form edit to one
 *    Session addresses `['syncSessions', '<id>']`, and `applyPathOp` walks the
 *    schema by key to find the node it writes through — a fixed-key `object`
 *    would leave that key with no node and the write would be validated against
 *    nothing.
 *
 * `SyncConfig` in `shared/protocol.ts` remains the *engine's* shape, and this
 * schema is deliberately shaped the same way. The two are kept in step by
 * `plainConfig`/`normalizeStoredConfig` in `config-store.ts`, which is the only
 * place either is converted into the other.
 */

/** One Session id to `true`; `schemastery`'s `Dict` is keyed by any string. */
export interface SessionSwitchMap {
  [sessionId: string]: true
}

/** What one `.volatile()` field hands the plugin: a stable, readable reference. */
export interface ConfigField<Value> {
  /** The current value. */
  get(): Value
}

/**
 * The declared shape of `apply`'s second argument.
 *
 * Written out as an interface rather than inferred from the schema, because a
 * `schemastery` schema's output type is not nameable from here — this package
 * resolves no `@deepseek-ai/*` types (see `dsh.ts`), so the declaration has to
 * be spelled.
 *
 * Each field is a reference, not a plain value, and that is the point of
 * `.volatile()`: the runtime hands out one stable wrapper per field and writes
 * a new snapshot into it when a form edit is hot-committed. Code that must see
 * the *current* value calls `.get()` at read time; code that captured a plain
 * value at mount time would keep serving the value the process started with.
 */
export interface Config {
  /** This machine's display name, shown to every peer. */
  machineName: ConfigField<string>
  /** Domain or IP (optionally with scheme and port) of the server this machine publishes to. */
  serverUrl: ConfigField<string>
  /** Whether this instance IS the sync server rather than a publisher. */
  isServer: ConfigField<boolean>
  /** Shared secret both sides must agree on; a settings secret, so no form returns it. */
  password: ConfigField<string>
  /** Interface the sync server binds when `isServer` is on. */
  listenHost: ConfigField<string>
  /** Port the sync server binds when `isServer` is on. */
  listenPort: ConfigField<number>
  /** Per-Session publish switch, keyed by Session id. */
  syncSessions: ConfigField<SessionSwitchMap>
  /** Per-Session switch allowing a console elsewhere to decide this machine's approvals. */
  approveSessions: ConfigField<SessionSwitchMap>
}

/**
 * The `schemastery` builder surface this module uses.
 *
 * Structural, for the same reason `dsh.ts` declares the Host services
 * structurally: `@deepseek-ai/schemastery` is a workspace package of DSH, so a
 * real import would not resolve from this repository's sources, and the value
 * import that the Host half genuinely needs (for `apply`) is declared as an
 * external in `tsdown.config.ts` instead.
 *
 * The fluent methods return the schema itself, and the schema is declared as
 * accepting the value type it produces so that a chain typechecks when the
 * interface above names the field.
 */
export interface ConfigSchema<Value = unknown> {
  /** A dictionary keyed by any string, with `inner` validating each value. */
  dict<Item>(inner: ConfigSchema<Item>): ConfigSchema<{ [key: string]: Item }>
  /** Attach a docs/form description. */
  description(text: string): ConfigSchema<Value>
  /** Apply to the running plugin without a remount. */
  volatile(): ConfigSchema<Value>
  /** Mark a field as a secret: forms read a `set` flag instead of the value. */
  role(role: string, extra?: unknown): ConfigSchema<Value>
  /** A schema for exactly one value. */
  const<Item>(value: Item): ConfigSchema<Item>
  /** Merge the localizable schema description. */
  default(value: Value): ConfigSchema<Value>
}

/** A `schemastery` schema for a string. */
export type StringSchema = ConfigSchema<string>

/** A `schemastery` schema for a number. */
export type NumberSchema = ConfigSchema<number>

/** A `schemastery` schema for a boolean. */
export type BooleanSchema = ConfigSchema<boolean>

/** The `schemastery` object builder, whose fields are the interface above. */
export interface ConfigSchemaModule {
  /** Build a schema whose fields are named by `fields`. */
  object(fields: Record<string, ConfigSchema>): ConfigSchema
  /** A plain string. */
  string(): StringSchema
  /** A number. */
  number(): NumberSchema
  /** A boolean. */
  boolean(): BooleanSchema
  /** Exactly one value. */
  const<Value>(value: Value): ConfigSchema<Value>
}

/**
 * Build the plugin's `Config` schema.
 *
 * A factory rather than a module-level constant because the schema builder is a
 * runtime value the Host half receives as an import: `src/index.ts` calls this
 * once, where the import is in scope, and `src/host/config-store.ts` never needs
 * the builder at all.
 * @param Schema - the `schemastery` module.
 * @returns the plugin's `Config` schema, ready to export.
 */
export function buildConfigSchema(Schema: ConfigSchemaModule): ConfigSchema {
  /** One `true`-valued switch map, shared by both per-Session fields. */
  const switches = (): ConfigSchema => Schema.dict(Schema.const(true)).volatile()
  return Schema.object({
    machineName: Schema.string()
      .description('Name this machine is shown under to every other machine.')
      .volatile(),
    serverUrl: Schema.string()
      .description('Address of the sync server this machine publishes to; host, host:port, or a full URL.')
      .volatile(),
    isServer: Schema.boolean()
      .description('Serve as the sync server instead of publishing to one.')
      .volatile(),
    password: Schema.string()
      .description('Shared secret both sides must agree on.')
      .role('secret')
      .volatile(),
    listenHost: Schema.string()
      .description('Interface the sync server binds when this machine is the server.')
      .volatile(),
    listenPort: Schema.number()
      .description('Port the sync server binds when this machine is the server.')
      .default(8791)
      .volatile(),
    syncSessions: switches()
      .description('Per-Session publish switch, keyed by Session id; only `true` counts.'),
    approveSessions: switches()
      .description('Sessions whose approvals a console on another machine may decide.'),
  })
}
