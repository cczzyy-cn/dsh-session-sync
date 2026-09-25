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
  prompt. That row waits for the turn to close: while a turn is still producing,
  its narration carries no actions at all (the shipped footer's own rule), so the
  row never appears and then moves. Once it is there it follows the shipped
  recency rule: the newest turn's row stays, an older turn's appears on hover or
  keyboard focus, and an earlier prompt's clock-and-copy row does the same once a
  later prompt exists. Assistant blocks keep the order the model wrote them in:
  reasoning and prose interleave, and hoisting every reasoning block to the top
  rewrites what it actually said.
- **There is no machine pane.** The machine is a level of the tree, so choosing
  one and opening a Session are the same gesture; a separate column would only
  restate what the row already says.
- **A Session that is short of events says so, where the reader already is.** The
  count is per Session — on its tree row before the relative time, and beside the
  title in the panel header — because the total in settings says how much is
  missing without saying which Session to re-publish. The top of an opened
  transcript carries a quiet `加载更早的消息` row for the same reason: it appears
  only when the mirror is not the whole conversation, and it reads the page
  behind its window from the machine that owns the Session.
- **Nothing user-visible is invented.** Both panes reuse `ui-primitives`
  (`DisclosureRow`, `MarkdownText`, `Input`, `StateDot`, `Button`) and the shipped
  tokens, so the console follows a theme change, a font-size preference, and a
  hairline change with the rest of the product.
- **The conversation is the shipped one wherever the build allows it.** The
  console draws the open remote Session with the product's real
  `conversation.content` factory — its transcript, its tool cards, its turn
  folds — by taking the Session up through whichever of three routes the build
  offers:

  | Route | Needs | What it gives |
  | --- | --- | --- |
  | `adopt` | `ctx.sessions.adopt` (the patch below) | A Session born open, holding the console's own prompt verb — the shipped composer works |
  | `scope` | `ctx.sessions.retainAgentScope` + `binding` | The same pane with no Host I/O at all; the console's takeover composer stands in for the shipped one |
  | `address` | `ctx.sessions.retain` alone, plus one catalogued Session to address | The same, except the reference's own Host read cannot succeed and the pane shows that hint |

  Only when none is available does the console keep the hand-drawn pane
  described above, unchanged — so a stock build loses likeness, never function.
  The routes are feature-detected in `src/client/official-session.tsx`;
  `sessions` is deliberately not in this plugin's required `inject` list,
  because the console has to load on builds that predate all three.

  On the two routes that drive the window itself the shipped composer is hidden,
  because its prompt would go to a Host that has never heard of the Session: its
  seat is replaced by the console's own takeover composer, which reaches the
  machine that owns the Session. The composer-block registry
  (`ctx.conversation.blocks`) is raised alongside so the reason shows wherever
  that block survives — another plugin publishing its own state for the same
  Session can clear it, which is why the seat is hidden rather than trusted.

  Older history is reachable from the pane. A mirror serves a tail window, and
  the shipped conversation's own older-end control would ask the Host that has
  never heard of the Session, so the window it is given never claims more; the
  console's own paging is the road, and a `加载更早的消息` control above the pane
  reads one page over the sync link per click and prepends it to the same window,
  so the reader keeps their place. Pages arrive over two roads — the page the
  console read, and the origin's ordinary replay frames once the mirror has grown
  downward — so the pane drops envelopes the window already carries and treats
  ones below it as history, because the shipped conversation's assembler requires
  each node's matches in sequence order and an appended older event breaks it.

  Presentation follows the DSH install's own setting. The work-details mode
  (`ui-chat`'s `transcriptView`: compact, standard, detailed, or verbose) is a
  Host-backed chat setting read through the plugin's own `configForms` scope, and
  the pane is that same client instance — so a mirrored Session folds completed
  turns, groups its process rows, and previews settled reasoning exactly as the
  server's own window does, including a change made while the pane is open. What
  that setting does *not* cover is per-row disclosure: opening one reasoning or
  tool row is local click state, in the console as everywhere else.

  `adopt` exists in no released DSH: it is a client-only addition to
  `@deepseek-ai/dsh-api-session-controller` (one `adopt` method on the Sessions
  service, plus the local-only Session generation behind it). `patches/` carries
  that change as a source patch against `dsh-v0.1.7-alpha.2`, the built client
  bundle to drop into an installed DSH, and a script that finds the installation,
  backs the file up, and replaces it. A `dsh` upgrade on a patched host mints a
  fresh install directory and quietly drops that host to the `scope` route;
  re-running the script restores the full one.

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
   page(beforeSeq)   ──older history──POST /frames──▶  SyncHub events
   prompt(sessionId, text)  ◀──SSE /stream──  DownstreamCommand
   re-open follow / read a page  ◀──SSE /stream──  {kind:'resync'} / {kind:'older'}
        │                                            │
        └────────POST /ack (ok | reason)─────────────▶│ command status
                                                     │
   browser: /dsh-session-sync/events ◀──SSE───────────┘
            /dsh-session-sync/transcript ──page──▶  the mirror's window
```

- The origin keeps one `ctx.sessionController.follow` stream open per published
  Session and forwards its durable events — each with the surface placement that
  says whether it appends or replaces — plus the streamed step text its
  assistant frames carry while a step is still running.
- **A batch is not published until the server has it.** A follow hands its events
  to the link, which holds them in an outbox and retries until a post is
  accepted; membership does the rest, so a replay or a retry that arrives twice
  changes nothing. A post that hangs is failed after 20 s, because a connection
  black-holed by a network blip used to leave the fetch pending forever — the
  outbox stopped draining, nothing reconnected, and the link looked healthy while
  publishing nothing.
- **The mirror counts what it is missing.** Every Session carries
  `missingEvents`, the events below the origin's own highest sequence that the
  mirror does not hold — holes in the middle plus however far it is behind. The
  origin states its extent in the index (`lastSeq`), so a mirror holding nothing
  is not mistaken for a Session with nothing to hold.
- **What is missing is asked for.** The server asks the origin to re-open one
  Session's follow (`{kind:'resync'}`, retried every 30 s while the gap lasts);
  the opening snapshot is replayed into the mirror, and because membership rather
  than a high-water mark decides what is new, that replay fills a hole instead of
  being discarded as history.
- **History below the window is asked for too.** A follow opens on a tail window,
  so a long Session's mirror begins mid-conversation. The origin says whether its
  own log continues below what it published (`hasOlder`, from the opening
  snapshot's `hasMore`), the console serves a 400-event page of what the mirror
  holds, and a reader who wants older asks for the page behind it
  (`{kind:'older'}`, 50 messages). The origin reads that page out of its own log
  — against the same cut the window was taken at — and it comes back as ordinary
  durable events.
- **A published batch is split to fit the wire.** A follow opening on a long
  Session is its whole window in one frame, which is megabytes: measured here,
  3,478 events of a real Session serialize to 12.5 MB, and the sync server refuses
  a request body over `MAX_BODY_BYTES` (4 MB). One oversized POST is not a single
  failure — the batch stays at the head of the outbox and is retried on every
  reconnect, so the follow never finishes, its `cursor` stays `-1`, and every page
  read cut against that cursor is refused. So `batchEvents`
  (`src/shared/protocol.ts`) splits one run of events by a byte budget derived
  from that same limit, in order, dropping nothing; a single event larger than the
  whole budget travels alone rather than being dropped. The listener answers an
  oversized body with a named 413 *before* reading it, because throwing on an
  unread body makes Node reset the connection — and a network error is not a
  refusal the sender can act on.
- Un-publishing a Session removes it from the index, which drops the mirror and
  its events.
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

### The browser surface's routes

All of them sit under `/dsh-session-sync` and behind the GUI's own gate.

| Route | Method | What it is |
| --- | --- | --- |
| `/config` | GET | The plugin's configuration plus the current state |
| `/config` | POST | Patch the configuration; answers with the fresh config, state, and local Session list |
| `/state` | GET | The state every surface reads: role, link, mirror, and the per-Session counts |
| `/sessions` | GET | This machine's own Session list, for the publish picker |
| `/transcript` | GET | A page of one mirrored Session (`machine`, `session`, optional `limit`, `before`); asks the owning machine for history below its window when a reader reaches the mirror's edge |
| `/materialize` | POST | Write one mirrored Session into this Host's own storage and archive it (`machineName`, `sessionId`); walks the origin back to the Session's beginning first, and refuses rather than writing a log with a hole at the front |
| `/command` | POST | One takeover prompt; answers with the `commandId` its status is narrated under |
| `/events` | GET | The SSE stream: state frames, per-Session event frames, and transient live text |

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
- **A mirror shows the last 4,000 events** of a Session; older history is trimmed
  from the mirror itself. The console reads what the mirror holds a page at a
  time — 400 events, newest first — and a page the mirror is missing is read from
  the machine that owns the Session when a reader asks for it. That read is not
  instant: it is a read of that machine's log, a POST back, and a trip through
  whatever proxy sits in front, which measured at ten to twenty seconds on a
  cross-border link, so the control waits rather than answering at once.
- **A gap in the middle of a mirror is not yet repaired by the paging path.** The
  repair ask replays a follow's opening snapshot, which is a tail window: it
  fills a gap near the top and cannot reach one far below it. Such a Session is
  reported honestly (the console shows `缺 N 条` on its row and in the header)
  but stays short until the origin's window grows past the hole or the Session is
  re-published.
- **A mirrored transcript carries no Host-computed panels.** The shipped
  conversation offers its change-review cards, and the official `ui-deliverables`
  plugin fills one by asking *its own Host* for
  `/api/changes.summary?sessionId=…&seq=…`. A mirrored Session lives on the sync
  server, so that Host would answer 404 for every announcement — the plugin's
  ordinary "no longer served" state, one failed request each and a card stuck on
  unavailable. The data cannot be recovered here either: a `workspace/changes`
  event carries only `{ turn }`, while the files and totals are computed by the
  Host that owns the workspace. So the announcement is filtered out of the window
  the console feeds (`PANEL_ONLY_TYPES` in `src/client/official-session.tsx`) and
  the cards never appear — the tool rows that actually changed the files are
  ordinary events and stay. Making those cards work would mean carrying the
  summary over the sync link *and* writing it into that plugin's own state table,
  a deeper coupling than this plugin takes on today.
- **A mirrored pane hides the shipped history-failure line.** A session-scoped
  integration behind the (hidden) shipped composer can still retain the Session
  through the contract, and a retained Session opens history against the Host
  that owns it — for a mirror, a Host that has never heard of it. The answer is
  `session/not-found`, and the shipped chat draws its own "history failed to
  load" line for it. That line describes a read this pane neither uses (the
  transcript comes from the mirror) nor can satisfy, so it is hidden inside the
  pane on every route but `adopt`; the header chip names the route, which is
  where that fact belongs. Drawing the session View *without* the content shell
  was tried as a way to avoid the read altogether and renders an empty pane — the
  shell is what supplies the context that View is written against.
- **One origin per machine name.** Two origins configured with the same
  `本机名称` will overwrite each other's mirror.
- **A takeover prompt expires after two minutes**, and at most 32 may wait for
  one machine at a time. Both limits are deliberate; a queued prompt that
  outlives them is reported as `expired` rather than delivered late.
- **Assistant text is rendered as Markdown and each tool call is one folded row**
  that opens into the card its tool calls for — terminal transcript, diff with its
  totals, line-capped read, search hits, fetched page — with the generic IN/OUT
  card for anything else.
- **An image block shows its facts, never the picture.** The mirror carries the
  content block — media type and size — but not the attachment bytes, so the
  console says an image was there instead of drawing it.
- **The turn-level folds are not copied.** The shipped chat folds a turn's whole
  process under one summary and offers a turn navigator rail; the console lists
  each step's rows instead. The per-turn usage and time readings are copied,
  though — pills that open the shipped detail dialogs (see below) — and the
  session totals sit in the header. Command, approval, and compaction cards, and
  the full composer (attachments, slash commands, model selection), are likewise
  not copied.
- **A surface replacement is honored.** The origin forwards each event's
  `surfaceOp`, so a durable event that replaces a range of earlier ones — a
  compaction, a replay after a fork — supersedes those rows in the console
  instead of appearing beside them.
- **The console copies the shipped UI; it does not import it.** A browser plugin
  cannot import another plugin's components, so the tree and the conversation are
  this package's own markup — unless the build supports the adoption API, in
  which case the conversation *is* the shipped renderer (see above) and only the
  tree is this package's own. The chat rows go further than wearing the tokens:
  `ToolRow`, `ReasoningRow`, `MessageIconActions`, `TurnUsagePanel`,
  `stat-dialog` and the accessibility helpers are the shipped `ui-chat`
  stylesheets copied verbatim, and `SyncPanel` uses their class vocabulary and
  data attributes, so a row's metrics are the product's own. Only the two parent
  offsets `ui-chat` keeps out of those shared sheets stay here — the user row's
  6px action gap (`MessageItem.module.css`) and the tail's 4px/-6px IconActions
  offset (`TurnTailNodeView.module.css`). Anything `ui-chat` does beyond that — a
  refactor of the row markup itself — still needs a re-copy, not a re-derivation.
- **The two turn-stat pills are the shipped ones, dialogs included.** `用量` opens
  the turn-usage dialog and `用时` the turn-time dialog: the shipped seat (open
  state, `useAnchoredPosition` clamp above the trigger, outside-pointer and
  Escape close) with the panel portaled to the body, and the shipped rows —
  provider/model, cache hit, the four token buckets, inline reasoning; total run
  time, decode throughput, and first-token latency. Throughput and TTFT are folded
  from the mirrored stream records by the same arithmetic the host uses
  (`turn-metrics.ts`), so they appear when a step recorded them and the row is
  omitted when it did not. The copy action's tooltip is the shipped `复制` /
  `复制成功` pair.
- The mirror is lost on server restart; origins re-publish on their next
  reconcile tick (within 10 s) plus their follow snapshots.

## Layout

```
PROGRESS.md              the running log: current state, measurements, open problems
src/shared/protocol.ts   wire and persisted shapes, shared by both halves
src/host/dsh.ts          structural declarations of the Host capabilities used
src/host/config.ts       atomic JSON configuration document
src/host/hub.ts          server-side mirror, fan-out, and the command lifecycle
src/host/transport.ts    the sync listener and the origin link
src/host/service.ts      the engine: config, follow set, publish, takeover
src/index.ts             Host plugin entry and the browser routes
src/client/index.ts      browser plugin entry: the slots and their injections
src/client/api.ts        transport plus the one snapshot every surface reads
src/client/official-session.tsx  the adopted Session: the shipped renderer's pane
src/client/transcript.ts mirrored events projected onto readable rows
src/client/tool-cards.ts  tool-row models: card choice, labels, caps
src/client/tool-presentation.ts  a wire tool name's glyph and localized title
src/client/session-chrome.ts  runtime chrome read off the log, and the ledger rows
src/client/TrajectoryView.tsx  the 轨迹 tab: toolbar, timeline strip, ledger
src/client/message-stats.ts  clock, run time and token figures for a row
src/client/turn-metrics.ts   per-turn TTFT, throughput and route, folded
src/client/stat-panels.tsx   the turn-usage and turn-time pills and dialogs
src/client/locales.ts        every string both surfaces render, zh and en
src/client/*.module.css      the shipped chat stylesheets, copied verbatim
src/client/css-modules.d.ts  the CSS-module import shape for this build
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
