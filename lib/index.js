import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
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
/**
* Where the plugin records the Sessions it wrote into this Host's own storage.
*
* Separate from the configuration on purpose: this is engine state, it grows by
* itself, and the gate that keeps a mirrored Session read-only reads it at boot
* — a document the user edits in the settings page is the wrong place for it.
*/
const MATERIALIZED_FILE_NAME = "dsh-session-sync-materialized.json";
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
		materialize: true
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
	const port = source["listenPort"];
	return {
		machineName: text(source["machineName"]) ?? base.machineName,
		serverUrl: text(source["serverUrl"]) ?? base.serverUrl,
		isServer: source["isServer"] === true,
		password: text(source["password"]) ?? base.password,
		listenHost: text(source["listenHost"]) ?? base.listenHost,
		listenPort: typeof port === "number" && Number.isInteger(port) && port > 0 && port < 65536 ? port : base.listenPort,
		syncSessions,
		materialize: source["materialize"] !== false
	};
}
/** Read one optional non-empty string field. */
function text(value) {
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
* Hard ceiling on the raised retention a caller may ask for.
*
* Materializing a long Session has to hold its whole log at once, and a real one
* on this deployment was 11,836 events. This is the bound that keeps "hold the
* history" from becoming "let a caller decide how much memory this process uses":
* a Session that needs more than this is refused by the writer rather than
* buffered without limit.
*/
const RETAIN_LIMIT = 4e4;
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
/** Upper bound on retained command states per machine, newest kept. */
const STATUS_LIMIT = 64;
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
* messages, which is what materializing already asks for, so a reader asks the
* same way and gets ten times as much per click.
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
					...session.header === void 0 ? {} : { header: session.header }
				});
				continue;
			}
			existing.title = session.title;
			existing.updatedAt = session.updatedAt;
			existing.running = session.running;
			existing.originSeq = reported(session.lastSeq);
			existing.originHasOlder = session.hasOlder === true;
			if (session.header === void 0) delete existing.header;
			else existing.header = session.header;
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
		if (payload.header !== void 0) session.header = payload.header;
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
		session.events.push(...fresh);
		session.events.sort((left, right) => left.seq - right.seq);
		const ceiling = session.retain ?? EVENT_LIMIT;
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
		for (const record of this.records.values()) for (const session of record.sessions.values()) this.reportGap(record, session);
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
		for (const command of queued) {
			if (command.expiresAt <= now) {
				this.transition(record, command, "expired");
				continue;
			}
			sink.send(command);
			this.transition(record, command, "delivered");
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
		const command = {
			commandId: mintId(),
			sessionId,
			kind: "prompt",
			text: trimmed,
			from,
			expiresAt: Date.now() + COMMAND_TTL_MS
		};
		if (record.origin === void 0) {
			record.pending.push(command);
			this.transition(record, command, "queued");
			if (record.pending.length > PENDING_LIMIT) for (const dropped of record.pending.splice(0, record.pending.length - PENDING_LIMIT)) this.transition(record, dropped, "expired", "the queue for this machine was full");
		} else {
			record.origin.send(command);
			this.transition(record, command, "delivered");
		}
		return {
			ok: true,
			commandId: command.commandId
		};
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
		const status = record.commands.get(payload.commandId);
		if (status === void 0) return;
		if (TERMINAL_STATES.includes(status.state)) return;
		if (payload.ok) this.transition(record, status, "accepted");
		else this.transition(record, status, "failed", payload.error ?? "the owning machine refused the prompt");
	}
	/**
	* Retire every command that outlived its TTL, queued or already sent.
	*
	* A command written to an origin's stream is not confirmed by that write: if
	* the link died in the same instant, nothing else would ever move it out of
	* `delivered`. The origin refuses an expired prompt on its own, so this is the
	* server's half of the same rule, and the half that tells the browser.
	*/
	expireCommands() {
		const now = Date.now();
		for (const record of this.records.values()) {
			for (const status of [...record.commands.values()]) {
				if (TERMINAL_STATES.includes(status.state)) continue;
				if (status.expiresAt > now) continue;
				this.transition(record, status, "expired");
			}
			const kept = record.pending.filter((command) => command.expiresAt > now);
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
	* @param page - page size, the exclusive upper sequence to read below, how much
	*   history to retain while this caller works, and whether to drop that hold.
	* @returns the page, or undefined when the mirror holds no such Session.
	*/
	/**
	* The header the owning machine last stated for one Session, if any.
	*
	* The read the writer needs: a materialized log has to state the Session's own
	* fields, and the machine that writes it is not the machine that has them.
	* @param machineName - owning machine.
	* @param sessionId - published Session.
	* @returns the header, or undefined when the origin has not stated one.
	*/
	sessionHeader(machineName, sessionId) {
		return this.records.get(machineName)?.sessions.get(sessionId)?.header;
	}
	transcript(machineName, sessionId, page = { limit: TRANSCRIPT_WINDOW }) {
		const record = this.records.get(machineName);
		const session = record?.sessions.get(sessionId);
		if (record === void 0 || session === void 0) return void 0;
		if (page.release === true) session.retain = void 0;
		if (page.retain !== void 0) session.retain = Math.min(Math.max(session.retain ?? EVENT_LIMIT, page.retain), RETAIN_LIMIT);
		const before = page.before;
		const end = before === void 0 ? session.events.length : session.events.findIndex((event) => event.seq >= before);
		const stop = end < 0 ? session.events.length : end;
		const size = Math.min(Math.max(1, page.limit), session.retain ?? EVENT_LIMIT);
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
	* scroll. Materializing is not reading: it needs the Session's *beginning*, so
	* it asks directly and in the largest pages the origin serves.
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
			commands: /* @__PURE__ */ new Map()
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
	transition(record, seed, state, error) {
		const status = {
			commandId: seed.commandId,
			machineName: record.machineName,
			sessionId: seed.sessionId,
			state,
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
		missingEvents: missingOf(session)
	};
}
/**
* How many events one mirror is short of what its origin holds.
*
* Two things can be missing, and they are counted separately because only the
* first is visible from the events themselves:
*
*  - holes *inside* the held range, which a replacement window or an out-of-order
*    arrival can leave, and which the retained run's extent reveals; and
*  - everything above the highest sequence held, up to the watermark the origin
*    states in its index. Nothing below the top says that a run never arrived —
*    an empty mirror is the extreme case of that — so without the stated
*    watermark a mirror that lost everything is indistinguishable from one whose
*    Session has simply done nothing yet.
*
* Zero is the healthy answer, and the only one that clears an episode.
* @param session - the record to measure.
* @returns the count of events the origin has and this mirror does not.
*/
function missingOf(session) {
	const lowest = session.events[0]?.seq;
	return (lowest === void 0 ? 0 : Math.max(0, session.maxSeq - lowest + 1 - session.seqs.size)) + Math.max(0, session.originSeq - session.maxSeq);
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
//#region src/host/ledger.ts
/**
* The ledger of Sessions this Host mirrored into its own storage.
*
* Writing a mirrored Session into `sessionPersistence` makes DSH treat it as an
* ordinary Session: it appears in the browser, opens in the official
* conversation page, and pages its history through the Host. What it must never
* do is *run*: a step on this Host would grow a second truth beside the machine
* that owns the Session.
*
* Archiving would be the shipped way to say that, and it is the wrong tool here
* — a closed Session cannot be opened at all (`WorkspaceBrowser.guardedOpen`
* answers an archived row with `archivedNotOpenable`) and the default archived
* filter hides it, so an archived mirror is a Session nobody can read. So the
* read-only half is this ledger plus the plugin's own `agent/pre-step` gate:
* the Session stays listed and openable, and every proposed step is refused.
*
* The ledger is durable on purpose. The mirror is memory-only and rebuilds from
* the origin's next publish, so membership derived from the mirror would leave a
* window after every restart — and would disappear entirely for a Session the
* origin stops publishing, which is exactly when a runnable copy is most
* dangerous. A file the plugin owns answers "is this one of ours" in every one
* of those states.
*/
/**
* The set of Sessions this Host has written a mirror log for.
*
* Every mutation persists before it resolves: the gate reads this from memory on
* a hot path, and a mark that survived only until the next restart would fail
* open exactly once per boot.
*/
var MirrorLedger = class MirrorLedger {
	path;
	sessions;
	constructor(path, sessions) {
		this.path = path;
		this.sessions = sessions;
	}
	/**
	* Read the ledger, treating a missing or unreadable document as empty.
	* @param home - Harness home directory.
	* @returns the ledger, ready to answer `owns`.
	*/
	static async open(home) {
		const path = join(home, MATERIALIZED_FILE_NAME);
		let parsed;
		try {
			parsed = JSON.parse(await readFile(path, "utf8"));
		} catch {
			parsed = void 0;
		}
		return new MirrorLedger(path, readEntries(parsed));
	}
	/** Path of the document this ledger owns. */
	get file() {
		return this.path;
	}
	/**
	* Whether this Host wrote (and therefore gates) one Session.
	* @param sessionId - the Session under test.
	* @returns whether a mirror log exists for it.
	*/
	owns(sessionId) {
		return this.sessions.has(sessionId);
	}
	/**
	* One entry, for reporting.
	* @param sessionId - the Session asked about.
	* @returns the entry, or undefined when the ledger does not hold it.
	*/
	get(sessionId) {
		return this.sessions.get(sessionId);
	}
	/** Every mirrored Session this Host holds, in insertion order. */
	list() {
		return [...this.sessions].map(([sessionId, entry]) => ({
			sessionId,
			entry
		}));
	}
	/**
	* Record that a log was written, or that it grew.
	* @param sessionId - the Session.
	* @param machineName - the machine that owns it.
	* @param events - how many events the log now holds.
	*/
	async mark(sessionId, machineName, events) {
		const previous = this.sessions.get(sessionId);
		if (previous?.stopped !== void 0) return;
		this.sessions.set(sessionId, {
			machineName,
			at: previous?.at ?? Date.now(),
			events
		});
		await this.persist();
	}
	/**
	* Note that the openable copy no longer tracks the mirror.
	* @param sessionId - the Session.
	* @param reason - what stopped it.
	*/
	async stop(sessionId, reason) {
		const previous = this.sessions.get(sessionId);
		if (previous === void 0 || previous.stopped === reason) return;
		this.sessions.set(sessionId, {
			...previous,
			stopped: reason
		});
		await this.persist();
	}
	/**
	* Forget one Session, so it may run on this Host again.
	*
	* The log is deliberately left on disk: this drops the gate, not the Session.
	* @param sessionId - the Session to release.
	* @returns whether the ledger held it.
	*/
	async release(sessionId) {
		if (!this.sessions.delete(sessionId)) return false;
		await this.persist();
		return true;
	}
	/** Write the document atomically, so a crash cannot truncate it. */
	async persist() {
		await mkdir(dirname(this.path), { recursive: true });
		const document = {
			version: 1,
			sessions: Object.fromEntries(this.sessions)
		};
		const temporary = `${this.path}.${process.pid.toString()}.tmp`;
		await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
		await rename(temporary, this.path);
	}
};
/**
* Read the persisted map, ignoring anything that is not the shape this
* document has. A ledger that cannot be read is an empty ledger — which fails
* *closed* for the log and *open* for the gate, so the entries are validated
* field by field rather than trusted.
* @param parsed - the parsed document, or undefined.
* @returns the entries it states.
*/
function readEntries(parsed) {
	const entries = /* @__PURE__ */ new Map();
	if (typeof parsed !== "object" || parsed === null) return entries;
	const sessions = parsed.sessions;
	if (typeof sessions !== "object" || sessions === null) return entries;
	for (const [sessionId, value] of Object.entries(sessions)) {
		if (typeof value !== "object" || value === null) continue;
		const candidate = value;
		if (typeof candidate.machineName !== "string") continue;
		entries.set(sessionId, {
			machineName: candidate.machineName,
			at: typeof candidate.at === "number" ? candidate.at : 0,
			events: typeof candidate.events === "number" ? candidate.events : 0,
			...typeof candidate.stopped === "string" ? { stopped: candidate.stopped } : {}
		});
	}
	return entries;
}
/**
* Restate a Windows drive path so a POSIX Host reads it as absolute.
*
* The format validator asks `node:path.isAbsolute`, which answers for *this*
* Host's platform: on Linux it rejects `C:\\work`, so a Session mirrored from a
* Windows machine could never be written — every event was refused with
* `format v4 header cwd must be absolute` before a single byte was written. The
* drive is kept, only its notation changes: `C:\\a\\b` becomes `/C:/a/b`, which is
* absolute everywhere and still says which drive it was.
*
* Anything already absolute is left exactly as it is, and a path this cannot
* restate is dropped rather than guessed at — a wrong working directory is worse
* than none.
* @param cwd - the working directory the mirror reported.
* @param absolute - the platform's own test, injectable for tests.
* @returns a path this Host will accept, or undefined to leave it out.
*/
function portableCwd(cwd, absolute) {
	if (cwd === void 0) return void 0;
	if (absolute(cwd)) return cwd;
	const drive = /^([A-Za-z]):[\\/]/u.exec(cwd);
	if (drive === null) return void 0;
	return `/${drive[1] ?? ""}:${cwd.slice(2).replaceAll("\\", "/")}`;
}
/**
* How many events one stored Session holds, or undefined when nothing is on disk.
*
* `eventCount` is optional in the storage contract — "when the backend can provide
* it cheaply from metadata; otherwise absent" — and the JSONL backend does not
* provide it, which is how a 705 KB log came to be recorded as `events: 0` and
* then misread as "the log is not on disk". So the fallback is the log itself:
* one read, at the moment a copy is adopted or first continued, with the count
* kept in the ledger afterwards.
* @param persistence - the Host's durable Session storage.
* @param sessionId - the Session to measure.
* @returns the stored event count, or undefined when no log exists.
*/
async function storedEventCount(persistence, sessionId) {
	const snapshot = await persistence.stat(sessionId);
	if (snapshot === void 0) return void 0;
	if (typeof snapshot.eventCount === "number") return snapshot.eventCount;
	const handle = await persistence.open(sessionId, "read");
	try {
		return (await handle.read(0)).events.length;
	} finally {
		await handle.close().catch(() => void 0);
	}
}
/**
* Whether a failure means the log is in use rather than unusable.
*
* A copy opened in DSH's own page becomes a live Session on this Host, and a live
* Session's machinery claims its log's write handle — so the plugin's append is
* refused with `SessionAlreadyOwnedError`. That is a *wait*: the claim is released
* when the Session goes cold, and the events are still in the mirror. The seam
* exports no error class to test against, so the name is checked first and the
* handle's own wording second.
* @param error - what `open('write')` threw.
* @returns whether the log is busy rather than broken.
*/
function isLogBusy(error) {
	if (typeof error === "object" && error !== null && error.name === "SessionAlreadyOwnedError") return true;
	return error instanceof Error && /already owned by an active write handle/u.test(error.message);
}
/**
* Whether the log still holds, at the sequences it shares with the mirror, the
* events the mirror delivered there.
*
* This is the cheap test for "something else wrote to this copy". A prompt typed
* into the copy opens a turn even when the gate refuses its step — the shipped
* archived-Session gate leaves the same `turn/start` / `turn/end` trail — and
* those local events take the very sequences the origin's own next events will
* arrive under. Appending above them embeds a hole where the origin's events
* should have gone, and the log stops being the Session while still looking
* whole. Only a bounded tail is compared, and only when the log is longer than
* this Host last recorded, so the read is paid once per surprise.
* @param persistence - the Host's durable Session storage.
* @param sessionId - the Session under test.
* @param events - the events the mirror holds.
* @param stored - how many events the log holds.
* @returns false when the log has diverged, true when it agrees, undefined when
*   there is nothing to compare.
*/
async function logAgreesWithMirror(persistence, sessionId, events, stored, window = 8) {
	if (stored === 0) return true;
	const from = Math.max(0, stored - window);
	const handle = await persistence.open(sessionId, "read");
	try {
		const held = (await handle.read(from, stored - from)).events;
		if (held.length === 0) return void 0;
		for (const [index, row] of held.entries()) {
			const seq = from + index;
			const mirrored = events.find((event) => event.seq === seq);
			if (mirrored === void 0) continue;
			if (row.type !== mirrored.type || row.seq !== seq) return false;
		}
		return true;
	} finally {
		await handle.close().catch(() => void 0);
	}
}
/**
* Whether one envelope can be written as-is.
*
* The storage layer owns the format; this is the check that keeps a malformed
* mirror record from making the whole Session unreadable. It is deliberately
* about shape and order rather than vocabulary: an event type this Host does not
* know is still a legitimate record.
* @param envelope - the candidate.
* @param expectedSeq - the sequence the log needs next.
* @returns whether the envelope may be appended.
*/
function writable(envelope, expectedSeq) {
	if (typeof envelope !== "object" || envelope === null) return false;
	const candidate = envelope;
	if (typeof candidate.type !== "string" || candidate.type === "") return false;
	if (candidate.seq !== expectedSeq) return false;
	if (typeof candidate.time !== "number" || !Number.isFinite(candidate.time)) return false;
	const data = candidate.data;
	return typeof data === "object" && data !== null && !Array.isArray(data);
}
/**
* What to do about one mirrored Session whose log may already exist.
*
* `create` refuses an id that is already on disk, which is right — overwriting a
* log destroys whatever it held — but it is not an answer, because the caller has
* three different situations behind that one refusal:
*
* - **nothing on disk**: write it;
* - **a log this Host itself ran** (`owner` is this Host): leave it alone. The
*   Session belongs to this Host, and gating or rewriting it would damage the
*   original — this is the case the writer's "an existing id is left alone" rule
*   exists for;
* - **a log under an id another machine owns**: this Host wrote it from a mirror
*   in an earlier life — before a restart, before the ledger existed, or under a
*   build that did not keep one. It is a copy, so it is *ours to own*: adopting it
*   into the ledger is what puts it back under the gate.
*
* Without the third case the automatic pass retries `create` forever — measured
* live, against a log an earlier manual materialization had left: `materialized`
* stayed empty, the copy stopped tracking the mirror, and it was outside the gate
* the whole time.
* @param stored - what `stat` says about the id, or undefined when nothing is on disk.
* @param owner - the machine the mirror says owns the Session.
* @param self - this Host's own machine name.
* @returns which of the three situations this is.
*/
function startFor(stored, owner, self) {
	if (stored === void 0) return "create";
	return owner === self ? "ours" : "adopt";
}
/**
* Write one mirrored Session into this Host's own storage.
*
* A Session that already exists under this id is left alone: the caller may be
* looking at a mirror of a Session this Host ran itself, and overwriting that log
* would destroy the original. Continuing an existing *mirror* log is a different
* call ({@link catchUpSession}), which appends only what the log is missing.
* @param persistence - the Host's durable Session storage, when it is mounted.
* @param input - the Session and the events the mirror holds for it.
* @returns what was written, or why nothing was.
*/
async function materializeSession(persistence, input) {
	const none = (reason) => ({
		ok: false,
		written: 0,
		skipped: 0,
		stored: 0,
		created: false,
		reason
	});
	if (persistence === void 0) return none("this Host has no session storage mounted");
	if (input.events.length === 0) return none("the mirror holds no events for this Session");
	const first = input.events[0];
	if (first === void 0 || first.seq !== 0) return none("the mirror holds only the newest window; backfill is required");
	const { written, skipped, endsAt } = contiguous(input.events, 0);
	if (written.length === 0) return {
		ok: false,
		written: 0,
		skipped,
		stored: 0,
		created: false,
		reason: "no event passed the write check"
	};
	if (endsAt < input.events.at(-1).seq) return {
		ok: false,
		written: 0,
		skipped,
		stored: 0,
		created: false,
		reason: `the mirror's run stops at seq ${String(endsAt - 1)}; the rest is not contiguous, so nothing was written — the Session needs its gaps filled first`
	};
	let handle;
	try {
		const cwd = portableCwd(input.cwd, isAbsolute);
		handle = await persistence.create({
			version: 4,
			id: input.sessionId,
			createdAt: input.createdAt,
			isSeeded: false,
			...cwd === void 0 ? {} : { cwd },
			...input.agentPreset === void 0 ? {} : { agentPreset: input.agentPreset },
			...input.origin === void 0 ? {} : { origin: input.origin }
		});
	} catch (error) {
		return {
			ok: false,
			written: 0,
			skipped,
			stored: 0,
			created: false,
			reason: `cannot create the log: ${String(error)}`
		};
	}
	try {
		await handle.append(written);
		await handle.flush();
	} catch (error) {
		return {
			ok: false,
			written: 0,
			skipped,
			stored: 0,
			created: false,
			reason: `cannot write the log: ${String(error)}`
		};
	} finally {
		await handle.close().catch(() => void 0);
	}
	return {
		ok: true,
		written: written.length,
		skipped,
		stored: written.length,
		created: true
	};
}
/**
* Continue an existing mirror log with whatever the mirror has grown since.
*
* The log is append-only and never rewritten, so this can only ever move it
* forward: it starts at the stored count, takes the contiguous run from there,
* and leaves the rest where it is. A mirror with a hole below the log's end
* cannot be repaired through this path, which is why the caller records why it
* stopped rather than retrying forever.
* @param persistence - the Host's durable Session storage.
* @param sessionId - the Session being continued.
* @param events - the mirrored events, in log order.
* @returns what was appended, or why nothing was.
*/
async function catchUpSession(persistence, sessionId, events) {
	const none = (stored, reason) => ({
		ok: false,
		written: 0,
		skipped: 0,
		stored,
		created: false,
		reason
	});
	if (persistence === void 0) return none(0, "this Host has no session storage mounted");
	let stored;
	try {
		const known = await storedEventCount(persistence, sessionId);
		if (known === void 0) return none(0, "the log is not on disk; it has to be created first");
		stored = known;
	} catch (error) {
		return none(0, `cannot read the log: ${String(error)}`);
	}
	if (stored === 0) return none(0, "the log is not on disk; it has to be created first");
	const pending = events.filter((event) => event.seq >= stored);
	if (pending.length === 0) return {
		ok: true,
		written: 0,
		skipped: 0,
		stored,
		created: false
	};
	const { written, skipped, endsAt } = contiguous(pending, stored);
	if (written.length === 0) return {
		ok: false,
		written: 0,
		skipped,
		stored,
		created: false,
		wait: true,
		reason: `the mirror holds nothing at seq ${String(stored)}`
	};
	let handle;
	try {
		handle = await persistence.open(sessionId, "write");
	} catch (error) {
		if (isLogBusy(error)) return {
			ok: false,
			written: 0,
			skipped: 0,
			stored,
			created: false,
			wait: true,
			reason: "the log is held by a live run on this Host"
		};
		return none(stored, `cannot open the log: ${String(error)}`);
	}
	try {
		await handle.append(written);
		await handle.flush();
	} catch (error) {
		return none(stored, `cannot append to the log: ${String(error)}`);
	} finally {
		await handle.close().catch(() => void 0);
	}
	return {
		ok: true,
		written: written.length,
		skipped,
		stored: endsAt,
		created: false,
		...endsAt === events.at(-1).seq ? {} : { reason: `the mirror's run stops at seq ${String(endsAt - 1)}` }
	};
}
/**
* The leading run of events that can be appended from `from`.
*
* The write check is about shape and order rather than vocabulary: an event type
* this Host does not know is still a legitimate record, and the storage layer's
* own contiguity assertion is the backstop.
* @param events - the candidates, in log order.
* @param from - the sequence the log needs next.
* @returns the writable prefix, how many were refused, and where the run ends.
*/
function contiguous(events, from) {
	const written = [];
	let skipped = 0;
	let expected = from;
	for (const event of events) {
		if (!writable(event, expected)) {
			skipped += 1;
			continue;
		}
		written.push(event);
		expected += 1;
	}
	return {
		written,
		skipped,
		endsAt: expected
	};
}
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
			const payload = {
				machineName,
				sessions: Array.isArray(body?.["sessions"]) ? body["sessions"] : []
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
	/**
	* The newest header per Session, waiting for a batch to ride out on.
	*
	* Held here rather than on a chosen batch because what goes out is whatever is at
	* the head: a Session with events already queued has no "first batch of this call",
	* and a header pinned to one would wait behind them.
	*/
	headerOut = /* @__PURE__ */ new Map();
	/** Events held in the outbox, so the cap is measured in events, not batches. */
	outboxEvents = 0;
	/** Whether the drain loop is running, so only one posts at a time. */
	pumping = false;
	/** Whether the depth has been reported for the current episode. */
	outboxWarned = false;
	/** What the last published batch looked like, as the wire will see it. */
	lastBatch;
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
		this.headerOut.clear();
		this.setLinked(false);
	}
	/**
	* Publish this machine's Session index.
	* @param payload - the Sessions currently marked for sync.
	*/
	publishIndex(payload) {
		this.post("/publish", { sessions: payload.sessions });
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
	* @param header - the Session's own header, when this publish is the one carrying it.
	*/
	publishFrames(sessionId, events, header) {
		if (header !== void 0) this.headerOut.set(sessionId, header);
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
					const carried = this.headerOut.get(batch.sessionId);
					if (!await this.post("/frames", {
						sessionId: batch.sessionId,
						events: batch.events,
						...carried === void 0 ? {} : { header: carried }
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
	* Discrimination is by `kind`, and an unrecognised one is ignored: a server
	* that learns a new frame must not be able to break an origin that does not,
	* which is also why the resync carries no ack to wait for.
	*/
	consume(block) {
		for (const line of block.split("\n")) {
			if (!line.startsWith("data:")) continue;
			const text = line.slice(5).trim();
			if (text === "") continue;
			try {
				const frame = JSON.parse(text);
				if (typeof frame.sessionId !== "string") continue;
				if (frame.kind === "prompt") this.options.onCommand(frame);
				else if (frame.kind === "resync") this.options.onResync(frame.sessionId);
				else if (frame.kind === "older" && typeof frame.beforeSeq === "number") this.options.onOlder(frame.sessionId, frame.beforeSeq, typeof frame.maxMessages === "number" ? frame.maxMessages : 0);
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
* Why a copy stopped tracking its mirror because it grew on its own.
*
* Said once, here, because it is reported in `state` and in the console: a copy
* that has events of its own is no longer the Session, and the operator needs to
* know that rather than see a log that looks complete.
*/
const DIVERGED_REASON = "this copy grew on its own (a turn was opened in it), so it is no longer the Session the mirror holds";
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
/**
* How far materializing walks an origin back before it gives up.
*
* The mirror holds the newest window, and a Session's log has to begin at its
* beginning, so a long Session needs the origin to page backwards until it does.
* One round is one ask plus one wait, so this is a time budget rather than a
* statement about what is possible: a Session that needs more is reported, not
* half-written. Materializing a live Session wants the whole log, which for one
* measured here was 11,836 events, so the budget has to cover the pages that
* takes at the latency below.
*/
const BACKFILL_ROUNDS = 40;
/**
* How long one backfill round waits, in ticks of {@link BACKFILL_TICK_MS}.
*
* This has to exceed a page's real round trip, which measured at ten to twenty
* seconds on a cross-border link: the ask is a frame down the origin's stream,
* then a read of that machine's log, then a POST of the page back. At the original
* six seconds the walk declared a page idle while it was still in flight, gave up
* with the low edge short, and released the retention hold — so the page that did
* arrive was trimmed away again.
*/
const BACKFILL_TICKS = 60;
/** One backfill tick: how often a waiting round re-reads the mirror's edge. */
const BACKFILL_TICK_MS = 500;
/**
* Rounds that may move nothing before materializing gives up.
*
* The origin reads its own log on its own schedule, so a single still round says
* nothing; two in a row mean it has no more below, or is not answering.
*/
const BACKFILL_IDLE_ROUNDS = 2;
/**
* Messages one backfill page covers.
*
* Materializing is not scrolling: it wants the beginning as fast as the origin
* will serve it, and the origin's own page ceiling is 500 messages.
*/
const BACKFILL_PAGE_MESSAGES = 500;
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
	home;
	ledger;
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
	/** What the last opening frame said about its header, and whether it was read. */
	headerSeen;
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
	* What the last history read did, for the settings page.
	*
	* The host half writes its log where this deployment cannot read it, and a
	* page that comes back empty is indistinguishable from a machine that has
	* nothing older — so the one fact that separates them is published here.
	*/
	lastPageRead;
	/** The last publish attempt, as the settings page reports it. */
	lastPublish;
	/** True while a materialize pass is in flight; see {@link materializeTick}. */
	materializing = false;
	disposed = false;
	constructor(ctx, home, config, ledger) {
		this.ctx = ctx;
		this.home = home;
		this.ledger = ledger;
		this.config = config;
		this.hub = new SyncHub((frame) => {
			this.broadcast(frame);
		}, () => this.view(), this.ctx.logger);
	}
	/**
	* Load the persisted configuration and build the engine.
	* @param ctx - the scoped Host context that already resolved `sessionController`.
	* @param home - Harness home directory.
	* @returns the ready service; the caller decides when to {@link start} it.
	*/
	static async create(ctx, home) {
		return new SessionSyncService(ctx, home, await loadConfig(home, hostname()), await MirrorLedger.open(home));
	}
	/** Begin reconciling and bring the configured role up. */
	start() {
		this.reconcileTimer = setInterval(() => {
			this.hub.expireCommands();
			this.hub.sweepGaps();
			this.reconcile();
			this.materializeTick();
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
		if (this.reconcileTimer !== void 0) clearInterval(this.reconcileTimer);
		if (this.flushTimer !== void 0) clearInterval(this.flushTimer);
		for (const handle of this.follows.values()) handle.abort.abort();
		this.follows.clear();
		this.link?.stop();
		this.link = void 0;
		await this.stopServer();
		this.browsers.clear();
	}
	/** The configuration as the browser should render it. */
	configView() {
		return {
			...this.config,
			syncSessions: { ...this.config.syncSessions }
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
			listening,
			...this.listenError === void 0 ? {} : { listenError: this.listenError },
			linked,
			...this.linkError === void 0 ? {} : { linkError: this.linkError },
			machines: this.config.isServer ? this.hub.machines() : [],
			published: Object.values(this.config.syncSessions).filter(Boolean).length,
			materialize: this.config.materialize,
			...this.config.isServer ? { materialized: this.ledger.list().map(({ sessionId, entry }) => ({
				sessionId,
				machineName: entry.machineName,
				events: entry.events,
				at: entry.at,
				...entry.stopped === void 0 ? {} : { stopped: entry.stopped }
			})) } : {},
			...this.lastPublish === void 0 ? {} : { publish: this.lastPublish },
			...this.config.isServer ? {} : {
				follow: {
					frames: [...this.followFrameTypes],
					events: this.followEvents,
					historyMisses: this.historyMisses,
					localItems: this.localItems,
					localRows: this.localRows,
					posts: [...this.postCounts].map(([route, entry]) => route + ":" + String(entry.count) + (entry.ok ? "" : "!")),
					shapes: this.followShapes,
					...this.headerSeen === void 0 ? {} : { headerSeen: this.headerSeen },
					...this.followError === void 0 ? {} : { error: this.followError },
					...this.followErrorSession === void 0 ? {} : { sessionId: this.followErrorSession }
				},
				...batch === void 0 ? {} : { batch },
				follows: [...this.follows.values()].map((handle) => ({
					sessionId: handle.sessionId,
					cursor: handle.cursor,
					firstSeq: handle.firstSeq,
					lastSeq: handle.lastSeq,
					hasOlder: handle.hasOlder,
					opened: handle.opened,
					...handle.header === void 0 ? {} : { header: handle.header },
					pending: handle.pending.length,
					events: handle.seen,
					...handle.ended === void 0 ? {} : { ended: handle.ended }
				})),
				...this.lastPageRead === void 0 ? {} : { page: this.lastPageRead }
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
		const rows = items.filter((item) => (item.parentSessionId ?? void 0) === void 0 && item.origin !== "subagent").map((item) => this.row(item));
		this.localRows = rows.length;
		return rows.sort((left, right) => right.updatedAt - left.updatedAt);
	}
	/**
	* Apply one partial configuration write and persist it.
	* @param patch - the fields to change; absent fields keep their value.
	* @returns the complete configuration after the write.
	*/
	async patch(patch) {
		const previous = this.config;
		const next = {
			machineName: nonEmpty(patch.machineName) ?? previous.machineName,
			serverUrl: patch.serverUrl === void 0 ? previous.serverUrl : patch.serverUrl.trim(),
			isServer: patch.isServer ?? previous.isServer,
			password: patch.password === void 0 ? previous.password : patch.password,
			listenHost: nonEmpty(patch.listenHost) ?? previous.listenHost,
			listenPort: validPort(patch.listenPort) ?? previous.listenPort,
			syncSessions: { ...previous.syncSessions },
			materialize: patch.materialize ?? previous.materialize
		};
		if (patch.sessionSync !== void 0) if (patch.sessionSync.synced) next.syncSessions[patch.sessionSync.sessionId] = true;
		else delete next.syncSessions[patch.sessionSync.sessionId];
		this.config = next;
		await saveConfig(this.home, next);
		if (previous.isServer !== next.isServer || serverOrigin(previous.serverUrl) !== serverOrigin(next.serverUrl) || previous.listenHost !== next.listenHost || previous.listenPort !== next.listenPort || !next.isServer && previous.machineName !== next.machineName) await this.applyRole();
		else if (patch.sessionSync !== void 0) await this.reconcile();
		if (next.materialize && !previous.materialize) this.materializeTick();
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
	* @param page - page size, the exclusive upper sequence to read below, and how
	*   much history to retain while the caller works.
	* @returns the page, or undefined when nothing is mirrored under that address.
	*/
	transcript(machineName, sessionId, page) {
		return this.hub.transcript(machineName, sessionId, page);
	}
	/**
	* Write one mirrored Session into this Host's own storage.
	*
	* The mirror holds a window, and this Host's storage refuses a log that does
	* not begin at the Session's beginning, so the origin is walked back first and
	* the writer decides: a Session that arrives whole becomes a real Session on
	* this Host, a paged one is refused with the reason rather than written with a
	* hole at the front.
	*
	* The Session is deliberately not archived. An archived Session cannot be
	* opened in DSH's own page — the workspace browser answers with
	* `archivedNotOpenable` and hides the row behind the default archived filter —
	* so archiving it would defeat the point of writing it. Read-only is the
	* plugin's own gate over {@link MirrorLedger.owns} instead.
	* @param machineName - the machine that owns the Session.
	* @param sessionId - the published Session.
	* @returns what was written, or why nothing was.
	*/
	async materialize(machineName, sessionId) {
		let transcript = this.hub.transcript(machineName, sessionId, {
			limit: 1e5,
			retain: Number.MAX_SAFE_INTEGER
		});
		try {
			const empty = (reason) => ({
				ok: false,
				written: 0,
				skipped: 0,
				stored: 0,
				created: false,
				reason
			});
			if (transcript === void 0) return empty("nothing is mirrored under that address");
			if (await this.backfill(machineName, sessionId, transcript) > 0) transcript = this.hub.transcript(machineName, sessionId, { limit: 1e5 });
			if (transcript === void 0) return empty("the Session left the mirror while backfilling");
			const events = transcript.events;
			const first = events[0];
			if (first === void 0) return empty("the mirror holds no events for this Session");
			const row = this.hub.machines().find((machine) => machine.machineName === machineName)?.sessions.find((session) => session.sessionId === sessionId);
			const header = this.hub.sessionHeader(machineName, sessionId) ?? this.follows.get(sessionId)?.header;
			const result = await materializeSession(this.ctx.get("sessionPersistence"), {
				sessionId,
				createdAt: header?.createdAt ?? first.time,
				...row?.cwd === void 0 && header?.cwd === void 0 ? {} : { cwd: header?.cwd ?? row?.cwd },
				...header?.agentPreset === void 0 ? {} : { agentPreset: header.agentPreset },
				...header?.origin === void 0 ? {} : { origin: header.origin },
				events
			});
			if (result.ok) await this.ledger.mark(sessionId, machineName, result.stored);
			return result;
		} finally {
			this.hub.transcript(machineName, sessionId, {
				limit: 1,
				release: true
			});
		}
	}
	/**
	* Whether this Host holds a mirror-written copy of one Session.
	*
	* The `agent/pre-step` gate asks this on every proposed step. It answers from
	* the durable ledger rather than from the mirror, so the answer survives a
	* restart and does not depend on the origin still publishing.
	* @param sessionId - the Session proposing a step.
	* @returns whether the step must be refused.
	*/
	holdsMirrorOf(sessionId) {
		return this.ledger.owns(sessionId);
	}
	/**
	* Undo the archive an earlier build used to make a written copy read-only.
	*
	* Archiving looked like the shipped way to say "read-only", and it is — but it
	* also says "not readable": the workspace browser refuses to open an archived
	* row (`archivedNotOpenable`) and hides it behind the default archived filter.
	* A copy in that state is the one combination nobody wants: unusable by the
	* operator, and no longer needed by the plugin, whose gate is what keeps it
	* read-only now.
	* @param sessionId - the Session this Host just adopted.
	*/
	async clearStaleArchive(sessionId) {
		const registry = this.ctx.get("workspaceRegistry");
		if (registry === void 0 || !registry.archivedSessionIds.includes(sessionId)) return;
		try {
			await registry.unarchiveSession(sessionId);
			this.ctx.logger.info(`dsh-session-sync: unarchived the mirror copy of "${sessionId}"`);
		} catch (error) {
			this.ctx.logger.warn(`dsh-session-sync: could not unarchive "${sessionId}": ${describe$1(error)}`);
		}
	}
	/**
	* Whether a copy has events of its own, rather than what the mirror delivered.
	*
	* Called at the two moments that matter: adoption, where the baseline is taken
	* from the log itself (so a drift that happened earlier would never show up as
	* "longer than recorded"), and just before an append, which is the only moment a
	* hole could be embedded. The mirror events are passed in because both callers
	* already hold them — the comparison costs one small read of the log, no more.
	* @param persistence - the Host's durable Session storage.
	* @param sessionId - the Session under test.
	* @param stored - how many events the log holds.
	* @param mirrored - the events the mirror holds, which must cover the log's tail.
	* @returns whether the log's tail disagrees with the mirror.
	*/
	async copyDiverged(persistence, sessionId, stored, mirrored) {
		if (stored === 0 || mirrored.length === 0) return false;
		return await logAgreesWithMirror(persistence, sessionId, mirrored, stored).catch(() => void 0) === false;
	}
	/**
	* Drop the read-only claim on one Session, leaving its log in place.
	*
	* This is the way out of the gate: the copy becomes an ordinary Session on this
	* Host that its new owner may rename, continue or delete. Nothing deletes the
	* log automatically — a mirror is regenerable, but a Session the operator has
	* since edited is not, and no automatic pass may decide which one this is.
	* @param sessionId - the Session to release.
	* @returns whether the ledger held it.
	*/
	async releaseMaterialized(sessionId) {
		const released = await this.ledger.release(sessionId);
		if (released) this.broadcastState();
		return released;
	}
	/**
	* Run one materialize pass, at most one at a time.
	*
	* A create can walk the origin backwards, which takes longer than the tick that
	* started it. Without this guard the next tick would start a second pass over
	* the same Session, and the two would race the same log.
	*/
	async materializeTick() {
		if (this.materializing || this.disposed) return;
		this.materializing = true;
		try {
			await this.syncMaterialized();
		} catch (error) {
			this.ctx.logger.warn(`dsh-session-sync: materialize pass failed: ${describe$1(error)}`);
		} finally {
			this.materializing = false;
		}
	}
	/**
	* Keep every openable copy level with its mirror.
	*
	* One pass does two different jobs, in this order:
	*
	* - **catch up** each Session this Host already wrote, appending whatever the
	*   mirror has grown since the log's own end. This is what makes the official
	*   page a live view rather than a snapshot, and it is cheap: an append of the
	*   events above the stored count.
	* - **create** one new log, for the newest mirrored Session whose mirror holds
	*   its beginning. At most one per pass, because creating is the expensive half
	*   (it may walk the origin backwards first) and a Host with many newly
	*   published Sessions should not read all of them at once.
	*
	* The switch is read every pass, so turning {@link SyncConfig.materialize} off
	* stops new copies without touching the ones already written.
	* @returns how many logs were created and how many were advanced.
	*/
	async syncMaterialized() {
		const report = {
			created: 0,
			adopted: 0,
			advanced: 0
		};
		if (!this.config.isServer || !this.config.materialize) return report;
		const persistence = this.ctx.get("sessionPersistence");
		if (persistence === void 0) return report;
		for (const { sessionId } of this.ledger.list()) await this.clearStaleArchive(sessionId);
		const machines = this.hub.machines();
		for (const machine of machines) for (const session of machine.sessions) {
			if (!this.ledger.owns(session.sessionId)) continue;
			const entry = this.ledger.get(session.sessionId);
			if (entry?.stopped !== void 0) continue;
			const needs = entry?.events ?? 0;
			const newest = this.hub.transcript(machine.machineName, session.sessionId, { limit: 1 })?.events[0]?.seq;
			if (newest === void 0 || newest < needs) continue;
			const transcript = this.hub.transcript(machine.machineName, session.sessionId, {
				limit: 1e5,
				retain: Number.MAX_SAFE_INTEGER
			});
			try {
				if (transcript === void 0) continue;
				const lowest = transcript.events[0]?.seq;
				if (lowest !== void 0 && lowest > needs) {
					await this.backfill(machine.machineName, session.sessionId, transcript);
					continue;
				}
				const result = await (async () => {
					if (await this.copyDiverged(persistence, session.sessionId, needs, transcript.events)) {
						await this.ledger.stop(session.sessionId, DIVERGED_REASON);
						return {
							ok: false,
							written: 0,
							skipped: 0,
							stored: needs,
							created: false,
							reason: DIVERGED_REASON
						};
					}
					return await catchUpSession(persistence, session.sessionId, transcript.events);
				})();
				if (result.ok && result.written > 0) {
					await this.ledger.mark(session.sessionId, machine.machineName, result.stored);
					report.advanced += 1;
				} else if (!result.ok && result.wait !== true) await this.ledger.stop(session.sessionId, result.reason ?? "the copy stopped tracking the mirror");
			} finally {
				this.hub.transcript(machine.machineName, session.sessionId, {
					limit: 1,
					release: true
				});
			}
		}
		for (const machine of machines) for (const session of machine.sessions) {
			if (this.ledger.owns(session.sessionId)) continue;
			if (this.hub.transcript(machine.machineName, session.sessionId, { limit: 1 }) === void 0) continue;
			const start = startFor(await persistence.stat(session.sessionId).catch(() => void 0), machine.machineName, this.config.machineName);
			if (start === "ours") continue;
			if (start === "adopt") {
				const count = await storedEventCount(persistence, session.sessionId).catch(() => void 0);
				await this.ledger.mark(session.sessionId, machine.machineName, count ?? 0);
				if (count !== void 0 && count > 0) {
					const tail = this.hub.transcript(machine.machineName, session.sessionId, {
						limit: 8,
						before: count
					})?.events ?? [];
					if (await this.copyDiverged(persistence, session.sessionId, count, tail)) await this.ledger.stop(session.sessionId, DIVERGED_REASON);
				}
				report.adopted += 1;
				this.broadcastState();
				return report;
			}
			if ((await this.materialize(machine.machineName, session.sessionId)).ok) {
				report.created += 1;
				this.broadcastState();
				return report;
			}
		}
		return report;
	}
	/**
	* Walk the origin back until the mirror holds this Session's beginning.
	*
	* One round asks the origin for the page below what the mirror holds and waits;
	* the origin reads its own log and the page arrives as ordinary frames. The cap
	* is a budget rather than a limit on what is possible: a Session that needs more
	* rounds than this still materializes, just not inside one request.
	* @param machineName - owning machine.
	* @param sessionId - published Session.
	* @param transcript - the window the mirror holds now.
	* @returns how many rounds were spent.
	*/
	async backfill(machineName, sessionId, transcript) {
		const edge = () => this.hub.transcript(machineName, sessionId, { limit: 1e5 })?.events[0]?.seq;
		let lowest = transcript.events[0]?.seq;
		let rounds = 0;
		let idle = 0;
		while (lowest !== void 0 && lowest > 1 && rounds < BACKFILL_ROUNDS) {
			if (!this.hub.askOlder(machineName, sessionId, lowest, BACKFILL_PAGE_MESSAGES)) return rounds;
			let arrived = lowest;
			for (let tick = 0; tick < BACKFILL_TICKS; tick += 1) {
				await new Promise((resolve) => {
					setTimeout(resolve, BACKFILL_TICK_MS);
				});
				const next = edge();
				if (next !== void 0 && next < arrived) {
					arrived = next;
					break;
				}
			}
			rounds += 1;
			idle = arrived < lowest ? 0 : idle + 1;
			lowest = arrived;
			if (idle >= BACKFILL_IDLE_ROUNDS) break;
		}
		return rounds;
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
		this.link?.publishFrames(sessionId, handle.pending.splice(0, handle.pending.length), handle.header);
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
		const skip = controller === void 0 ? "no-controller" : typeof controller.page !== "function" ? "no-page-api" : handle === void 0 ? "no-follow" : handle.cursor < 0 ? "no-cursor" : void 0;
		this.lastPageRead = {
			sessionId,
			beforeSeq,
			...handle === void 0 ? {} : { throughSeq: handle.cursor },
			...skip === void 0 ? {} : { reason: skip }
		};
		if (skip !== void 0 || handle === void 0 || controller === void 0) return;
		const now = Date.now();
		const previous = this.pageAsked.get(sessionId);
		if (previous !== void 0 && now - previous < PAGE_FLOOR_MS) {
			this.lastPageRead = {
				...this.lastPageRead,
				reason: "rate-limited"
			};
			return;
		}
		this.pageAsked.set(sessionId, now);
		try {
			const page = await controller.page({
				address: {
					kind: "session",
					sessionId
				},
				throughSeq: handle.cursor,
				beforeSeq,
				maxMessages
			}, handle.abort.signal);
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
				this.link?.publishFrames(sessionId, events, handle.header);
			}
			const hadOlder = handle.hasOlder;
			handle.hasOlder = page.hasMore;
			if (hadOlder !== handle.hasOlder) this.reconcile();
			this.lastPageRead = {
				sessionId,
				beforeSeq,
				throughSeq: handle.cursor,
				records: page.records.length,
				hasMore: page.hasMore
			};
			if (added > 0) this.ctx.logger.info(`dsh-session-sync: sent ${String(added)} earlier event(s) of "${sessionId}"`);
		} catch (error) {
			this.lastPageRead = {
				sessionId,
				beforeSeq,
				throughSeq: handle.cursor,
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
		}
		for (const sessionId of desired) if (!this.follows.has(sessionId)) this.startFollow(sessionId);
		this.link?.publishIndex({
			machineName: this.config.machineName,
			sessions: rows.filter((row) => row.synced).map((row) => {
				const handle = this.follows.get(row.sessionId);
				const lastSeq = handle?.lastSeq;
				return {
					sessionId: row.sessionId,
					title: row.title,
					updatedAt: row.updatedAt,
					running: row.running,
					...row.cwd === void 0 ? {} : { cwd: row.cwd },
					...lastSeq === void 0 || lastSeq < 0 ? {} : { lastSeq },
					...handle?.hasOlder === true ? { hasOlder: true } : {},
					...handle?.header === void 0 ? {} : { header: handle.header }
				};
			})
		});
	}
	/**
	* Record what became of one publish attempt.
	*
	* The settings page used to call "marked in the config" published, which is
	* how a client that stopped publishing entirely could still read 宸插悓姝ヤ細璇濇暟 3
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
			if (typeof carrier["hasMore"] === "boolean") handle.hasOlder = carrier["hasMore"];
			if (typeof carrier["cursor"] === "number") handle.opened = true;
			const header = jsonObject(carrier["header"]);
			if (header !== void 0) handle.header = header;
			this.headerSeen = header === void 0 ? `absent on ${frameType}{${Object.keys(carrier).slice(0, 10).join(",")}}` : `read from ${frameType}`;
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
			link.publishFrames(sessionId, handle.pending.splice(0, handle.pending.length), handle.header);
		}
	}
	/** Admit a takeover prompt into the local Session it names. */
	async runCommand(command) {
		const controller = this.controller();
		if (controller === void 0) return;
		const link = this.link;
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
			synced: this.config.syncSessions[item.sessionId] === true
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
	return {
		type: event.type,
		seq: event.seq,
		time: event.time,
		data: event.data,
		...event.sourceEventSeqs === void 0 ? {} : { sourceEventSeqs: event.sourceEventSeqs },
		...event.surfaceOp === void 0 ? {} : { surfaceOp: event.surfaceOp }
	};
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
/** One optional non-empty string. */
function nonEmpty(value) {
	if (value === void 0) return void 0;
	return value.trim().length > 0 ? value.trim() : void 0;
}
/** One optional listenable port. */
function validPort(value) {
	if (value === void 0) return void 0;
	return Number.isInteger(value) && value > 0 && value < 65536 ? value : void 0;
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
/** Largest accepted browser request body, in bytes. */
const MAX_BODY_BYTES = 1024 * 1024;
/** Register the sync engine and its browser surface. */
function apply(ctx) {
	ctx.inject(["sessionController"], (scoped) => {
		initialize(scoped);
	});
}
/** Build the engine, start it, and expose it over HTTP. */
async function initialize(ctx) {
	try {
		const service = await SessionSyncService.create(ctx, resolveHome());
		ctx.logger.info(`dsh-session-sync: engine ready (config ${configPath(resolveHome())})`);
		ctx.effect(() => () => {
			service.dispose();
		}, "dsh-session-sync: engine");
		ctx.effect(() => ctx.on("agent/pre-step", (payload, next) => service.holdsMirrorOf(payload.agent.session.header.id) ? Promise.resolve({ kind: "reject" }) : next()), "dsh-session-sync: mirrored-Session gate");
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
		sendJson(response, 200, {
			config: await service.patch(patch),
			state: service.view(),
			sessions: await service.localSessions()
		});
		return;
	}
	if (method === "POST" && route === "/materialize") {
		const body = await readJsonBody(request);
		const machineName = typeof body?.["machineName"] === "string" ? body["machineName"] : "";
		const sessionId = typeof body?.["sessionId"] === "string" ? body["sessionId"] : "";
		if (machineName === "" || sessionId === "") {
			sendJson(response, 400, { error: "machineName and sessionId are required" });
			return;
		}
		sendJson(response, 200, { result: await service.materialize(machineName, sessionId) });
		return;
	}
	if (method === "POST" && route === "/materialize/release") {
		const body = await readJsonBody(request);
		const sessionId = typeof body?.["sessionId"] === "string" ? body["sessionId"] : "";
		if (sessionId === "") {
			sendJson(response, 400, { error: "sessionId is required" });
			return;
		}
		sendJson(response, 200, { released: await service.releaseMaterialized(sessionId) });
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
export { apply, name };
