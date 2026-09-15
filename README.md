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
declaration that never comes and contributes nothing. The patch therefore costs
you the *glance*, not the feature: the settings page, the sidebar panel row, the
console, and the sync engine all work without it.

## What it adds

| Surface | Slot | What it is |
| --- | --- | --- |
| Settings page | `settings.section` (id `session-sync`) | Machine name, server domain/IP, the server switch, the connection password, the listen address/port, and the per-Session publish list |
| Sidebar panel row | `sidebar.panellist` (id `session-sync`) | The entry that opens the console, and the only one that survives the collapsed rail |
| Left sidebar section | `sidebar.region.section` (see above) | **服务器同步工作区** — a glance beside the workspace browser: the fleet line, then each machine's running and most recent Sessions, then 查看全部 into the console |
| Centre panel | `main` (key `session-sync`) | The console: machines, the selected machine's Sessions searched and grouped by directory, and one opened Session with its transcript and the takeover composer |

All four are additive: no shipped cell is replaced, and the sidebar row, the
section and the centre panel share one id because the frame validates a selected
panel against the registered `main` keys.

### Three ways in, and why they are three

- **`sidebar.panellist` needs no host patch** and renders in both column widths,
  so it is the console's real entry point. Without it the panel would be
  reachable only from the browsing region, which is a wide-column surface:
  collapsing the sidebar would hide the panel with no way back.
- **`sidebar.region.section` is the glance.** There is no additive slot for a
  group *inside* the sidebar's session-browsing region — `sidebar.workspaces` is
  a `single` cell occupied by `ui-workspace`, and shadowing it would delete the
  whole session browser with it. This section therefore sits beneath that browser
  and wears its clothes: the same folder-plus-chevron lead-in, the same 32px
  rows, the same indented Session rows with a trailing time.
- A glance is all it holds, on purpose. The column's lower half cannot show every
  Session of every machine without taking that height from the browser above it,
  so it lists what a reader needs in order to decide whether to go look. Its rows
  carry no machine name, so Sessions are grouped per machine there rather than
  flattened into one list — a flat list would make another machine's Session read
  as one of your own.
- **The console is `main`.** Machines, Sessions, and the opened Session are three
  panes of one panel, because that is what the job is: pick a machine, pick a
  Session, read it or take it over. On a wide column all three are visible at
  once; below 960px the same DOM becomes a drill-down with back buttons that only
  exist in that mode.

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
        │                                            │
        └────────POST /ack (ok | reason)─────────────▶│ command status
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

### A prompt is a claim, so it is confirmed

`POST /command` answers with a `commandId`, and the server then narrates what
became of that command down the browser's own event stream:

| State | Meaning |
| --- | --- |
| `queued` | Accepted; no origin stream is attached, so it waits |
| `delivered` | Written to the owning machine's stream; nothing confirmed yet |
| `accepted` | The machine admitted the prompt into its Session |
| `failed` | The machine refused it, with its reason |
| `expired` | The TTL passed before the machine confirmed it |

- A command carries `expiresAt` (`COMMAND_TTL_MS`, two minutes). A prompt is a
  human act addressed at a Session that may have moved on, so a command that sat
  in a queue while the owning machine slept is retired rather than admitted later
  as if it had just been typed. Both ends enforce it: the server sweeps on its
  reconcile tick, and the origin refuses an expired command even if that sweep
  has not run yet.
- The queue per machine is bounded (`PENDING_LIMIT`, 32 commands); what does not
  fit is retired with that reason rather than growing the server's memory.
- The browser narrates only the commands it sent, matched by `commandId`.

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
- **A takeover prompt expires after two minutes**, and at most 32 may wait for
  one machine at a time. Both limits are deliberate; a queued prompt that
  outlives them is reported as `expired` rather than delivered late.
- **Assistant text is rendered as Markdown and each tool call is one folded row**
  with its arguments and result, but tool-specific cards (diff, terminal, read)
  are not implemented: the mirrored event carries no trusted presentation
  payload, so every result renders as text.
- The mirror is lost on server restart; origins re-publish on their next
  reconcile tick (within 10 s) plus their follow snapshots.

## Layout

```
src/shared/protocol.ts   wire and persisted shapes, shared by both halves
src/host/dsh.ts          structural declarations of the Host capabilities used
src/host/config.ts       atomic JSON configuration document
src/host/hub.ts          server-side mirror, fan-out, and the command lifecycle
src/host/transport.ts    the sync listener and the origin link
src/host/service.ts      the engine: config, follow set, publish, takeover
src/index.ts             Host plugin entry and the browser routes
src/client/api.ts        transport plus the one snapshot every surface reads
src/client/transcript.ts mirrored events projected onto readable rows
src/client/ConfigSection.tsx  the settings page
src/client/PanelIcon.tsx      the sidebar panel row's glyph
src/client/SyncPanel.tsx      the console: machines, Sessions, takeover
src/client/SyncSection.tsx    the sidebar glance
```

`src/host/dsh.ts` declares the consumed Host services structurally rather than
importing them: this package has no workspace dependency graph, so
`@deepseek-ai/*` is not resolvable from its sources. The Host bundle therefore
imports nothing but Node builtins, and the browser bundle keeps exactly the
shell's `PLATFORM_MODULES` as `require()` calls.

## Build

```sh
powershell -ExecutionPolicy Bypass -File scripts/build-and-install.ps1
```

Both halves are built from sources that depend on nothing but `tsdown` and
`lightningcss`; the script also refreshes the profile's installed copy **when the
profile holds this package as a local dependency**
(`dsh plugin --profile web add file:<this directory>`). pnpm hardlinks a `file:`
dependency to this directory, so a rebuild usually lands in place — the copy
exists for the links `tsdown`'s clean pass breaks.

When the profile holds the **published** dependency instead
(`github:cczzyy-cn/dsh-session-sync`), the installed tree comes from pnpm's store
and nothing written here reaches it. The script builds and then says so, rather
than writing bytes a fresh install would never see. Two ways forward:

- to iterate: `dsh plugin --profile web add file:<this directory>`
- to publish: commit and push, then
  `pnpm --dir <profile> update dsh-session-sync`

Once the installed bundle is refreshed, the HMR watcher stat-polls it and
hot-swaps the **browser** half within about half a second (reload the page). The
**Host** half is read at boot, so a change there needs a server restart;
`scripts/restart-server.ps1` performs one from outside the host — the only way it
can work, because the agent asking for the restart runs inside the process being
restarted.
