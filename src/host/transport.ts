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
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import {
  batchEvents,
  FRAMES_BODY_BYTES,
  KEEPALIVE_MS,
  MAX_BODY_BYTES,
  type DownstreamCommand,
  type DownstreamFrame,
  type DownstreamOlder,
  type DownstreamResync,
  type HandshakeResponse,
  type MirrorEvent,
  type PublishIndexPayload,
  type StreamDeltaPayload,
} from '../shared/protocol.ts'
import type { SyncHub } from './hub.ts'
import type { HostLogger } from './dsh.ts'

/**
 * Durable events one published batch may carry, as a second bound on its size.
 *
 * The byte budget is what actually protects the wire; this keeps a pathological
 * run (tiny events, or a size that cannot be measured) from becoming a batch
 * with no shape at all.
 */
const FRAME_BATCH_EVENTS = 1_000

/**
 * Durable events the outbox may hold before it drops the oldest.
 *
 * Well above one flush interval's worth and well below what a Session buffer
 * already tolerates (4,000 events per handle), so a server that is merely slow
 * is absorbed and one that is gone is not.
 */
const FRAME_OUTBOX_LIMIT = 8_000

/** Outbox depth at which a lagging link says so, once per episode. */
const FRAME_OUTBOX_WARN = 2_000

/**
 * How long one post may take before it counts as failed.
 *
 * Without this, a connection black-holed by a network blip leaves `fetch`
 * pending forever: the outbox stops draining, no reconnect is ever attempted,
 * and the link looks alive while publishing nothing — the exact state this
 * plugin's settings page was built to make visible.
 */
const POST_TIMEOUT_MS = 20_000

/** Server-role listener options. */
export interface SyncServerOptions {
  host: string
  port: number
  /** Read the shared secret at request time so a settings change applies without a rebind. */
  password: () => string
  /** This machine's display name, returned to a handshaking origin. */
  serverName: () => string
  hub: SyncHub
  logger: HostLogger
  /**
   * Observer for every publish attempt: the service turns it into the status
   * the settings page shows, so "connected" and "actually publishing" stop
   * being the same claim.
   */
  onPost?: (path: string, ok: boolean, error?: string) => void
}

/** A running server-role listener. */
export interface SyncServerHandle {
  /** The actually-bound port (resolves a configured 0). */
  port(): number
  close(): Promise<void>
}

/** How the last published frame batch was split, and what is still waiting. */
export interface OriginBatchReport {
  /** Largest batch the last publish was split into, in bytes. */
  bytes?: number
  /** Largest batch, as a number of events. */
  size?: number
  /** How many batches that publish became. */
  batches?: number
  /** Events still waiting in the outbox for an accepted POST. */
  waiting?: number
}

/**
 * Start the server-role listener.
 * @param options - bind address, secret source, and the mirror to publish into.
 * @returns the bound listener handle.
 * @throws when the port cannot be bound, so the caller can report the reason.
 */
export async function startSyncServer(options: SyncServerOptions): Promise<SyncServerHandle> {
  const tokens = new Map<string, string>()
  const openStreams = new Set<ServerResponse>()

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      options.logger.warn(`dsh-session-sync: request failed: ${String(error)}`)
      if (!response.headersSent) sendJson(response, 500, { error: 'internal' })
      else response.end()
    })
  })

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://sync.invalid')
    // Refuse an oversized body before reading it, and say so by name. The reader
    // below bounds memory either way, but an unread body makes Node reset the
    // connection: the sender then sees a network error rather than a refusal, so
    // it retries the same batch forever instead of splitting it.
    const declared = Number(request.headers['content-length'] ?? Number.NaN)
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      sendJson(response, 413, { error: `request body over ${String(MAX_BODY_BYTES)} bytes` })
      return
    }
    if (request.method === 'POST' && url.pathname === '/handshake') {
      const body = await readJson(request)
      const machineName = typeof body?.['machineName'] === 'string' ? body['machineName'] : ''
      const supplied = typeof body?.['password'] === 'string' ? body['password'] : ''
      if (!secretsMatch(supplied, options.password())) {
        sendJson(response, 401, { error: 'password rejected' })
        return
      }
      if (machineName.trim() === '') {
        sendJson(response, 400, { error: 'machineName is required' })
        return
      }
      const token = randomBytes(24).toString('hex')
      tokens.set(token, machineName.trim())
      const payload: HandshakeResponse = { token, serverName: options.serverName() }
      sendJson(response, 200, payload)
      return
    }

    const machineName = authenticate(request, tokens)
    if (machineName === undefined) {
      sendJson(response, 401, { error: 'missing or stale token' })
      return
    }

    if (request.method === 'POST' && url.pathname === '/publish') {
      const body = await readJson(request)
      const sessions = Array.isArray(body?.['sessions']) ? body['sessions'] : []
      const payload = {
        machineName,
        sessions: sessions as PublishIndexPayload['sessions'],
      }
      options.hub.publishIndex(payload)
      sendJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'POST' && url.pathname === '/stream-delta') {
      const body = await readJson(request)
      const sessionId = typeof body?.['sessionId'] === 'string' ? body['sessionId'] : ''
      const kind = body?.['kind'] === 'reasoning' ? 'reasoning' : body?.['kind'] === 'text' ? 'text' : ''
      const text = typeof body?.['text'] === 'string' ? body['text'] : ''
      const turn = typeof body?.['turn'] === 'number' ? body['turn'] : 0
      const step = typeof body?.['step'] === 'number' ? body['step'] : 0
      if (sessionId === '' || kind === '') {
        sendJson(response, 400, { error: 'sessionId and kind are required' })
        return
      }
      options.hub.publishStream(machineName, { sessionId, turn, step, kind, text })
      sendJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'POST' && url.pathname === '/frames') {
      const body = await readJson(request)
      const sessionId = typeof body?.['sessionId'] === 'string' ? body['sessionId'] : ''
      const events = Array.isArray(body?.['events']) ? body['events'] : []
      if (sessionId === '') {
        sendJson(response, 400, { error: 'sessionId is required' })
        return
      }
      options.hub.publishFrames(machineName, { sessionId, events: events as MirrorEvent[] })
      sendJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'POST' && url.pathname === '/ack') {
      const body = await readJson(request)
      const commandId = typeof body?.['commandId'] === 'string' ? body['commandId'] : ''
      const sessionId = typeof body?.['sessionId'] === 'string' ? body['sessionId'] : ''
      if (commandId === '' || sessionId === '') {
        sendJson(response, 400, { error: 'commandId and sessionId are required' })
        return
      }
      options.hub.ackCommand(machineName, {
        commandId,
        sessionId,
        ok: body?.['ok'] === true,
        ...(typeof body?.['error'] === 'string' ? { error: body['error'] } : {}),
      })
      sendJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'GET' && url.pathname === '/stream') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      response.write(': connected\n\n')
      openStreams.add(response)
      const detach = options.hub.attachOrigin(machineName, {
        send: (command: DownstreamCommand) => {
          if (response.writableEnded) return
          response.write(`data: ${JSON.stringify(command)}\n\n`)
        },
        resync: (sessionId: string) => {
          if (response.writableEnded) return
          const frame: DownstreamResync = { kind: 'resync', sessionId }
          response.write(`data: ${JSON.stringify(frame)}\n\n`)
        },
        older: (sessionId: string, beforeSeq: number, maxMessages: number) => {
          if (response.writableEnded) return
          const frame: DownstreamOlder = { kind: 'older', sessionId, beforeSeq, maxMessages }
          response.write(`data: ${JSON.stringify(frame)}\n\n`)
        },
      })
      const keepalive = setInterval(() => {
        if (response.writableEnded) return
        response.write(': keepalive\n\n')
      }, KEEPALIVE_MS)
      response.on('close', () => {
        clearInterval(keepalive)
        openStreams.delete(response)
        detach()
      })
      return
    }

    sendJson(response, 404, { error: 'unknown route' })
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => { reject(error) }
    server.once('error', onError)
    server.listen(options.port, options.host, () => {
      server.off('error', onError)
      resolve()
    })
  })
  const address = server.address()
  const boundPort = typeof address === 'object' && address !== null ? address.port : options.port
  options.logger.info(`dsh-session-sync: sync server listening on ${options.host}:${boundPort}`)

  return {
    port: () => boundPort,
    close: async () => {
      for (const stream of openStreams) stream.end()
      openStreams.clear()
      // A held-open SSE response never ends on its own, so teardown must not wait for it.
      server.closeAllConnections()
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    },
  }
}

/** Read and authenticate one request's bearer token. */
function authenticate(
  request: IncomingMessage,
  tokens: ReadonlyMap<string, string>,
): string | undefined {
  const header = request.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return undefined
  return tokens.get(header.slice('Bearer '.length))
}

/** Compare two secrets without leaking length-independent timing. */
function secretsMatch(supplied: string, expected: string): boolean {
  const left = Buffer.from(supplied, 'utf8')
  const right = Buffer.from(expected, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Read a JSON request body, bounded so a hostile peer cannot exhaust memory.
 *
 * A chunked request declares no length, so the cap is enforced while reading
 * rather than trusted from the header. What it produces is a refusal the caller
 * reports by name — never a truncated buffer parsed as if it were whole.
 */
async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    total += buffer.byteLength
    if (total > MAX_BODY_BYTES) throw new Error(`request body over ${String(MAX_BODY_BYTES)} bytes`)
    chunks.push(buffer)
  }
  if (chunks.length === 0) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

/** Write one JSON response. */
function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(text)),
    'cache-control': 'no-store',
  })
  response.end(text)
}

/** What the origin does with a command the server sent down. */
export interface OriginLinkHandlers {
  onCommand(command: DownstreamCommand): void
  onStatus(status: { linked: boolean; error?: string }): void
  /**
   * Re-open one Session's follow, because the mirror says it is missing events.
   *
   * The mirror can see that a run is absent; only the machine that holds the
   * Session can hand it back.
   */
  onResync(sessionId: string): void
  /**
   * Read a page of one Session's history from behind the mirror's window.
   *
   * A follow opens on a tail, so the older end only ever arrives because someone
   * asked for it. This is that ask, and the answer travels back as ordinary
   * durable events.
   * @param sessionId - the Session the server wants history for.
   * @param beforeSeq - read strictly below this sequence.
   * @param maxMessages - how many messages the page should span, at most.
   */
  onOlder(sessionId: string, beforeSeq: number, maxMessages: number): void
}

/** Origin-role link options. */
export interface OriginLinkOptions extends OriginLinkHandlers {
  /** Server origin, already normalized (scheme included, no trailing slash). */
  serverUrl: string
  password: () => string
  machineName: () => string
  logger: HostLogger
  /**
   * Observer for every post the link makes, accepted or dropped.
   *
   * `linked` says the downstream stream is up; this says whether anything is
   * actually reaching the server, which is the difference a publisher that went
   * quiet without disconnecting used to hide.
   */
  onPost?: (path: string, ok: boolean, error?: string) => void
}

/** The origin-role link to one sync server. */
export class OriginLink {
  private controller: AbortController | undefined
  /** The handshake-then-stream attempt in flight, aborted to force a reconnect. */
  private connection: AbortController | undefined
  private token: string | undefined
  private isLinked = false
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
  private readonly outbox: { sessionId: string; events: readonly MirrorEvent[] }[] = []
  /** Events held in the outbox, so the cap is measured in events, not batches. */
  private outboxEvents = 0
  /** Whether the drain loop is running, so only one posts at a time. */
  private pumping = false
  /** Whether the depth has been reported for the current episode. */
  private outboxWarned = false
  /** What the last published batch looked like, as the wire will see it. */
  private lastBatch: OriginBatchReport | undefined

  /** @param options - address, credentials, and the command callback. */
  constructor(private readonly options: OriginLinkOptions) {}

  /** Whether an authenticated downstream stream is currently held. */
  get linked(): boolean {
    return this.isLinked
  }

  /**
   * How the last published batch was split, and how deep the outbox is now.
   *
   * Published because a refusal by size is otherwise invisible from here: the
   * sender only learns "the server answered 413", and the number that explains
   * it — how many bytes one batch turned out to be — lived nowhere an operator
   * could read. Only non-zero facts are returned.
   */
  batchReport(): OriginBatchReport | undefined {
    if (this.lastBatch === undefined && this.outboxEvents === 0) return undefined
    return {
      ...(this.lastBatch ?? {}),
      ...(this.outboxEvents === 0 ? {} : { waiting: this.outboxEvents }),
    }
  }

  /** Begin connecting and keep reconnecting until {@link stop}. */
  start(): void {
    if (this.controller !== undefined) return
    const controller = new AbortController()
    this.controller = controller
    void this.run(controller.signal)
  }

  /** Tear the link down and stop reconnecting. */
  stop(): void {
    this.controller?.abort()
    this.controller = undefined
    this.token = undefined
    // The link is over rather than interrupted, and a re-follow replays the
    // window these events belong to — holding them past this point would only
    // post history the Session may no longer even publish.
    this.outbox.length = 0
    this.outboxEvents = 0
    this.setLinked(false)
  }

  /**
   * Publish this machine's Session index.
   * @param payload - the Sessions currently marked for sync.
   */
  publishIndex(payload: PublishIndexPayload): void {
    void this.post('/publish', { sessions: payload.sessions })
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
  publishFrames(sessionId: string, events: readonly MirrorEvent[]): void {
    if (events.length === 0) return
    // One follow opening on a long Session is its whole window, megabytes at
    // once, and the server refuses a body over its limit. Sending it as one
    // batch did not merely fail: the same oversized batch was retried on every
    // reconnect, so the follow never finished, its cursor stayed unset, and
    // every page read that needed that cursor was refused. The batches below are
    // the difference between "too big" and "delivered in order".
    const split = batchEvents(events, FRAMES_BODY_BYTES, FRAME_BATCH_EVENTS)
    for (const batch of split.batches) {
      this.outbox.push({ sessionId, events: batch })
      this.outboxEvents += batch.length
    }
    // The shape actually attempted, so "the server refused it" and "the server
    // never saw it" stop being the same reading on the settings page.
    this.lastBatch = { bytes: split.bytes, size: split.size, batches: split.batches.length }
    // Bounded, because a server that never answers must not grow this process
    // without limit. What overflows is dropped oldest-first and said out loud:
    // the mirror's own replay is what repairs that, and it can only do so if the
    // operator knows it happened.
    while (this.outboxEvents > FRAME_OUTBOX_LIMIT && this.outbox.length > 1) {
      const dropped = this.outbox.shift()
      if (dropped === undefined) break
      this.outboxEvents -= dropped.events.length
      this.options.logger.warn(
        `dsh-session-sync: outbox full, dropped ${String(dropped.events.length)} durable event(s) `
        + `for "${dropped.sessionId}"; its mirror is behind until it replays`,
      )
    }
    if (this.outboxEvents >= FRAME_OUTBOX_WARN && !this.outboxWarned) {
      this.outboxWarned = true
      this.options.logger.warn(
        `dsh-session-sync: ${String(this.outboxEvents)} durable event(s) waiting to be accepted`,
      )
    }
    this.pumpFrames()
  }

  /**
   * Send queued batches, oldest first, until one is refused.
   *
   * A refusal leaves its batch at the head, so the order the mirror sees is the
   * order the events were written — and the next link-up calls this again. One
   * loop runs at a time: two would race for the same head and post it twice.
   */
  private pumpFrames(): void {
    if (this.pumping) return
    this.pumping = true
    void (async () => {
      try {
        for (;;) {
          const batch = this.outbox[0]
          if (batch === undefined) break
          const accepted = await this.post('/frames', {
            sessionId: batch.sessionId,
            events: batch.events,
          })
          if (!accepted) break
          this.outbox.shift()
          this.outboxEvents -= batch.events.length
          this.outboxWarned = false
        }
      } finally {
        this.pumping = false
      }
    })()
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
  ackCommand(commandId: string, sessionId: string, ok: boolean, error?: string): void {
    void this.post('/ack', {
      commandId,
      sessionId,
      ok,
      ...(error === undefined ? {} : { error }),
    })
  }

  /**
   * Publish one step's streaming text.
   * @param payload - the step, the kind, and the whole text so far.
   */
  publishStream(payload: StreamDeltaPayload): void {
    void this.post('/stream-delta', { ...payload, machineName: this.options.machineName() })
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
  private async post(path: string, body: unknown): Promise<boolean> {
    const token = this.token
    if (token === undefined) {
      // Silently dropping this was invisible: a link that still looked
      // connected could stop publishing entirely and say nothing. A skipped
      // publish is a warning, not a no-op.
      const reason = 'no session token (the downstream stream is not established)'
      this.options.logger.warn(`dsh-session-sync: dropped ${path}: ${reason}`)
      this.options.onPost?.(path, false, reason)
      return false
    }
    try {
      const response = await fetch(`${this.options.serverUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      })
      if (!response.ok) {
        const reason = `server answered ${String(response.status)}`
        this.options.logger.warn(`dsh-session-sync: ${path} answered ${String(response.status)}`)
        this.options.onPost?.(path, false, reason)
        this.reconnect(reason)
        return false
      }
      this.options.onPost?.(path, true)
      return true
    } catch (error: unknown) {
      const reason = describe(error)
      // A transport failure used to reach the settings page and nothing else.
      // It is the difference between "the server refused this" and "the network
      // ate it", so it belongs in the log too, in the same words.
      this.options.logger.warn(`dsh-session-sync: ${path} failed: ${reason}`)
      this.options.onPost?.(path, false, reason)
      this.reconnect(reason)
      return false
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
  private reconnect(reason: string): void {
    this.setLinked(false, reason)
    this.connection?.abort()
  }

  private async run(signal: AbortSignal): Promise<void> {
    let backoffMs = 1_000
    while (!signal.aborted) {
      const attempt = new AbortController()
      this.connection = attempt
      const onAbort = (): void => { attempt.abort() }
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        await this.connect(attempt.signal)
        backoffMs = 1_000
      } catch (error: unknown) {
        if (signal.aborted) break
        this.setLinked(false, describe(error))
      } finally {
        signal.removeEventListener('abort', onAbort)
        if (this.connection === attempt) this.connection = undefined
      }
      await sleep(backoffMs, signal)
      backoffMs = Math.min(backoffMs * 2, 15_000)
    }
  }

  private async connect(signal: AbortSignal): Promise<void> {
    const response = await fetch(`${this.options.serverUrl}/handshake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        machineName: this.options.machineName(),
        password: this.options.password(),
      }),
      signal,
    })
    if (!response.ok) {
      // A rejected password is not worth retrying at the same rate as a
      // transient network failure, but it must not stop retrying either: the
      // other side may simply not be configured yet.
      throw new Error(response.status === 401 ? 'password rejected by the server' : `handshake answered ${String(response.status)}`)
    }
    const payload = await response.json() as HandshakeResponse
    this.token = payload.token
    await this.stream(signal, payload.token)
  }

  private async stream(signal: AbortSignal, token: string): Promise<void> {
    const response = await fetch(`${this.options.serverUrl}/stream`, {
      headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
      signal,
    })
    if (!response.ok || response.body === null) {
      throw new Error(`stream answered ${String(response.status)}`)
    }
    this.setLinked(true)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        this.consume(block)
        boundary = buffer.indexOf('\n\n')
      }
    }
    throw new Error('stream closed')
  }

  /**
   * Dispatch one downstream frame.
   *
   * Discrimination is by `kind`, and an unrecognised one is ignored: a server
   * that learns a new frame must not be able to break an origin that does not,
   * which is also why the resync carries no ack to wait for.
   */
  private consume(block: string): void {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue
      const text = line.slice('data:'.length).trim()
      if (text === '') continue
      try {
        const frame = JSON.parse(text) as DownstreamFrame
        if (typeof frame.sessionId !== 'string') continue
        if (frame.kind === 'prompt') this.options.onCommand(frame)
        else if (frame.kind === 'resync') this.options.onResync(frame.sessionId)
        else if (frame.kind === 'older' && typeof frame.beforeSeq === 'number') {
          this.options.onOlder(
            frame.sessionId,
            frame.beforeSeq,
            typeof frame.maxMessages === 'number' ? frame.maxMessages : 0,
          )
        }
      } catch {
        // A malformed frame is dropped; the server re-sends nothing it cannot
        // confirm, and one bad line must not kill the stream.
      }
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
  private setLinked(linked: boolean, error?: string): void {
    if (this.isLinked === linked && error === undefined) return
    const wasLinked = this.isLinked
    this.isLinked = linked
    this.options.onStatus(error === undefined ? { linked } : { linked, error })
    // A fresh token is what a refused batch needed, so the queue is retried the
    // moment the link is back rather than at the next flush.
    if (linked && !wasLinked) this.pumpFrames()
  }
}

/** Human-readable one-line failure text. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Abortable delay. */
async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => { cleanup(); resolve() }, ms)
    const onAbort = (): void => { cleanup(); resolve() }
    function cleanup(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Narrow a created server for callers that keep the raw handle. */
export type { Server }
