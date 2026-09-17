# dsh-session-sync

Multi-machine Session sync for DeepSeek Harness.

Publish selected Sessions from this machine to a sync server, and — on the
server — browse every connected machine's Sessions in the console, grouped by
machine and by the directory they run in. A Session opened there can be taken
over: prompts typed in the console are forwarded to the machine that owns the
Session, which admits them into its own agent loop, and the results stream back.

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

### No host extension is needed

Every contribution goes through a shipped slot. An earlier revision also drew a
glance into the sidebar's browsing region and carried a 28-line patch that
declared `sidebar.region.section` for it; the console's panel row needs no such
seat, so that section, the patch, and the checkout modification it asked for are
all gone. If your DSH checkout still carries the applied patch, it is now inert
and may be reverted with `git -C <checkout> checkout -- packages/client/ui-sidebar`.

## What it adds

| Surface | Slot | What it is |
| --- | --- | --- |
| Settings page | `settings.section` (id `session-sync`) | Machine name, server domain/IP, the server switch, the connection password, the listen address/port, and the per-Session publish list |
| Sidebar panel row | `sidebar.panellist` (id `session-sync`) | The entry that opens the console, and the one that survives the collapsed rail |
| Centre panel | `main` (key `session-sync`) | The console: a **machine → directory → Session** tree beside the opened Session's conversation and the takeover composer |

All three are additive: no shipped cell is replaced, and the sidebar row and the
console share one id because the frame validates a selected panel against the
registered `main` keys.

### The console wears the DSH UI it stands beside

- **The list is the workspace browser.** Machines are the tree's first level,
  their `cwd` values the second, and the Sessions the third — the same 34px
  project row, the same 32px session row, the same folder glyph that becomes an
  expand arrow on hover, the same trailing relative time. A remote Session should
  scan exactly like a local one, because telling them apart is a detail of where
  the row lives, not of what the row is.
- **The talk column is the conversation.** A centered reading column capped at
  920px, user prompts as right-aligned bubbles, assistant answers as Markdown,
  thinking folded behind one row, each tool call one summary line that opens into
  the card its tool calls for — a terminal transcript, a diff with its totals, a
  line-capped file read, search hits, a fetched page — and an elevated
  22px-radius composer card with a circular send button. A step that is still
  running shows its thinking and its answer under that row as they arrive, the
  folded thinking row sweeps while it streams and follows its newest line, an
  interrupted answer carries the shipped `已停止` chip, a model retry shows the
  shipped `details` row with its countdown, a turn that failed or hit the output
  cap shows the shipped notice, and a turn's closing answer carries the copy,
  usage and run-time actions — one row of them per turn, plus one per user
  prompt. Assistant blocks keep the order the model wrote them in: reasoning and
  prose interleave, and hoisting every reasoning block to the top rewrites what
  it actually said.
- **There is no machine pane.** The machine is a level of the tree, so choosing
  one and opening a Session are the same gesture; a separate column would only
  restate what the row already says.
- **Nothing user-visible is invented.** Both panes reuse `ui-primitives`
  (`DisclosureRow`, `MarkdownText`, `Input`, `StateDot`, `Button`) and the shipped
  tokens, so the console follows a theme change, a font-size preference, and a
  hairline change with the rest of the product.

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
   follow(sessionId) ──whole step text──POST /stream-delta──▶  transient frame
   prompt(sessionId, text)  ◀──SSE /stream──  DownstreamCommand
        │                                            │
        └────────POST /ack (ok | reason)─────────────▶│ command status
                                                     │
   browser: /dsh-session-sync/events ◀──SSE───────────┘
```

- The origin keeps one `ctx.sessionController.follow` stream open per published
  Session and forwards its durable events — each with the surface placement that
  says whether it appends or replaces — plus the streamed step text its
  assistant frames carry while a step is still running.
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
  `/dsh-session-sync`, same-origin with the GUI, and it **adopts the GUI's own
  gate**: every request goes through `ctx.connection.requestRejection`, which is
  the shipped seam for putting the composition's browser session and Host/Origin
  fence in front of another route. Same cookie, same launch token, same fence —
  no second secret.

  This is not automatic, which is worth stating plainly: a prefix route is
  matched *before* the fallback that enforces the frontend's gate, so an
  unguarded plugin route is reachable by anyone who can reach the port. An
  earlier revision of this plugin was exactly that, and answered
  `/dsh-session-sync/config` — sync password included — with 200 and no token.

  Behind a reverse proxy the deployment must name its authority, or the fence
  rejects it with 403 (the GUI's own `/api` included):

  ```sh
  dsh --profile web --port 3080 --trusted-host dsh.example.com
  ```

## Security

- The plugin's browser routes require the same browser session as the GUI
  (`ctx.connection.requestRejection`), so they are no easier to reach than the
  GUI itself. A composition that mounts no browser frontend has no
  `ctx.connection` to inherit, and the routes are then only as protected as that
  composition's own web surface.
- The **sync transport** (`<listenPort>`) is a separate listener with its own
  password handshake. It is not covered by the browser session, so an exposed
  deployment should firewall that port and use a long password: the browser gate
  says nothing about who may publish or take over Sessions.
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
- **Live thinking and output are relayed while a step runs; the mirror does not
  keep them.** Each published Session's `follow` opts into the process-local
  assistant frames, their deltas are accumulated per Session and per step, and
  the whole text so far is posted as a transient frame every 150 ms — the tick
  the deltas' own rate asks for, since they arrive at some 200 a second and a
  whole thinking block is on the wire in under three seconds. The console
  renders it under the transcript, and the durable settlement — the
  `assistant/message` that ends the step, or the `assistant/attempt` a failed or
  aborted request leaves behind — is what retires it. None of it is stored, so
  the mirror and a console opened mid-step fill from the next relay rather than
  from a replay.
- **A mirror shows the last 4,000 events** of a Session; older history is
  trimmed. Remote history paging is not implemented.
- **One origin per machine name.** Two origins configured with the same
  `本机名称` will overwrite each other's mirror.
- **A takeover prompt expires after two minutes**, and at most 32 may wait for
  one machine at a time. Both limits are deliberate; a queued prompt that
  outlives them is reported as `expired` rather than delivered late.
- **Assistant text is rendered as Markdown and each tool call is one folded row**
  with its arguments and result in an IN/OUT card, but tool-specific cards (diff,
  terminal, read) are not implemented: the mirrored event carries no trusted
  presentation payload, so every result renders as text.
- **An image block shows its facts, never the picture.** The mirror carries the
  content block — media type and size — but not the attachment bytes, so the
  console says an image was there instead of drawing it.
- **The turn-level folds are not copied.** The shipped chat folds a turn's whole
  process under one summary, offers a turn navigator rail, and prints per-turn
  token pills with a usage dialog; the console lists each step's rows instead and
  keeps its usage in the header. Command, approval, and compaction cards, and the
  full composer (attachments, slash commands, model selection), are likewise not
  copied.
- **A surface replacement is honored.** The origin forwards each event's
  `surfaceOp`, so a durable event that replaces a range of earlier ones — a
  compaction, a replay after a fork — supersedes those rows in the console
  instead of appearing beside them.
- **The console copies the shipped UI; it does not import it.** A browser plugin
  cannot import another plugin's components, so the tree and the conversation are
  this package's own markup. The chat rows go further than wearing the tokens:
  `ToolRow`, `ReasoningRow`, `MessageIconActions`, `TurnUsagePanel` and the
  accessibility helpers are the shipped `ui-chat` stylesheets copied verbatim,
  and `SyncPanel` uses their class vocabulary and data attributes, so a row's
  metrics are the product's own. Only the two parent offsets `ui-chat` keeps out
  of those shared sheets stay here — the user row's 6px action gap
  (`MessageItem.module.css`) and the tail's 4px/-6px IconActions offset
  (`TurnTailNodeView.module.css`). Anything `ui-chat` does beyond that — a
  refactor of the row markup itself — still needs a re-copy, not a re-derivation.
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
src/client/tool-cards.ts  tool-row models: card choice, labels, caps
src/client/message-stats.ts  clock, run time and token figures for a row
src/client/*.module.css   the shipped chat stylesheets, copied verbatim
src/client/ConfigSection.tsx  the settings page
src/client/PanelIcon.tsx      the sidebar panel row's glyph
src/client/SyncPanel.tsx      the console: the tree, the conversation, takeover
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

On one real host a `pnpm update` of the `github:` dependency replaced the bundle
without the watcher noticing: the shell kept serving the previous bytes with the
previous `rev`, so the console went on rendering the old half. Touching the
installed `client/client.js` made it re-publish within a second (`/plugins/events`
reported a new `rev` for the plugin, and the bootstrap combo carried the new
code). A restart re-reads it as well, because the module registry's cache lives
in the process. That host also serves its browser bundles inside one
`/plugins/??…` combo, so verifying a deploy means grepping that combo for a
marker from the new build rather than fetching `/plugins/<id>/client.js`.
