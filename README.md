# dsh-session-sync

Multi-machine Session sync for DeepSeek Harness.

Publish selected Sessions from this machine to a sync server, and — on the
server — watch every connected machine's Sessions arrive in real time from a
group in the left sidebar. A Session opened on the server can be taken over:
prompts typed there are forwarded to the machine that owns the Session, which
admits them into its own agent loop, and the results stream back.

## Install

```sh
dsh plugin --profile web add github:cczzyy-cn/dsh-session-sync
```

The built Host and browser halves are committed to this repository on purpose.
A plugin installed from git cannot build itself here: the browser half has to
exist as `client/client.js` before the client module registry will serve it, and
pnpm refuses a git dependency's `prepare` script until the consumer allowlists
it — `vision` and `dshmarket` are installed from git on that same basis. Source
changes therefore need `scripts/build-and-install.ps1` to run before they are
committed.

### Host extension this needs

Everything else the plugin contributes is additive through shipped slots, but
one seat does not exist upstream: the sidebar browsing region renders exactly
one child (`sidebar.workspaces`, a `single` cell holding the whole session
browser), so a second grouped list has nowhere to attach. This repository
carries the 28-line, purely additive change to `ui-sidebar` that declares
`sidebar.region.section`:

```sh
git -C <your-dsh-checkout> apply patches/ui-sidebar-region-section.patch
pnpm --filter @deepseek-ai/dsh-client-ui-sidebar bundle
```

Without it the section silently never appears — `ctx.slots.inject` waits for a
declaration that never comes and contributes nothing. Everything else (the
settings page, the centre panel, the sync engine) works without the patch.

## What it adds

| Surface | Slot | What it is |
| --- | --- | --- |
| Settings page | `settings.section` (id `session-sync`) | Machine name, server domain/IP, the server switch, the connection password, the listen address/port, and the per-Session publish list |
| Left sidebar section | `sidebar.region.section` (see above) | **服务器同步工作区** — a workspace-styled group beside the workspace browser, whose rows are the connected machines' Sessions |
| Centre panel | `main` (key `session-sync`) | The machine groups, each mirror's transcripts, and the takeover composer |

All three are additive: no shipped cell is replaced, and the sidebar row and the
centre panel share one id because the frame validates a selected panel against
the registered `main` keys.

### Why the sidebar entry is a global panel row

There is no additive slot for a group *inside* the sidebar's session-browsing
region — `sidebar.workspaces` is a `single` cell occupied by `ui-workspace`, and
shadowing it would delete the whole session browser with it. `sidebar.panellist`
is the shipped seat for "a row in the left column with its own centre view",
which is what a group of synced Sessions actually is.

## Configuration

The plugin writes its own document at `$DSH_HOME/dsh-session-sync.json`
(usually `~/.dsh/dsh-session-sync.json`), atomically. The settings page is the
normal way to edit it.

### Server side

1. Set **本机名称** to the name other machines should see.
2. Turn on **作为服务器**.
3. Set **连接密码** — the same value every client must use.
4. Leave **监听地址** at `0.0.0.0` to accept other machines, or set `127.0.0.1`
   to accept only this host.
5. **监听端口** defaults to `8791`; change it if that port is taken.
6. Save.

### Client side

1. Set **本机名称**.
2. Leave **作为服务器** off.
3. Set **服务器域名 / IP** to the server's host and port, for example
   `192.168.1.10:8791`. Plain HTTP is assumed; write `https://…` explicitly if
   the server is behind TLS.
4. Set the same **连接密码**.
5. Save, then tick the Sessions to publish in **会话列表**.

## How it works

```
   client (origin)                         server
   ───────────────                         ──────
   ctx.sessionController.list()   ──POST /publish──▶  SyncHub index
   follow(sessionId) ──durable events──POST /frames──▶  SyncHub events
   prompt(sessionId, text)  ◀──SSE /stream──  DownstreamCommand
                                                     │
   browser: /dsh-session-sync/events ◀──SSE───────────┘
```

- The origin keeps one `ctx.sessionController.follow` stream open per published
  Session and forwards its durable events.
- The server keeps an in-memory mirror. Sequence numbers make a replayed window
  idempotent, so a reconnect re-opens every follow and re-sends its opening
  snapshot without duplicating or losing anything.
- Un-publishing a Session removes it from the index, which drops the mirror and
  its events — that is the only reset, so a re-publish starts clean.
- Takeover prompts go down the origin's own SSE stream; the origin calls
  `ctx.sessionController.prompt`, which resumes a cold Session before admitting
  the message.

### Two listeners, two purposes

- **The sync transport** is a `node:http` listener this plugin owns
  (`0.0.0.0:<listenPort>` on the server), guarded by a password handshake and a
  bearer token. It is deliberately *not* a route on the GUI's web server, so
  exposing sync never exposes the session GUI.
- **The browser surface** is registered on `ctx.webServer` under
  `/dsh-session-sync`, so the panel is same-origin with the GUI and inherits
  whatever authentication the composition already applies.

## Security

- The password is compared with `timingSafeEqual`; a token is minted per
  machine and bound to the machine name it was issued for, so a client cannot
  publish under another machine's identity.
- The password is stored in plaintext in `dsh-session-sync.json`, because the
  server compares it against what a client sends. Treat that file as a secret.
- The transport is plain HTTP unless `serverUrl` says `https://`. On an
  untrusted network the password and every synced transcript are readable in
  transit. Use a TLS-terminating proxy, a VPN, or a trusted LAN.
- Publishing a Session sends its full readable transcript — prompts, assistant
  text, reasoning blocks, and tool calls with their arguments and results — to
  the server. Do not publish Sessions that touch material you would not put on
  that server.
- The mirror is memory-only and disappears when the server restarts.

## Limitations

- **The server can take over a Session; it cannot start one.** A prompt is
  admitted into the origin's Session, so takeover works for Sessions that
  already exist there.
- **Assistant output appears when a step commits**, not token by token. The
  Follow stream's process-local assistant frames are not forwarded.
- **A mirror shows the last 4,000 events** of a Session; older history is
  trimmed. Remote history paging is not implemented.
- **One origin per machine name.** Two origins configured with the same
  `本机名称` will overwrite each other's mirror.
- **Transcript rendering is plain text.** Reasoning blocks collapse behind a
  detail row, and tool rows are single-line excerpts.
- The mirror is lost on server restart; origins re-publish on their next
  reconcile tick (within 10 s) plus their follow snapshots.

## Layout

```
src/shared/protocol.ts   wire and persisted shapes, shared by both halves
src/host/dsh.ts          structural declarations of the Host capabilities used
src/host/config.ts       atomic JSON configuration document
src/host/hub.ts          server-side mirror and fan-out
src/host/transport.ts    the sync listener and the origin link
src/host/service.ts      the engine: config, follow set, publish, takeover
src/index.ts             Host plugin entry and the browser routes
src/client/api.ts        transport plus the one snapshot both surfaces read
src/client/transcript.ts mirrored events projected onto readable rows
src/client/ConfigSection.tsx  the settings page
src/client/SyncPanel.tsx      the centre panel
src/client/PanelIcon.tsx      the sidebar row's icon
```

`src/host/dsh.ts` declares the consumed Host services structurally rather than
importing them: this package has no workspace dependency graph, so
`@deepseek-ai/*` is not resolvable from its sources. The Host bundle therefore
imports nothing but Node builtins, and the browser bundle keeps exactly the
shell's `PLATFORM_MODULES` as `require()` calls.

## Build

```sh
pnpm run build     # lib/index.js (Node half) + client/client.js (browser half)
```

The client bundle must be built before a running server serves it. pnpm's
`file:` dependency **hardlinks** the installed tree to this directory, so a
freshly linked artifact is already the build output — but `tsdown`'s clean pass
breaks those links for whatever it rewrites, which is when the installed copy
goes stale. This closes that gap in both cases:

```sh
pnpm run build                        # lib/index.js (Node half) + client/client.js (browser half)
powershell -ExecutionPolicy Bypass -File scripts/build-and-install.ps1
```

(`build-and-install.ps1` runs the build itself, so the first line is only needed
to build without installing. `-ExecutionPolicy Bypass` is required on a host
whose policy blocks script files.)

Once the copy is refreshed, the HMR watcher stat-polls the installed bundle and
hot-swaps the **browser** half within about half a second (reload the page). The
**Host** half is read at boot, so a change there needs a server restart;
`scripts/restart-server.ps1` performs one from outside the host, which is the
only way it can work — the agent asking for the restart runs inside the process
being restarted.
