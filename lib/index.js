import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { zstdDecompressSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
//#region src/shared/protocol.ts
/**
* Wire and persisted shapes shared by the Host half, the sync server, and the
* browser half.
*
* Every shape here is plain JSON. The one rule that shapes this file: the Host
* half never hands a live DSH object (a Session, an Agent, a projection) across
* a boundary. It reads the leaf scalars it needs and builds one of these.
*/
/** The transport path prefix every browser-facing route lives under. */
const ROUTE_PREFIX = "/dsh-session-sync";
/** Where the plugin keeps its own persisted configuration inside the Harness home. */
const CONFIG_FILE_NAME = "dsh-session-sync.json";
/** Default listen port of the sync server. */
const DEFAULT_LISTEN_PORT = 8791;
/** Heartbeat/keepalive cadence for both SSE directions. */
const KEEPALIVE_MS = 15e3;
/**
* Largest request body the sync server will read, in bytes.
*
* This is a hard limit, not a preference: a body over it is refused rather than
* buffered, because the alternative is a peer deciding how much memory this
* process uses. It is shared rather than private to the listener because the
* *sender* has to respect it too — one `follow` opening on a long Session is
* megabytes of history, and a sender that hands all of it to one POST is
* refused, retries the same batch, and is refused again forever.
*/
const MAX_BODY_BYTES$1 = 4 * 1024 * 1024;
/**
* Largest one published frame batch may be, in bytes.
*
* Deliberately well under {@link MAX_BODY_BYTES}: the sender's estimate is of
* the event array, while the server measures the whole JSON envelope, and a
* batch that is near the limit on one side of the wire must not be over it on
* the other. Half the limit keeps that disagreement harmless.
*/
const FRAMES_BODY_BYTES = MAX_BODY_BYTES$1 / 2;
/** Shared encoder: this module is also bundled for the browser, where `Buffer` does not exist. */
const utf8 = new TextEncoder();
/** Bytes one serialized event costs, or -1 when it cannot be measured. */
function eventBytes(event) {
	try {
		return utf8.encode(JSON.stringify(event) ?? "").byteLength;
	} catch {
		return -1;
	}
}
/**
* Split one run of events into batches that respect a byte budget and a count.
*
* Order is preserved and nothing is dropped. A single event larger than the
* whole budget still travels alone — refusing to send it would turn a wire limit
* into silent data loss, and an event that big fails at the server with a named
* refusal instead of a size the sender quietly invented.
* @param events - the events to publish, in the order they were observed.
* @param budget - largest serialized event array, in bytes.
* @param countLimit - largest number of events per batch, as a second bound.
* @returns the batches and the size of the largest one.
*/
function batchEvents(events, budget, countLimit) {
	const batches = [];
	let current = [];
	let currentBytes = 0;
	let bytes = 0;
	let size = 0;
	const flush = () => {
		if (current.length === 0) return;
		batches.push(current);
		bytes = Math.max(bytes, currentBytes);
		size = Math.max(size, current.length);
		current = [];
		currentBytes = 0;
	};
	for (const event of events) {
		const eventSize = Math.max(0, eventBytes(event));
		if (current.length > 0 && (currentBytes + eventSize > budget || current.length >= countLimit)) flush();
		current.push(event);
		currentBytes += eventSize;
	}
	flush();
	return {
		batches,
		bytes,
		size
	};
}
/**
* How long a takeover command stays deliverable after the server accepted it.
*
* A prompt is a human act addressed at a Session that may have moved on: a
* command that sat in a queue while the owning machine was asleep must not be
* admitted hours later as if it had just been typed. Both ends enforce this —
* the server retires it and says so, and the origin refuses it even if the
* server's sweep has not run yet.
*/
const COMMAND_TTL_MS = 12e4;
/**
* How long the console keeps offering an open question.
*
* This is the *card's* lifetime, not the asker's. The origin is never waiting on
* the console alone: the local answerer is still in the race (the whole point of
* the two-sided design), so dropping a card late costs nothing but the chance to
* answer it — while keeping it forever would let a console left open overnight
* accumulate questions whose asker finished hours ago.
*/
const QUESTION_TTL_MS = 10 * 6e4;
/**
* How long the console may decide one relayed approval.
*
* Much shorter than a question's, because an approval is not a request for
* information: the machine's tool call is *blocked* on it, and the upstream
* service fails closed when the answerer gives up. A card that outlived the call by
* ten minutes would offer a decision that can no longer be taken — and, worse,
* invite a reader to grant an operation whose context has moved on. Five minutes is
* long enough for a human to read a card and short enough that a stale one dies
* while the caller is still waiting.
*/
const APPROVAL_TTL_MS = 5 * 6e4;
/** Build the config a fresh install starts from. */
function defaultConfig(machineName) {
	return {
		machineName,
		serverUrl: "",
		isServer: false,
		password: "",
		listenHost: "0.0.0.0",
		listenPort: DEFAULT_LISTEN_PORT,
		syncSessions: {},
		approveSessions: {}
	};
}
/**
* Coerce one parsed JSON document into a complete configuration.
* @param raw - the persisted document, or anything else.
* @param fallbackMachineName - name to use when the document carries none.
* @returns a complete configuration with every field of the right type.
*/
function normalizeConfig(raw, fallbackMachineName) {
	const base = defaultConfig(fallbackMachineName);
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return base;
	const source = raw;
	const syncSessions = {};
	const rawSync = source["syncSessions"];
	if (typeof rawSync === "object" && rawSync !== null && !Array.isArray(rawSync)) {
		for (const [sessionId, value] of Object.entries(rawSync)) if (value === true) syncSessions[sessionId] = true;
	}
	const approveSessions = {};
	const rawApprove = source["approveSessions"];
	if (typeof rawApprove === "object" && rawApprove !== null && !Array.isArray(rawApprove)) {
		for (const [sessionId, value] of Object.entries(rawApprove)) if (value === true) approveSessions[sessionId] = true;
	}
	const port = source["listenPort"];
	return {
		machineName: text$1(source["machineName"]) ?? base.machineName,
		serverUrl: text$1(source["serverUrl"]) ?? base.serverUrl,
		isServer: source["isServer"] === true,
		password: text$1(source["password"]) ?? base.password,
		listenHost: text$1(source["listenHost"]) ?? base.listenHost,
		listenPort: typeof port === "number" && Number.isInteger(port) && port > 0 && port < 65536 ? port : base.listenPort,
		syncSessions,
		approveSessions
	};
}
/** Read one optional non-empty string field. */
function text$1(value) {
	return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
/**
* Normalize a user-typed server address into an origin URL.
* A bare host or `host:port` is assumed to speak plain HTTP, which is what a
* LAN or loopback deployment uses; an explicit scheme is preserved so an
* operator behind TLS can say `https://…`.
* @param serverUrl - the configured value.
* @returns the origin to call, without a trailing slash; empty when unset.
*/
function serverOrigin(serverUrl) {
	const trimmed = serverUrl.trim().replace(/\/+$/, "");
	if (trimmed === "") return "";
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	return `http://${trimmed}`;
}
//#endregion
//#region src/host/config.ts
/**
* Configuration persistence.
*
* The plugin owns a small JSON document in the Harness home rather than a
* settings namespace, because two of the five settings are not scalars: the
* per-Session publish switch is a growing map keyed by Session id, and a
* settings-namespace schema would have to describe a dictionary the user never
* edits as text. A document the plugin reads and writes itself keeps the write
* path identical to the read path.
*/
/**
* Resolve the Harness home, honouring `DSH_HOME` and otherwise `~/.dsh`.
* @param environment - process environment; injectable for tests.
* @returns the absolute Harness home directory.
*/
function resolveHome(environment = process.env) {
	const configured = environment["DSH_HOME"];
	if (configured !== void 0 && configured.trim().length > 0) return configured.trim();
	return join(homedir(), ".dsh");
}
/** Path of this plugin's configuration document. */
function configPath(home) {
	return join(home, CONFIG_FILE_NAME);
}
/**
* Read the persisted configuration, falling back to defaults.
* A missing or unreadable document is not an error: a fresh install has none.
* @param home - Harness home directory.
* @param fallbackMachineName - name to use when the document carries none.
* @returns the complete configuration.
*/
async function loadConfig(home, fallbackMachineName) {
	const path = configPath(home);
	let text;
	try {
		text = await readFile(path, "utf8");
	} catch {
		return normalizeConfig(void 0, fallbackMachineName);
	}
	let parsed;
	try {
		parsed = JSON.parse(stripByteOrderMark(text));
	} catch {
		parsed = void 0;
	}
	return normalizeConfig(parsed, fallbackMachineName);
}
/**
* Drop a leading UTF-8 byte order mark.
*
* A document written by a Windows editor — Notepad, or PowerShell's own
* `Set-Content -Encoding UTF8` — routinely starts with one, and `JSON.parse`
* rejects it. Treating that as a corrupt document silently reset every setting
* to its default, which reads as "the plugin forgot my server" rather than as a
* parse error, so the mark is removed instead of trusted not to be there.
* @param text - the file's contents.
* @returns the same text without a leading mark.
*/
function stripByteOrderMark(text) {
	return text.charCodeAt(0) === 65279 ? text.slice(1) : text;
}
/**
* Write the configuration document atomically.
* A rename over the target means a crash mid-write cannot leave a truncated
* document that would silently reset every setting on the next start.
* @param home - Harness home directory.
* @param config - the configuration to persist.
*/
async function saveConfig(home, config) {
	const path = configPath(home);
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid.toString()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	await rename(temporary, path);
}
//#endregion
//#region src/host/config-store.ts
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
/** The settings namespace of this plugin: the Loader row's patch id. */
const SETTINGS_NAMESPACE = "session-sync";
/** Read one `.volatile()` field reference, or a plain value. */
function readField(value) {
	if (typeof value !== "object" || value === null) return value;
	const candidate = value;
	return typeof candidate.get === "function" ? candidate.get() : value;
}
/** A required, non-blank string. */
function text(value) {
	return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
/** A usable TCP port. */
function port(value) {
	return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 65536 ? value : void 0;
}
/** Human-readable one-line failure text. */
function describeError(error) {
	return error instanceof Error ? error.message : String(error);
}
/** Whether a path exists at all; any error counts as "no". */
async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
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
function engineConfigFrom(config, fallbackMachineName) {
	const base = defaultConfig(fallbackMachineName);
	if (typeof config !== "object" || config === null || Array.isArray(config)) return base;
	const source = config;
	const read = (name) => readField(source[name]);
	const switches = (name) => {
		const raw = read(name);
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
		const result = {};
		for (const [sessionId, on] of Object.entries(raw)) if (on === true) result[sessionId] = true;
		return result;
	};
	const password = read("password");
	return {
		machineName: text(read("machineName")) ?? base.machineName,
		serverUrl: text(read("serverUrl")) ?? base.serverUrl,
		isServer: read("isServer") === true,
		password: typeof password === "string" ? password : base.password,
		listenHost: text(read("listenHost")) ?? base.listenHost,
		listenPort: port(read("listenPort")) ?? base.listenPort,
		syncSessions: switches("syncSessions"),
		approveSessions: switches("approveSessions")
	};
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
function normalizeStoredConfig(value, fallbackMachineName) {
	return normalizeConfig(value, fallbackMachineName);
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
function readConfigDocument(text, fallbackMachineName) {
	let parsed;
	try {
		parsed = JSON.parse(text.charCodeAt(0) === 65279 ? text.slice(1) : text);
	} catch {
		return;
	}
	const fields = new Set(typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? Object.keys(parsed) : []);
	return {
		config: normalizeConfig(parsed, fallbackMachineName),
		fields
	};
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
function archivePath(home, now) {
	const stamp = now.toISOString().replace(/[:.]/g, "-");
	return `${configPath(home)}.imported-${stamp}.json`;
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
function planPatch(previous, patch) {
	const next = {
		machineName: text(patch.machineName) ?? previous.machineName,
		serverUrl: patch.serverUrl === void 0 ? previous.serverUrl : patch.serverUrl.trim(),
		isServer: patch.isServer ?? previous.isServer,
		password: patch.password === void 0 ? previous.password : patch.password,
		listenHost: text(patch.listenHost) ?? previous.listenHost,
		listenPort: port(patch.listenPort) ?? previous.listenPort,
		syncSessions: { ...previous.syncSessions },
		approveSessions: { ...previous.approveSessions }
	};
	if (patch.sessionSync !== void 0) if (patch.sessionSync.synced) next.syncSessions[patch.sessionSync.sessionId] = true;
	else delete next.syncSessions[patch.sessionSync.sessionId];
	if (patch.sessionSync !== void 0 && !patch.sessionSync.synced) delete next.approveSessions[patch.sessionSync.sessionId];
	if (patch.sessionApprovals !== void 0) if (patch.sessionApprovals.approved && next.syncSessions[patch.sessionApprovals.sessionId] === true) next.approveSessions[patch.sessionApprovals.sessionId] = true;
	else delete next.approveSessions[patch.sessionApprovals.sessionId];
	const scalars = {};
	const fields = [
		{
			key: "machineName",
			sent: patch.machineName !== void 0
		},
		{
			key: "serverUrl",
			sent: patch.serverUrl !== void 0
		},
		{
			key: "isServer",
			sent: patch.isServer !== void 0
		},
		{
			key: "password",
			sent: patch.password !== void 0
		},
		{
			key: "listenHost",
			sent: patch.listenHost !== void 0
		},
		{
			key: "listenPort",
			sent: patch.listenPort !== void 0
		}
	];
	for (const field of fields) {
		if (!field.sent) continue;
		if (previous[field.key] === next[field.key]) continue;
		Object.assign(scalars, { [field.key]: next[field.key] });
	}
	const changes = (before, after) => {
		const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
		const result = [];
		for (const sessionId of ids) {
			const was = before[sessionId] === true;
			const now = after[sessionId] === true;
			if (was !== now) result.push({
				sessionId,
				on: now
			});
		}
		return result;
	};
	return {
		scalars,
		syncSessions: changes(previous.syncSessions, next.syncSessions),
		approveSessions: changes(previous.approveSessions, next.approveSessions)
	};
}
/**
* The failure after a revision conflict survived the one retry.
*
* Deliberately its own error rather than the service's own object: the message
* carries the upstream sentence — the namespace and both revisions, which is what
* names the reason — and then says that a re-read and a second attempt already
* happened. That second half is the part the reader needs, because it is what
* makes "reload the page" the honest instruction instead of "try again". `code` is
* the same marker the service's own refusal carries, so a caller that classifies
* conflicts still recognises this one.
*/
var SettingsWriteConflictError = class extends Error {
	code = "SETTINGS_CONFLICT";
	/** The revision the second attempt sent. */
	expected;
	/** The revision the namespace stood at when that attempt was refused. */
	actual;
	/**
	* @param ns - the namespace whose write was refused.
	* @param expected - the revision the retry sent.
	* @param actual - the revision now stored.
	*/
	constructor(ns, expected, actual) {
		super(`settings namespace "${ns}" changed since it was read (expected revision ${String(expected)}, now ${String(actual)}); a second attempt with the freshly read revision was refused as well`);
		this.name = "SettingsWriteConflictError";
		this.expected = expected;
		this.actual = actual;
	}
};
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
var SettingsDocument = class {
	context;
	fallbackMachineName;
	namespace;
	cache;
	/**
	* @param context - the Host context; the service is read from it on every access
	*   because it can be disposed and replaced while this plugin keeps running.
	* @param fallbackMachineName - name to use when the section carries none.
	* @param namespace - the row's patch id; `session-sync` in every real profile.
	*/
	constructor(context, fallbackMachineName, namespace = SETTINGS_NAMESPACE) {
		this.context = context;
		this.fallbackMachineName = fallbackMachineName;
		this.namespace = namespace;
	}
	/** The live service, or undefined when the composition no longer mounts one. */
	service() {
		return settingsServiceOf(this.context);
	}
	/** Whether the namespace can still be read and written. */
	async usable() {
		return await this.probe() !== void 0;
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
	async probe() {
		return await this.refresh();
	}
	/** Drop the cached descriptor; the next read re-reads it. */
	forgetNs() {
		this.cache = void 0;
	}
	/** The configuration the last read saw. */
	current() {
		if (this.cache === void 0) return defaultConfig(this.fallbackMachineName);
		return normalizeStoredConfig(this.cache.value, this.fallbackMachineName);
	}
	/** The revision the last read saw, for the next write's conflict check. */
	get revision() {
		return this.cache?.revision;
	}
	/**
	* Read the namespace again.
	* @returns the descriptor, or undefined when the row is not configurable.
	*/
	async refresh() {
		const settings = this.service();
		if (settings === void 0) {
			this.cache = void 0;
			return;
		}
		this.cache = settings.describe().find((row) => row.ns === this.namespace);
		return this.cache;
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
	async fresh() {
		return await this.refresh();
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
	*
	* A refusal that *is* that conflict is retried exactly once with a freshly read
	* revision. Measured on the live deployment: the revision a write carries can go
	* stale between the read that produced it and the service's own comparison —
	* the write takes the profile's file lock first, and an earlier write's hot
	* commit of the row's config can land inside that window — so a save the user
	* asked for was refused, nothing was written, and the only recovery was a page
	* reload. One re-read closes that window; a second conflict is reported instead
	* of retried, because a form seeded from values that are now behind would lose
	* the same race again.
	* @param planned - the exact changes to persist.
	* @returns the configuration after the write.
	*/
	async write(planned) {
		const first = await this.refresh();
		if (first === void 0) throw this.notConfigurable();
		try {
			await this.attempt(planned, first.revision);
		} catch (error) {
			if (settingsConflictOf(error) === void 0) throw error;
			const retry = await this.refresh();
			if (retry === void 0) throw this.notConfigurable();
			try {
				await this.attempt(planned, retry.revision);
			} catch (again) {
				const repeated = settingsConflictOf(again);
				if (repeated === void 0) throw again;
				throw new SettingsWriteConflictError(this.namespace, repeated.expected, repeated.actual);
			}
		}
		return this.current();
	}
	/**
	* One write attempt, with a revision that is current for each of its two calls.
	*
	* `update` does not report the revision it left behind, and the `mutate` that
	* follows must carry it, so the descriptor is re-read between them. Re-reading is
	* also the only way to see what the merge actually stored.
	* @param planned - the exact changes to persist.
	* @param revision - the revision read immediately before this attempt.
	*/
	async attempt(planned, revision) {
		let current = revision;
		if (Object.keys(planned.scalars).length > 0) {
			await this.requireService().update(this.namespace, planned.scalars, current);
			current = await this.requireRefresh();
		}
		const ops = [];
		for (const change of planned.syncSessions) ops.push(switchOp(["syncSessions"], change));
		for (const change of planned.approveSessions) ops.push(switchOp(["approveSessions"], change));
		if (ops.length > 0) {
			await this.requireService().mutate(this.namespace, ops, current);
			await this.requireRefresh();
		}
	}
	/**
	* The one error for "this composition has no configurable row for us".
	*
	* Named rather than generic: this is either a composition with no row for us or a
	* row that lost its Config, and the caller's fallback depends on being able to
	* tell "the settings path is unavailable" from "the write was bad".
	*/
	notConfigurable() {
		return /* @__PURE__ */ new Error(`dsh-session-sync: settings namespace "${this.namespace}" is not configurable`);
	}
	/**
	* Import a legacy JSON document's configuration into the namespace, once.
	*
	* The row's own `config` is the base the import sits on, not a replacement for
	* it: a field the document carries is written, and a field it does not is left
	* exactly as the row had it. That is what makes a second import — after a crash
	* between the writes and the rename — harmless, and what keeps the migration from
	* blanking a field the user set on the Plugins page before the first start.
	*
	* No conflict retry here, unlike {@link write}: nobody is waiting on this save,
	* the write is idempotent, and a refusal leaves the document untouched — so the
	* next start is already the retry (see {@link importLegacyDocument}).
	* @param legacy - the document, with the keys it actually carried.
	*/
	async importLegacy(legacy) {
		await this.refresh();
		if (this.cache === void 0) throw this.notConfigurable();
		const current = this.current();
		const scalars = {};
		for (const field of [
			"machineName",
			"serverUrl",
			"isServer",
			"password",
			"listenHost",
			"listenPort"
		]) {
			if (!legacy.fields.has(field)) continue;
			if (current[field] === legacy.config[field]) continue;
			Object.assign(scalars, { [field]: legacy.config[field] });
		}
		if (Object.keys(scalars).length > 0) {
			await this.requireService().update(this.namespace, scalars, this.revision);
			await this.requireRefresh();
		}
		const ops = [];
		if (legacy.fields.has("syncSessions")) for (const sessionId of Object.keys(legacy.config.syncSessions)) ops.push({
			op: "set",
			path: ["syncSessions", sessionId],
			value: true
		});
		if (legacy.fields.has("approveSessions")) for (const sessionId of Object.keys(legacy.config.approveSessions)) ops.push({
			op: "set",
			path: ["approveSessions", sessionId],
			value: true
		});
		if (ops.length > 0) await this.requireService().mutate(this.namespace, ops, this.revision);
		await this.requireRefresh();
	}
	/** The live service, refusing to write when the composition no longer mounts one. */
	requireService() {
		const settings = this.service();
		if (settings === void 0) throw new Error(`dsh-session-sync: settings service is no longer available for "${this.namespace}"`);
		return settings;
	}
	/** Re-read the namespace, refusing to continue when the row has gone.
	* @returns the revision the descriptor now stands at, for the next call.
	*/
	async requireRefresh() {
		const descriptor = await this.refresh();
		if (descriptor === void 0) throw new Error(`dsh-session-sync: settings namespace "${this.namespace}" disappeared mid-write`);
		return descriptor.revision;
	}
};
/** One `set`/`unset` op for a per-Session switch. */
function switchOp(parent, change) {
	const path = [...parent, change.sessionId];
	return change.on ? {
		op: "set",
		path,
		value: true
	} : {
		op: "unset",
		path
	};
}
/** Read the `settings` service, if this composition mounts one. */
function settingsServiceOf(ctx) {
	const service = ctx.get("settings");
	if (typeof service !== "object" || service === null) return void 0;
	const candidate = service;
	if (typeof candidate.describe !== "function") return void 0;
	if (typeof candidate.update !== "function") return void 0;
	if (typeof candidate.mutate !== "function") return void 0;
	return candidate;
}
/**
* Classify one refusal as a stale-revision conflict, or as something else.
*
* Keyed on `code`, never on the message: the service documents the code as the
* stable marker for this failure, and its sentence is presentation — a plugin that
* matched the wording would start retrying (or stop retrying) the day the wording
* changed, and the two mistakes are not symmetric. `expected` and `actual` are
* required as well, exactly as the shipped settings controller requires them
* (`packages/api/settings-controller/src/index.ts`), because they are what makes a
* conflict reportable and what a caller needs to log.
* @param error - whatever a `settings.update`/`mutate` call threw.
* @returns the conflict, or undefined when the refusal means something else.
*/
function settingsConflictOf(error) {
	if (typeof error !== "object" || error === null) return void 0;
	if (Reflect.get(error, "code") !== "SETTINGS_CONFLICT") return void 0;
	if (typeof Reflect.get(error, "message") !== "string") return void 0;
	if (typeof Reflect.get(error, "expected") !== "number") return void 0;
	if (typeof Reflect.get(error, "actual") !== "number") return void 0;
	return error;
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
async function importLegacyDocument(ctx, home, document, now = /* @__PURE__ */ new Date()) {
	const path = configPath(home);
	let text;
	try {
		text = await readFile(path, "utf8");
	} catch {
		return;
	}
	const legacy = readConfigDocument(text, hostname());
	if (legacy === void 0) {
		ctx.logger.warn(`dsh-session-sync: ${path} is not readable as JSON; left in place, using settings as configured`);
		return;
	}
	try {
		await document.importLegacy(legacy);
	} catch (error) {
		ctx.logger.warn(`dsh-session-sync: could not import ${path} into settings; left in place for the next start: ${describeError(error)}`);
		return;
	}
	const archive = archivePath(home, now);
	try {
		await rename(path, archive);
	} catch (error) {
		ctx.logger.warn(`dsh-session-sync: imported ${path} but could not archive it: ${describeError(error)}`);
		return;
	}
	ctx.logger.info(`dsh-session-sync: imported ${path} into settings and archived it as ${archive}`);
	return archive;
}
/**
* The plugin's own JSON document, as the fallback store.
*
* The baseline it patches from is the configuration in force, not whatever the
* file happens to hold. That distinction matters on a machine that has already
* migrated: the file was archived at import time, so re-reading it would find
* nothing and a single form edit would write *defaults* over the user's settings.
*/
var FileStore = class {
	home;
	baseline;
	constructor(home, baseline) {
		this.home = home;
		this.baseline = baseline;
	}
	current() {
		return this.baseline;
	}
	/** Replace the baseline with the configuration now in force. */
	adopt(config) {
		this.baseline = config;
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
	async patch(patch) {
		const next = applyPlan(this.baseline, planPatch(this.baseline, patch));
		await saveConfig(this.home, next);
		this.baseline = next;
		return this.baseline;
	}
};
/**
* The engine's configuration, wherever it lives.
*
* One holder for both paths, so the engine reads and writes one object and never
* learns which store answered. The settings document is preferred when it is
* usable; the JSON document is both the fallback and what a settings-enabled start
* reads once, for the migration.
*/
var ConfigStore = class ConfigStore {
	home;
	document;
	currentConfig;
	/** Always present: the write path when there is no settings document. */
	file;
	constructor(home, initial, document) {
		this.home = home;
		this.document = document;
		this.currentConfig = initial;
		this.file = new FileStore(home, initial);
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
	static async create(ctx, home, declared) {
		const fallbackMachineName = hostname();
		const fileValues = await loadConfig(home, fallbackMachineName);
		const hasFile = await exists(configPath(home));
		let document;
		if (settingsServiceOf(ctx) !== void 0) {
			const candidate = new SettingsDocument(ctx, fallbackMachineName);
			try {
				if (await candidate.usable()) document = candidate;
			} catch (error) {
				ctx.logger.warn(`dsh-session-sync: settings unavailable, using the JSON document: ${describeError(error)}`);
			}
		}
		if (document === void 0) return new ConfigStore(home, fileValues, void 0);
		const imported = await importLegacyDocument(ctx, home, document);
		let values = document.current();
		if (imported === void 0 && hasFile) values = declared === void 0 ? fileValues : engineConfigFrom(declared, fallbackMachineName);
		return new ConfigStore(home, values, document);
	}
	/** The configuration in force. */
	current() {
		return this.currentConfig;
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
	async patch(patch) {
		const planned = planPatch(this.currentConfig, patch);
		const document = await this.usableDocument();
		if (document === void 0) {
			this.currentConfig = await this.file.patch(patch);
			return this.currentConfig;
		}
		try {
			this.currentConfig = await document.write(planned);
		} catch (error) {
			try {
				await document.probe();
				this.currentConfig = document.current();
			} catch {}
			this.remember();
			throw error;
		}
		this.remember();
		return this.currentConfig;
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
	async adoptDocument() {
		const document = await this.usableDocument();
		if (document === void 0) return;
		try {
			await document.probe();
			this.currentConfig = document.current();
			this.remember();
		} catch {}
	}
	/** Forget the cached descriptor, so the next read re-reads it. */
	forgetDocument() {
		this.document?.forgetNs();
	}
	/**
	* Hand the configuration in force to the fallback store as its baseline.
	*
	* Without this the fallback would still be patching from the values this process
	* started with, so a settings service that went away would make the next edit
	* silently revert everything the user changed since.
	*/
	remember() {
		this.file.adopt(this.currentConfig);
	}
	/** The settings document, when there is one and it is still readable. */
	async usableDocument() {
		const document = this.document;
		if (document === void 0) return void 0;
		try {
			if (await document.usable()) return document;
		} catch {}
	}
};
/** Apply a planned patch to a configuration without touching any store. */
function applyPlan(previous, planned) {
	const next = {
		...previous,
		...planned.scalars,
		syncSessions: { ...previous.syncSessions },
		approveSessions: { ...previous.approveSessions }
	};
	for (const change of planned.syncSessions) if (change.on) next.syncSessions[change.sessionId] = true;
	else delete next.syncSessions[change.sessionId];
	for (const change of planned.approveSessions) if (change.on) next.approveSessions[change.sessionId] = true;
	else delete next.approveSessions[change.sessionId];
	return next;
}
//#endregion
//#region src/host/hub.ts
/**
* The server-side mirror: what every connected origin has published, plus the
* fan-out to browsers watching it.
*
* State is deliberately in-memory. A sync server is a live view of sessions that
* are still running somewhere else; persisting a mirror would mean serving a
* stale copy as if it were current, and the durable copy already exists on the
* origin machine.
*/
/** Upper bound on the events retained per mirrored Session. */
const EVENT_LIMIT = 4e3;
/**
* Events one transcript page carries by default.
*
* A conversation reads from its newest end, so a page comfortably longer than a
* screenful of turns is all a switch needs; anything older is one request away.
* Long enough that a normal Session arrives whole, short enough that the worst
* case stops being the mirror's whole 4,000-event window.
*/
const TRANSCRIPT_WINDOW = 400;
/** Upper bound on commands held for a machine whose origin stream is down. */
const PENDING_LIMIT = 32;
/**
* How long an unacknowledged command waits before it is handed over again.
*
* Short, because the window this covers is the one where a write vanished into a
* stream that was already closing — measured at roughly 300 ms — and because a
* prompt a reader typed is worth re-offering quickly. The command's own two-minute
* TTL is the outer bound; this is the retry cadence inside it.
*/
const RETRY_AFTER_MS = 5e3;
/**
* How many times one command may be re-sent before the hub stops trying.
*
* Bounded so a machine that is up but never acks cannot make the server talk to it
* forever: after this many attempts the TTL is what ends it, and `expired` is
* reported rather than an endless `delivered`.
*/
const MAX_RETRIES = 4;
/** Upper bound on retained command states per machine, newest kept. */
const STATUS_LIMIT = 64;
/**
* Upper bound on questions one machine may have open at the console.
*
* A question is a *live* ask, so this is a runaway guard and not a retention
* policy: a machine that somehow opened a hundred would be a machine nobody is
* answering, and the console is the wrong place to find that out.
*/
const QUESTION_LIMIT = 32;
/**
* Upper bound on approvals one machine may have open at the console.
*
* Lower than a question's would be if approvals were as cheap to forget: each one
* holds a *blocked tool call* on the machine, so a machine with thirty-two of them
* pending is a machine in trouble, and a console showing a wall of permission cards
* is a console whose reader will start approving without reading.
*/
const APPROVAL_LIMIT = 16;
/**
* How long the mirror waits before asking an origin to replay again.
*
* One ask per episode is the goal, but a snapshot can legitimately fail to close
* a hole — the Session may have been un-published here, or the follow may have
* ended inside the replay — and a repair that is never retried would leave the
* mirror broken for the rest of the process's life. A bounded retry costs one
* frame per half minute and always converges once the hole closes.
*/
const RESYNC_RETRY_MS = 3e4;
/**
* Messages one history page spans when a reader asks for older events.
*
* Asking is a round trip through the origin's own log and back over the wire —
* `{kind:'older'}` down, a page read, a POST back — and an event is not a message:
* measured here, one real Session carried roughly six events per message, so a
* fifty-message page delivered under three hundred events. A long Session then
* needs ten times the requests it should, each one queued behind everything else
* that machine is publishing. The origin's own page ceiling is five hundred
* messages, so a reader asks for the whole of it and gets ten times as much per
* click.
*/
const OLDER_PAGE_MESSAGES = 500;
/**
* Messages one hole-repair page spans.
*
* A hole is repaired by re-reading the log around it, so the page is asked for as
* large as the origin will serve: the whole point is to arrive at the missing run
* in as few reads as the hole is deep.
*/
const HOLE_PAGE_MESSAGES = 500;
/** Shortest gap between two history asks for the same Session. */
const OLDER_ASK_FLOOR_MS = 2e3;
/** States a command never leaves; the expiry sweep and acks ignore these. */
const TERMINAL_STATES = [
	"accepted",
	"failed",
	"expired"
];
/** The server-role mirror and its subscribers. */
var SyncHub = class {
	notify;
	stateOf;
	logger;
	timings;
	records = /* @__PURE__ */ new Map();
	/** Sessions whose mirror is incomplete, and when the origin was last asked. */
	gapAsked = /* @__PURE__ */ new Map();
	/** Sessions whose history was last asked for, and when. */
	olderAsked = /* @__PURE__ */ new Map();
	/**
	* @param notify - receives every frame the mirror produces. The owner decides
	*   who is watching, because the same browser stream also carries client-role
	*   status in a process that is not acting as a server at all.
	* @param stateOf - builds the complete browser-facing state. The mirror only
	*   knows the machine list; role, listener, and link facts belong to the
	*   engine. The engine's owner is the one place that can see both, so a state
	*   frame is always assembled there — publishing a partial object here would
	*   silently blank every field this class does not own.
	* @param logger - where an incomplete mirror is reported. Optional so a test
	*   or a headless composition can build a hub that says nothing.
	* @param timings - the two retry floors, injectable so a test does not have to
	*   wait out a production interval to see the second ask.
	*/
	constructor(notify, stateOf, logger, timings = {}) {
		this.notify = notify;
		this.stateOf = stateOf;
		this.logger = logger;
		this.timings = timings;
	}
	/** Shortest gap between two replay asks for one Session. */
	get resyncRetryMs() {
		return this.timings.resyncRetryMs ?? RESYNC_RETRY_MS;
	}
	/** Shortest gap between two reader-driven history asks for one Session. */
	get olderAskFloorMs() {
		return this.timings.olderAskFloorMs ?? OLDER_ASK_FLOOR_MS;
	}
	/**
	* Older-history asks that arrived while their origin's stream was down.
	*
	* Keyed by machine and Session: a second ask for the same page replaces the
	* first, because asking twice for the same thing is the same request.
	*/
	pendingOlder = /* @__PURE__ */ new Map();
	/**
	* Replace one machine's Session index.
	* A Session that disappears from the index is dropped with its events, which
	* is what "stopped syncing" means from here. Because disappearance is the
	* only reset, an origin never has to ask for one — and a fresh record always
	* starts at sequence -1, so a re-enabled Session refills from its own opening
	* snapshot without duplicating anything.
	* @param payload - the machine's current published Session list.
	*/
	publishIndex(payload) {
		const record = this.machine(payload.machineName);
		record.lastSeen = Date.now();
		if (payload.pluginVersion === void 0) delete record.pluginVersion;
		else record.pluginVersion = payload.pluginVersion;
		const seen = /* @__PURE__ */ new Set();
		for (const session of payload.sessions) {
			seen.add(session.sessionId);
			const existing = record.sessions.get(session.sessionId);
			if (existing === void 0) {
				record.sessions.set(session.sessionId, {
					sessionId: session.sessionId,
					title: session.title,
					updatedAt: session.updatedAt,
					running: session.running,
					...session.cwd === void 0 ? {} : { cwd: session.cwd },
					events: [],
					seqs: /* @__PURE__ */ new Set(),
					maxSeq: -1,
					originSeq: reported(session.lastSeq),
					originHasOlder: session.hasOlder === true,
					...session.firstSeq === void 0 ? {} : { originFirstSeq: session.firstSeq },
					...session.stats === void 0 ? {} : { originStats: session.stats }
				});
				continue;
			}
			existing.title = session.title;
			existing.updatedAt = session.updatedAt;
			existing.running = session.running;
			existing.originSeq = reported(session.lastSeq);
			existing.originHasOlder = session.hasOlder === true;
			if (session.firstSeq !== void 0 && (existing.originFirstSeq === void 0 || session.firstSeq < existing.originFirstSeq)) existing.originFirstSeq = session.firstSeq;
			if (session.stats === void 0) delete existing.originStats;
			else existing.originStats = session.stats;
			if (session.cwd === void 0) delete existing.cwd;
			else existing.cwd = session.cwd;
		}
		for (const sessionId of [...record.sessions.keys()]) {
			if (seen.has(sessionId)) continue;
			record.sessions.delete(sessionId);
			this.gapAsked.delete(`${record.machineName}|${sessionId}`);
		}
		for (const session of record.sessions.values()) this.reportGap(record, session);
		this.broadcastState();
	}
	/**
	* Relay one streaming update. Nothing is stored: streaming is presentation,
	* and the durable events that follow are what the mirror keeps.
	* @param machineName - the publishing machine.
	* @param payload - the step's whole text so far for one kind.
	*/
	publishStream(machineName, payload) {
		const record = this.records.get(machineName);
		if (record === void 0) return;
		record.lastSeen = Date.now();
		this.broadcast({
			type: "stream",
			machineName,
			sessionId: payload.sessionId,
			turn: payload.turn,
			step: payload.step,
			kind: payload.kind,
			text: payload.text
		});
	}
	/**
	* Append durable events to one mirrored Session, dropping only what the
	* mirror already holds so a reconnect that replays a window stays idempotent.
	*
	* The Session is created when the index has not listed it yet. A reconnect
	* restarts the origin's follows immediately while its index waits for the
	* next reconcile tick, so a replayed snapshot routinely arrives first;
	* dropping it left an idle Session with an empty transcript until something
	* happened to re-open its follow. The index publish that follows corrects the
	* placeholder's title, and a Session the origin really did stop publishing is
	* removed by that same publish.
	*
	* Dedupe is by membership, never by a high-water mark. The origin flushes
	* batches on a 150 ms timer and the posts were unordered, so a later batch
	* could land first; against a high-water mark that discarded the earlier batch
	* in full — nine contiguous events in one real Session, and the mirror could
	* never be repaired afterwards, because filling a hole means accepting a
	* sequence below the mark. Order of arrival is now irrelevant, and a replay
	* fills whatever a lost batch left behind.
	* @param machineName - publishing machine.
	* @param payload - the Session id and its new events.
	*/
	publishFrames(machineName, payload) {
		const record = this.machine(machineName);
		record.lastSeen = Date.now();
		const session = this.session(record, payload.sessionId);
		const fresh = [];
		for (const event of payload.events) {
			if (session.seqs.has(event.seq)) continue;
			session.seqs.add(event.seq);
			fresh.push(event);
		}
		if (fresh.length === 0) {
			this.reportGap(record, session);
			return;
		}
		fresh.sort((left, right) => left.seq - right.seq);
		const low = fresh[0]?.seq;
		if (low !== void 0 && (session.receivedLow === void 0 || low < session.receivedLow)) session.receivedLow = low;
		session.events.push(...fresh);
		session.events.sort((left, right) => left.seq - right.seq);
		const ceiling = EVENT_LIMIT;
		if (session.events.length > ceiling) for (const dropped of session.events.splice(0, session.events.length - ceiling)) session.seqs.delete(dropped.seq);
		session.maxSeq = fresh.reduce((highest, event) => Math.max(highest, event.seq), session.maxSeq);
		session.updatedAt = Date.now();
		this.broadcast({
			type: "events",
			machineName,
			sessionId: payload.sessionId,
			events: fresh
		});
		this.reportGap(record, session);
	}
	/**
	* Ask again about every mirror that is still incomplete.
	*
	* Detection otherwise rides on arriving batches, and a lost batch is exactly
	* the case where nothing else arrives to trigger it: the first ask would be
	* the only one, and a replay that failed to close the hole would never be
	* repeated. The periodic pass over the mirror is where the retry belongs, so
	* it costs one walk and one frame per half minute while something is broken,
	* and nothing at all while the mirror is whole.
	*/
	sweepGaps() {
		for (const record of this.records.values()) for (const session of record.sessions.values()) {
			this.reportGap(record, session);
			this.fillBelowWindow(record, session);
		}
	}
	/**
	* Name an incomplete mirror, and ask its origin to replay.
	*
	* An incomplete mirror used to be invisible from both ends: the origin
	* believed it had published, the mirror believed it had received, and the only
	* symptom was a conversation that stopped mid-sentence — which read as a
	* display problem for as long as it took to decode the origin's own session
	* file and compare. Now the shortfall is O(1) from the record, the origin is
	* asked to re-open its follow, and a replayed snapshot closes it because
	* membership decides what is new.
	*
	* The ask is repeated on a slow timer for as long as the shortfall survives, and
	* said out loud once per episode. A machine that is away needs neither: its
	* reconnect replays every follow by itself.
	* @param record - the owning machine, which is where the ask goes.
	* @param session - the record just updated.
	*/
	reportGap(record, session) {
		const missing = missingOf(session);
		const key = `${record.machineName}|${session.sessionId}`;
		const now = Date.now();
		if (missing <= 0) {
			this.gapAsked.delete(key);
			return;
		}
		const asked = this.gapAsked.get(key);
		if (asked !== void 0 && now - asked < this.resyncRetryMs) return;
		this.gapAsked.set(key, now);
		const holes = holesOf(session);
		for (const hole of holes) record.origin?.older(session.sessionId, hole.from, HOLE_PAGE_MESSAGES);
		if (asked === void 0) this.logger?.warn(`dsh-session-sync: mirror for "${session.sessionId}" on "${record.machineName}" is missing ${String(missing)} event(s): it holds up to seq ${String(session.maxSeq)}, the origin reports ${String(session.originSeq)}` + (holes.length === 0 ? "; asked that machine to replay the Session" : `; asked for ${String(holes.length)} hole page(s) and a replay`));
		record.origin?.resync(session.sessionId);
	}
	/**
	* Attach one origin's downstream stream and flush what queued while it was away.
	* @param machineName - the connecting machine.
	* @param sink - where commands are written.
	* @returns the detacher, which also drops any command the origin never read.
	*/
	attachOrigin(machineName, sink) {
		const record = this.machine(machineName);
		record.lastSeen = Date.now();
		record.origin = sink;
		this.flushPendingOlder(machineName);
		const now = Date.now();
		const queued = record.pending.splice(0, record.pending.length);
		for (const owed of queued) {
			if (owed.command.expiresAt <= now) {
				this.transition(record, owed.command, "expired");
				continue;
			}
			this.handOver(record, owed);
		}
		this.broadcastState();
		return () => {
			if (record.origin !== sink) return;
			delete record.origin;
			this.broadcastState();
		};
	}
	/**
	* Queue one takeover prompt for a published Session.
	* @param machineName - the machine that owns the Session.
	* @param sessionId - the published Session.
	* @param text - the prompt text.
	* @param from - the requesting machine's display name.
	* @returns the accepted command's id, or why it was refused.
	*/
	submitCommand(machineName, sessionId, text, from) {
		const record = this.records.get(machineName);
		if (record === void 0) return {
			ok: false,
			reason: "unknown machine"
		};
		if (!record.sessions.has(sessionId)) return {
			ok: false,
			reason: "session is not published"
		};
		const trimmed = text.trim();
		if (trimmed === "") return {
			ok: false,
			reason: "empty prompt"
		};
		return this.enqueue(record, {
			commandId: mintId(),
			sessionId,
			kind: "prompt",
			text: trimmed,
			from,
			expiresAt: Date.now() + COMMAND_TTL_MS
		});
	}
	/**
	* Queue the console's answer to one question a machine relayed.
	*
	* An answer rides the prompt lifecycle rather than a channel of its own
	* because it needs exactly what a prompt needs: held while the machine is
	* away, one delivery, a TTL, and an ack that says whether the machine
	* *claimed* it. That last part is the whole feature — the machine claims an
	* answer only while the question is still pending there, so a console that
	* answered after the machine's own human did gets `failed` with the reason,
	* which is the truthful outcome of a race that has already been decided.
	* @param machineName - the machine that asked.
	* @param questionId - the question being answered.
	* @param answers - the console's answers.
	* @param from - the answering console's display name.
	* @returns the accepted command's id, or why it was refused.
	*/
	submitAnswer(machineName, questionId, answers, from) {
		const record = this.records.get(machineName);
		if (record === void 0) return {
			ok: false,
			reason: "unknown machine"
		};
		const question = record.questions.get(questionId);
		if (question === void 0) return {
			ok: false,
			reason: "this question is no longer waiting"
		};
		if (answers.length === 0) return {
			ok: false,
			reason: "an answer must decide something"
		};
		return this.enqueue(record, {
			commandId: mintId(),
			sessionId: question.sessionId,
			kind: "answer",
			questionId,
			answers: answers.map((answer) => ({
				id: answer.id,
				selected: [...answer.selected],
				...answer.custom === void 0 ? {} : { custom: answer.custom }
			})),
			from,
			expiresAt: Date.now() + COMMAND_TTL_MS
		});
	}
	/**
	* Hold one command for a machine and say where it stands.
	* @param record - the owning machine.
	* @param command - the command to deliver or park.
	* @returns the accepted command's id.
	*/
	enqueue(record, command) {
		const owed = {
			command,
			sentAt: 0,
			retries: 0
		};
		record.pending.push(owed);
		if (record.origin === void 0) this.transition(record, command, "queued");
		else this.handOver(record, owed);
		if (record.pending.length > PENDING_LIMIT) for (const dropped of record.pending.splice(0, record.pending.length - PENDING_LIMIT)) this.transition(record, dropped.command, "expired", "the queue for this machine was full");
		return {
			ok: true,
			commandId: command.commandId
		};
	}
	/**
	* Hand one owed command to the machine's stream and record that it went.
	*
	* The write is not proof of arrival — a stream that is closing accepts it locally
	* — so this only marks the attempt. What makes the attempt safe to repeat is the
	* origin's `RecentCommands`: it acks a command id it has already admitted without
	* acting on it twice.
	* @param record - the machine that is owed the command.
	* @param owed - the command and its delivery bookkeeping.
	*/
	handOver(record, owed) {
		const origin = record.origin;
		if (origin === void 0) return;
		origin.send(owed.command);
		owed.sentAt = Date.now();
		owed.retries += 1;
		this.transition(record, owed.command, "delivered", void 0, owed.retries - 1);
	}
	/**
	* Hand over again every command a machine has not acknowledged.
	*
	* This is the half of the delivery rule a write cannot provide. The other half is
	* {@link SyncHub.ackCommand}: a command is owed until the machine says it acted on
	* it, so a write lost inside a closing stream is repaired on the next pass instead
	* of being recorded as delivered and forgotten.
	* @param now - the clock, injectable so a test can age a command without waiting.
	*/
	retryCommands(now = Date.now()) {
		for (const record of this.records.values()) {
			if (record.origin === void 0) continue;
			for (const owed of [...record.pending]) {
				if (owed.sentAt === 0) continue;
				if (owed.retries > MAX_RETRIES) continue;
				if (now - owed.sentAt < RETRY_AFTER_MS) continue;
				this.handOver(record, owed);
			}
		}
	}
	/**
	* Offer one relayed question to the browsers watching this server.
	* @param machineName - the machine that asked.
	* @param payload - the question, its Session, and its TTL.
	*/
	openQuestion(machineName, payload) {
		const record = this.records.get(machineName);
		if (record === void 0) return;
		record.lastSeen = Date.now();
		if (!record.sessions.has(payload.sessionId)) return;
		const view = {
			machineName,
			sessionId: payload.sessionId,
			questionId: payload.questionId,
			questions: payload.questions,
			openedAt: Date.now(),
			expiresAt: payload.expiresAt
		};
		record.questions.set(payload.questionId, view);
		while (record.questions.size > QUESTION_LIMIT) {
			const oldest = record.questions.keys().next();
			if (oldest.done === true || oldest.value === payload.questionId) break;
			this.closeQuestion(machineName, {
				sessionId: record.questions.get(oldest.value)?.sessionId ?? payload.sessionId,
				questionId: oldest.value,
				outcome: "expired"
			});
		}
		this.broadcast({
			type: "question",
			question: view
		});
	}
	/**
	* Stop offering one question, and tell every watching browser why.
	* @param machineName - the machine that asked.
	* @param payload - the question and the outcome to report.
	*/
	closeQuestion(machineName, payload) {
		const record = this.records.get(machineName);
		const view = record?.questions.get(payload.questionId);
		if (record === void 0 || view === void 0) return;
		record.questions.delete(payload.questionId);
		this.broadcast({
			type: "question",
			question: {
				...view,
				closed: payload.outcome
			}
		});
		this.broadcastState();
	}
	/** Questions the console may still answer, oldest ask first. */
	questions() {
		return [...this.records.values()].flatMap((record) => [...record.questions.values()]).sort((left, right) => left.openedAt - right.openedAt);
	}
	/**
	* Retire the questions that stopped being answerable while nobody was looking.
	*
	* Run on the same periodic pass as the command sweep, and for the same reason:
	* nothing else would ever revisit them. A question outlives its usefulness two
	* ways — its TTL passes, or the machine that asked stops appearing at all — and
	* a card left on screen for either is a card offering a decision that can no
	* longer be taken.
	*/
	sweepQuestions(now = Date.now()) {
		for (const record of this.records.values()) {
			const offline = record.origin === void 0 && now - record.lastSeen >= 45e3;
			for (const view of [...record.questions.values()]) {
				if (view.expiresAt > now && !offline) continue;
				this.closeQuestion(record.machineName, {
					sessionId: view.sessionId,
					questionId: view.questionId,
					outcome: offline ? "offline" : "expired"
				});
			}
		}
	}
	/**
	* Decide one relayed approval as the console, and hand the decision to the machine.
	*
	* The mirror image of {@link submitAnswer}, with one difference that matters: a
	* decision here is a *permission*. The hub does not judge it — the machine that
	* owns the call does, in `ApprovalRelay.claim`, against a request it is still
	* waiting on — so what this method guarantees is only that the console decided
	* something the server was actually offering, and that the machine's own refusal
	* comes back as a closed card rather than a stuck one.
	* @param machineName - the machine whose approval it is.
	* @param approvalId - the approval the console decided.
	* @param decision - allow once, or reject.
	* @param from - the deciding console's display name.
	* @returns the accepted command's id, or why it was refused.
	*/
	submitApproval(machineName, approvalId, decision, from) {
		const record = this.records.get(machineName);
		if (record === void 0) return {
			ok: false,
			reason: "unknown machine"
		};
		const approval = record.approvals.get(approvalId);
		if (approval === void 0) return {
			ok: false,
			reason: "this approval is no longer waiting"
		};
		return this.enqueue(record, {
			commandId: mintId(),
			sessionId: approval.sessionId,
			kind: "approval",
			approvalId,
			decision,
			from,
			expiresAt: Date.now() + COMMAND_TTL_MS
		});
	}
	/**
	* Offer one relayed approval to the browsers watching this server.
	* @param machineName - the machine that is blocked on it.
	* @param payload - the approval, its Session, and its TTL.
	*/
	openApproval(machineName, payload) {
		const record = this.records.get(machineName);
		if (record === void 0) return;
		record.lastSeen = Date.now();
		if (!record.sessions.has(payload.sessionId)) return;
		const view = {
			machineName,
			sessionId: payload.sessionId,
			approvalId: payload.approvalId,
			approval: payload.approval,
			openedAt: Date.now(),
			expiresAt: payload.expiresAt
		};
		record.approvals.set(payload.approvalId, view);
		while (record.approvals.size > APPROVAL_LIMIT) {
			const oldest = record.approvals.keys().next();
			if (oldest.done === true || oldest.value === payload.approvalId) break;
			this.closeApproval(machineName, {
				sessionId: record.approvals.get(oldest.value)?.sessionId ?? payload.sessionId,
				approvalId: oldest.value,
				outcome: "expired"
			});
		}
		this.broadcast({
			type: "approval",
			approval: view
		});
	}
	/**
	* Stop offering one approval, and tell every watching browser why.
	* @param machineName - the machine that asked.
	* @param payload - the approval and the outcome to report.
	*/
	closeApproval(machineName, payload) {
		const record = this.records.get(machineName);
		const view = record?.approvals.get(payload.approvalId);
		if (record === void 0 || view === void 0) return;
		record.approvals.delete(payload.approvalId);
		this.broadcast({
			type: "approval",
			approval: {
				...view,
				closed: payload.outcome
			}
		});
		this.broadcastState();
	}
	/** Approvals the console may still decide, oldest offer first. */
	approvals() {
		return [...this.records.values()].flatMap((record) => [...record.approvals.values()]).sort((left, right) => left.openedAt - right.openedAt);
	}
	/**
	* Retire the approvals that stopped being decidable while nobody was looking.
	*
	* Its own sweep rather than a share of the question one, because the two expire
	* on different clocks (an approval's TTL is shorter, and the tool call behind it
	* is blocked), and because a stale approval is the more dangerous of the two: it
	* is an offer to grant an operation whose context has moved on.
	*/
	sweepApprovals(now = Date.now()) {
		for (const record of this.records.values()) {
			const offline = record.origin === void 0 && now - record.lastSeen >= 45e3;
			for (const view of [...record.approvals.values()]) {
				if (view.expiresAt > now && !offline) continue;
				this.closeApproval(record.machineName, {
					sessionId: view.sessionId,
					approvalId: view.approvalId,
					outcome: offline ? "offline" : "expired"
				});
			}
		}
	}
	/**
	* Every command one machine has been sent, oldest first.
	*
	* A browser reads these as they are broadcast; this accessor exists for the two
	* readers that cannot — the reconcile pass deciding what to retry, and a test
	* asking whether a retry was recorded. Nothing here is private state: a status is
	* what the console already sees.
	* @param machineName - the machine whose commands to read.
	* @returns the statuses, in the order they were last changed.
	*/
	commands(machineName) {
		return [...this.records.get(machineName)?.commands.values() ?? []];
	}
	/**
	* Retire one command with the owning machine's own outcome.
	* @param machineName - the machine that answered.
	* @param payload - the command id and whether it was admitted.
	*/
	ackCommand(machineName, payload) {
		const record = this.records.get(machineName);
		if (record === void 0) return;
		record.lastSeen = Date.now();
		const owed = record.pending.findIndex((entry) => entry.command.commandId === payload.commandId);
		if (owed >= 0) record.pending.splice(owed, 1);
		const status = record.commands.get(payload.commandId);
		if (status === void 0) return;
		if (TERMINAL_STATES.includes(status.state)) return;
		if (payload.ok) {
			this.transition(record, status, "accepted");
			if (status.kind === "answer" && status.questionId !== void 0) this.closeQuestion(machineName, {
				sessionId: status.sessionId,
				questionId: status.questionId,
				outcome: "answered-at-console"
			});
			if (status.kind === "approval" && status.approvalId !== void 0) this.closeApproval(machineName, {
				sessionId: status.sessionId,
				approvalId: status.approvalId,
				outcome: status.decision === "rejected" ? "rejected-at-console" : "allowed-at-console"
			});
			return;
		}
		this.transition(record, status, "failed", payload.error ?? "the owning machine refused the prompt");
		if (status.kind === "answer" && status.questionId !== void 0) this.closeQuestion(machineName, {
			sessionId: status.sessionId,
			questionId: status.questionId,
			outcome: "refused"
		});
		if (status.kind === "approval" && status.approvalId !== void 0) this.closeApproval(machineName, {
			sessionId: status.sessionId,
			approvalId: status.approvalId,
			outcome: "refused"
		});
	}
	/**
	* Retire every command that outlived its TTL, queued or already sent.
	*
	* A command written to an origin's stream is not confirmed by that write: if
	* the link died in the same instant, nothing else would ever move it out of
	* `delivered`. The origin refuses an expired prompt on its own, so this is the
	* server's half of the same rule, and the half that tells the browser.
	*/
	expireCommands(now = Date.now()) {
		for (const record of this.records.values()) {
			for (const status of [...record.commands.values()]) {
				if (TERMINAL_STATES.includes(status.state)) continue;
				if (status.expiresAt > now) continue;
				this.transition(record, status, "expired");
			}
			const kept = record.pending.filter((owed) => owed.command.expiresAt > now);
			if (kept.length !== record.pending.length) {
				record.pending.length = 0;
				record.pending.push(...kept);
			}
		}
	}
	/**
	* Every machine the mirror knows, newest activity first within the list.
	* @returns the presentation view of the mirror.
	*/
	machines() {
		const now = Date.now();
		return [...this.records.values()].map((record) => ({
			machineName: record.machineName,
			online: record.origin !== void 0 || now - record.lastSeen < 45e3,
			lastSeen: record.lastSeen,
			...record.pluginVersion === void 0 ? {} : { pluginVersion: record.pluginVersion },
			sessions: [...record.sessions.values()].map((session) => summary(session)).sort((left, right) => right.updatedAt - left.updatedAt)
		})).sort((left, right) => right.lastSeen - left.lastSeen);
	}
	/**
	* Read one page of a mirrored Session's retained transcript.
	*
	* The newest end, because that is the end a reader is at: the whole window is
	* megabytes for a long Session, and a console that must transfer all of it to
	* show the last exchange is a console that feels slow for no reason. `before`
	* walks older, one page at a time, and `hasMore` says whether it is worth it.
	* @param machineName - owning machine.
	* @param sessionId - published Session.
	* @param page - page size and the exclusive upper sequence to read below.
	* @returns the page, or undefined when the mirror holds no such Session.
	*/
	transcript(machineName, sessionId, page = { limit: TRANSCRIPT_WINDOW }) {
		const record = this.records.get(machineName);
		const session = record?.sessions.get(sessionId);
		if (record === void 0 || session === void 0) return void 0;
		const before = page.before;
		const end = before === void 0 ? session.events.length : session.events.findIndex((event) => event.seq >= before);
		const stop = end < 0 ? session.events.length : end;
		const size = Math.min(Math.max(1, page.limit), EVENT_LIMIT);
		const start = Math.max(0, stop - size);
		const originHasOlder = session.originHasOlder;
		if (start === 0 && before !== void 0 && originHasOlder) {
			const now = Date.now();
			const asked = this.olderAsked.get(`${machineName}|${sessionId}`);
			if (asked === void 0 || now - asked >= this.olderAskFloorMs) {
				this.olderAsked.set(`${machineName}|${sessionId}`, now);
				record.origin?.older(sessionId, before, OLDER_PAGE_MESSAGES);
			}
		}
		return {
			machineName,
			sessionId,
			events: session.events.slice(start, stop),
			running: session.running,
			hasMore: start > 0 || originHasOlder
		};
	}
	/**
	* Ask the origin for the page below one sequence, without reading a window.
	*
	* {@link SyncHub.transcript} asks as a side effect of a reader reaching the
	* mirror's lower edge, and it is rate-limited because a reader asks once per
	* scroll. A hole is not a scroll: it is a known gap, so the page that covers it
	* is asked for directly and in the largest pages the origin serves.
	* @param machineName - owning machine.
	* @param sessionId - published Session.
	* @param throughSeq - the lowest sequence the mirror holds; the page ends here.
	* @param maxMessages - how many messages the origin should page back over.
	* @returns whether there was an origin to ask.
	*/
	askOlder(machineName, sessionId, throughSeq, maxMessages) {
		const record = this.records.get(machineName);
		if (record?.sessions.get(sessionId) === void 0) return false;
		if (record.origin === void 0) {
			this.pendingOlder.set(`${machineName}|${sessionId}`, {
				machineName,
				sessionId,
				throughSeq,
				maxMessages
			});
			return true;
		}
		record.origin.older(sessionId, throughSeq, maxMessages);
		return true;
	}
	/**
	* Ask the owning machine for the history a mirrored log is still missing below
	* its own window.
	*
	* A mirror whose lowest held sequence is above 0 is *by definition* missing the
	* log below that point: a log starts at 0, so anything the mirror holds that
	* begins later is a window rather than a Session. Nothing else in the engine
	* says so — `holes` counts gaps inside the held range and `behind` counts what
	* the origin has published above it, and history below a window is neither —
	* so this is the only reading that a mirror which arrived as a tail window can
	* be repaired from.
	*
	* It has to be this reading rather than the origin's own `hasOlder`: that flag
	* is one machine's memory of having read back to the start *once*, and it stays
	* false afterwards. When the pages from that read are lost — the mirror's host
	* restarted, or the read landed on a link that was closing — the flag says
	* "nothing older" while the mirror plainly holds a window, and the two ends
	* deadlock: measured here as a 6,257-event Session whose mirror kept 283 events
	* (seq 5975..6257) with `missingEvents: 0` for the rest of the episode.
	*
	* The bound is the origin's own stated low-water mark, not the mirror's lowest
	* held sequence. Those differ the moment one page arrives: a page prepends, so
	* the mirror's lowest becomes 0 while the run *between* the page and the window
	* is still missing — and asking below 0 asks for the same page again, forever.
	* Measured exactly that: thirteen reads of `[0, 2344]`, a mirror pinned at
	* `[0, 2318] ∪ [5975, 6257]`, and a frontier that never moved. The origin's
	* `firstSeq` is monotone down, which is what a frontier has to be.
	*
	* Asking is not the same as expecting: the origin reads its own log and answers
	* an empty page once the beginning really is reached, so this can repeat
	* harmlessly. The floor is in `olderAsked`, so it costs one ask per Session per
	* interval.
	* @param record - the machine that owns the Sessions.
	* @param session - the mirrored Session to measure.
	*/
	fillBelowWindow(record, session) {
		const floor = session.receivedLow ?? session.events[0]?.seq;
		if (floor === void 0 || floor <= 0) return;
		const key = `${record.machineName}|${session.sessionId}`;
		const now = Date.now();
		const asked = this.olderAsked.get(key);
		if (asked !== void 0 && now - asked < this.olderAskFloorMs) return;
		this.olderAsked.set(key, now);
		record.origin?.older(session.sessionId, floor, OLDER_PAGE_MESSAGES);
	}
	/** Deliver the older-history asks that waited for an origin to attach. */
	flushPendingOlder(machineName) {
		for (const [key, ask] of [...this.pendingOlder]) {
			if (ask.machineName !== machineName) continue;
			this.pendingOlder.delete(key);
			this.records.get(machineName)?.origin?.older(ask.sessionId, ask.throughSeq, ask.maxMessages);
		}
	}
	/** Push the current view to every browser (used when the wire reconnects). */
	refresh() {
		this.broadcastState();
	}
	/** Emit one complete state frame, assembled by the engine that owns it. */
	broadcastState() {
		this.broadcast({
			type: "state",
			state: this.stateOf()
		});
	}
	machine(machineName) {
		const existing = this.records.get(machineName);
		if (existing !== void 0) return existing;
		const created = {
			machineName,
			sessions: /* @__PURE__ */ new Map(),
			lastSeen: Date.now(),
			pending: [],
			commands: /* @__PURE__ */ new Map(),
			questions: /* @__PURE__ */ new Map(),
			approvals: /* @__PURE__ */ new Map()
		};
		this.records.set(machineName, created);
		return created;
	}
	/**
	* Read one mirrored Session, creating its placeholder when frames arrive
	* before the index that names it.
	* @param record - the owning machine.
	* @param sessionId - the Session the frames belong to.
	* @returns the record to append to.
	*/
	session(record, sessionId) {
		const existing = record.sessions.get(sessionId);
		if (existing !== void 0) return existing;
		const created = {
			sessionId,
			title: sessionId,
			updatedAt: Date.now(),
			running: false,
			events: [],
			seqs: /* @__PURE__ */ new Set(),
			maxSeq: -1,
			originSeq: -1,
			originHasOlder: false
		};
		record.sessions.set(sessionId, created);
		return created;
	}
	/**
	* Move one command to a new state and tell every watching browser.
	*
	* The seed only needs the three fields every command carries, so a live
	* `DownstreamCommand`, an existing status, and a status being replaced are all
	* accepted without a second code path.
	* @param record - the owning machine.
	* @param seed - command identity, Session, and TTL.
	* @param state - the state to record.
	* @param error - optional human-readable reason.
	*/
	transition(record, seed, state, error, retries) {
		const status = {
			commandId: seed.commandId,
			machineName: record.machineName,
			sessionId: seed.sessionId,
			state,
			...seed.kind === void 0 ? {} : { kind: seed.kind },
			...seed.questionId === void 0 ? {} : { questionId: seed.questionId },
			...seed.approvalId === void 0 ? {} : { approvalId: seed.approvalId },
			...seed.decision === void 0 ? {} : { decision: seed.decision },
			...retries === void 0 ? {} : { retries },
			expiresAt: seed.expiresAt,
			...error === void 0 ? {} : { error },
			time: Date.now()
		};
		record.commands.set(status.commandId, status);
		while (record.commands.size > STATUS_LIMIT) {
			const oldest = record.commands.keys().next();
			if (oldest.done === true || oldest.value === status.commandId) break;
			record.commands.delete(oldest.value);
		}
		this.broadcast({
			type: "command",
			command: status
		});
	}
	broadcast(frame) {
		this.notify(frame);
	}
};
/** Project one record onto its presentation row. */
function summary(session) {
	return {
		sessionId: session.sessionId,
		title: session.title,
		updatedAt: session.updatedAt,
		running: session.running,
		...session.cwd === void 0 ? {} : { cwd: session.cwd },
		eventCount: session.events.length,
		missingEvents: missingOf(session),
		...shortfallOf(session),
		...session.originStats === void 0 ? {} : { stats: session.originStats }
	};
}
/**
* How short one mirror is, split by what the reader has to act on.
*
* Two things can be missing, and they are counted separately because only the
* first is a fault:
*
*  - holes *inside* the held range, which a replacement window or an out-of-order
*    arrival can leave, and which the retained run's extent reveals; and
*  - everything above the highest sequence held, up to the watermark the origin
*    states in its index. Nothing below the top says that a run never arrived —
*    an empty mirror is the extreme case of that — so without the stated
*    watermark a mirror that lost everything is indistinguishable from one whose
*    Session has simply done nothing yet.
*
* Reported apart because they mean opposite things to a reader: a hole is a
* repair that is owed, while being behind is what a live Session looks like.
* @param session - the record to measure.
* @returns the two counts.
*/
function shortfallOf(session) {
	const lowest = session.events[0]?.seq;
	return {
		holes: lowest === void 0 ? 0 : Math.max(0, session.maxSeq - lowest + 1 - session.seqs.size),
		behind: Math.max(0, session.originSeq - session.maxSeq)
	};
}
/**
* How many events one mirror is short of what its origin holds — both kinds.
*
* The sum is what an episode is cleared by, so it stays the number the sweep and
* the repair logic reason about; the split above is what a reader is shown.
* @param session - the record to measure.
* @returns the count of events the origin has and this mirror does not.
*/
function missingOf(session) {
	const { holes, behind } = shortfallOf(session);
	return holes + behind;
}
/**
* The runs of sequences missing *inside* the range this mirror holds.
*
* A count is enough to report, but not to repair: the replay ask fills a hole near
* the top of the window, and a hole below it needs a page read aimed at that hole.
* Events are held in sequence order, so one walk finds every run.
* @param session - the record to measure.
* @returns the holes, lowest first.
*/
function holesOf(session) {
	const holes = [];
	let expected;
	for (const event of session.events) {
		if (expected !== void 0 && event.seq > expected) holes.push({
			from: expected,
			to: event.seq - 1
		});
		expected = event.seq + 1;
	}
	return holes;
}
/** Read an origin's stated watermark, which is never a negative claim. */
function reported(value) {
	return typeof value === "number" && Number.isSafeInteger(value) ? value : -1;
}
/** Mint one opaque identity. */
function mintId() {
	return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
//#endregion
//#region src/host/handoff.ts
/**
* Requests already settled, kept only long enough to answer a late console.
*
* Bounded like the step-settlement marks in the engine: the ids exist to name a
* refusal, so a few hundred remembered ones say everything a refusal can say.
*/
const SETTLED_LIMIT = 256;
let sequence = 0;
/** One identity per asking episode, unique within this process. */
function mintHandoffId() {
	sequence += 1;
	return `${Date.now().toString(36)}-${sequence.toString(36)}`;
}
/** One race, for one domain's request and decision types. */
var HandoffRelay = class {
	sink;
	wording;
	pending = /* @__PURE__ */ new Map();
	settled = [];
	offered = 0;
	decidedLocally = 0;
	decidedRemotely = 0;
	lateAnswers = 0;
	aborted = 0;
	/** @param sink - how this relay reaches the console. @param wording - how this domain names its refusals. */
	constructor(sink, wording) {
		this.sink = sink;
		this.wording = wording;
	}
	/**
	* Offer one request to the console and race it against the local answerer.
	*
	* The caller passes the delegated local answerer as `local`: calling it starts
	* the answerers behind this one — which is the shipped browser UI, reached
	* through the Remote waterfall bridge. Both sides are asked, and the first
	* result wins.
	* @param o.sessionId - the Session being asked in; absent means "not relayable".
	* @param o.offer - what the console is shown, or undefined when there is nothing to offer.
	* @param o.ttlMs - how long the console may decide this one.
	* @param o.local - the delegated local answerer.
	* @param o.remote - how to turn the console's decision into the local result.
	* @param o.validate - why a console decision is unacceptable, or undefined.
	* @param o.closeOnLocal - what to tell the console when the local side wins.
	* @param o.closeOnAbort - what to tell the console when the local side fails.
	* @returns the winning result.
	*/
	async race(o) {
		if (o.sessionId === void 0 || o.offer === void 0) return o.local();
		const sessionId = o.sessionId;
		const id = mintHandoffId();
		const deferred = Promise.withResolvers();
		const expiresAt = this.sink.now() + o.ttlMs;
		this.pending.set(id, {
			sessionId,
			id,
			expiresAt,
			settle: deferred.resolve,
			validate: o.validate
		});
		this.offered += 1;
		this.sink.open(sessionId, id, o.offer, expiresAt);
		const localResult = o.local();
		let outcome;
		try {
			outcome = await Promise.race([localResult.then((result) => ({
				side: "local",
				result
			})), deferred.promise.then((answer) => ({
				side: "remote",
				answer
			}))]);
		} catch (error) {
			this.aborted += 1;
			this.remember(id);
			this.sink.close(sessionId, id, o.closeOnAbort);
			throw error;
		} finally {
			this.pending.delete(id);
		}
		this.remember(id);
		if (outcome.side === "local") {
			this.decidedLocally += 1;
			this.sink.close(sessionId, id, o.closeOnLocal(outcome.result));
			return outcome.result;
		}
		this.decidedRemotely += 1;
		return o.remote(outcome.answer);
	}
	/**
	* Claim one pending request for the console's decision.
	*
	* The single decision point of the whole feature: this is where "the console
	* decided first" is either accepted or refused, and it is decided by whether
	* *this* request is still pending here — not by anything the server believes.
	* @param id - the request the console decided.
	* @param answer - the console's decision.
	* @param commandId - the command carrying it, so a retry is recognisable.
	* @returns whether the decision was claimed.
	*/
	claim(id, answer, commandId) {
		const pending = this.pending.get(id);
		if (pending === void 0) {
			if (this.settled.includes(id)) {
				this.lateAnswers += 1;
				return {
					ok: false,
					reason: this.wording.settled
				};
			}
			return {
				ok: false,
				reason: this.wording.unknown
			};
		}
		if (pending.claimedBy !== void 0) return pending.claimedBy === commandId ? { ok: true } : {
			ok: false,
			reason: this.wording.claimed
		};
		if (this.sink.now() > pending.expiresAt) return {
			ok: false,
			reason: this.wording.expired
		};
		const invalid = pending.validate(answer);
		if (invalid !== void 0) return {
			ok: false,
			reason: invalid
		};
		pending.claimedBy = commandId;
		pending.settle(answer);
		return { ok: true };
	}
	/** What this machine's relayed requests did. */
	counts() {
		return {
			offered: this.offered,
			open: this.pending.size,
			decidedLocally: this.decidedLocally,
			decidedRemotely: this.decidedRemotely,
			lateAnswers: this.lateAnswers,
			aborted: this.aborted
		};
	}
	/**
	* Withdraw every request still pending, because this machine is going away.
	* @param outcome - what to tell the console; `aborted` for a shutdown.
	*/
	withdrawAll(outcome) {
		for (const pending of [...this.pending.values()]) {
			this.pending.delete(pending.id);
			this.remember(pending.id);
			this.sink.close(pending.sessionId, pending.id, outcome);
		}
	}
	/** Remember one settled request id, oldest dropped first. */
	remember(id) {
		this.settled.push(id);
		if (this.settled.length > SETTLED_LIMIT) this.settled.splice(0, this.settled.length - SETTLED_LIMIT);
	}
};
//#endregion
//#region src/host/approvals.ts
/**
* The two-sided race for one approval — the approval domain of
* {@link HandoffRelay}.
*
* This is the same race as a question's, with a different stake. An answer to a
* question is *information*; an outcome here is **permission**: `allowed-once`
* releases a tool call that this machine's own permission preset was gating. Three
* consequences shape this module, and all three are deliberate:
*
*  - **Two decisions, not four outcomes.** The upstream vocabulary
*    (`allowed-once`/`rejected`/`cancelled`/`unavailable`) mixes decisions a human
*    makes with states of an *answerer*. A console may only produce the first two —
*    `cancelled` and `unavailable` describe the machine's own chain giving up, and a
*    wire validator plus {@link invalidDecisionReason} both refuse them.
*  - **The policy still wins.** A `never` preset is enforced by the upstream service
*    *before* it dispatches `approval/request`, so no listener here can turn a
*    denied operation into an allowed one. What this module decides is only what the
*    policy left open — and only for Sessions a user opted in by name.
*  - **Failing closed is the default.** Every way this can go wrong — a TTL, an
*    aborted turn, a decision refused as late, a machine going offline — ends with
*    the operation *not* granted, because the upstream caller treats anything but
*    `allowed-once` as a refusal.
*
* The request itself carries no arguments, and that is not an omission: it names
* the tool and the exact `callId`, and the console reads the call out of the
* transcript it is already mirroring. So a card can say what is being approved
* without a second copy of the log crossing the wire.
*/
/**
* Cut one live approval down to what crosses a wire.
* @param request - the pending approval request.
* @returns the relayable shape.
*/
function relayedApproval(request) {
	const reason = request.reason ?? request.displayReason?.en;
	return {
		toolName: request.toolName,
		...request.callId === void 0 ? {} : { callId: request.callId },
		...reason === void 0 ? {} : { reason }
	};
}
/**
* Check one console decision against what a console may decide.
*
* The wire validator already refuses anything outside the two decisions; this is the
* same rule at the domain boundary, so a forged or stale frame cannot reach a tool
* call by a road the validator does not cover — and so `unavailable` in particular
* can never be *claimed* by remote, which would let a console hand a caller the
* fail-closed value while pretending to have decided.
* @param decision - what the console decided.
* @returns undefined when it is a decision a console may make, else the reason.
*/
function invalidDecisionReason(decision) {
	if (decision === "allowed-once" || decision === "rejected") return void 0;
	return `a console may only allow once or reject, not ${JSON.stringify(decision)}`;
}
/**
* How one local outcome is reported to the console.
*
* The console is told which way it lost, not merely that it lost: "the machine's
* own human allowed this" and "the machine's own human refused it" are opposite
* facts about the same operation, and a reader who could not tell them apart would
* misread their own audit trail.
* @param outcome - what the local answerer returned.
* @returns the outcome to close the card with.
*/
function localApprovalOutcome(outcome) {
	if (outcome === "allowed-once") return "allowed-at-origin";
	if (outcome === "rejected") return "rejected-at-origin";
	return outcome === "cancelled" ? "aborted" : "unavailable";
}
/** The approval relay: what this machine offered the console, and who decided. */
var ApprovalRelay = class {
	ttlMs;
	core;
	/**
	* @param sink - how this relay reaches the console.
	* @param ttlMs - how long a relayed approval stays decidable.
	*/
	constructor(sink, ttlMs = APPROVAL_TTL_MS) {
		this.ttlMs = ttlMs;
		this.core = new HandoffRelay(sink, {
			settled: "this approval was already decided on the machine that asked for it",
			claimed: "this approval was already decided from the console",
			unknown: "no such approval is waiting on this machine",
			expired: "the approval expired before the decision arrived"
		});
	}
	/**
	* Offer one approval to the console and race it against the local answerer.
	* @param sessionId - the Session asking; absent means "not relayable".
	* @param request - the approval the agent is blocked on.
	* @param local - the delegated local answerer.
	* @returns the winning outcome, in the upstream vocabulary.
	*/
	async race(sessionId, request, local) {
		return this.core.race({
			sessionId,
			offer: relayedApproval(request),
			ttlMs: this.ttlMs,
			local,
			remote: (decision) => decision,
			validate: (decision) => invalidDecisionReason(decision),
			closeOnLocal: localApprovalOutcome,
			closeOnAbort: "aborted"
		});
	}
	/**
	* Claim one pending approval for the console's decision.
	* @param approvalId - the approval the console decided.
	* @param decision - what it decided.
	* @param commandId - the command carrying it, so a retry is recognisable.
	* @returns whether the decision was claimed.
	*/
	claim(approvalId, decision, commandId) {
		return this.core.claim(approvalId, decision, commandId);
	}
	/** What this machine's relayed approvals did. */
	counts() {
		const counts = this.core.counts();
		return {
			offered: counts.offered,
			open: counts.open,
			decidedLocally: counts.decidedLocally,
			decidedRemotely: counts.decidedRemotely,
			lateDecisions: counts.lateAnswers,
			aborted: counts.aborted
		};
	}
	/**
	* Withdraw every approval still pending, because this machine is going away.
	*
	* `aborted` rather than anything that reads like a decision: a shutdown is not a
	* refusal, and the upstream caller fails closed either way.
	* @param outcome - what to tell the console.
	*/
	withdrawAll(outcome = "aborted") {
		this.core.withdrawAll(outcome);
	}
};
//#endregion
//#region src/host/interactions.ts
/**
* The two-sided race for one user question — the question domain of
* {@link HandoffRelay}.
*
* A question is the one interactive event a Session produces whose answer is
* *information*: which option, or a typed answer. Both people who could answer it
* are legitimately "the user" — whoever is at the machine that owns the Session
* and whoever is watching it in the sync console — so the race, the claim and the
* counters all come from the shared handoff core, and this module holds only what
* is specific to a question: how to cut one down to a wire shape, how to check an
* answer against what was actually asked, and how the two answer shapes convert.
*/
/**
* Cut one live question down to what crosses a wire.
* @param questions - the asking agent's questions.
* @returns the relayable shape, with the intent dropped.
*/
function relayedQuestions(questions) {
	return questions.map((question) => ({
		id: question.id,
		question: question.question,
		...question.header === void 0 ? {} : { header: question.header },
		...question.detail === void 0 ? {} : { detail: question.detail },
		...question.options === void 0 ? {} : { options: question.options.map((option) => ({
			label: option.label,
			...option.description === void 0 ? {} : { description: option.description }
		})) },
		...question.multiSelect === void 0 ? {} : { multiSelect: question.multiSelect }
	}));
}
/**
* Turn the console's answers into the shape the asking tool expects.
*
* One item per question *the machine asked*, in the order it asked them: a
* console may answer a subset (a UI is allowed to leave a question skipped), and
* a skipped question is an empty selection rather than a missing entry — the
* same shape the local UI produces.
* @param asked - the questions this episode asked.
* @param answers - the console's answers, already validated.
* @returns the answer to hand back to the tool call.
*/
function relayedAnswer(asked, answers) {
	const byId = new Map(answers.map((answer) => [answer.id, answer]));
	return { answers: asked.map((question) => {
		const answer = byId.get(question.id);
		if (answer === void 0) return {
			id: question.id,
			selected: []
		};
		const selected = [...new Set(answer.selected)];
		return {
			id: question.id,
			selected,
			...answer.custom === void 0 ? {} : { custom: answer.custom }
		};
	}) };
}
/**
* Check one console answer against the questions that were actually asked.
*
* A choice the asker never offered is not a decision, it is a bug or a forged
* frame, and the local UI is held to the same rule — so it is refused here,
* where the mismatch is, rather than handed to a tool as if a human had meant it.
* @param asked - the questions this episode asked.
* @param answers - the console's answers.
* @returns undefined when the answers are acceptable, else the reason.
*/
function invalidAnswerReason(asked, answers) {
	const byId = new Map(asked.map((question) => [question.id, question]));
	for (const answer of answers) {
		const question = byId.get(answer.id);
		if (question === void 0) return `the answer names question ${JSON.stringify(answer.id)}, which was not asked`;
		const offered = new Set((question.options ?? []).map((option) => option.label));
		for (const label of answer.selected) if (!offered.has(label)) return `the answer selects ${JSON.stringify(label)}, which question ${JSON.stringify(answer.id)} never offered`;
		if (answer.selected.length > 1 && question.multiSelect !== true) return `the answer selects ${String(answer.selected.length)} options for single-select question ${JSON.stringify(answer.id)}`;
	}
}
/** The question relay: what this machine asked the console, and who won each race. */
var InteractionRelay = class {
	ttlMs;
	core;
	/**
	* @param sink - how this relay reaches the console.
	* @param ttlMs - how long a relayed question stays answerable.
	*/
	constructor(sink, ttlMs = QUESTION_TTL_MS) {
		this.ttlMs = ttlMs;
		this.core = new HandoffRelay(sink, {
			settled: "this question was already answered on the machine that asked it",
			claimed: "this question was already answered from the console",
			unknown: "no such question is waiting on this machine",
			expired: "the question expired before the answer arrived"
		});
	}
	/**
	* Offer one question to the console and race it against the local answerer.
	* @param sessionId - the Session being asked in; absent means "not relayable".
	* @param questions - the questions the agent asked.
	* @param local - the delegated local answerer.
	* @returns the winning answer.
	*/
	async race(sessionId, questions, local) {
		const asked = relayedQuestions(questions);
		return this.core.race({
			sessionId,
			offer: asked.length === 0 ? void 0 : asked,
			ttlMs: this.ttlMs,
			local,
			remote: (answers) => relayedAnswer(asked, answers),
			validate: (answers) => invalidAnswerReason(asked, answers),
			closeOnLocal: () => "answered-at-origin",
			closeOnAbort: "aborted"
		});
	}
	/**
	* Claim one pending question for the console's answer.
	* @param questionId - the question the console answered.
	* @param answers - the console's answers.
	* @param commandId - the command carrying them, so a retry is recognisable.
	* @returns whether the answer was claimed.
	*/
	claim(questionId, answers, commandId) {
		return this.core.claim(questionId, [...answers], commandId);
	}
	/** What this machine's relayed questions did. */
	counts() {
		const counts = this.core.counts();
		return {
			open: counts.open,
			answeredLocally: counts.decidedLocally,
			answeredRemotely: counts.decidedRemotely,
			lateAnswers: counts.lateAnswers,
			aborted: counts.aborted
		};
	}
	/**
	* Withdraw every question still pending, because this machine is going away.
	* @param outcome - what to tell the console; `aborted` for a shutdown.
	*/
	withdrawAll(outcome = "aborted") {
		this.core.withdrawAll(outcome);
	}
};
//#endregion
//#region src/host/transport.ts
/**
* The two network halves of the link.
*
*  - {@link startSyncServer} is the server role: a dedicated `node:http`
*    listener that origins handshake, publish, and hold a downstream stream
*    against. It is deliberately its own listener rather than a route on the
*    GUI's web server, so exposing sync never exposes the session GUI — the sync
*    API is the only thing reachable, and a shared password is the only way in.
*  - {@link OriginLink} is the client role: it authenticates, holds the
*    downstream stream open, and publishes the index plus durable events.
*
* Browser-facing traffic never touches this file; it goes through the GUI's own
* `ctx.webServer` so it stays same-origin.
*/
/**
* Durable events one published batch may carry, as a second bound on its size.
*
* The byte budget is what actually protects the wire; this keeps a pathological
* run (tiny events, or a size that cannot be measured) from becoming a batch
* with no shape at all.
*/
const FRAME_BATCH_EVENTS = 1e3;
/**
* Durable events the outbox may hold before it drops the oldest.
*
* Well above one flush interval's worth and well below what a Session buffer
* already tolerates (4,000 events per handle), so a server that is merely slow
* is absorbed and one that is gone is not.
*/
const FRAME_OUTBOX_LIMIT = 8e3;
/** Outbox depth at which a lagging link says so, once per episode. */
const FRAME_OUTBOX_WARN = 2e3;
/**
* Every kind the downstream stream may carry *as a command*, and nothing else.
*
* A total map over {@link DownstreamCommand}'s union on purpose: adding a kind
* there without adding it here is a compile error. That is the guard the origin's
* dispatcher lacked — it compared against `'prompt'` alone, so the first new kind
* (`answer`, the console's reply to a relayed question) was dropped in silence.
*/
const COMMAND_KINDS = {
	prompt: true,
	answer: true,
	approval: true
};
/**
* The command ids one link has already admitted, oldest evicted first.
*
* This is the target half of the delivery rule, and it is what makes the server's
* retry legal. A command written into a stream that is closing is accepted locally
* and arrives nowhere, with no error on either side, so the server has to hand over
* anything it has not seen acked — and a re-delivered *prompt* would otherwise be a
* second prompt in the same Session, which is worse than the loss it repairs.
*
* Bounded like every other memory here: a retry follows its original within seconds,
* so a few hundred ids cover every window a live link can have.
*/
var RecentCommands = class {
	limit;
	seen = /* @__PURE__ */ new Set();
	order = [];
	/** @param limit - how many ids to remember before evicting the oldest. */
	constructor(limit = 256) {
		this.limit = limit;
	}
	/**
	* Take one command id, and say whether the engine should act on it.
	* @param commandId - the id of the command just received.
	* @returns true on first sight, false when this is a re-delivery.
	*/
	admit(commandId) {
		if (this.seen.has(commandId)) return false;
		this.seen.add(commandId);
		this.order.push(commandId);
		if (this.order.length > this.limit) {
			const oldest = this.order.shift();
			if (oldest !== void 0) this.seen.delete(oldest);
		}
		return true;
	}
};
/**
* How long one post may take before it counts as failed.
*
* Without this, a connection black-holed by a network blip leaves `fetch`
* pending forever: the outbox stops draining, no reconnect is ever attempted,
* and the link looks alive while publishing nothing — the exact state this
* plugin's settings page was built to make visible.
*/
const POST_TIMEOUT_MS = 2e4;
/**
* Start the server-role listener.
* @param options - bind address, secret source, and the mirror to publish into.
* @returns the bound listener handle.
* @throws when the port cannot be bound, so the caller can report the reason.
*/
async function startSyncServer(options) {
	const tokens = /* @__PURE__ */ new Map();
	const openStreams = /* @__PURE__ */ new Set();
	const server = createServer((request, response) => {
		handle(request, response).catch((error) => {
			options.logger.warn(`dsh-session-sync: request failed: ${String(error)}`);
			if (!response.headersSent) sendJson$1(response, 500, { error: "internal" });
			else response.end();
		});
	});
	async function handle(request, response) {
		const url = new URL(request.url ?? "/", "http://sync.invalid");
		const declared = Number(request.headers["content-length"] ?? NaN);
		if (Number.isFinite(declared) && declared > 4194304) {
			sendJson$1(response, 413, { error: `request body over ${String(MAX_BODY_BYTES$1)} bytes` });
			return;
		}
		if (request.method === "POST" && url.pathname === "/handshake") {
			const body = await readJson(request);
			const machineName = typeof body?.["machineName"] === "string" ? body["machineName"] : "";
			if (!secretsMatch(typeof body?.["password"] === "string" ? body["password"] : "", options.password())) {
				sendJson$1(response, 401, { error: "password rejected" });
				return;
			}
			if (machineName.trim() === "") {
				sendJson$1(response, 400, { error: "machineName is required" });
				return;
			}
			const token = randomBytes(24).toString("hex");
			tokens.set(token, machineName.trim());
			sendJson$1(response, 200, {
				token,
				serverName: options.serverName()
			});
			return;
		}
		const machineName = authenticate(request, tokens);
		if (machineName === void 0) {
			sendJson$1(response, 401, { error: "missing or stale token" });
			return;
		}
		if (request.method === "POST" && url.pathname === "/publish") {
			const body = await readJson(request);
			const sessions = Array.isArray(body?.["sessions"]) ? body["sessions"] : [];
			const version = body?.["pluginVersion"];
			const payload = {
				machineName,
				...typeof version === "string" && version !== "" ? { pluginVersion: version } : {},
				sessions
			};
			options.hub.publishIndex(payload);
			sendJson$1(response, 200, { ok: true });
			return;
		}
		if (request.method === "POST" && url.pathname === "/stream-delta") {
			const body = await readJson(request);
			const sessionId = typeof body?.["sessionId"] === "string" ? body["sessionId"] : "";
			const kind = body?.["kind"] === "reasoning" ? "reasoning" : body?.["kind"] === "text" ? "text" : "";
			const text = typeof body?.["text"] === "string" ? body["text"] : "";
			const turn = typeof body?.["turn"] === "number" ? body["turn"] : 0;
			const step = typeof body?.["step"] === "number" ? body["step"] : 0;
			if (sessionId === "" || kind === "") {
				sendJson$1(response, 400, { error: "sessionId and kind are required" });
				return;
			}
			options.hub.publishStream(machineName, {
				sessionId,
				turn,
				step,
				kind,
				text
			});
			sendJson$1(response, 200, { ok: true });
			return;
		}
		if (request.method === "POST" && url.pathname === "/frames") {
			const body = await readJson(request);
			const sessionId = typeof body?.["sessionId"] === "string" ? body["sessionId"] : "";
			const events = Array.isArray(body?.["events"]) ? body["events"] : [];
			if (sessionId === "") {
				sendJson$1(response, 400, { error: "sessionId is required" });
				return;
			}
			options.hub.publishFrames(machineName, {
				sessionId,
				events
			});
			sendJson$1(response, 200, { ok: true });
			return;
		}
		if (request.method === "POST" && url.pathname === "/question/open") {
			const payload = questionOpenOf(await readJson(request));
			if (payload === void 0) {
				sendJson$1(response, 400, { error: "sessionId, questionId, questions, and expiresAt are required" });
				return;
			}
			options.hub.openQuestion(machineName, payload);
			sendJson$1(response, 200, { ok: true });
			return;
		}
		if (request.method === "POST" && url.pathname === "/question/close") {
			const payload = questionCloseOf(await readJson(request));
			if (payload === void 0) {
				sendJson$1(response, 400, { error: "sessionId, questionId, and a known outcome are required" });
				return;
			}
			options.hub.closeQuestion(machineName, payload);
			sendJson$1(response, 200, { ok: true });
			return;
		}
		if (request.method === "POST" && url.pathname === "/approval/open") {
			const payload = approvalOpenOf(await readJson(request));
			if (payload === void 0) {
				sendJson$1(response, 400, { error: "sessionId, approvalId, approval, and expiresAt are required" });
				return;
			}
			options.hub.openApproval(machineName, payload);
			sendJson$1(response, 200, { ok: true });
			return;
		}
		if (request.method === "POST" && url.pathname === "/approval/close") {
			const payload = approvalCloseOf(await readJson(request));
			if (payload === void 0) {
				sendJson$1(response, 400, { error: "sessionId, approvalId, and a known outcome are required" });
				return;
			}
			options.hub.closeApproval(machineName, payload);
			sendJson$1(response, 200, { ok: true });
			return;
		}
		if (request.method === "POST" && url.pathname === "/ack") {
			const body = await readJson(request);
			const commandId = typeof body?.["commandId"] === "string" ? body["commandId"] : "";
			const sessionId = typeof body?.["sessionId"] === "string" ? body["sessionId"] : "";
			if (commandId === "" || sessionId === "") {
				sendJson$1(response, 400, { error: "commandId and sessionId are required" });
				return;
			}
			options.hub.ackCommand(machineName, {
				commandId,
				sessionId,
				ok: body?.["ok"] === true,
				...typeof body?.["error"] === "string" ? { error: body["error"] } : {}
			});
			sendJson$1(response, 200, { ok: true });
			return;
		}
		if (request.method === "GET" && url.pathname === "/stream") {
			response.writeHead(200, {
				"content-type": "text/event-stream",
				"cache-control": "no-cache, no-transform",
				connection: "keep-alive",
				"x-accel-buffering": "no"
			});
			response.write(": connected\n\n");
			openStreams.add(response);
			const detach = options.hub.attachOrigin(machineName, {
				send: (command) => {
					if (response.writableEnded) return;
					response.write(`data: ${JSON.stringify(command)}\n\n`);
				},
				resync: (sessionId) => {
					if (response.writableEnded) return;
					const frame = {
						kind: "resync",
						sessionId
					};
					response.write(`data: ${JSON.stringify(frame)}\n\n`);
				},
				older: (sessionId, beforeSeq, maxMessages) => {
					if (response.writableEnded) return;
					const frame = {
						kind: "older",
						sessionId,
						beforeSeq,
						maxMessages
					};
					response.write(`data: ${JSON.stringify(frame)}\n\n`);
				}
			});
			const keepalive = setInterval(() => {
				if (response.writableEnded) return;
				response.write(": keepalive\n\n");
			}, KEEPALIVE_MS);
			response.on("close", () => {
				clearInterval(keepalive);
				openStreams.delete(response);
				detach();
			});
			return;
		}
		sendJson$1(response, 404, { error: "unknown route" });
	}
	await new Promise((resolve, reject) => {
		const onError = (error) => {
			reject(error);
		};
		server.once("error", onError);
		server.listen(options.port, options.host, () => {
			server.off("error", onError);
			resolve();
		});
	});
	const address = server.address();
	const boundPort = typeof address === "object" && address !== null ? address.port : options.port;
	options.logger.info(`dsh-session-sync: sync server listening on ${options.host}:${boundPort}`);
	return {
		port: () => boundPort,
		close: async () => {
			for (const stream of openStreams) stream.end();
			openStreams.clear();
			server.closeAllConnections();
			await new Promise((resolve) => {
				server.close(() => {
					resolve();
				});
			});
		}
	};
}
/** Read and authenticate one request's bearer token. */
function authenticate(request, tokens) {
	const header = request.headers.authorization;
	if (typeof header !== "string" || !header.startsWith("Bearer ")) return void 0;
	return tokens.get(header.slice(7));
}
/** Compare two secrets without leaking length-independent timing. */
function secretsMatch(supplied, expected) {
	const left = Buffer.from(supplied, "utf8");
	const right = Buffer.from(expected, "utf8");
	if (left.length !== right.length) return false;
	return timingSafeEqual(left, right);
}
/**
* Read a JSON request body, bounded so a hostile peer cannot exhaust memory.
*
* A chunked request declares no length, so the cap is enforced while reading
* rather than trusted from the header. What it produces is a refusal the caller
* reports by name — never a truncated buffer parsed as if it were whole.
*/
async function readJson(request) {
	const chunks = [];
	let total = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
		total += buffer.byteLength;
		if (total > 4194304) throw new Error(`request body over ${String(MAX_BODY_BYTES$1)} bytes`);
		chunks.push(buffer);
	}
	if (chunks.length === 0) return void 0;
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : void 0;
	} catch {
		return;
	}
}
/**
* Read one relayed question, or nothing when the body is not one.
*
* Validated rather than cast: this is the only shape in the protocol with nested
* arrays the server then hands to a browser, so a malformed one would become a
* broken card rather than a refused request. A question may legitimately carry no
* options — a free-text question is one the human answers with `custom` — but
* every question needs the id its answer will be routed by.
* @param body - the parsed request body.
* @returns the payload, or undefined when it is not a complete question.
*/
function questionOpenOf(body) {
	if (body === void 0) return void 0;
	const sessionId = nonEmptyString(body["sessionId"]);
	const questionId = nonEmptyString(body["questionId"]);
	const expiresAt = body["expiresAt"];
	const raw = body["questions"];
	if (sessionId === void 0 || questionId === void 0) return void 0;
	if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return void 0;
	if (!Array.isArray(raw) || raw.length === 0) return void 0;
	const questions = [];
	for (const entry of raw) {
		const question = relayedQuestionOf(entry);
		if (question === void 0) return void 0;
		questions.push(question);
	}
	return {
		sessionId,
		questionId,
		questions,
		expiresAt
	};
}
/**
* Read one relayed question, or nothing when it is not one.
* @param value - one entry of the request's `questions` array.
* @returns the question, or undefined when a required field is missing.
*/
function relayedQuestionOf(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const record = value;
	const id = nonEmptyString(record["id"]);
	const question = nonEmptyString(record["question"]);
	if (id === void 0 || question === void 0) return void 0;
	const options = record["options"];
	let relayedOptions;
	if (options !== void 0) {
		if (!Array.isArray(options)) return void 0;
		relayedOptions = [];
		for (const entry of options) {
			if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return void 0;
			const option = entry;
			const label = nonEmptyString(option["label"]);
			if (label === void 0) return void 0;
			const description = nonEmptyString(option["description"]);
			relayedOptions.push({
				label,
				...description === void 0 ? {} : { description }
			});
		}
	}
	const header = nonEmptyString(record["header"]);
	const detail = nonEmptyString(record["detail"]);
	return {
		id,
		question,
		...header === void 0 ? {} : { header },
		...detail === void 0 ? {} : { detail },
		...relayedOptions === void 0 ? {} : { options: relayedOptions },
		...record["multiSelect"] === true ? { multiSelect: true } : {}
	};
}
/**
* Read one question closure, or nothing when the body is not one.
* @param body - the parsed request body.
* @returns the payload, or undefined when the outcome is not one this protocol knows.
*/
function questionCloseOf(body) {
	if (body === void 0) return void 0;
	const sessionId = nonEmptyString(body["sessionId"]);
	const questionId = nonEmptyString(body["questionId"]);
	const outcome = body["outcome"];
	if (sessionId === void 0 || questionId === void 0) return void 0;
	if (!isQuestionOutcome(outcome)) return void 0;
	return {
		sessionId,
		questionId,
		outcome
	};
}
/** Whether one value names an outcome this protocol defines. */
function isQuestionOutcome(value) {
	return value === "answered-at-origin" || value === "answered-at-console" || value === "refused" || value === "aborted" || value === "expired" || value === "offline";
}
/**
* Read one relayed approval, or nothing when the body is not one.
*
* The tool name is the only required field beyond the ids: an approval is *about*
* a tool, and a card that could not say which one would be asking a reader to
* grant something unnamed. `callId` and `reason` are optional because the seam
* makes them optional — a hook-driven ask has no call, and an asker need not
* explain itself.
* @param body - the parsed request body.
* @returns the payload, or undefined when it is not a complete approval.
*/
function approvalOpenOf(body) {
	if (body === void 0) return void 0;
	const sessionId = nonEmptyString(body["sessionId"]);
	const approvalId = nonEmptyString(body["approvalId"]);
	const expiresAt = body["expiresAt"];
	const approval = relayedApprovalOf(body["approval"]);
	if (sessionId === void 0 || approvalId === void 0 || approval === void 0) return void 0;
	if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return void 0;
	return {
		sessionId,
		approvalId,
		approval,
		expiresAt
	};
}
/**
* Read one relayed approval's own fields, or nothing when they are not enough.
* @param value - the request's `approval` member.
* @returns the approval, or undefined when the tool is unnamed.
*/
function relayedApprovalOf(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const record = value;
	const toolName = nonEmptyString(record["toolName"]);
	if (toolName === void 0) return void 0;
	const callId = nonEmptyString(record["callId"]);
	const reason = nonEmptyString(record["reason"]);
	return {
		toolName,
		...callId === void 0 ? {} : { callId },
		...reason === void 0 ? {} : { reason }
	};
}
/**
* Read one approval closure, or nothing when the body is not one.
* @param body - the parsed request body.
* @returns the payload, or undefined when the outcome is not one this protocol knows.
*/
function approvalCloseOf(body) {
	if (body === void 0) return void 0;
	const sessionId = nonEmptyString(body["sessionId"]);
	const approvalId = nonEmptyString(body["approvalId"]);
	const outcome = body["outcome"];
	if (sessionId === void 0 || approvalId === void 0) return void 0;
	if (!isApprovalOutcome(outcome)) return void 0;
	return {
		sessionId,
		approvalId,
		outcome
	};
}
/**
* Whether one value names an approval outcome this protocol defines.
*
* The console-side decisions are included because the *server* closes cards with
* them, while an origin may only ever close with the ones that describe its own
* side — the asymmetry is real and is enforced where it matters, in
* `ApprovalRelay`'s validator, rather than by making this reader narrower than the
* field it parses.
*/
function isApprovalOutcome(value) {
	return value === "allowed-at-origin" || value === "rejected-at-origin" || value === "allowed-at-console" || value === "rejected-at-console" || value === "aborted" || value === "unavailable" || value === "refused" || value === "expired" || value === "offline";
}
/** One non-empty, trimmed string field, or undefined. */
function nonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0 ? value : void 0;
}
/** Write one JSON response. */
function sendJson$1(response, status, body) {
	const text = JSON.stringify(body);
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": String(Buffer.byteLength(text)),
		"cache-control": "no-store"
	});
	response.end(text);
}
/** The origin-role link to one sync server. */
var OriginLink = class {
	options;
	controller;
	/** The handshake-then-stream attempt in flight, aborted to force a reconnect. */
	connection;
	token;
	isLinked = false;
	/**
	* Batches the server has not accepted yet, oldest first.
	*
	* An event handed to a socket is not published, and this is where that
	* distinction lives. The link used to splice a batch out of the Session
	* buffer and post it once: if that post failed — a blip, a restart, a rejected
	* request — the events were gone, and because they sat above everything the
	* mirror held the loss left no hole to notice. They wait here instead, in
	* order, until the server answers 2xx.
	*/
	outbox = [];
	/** Events held in the outbox, so the cap is measured in events, not batches. */
	outboxEvents = 0;
	/** Whether the drain loop is running, so only one posts at a time. */
	pumping = false;
	/** Whether the depth has been reported for the current episode. */
	outboxWarned = false;
	/** What the last published batch looked like, as the wire will see it. */
	lastBatch;
	/**
	* Command ids this link has already handed to the engine.
	*
	* Owned by the link rather than the engine because the link is where a frame
	* arrives: a duplicate that reached `runCommand` would already be a second prompt,
	* and the whole point of admitting it here is that it never gets that far.
	*/
	admitted = new RecentCommands();
	/** @param options - address, credentials, and the command callback. */
	constructor(options) {
		this.options = options;
	}
	/** Whether an authenticated downstream stream is currently held. */
	get linked() {
		return this.isLinked;
	}
	/**
	* How the last published batch was split, and how deep the outbox is now.
	*
	* Published because a refusal by size is otherwise invisible from here: the
	* sender only learns "the server answered 413", and the number that explains
	* it — how many bytes one batch turned out to be — lived nowhere an operator
	* could read. Only non-zero facts are returned.
	*/
	batchReport() {
		if (this.lastBatch === void 0 && this.outboxEvents === 0) return void 0;
		return {
			...this.lastBatch ?? {},
			...this.outboxEvents === 0 ? {} : { waiting: this.outboxEvents }
		};
	}
	/** Begin connecting and keep reconnecting until {@link stop}. */
	start() {
		if (this.controller !== void 0) return;
		const controller = new AbortController();
		this.controller = controller;
		this.run(controller.signal);
	}
	/** Tear the link down and stop reconnecting. */
	stop() {
		this.controller?.abort();
		this.controller = void 0;
		this.token = void 0;
		this.outbox.length = 0;
		this.outboxEvents = 0;
		this.setLinked(false);
	}
	/**
	* Publish this machine's Session index.
	* @param payload - the Sessions currently marked for sync.
	*/
	publishIndex(payload) {
		this.post("/publish", {
			sessions: payload.sessions,
			...payload.pluginVersion === void 0 ? {} : { pluginVersion: payload.pluginVersion }
		});
	}
	/**
	* Publish durable events appended to one Session.
	*
	* A batch waits in the outbox until the server has it. Sequences were the
	* cheap half of the fix — the mirror tolerates reordering now — but tolerance
	* is not delivery: a post that failed took its events with it, and nothing
	* else in the system knows they existed. So they are held, in order, and
	* retried until accepted.
	* @param sessionId - the published Session.
	* @param events - the newly observed durable events.
	*/
	publishFrames(sessionId, events) {
		if (events.length === 0) {
			this.pumpFrames();
			return;
		}
		const split = batchEvents(events, FRAMES_BODY_BYTES, FRAME_BATCH_EVENTS);
		for (const batch of split.batches) {
			this.outbox.push({
				sessionId,
				events: batch
			});
			this.outboxEvents += batch.length;
		}
		this.lastBatch = {
			bytes: split.bytes,
			size: split.size,
			batches: split.batches.length
		};
		while (this.outboxEvents > FRAME_OUTBOX_LIMIT && this.outbox.length > 1) {
			const dropped = this.outbox.shift();
			if (dropped === void 0) break;
			this.outboxEvents -= dropped.events.length;
			this.options.logger.warn(`dsh-session-sync: outbox full, dropped ${String(dropped.events.length)} durable event(s) for "${dropped.sessionId}"; its mirror is behind until it replays`);
		}
		if (this.outboxEvents >= FRAME_OUTBOX_WARN && !this.outboxWarned) {
			this.outboxWarned = true;
			this.options.logger.warn(`dsh-session-sync: ${String(this.outboxEvents)} durable event(s) waiting to be accepted`);
		}
		this.pumpFrames();
	}
	/**
	* Send queued batches, oldest first, until one is refused.
	*
	* A refusal leaves its batch at the head, so the order the mirror sees is the
	* order the events were written — and the next link-up calls this again. One
	* loop runs at a time: two would race for the same head and post it twice.
	*/
	pumpFrames() {
		if (this.pumping) return;
		this.pumping = true;
		(async () => {
			try {
				for (;;) {
					const batch = this.outbox[0];
					if (batch === void 0) break;
					if (!await this.post("/frames", {
						sessionId: batch.sessionId,
						events: batch.events
					})) break;
					this.outbox.shift();
					this.outboxEvents -= batch.events.length;
					this.outboxWarned = false;
				}
			} finally {
				this.pumping = false;
			}
		})();
	}
	/**
	* Report what became of one downstream command.
	*
	* Sent for both outcomes: the server holds the command as `delivered` until
	* this arrives, and a refusal that is never reported is indistinguishable
	* from a machine that went away mid-prompt.
	* @param commandId - the command being answered.
	* @param sessionId - its Session, echoed so the server can check the pairing.
	* @param ok - whether the prompt was admitted into the Session.
	* @param error - why not, when `ok` is false.
	*/
	ackCommand(commandId, sessionId, ok, error) {
		this.post("/ack", {
			commandId,
			sessionId,
			ok,
			...error === void 0 ? {} : { error }
		});
	}
	/**
	* Publish one step's streaming text.
	* @param payload - the step, the kind, and the whole text so far.
	*/
	publishStream(payload) {
		this.post("/stream-delta", {
			...payload,
			machineName: this.options.machineName()
		});
	}
	/**
	* Offer one question this machine's Session is waiting on to the server.
	*
	* Not queued, unlike a durable batch: a question is only useful while it is
	* still open, and one that failed to post is not lost work — the local UI is
	* still in the race and will answer it. So a drop costs the *remote* option
	* and nothing else, which is why the failure is reported (`onPost`) rather than
	* retried against a situation that has moved on.
	* @param payload - the question, its Session, and its TTL.
	*/
	publishQuestion(payload) {
		this.post("/question/open", { ...payload });
	}
	/**
	* Withdraw one question, or report that this machine answered it itself.
	* @param payload - the question and the outcome.
	*/
	publishQuestionClose(payload) {
		this.post("/question/close", { ...payload });
	}
	/**
	* Offer one approval this machine is blocked on to the server.
	*
	* Unqueued for the same reason a question is: it is only useful while the
	* machine is still waiting, the local answerer is still in the race, and a drop
	* costs the remote option rather than any work. A retry against a decided
	* approval would be worse than the drop — it would ask a reader to grant an
	* operation whose call has already failed closed.
	* @param payload - the approval, its Session, and its TTL.
	*/
	publishApproval(payload) {
		this.post("/approval/open", { ...payload });
	}
	/**
	* Withdraw one approval, or report that this machine decided it itself.
	* @param payload - the approval and the outcome.
	*/
	publishApprovalClose(payload) {
		this.post("/approval/close", { ...payload });
	}
	/**
	* Send one post and report whether the server took it.
	*
	* The result is the caller's, not an exception: a failed durable batch has to
	* be named by the caller that knows how many events it held, and a throw here
	* would only turn a reported loss into an unhandled rejection.
	* @param path - sync-server route.
	* @param body - JSON body.
	* @returns true only when the server answered 2xx.
	*/
	async post(path, body) {
		const token = this.token;
		if (token === void 0) {
			const reason = "no session token (the downstream stream is not established)";
			this.options.logger.warn(`dsh-session-sync: dropped ${path}: ${reason}`);
			this.options.onPost?.(path, false, reason);
			return false;
		}
		try {
			const response = await fetch(`${this.options.serverUrl}${path}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(POST_TIMEOUT_MS)
			});
			if (!response.ok) {
				const reason = `server answered ${String(response.status)}`;
				this.options.logger.warn(`dsh-session-sync: ${path} answered ${String(response.status)}`);
				this.options.onPost?.(path, false, reason);
				this.reconnect(reason);
				return false;
			}
			this.options.onPost?.(path, true);
			return true;
		} catch (error) {
			const reason = describe$2(error);
			this.options.logger.warn(`dsh-session-sync: ${path} failed: ${reason}`);
			this.options.onPost?.(path, false, reason);
			this.reconnect(reason);
			return false;
		}
	}
	/**
	* Give up on the current attempt so the link handshakes again.
	*
	* A failed post used to be the end of publishing rather than a hiccup: the
	* handler dropped the token, and the only thing that ever mints a new one is
	* a reconnect, which the held-open downstream stream never triggers on its
	* own. One transient `fetch failed` therefore stopped every publish — the
	* index, the durable events, and the whole live stream — for as long as the
	* stream stayed up, which is indefinitely. Aborting the attempt makes the
	* failure heal the way the retry loop already knows how.
	* @param reason - why the attempt is being abandoned.
	*/
	reconnect(reason) {
		this.setLinked(false, reason);
		this.connection?.abort();
	}
	async run(signal) {
		let backoffMs = 1e3;
		while (!signal.aborted) {
			const attempt = new AbortController();
			this.connection = attempt;
			const onAbort = () => {
				attempt.abort();
			};
			signal.addEventListener("abort", onAbort, { once: true });
			try {
				await this.connect(attempt.signal);
				backoffMs = 1e3;
			} catch (error) {
				if (signal.aborted) break;
				this.setLinked(false, describe$2(error));
			} finally {
				signal.removeEventListener("abort", onAbort);
				if (this.connection === attempt) this.connection = void 0;
			}
			await sleep(backoffMs, signal);
			backoffMs = Math.min(backoffMs * 2, 15e3);
		}
	}
	async connect(signal) {
		const response = await fetch(`${this.options.serverUrl}/handshake`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				machineName: this.options.machineName(),
				password: this.options.password()
			}),
			signal
		});
		if (!response.ok) throw new Error(response.status === 401 ? "password rejected by the server" : `handshake answered ${String(response.status)}`);
		const payload = await response.json();
		this.token = payload.token;
		await this.stream(signal, payload.token);
	}
	async stream(signal, token) {
		const response = await fetch(`${this.options.serverUrl}/stream`, {
			headers: {
				authorization: `Bearer ${token}`,
				accept: "text/event-stream"
			},
			signal
		});
		if (!response.ok || response.body === null) throw new Error(`stream answered ${String(response.status)}`);
		this.setLinked(true);
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let boundary = buffer.indexOf("\n\n");
			while (boundary >= 0) {
				const block = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);
				this.consume(block);
				boundary = buffer.indexOf("\n\n");
			}
		}
		throw new Error("stream closed");
	}
	/**
	* Dispatch one downstream frame.
	*
	* The two frames that are *not* commands are named here; everything in
	* {@link COMMAND_KINDS} is one. Listing the command kinds in this comparison
	* instead is what silently swallowed the console's answers at the origin: the
	* `DownstreamCommand` union grew a second kind, the runtime test did not, and a
	* dropped command is invisible from every side — no ack, no error, no state —
	* while the reader watches a card that never resolves. {@link COMMAND_KINDS} is
	* typed as a total map over that union, so the next kind cannot be forgotten
	* here without failing to compile.
	*
	* A kind this build does not know is still ignored, on purpose: a server that
	* learns a new frame must not be able to make an origin misread it as one it
	* does know.
	*/
	consume(block) {
		for (const line of block.split("\n")) {
			if (!line.startsWith("data:")) continue;
			const text = line.slice(5).trim();
			if (text === "") continue;
			try {
				const frame = JSON.parse(text);
				if (typeof frame.sessionId !== "string") continue;
				if (frame.kind === "resync") {
					this.options.onResync(frame.sessionId);
					continue;
				}
				if (frame.kind === "older") {
					if (typeof frame.beforeSeq === "number") this.options.onOlder(frame.sessionId, frame.beforeSeq, typeof frame.maxMessages === "number" ? frame.maxMessages : 0);
					continue;
				}
				if (!Object.hasOwn(COMMAND_KINDS, frame.kind)) continue;
				if (!this.admitted.admit(frame.commandId)) {
					this.ackCommand(frame.commandId, frame.sessionId, true);
					continue;
				}
				this.options.onCommand(frame);
			} catch {}
		}
	}
	/**
	* Record one link transition.
	*
	* A failure no longer discards the token: the token is what the *stream* is
	* authenticated with, and dropping it on a failed post turned every publish
	* that followed into "no session token" — a link that could not recover even
	* once the network had. A reconnect mints a fresh one anyway, and {@link stop}
	* is the one place the link is really over.
	*/
	setLinked(linked, error) {
		if (this.isLinked === linked && error === void 0) return;
		const wasLinked = this.isLinked;
		this.isLinked = linked;
		this.options.onStatus(error === void 0 ? { linked } : {
			linked,
			error
		});
		if (linked && !wasLinked) this.pumpFrames();
	}
};
/** Human-readable one-line failure text. */
function describe$2(error) {
	return error instanceof Error ? error.message : String(error);
}
/** Abortable delay. */
async function sleep(ms, signal) {
	await new Promise((resolve) => {
		const timer = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);
		const onAbort = () => {
			cleanup();
			resolve();
		};
		function cleanup() {
			clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
		}
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
//#endregion
//#region src/shared/log-stats.ts
/** One record, read as the loose shape these rows arrive in. */
function asRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
/** One finite number field, or undefined. */
function number(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
/**
* Compute the footer's totals for one Session log.
* @param events - the Session's events, in log order.
* @returns the totals; every field is present, and zero when the log says nothing.
*/
function logStats(events) {
	const usage = {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		reasoningTokens: 0
	};
	let turns = 0;
	let steps = 0;
	let firstTime;
	let lastTime;
	let stepMs = 0;
	let generationMs = 0;
	let openStepStart;
	let contextWindow;
	let contextUsed;
	const stepStarts = /* @__PURE__ */ new Map();
	for (const event of events) {
		const data = asRecord(event.data);
		if (firstTime === void 0) firstTime = event.time;
		lastTime = event.time;
		if (event.type === "turn/start") {
			const turn = number(data?.["turn"]);
			if (turn !== void 0) turns = Math.max(turns, turn);
			continue;
		}
		if (event.type === "step/start") {
			steps += 1;
			openStepStart = event.time;
			const turn = number(data?.["turn"]);
			const step = number(data?.["step"]);
			if (turn !== void 0 && step !== void 0) stepStarts.set(`${String(turn)}\u0000${String(step)}`, event.time);
			continue;
		}
		if (event.type === "step/end") {
			const turn = number(data?.["turn"]);
			const step = number(data?.["step"]);
			const started = turn === void 0 || step === void 0 ? void 0 : stepStarts.get(`${String(turn)}\u0000${String(step)}`);
			if (started !== void 0 && started === openStepStart) stepMs += Math.max(0, event.time - started);
			if (started !== void 0 && started === openStepStart) openStepStart = void 0;
			continue;
		}
		if (event.type === "request/context") {
			const reported = number(data?.["contextWindow"]);
			if (reported !== void 0 && reported > 0) contextWindow = reported;
			continue;
		}
		if (event.type === "assistant/message") {
			const reported = asRecord(data?.["usage"]);
			usage.inputTokens += number(reported?.["inputTokens"]) ?? 0;
			usage.outputTokens += number(reported?.["outputTokens"]) ?? 0;
			usage.cacheReadTokens += number(reported?.["cacheReadTokens"]) ?? 0;
			usage.reasoningTokens += number(reported?.["reasoningTokens"]) ?? 0;
			const surface = number(reported?.["totalTokens"]) ?? (number(reported?.["inputTokens"]) ?? 0) + (number(reported?.["outputTokens"]) ?? 0);
			if (surface > 0) contextUsed = surface;
			if (openStepStart !== void 0) generationMs += Math.max(0, event.time - openStepStart);
		}
	}
	const inputTotal = usage.inputTokens + usage.cacheReadTokens;
	const outputPerSecond = generationMs > 0 && usage.outputTokens > 0 ? Math.round(usage.outputTokens / (generationMs / 1e3)) : void 0;
	const context = contextWindow === void 0 || contextUsed === void 0 ? void 0 : {
		window: contextWindow,
		used: contextUsed,
		percent: Math.min(100, Math.round(contextUsed / contextWindow * 100))
	};
	return {
		turns,
		steps,
		usage,
		...context === void 0 ? {} : { context },
		...inputTotal > 0 ? { cacheHitPercent: Math.round(usage.cacheReadTokens / inputTotal * 1e3) / 10 } : {},
		stepMs,
		...outputPerSecond === void 0 ? {} : { outputPerSecond },
		...firstTime === void 0 ? {} : { firstTime },
		...lastTime === void 0 ? {} : { lastTime }
	};
}
//#endregion
//#region src/host/session-stats.ts
/**
* The machine's own answer to "how much is in this Session" — read from the
* Session's whole log and published with the index.
*
* The console can only ever count what it *holds*, and what it holds is what the
* mirror retained: a window. So the two footers disagreed for a reason no amount
* of console-side arithmetic could fix — a 6,257-event Session whose mirror kept
* 4,000 showed 632 steps against the machine's 967. This half is the authority:
* the machine that owns the log reads all of it, computes the same totals the
* console computes, and states them.
*
* It is deliberately optional and off the critical path. Every failure ends as
* "no stats this round" — an unreadable log, a Session that has no file yet, a
* build without `node:zlib` zstd support, a frame layout that changed. The index
* still carries the Session; the console then falls back to counting what it
* holds, which is exactly today's behaviour.
*
* The total is cached against the sequence it was computed at, so a Session that
* grew by one event does not re-decode five megabytes, and a Session that has not
* changed is answered from memory.
*/
/** The Zstandard frame magic, little-endian. */
const ZSTD_MAGIC = 4247762216;
/**
* The path segment DSH uses for one project directory.
*
* Mirrored from the persistence backend's `projectKey`: separators collapse to a
* single `-`, unsafe code units become `~XXXX`, and the whole is wrapped in `--`.
* Reproduced rather than imported because this plugin must not depend on DSH's
* internals; a mismatch ends as "no stats", never as a wrong number, because the
* totals are only published when a log was actually read.
* @param cwd - the Session's working directory.
* @returns the directory name under the sessions root.
*/
function projectKey(cwd) {
	let readable = "";
	let separatorRun = false;
	for (let index = 0; index < cwd.length; index += 1) {
		const code = cwd.charCodeAt(index);
		const character = String.fromCharCode(code);
		if (character === "/" || character === "\\" || character === ":") {
			if (!separatorRun) readable += "-";
			separatorRun = true;
		} else if (character !== "~" && /^[A-Za-z0-9._-]$/.test(character)) {
			readable += character;
			separatorRun = false;
		} else {
			readable += "~" + code.toString(16).toUpperCase().padStart(4, "0");
			separatorRun = false;
		}
	}
	return `--${(readable.replace(/^-+/, "") || "root").slice(0, 251)}--`;
}
/**
* Find the newest log file for one Session.
*
* The format generation is in the filename (`session.v4.jsonl.zstd`), so the
* version is not hardcoded: the highest generation present wins, and its
* compression is read off the suffix.
* @param root - the sessions root, `<DSH_HOME>/sessions`.
* @param cwd - the Session's working directory; undefined means "no cwd recorded".
* @param sessionId - the Session id, used verbatim as the directory name.
* @returns the absolute path, or undefined when the Session has no log yet.
*/
async function findLogPath(root, cwd, sessionId) {
	const directory = cwd === void 0 ? join(root, "_no-cwd", sessionId) : join(root, projectKey(cwd), sessionId);
	let names;
	try {
		names = await readdir(directory);
	} catch {
		return;
	}
	const best = names.map((name) => /^session\.v(\d+)\.jsonl(\.zstd)?$/.exec(name)).filter((match) => match !== null).map((match) => ({
		name: match[0],
		version: Number(match[1]),
		compressed: match[2] === ".zstd"
	})).sort((left, right) => right.version - left.version || Number(right.compressed) - Number(left.compressed))[0];
	return best === void 0 ? void 0 : join(directory, best.name);
}
/**
* Walk the structurally complete Zstandard frames in one concatenated stream.
*
* DSH writes a Session log as one frame per durable batch, and Node's decompressor
* stops after the first — so the frames have to be found first. A torn final frame
* is reported rather than thrown: the log is being appended to while it is read.
* @param buffer - the whole file.
* @returns each complete frame's byte range, and where an incomplete one starts.
*/
function scanZstdFrames(buffer) {
	const frames = [];
	let offset = 0;
	while (offset < buffer.length) {
		const start = offset;
		if (buffer.length - offset < 4) return {
			frames,
			tornStart: start
		};
		if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return {
			frames,
			tornStart: start
		};
		offset += 4;
		if (offset === buffer.length) return {
			frames,
			tornStart: start
		};
		const descriptor = buffer.readUInt8(offset);
		offset += 1;
		if ((descriptor & 24) !== 0) return {
			frames,
			tornStart: start
		};
		const contentSizeFlag = descriptor >>> 6;
		const singleSegment = (descriptor & 32) !== 0;
		const checksum = (descriptor & 4) !== 0;
		const dictionaryFlag = descriptor & 3;
		const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
		const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
		const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
		if (buffer.length - offset < remainingHeaderBytes) return {
			frames,
			tornStart: start
		};
		offset += remainingHeaderBytes;
		for (;;) {
			if (buffer.length - offset < 3) return {
				frames,
				tornStart: start
			};
			const blockHeader = buffer.readUIntLE(offset, 3);
			offset += 3;
			const lastBlock = (blockHeader & 1) !== 0;
			const blockType = blockHeader >>> 1 & 3;
			const blockSize = blockHeader >>> 3;
			if (blockType === 3) return {
				frames,
				tornStart: start
			};
			const payloadBytes = blockType === 1 ? 1 : blockSize;
			if (buffer.length - offset < payloadBytes) return {
				frames,
				tornStart: start
			};
			offset += payloadBytes;
			if (lastBlock) break;
		}
		if (checksum) {
			if (buffer.length - offset < 4) return {
				frames,
				tornStart: start
			};
			offset += 4;
		}
		frames.push({
			start,
			end: offset
		});
	}
	return { frames };
}
/**
* Read one Session's log as events.
*
* The file is a header line plus one JSON object per line, either plain or inside
* concatenated Zstandard frames. Only the fields the totals need are kept, so the
* decoded text does not stay resident after the call.
* @param path - the log file.
* @returns the events in log order, or undefined when the file cannot be read as
*   a Session log at all — the caller then publishes no totals rather than wrong ones.
*/
async function readLogEvents(path) {
	let bytes;
	try {
		bytes = await readFile(path);
	} catch {
		return;
	}
	if (!path.endsWith(".zstd")) {
		const plain = splitLines(bytes.toString("utf8"), false);
		return {
			events: parseLines([...plain.lines, ...plain.carry === "" ? [] : [plain.carry]]),
			truncated: false
		};
	}
	const scan = scanZstdFrames(bytes);
	const lines = [];
	let carry = "";
	for (const frame of scan.frames) {
		let plain;
		try {
			plain = zstdDecompressSync(bytes.subarray(frame.start, frame.end));
		} catch {
			return;
		}
		const part = splitLines(carry + plain.toString("utf8"), false);
		carry = part.carry;
		lines.push(...part.lines);
	}
	const tail = splitLines(carry, true);
	lines.push(...tail.lines);
	return {
		events: parseLines(lines),
		truncated: scan.tornStart !== void 0
	};
}
/**
* Split one decoded chunk into complete lines.
* @param text - the decoded text, with any incomplete line from the previous chunk
*   already prepended.
* @param flush - whether to accept the remaining text as a complete final line.
* @returns the complete lines, and the new incomplete tail.
*/
function splitLines(text, flush) {
	if (flush) return {
		lines: text === "" ? [] : [text],
		carry: ""
	};
	const parts = text.split("\n");
	const next = parts.pop() ?? "";
	return {
		lines: parts.filter((part) => part.trim() !== ""),
		carry: next
	};
}
/** Parse JSONL rows into the event shape the totals read, ignoring what will not parse. */
function parseLines(lines) {
	const events = [];
	for (const line of lines) {
		let row;
		try {
			row = JSON.parse(line);
		} catch {
			continue;
		}
		if (typeof row.type !== "string" || typeof row.seq !== "number") continue;
		events.push({
			type: row.type,
			seq: row.seq,
			time: typeof row.time === "number" ? row.time : 0,
			data: row.data
		});
	}
	return events;
}
/** How long one Session's totals are reused before the log is read again. */
const CACHE_MS = 3e4;
/**
* Reads Session logs and remembers their totals.
*
* One instance per engine. The cache is what keeps this off the notice of the
* periodic reconcile: a five-megabyte log is decoded once per interval per
* Session, not once per publish.
*/
var SessionStatsReader = class {
	root;
	cache = /* @__PURE__ */ new Map();
	reading = /* @__PURE__ */ new Set();
	/**
	* @param root - the sessions root, `<DSH_HOME>/sessions`.
	*/
	constructor(root) {
		this.root = root;
	}
	/** The totals already computed for one Session, without reading anything. */
	cached(sessionId) {
		const entry = this.cache.get(sessionId);
		return entry === void 0 ? void 0 : {
			seq: entry.seq,
			stats: entry.stats
		};
	}
	/**
	* Read one Session's log and compute its totals, unless a fresh reading exists.
	* @param sessionId - the Session whose log to read.
	* @param cwd - the Session's working directory, as its own index states it.
	* @param seq - the highest sequence the machine has published for it.
	* @returns the totals and the sequence they cover, or undefined when there is
	*   nothing to read yet.
	*/
	async compute(sessionId, cwd, seq) {
		const entry = this.cache.get(sessionId);
		const now = Date.now();
		if (entry !== void 0 && entry.seq >= seq && now - entry.at < CACHE_MS) return {
			seq: entry.seq,
			stats: entry.stats
		};
		if (this.reading.has(sessionId)) return entry;
		this.reading.add(sessionId);
		try {
			const path = await findLogPath(this.root, cwd, sessionId);
			if (path === void 0) return void 0;
			const read = await readLogEvents(path);
			if (read === void 0) return void 0;
			const stats = logStats(read.events);
			const computed = {
				seq: read.events.at(-1)?.seq ?? -1,
				stats,
				at: Date.now()
			};
			this.cache.set(sessionId, computed);
			return {
				seq: computed.seq,
				stats: computed.stats
			};
		} finally {
			this.reading.delete(sessionId);
		}
	}
	/** Drop a Session's totals — its publish switch went off, or its log went away. */
	forget(sessionId) {
		this.cache.delete(sessionId);
	}
	/** Release everything. */
	dispose() {
		this.cache.clear();
		this.reading.clear();
	}
};
//#endregion
//#region src/host/version.ts
/**
* The version of this plugin, as the running build states it.
*
* Two halves of one deployment are routinely different builds: an origin loads
* its Host half at process start and keeps it until it is restarted, while a
* server's Host half follows whatever `pnpm install` last put there. Nothing in
* the protocol used to say so, and the way that was noticed was reading two
* lockfiles by hand — the origin ran `0.7.1` for hours against a server on
* `0.7.3`, and a state frame that had carried one string would have said it at a
* glance.
*
* The manifest is located relative to this module rather than imported: the
* built bundle lives in `lib/` and the sources in `src/host/`, a JSON import
* would have to travel through the bundle.
*
* **It is read once, at module load, and then frozen.** Reading it per call answers
* "what is installed" rather than "what is this process running", and those are the
* two different things this whole module exists to tell apart: after `pnpm update`
* with no restart, a per-call reading has the *running* process announce the new
* version while its loaded code is still the old one — a false agreement, which is
* exactly the failure the handshake was built to expose. It happened here (the
* origin reported `0.10.4` while running `0.10.0`'s dispatcher), and the only reason
* it was caught is that a new state *field* appeared that the old code could not
* have produced.
*
* A manifest that cannot be found or parsed is `unknown` — never a guess, and never
* a version this process cannot vouch for.
*/
/** The two places `package.json` sits relative to this module's two homes. */
const CANDIDATES = ["../package.json", "../../package.json"];
/**
* This package's own version, as of the moment this build was loaded.
* @returns the `version` field of this package's manifest, or `unknown`.
*/
const pluginVersion = (() => {
	for (const candidate of CANDIDATES) try {
		const path = fileURLToPath(new URL(candidate, import.meta.url));
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (parsed.name === "dsh-session-sync" && typeof parsed.version === "string") {
			const read = parsed.version;
			return () => read;
		}
	} catch {}
	return () => "unknown";
})();
//#endregion
//#region src/host/service.ts
/**
* The sync engine.
*
* One service instance owns both roles. As a **client** it lists local Sessions,
* keeps a `follow` stream open for each Session the user marked for sync, and
* publishes the index plus durable events to the server. As a **server** it runs
* the listener, mirrors what every origin publishes, and turns a browser's
* takeover prompt into a downstream command.
*
* Everything the browser sees is read from this service, and every write goes
* through {@link SessionSyncService.patch}; there is no second source of truth.
*/
/** How often the local index is re-read and the follow set reconciled. */
const RECONCILE_MS = 1e4;
/**
* How often buffered events, and the streaming text, are handed to the link.
*
* Measured on this deployment: the model's deltas arrive at roughly 200 a
* second, so a whole thinking block is on the wire in under three seconds. At
* the previous 400 ms that was three to six visible updates for an entire
* block, which reads as one shot however it is rendered; 150 ms keeps the relay
* ahead of the burst. Each update carries the step's whole text, so the cost of
* the finer tick is bounded by the text, not by the number of deltas.
*/
const FLUSH_MS = 150;
/** Bound on events buffered per Session while the link is down. */
const BUFFER_LIMIT = 4e3;
/** Bound on steps whose streamed text is still tracked, per kind. */
const LIVE_LIMIT = 64;
/**
* Shortest gap between two replays of the same Session.
*
* The server asks on a 30 s timer while a hole survives, and a follow that is
* still delivering its snapshot must not be torn down and restarted underneath
* itself — that would turn a repair into the reason it never finishes.
*/
const RESYNC_FLOOR_MS = 5e3;
/**
* Shortest gap between two history reads for the same Session.
*
* A reader walking up the transcript asks repeatedly, and every answer is a page
* of the log plus a POST. The server already collapses asks it cannot serve, and
* this keeps a burst of clicks from becoming a burst of disk reads.
*/
const PAGE_FLOOR_MS = 1e3;
/** The two kinds of text one step streams. */
const STREAM_KINDS = ["reasoning", "text"];
/** The accumulator key of one step's text. */
function sessionLiveKey(sessionId, turn, step, kind) {
	return `${sessionId}|${String(turn)}|${String(step)}|${kind}`;
}
/** The settlement key of one step: what says that step is over. */
function sessionStepKey(sessionId, turn, step) {
	return `${sessionId}|${String(turn)}|${String(step)}`;
}
/** The accumulator key of the step one follow has open. */
function liveKey(handle, kind) {
	return sessionLiveKey(handle.sessionId, handle.turn, handle.step, kind);
}
/** The settlement key of the step one follow has open. */
function stepKey(handle) {
	return sessionStepKey(handle.sessionId, handle.turn, handle.step);
}
/** The engine. */
var SessionSyncService = class SessionSyncService {
	ctx;
	store;
	/**
	* The configuration in force, and the store it came from.
	*
	* A *snapshot*, not the store: the engine reads a field dozens of times per view
	* and the settings document re-reads its section on every access. The store is
	* authoritative, and {@link adoptSettings} is what replaces this snapshot when
	* the settings document changes underneath a running engine.
	*/
	config;
	hub;
	browsers = /* @__PURE__ */ new Set();
	follows = /* @__PURE__ */ new Map();
	server;
	link;
	linked = false;
	listenError;
	linkError;
	reconcileTimer;
	flushTimer;
	/** Distinct follow frame types seen, bounded; the contract made visible. */
	followFrameTypes = /* @__PURE__ */ new Set();
	followEvents = 0;
	/** Opening frames that carried no readable history. */
	historyMisses = 0;
	/** What the controller listed, and what survived the row filter. */
	localItems = 0;
	localRows = 0;
	/** Field names seen in the opening frames, recorded once. */
	followShapes = [];
	/** Posts per route: the split between the origin and the server. */
	postCounts = /* @__PURE__ */ new Map();
	followError;
	followErrorSession;
	/** Streaming text per step, keyed session|turn|step|kind; relayed, never mirrored. */
	liveText = /* @__PURE__ */ new Map();
	liveDirty = /* @__PURE__ */ new Set();
	/** Steps whose settlement already arrived, so a late delta cannot revive them. */
	settled = /* @__PURE__ */ new Set();
	/** When each Session was last replayed at the server's request. */
	lastResync = /* @__PURE__ */ new Map();
	/** When each Session was last asked for an older page of history. */
	pageAsked = /* @__PURE__ */ new Map();
	/**
	* Sessions whose log this machine has read back to its beginning, by proof.
	*
	* Service-scoped rather than per-follow because it is a fact about what has
	* been *published*, not about one attempt at opening a window — and a follow
	* handle is replaced by every reconnect and every replay the server asks for.
	* Kept per Session because the alternative is worse than the bug it fixes: a
	* handle's opening frame reports `hasMore` for its own tail window, which is
	* true of every Session longer than that window, so trusting it on each
	* re-open put the reader's "older" control back on screen forever.
	*
	* The value is the *evidence*, not a flag, because the claim has to be
	* falsifiable after the fact: a read that reported "nothing older" while its
	* window never reached the log's first sequence is not proof of a beginning,
	* and treating it as one latched `hasOlder` to false for the rest of the
	* episode — the origin then denied history it was holding, the mirror's floor
	* froze, and nothing left running could clear it.
	*/
	startProven = /* @__PURE__ */ new Map();
	/**
	* Owns the signal for the history reads a reader's paging triggers.
	*
	* Service-scoped on purpose: a page read is a read of the Session's log, not a
	* step of any follow attempt, so tying it to a follow's lifecycle is what made
	* a page read die with "this operation was aborted" whenever the follow was
	* replaced underneath it.
	*/
	pageAbort = new AbortController();
	/**
	* What the last history read did, for the settings page.
	*
	* The host half writes its log where this deployment cannot read it, and a
	* page that comes back empty is indistinguishable from a machine that has
	* nothing older — so the one fact that separates them is published here.
	*/
	lastPageRead;
	/**
	* Why the most recent attempt to read history did not run.
	*
	* Kept apart from {@link lastPageRead} because they answer different questions
	* and the second must not erase the first: the sweep re-asks for a gap while a
	* read floor is still active, and a skipped attempt recorded *as* the read made
	* a served page look like a refused one — the diagnosis of the next fault would
	* have been the limiter's, not the fault's.
	*/
	lastPageAttempt;
	/** Reads this machine's own Session logs for the whole-log totals the index carries. */
	stats;
	/** The last publish attempt, as the settings page reports it. */
	lastPublish;
	/**
	* The two-sided race for the questions this machine's Sessions ask.
	*
	* Owned here because the link is: the relay's sink reads {@link link} at call
	* time, so a question asked while the link is down is simply answered locally
	* rather than queued against a stream that may never come back.
	*/
	relay;
	/**
	* The approval half of the same idea, and the reason it is a separate object:
	* an approval's outcome is *permission*, so it is offered only for Sessions a
	* user opted in by name (see {@link approveable}) and its TTL is shorter.
	*/
	approvals;
	disposed = false;
	constructor(ctx, home, config, store) {
		this.ctx = ctx;
		this.store = store;
		this.config = config;
		this.hub = new SyncHub((frame) => {
			this.broadcast(frame);
		}, () => this.view(), this.ctx.logger);
		this.relay = new InteractionRelay({
			open: (sessionId, questionId, questions, expiresAt) => {
				this.link?.publishQuestion({
					sessionId,
					questionId,
					questions,
					expiresAt
				});
			},
			close: (sessionId, questionId, outcome) => {
				this.link?.publishQuestionClose({
					sessionId,
					questionId,
					outcome
				});
			},
			now: () => Date.now()
		});
		this.approvals = new ApprovalRelay({
			open: (sessionId, approvalId, approval, expiresAt) => {
				this.link?.publishApproval({
					sessionId,
					approvalId,
					approval,
					expiresAt
				});
			},
			close: (sessionId, approvalId, outcome) => {
				this.link?.publishApprovalClose({
					sessionId,
					approvalId,
					outcome
				});
			},
			now: () => Date.now()
		});
		this.stats = new SessionStatsReader(join(home, "sessions"));
	}
	/**
	* Resolve the configuration and build the engine.
	*
	* The configuration comes from the DSH settings document when the composition
	* mounts one and this plugin has a configurable row; otherwise it comes from the
	* plugin's own JSON document, exactly as before. A legacy JSON document is
	* imported into settings and archived on the first such start (see
	* `config-store.ts`).
	* @param ctx - the scoped Host context that already resolved `sessionController`.
	* @param home - Harness home directory.
	* @param declared - the validated row config, when the Loader supplied one.
	* @returns the ready service; the caller decides when to {@link start} it.
	*/
	static async create(ctx, home, declared) {
		const store = await ConfigStore.create(ctx, home, declared);
		return new SessionSyncService(ctx, home, store.current(), store);
	}
	/**
	* Adopt the settings document's current values, if it has changed.
	*
	* Registered with `settings/document-updated`, so an edit made on the Plugins
	* page — which the settings service hot-commits into the running plugin — also
	* reaches a browser session that is already open.
	* @returns the configuration in force after the re-read.
	*/
	async adoptSettings() {
		const previous = this.config;
		await this.store.adoptDocument();
		const next = this.store.current();
		this.config = next;
		if (previous.isServer !== next.isServer || serverOrigin(previous.serverUrl) !== serverOrigin(next.serverUrl) || previous.listenHost !== next.listenHost || previous.listenPort !== next.listenPort) await this.applyRole();
		this.broadcast({
			type: "state",
			state: this.view()
		});
		return this.config;
	}
	/** Begin reconciling and bring the configured role up. */
	start() {
		this.reconcileTimer = setInterval(() => {
			this.hub.expireCommands();
			this.hub.retryCommands();
			this.hub.sweepGaps();
			this.hub.sweepQuestions();
			this.hub.sweepApprovals();
			this.reconcile();
		}, RECONCILE_MS);
		this.flushTimer = setInterval(() => {
			this.flushStream();
			this.flush();
		}, FLUSH_MS);
		this.applyRole();
	}
	/** Stop every timer and connection, and drop every subscriber. */
	async dispose() {
		this.disposed = true;
		this.relay.withdrawAll("aborted");
		this.approvals.withdrawAll("aborted");
		if (this.reconcileTimer !== void 0) clearInterval(this.reconcileTimer);
		if (this.flushTimer !== void 0) clearInterval(this.flushTimer);
		for (const handle of this.follows.values()) handle.abort.abort();
		this.follows.clear();
		this.link?.stop();
		this.link = void 0;
		await this.stopServer();
		this.stats.dispose();
		this.browsers.clear();
	}
	/** The configuration as the browser should render it. */
	configView() {
		return {
			...this.config,
			syncSessions: { ...this.config.syncSessions },
			approveSessions: { ...this.config.approveSessions }
		};
	}
	/** The live role, listener, link, and mirror state. */
	view() {
		const listening = this.server !== void 0;
		const linked = this.linked;
		const batch = this.link?.batchReport();
		return {
			role: this.config.isServer ? "server" : "client",
			machineName: this.config.machineName,
			serverUrl: this.config.serverUrl,
			pluginVersion: pluginVersion(),
			listening,
			...this.listenError === void 0 ? {} : { listenError: this.listenError },
			linked,
			...this.linkError === void 0 ? {} : { linkError: this.linkError },
			machines: this.config.isServer ? this.hub.machines() : [],
			...this.config.isServer ? { questions: this.hub.questions() } : {},
			...this.config.isServer ? { approvals: this.hub.approvals() } : {},
			published: Object.values(this.config.syncSessions).filter(Boolean).length,
			...this.lastPublish === void 0 ? {} : { publish: this.lastPublish },
			...this.config.isServer ? {} : {
				interactions: this.relay.counts(),
				approvalCounts: this.approvals.counts(),
				follow: {
					frames: [...this.followFrameTypes],
					events: this.followEvents,
					historyMisses: this.historyMisses,
					localItems: this.localItems,
					localRows: this.localRows,
					posts: [...this.postCounts].map(([route, entry]) => route + ":" + String(entry.count) + (entry.ok ? "" : "!")),
					shapes: this.followShapes,
					...this.followError === void 0 ? {} : { error: this.followError },
					...this.followErrorSession === void 0 ? {} : { sessionId: this.followErrorSession }
				},
				...batch === void 0 ? {} : { batch },
				follows: [...this.follows.values()].map((handle) => ({
					sessionId: handle.sessionId,
					cursor: handle.cursor,
					firstSeq: handle.firstSeq,
					sentFirstSeq: handle.sentFirstSeq,
					lastSeq: handle.lastSeq,
					hasOlder: handle.hasOlder,
					opened: handle.opened,
					pending: handle.pending.length,
					events: handle.seen,
					...handle.ended === void 0 ? {} : { ended: handle.ended }
				})),
				...this.lastPageRead === void 0 ? {} : { page: this.lastPageRead },
				...this.lastPageAttempt === void 0 ? {} : { pageAttempt: this.lastPageAttempt },
				...this.startProven.size === 0 ? {} : { started: [...this.startProven].map(([sessionId, evidence]) => ({
					sessionId,
					at: evidence.at,
					throughSeq: evidence.throughSeq,
					records: evidence.records,
					source: evidence.source
				})) }
			}
		};
	}
	/**
	* Every local Session, newest activity first, with its publish switch.
	* @returns presentation rows for the configuration page.
	*/
	async localSessions() {
		const controller = this.controller();
		if (controller === void 0) return [];
		const { items } = await controller.list({}, new AbortController().signal);
		this.localItems = items.length;
		const archived = this.archivedSessions();
		const rows = items.filter((item) => (item.parentSessionId ?? void 0) === void 0 && item.origin !== "subagent").filter((item) => !archived.has(item.sessionId)).map((item) => this.row(item));
		this.localRows = rows.length;
		return rows.sort((left, right) => right.updatedAt - left.updatedAt);
	}
	/**
	* Apply one partial configuration write and persist it.
	*
	* The write goes to whichever store is live — the DSH settings document when
	* there is one, the plugin's JSON document otherwise — and the resulting
	* configuration is what the engine keeps, so the page and the engine cannot
	* disagree about what was just saved.
	* @param patch - the fields to change; absent fields keep their value.
	* @returns the complete configuration after the write.
	*/
	async patch(patch) {
		const previous = this.config;
		this.config = await this.store.patch(patch);
		const next = this.config;
		if (previous.isServer !== next.isServer || serverOrigin(previous.serverUrl) !== serverOrigin(next.serverUrl) || previous.listenHost !== next.listenHost || previous.listenPort !== next.listenPort || !next.isServer && previous.machineName !== next.machineName) await this.applyRole();
		else if (patch.sessionSync !== void 0) await this.reconcile();
		this.broadcast({
			type: "state",
			state: this.view()
		});
		return this.configView();
	}
	/**
	* Read one page of a mirrored Session's transcript.
	* @param machineName - owning machine.
	* @param sessionId - published Session.
	* @param page - page size and the exclusive upper sequence to read below.
	* @returns the page, or undefined when nothing is mirrored under that address.
	*/
	transcript(machineName, sessionId, page) {
		return this.hub.transcript(machineName, sessionId, page);
	}
	/**
	* Issue one takeover prompt for a Session published to this server.
	* @param machineName - the machine that owns the Session.
	* @param sessionId - the published Session.
	* @param text - the prompt text.
	* @returns the accepted command's id, or why the command was refused.
	*/
	submitCommand(machineName, sessionId, text) {
		if (!this.config.isServer) return {
			ok: false,
			reason: "this instance is not the sync server"
		};
		return this.hub.submitCommand(machineName, sessionId, text, this.config.machineName);
	}
	/**
	* Issue the console's answer to one relayed question.
	* @param machineName - the machine that asked.
	* @param questionId - the question being answered.
	* @param answers - the console's answers.
	* @returns the accepted command's id, or why it was refused.
	*/
	submitAnswer(machineName, questionId, answers) {
		if (!this.config.isServer) return {
			ok: false,
			reason: "this instance is not the sync server"
		};
		return this.hub.submitAnswer(machineName, questionId, answers, this.config.machineName);
	}
	/**
	* Issue the console's decision on one relayed approval.
	*
	* Server role only, like {@link submitAnswer}: the decision exists to be handed
	* to the machine that is blocked, and only a server holds those links. The
	* machine still has the last word — it claims the decision only while it is
	* still waiting — so what this method's caller gets back is a *delivery*
	* acknowledgement, not a grant.
	* @param machineName - the machine that is blocked.
	* @param approvalId - the approval being decided.
	* @param decision - allow once, or reject.
	* @returns the accepted command's id, or why it was refused.
	*/
	submitApproval(machineName, approvalId, decision) {
		if (!this.config.isServer) return {
			ok: false,
			reason: "this instance is not the sync server"
		};
		return this.hub.submitApproval(machineName, approvalId, decision, this.config.machineName);
	}
	/**
	* Ask the console and the machine's own UI at once, and take the first answer.
	*
	* Registered ahead of the shipped browser answerer so that both are asked: the
	* local side through `next()`, which is what actually reaches that answerer
	* (the Remote waterfall bridge), and the console down the sync link. The first
	* to answer claims the question, and the other is told so.
	*
	* Only a published Session is relayed, and only while this machine is a
	* publisher with a link: for anything else this listener delegates on the first
	* line and the product behaves exactly as it does without this plugin.
	* @param ctx - the Host context that owns the registration.
	*/
	answerQuestions(ctx) {
		const listener = (request, next) => {
			const sessionId = request.agent?.id;
			if (sessionId === void 0 || !this.relayable(sessionId)) return next();
			return this.relay.race(sessionId, request.questions, next);
		};
		ctx.effect(() => ctx.on("user-questions/request", listener, { prepend: true }), "dsh-session-sync: question relay");
	}
	/**
	* Whether one Session's questions are worth offering to a console.
	* @param sessionId - the Session being asked in.
	* @returns true when this machine publishes it to a server it is linked to.
	*/
	relayable(sessionId) {
		if (this.config.isServer) return false;
		if (this.config.syncSessions[sessionId] !== true) return false;
		return this.link !== void 0;
	}
	/**
	* Ask the console and the machine's own UI at once, and take the first decision.
	*
	* Registered ahead of the shipped browser answerer, exactly like the question
	* relay, and gated one notch tighter. A question may be relayed for any published
	* Session; an approval only for a Session the user opted in by name, because the
	* outcome is permission rather than information: `allowed-once` releases a tool
	* call this machine's own preset was gating, and that authority must not follow
	* from the act of publishing a conversation.
	*
	* What this listener cannot do is *widen* a denial. A `never` policy is enforced by
	* the upstream service before it dispatches this event, so a Session whose policy
	* refuses an operation never reaches an answerer at all — the console is offered
	* only what the machine left open.
	* @param ctx - the Host context that owns the registration.
	*/
	answerApprovals(ctx) {
		const listener = (request, next) => {
			const sessionId = request.agent?.id;
			if (sessionId === void 0 || !this.approveable(sessionId)) return next();
			return this.approvals.race(sessionId, request, next);
		};
		ctx.effect(() => ctx.on("approval/request", listener, { prepend: true }), "dsh-session-sync: approval relay");
	}
	/**
	* Whether one Session's approvals may be decided from a console.
	*
	* Two switches, not one, and the published one is required as well: the console
	* resolves what is being approved from the mirrored transcript, so an approval for
	* an un-published Session would ask a reader to grant something they cannot see.
	* @param sessionId - the Session the approval belongs to.
	* @returns true when this Session's approvals are offered to the console.
	*/
	approveable(sessionId) {
		if (!this.relayable(sessionId)) return false;
		return this.config.approveSessions[sessionId] === true;
	}
	/**
	* Subscribe one browser to every state and event frame.
	* @param sink - the browser's frame sink.
	* @returns the detacher.
	*/
	attachBrowser(sink) {
		this.browsers.add(sink);
		sink.send({
			type: "state",
			state: this.view()
		});
		return () => {
			this.browsers.delete(sink);
		};
	}
	/** Bring the configured role up, replacing whatever was running. */
	async applyRole() {
		await this.stopServer();
		this.link?.stop();
		this.link = void 0;
		this.linkError = void 0;
		this.linked = false;
		this.follows.forEach((handle) => {
			handle.abort.abort();
		});
		this.follows.clear();
		if (this.config.isServer) try {
			this.server = await startSyncServer({
				host: this.config.listenHost,
				port: this.config.listenPort,
				password: () => this.config.password,
				serverName: () => this.config.machineName,
				hub: this.hub,
				logger: this.ctx.logger
			});
			this.listenError = void 0;
		} catch (error) {
			this.server = void 0;
			this.listenError = describe$1(error);
			this.ctx.logger.warn(`dsh-session-sync: sync server failed to bind: ${this.listenError}`);
		}
		else {
			this.listenError = void 0;
			const origin = serverOrigin(this.config.serverUrl);
			if (origin !== "") {
				this.link = new OriginLink({
					serverUrl: origin,
					password: () => this.config.password,
					machineName: () => this.config.machineName,
					logger: this.ctx.logger,
					onCommand: (command) => {
						this.runCommand(command);
					},
					onStatus: (status) => {
						this.onLinkStatus(status);
					},
					onResync: (sessionId) => {
						this.resyncSession(sessionId);
					},
					onOlder: (sessionId, beforeSeq, maxMessages) => {
						this.pullOlder(sessionId, beforeSeq, maxMessages);
					},
					onPost: (path, ok, error) => {
						this.notePublish(path, ok, error);
					}
				});
				this.link.start();
			}
		}
		await this.reconcile();
	}
	/** Tear the server-role listener down, if one is up. */
	async stopServer() {
		const server = this.server;
		this.server = void 0;
		if (server === void 0) return;
		try {
			await server.close();
		} catch (error) {
			this.ctx.logger.warn(`dsh-session-sync: sync server shutdown failed: ${describe$1(error)}`);
		}
	}
	/** React to one link transition, re-reading history after a reconnect. */
	onLinkStatus(status) {
		const wasLinked = this.linked;
		this.linked = status.linked;
		this.linkError = status.error;
		if (status.linked && !wasLinked) {
			this.restartFollows();
			this.reconcile();
		}
		this.broadcast({
			type: "state",
			state: this.view()
		});
	}
	/**
	* Re-open every tracked follow so each one replays its opening snapshot.
	*
	* The buffer is emptied into the link *before* the follow is torn down. A
	* follow that is aborted takes its `pending` with it, and the link flaps on
	* every failed post — so a burst sitting in that buffer when the stream
	* dropped was discarded, and because it sat above everything the mirror held,
	* the loss left no hole to notice: just a Session that was quietly a little
	* behind, forever.
	*/
	restartFollows() {
		const sessionIds = [...this.follows.keys()];
		for (const [sessionId, handle] of this.follows) this.drain(handle, sessionId);
		for (const handle of this.follows.values()) handle.abort.abort();
		this.follows.clear();
		for (const sessionId of sessionIds) this.startFollow(sessionId);
	}
	/**
	* Hand one follow's buffered events to the link, so aborting it loses nothing.
	* @param handle - the follow about to be replaced.
	* @param sessionId - the Session it tracks.
	*/
	drain(handle, sessionId) {
		if (handle.pending.length === 0) return;
		this.link?.publishFrames(sessionId, handle.pending.splice(0, handle.pending.length));
	}
	/**
	* Read a page of this Session's history for the mirror.
	*
	* A follow opens on a tail window, so the mirror's copy begins
	* mid-conversation and paging inside it can never reach the start. This is the
	* only path to what came before, and it is driven by a reader asking: sending
	* the whole log for every published Session would undo the reason the mirror
	* serves a page at all.
	*
	* The page is cut against the follow's own opening cursor, so it cannot
	* disagree with the window being read, and its events go out through the same
	* buffer and outbox as live ones — which is what makes them arrive in order
	* and survive a failed post.
	*
	* `throughSeq` arrives as the *inclusive* upper bound the reader asked for —    * the lowest sequence its window holds — while the controller's `beforeSeq` is
	* exclusive, so the page is asked for one past it. Reading the reader's value
	* as if it were already exclusive left exactly that one event missing from
	* every page, which put a hole at every page boundary of a backfill.
	* @param sessionId - the Session the server wants older history for.
	* @param throughSeq - the reader's lowest held sequence; the page ends here.
	* @param maxMessages - how many messages the page should span, at most.
	*/
	async pullOlder(sessionId, throughSeq, maxMessages) {
		const handle = this.follows.get(sessionId);
		const controller = this.controller();
		const beforeSeq = throughSeq + 1;
		const pageThrough = beforeSeq - 1;
		const skip = controller === void 0 ? "no-controller" : typeof controller.page !== "function" ? "no-page-api" : handle === void 0 ? "no-follow" : handle.cursor < 0 ? "no-cursor" : void 0;
		const now = Date.now();
		if (skip !== void 0) {
			this.lastPageAttempt = {
				sessionId,
				beforeSeq,
				reason: skip,
				at: now
			};
			if (this.lastPageRead?.records === void 0) this.lastPageRead = {
				sessionId,
				beforeSeq,
				reason: skip
			};
			return;
		}
		const previous = this.pageAsked.get(sessionId);
		if (previous !== void 0 && now - previous < PAGE_FLOOR_MS) {
			this.lastPageAttempt = {
				sessionId,
				beforeSeq,
				reason: "rate-limited",
				at: now
			};
			if (this.lastPageRead?.records === void 0) this.lastPageRead = {
				sessionId,
				beforeSeq,
				reason: "rate-limited"
			};
			return;
		}
		this.lastPageAttempt = {
			sessionId,
			beforeSeq,
			at: now
		};
		this.lastPageRead = {
			sessionId,
			beforeSeq,
			...handle === void 0 ? {} : { throughSeq: handle.cursor }
		};
		if (handle === void 0 || controller === void 0) return;
		this.pageAsked.set(sessionId, now);
		try {
			const page = await controller.page({
				address: {
					kind: "session",
					sessionId
				},
				throughSeq: pageThrough,
				beforeSeq,
				maxMessages
			}, this.pageAbort.signal);
			let added = 0;
			if (page.records.length === 0) this.ctx.logger.info(`dsh-session-sync: no earlier event below ${String(beforeSeq)} for "${sessionId}"`);
			else {
				const events = [];
				for (const record of page.records) {
					const event = record.event;
					if (event === void 0 || typeof event.seq !== "number") continue;
					events.push(mirrorOf(handle, event));
				}
				added = events.length;
				this.link?.publishFrames(sessionId, events);
			}
			const lowest = lowestSeqOf(page.records);
			const reachedStart = page.hasMore === false && lowest === 0;
			const hadOlder = handle.hasOlder;
			if (reachedStart) this.startProven.set(sessionId, {
				at: Date.now(),
				throughSeq: pageThrough,
				records: page.records.length,
				source: "page"
			});
			handle.hasOlder = page.hasMore;
			if (hadOlder !== handle.hasOlder) this.reconcile();
			this.lastPageRead = {
				sessionId,
				beforeSeq,
				throughSeq: pageThrough,
				maxMessages,
				records: page.records.length,
				hasMore: page.hasMore,
				...lowest === void 0 ? {} : { lowestSeq: lowest },
				...reachedStart ? { reachedStart: true } : {}
			};
			this.lastPageAttempt = void 0;
			if (added > 0) this.ctx.logger.info(`dsh-session-sync: sent ${String(added)} earlier event(s) of "${sessionId}"`);
		} catch (error) {
			this.lastPageRead = {
				sessionId,
				beforeSeq,
				throughSeq: pageThrough,
				error: describe$1(error)
			};
			this.ctx.logger.warn(`dsh-session-sync: reading history for "${sessionId}" failed: ${describe$1(error)}`);
		}
	}
	/**
	* Re-open one Session's follow because its mirror reported a hole.
	*
	* The opening snapshot is the whole retained history, so replaying it hands
	* back whatever a lost batch never delivered — and the mirror now decides
	* what is new by membership rather than by a high-water mark, which is what
	* makes that replay able to fill a hole instead of being rejected as old.
	*
	* A Session this machine does not publish is ignored: the request outlived a
	* switch that was turned off here. The rest is rate-limited, because a broken
	* mirror keeps asking and a follow is not free to open.
	* @param sessionId - the Session the server says is incomplete.
	*/
	resyncSession(sessionId) {
		const handle = this.follows.get(sessionId);
		if (handle === void 0) return;
		const now = Date.now();
		const previous = this.lastResync.get(sessionId);
		if (previous !== void 0 && now - previous < RESYNC_FLOOR_MS) return;
		this.lastResync.set(sessionId, now);
		this.drain(handle, sessionId);
		handle.abort.abort();
		this.follows.delete(sessionId);
		this.startFollow(sessionId);
		this.ctx.logger.info(`dsh-session-sync: replaying "${sessionId}" at the server's request`);
	}
	/** Re-list local Sessions, reconcile the follow set, and publish the index. */
	async reconcile() {
		if (this.disposed || this.controller() === void 0) return;
		let rows;
		try {
			rows = await this.localSessions();
		} catch (error) {
			this.ctx.logger.warn(`dsh-session-sync: listing Sessions failed: ${describe$1(error)}`);
			return;
		}
		const desired = new Set(rows.filter((row) => row.synced).map((row) => row.sessionId));
		for (const [sessionId, handle] of [...this.follows]) {
			if (desired.has(sessionId)) continue;
			handle.abort.abort();
			this.follows.delete(sessionId);
			this.startProven.delete(sessionId);
			this.stats.forget(sessionId);
		}
		for (const sessionId of desired) if (!this.follows.has(sessionId)) this.startFollow(sessionId);
		this.link?.publishIndex({
			machineName: this.config.machineName,
			pluginVersion: pluginVersion(),
			sessions: rows.filter((row) => row.synced).map((row) => {
				const handle = this.follows.get(row.sessionId);
				const lastSeq = handle?.lastSeq;
				const stats = this.stats.cached(row.sessionId);
				if (stats === void 0 || lastSeq !== void 0 && stats.seq < lastSeq) this.refreshStats(row.sessionId, row.cwd, lastSeq);
				return {
					sessionId: row.sessionId,
					title: row.title,
					updatedAt: row.updatedAt,
					running: row.running,
					...row.cwd === void 0 ? {} : { cwd: row.cwd },
					...lastSeq === void 0 || lastSeq < 0 ? {} : { lastSeq },
					...handle === void 0 || handle.sentFirstSeq < 0 ? {} : { firstSeq: handle.sentFirstSeq },
					...handle?.hasOlder === true ? { hasOlder: true } : {},
					...stats === void 0 ? {} : { stats: stats.stats }
				};
			})
		});
	}
	/**
	* Read one Session's whole log for its totals, and publish them when they land.
	*
	* The reconcile that notices the totals are missing does not wait for this: the
	* read is disk work over a log that can be megabytes, and an index publish that
	* waits on one Session would delay every other machine's mirror. So the result
	* is published by triggering the next reconcile, which is where an index is
	* assembled anyway.
	* @param sessionId - the Session to read.
	* @param cwd - its working directory, which is where its log sits.
	* @param lastSeq - the highest sequence this machine has published for it.
	*/
	async refreshStats(sessionId, cwd, lastSeq) {
		if (this.disposed) return;
		try {
			if (await this.stats.compute(sessionId, cwd, lastSeq ?? 0) !== void 0 && !this.disposed) this.reconcile();
		} catch (error) {
			this.ctx.logger.info(`dsh-session-sync: whole-log totals for "${sessionId}" unavailable: ${describe$1(error)}`);
		}
	}
	/**
	* Record what became of one publish attempt.
	*
	* The settings page used to call "marked in the config" published, which is
	* how a client that stopped publishing entirely could still read 已同步会话数 3
	* while the server held none. Only `/publish` and `/frames` are watched: an
	* ack or a status read saying nothing about the mirror is not a publish.
	* @param path - the route the link called.
	* @param ok - whether the server accepted it.
	* @param error - why not, when it did not.
	*/
	notePublish(path, ok, error) {
		const previous = this.postCounts.get(path);
		this.postCounts.set(path, {
			count: (previous?.count ?? 0) + 1,
			at: Date.now(),
			ok
		});
		if (path !== "/publish" && path !== "/frames") return;
		this.lastPublish = {
			at: Date.now(),
			ok,
			...error === void 0 ? {} : { error }
		};
	}
	/** Open one `follow` stream and absorb its frames into the pending buffer. */
	startFollow(sessionId) {
		const controller = this.controller();
		if (controller === void 0) return;
		const handle = {
			abort: new AbortController(),
			pending: [],
			sessionId,
			attemptId: "",
			turn: 0,
			step: 0,
			lastSeq: -1,
			firstSeq: -1,
			sentFirstSeq: -1,
			hasOlder: false,
			cursor: -1,
			opened: false,
			seen: 0
		};
		this.follows.set(sessionId, handle);
		(async () => {
			try {
				const stream = controller.follow({
					address: {
						kind: "session",
						sessionId
					},
					assistantStream: true
				}, handle.abort.signal);
				for await (const frame of stream) this.absorb(handle, frame);
				if (!handle.abort.signal.aborted) handle.ended = "the follow stream ended";
			} catch (error) {
				if (!handle.abort.signal.aborted) {
					const reason = describe$1(error);
					handle.ended = reason;
					this.followError = reason;
					this.followErrorSession = sessionId;
					this.ctx.logger.warn(`dsh-session-sync: follow for "${sessionId}" ended: ${reason}`);
				}
			} finally {
				if (this.follows.get(sessionId) === handle) this.follows.delete(sessionId);
			}
		})();
	}
	/**
	* Take the streaming text out of one follow frame.
	*
	* With `assistantStream: true` a follow yields
	* `{ type: 'assistant-stream', frame }`, where the frame is a `start` (the
	* attempt's identity, turn, and step), a dense `chunk` carrying one
	* `text-delta` or `reasoning-delta`, or an `end` whose outcome says whether
	* the attempt was committed or abandoned.
	*
	* The wire sends deltas; everything this plugin relays is the whole text so
	* far, so they are accumulated here per Session, step, and kind, and a lost
	* frame heals on the next one. The durable path is not touched: a chunk this
	* reader does not recognise is simply ignored.
	* @param handle - the follow the frame arrived on, which owns the identity
	*   every field below is keyed by: several follows are open at once, and a
	*   service-wide "current Session" attributed one Session's stream to another.
	* @param frame - one frame from that follow stream.
	*/
	absorbStream(handle, frame) {
		const envelope = jsonObject(frame);
		if (envelope === void 0 || envelope["type"] !== "assistant-stream") return;
		const record = jsonObject(envelope["frame"]);
		if (record === void 0) return;
		const type = record["type"];
		if (type === "start") {
			this.openAttempt(handle, record);
			return;
		}
		if (type === "chunk") {
			this.takeChunk(handle, record);
			return;
		}
		if (type === "end") {
			const outcome = record["outcome"];
			if (outcome !== void 0 && outcome["kind"] === "abandoned") this.dropStep(handle);
		}
	}
	/**
	* Adopt one attempt's identity and forget whatever step it replaces.
	*
	* A retried step re-opens the same turn and step, so without this the second
	* attempt's deltas would be appended to the first attempt's text.
	* @param handle - the follow the start frame arrived on.
	* @param record - one `start` frame.
	*/
	openAttempt(handle, record) {
		const previousTurn = handle.turn;
		const previousStep = handle.step;
		if (typeof record["attemptId"] === "string") handle.attemptId = record["attemptId"];
		if (typeof record["turn"] === "number") handle.turn = record["turn"];
		if (typeof record["step"] === "number") handle.step = record["step"];
		this.forgetStep(handle.sessionId, previousTurn, previousStep);
	}
	/**
	* Accumulate one streamed chunk of the open attempt.
	* @param handle - the follow the chunk arrived on.
	* @param record - one `chunk` frame.
	*/
	takeChunk(handle, record) {
		if (typeof record["attemptId"] === "string" && record["attemptId"] !== handle.attemptId) {
			handle.attemptId = record["attemptId"];
			this.forgetStep(handle.sessionId, handle.turn, handle.step);
		}
		const chunk = jsonObject(record["chunk"]);
		if (chunk === void 0) return;
		const kind = chunk["type"] === "reasoning-delta" ? "reasoning" : chunk["type"] === "text-delta" ? "text" : void 0;
		if (kind === void 0) return;
		this.appendStream(handle, kind, typeof chunk["text"] === "string" ? chunk["text"] : "");
	}
	/**
	* Append one delta to its step's text and mark that step for relay.
	* @param handle - the follow the delta belongs to.
	* @param kind - which of the step's two texts it is.
	* @param text - the delta itself.
	*/
	appendStream(handle, kind, text) {
		if (text === "" || this.settled.has(stepKey(handle))) return;
		const key = liveKey(handle, kind);
		const base = this.liveText.get(key)?.text ?? "";
		this.liveText.set(key, {
			sessionId: handle.sessionId,
			turn: handle.turn,
			step: handle.step,
			kind,
			text: base + text
		});
		this.liveDirty.add(key);
		while (this.liveText.size > LIVE_LIMIT) {
			const oldest = this.liveText.keys().next();
			if (oldest.done === true || oldest.value === key) break;
			this.liveText.delete(oldest.value);
			this.liveDirty.delete(oldest.value);
		}
	}
	/**
	* Forget one step entirely: its text, its pending relay, and any settlement
	* mark it carried.
	* @param sessionId - the Session that owns the step.
	* @param turn - the step's turn.
	* @param step - the step number.
	*/
	forgetStep(sessionId, turn, step) {
		for (const kind of STREAM_KINDS) {
			const key = sessionLiveKey(sessionId, turn, step, kind);
			this.liveText.delete(key);
			this.liveDirty.delete(key);
		}
		this.settled.delete(sessionStepKey(sessionId, turn, step));
	}
	/**
	* Tell the reader the open step's text is gone, and refuse any late delta for
	* it. Only an abandoned attempt needs the frame: nothing follows it, so
	* nothing else would replace the row.
	* @param handle - the follow whose attempt was abandoned.
	*/
	dropStep(handle) {
		for (const kind of STREAM_KINDS) {
			const key = liveKey(handle, kind);
			const previous = this.liveText.get(key);
			if (previous === void 0) continue;
			this.liveText.set(key, {
				...previous,
				text: ""
			});
			this.liveDirty.add(key);
		}
		this.settled.add(stepKey(handle));
		this.pruneSettled();
	}
	/**
	* Stop relaying one settled step, and drop what it accumulated.
	*
	* A delta and its settlement travel as two separate posts, so without this a
	* delta that lost the race would put the live row back after the durable
	* message that replaced it.
	* @param handle - the follow the event arrived on.
	* @param event - one durable mirrored event.
	*/
	retireStream(handle, event) {
		if (event.type !== "assistant/message" && event.type !== "assistant/attempt") return;
		const data = event.data;
		const turn = typeof data?.["turn"] === "number" ? data["turn"] : handle.turn;
		const step = typeof data?.["step"] === "number" ? data["step"] : handle.step;
		this.forgetStep(handle.sessionId, turn, step);
		this.settled.add(sessionStepKey(handle.sessionId, turn, step));
		this.pruneSettled();
	}
	/** Bound the settlement marks, newest kept. */
	pruneSettled() {
		while (this.settled.size > LIVE_LIMIT) {
			const oldest = this.settled.values().next();
			if (oldest.done === true) break;
			this.settled.delete(oldest.value);
		}
	}
	/**
	* Adopt the opening frame's live attempt, so a follow that opens in the
	* middle of a step still shows the text that was streamed before it.
	*
	* The baseline nests its compact runs under `activeAttempt`, and `nextIndex`
	* says how many deltas they represent: DSH's own Web client expands them and
	* stops there, and so does this.
	* @param handle - the follow that just opened.
	* @param frame - its opening frame.
	*/
	seedStream(handle, frame) {
		const attempt = frame["assistantStream"]?.["activeAttempt"];
		if (attempt === void 0) return;
		if (typeof attempt["attemptId"] === "string") handle.attemptId = attempt["attemptId"];
		if (typeof attempt["turn"] === "number") handle.turn = attempt["turn"];
		if (typeof attempt["step"] === "number") handle.step = attempt["step"];
		const runs = Array.isArray(attempt["stream"]) ? attempt["stream"] : [];
		const limit = typeof attempt["nextIndex"] === "number" ? attempt["nextIndex"] : Number.MAX_SAFE_INTEGER;
		let members = 0;
		for (const run of runs) {
			const kind = run["type"] === "reasoning-chunks" ? "reasoning" : run["type"] === "text-chunks" ? "text" : void 0;
			if (kind === void 0) continue;
			const texts = Array.isArray(run["texts"]) ? run["texts"] : [];
			for (const part of texts) {
				if (typeof part !== "string" || part === "") continue;
				if (members >= limit) return;
				members += 1;
				this.appendStream(handle, kind, part);
			}
		}
	}
	absorb(handle, frame) {
		const frameType = typeof frame.type === "string" ? frame.type : "unknown";
		if (this.followFrameTypes.size < 12) this.followFrameTypes.add(frameType);
		this.followEvents += 1;
		const carrier = frame;
		if (frameType === "assistant-stream" && this.followShapes.length < 8) {
			const keysOf = (value) => value !== null && typeof value === "object" ? Object.keys(value).slice(0, 10).join(",") : typeof value;
			const inner = carrier["frame"] ?? carrier["assistantStream"] ?? carrier;
			const chunk = inner !== null && typeof inner === "object" ? inner["chunk"] : void 0;
			this.followShapes.push("assistant-stream{" + keysOf(carrier) + "} inner{" + keysOf(inner) + "} chunk{" + keysOf(chunk) + "}");
		}
		this.absorbStream(handle, frame);
		if (frameType === "snapshot" || frameType === "opened") this.seedStream(handle, carrier);
		if (frameType === "snapshot" || frameType === "opened") {
			if (typeof carrier["cursor"] === "number") handle.cursor = carrier["cursor"];
			if (typeof carrier["hasMore"] === "boolean") {
				if (carrier["hasMore"] === false) {
					const opening = Array.isArray(carrier["records"]) ? carrier["records"] : Array.isArray(carrier["page"]?.["records"]) ? carrier["page"]["records"] : [];
					if (lowestSeqOf(opening) === 0) this.startProven.set(handle.sessionId, {
						at: Date.now(),
						throughSeq: handle.cursor,
						records: opening.length,
						source: "opening"
					});
				}
				handle.hasOlder = carrier["hasMore"] === true && !this.startProven.has(handle.sessionId);
			}
			if (typeof carrier["cursor"] === "number") handle.opened = true;
		}
		const page = carrier["page"];
		const records = Array.isArray(carrier["records"]) ? carrier["records"] : Array.isArray(page?.["records"]) ? page["records"] : void 0;
		if (records !== void 0) {
			if (this.followShapes.length < 4 && records.length > 0) {
				const keys = (value) => value !== null && typeof value === "object" ? Object.keys(value).slice(0, 8).join(",") : typeof value;
				this.followShapes.push(frameType + "{" + keys(frame) + "} rec{" + keys(records[0]) + "}");
			}
			for (const record of records) if (record !== null && typeof record === "object" && record.event !== void 0) {
				const event = record.event;
				buffer(handle, event);
				this.retireStream(handle, event);
			}
			return;
		}
		if (frameType === "snapshot" || frameType === "opened") this.historyMisses += 1;
		if (carrier["type"] === "event" && "event" in frame) {
			buffer(handle, frame.event);
			this.retireStream(handle, frame.event);
		}
	}
	/** Relay the streaming text accumulated since the last tick. */
	flushStream() {
		if (this.liveDirty.size === 0) return;
		for (const key of this.liveDirty) {
			const payload = this.liveText.get(key);
			if (payload === void 0) continue;
			this.link?.publishStream(payload);
		}
		this.liveDirty.clear();
	}
	flush() {
		const link = this.link;
		if (link === void 0 || !link.linked) return;
		for (const [sessionId, handle] of this.follows) {
			if (handle.pending.length === 0) continue;
			link.publishFrames(sessionId, handle.pending.splice(0, handle.pending.length));
		}
	}
	/** Admit a takeover prompt, or claim a relayed question or approval, into the local Session it names. */
	async runCommand(command) {
		const link = this.link;
		if (command.kind === "answer") {
			const claimed = this.relay.claim(command.questionId, command.answers, command.commandId);
			link?.ackCommand(command.commandId, command.sessionId, claimed.ok, claimed.ok ? void 0 : claimed.reason);
			return;
		}
		if (command.kind === "approval") {
			const claimed = this.approvals.claim(command.approvalId, command.decision, command.commandId);
			link?.ackCommand(command.commandId, command.sessionId, claimed.ok, claimed.ok ? void 0 : claimed.reason);
			return;
		}
		const controller = this.controller();
		if (controller === void 0) return;
		if (this.config.syncSessions[command.sessionId] !== true) {
			link?.ackCommand(command.commandId, command.sessionId, false, "this Session is no longer published");
			return;
		}
		if (Date.now() > command.expiresAt) {
			link?.ackCommand(command.commandId, command.sessionId, false, "the prompt expired before it arrived");
			return;
		}
		try {
			await controller.prompt({
				requestId: mintRequestId(),
				sessionId: command.sessionId,
				mode: "queue",
				content: [{
					type: "text",
					text: command.text
				}]
			}, new AbortController().signal);
			link?.ackCommand(command.commandId, command.sessionId, true);
		} catch (error) {
			const reason = describe$1(error);
			this.ctx.logger.warn(`dsh-session-sync: takeover prompt failed: ${reason}`);
			link?.ackCommand(command.commandId, command.sessionId, false, reason);
		}
	}
	/** Read the Session control service, which may not be mounted in every composition. */
	controller() {
		const found = this.ctx.get("sessionController");
		if (found === void 0 || found === null) return void 0;
		return found;
	}
	/**
	* The Session ids the Workspace registry has archived.
	*
	* Read through `get` rather than injected, for the same reason the Session list
	* itself is feature-detected: a composition without the registry must keep
	* listing Sessions, and an absent archive set reads as "nothing is archived"
	* rather than as an error. Every entry is type-checked, because this is another
	* plugin's state and a registry that changed shape must not hide every row.
	* @returns the archived Session ids, empty when the registry is unavailable.
	*/
	archivedSessions() {
		const found = this.ctx.get("workspaceRegistry");
		if (found === void 0 || found === null) return /* @__PURE__ */ new Set();
		const ids = found.archivedSessionIds;
		if (!Array.isArray(ids)) return /* @__PURE__ */ new Set();
		return new Set(ids.filter((id) => typeof id === "string"));
	}
	/** Project one summary onto a presentation row. */
	row(item) {
		const title = item.projections?.values["title"];
		return {
			sessionId: item.sessionId,
			title: typeof title === "string" && title.trim().length > 0 ? title : item.sessionId,
			updatedAt: item.updatedAt,
			running: item.running,
			blank: item.blank,
			...item.cwd === void 0 ? {} : { cwd: item.cwd },
			synced: this.config.syncSessions[item.sessionId] === true,
			approved: this.config.approveSessions[item.sessionId] === true
		};
	}
	/** Push the current state to every subscribed browser. */
	broadcastState() {
		this.broadcast({
			type: "state",
			state: this.view()
		});
	}
	/** Send one frame to every subscribed browser. */
	broadcast(frame) {
		if (frame.type === "state" && this.browsers.size === 0) return;
		for (const sink of [...this.browsers]) try {
			sink.send(frame);
		} catch {
			this.browsers.delete(sink);
		}
	}
};
/** Record what one event does to a follow's extent, and hand back its wire shape. */
function mirrorOf(handle, event) {
	handle.seen += 1;
	if (typeof event.seq === "number" && event.seq > handle.lastSeq) handle.lastSeq = event.seq;
	if (typeof event.seq === "number" && (handle.firstSeq < 0 || event.seq < handle.firstSeq)) handle.firstSeq = event.seq;
	if (typeof event.seq === "number" && (handle.sentFirstSeq < 0 || event.seq < handle.sentFirstSeq)) handle.sentFirstSeq = event.seq;
	return {
		type: event.type,
		seq: event.seq,
		time: event.time,
		data: event.data,
		...event.sourceEventSeqs === void 0 ? {} : { sourceEventSeqs: event.sourceEventSeqs },
		...event.surfaceOp === void 0 ? {} : { surfaceOp: event.surfaceOp }
	};
}
/**
* The lowest durable sequence in one page of records.
*
* The evidence half of "this page reached the log's beginning": the controller
* slices a page from the log's own first index, so a page that walked all the way
* back carries seq 0. Absent when the page carries no durable event at all, which
* proves nothing either way.
* @param records - the page's records, in log order.
* @returns the lowest sequence, or undefined when the page holds none.
*/
function lowestSeqOf(records) {
	let lowest;
	for (const record of records) {
		const seq = record.event?.seq;
		if (typeof seq !== "number") continue;
		if (lowest === void 0 || seq < lowest) lowest = seq;
	}
	return lowest;
}
/** Append one durable event to the buffer, bounded so memory cannot run away. */
function buffer(handle, event) {
	handle.pending.push(mirrorOf(handle, event));
	if (handle.pending.length > BUFFER_LIMIT) handle.pending.splice(0, handle.pending.length - BUFFER_LIMIT);
}
/**
* Read one JSON object out of a wire value.
*
* The frames this reader walks are typed as JSON, and a carrier that serialises
* one leaves it as a string; a value that is neither is simply not the object
* being looked for.
* @param value - a frame, a frame field, or anything else.
* @returns the object, or undefined when the value is not one.
*/
function jsonObject(value) {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return void 0;
		try {
			return jsonObject(JSON.parse(trimmed));
		} catch {
			return;
		}
	}
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
/** Mint one client-side prompt identity. */
function mintRequestId() {
	return `sync-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
/** Human-readable one-line failure text. */
function describe$1(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region ../deepseek-harness/vendor/cosmokit/lib/index.js
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Return true for non-array object values. */
function isPlainObject(data) {
	return data && typeof data === "object" && !Array.isArray(data);
}
/** Filter object entries and return a new object. */
function filterKeys(object, filter) {
	return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
/** Map object values while preserving the original key set. */
function mapValues(object, transform) {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
/** Pick selected keys from an object, optionally including `undefined` values. */
function pick(source, keys, forced) {
	if (!keys) return { ...source };
	const result = {};
	for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
	return result;
}
/** Shared config references used by schema validators and plugin runtimes. */
const write = Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
	if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
	if (value === null || typeof value !== "object") return value;
	if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
	ancestors.add(value);
	try {
		if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
		if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
		return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
	} finally {
		ancestors.delete(value);
	}
}
/**
* Create a detached reference containing an immutable copy of the supplied data.
* @param value - validated config data; class instances and functions are unsupported.
* @returns a reference whose value is updated only by its owning runtime.
*/
function createVolatile(value) {
	let current = snapshot(value);
	return Object.freeze({
		get: () => current,
		[write]: (value) => {
			current = value;
		}
	});
}
/**
* Identify references across ESM/CJS copies of the shared library.
* @param value - a parsed config value.
* @returns whether the value implements the shared reference protocol.
*/
function isVolatile(value) {
	return typeof value === "object" && value !== null && write in value;
}
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value) => is(type, value);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
/** Binary source detection and base64/hex conversion helpers. */
var Binary;
(function(Binary) {
	Binary.is = isArrayBufferLike;
	Binary.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	Binary.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	Binary.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	Binary.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	Binary.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	Binary.fromHex = fromHex;
})(Binary || (Binary = {}));
Binary.fromBase64;
Binary.toBase64;
Binary.fromHex;
Binary.toHex;
/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
function clone(source, refs = /* @__PURE__ */ new Map()) {
	if (!source || typeof source !== "object") return source;
	if (is("Date", source)) return new Date(source.valueOf());
	if (is("RegExp", source)) return new RegExp(source.source, source.flags);
	if (isArrayBufferLike(source)) return source.slice(0);
	if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
	const cached = refs.get(source);
	if (cached) return cached;
	if (Array.isArray(source)) {
		const result = [];
		refs.set(source, result);
		source.forEach((value, index) => {
			result[index] = Reflect.apply(clone, null, [value, refs]);
		});
		return result;
	}
	const result = Object.create(Object.getPrototypeOf(source));
	refs.set(source, result);
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
		if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
		Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}
/**
* Compare values recursively, treating two volatile references as equal regardless of value.
* Strict comparison distinguishes null/undefined, treats opaque objects by identity,
* compares URLs by normalized href, treats array holes as undefined, and considers distinct cyclic structures unequal.
* @param a - first value.
* @param b - second value.
* @param strict - whether to require strict data equality outside volatile references.
* @returns whether the values compare equal.
*/
function deepEqual(a, b, strict) {
	const ancestors = /* @__PURE__ */ new Set();
	function compare(a, b) {
		if (a === b) return true;
		if (isVolatile(a) || isVolatile(b)) return isVolatile(a) && isVolatile(b);
		if (!strict && isNullable(a) && isNullable(b)) return true;
		if (typeof a !== typeof b || typeof a !== "object" || !a || !b) return false;
		if (ancestors.has(a)) return false;
		function check(test, then) {
			return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
		}
		ancestors.add(a);
		try {
			return check(Array.isArray, (a, b) => {
				if (a.length !== b.length) return false;
				for (let index = 0; index < a.length; index++) if (!compare(a[index], b[index])) return false;
				return true;
			}) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("URL"), (a, b) => a.href === b.href) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
				if (a.byteLength !== b.byteLength) return false;
				const viewA = new Uint8Array(a);
				const viewB = new Uint8Array(b);
				for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
				return true;
			}) ?? ((!strict || [a, b].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
				...a,
				...b
			}).every((key) => compare(a[key], b[key])));
		} finally {
			ancestors.delete(a);
		}
	}
	return compare(a, b);
}
/** Time constants plus parsing and formatting helpers. */
var Time;
(function(Time) {
	Time.millisecond = 1;
	Time.second = 1e3;
	Time.minute = Time.second * 60;
	Time.hour = Time.minute * 60;
	Time.day = Time.hour * 24;
	Time.week = Time.day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	Time.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	Time.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / Time.minute - offset) / 1440);
	}
	Time.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * Time.day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * Time.minute);
	}
	Time.fromDateNumber = fromDateNumber;
	const numeric = /\d+(?:\.\d+)?/.source;
	const timeRegExp = new RegExp(`^${[
		"w(?:eek(?:s)?)?",
		"d(?:ay(?:s)?)?",
		"h(?:our(?:s)?)?",
		"m(?:in(?:ute)?(?:s)?)?",
		"s(?:ec(?:ond)?(?:s)?)?"
	].map((unit) => `(${numeric}${unit})?`).join("")}$`);
	function parseTime(source) {
		const capture = timeRegExp.exec(source);
		if (!capture) return 0;
		return (parseFloat(capture[1]) * Time.week || 0) + (parseFloat(capture[2]) * Time.day || 0) + (parseFloat(capture[3]) * Time.hour || 0) + (parseFloat(capture[4]) * Time.minute || 0) + (parseFloat(capture[5]) * Time.second || 0);
	}
	Time.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	Time.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= Time.day - Time.hour / 2) return Math.round(ms / Time.day) + "d";
		else if (abs >= Time.hour - Time.minute / 2) return Math.round(ms / Time.hour) + "h";
		else if (abs >= Time.minute - Time.second / 2) return Math.round(ms / Time.minute) + "m";
		else if (abs >= Time.second) return Math.round(ms / Time.second) + "s";
		return ms + "ms";
	}
	Time.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	Time.toDigits = toDigits;
	function template(template, time = /* @__PURE__ */ new Date()) {
		return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	Time.template = template;
})(Time || (Time = {}));
//#endregion
//#region ../deepseek-harness/vendor/schemastery/lib/index.mjs
const kSchema = Symbol.for("schemastery");
const kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
	options;
	name = "ValidationError";
	constructor(message, options) {
		let prefix = "$";
		for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
		else if (typeof segment === "number") prefix += "[" + segment + "]";
		else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
		if (prefix.startsWith(".")) prefix = prefix.slice(1);
		super((prefix === "$" ? "" : `${prefix} `) + message);
		this.options = options;
	}
	static is(error) {
		return !!error?.[kValidationError];
	}
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
const Schema = function(options) {
	const schema = function(data, options = {}) {
		return Schema.resolve(data, schema, options)[0];
	};
	if (options.refs) {
		const refs = mapValues(options.refs, (options) => new Schema(options));
		const getRef = (uid) => refs[uid];
		for (const key in refs) {
			const options = refs[key];
			options.sKey = getRef(options.sKey);
			options.inner = getRef(options.inner);
			options.list = options.list && options.list.map(getRef);
			options.dict = options.dict && mapValues(options.dict, getRef);
		}
		return refs[options.uid];
	}
	Object.assign(schema, options);
	if (typeof schema.callback === "string") try {
		schema.callback = new Function("return " + schema.callback)();
	} catch {}
	Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
	Object.setPrototypeOf(schema, Schema.prototype);
	schema.meta ||= {};
	schema.toString = schema.toString.bind(schema);
	return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
	return {
		version: 1,
		vendor: "schemastery",
		validate: (value) => {
			try {
				return { value: Schema.resolve(value, this, {})[0] };
			} catch (error) {
				if (ValidationError.is(error)) return { issues: [{
					message: error.message,
					path: error.options.path
				}] };
				throw error;
			}
		}
	};
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
	if (globalThis.__schemastery_refs__) {
		globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
		return this.uid;
	}
	globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
	globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
	const result = {
		uid: this.uid,
		refs: globalThis.__schemastery_refs__
	};
	globalThis.__schemastery_refs__ = void 0;
	return result;
};
Schema.prototype.set = function set(key, value) {
	this.dict[key] = value;
	return this;
};
Schema.prototype.push = function push(value) {
	this.list.push(value);
	return this;
};
function mergeDesc(original, messages) {
	const result = typeof original === "string" ? { "": original } : { ...original };
	for (const locale in messages) {
		const value = messages[locale];
		if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
		else if (typeof value === "string") result[locale] = value;
	}
	return result;
}
function getInner(value) {
	return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
	return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
	const schema = Schema(this);
	const desc = mergeDesc(schema.meta.description, messages);
	if (Object.keys(desc).length) schema.meta.description = desc;
	if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
		return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
	});
	if (schema.list) schema.list = schema.list.map((inner, index) => {
		return inner.i18n(mapValues(messages, (data = {}) => {
			if (Array.isArray(getInner(data))) return getInner(data)[index];
			if (Array.isArray(data)) return data[index];
			return extractKeys(data);
		}));
	});
	if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
		if (getInner(data)) return getInner(data);
		return extractKeys(data);
	}));
	if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
	return schema;
};
Schema.prototype.extra = function extra(key, value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
};
for (const key of [
	"required",
	"disabled",
	"collapse",
	"hidden",
	"loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.deprecated = function deprecated() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "deprecated",
		type: "danger"
	});
	return schema;
};
Schema.prototype.experimental = function experimental() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "experimental",
		type: "warning"
	});
	return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
	const schema = Schema(this);
	const pattern = pick(regexp, ["source", "flags"]);
	schema.meta = {
		...schema.meta,
		pattern
	};
	return schema;
};
Schema.prototype.simplify = function simplify(value) {
	if (isVolatile(value)) value = value.get();
	if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
	if (isNullable(value)) return value;
	if (this.type === "object" || this.type === "dict") {
		const result = {};
		for (const key in value) {
			const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
			if (this.type === "dict" || !isNullable(item)) result[key] = item;
		}
		if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
		return result;
	} else if (this.type === "array" || this.type === "tuple") {
		const result = [];
		value.forEach((value, index) => {
			const schema = this.type === "array" ? this.inner : this.list[index];
			const item = schema ? schema.simplify(value) : value;
			result.push(item);
		});
		return result;
	} else if (this.type === "intersect") {
		const result = {};
		for (const item of this.list) Object.assign(result, item.simplify(value));
		return result;
	} else if (this.type === "union") for (const schema of this.list) try {
		Schema.resolve(value, schema, {});
		return schema.simplify(value);
	} catch {}
	return value;
};
Schema.prototype.toString = function toString(inline) {
	return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		role,
		extra
	};
	return schema;
};
for (const key of [
	"default",
	"link",
	"comment",
	"description",
	"max",
	"min",
	"step"
]) Object.assign(Schema.prototype, { [key](value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.volatile = function volatile() {
	if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
	return this.extra("volatile", true);
};
const resolvers = {};
const checkedVolatile = Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
	const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
	if (states.has(blocked)) return;
	states.add(blocked);
	seen.set(schema, states);
	if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
	const nested = blocked || !!schema.meta?.volatile;
	if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
	if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
	if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
	if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve) {
	resolvers[type] = resolve;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
	if (!schema) return [data];
	if (!options[checkedVolatile]) {
		validateVolatileSchema(schema, options.path);
		options = {
			...options,
			[checkedVolatile]: true
		};
	}
	if (schema.meta?.volatile) {
		const inner = Schema(schema);
		inner.meta = {
			...schema.meta,
			volatile: false
		};
		const [value, adapted] = Schema.resolve(data, inner, options, strict);
		try {
			return [createVolatile(value), adapted];
		} catch (error) {
			throw new ValidationError(error instanceof Error ? error.message : String(error), options);
		}
	}
	if (options.ignore?.(data, schema)) return [data];
	if (isNullable(data) && schema.type !== "lazy") {
		if (schema.meta.required) throw new ValidationError(`missing required value`, options);
		let current = schema;
		let fallback = schema.meta.default;
		while (current?.type === "intersect" && isNullable(fallback)) {
			current = current.list[0];
			fallback = current?.meta.default;
		}
		if (isNullable(fallback)) return [data];
		data = clone(fallback);
	}
	const callback = resolvers[schema.type];
	if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
	try {
		return callback(data, schema, options, strict);
	} catch (error) {
		if (!schema.meta.loose) throw error;
		return [schema.meta.default];
	}
};
Schema.from = function from(source) {
	if (isNullable(source)) return Schema.any();
	else if ([
		"string",
		"number",
		"boolean"
	].includes(typeof source)) return Schema.const(source).required();
	else if (source[kSchema]) return source;
	else if (typeof source === "function") switch (source) {
		case String: return Schema.string().required();
		case Number: return Schema.number().required();
		case Boolean: return Schema.boolean().required();
		case Function: return Schema.function().required();
		default: return Schema.is(source).required();
	}
	else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
	const toJSON = () => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return schema.inner.toJSON();
	};
	const schema = new Schema({
		type: "lazy",
		builder,
		inner: { toJSON }
	});
	return schema;
};
Schema.natural = function natural() {
	return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
	return Schema.number().step(.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
	return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
		const date = new Date(value);
		if (isNaN(+date)) throw new ValidationError(`invalid date "${value}"`, options);
		return date;
	}, true)]);
};
Schema.regExp = function regExp(flag = "") {
	return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
		try {
			return new RegExp(value, flag);
		} catch (e) {
			throw new ValidationError(e.message, options);
		}
	}, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
	return Schema.union([
		Schema.is(ArrayBuffer),
		Schema.is(SharedArrayBuffer),
		Schema.transform(Schema.any(), (value, options) => {
			if (Binary.isSource(value)) return Binary.fromSource(value);
			throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
		}, true),
		...encoding ? [Schema.transform(Schema.string(), (value, options) => {
			try {
				return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)] : []
	]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
	if (!schema.inner[kSchema]) {
		schema.inner = schema.builder();
		schema.inner.meta = {
			...schema.meta,
			...schema.inner.meta
		};
		validateVolatileSchema(schema.inner, options.path, true);
	}
	return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
	return [data];
});
Schema.extend("never", (data, _, options) => {
	throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
	if (deepEqual(data, value)) return [value];
	throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
	const { max = Infinity, min = -Infinity } = meta;
	if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
	if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
	if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
	if (meta.pattern) {
		const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
		if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
	}
	checkWithinRange(data.length, meta, "string length", options);
	return [data];
});
function decimalShift(data, digits) {
	const str = data.toString();
	if (str.includes("e")) return data * Math.pow(10, digits);
	const index = str.indexOf(".");
	if (index === -1) return data * Math.pow(10, digits);
	const frac = str.slice(index + 1);
	const integer = str.slice(0, index);
	if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
	return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
	step = Math.abs(step);
	if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
	const index = step.toString().indexOf(".");
	const digits = step.toString().slice(index + 1).length;
	return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
	if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
	checkWithinRange(data, meta, "number", options);
	const { step } = meta;
	if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
	return [data];
});
Schema.extend("boolean", (data, _, options) => {
	if (typeof data === "boolean") return [data];
	throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
	let value = 0, keys = [];
	if (typeof data === "number") {
		value = data;
		for (const key in bits) if (data & bits[key]) keys.push(key);
	} else if (Array.isArray(data)) {
		keys = data;
		for (const key of keys) {
			if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
			if (key in bits) value |= bits[key];
		}
	} else throw new ValidationError(`expected number or array but got ${data}`, options);
	if (value === meta.default) return [value];
	return [value, keys];
});
Schema.extend("function", (data, _, options) => {
	if (typeof data === "function") return [data];
	throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
	if (typeof constructor === "function") {
		if (data instanceof constructor) return [data];
		throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
	} else {
		if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		let prototype = Object.getPrototypeOf(data);
		while (prototype) {
			if (prototype.constructor?.name === constructor) return [data];
			prototype = Object.getPrototypeOf(prototype);
		}
		throw new ValidationError(`expected ${constructor} but got ${data}`, options);
	}
});
function property(data, key, schema, options) {
	try {
		const [value, adapted] = Schema.resolve(data[key], schema, {
			...options,
			path: [...options.path || [], key]
		});
		if (adapted !== void 0) data[key] = adapted;
		return value;
	} catch (e) {
		if (!options?.autofix) throw e;
		delete data[key];
		return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
	}
}
Schema.extend("array", (data, { inner, meta }, options) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
	return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in data) {
		let rKey;
		try {
			rKey = Schema.resolve(key, sKey, options)[0];
		} catch (error) {
			if (strict) continue;
			throw error;
		}
		result[rKey] = property(data, key, inner, options);
		data[rKey] = data[key];
		if (key !== rKey) delete data[key];
	}
	return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	const result = list.map((inner, index) => property(data, index, inner, options));
	if (strict) return [result];
	result.push(...data.slice(list.length));
	return [result];
});
function merge(result, data) {
	for (const key in data) {
		if (key in result) continue;
		result[key] = data[key];
	}
}
Schema.extend("object", (data, { dict }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in dict) {
		const value = property(data, key, dict[key], options);
		if (!isNullable(value) || key in data) result[key] = value;
	}
	if (!strict) merge(result, data);
	return [result];
});
Schema.extend("union", (data, { list, toString }, options, strict) => {
	const messages = [];
	for (const inner of list) try {
		return Schema.resolve(data, inner, options, strict);
	} catch (error) {
		messages.push(error);
	}
	throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString }, options, strict) => {
	if (!list.length) return [data];
	let result;
	for (const inner of list) {
		const value = Schema.resolve(data, inner, options, true)[0];
		if (isNullable(value)) continue;
		if (isNullable(result)) result = value;
		else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		else if (typeof value === "object") merge(result ??= {}, value);
		else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
	}
	if (!strict && isPlainObject(data)) merge(result, data);
	return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
	const [result, adapted = data] = Schema.resolve(data, inner, options, true);
	if (preserve) return [callback(result)];
	else return [callback(result), callback(adapted)];
});
const formatters = {};
function defineMethod(name, keys, format) {
	formatters[name] = format;
	Object.assign(Schema, { [name](...args) {
		const schema = new Schema({ type: name });
		keys.forEach((key, index) => {
			switch (key) {
				case "sKey":
					schema.sKey = args[index] ?? Schema.string();
					break;
				case "inner":
					schema.inner = Schema.from(args[index]);
					break;
				case "list":
					schema.list = args[index].map(Schema.from);
					break;
				case "dict":
					schema.dict = mapValues(args[index], Schema.from);
					break;
				case "bits":
					schema.bits = {};
					for (const key in args[index]) {
						if (typeof args[index][key] !== "number") continue;
						schema.bits[key] = args[index][key];
					}
					break;
				case "callback": {
					const callback = schema.callback = args[index];
					callback["toJSON"] ||= () => callback.toString();
					break;
				}
				case "constructor": {
					const constructor = schema.constructor = args[index];
					if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
					break;
				}
				default: schema[key] = args[index];
			}
		});
		if (name === "object" || name === "dict") schema.meta.default = {};
		else if (name === "array" || name === "tuple") schema.meta.default = [];
		else if (name === "bitset") schema.meta.default = 0;
		return schema;
	} });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
	if (typeof constructor === "function") return constructor.name;
	else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
	if (Object.keys(dict).length === 0) return "{}";
	return `{ ${Object.entries(dict).map(([key, inner]) => {
		return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
	}).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
	const result = list.map(({ toString: format }) => format()).join(" | ");
	return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
	return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
	"inner",
	"callback",
	"preserve"
], ({ inner }, isInner) => inner.toString(isInner));
//#endregion
//#region src/host/config-schema.ts
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
function buildConfigSchema(Schema) {
	/** One `true`-valued switch map, shared by both per-Session fields. */
	const switches = () => Schema.dict(Schema.const(true)).volatile();
	return Schema.object({
		machineName: Schema.string().description("Name this machine is shown under to every other machine.").volatile(),
		serverUrl: Schema.string().description("Address of the sync server this machine publishes to; host, host:port, or a full URL.").volatile(),
		isServer: Schema.boolean().description("Serve as the sync server instead of publishing to one.").volatile(),
		password: Schema.string().description("Shared secret both sides must agree on.").role("secret").volatile(),
		listenHost: Schema.string().description("Interface the sync server binds when this machine is the server.").volatile(),
		listenPort: Schema.number().description("Port the sync server binds when this machine is the server.").default(8791).volatile(),
		syncSessions: switches().description("Per-Session publish switch, keyed by Session id; only `true` counts."),
		approveSessions: switches().description("Sessions whose approvals a console on another machine may decide.")
	});
}
//#endregion
//#region src/index.ts
/**
* `dsh-session-sync` — Host half.
*
* Publishes selected local Sessions to a sync server, or serves as that server
* and mirrors what other machines publish. Every browser-facing route is
* registered on the GUI's own web server (`ctx.webServer`), so the panel is
* same-origin and inherits whatever authentication the composition already
* applies. The origin-to-server protocol runs on a listener this plugin owns.
*
* The plugin degrades rather than fails: a composition without
* `ctx.sessionController` never wires anything, and one without `ctx.webServer`
* still runs the sync engine without a browser surface.
*/
const name = "dsh-session-sync";
/**
* The configuration schema the DSH Plugins page renders.
*
* This export is the migration: the Loader validates the profile row's `config`
* against it, and the `settings` service projects its volatile fields into an
* auto-generated form. It is deliberately **not** accompanied by a
* `settings.configure({ auto: false })` call — an automatic page is exactly what
* the user asked for, and suppressing it would leave the plugin's row with no
* config again.
*/
const Config = buildConfigSchema(Schema);
/** Largest accepted browser request body, in bytes. */
const MAX_BODY_BYTES = 1024 * 1024;
/**
* Register the sync engine and its browser surface.
* @param ctx - the Host context.
* @param config - the validated row config; the engine prefers it over the JSON
*   document when the settings service has a configurable row for this plugin.
*/
function apply(ctx, config) {
	ctx.inject(["sessionController"], (scoped) => {
		initialize(scoped, config);
	});
}
/** Build the engine, start it, and expose it over HTTP. */
async function initialize(ctx, config) {
	try {
		const home = resolveHome();
		const service = await SessionSyncService.create(ctx, home, config);
		ctx.logger.info(`dsh-session-sync: engine ready (settings "${SETTINGS_NAMESPACE}", fallback ${configPath(home)})`);
		ctx.effect(() => ctx.on("settings/document-updated", (ns) => {
			if (ns !== "session-sync") return;
			service.adoptSettings().catch((error) => {
				ctx.logger.warn(`dsh-session-sync: could not adopt a settings change: ${describe(error)}`);
			});
		}), "dsh-session-sync: settings changes");
		ctx.effect(() => () => {
			service.dispose();
		}, "dsh-session-sync: engine");
		service.answerQuestions(ctx);
		service.answerApprovals(ctx);
		ctx.inject(["webServer"], (webCtx) => {
			const webServer = webCtx.get("webServer");
			if (webServer === void 0) return;
			registerRoutes(webCtx, webServer, service);
		});
		service.start();
	} catch (error) {
		ctx.logger.error(`dsh-session-sync: failed to start: ${describe(error)}`);
	}
}
/** Register the browser-facing routes under {@link ROUTE_PREFIX}. */
function registerRoutes(ctx, webServer, service) {
	ctx.effect(() => webServer.register({
		kind: "prefix",
		path: ROUTE_PREFIX,
		handler: (request, response) => {
			dispatch(ctx, service, request, response).catch((error) => {
				ctx.logger.warn(`dsh-session-sync: route failed: ${describe(error)}`);
				if (!response.writableEnded) sendJson(response, 500, { error: "internal" });
			});
		}
	}), "dsh-session-sync: browser routes");
}
/** Route one browser request. */
async function dispatch(ctx, service, request, response) {
	const rejection = rejectionOf(ctx, request);
	if (rejection !== void 0) {
		sendJson(response, rejection, { error: rejection === 403 ? "forbidden: this authority is not trusted by the browser-trust fence" : "authentication required; reopen the URL printed by dsh web" });
		return;
	}
	const url = new URL(request.url ?? "/", "http://gui.invalid");
	const route = url.pathname.slice(17);
	const method = request.method ?? "GET";
	if (method === "GET" && route === "/config") {
		sendJson(response, 200, {
			config: service.configView(),
			state: service.view()
		});
		return;
	}
	if (method === "GET" && route === "/state") {
		sendJson(response, 200, { state: service.view() });
		return;
	}
	if (method === "GET" && route === "/sessions") {
		sendJson(response, 200, { sessions: await service.localSessions() });
		return;
	}
	if (method === "POST" && route === "/config") {
		const body = await readJsonBody(request);
		if (body === void 0) {
			sendJson(response, 400, { error: "malformed JSON body" });
			return;
		}
		const patch = body;
		let config;
		try {
			config = await service.patch(patch);
		} catch (error) {
			const conflict = settingsConflictOf(error) !== void 0;
			sendJson(response, conflict ? 409 : 500, {
				error: describe(error),
				conflict
			});
			return;
		}
		sendJson(response, 200, {
			config,
			state: service.view(),
			sessions: await service.localSessions()
		});
		return;
	}
	if (method === "GET" && route === "/transcript") {
		const machineName = url.searchParams.get("machine") ?? "";
		const sessionId = url.searchParams.get("session") ?? "";
		const limit = wholeNumber(url.searchParams.get("limit"));
		const before = wholeNumber(url.searchParams.get("before"));
		const transcript = service.transcript(machineName, sessionId, limit === void 0 && before === void 0 ? void 0 : {
			limit: limit ?? Number.MAX_SAFE_INTEGER,
			...before === void 0 ? {} : { before }
		});
		if (transcript === void 0) {
			sendJson(response, 404, { error: "no such mirrored Session" });
			return;
		}
		sendJson(response, 200, { transcript });
		return;
	}
	if (method === "POST" && route === "/command") {
		const body = await readJsonBody(request);
		if (body === void 0) {
			sendJson(response, 400, { error: "malformed JSON body" });
			return;
		}
		const machineName = typeof body["machineName"] === "string" ? body["machineName"] : "";
		const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "";
		const text = typeof body["text"] === "string" ? body["text"] : "";
		const outcome = service.submitCommand(machineName, sessionId, text);
		if (!outcome.ok) {
			sendJson(response, 409, {
				ok: false,
				reason: outcome.reason
			});
			return;
		}
		sendJson(response, 200, {
			ok: true,
			commandId: outcome.commandId
		});
		return;
	}
	if (method === "POST" && route === "/answer") {
		const body = await readJsonBody(request);
		if (body === void 0) {
			sendJson(response, 400, { error: "malformed JSON body" });
			return;
		}
		const machineName = typeof body["machineName"] === "string" ? body["machineName"] : "";
		const questionId = typeof body["questionId"] === "string" ? body["questionId"] : "";
		const answers = answerItemsOf(body["answers"]);
		if (questionId === "" || answers === void 0) {
			sendJson(response, 400, { error: "questionId and answers are required" });
			return;
		}
		const outcome = service.submitAnswer(machineName, questionId, answers);
		if (!outcome.ok) {
			sendJson(response, 409, {
				ok: false,
				reason: outcome.reason
			});
			return;
		}
		sendJson(response, 200, {
			ok: true,
			commandId: outcome.commandId
		});
		return;
	}
	if (method === "POST" && route === "/approval") {
		const body = await readJsonBody(request);
		if (body === void 0) {
			sendJson(response, 400, { error: "malformed JSON body" });
			return;
		}
		const machineName = typeof body["machineName"] === "string" ? body["machineName"] : "";
		const approvalId = typeof body["approvalId"] === "string" ? body["approvalId"] : "";
		const decision = approvalDecisionOf(body["decision"]);
		if (approvalId === "" || decision === void 0) {
			sendJson(response, 400, { error: "approvalId and a decision of allowed-once or rejected are required" });
			return;
		}
		const outcome = service.submitApproval(machineName, approvalId, decision);
		if (!outcome.ok) {
			sendJson(response, 409, {
				ok: false,
				reason: outcome.reason
			});
			return;
		}
		sendJson(response, 200, {
			ok: true,
			commandId: outcome.commandId
		});
		return;
	}
	if (method === "GET" && route === "/events") {
		openStream(service, response);
		return;
	}
	sendJson(response, 404, { error: "unknown route" });
}
/**
* Apply the composition's own browser authentication to one request.
*
* The GUI's token gate covers only the routes the frontend itself serves: a
* prefix route registered here is matched before the fallback that enforces it,
* which is how `/dsh-session-sync/config` came to answer 200 without a token and
* hand out the sync password. `ctx.connection.requestRejection` is the shipped
* seam for adopting that same Host/Origin fence and browser session on another
* route, so this surface ends up exactly as protected as the GUI it lives in —
* with no second secret for anyone to manage.
*
* A composition without `ctx.connection` (no browser frontend at all) has no
* gate to inherit, and these routes are then as open as that composition's own
* web surface. A fence that throws is answered 401: an authorization check that
* fails open is worse than one that fails closed.
* @param ctx - the scoped Host context carrying the routes.
* @param request - the request being dispatched.
* @returns the rejection status, or undefined when the route may serve it.
*/
function rejectionOf(ctx, request) {
	const connection = ctx.get("connection");
	if (connection === void 0 || connection === null) return void 0;
	try {
		return connection.requestRejection({ headers: request.headers });
	} catch (error) {
		ctx.logger.warn(`dsh-session-sync: browser-trust check failed: ${describe(error)}`);
		return 401;
	}
}
/** Hold one SSE response open and pump every frame into it. */
function openStream(service, response) {
	response.statusCode = 200;
	response.setHeader("content-type", "text/event-stream; charset=utf-8");
	response.setHeader("cache-control", "no-cache, no-transform");
	response.setHeader("connection", "keep-alive");
	response.setHeader("x-accel-buffering", "no");
	response.write(": connected\n\n");
	const detach = service.attachBrowser({ send: (frame) => {
		if (response.writableEnded) return;
		response.write(`data: ${JSON.stringify(frame)}\n\n`);
	} });
	const keepalive = setInterval(() => {
		if (response.writableEnded) return;
		response.write(": keepalive\n\n");
	}, KEEPALIVE_MS);
	response.on("close", () => {
		clearInterval(keepalive);
		detach();
	});
}
/**
* Read one JSON request body, bounded.
*
* @param request - the request being read.
* @returns the parsed object, an empty object when there is no body at all, or
*   undefined when the bytes are not a JSON object. The caller answers 400 for
*   undefined: a malformed body is the caller's mistake, and reporting it as a
*   server error both lies to them and hides the real cause in the log.
*/
async function readJsonBody(request) {
	const chunks = [];
	let total = 0;
	await new Promise((resolve, reject) => {
		request.on("data", (chunk) => {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
			total += buffer.byteLength;
			if (total > MAX_BODY_BYTES) {
				reject(/* @__PURE__ */ new Error("request body too large"));
				return;
			}
			chunks.push(buffer);
		});
		request.on("end", () => {
			resolve();
		});
		request.on("error", (error) => {
			reject(error instanceof Error ? error : new Error(String(error)));
		});
	});
	if (chunks.length === 0) return {};
	let parsed;
	try {
		parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return;
	}
	return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : void 0;
}
/** Write one JSON response. */
function sendJson(response, status, body) {
	if (response.writableEnded) return;
	const text = JSON.stringify(body);
	response.statusCode = status;
	response.setHeader("content-type", "application/json; charset=utf-8");
	response.setHeader("cache-control", "no-store");
	response.end(text);
}
/** Human-readable one-line failure text. */
function describe(error) {
	return error instanceof Error ? error.message : String(error);
}
/**
* Read one console decision on an approval, or nothing when it is not one.
*
* Exactly two values are acceptable, and they are the two a *human* can mean. The
* upstream vocabulary also has `cancelled` and `unavailable`, which describe an
* answerer rather than a decision — and `unavailable` in particular is the
* fail-closed value a caller must receive from its own side, never something a
* remote console can hand it. Refusing them here is the first of the two places
* that rule is enforced; `ApprovalRelay`'s validator is the second.
* @param value - the request's `decision` field.
* @returns the decision, or undefined when it is not one a console may make.
*/
function approvalDecisionOf(value) {
	if (value === "allowed-once" || value === "rejected") return value;
}
/**
* Read one console answer, or nothing when it is not one.
*
* The question id and the selection are both required, and a selection may be
* empty: a skipped question stays in the batch as an empty choice, which is the
* same shape the local UI produces. Free text is the "Other" answer and is
* allowed on its own, because a question with no options is answered that way.
* @param value - the request's `answers` field.
* @returns the answers, or undefined when the body is not a complete answer.
*/
function answerItemsOf(value) {
	if (!Array.isArray(value) || value.length === 0) return void 0;
	const items = [];
	for (const entry of value) {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return void 0;
		const record = entry;
		const id = typeof record["id"] === "string" && record["id"].trim().length > 0 ? record["id"] : void 0;
		const selected = record["selected"];
		if (id === void 0 || !Array.isArray(selected)) return void 0;
		const labels = [];
		for (const label of selected) {
			if (typeof label !== "string") return void 0;
			labels.push(label);
		}
		const custom = typeof record["custom"] === "string" ? record["custom"] : void 0;
		items.push({
			id,
			selected: labels,
			...custom === void 0 ? {} : { custom }
		});
	}
	return items;
}
/**
* Read one query parameter as a non-negative whole number.
* @param raw - the parameter, or null when it was not sent.
* @returns the number, or undefined when it is absent or not a whole count.
*/
function wholeNumber(raw) {
	if (raw === null || raw.trim() === "") return void 0;
	const value = Number(raw);
	return Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
//#endregion
export { Config, apply, name, pluginVersion };
