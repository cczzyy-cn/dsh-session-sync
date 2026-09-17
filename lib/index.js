import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
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
/** Default listen port of the sync server. */
const DEFAULT_LISTEN_PORT = 8791;
/** Heartbeat/keepalive cadence for both SSE directions. */
const KEEPALIVE_MS = 15e3;
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
		syncSessions: {}
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
		syncSessions
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
		parsed = JSON.parse(text);
	} catch {
		parsed = void 0;
	}
	return normalizeConfig(parsed, fallbackMachineName);
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
/** Upper bound on commands held for a machine whose origin stream is down. */
const PENDING_LIMIT = 32;
/** Upper bound on retained command states per machine, newest kept. */
const STATUS_LIMIT = 64;
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
	records = /* @__PURE__ */ new Map();
	/**
	* @param notify - receives every frame the mirror produces. The owner decides
	*   who is watching, because the same browser stream also carries client-role
	*   status in a process that is not acting as a server at all.
	* @param stateOf - builds the complete browser-facing state. The mirror only
	*   knows the machine list; role, listener, and link facts belong to the
	*   engine. The engine's owner is the one place that can see both, so a state
	*   frame is always assembled there — publishing a partial object here would
	*   silently blank every field this class does not own.
	*/
	constructor(notify, stateOf) {
		this.notify = notify;
		this.stateOf = stateOf;
	}
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
					maxSeq: -1
				});
				continue;
			}
			existing.title = session.title;
			existing.updatedAt = session.updatedAt;
			existing.running = session.running;
			if (session.cwd === void 0) delete existing.cwd;
			else existing.cwd = session.cwd;
		}
		for (const sessionId of [...record.sessions.keys()]) if (!seen.has(sessionId)) record.sessions.delete(sessionId);
		this.broadcastState();
	}
	/**
	* Append durable events to one mirrored Session, dropping any the mirror
	* already holds so a reconnect that replays a window stays idempotent.
	* @param machineName - publishing machine.
	* @param payload - the Session id and its new events.
	*/
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
	publishFrames(machineName, payload) {
		const record = this.machine(machineName);
		record.lastSeen = Date.now();
		const session = record.sessions.get(payload.sessionId);
		if (session === void 0) return;
		const fresh = payload.events.filter((event) => event.seq > session.maxSeq);
		if (fresh.length === 0) return;
		session.events.push(...fresh);
		if (session.events.length > EVENT_LIMIT) session.events.splice(0, session.events.length - EVENT_LIMIT);
		session.maxSeq = fresh.reduce((highest, event) => Math.max(highest, event.seq), session.maxSeq);
		session.updatedAt = Date.now();
		this.broadcast({
			type: "events",
			machineName,
			sessionId: payload.sessionId,
			events: fresh
		});
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
	* Read one mirrored Session's retained transcript.
	* @param machineName - owning machine.
	* @param sessionId - published Session.
	* @returns the transcript, or undefined when the mirror holds no such Session.
	*/
	transcript(machineName, sessionId) {
		const session = this.records.get(machineName)?.sessions.get(sessionId);
		if (session === void 0) return void 0;
		return {
			machineName,
			sessionId,
			events: [...session.events],
			running: session.running
		};
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
		eventCount: session.events.length
	};
}
/** Mint one opaque identity. */
function mintId() {
	return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
/** Largest accepted request body, in bytes. */
const MAX_BODY_BYTES$1 = 4 * 1024 * 1024;
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
			const detach = options.hub.attachOrigin(machineName, { send: (command) => {
				if (response.writableEnded) return;
				response.write(`data: ${JSON.stringify(command)}\n\n`);
			} });
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
/** Read a JSON request body, bounded so a hostile peer cannot exhaust memory. */
async function readJson(request) {
	const chunks = [];
	let total = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
		total += buffer.byteLength;
		if (total > MAX_BODY_BYTES$1) throw new Error("request body too large");
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
	token;
	isLinked = false;
	/** @param options - address, credentials, and the command callback. */
	constructor(options) {
		this.options = options;
	}
	/** Whether an authenticated downstream stream is currently held. */
	get linked() {
		return this.isLinked;
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
	* @param sessionId - the published Session.
	* @param events - the newly observed durable events.
	*/
	publishFrames(sessionId, events) {
		if (events.length === 0) return;
		this.post("/frames", {
			sessionId,
			events
		});
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
	async post(path, body) {
		const token = this.token;
		if (token === void 0) {
			const reason = "no session token (the downstream stream is not established)";
			this.options.logger.warn(`dsh-session-sync: dropped ${path}: ${reason}`);
			this.options.onPost?.(path, false, reason);
			return;
		}
		try {
			const response = await fetch(`${this.options.serverUrl}${path}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${token}`
				},
				body: JSON.stringify(body)
			});
			if (!response.ok) {
				const reason = `server answered ${String(response.status)}`;
				this.options.logger.warn(`dsh-session-sync: ${path} answered ${String(response.status)}`);
				this.options.onPost?.(path, false, reason);
				this.setLinked(false, reason);
				return;
			}
			this.options.onPost?.(path, true);
		} catch (error) {
			const reason = describe$2(error);
			this.options.onPost?.(path, false, reason);
			this.setLinked(false, reason);
		}
	}
	async run(signal) {
		let backoffMs = 1e3;
		while (!signal.aborted) {
			try {
				await this.connect(signal);
				backoffMs = 1e3;
			} catch (error) {
				if (signal.aborted) break;
				this.setLinked(false, describe$2(error));
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
	consume(block) {
		for (const line of block.split("\n")) {
			if (!line.startsWith("data:")) continue;
			const text = line.slice(5).trim();
			if (text === "") continue;
			try {
				const command = JSON.parse(text);
				if (command.kind === "prompt" && typeof command.sessionId === "string") this.options.onCommand(command);
			} catch {}
		}
	}
	setLinked(linked, error) {
		if (this.isLinked === linked && error === void 0) return;
		this.isLinked = linked;
		if (!linked) this.token = void 0;
		this.options.onStatus(error === void 0 ? { linked } : {
			linked,
			error
		});
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
/** How often buffered events are handed to the link. */
const FLUSH_MS = 400;
/** Bound on events buffered per Session while the link is down. */
const BUFFER_LIMIT = 4e3;
/** The engine. */
var SessionSyncService = class SessionSyncService {
	ctx;
	home;
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
	/** The Session whose frames are being absorbed right now. */
	streamSessionId = "";
	/** The running attempt's turn and step, taken from its start frame. */
	streamTurn = 0;
	streamStep = 0;
	/** Streaming text per step, keyed session|turn|step|kind; relayed, never mirrored. */
	liveText = /* @__PURE__ */ new Map();
	liveDirty = /* @__PURE__ */ new Set();
	/** The last publish attempt, as the settings page reports it. */
	lastPublish;
	disposed = false;
	constructor(ctx, home, config) {
		this.ctx = ctx;
		this.home = home;
		this.config = config;
		this.hub = new SyncHub((frame) => {
			this.broadcast(frame);
		}, () => this.view());
	}
	/**
	* Load the persisted configuration and build the engine.
	* @param ctx - the scoped Host context that already resolved `sessionController`.
	* @param home - Harness home directory.
	* @returns the ready service; the caller decides when to {@link start} it.
	*/
	static async create(ctx, home) {
		return new SessionSyncService(ctx, home, await loadConfig(home, hostname()));
	}
	/** Begin reconciling and bring the configured role up. */
	start() {
		this.reconcileTimer = setInterval(() => {
			this.hub.expireCommands();
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
			...this.lastPublish === void 0 ? {} : { publish: this.lastPublish },
			...this.config.isServer ? {} : { follow: {
				frames: [...this.followFrameTypes],
				events: this.followEvents,
				historyMisses: this.historyMisses,
				localItems: this.localItems,
				localRows: this.localRows,
				posts: [...this.postCounts].map(([route, entry]) => route + ":" + String(entry.count) + (entry.ok ? "" : "!")),
				shapes: this.followShapes,
				...this.followError === void 0 ? {} : { error: this.followError },
				...this.followErrorSession === void 0 ? {} : { sessionId: this.followErrorSession }
			} }
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
			syncSessions: { ...previous.syncSessions }
		};
		if (patch.sessionSync !== void 0) if (patch.sessionSync.synced) next.syncSessions[patch.sessionSync.sessionId] = true;
		else delete next.syncSessions[patch.sessionSync.sessionId];
		this.config = next;
		await saveConfig(this.home, next);
		if (previous.isServer !== next.isServer || serverOrigin(previous.serverUrl) !== serverOrigin(next.serverUrl) || previous.listenHost !== next.listenHost || previous.listenPort !== next.listenPort || !next.isServer && previous.machineName !== next.machineName) await this.applyRole();
		else if (patch.sessionSync !== void 0) await this.reconcile();
		this.broadcast({
			type: "state",
			state: this.view()
		});
		return this.configView();
	}
	/**
	* Read one mirrored Session's transcript.
	* @param machineName - owning machine.
	* @param sessionId - published Session.
	* @returns the transcript, or undefined when nothing is mirrored under that address.
	*/
	transcript(machineName, sessionId) {
		return this.hub.transcript(machineName, sessionId);
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
		if (status.linked && !wasLinked) this.restartFollows();
		this.broadcast({
			type: "state",
			state: this.view()
		});
	}
	/** Re-open every tracked follow so each one replays its opening snapshot. */
	restartFollows() {
		const sessionIds = [...this.follows.keys()];
		for (const handle of this.follows.values()) handle.abort.abort();
		this.follows.clear();
		for (const sessionId of sessionIds) this.startFollow(sessionId);
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
			sessions: rows.filter((row) => row.synced).map((row) => ({
				sessionId: row.sessionId,
				title: row.title,
				updatedAt: row.updatedAt,
				running: row.running,
				...row.cwd === void 0 ? {} : { cwd: row.cwd }
			}))
		});
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
	/** Open one `follow` stream and absorb its frames into the pending buffer. */ startFollow(sessionId) {
		const controller = this.controller();
		if (controller === void 0) return;
		this.streamSessionId = sessionId;
		const handle = {
			abort: new AbortController(),
			pending: []
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
			} catch (error) {
				if (!handle.abort.signal.aborted) {
					this.followError = describe$1(error);
					this.followErrorSession = sessionId;
					this.ctx.logger.warn(`dsh-session-sync: follow for "${sessionId}" ended: ${describe$1(error)}`);
				}
			} finally {
				if (this.follows.get(sessionId) === handle) this.follows.delete(sessionId);
			}
		})();
	}
	/** Record one follow frame's durable events. */
	/**
	* Take whatever streaming text a follow frame carries.
	*
	* The frame family is not ours to define: the contract is structural and the
	* stream rides it as a variant we cannot name from here, so this reads the
	* shapes defensively -- an opening baseline, a stream frame, or a bare chunk
	* -- and accumulates the text each one carries. Anything it does not
	* recognise is left alone, so the durable path is never at risk.
	* @param frame - one frame from the follow stream.
	*/
	absorbStream(frame) {
		const seen = /* @__PURE__ */ new Set();
		const visit = (value) => {
			if (typeof value === "string") {
				const trimmed = value.trim();
				if (trimmed.startsWith("{") && trimmed.endsWith("}") || trimmed.startsWith("[") && trimmed.endsWith("]")) try {
					visit(JSON.parse(trimmed));
				} catch {}
				return;
			}
			if (typeof value !== "object" || value === null || seen.has(value)) return;
			seen.add(value);
			const record = value;
			if (record["type"] === "start") {
				if (typeof record["turn"] === "number") this.streamTurn = record["turn"];
				if (typeof record["step"] === "number") this.streamStep = record["step"];
			}
			if (Array.isArray(record["stream"])) for (const item of record["stream"]) visit(item);
			visit(record["chunk"]);
			visit(record["frame"]);
			visit(record["assistantStream"]);
			if (Array.isArray(record["chunks"])) for (const item of record["chunks"]) visit(item);
			const recordType = record["type"];
			const texts = record["texts"];
			if (Array.isArray(texts) && (recordType === "text-chunks" || recordType === "reasoning-chunks")) {
				const kind = recordType === "reasoning-chunks" ? "reasoning" : "text";
				const text = texts.filter((part) => typeof part === "string").join("");
				if (text !== "") {
					const sessionId = this.streamSessionId;
					if (sessionId !== "") {
						const turn = typeof record["turn"] === "number" ? record["turn"] : 0;
						const step = typeof record["step"] === "number" ? record["step"] : 0;
						const key = sessionId + "|" + String(turn) + "|" + String(step) + "|" + kind;
						const previous = this.liveText.get(key);
						this.liveText.set(key, {
							sessionId,
							turn,
							step,
							kind,
							text: (previous?.text ?? "") + text
						});
						this.liveDirty.add(key);
					}
				}
				return;
			}
			const inner = record["chunk"];
			const source = inner !== void 0 && typeof inner === "object" ? inner : record;
			const sourceType = source["type"];
			const kind = sourceType === "reasoning-delta" || sourceType === "reasoning" ? "reasoning" : sourceType === "text-delta" || sourceType === "text" ? "text" : void 0;
			if (kind === void 0) return;
			const text = typeof source["text"] === "string" ? source["text"] : typeof source["delta"] === "string" ? source["delta"] : void 0;
			if (text === void 0 || text === "") return;
			const turn = typeof record["turn"] === "number" ? record["turn"] : this.streamTurn;
			const step = typeof record["step"] === "number" ? record["step"] : this.streamStep;
			const sessionId = this.streamSessionId;
			if (sessionId === "") return;
			const key = `${sessionId}|${String(turn)}|${String(step)}|${kind}`;
			const previous = this.liveText.get(key);
			this.liveText.set(key, {
				sessionId,
				turn,
				step,
				kind,
				text: (previous?.text ?? "") + text
			});
			this.liveDirty.add(key);
		};
		visit(frame);
	}
	absorb(handle, frame) {
		const frameType = typeof frame.type === "string" ? frame.type : "unknown";
		if (this.followFrameTypes.size < 12) this.followFrameTypes.add(frameType);
		this.followEvents += 1;
		if (frameType === "assistant-stream" && this.followShapes.length < 8) {
			const keysOf = (value) => value !== null && typeof value === "object" ? Object.keys(value).slice(0, 10).join(",") : typeof value;
			const outer = frame;
			const inner = outer["frame"] ?? outer["assistantStream"] ?? outer;
			const chunk = inner !== null && typeof inner === "object" ? inner["chunk"] : void 0;
			this.followShapes.push("assistant-stream{" + keysOf(outer) + "} inner{" + keysOf(inner) + "} chunk{" + keysOf(chunk) + "}");
		}
		this.absorbStream(frame);
		const carrier = frame;
		const page = carrier["page"];
		const records = Array.isArray(carrier["records"]) ? carrier["records"] : Array.isArray(page?.["records"]) ? page["records"] : void 0;
		if (records !== void 0) {
			if (this.followShapes.length < 4 && records.length > 0) {
				const keys = (value) => value !== null && typeof value === "object" ? Object.keys(value).slice(0, 8).join(",") : typeof value;
				this.followShapes.push(frameType + "{" + keys(frame) + "} rec{" + keys(records[0]) + "}");
			}
			for (const record of records) if (record !== null && typeof record === "object" && record.event !== void 0) buffer(handle, record.event);
			return;
		}
		if (frameType === "snapshot" || frameType === "opened") this.historyMisses += 1;
		if (frame.type === "event") buffer(handle, frame.event);
	}
	/** Hand every buffered batch to the link, when there is a link to hand it to. */
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
/** Append one durable event to the buffer, bounded so memory cannot run away. */
function buffer(handle, event) {
	handle.pending.push({
		type: event.type,
		seq: event.seq,
		time: event.time,
		data: event.data
	});
	if (handle.pending.length > BUFFER_LIMIT) handle.pending.splice(0, handle.pending.length - BUFFER_LIMIT);
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
	if (method === "GET" && route === "/transcript") {
		const machineName = url.searchParams.get("machine") ?? "";
		const sessionId = url.searchParams.get("session") ?? "";
		const transcript = service.transcript(machineName, sessionId);
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
//#endregion
export { apply, name };
