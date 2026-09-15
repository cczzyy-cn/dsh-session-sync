/**
 * Structural declarations of the Host capabilities this plugin consumes.
 *
 * They are declared here rather than imported. This is an out-of-repo package:
 * it has no workspace dependency graph, so `@deepseek-ai/*` packages are not
 * resolvable from its sources and a real import would make the bundle depend on
 * a checkout that a profile install does not provide. Each shape below mirrors a
 * shipped declaration and names only the members this plugin calls:
 *
 *  - `HostContext`        — Cordis `Context`.
 *  - `SessionControllerLike` — `packages/api/session-controller/src/index.ts`
 *    (`ctx.sessionController`, the service behind `ctx.remote.session`).
 *  - `WebServerLike`      — `packages/host/webserver/src/index.ts` (`ctx.webServer`).
 *  - `ConnectionLike`     — `packages/client/connection/src/rpc.ts`
 *    (`ctx.connection`, the browser-session and Host/Origin fence).
 *
 * `import type` from those packages would be erased before bundling and is
 * therefore safe; a value import would not be, and there are none.
 */

/** One Host log sink. */
export interface HostLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

/** The Cordis context members the Host half uses. */
export interface HostContext {
  readonly logger: HostLogger
  /** Run a registration, disposing what it returns when the owning fiber unloads. */
  effect(callback: () => (() => void) | void, name?: string): void
  /** Read a framework-provided service without declaring a hard dependency. */
  get(name: string): unknown
  /** Wait for services, then run `callback` inside the scoped fiber. */
  inject(dependencies: readonly string[], callback: (scoped: HostContext) => void): void
}

/** One row of `SessionController.list` — `SessionSummary`. */
export interface SessionSummaryRow {
  readonly sessionId: string
  readonly updatedAt: number
  readonly running: boolean
  readonly blank: boolean
  readonly parentSessionId?: string
  readonly origin?: 'subagent'
  readonly cwd?: string
  readonly projections?: {
    readonly asOfSeq: number
    readonly values: Readonly<Record<string, unknown>>
  }
}

/** One durable Session event on the browser wire — `SessionWireEvent`. */
export interface WireEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: unknown
}

/** One history record — `SessionEventEntry`. */
export interface WireRecord {
  readonly type: 'event'
  readonly event: WireEvent
}

/** The opening window of a `follow` stream — `SessionFollowFrame` `snapshot`. */
export interface FollowSnapshotFrame {
  readonly type: 'snapshot'
  readonly header: { readonly id: string; readonly createdAt: number; readonly cwd?: string }
  readonly cursor: number
  readonly records: readonly WireRecord[]
  readonly hasMore: boolean
  readonly projections: { readonly values: Readonly<Record<string, unknown>> }
}

/** One durable event frame. Process-local assistant frames are not consumed here. */
export interface FollowEventFrame {
  readonly type: 'event'
  readonly event: WireEvent
}

/** Any other frame kind this plugin ignores. */
export interface FollowIgnoredFrame {
  readonly type: string
}

/** The frames a `follow` iteration yields. */
export type FollowFrame = FollowSnapshotFrame | FollowEventFrame | FollowIgnoredFrame

/** One prompt admission request — `SessionPromptRequest`. */
export interface PromptRequest {
  readonly requestId: string
  readonly sessionId: string
  readonly mode: 'queue' | 'steer'
  readonly content: readonly { readonly type: 'text'; readonly text: string }[]
  readonly clientTimeZone?: string
}

/** Address of an ordinary Session — `SessionAddress`. */
export interface SessionAddress {
  readonly kind: 'session'
  readonly sessionId: string
}

/** One follow request — `SessionFollowRequest`. */
export interface FollowRequest {
  readonly address: SessionAddress
  readonly maxMessages?: number
  readonly assistantStream?: true
}

/**
 * The Session control service — `SessionController` in
 * `packages/api/session-controller/src/index.ts`, mounted as `ctx.sessionController`.
 */
export interface SessionControllerLike {
  /** Visible Session summaries ordered by activity. */
  list(request: Record<string, never>, signal: AbortSignal): Promise<{ items: readonly SessionSummaryRow[] }>
  /** A complete opening snapshot followed by gap-free durable event frames. */
  follow(request: FollowRequest, signal: AbortSignal): AsyncIterable<FollowFrame>
  /** Admit one user prompt, resuming the Session first when it is cold. */
  prompt(request: PromptRequest, signal: AbortSignal): Promise<{ accepted: true }>
}

/** The browser HTTP carrier — `WebServer` in `packages/host/webserver/src/index.ts`. */
export interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (request: NodeRequestLike, response: NodeResponseLike) => void | Promise<void>
  }): () => void
}

/**
 * The browser-session and Host/Origin fence — `HostConnectionHandle` in
 * `packages/client/connection/src/rpc.ts`, mounted as `ctx.connection`.
 *
 * `requestRejection` is the shipped seam for putting the composition's own
 * browser authentication in front of another web route: 403 when the request
 * authority is not trusted, 401 when the browser session is missing, and
 * `undefined` when the route may accept the request. It is optional: a
 * composition with no browser frontend mounts no such service.
 */
export interface ConnectionLike {
  requestRejection(
    request: { readonly headers: Record<string, string | string[] | undefined> },
  ): number | undefined
}

/** The slice of `node:http` `IncomingMessage` the route handlers read. */
export interface NodeRequestLike {
  readonly method?: string
  readonly url?: string
  readonly headers: Record<string, string | string[] | undefined>
  on(event: 'data', listener: (chunk: unknown) => void): void
  on(event: 'end', listener: () => void): void
  on(event: 'error', listener: (error: unknown) => void): void
}

/** The slice of `node:http` `ServerResponse` the route handlers write. */
export interface NodeResponseLike {
  statusCode: number
  setHeader(name: string, value: string): void
  write(chunk: string): boolean
  end(chunk?: string): void
  readonly writableEnded: boolean
  on(event: 'close', listener: () => void): void
}
