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
  KEEPALIVE_MS,
  type DownstreamCommand,
  type HandshakeResponse,
  type MirrorEvent,
  type PublishIndexPayload,
  type StreamDeltaPayload,
} from '../shared/protocol.ts'
import type { SyncHub } from './hub.ts'
import type { HostLogger } from './dsh.ts'

/** Largest accepted request body, in bytes. */
const MAX_BODY_BYTES = 4 * 1024 * 1024

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

/** Read a JSON request body, bounded so a hostile peer cannot exhaust memory. */
async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    total += buffer.byteLength
    if (total > MAX_BODY_BYTES) throw new Error('request body too large')
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
  private token: string | undefined
  private isLinked = false

  /** @param options - address, credentials, and the command callback. */
  constructor(private readonly options: OriginLinkOptions) {}

  /** Whether an authenticated downstream stream is currently held. */
  get linked(): boolean {
    return this.isLinked
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
   * @param sessionId - the published Session.
   * @param events - the newly observed durable events.
   */
  publishFrames(sessionId: string, events: readonly MirrorEvent[]): void {
    if (events.length === 0) return
    void this.post('/frames', { sessionId, events })
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

  private async post(path: string, body: unknown): Promise<void> {
    const token = this.token
    if (token === undefined) {
      // Silently dropping this was invisible: a link that still looked
      // connected could stop publishing entirely and say nothing. A skipped
      // publish is a warning, not a no-op.
      const reason = 'no session token (the downstream stream is not established)'
      this.options.logger.warn(`dsh-session-sync: dropped ${path}: ${reason}`)
      this.options.onPost?.(path, false, reason)
      return
    }
    try {
      const response = await fetch(`${this.options.serverUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const reason = `server answered ${String(response.status)}`
        this.options.logger.warn(`dsh-session-sync: ${path} answered ${String(response.status)}`)
        this.options.onPost?.(path, false, reason)
        this.setLinked(false, reason)
        return
      }
      this.options.onPost?.(path, true)
    } catch (error: unknown) {
      const reason = describe(error)
      this.options.onPost?.(path, false, reason)
      this.setLinked(false, reason)
    }
  }

  private async run(signal: AbortSignal): Promise<void> {
    let backoffMs = 1_000
    while (!signal.aborted) {
      try {
        await this.connect(signal)
        backoffMs = 1_000
      } catch (error: unknown) {
        if (signal.aborted) break
        this.setLinked(false, describe(error))
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

  private consume(block: string): void {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue
      const text = line.slice('data:'.length).trim()
      if (text === '') continue
      try {
        const command = JSON.parse(text) as DownstreamCommand
        if (command.kind === 'prompt' && typeof command.sessionId === 'string') {
          this.options.onCommand(command)
        }
      } catch {
        // A malformed frame is dropped; the server re-sends nothing it cannot
        // confirm, and one bad line must not kill the stream.
      }
    }
  }

  private setLinked(linked: boolean, error?: string): void {
    if (this.isLinked === linked && error === undefined) return
    this.isLinked = linked
    if (!linked) this.token = undefined
    this.options.onStatus(error === undefined ? { linked } : { linked, error })
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
