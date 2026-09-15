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
import {
  KEEPALIVE_MS,
  ROUTE_PREFIX,
  type ConfigPatch,
  type SyncStreamFrame,
} from './shared/protocol.ts'
import { configPath, resolveHome } from './host/config.ts'
import type {
  ConnectionLike,
  HostContext,
  NodeRequestLike,
  NodeResponseLike,
  WebServerLike,
} from './host/dsh.ts'
import { SessionSyncService } from './host/service.ts'

export const name = 'dsh-session-sync'

/** Largest accepted browser request body, in bytes. */
const MAX_BODY_BYTES = 1024 * 1024

/** Register the sync engine and its browser surface. */
export function apply(ctx: HostContext): void {
  // A composition without the Session control service has no Sessions to sync;
  // staying parked is the honest outcome, not a failure.
  ctx.inject(['sessionController'], (scoped) => {
    void initialize(scoped)
  })
}

/** Build the engine, start it, and expose it over HTTP. */
async function initialize(ctx: HostContext): Promise<void> {
  try {
    const service = await SessionSyncService.create(ctx, resolveHome())
    ctx.logger.info(`dsh-session-sync: engine ready (config ${configPath(resolveHome())})`)
    ctx.effect(() => () => { void service.dispose() }, 'dsh-session-sync: engine')
    ctx.inject(['webServer'], (webCtx) => {
      const webServer = webCtx.get('webServer') as WebServerLike | undefined
      if (webServer === undefined) return
      registerRoutes(webCtx, webServer, service)
    })
    service.start()
  } catch (error: unknown) {
    ctx.logger.error(`dsh-session-sync: failed to start: ${describe(error)}`)
  }
}

/** Register the browser-facing routes under {@link ROUTE_PREFIX}. */
function registerRoutes(ctx: HostContext, webServer: WebServerLike, service: SessionSyncService): void {
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: (request, response) => {
      dispatch(ctx, service, request, response).catch((error: unknown) => {
        ctx.logger.warn(`dsh-session-sync: route failed: ${describe(error)}`)
        if (!response.writableEnded) sendJson(response, 500, { error: 'internal' })
      })
    },
  }), 'dsh-session-sync: browser routes')
}

/** Route one browser request. */
async function dispatch(
  ctx: HostContext,
  service: SessionSyncService,
  request: NodeRequestLike,
  response: NodeResponseLike,
): Promise<void> {
  const rejection = rejectionOf(ctx, request)
  if (rejection !== undefined) {
    sendJson(response, rejection, {
      error: rejection === 403
        ? 'forbidden: this authority is not trusted by the browser-trust fence'
        : 'authentication required; reopen the URL printed by dsh web',
    })
    return
  }

  const url = new URL(request.url ?? '/', 'http://gui.invalid')
  const route = url.pathname.slice(ROUTE_PREFIX.length)
  const method = request.method ?? 'GET'

  if (method === 'GET' && route === '/config') {
    sendJson(response, 200, { config: service.configView(), state: service.view() })
    return
  }

  if (method === 'GET' && route === '/state') {
    sendJson(response, 200, { state: service.view() })
    return
  }

  if (method === 'GET' && route === '/sessions') {
    sendJson(response, 200, { sessions: await service.localSessions() })
    return
  }

  if (method === 'POST' && route === '/config') {
    const body = await readJsonBody(request)
    const patch = body as ConfigPatch
    const config = await service.patch(patch)
    sendJson(response, 200, {
      config,
      state: service.view(),
      // The Session list carries the fresh switch state, so one round trip is
      // enough for the page to re-render what the user just changed.
      sessions: await service.localSessions(),
    })
    return
  }

  if (method === 'GET' && route === '/transcript') {
    const machineName = url.searchParams.get('machine') ?? ''
    const sessionId = url.searchParams.get('session') ?? ''
    const transcript = service.transcript(machineName, sessionId)
    if (transcript === undefined) {
      sendJson(response, 404, { error: 'no such mirrored Session' })
      return
    }
    sendJson(response, 200, { transcript })
    return
  }

  if (method === 'POST' && route === '/command') {
    const body = await readJsonBody(request)
    const machineName = typeof body['machineName'] === 'string' ? body['machineName'] : ''
    const sessionId = typeof body['sessionId'] === 'string' ? body['sessionId'] : ''
    const text = typeof body['text'] === 'string' ? body['text'] : ''
    const outcome = service.submitCommand(machineName, sessionId, text)
    if (!outcome.ok) {
      sendJson(response, 409, { ok: false, reason: outcome.reason })
      return
    }
    // The id is what lets the composer follow this prompt's delivery over the
    // same event stream it already holds open; without it the panel can only
    // say "accepted" and hope.
    sendJson(response, 200, { ok: true, commandId: outcome.commandId })
    return
  }

  if (method === 'GET' && route === '/events') {
    openStream(service, response)
    return
  }

  sendJson(response, 404, { error: 'unknown route' })
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
function rejectionOf(ctx: HostContext, request: NodeRequestLike): number | undefined {
  const connection = ctx.get('connection') as ConnectionLike | undefined
  if (connection === undefined || connection === null) return undefined
  try {
    return connection.requestRejection({ headers: request.headers })
  } catch (error: unknown) {
    ctx.logger.warn(`dsh-session-sync: browser-trust check failed: ${describe(error)}`)
    return 401
  }
}

/** Hold one SSE response open and pump every frame into it. */
function openStream(service: SessionSyncService, response: NodeResponseLike): void {
  response.statusCode = 200
  response.setHeader('content-type', 'text/event-stream; charset=utf-8')
  response.setHeader('cache-control', 'no-cache, no-transform')
  response.setHeader('connection', 'keep-alive')
  response.setHeader('x-accel-buffering', 'no')
  response.write(': connected\n\n')

  const detach = service.attachBrowser({
    send: (frame: SyncStreamFrame) => {
      if (response.writableEnded) return
      response.write(`data: ${JSON.stringify(frame)}\n\n`)
    },
  })
  const keepalive = setInterval(() => {
    if (response.writableEnded) return
    response.write(': keepalive\n\n')
  }, KEEPALIVE_MS)
  response.on('close', () => {
    clearInterval(keepalive)
    detach()
  })
}

/** Read one JSON request body, bounded. */
async function readJsonBody(request: NodeRequestLike): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  await new Promise<void>((resolve, reject) => {
    request.on('data', (chunk: unknown) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      total += buffer.byteLength
      if (total > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        return
      }
      chunks.push(buffer)
    })
    request.on('end', () => { resolve() })
    request.on('error', (error: unknown) => { reject(error instanceof Error ? error : new Error(String(error))) })
  })
  if (chunks.length === 0) return {}
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

/** Write one JSON response. */
function sendJson(response: NodeResponseLike, status: number, body: unknown): void {
  if (response.writableEnded) return
  const text = JSON.stringify(body)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(text)
}

/** Human-readable one-line failure text. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
