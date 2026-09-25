# Mirrored Session vs. shipped DSH conversation — conversation-body diff audit

Scope. (A) = the plugin's own conversation pane, drawn by `SyncPanel.tsx` rows
(`transcript.ts` → `ToolCallRow` / `AssistantBlockView` / `NoticeLine` / `RetryLine`).
(B) = DSH 0.1.7-rc.1's shipped renderer, `ui-chat` + `ui-conversation`, entered at
`packages/client/ui-chat/src/client/conversation-nodes/register.ts:22`.

**Route caveat, which governs every row below.** When `official-session.tsx` gets a
route (`src/client/official-session.tsx:1016`), (A) is *literally* (B): the pane renders
the shipped `conversation.content` (`official-session.tsx:1123`) and the only plugin-side
edits are three CSS suppressions (`sync.module.css:1526-1535`, `:1551-1554`) and the
dropping of `workspace/changes` (`official-session.tsx:392-397`). All body differences
below are differences of the **hand-drawn pane**, which is what a stock build shows
(`SyncPanel.tsx:638-692`) and what the README calls "the console keeps the hand-drawn pane"
(`README.md:100-101`). The plugin's own header replaces the shipped one on *every* route
(`SyncPanel.tsx:557-601`).

Line references are `file:line`; plugin paths are relative to
`C:\Users\14339\Desktop\git\dsh-session-sync`, shipped paths to
`C:\Users\14339\Desktop\git\deepseek-harness`.

## Differences

| Difference | Plugin evidence | Shipped evidence | Visible? | Severity |
|---|---|---|---|---|
| **`transcriptView` (work details) is not read at all.** compact/standard/detailed/verbose never reach the hand-drawn pane. | no read anywhere: grep `transcriptView` over `src/` returns only `PROGRESS.md:416`; `ConfigSection.tsx` (whole file) offers only sync settings | policy table `presentation-policy.ts:24-53`; consumed at `ChatGroupSeat.tsx:101,133,141`, `ChatNodeSeat.tsx:71`, `ReasoningRow.tsx:59` | yes, on every fold/group/preview decision | **high** |
| No turn fold / process grouping. Steps are flat assistant rows. | `transcript.ts:337-350` (`markTurnTails`) is the only turn-level pass | `foldCompletedTurns` `ChatGroupSeat.tsx:133,150`; group header `ChatGroupSeat.tsx:91-126`; groups built in `process-groups.ts:152-163` | yes — a standard-mode local Session folds finished turns; the pane never does | **high** |
| No `turn-process` row and no step-group header ("已完成工作 / 用时 …"). | absent; no equivalent type in `transcript.ts:29-34` | `turn-process.ts`, `turn-process-presentation.ts:55`, `ChatGroupSeat.tsx:108-113` | yes | **high** |
| Settled reasoning never previews its first line. Collapsed row carries only the title. | `SyncPanel.tsx:1139,1159-1166` renders the summary unconditionally | preview gated on the policy: `ReasoningRow.tsx:59`, `presentation-policy.ts:21` | yes in compact mode (shipped hides it, plugin shows it) | medium |
| No command / slash-command card. | no `command/run`/`command/done` branch anywhere in `transcript.ts` | `command.ts:36-48`, `:174-216` | yes — `/compact`, `/plan` etc. vanish | medium |
| No compaction card (`上下文已压缩` + summary + shadowed counts). | `applySurface` (`transcript.ts:362-377`) *deletes* replaced events; nothing is emitted for them. `kindCompaction` exists (`locales.ts:117`) but only `TrajectoryView` uses that kind | `command.ts:101-131` (`compactSummary`), `:207-214`; strings `locale.ts:128-133` | yes — compaction leaves a silent seam | medium |
| No image rendering. A block whose bytes the mirror lacks becomes a text chip. | `SyncPanel.tsx:979-988`, `transcript.ts:442-459` | `event-projection.ts:118` `{ kind:'image', attachment }` → real `<img>` | yes | medium |
| No branch action. Assistant tail has copy + usage + time only. | `SyncPanel.tsx:1037-1054` | `MessageIconActions.tsx:91-106` (`IconBranchOutlineRegular`), wired `TurnTailNodeView.tsx:69-70` | yes (also suppressed even on the shipped route: `sync.module.css:1532-1534`) | medium |
| No message-feedback actions (👍/👎). | absent | `ui-chat/.../MessageIconActions.tsx:30` `extraActions` seat; suppressed on shipped route `sync.module.css:1526-1531` | yes | low (intentional, documented `sync.module.css:1513-1525`) |
| No turn navigator rail. | absent; `TrajectoryView` is a different surface | `TurnNavigator.tsx`, projection `turn-navigation.ts:79-97` | yes | medium |
| **Extra** turn-time pill that shipped has no counterpart for. | `SyncPanel.tsx:1050-1052` → `stat-panels.tsx:183-236` | shipped tail carries only `usageAction`, gated on `performanceUsage==='detailed'`: `TurnTailNodeView.tsx:73-75` | yes — an invented control | medium |
| Turn-time dialog shows TPS + TTFT **per turn**; shipped shows those only as session totals. | `stat-panels.tsx:218-230` | `StatsPills.tsx:200-227` (`stats.dialog.ttft` = average, `stats.dialog.speed`) | yes | low |
| Composer status row is not the shipped pill row. Shipped renders icon pills in `StatsPills` (compact: speed + cache only, **no** turn/step counts). | `SyncPanel.tsx:846-864` plain text, always shows `{turns} 轮 · {steps} 步` | `StatsPills.tsx:332-346` compact branch; `StatsPills.tsx:143,150-158` | yes | medium |
| Context indicator: plugin draws its own 14px/2px ring + panel. | `SyncPanel.tsx:797-843` (`radius=5.5`, `viewBox 0 0 14 14`, stroke 2) | `ContextMeter.tsx` — shipped meter with system/tools/messages breakdown `locale.ts:66-68` | yes | medium |
| Header chrome is hand-drawn chips, not the shipped header. | `SyncPanel.tsx:557-601`, `ChromeChips` `:754-790` | `ConversationHeader.tsx` | yes | medium |
| `已停止` chip: styling is byte-identical, but placement differs — plugin appends it as a sibling of the blocks. | `SyncPanel.tsx:953`; `sync.module.css` `.stopped` == shipped `AssistantMarkdown.module.css:63-71` (verified identical) | rendered inside the markdown body: `AssistantMarkdown.tsx:148`; also the turn-process title `TurnProcessNodeView.tsx:37,42` | marginal | low |
| Retry row is hand-built from five fragments. | `SyncPanel.tsx:1097` builds `第 3 次，共 5 次` | one template `locale.ts:152`: `{label}（{retry}/{maximum}） · {seconds}s` | yes — different punctuation/spacing | low |
| Unknown assistant block renders a JSON dump. | `SyncPanel.tsx:989-995` `JsonBlock` | `message.extraBlock` `locale.ts:111`; `message.unknownBlock` `locale.ts:136` | rare | low |
| "load older" control is the plugin's own button. | `SyncPanel.tsx:645-656`, `:620-629` | `chat.loadOlder` `locale.ts:88` = `加载更早` (plugin says `加载更早的消息`, `locales.ts:69`) | yes | low |

## Outright bugs

1. **Mojibake in a rendered glyph.** `SyncPanel.tsx:240` renders the literal `脳`
   (U+8113). GBK-936 round-trip recovers `×` (U+00D7) — the close button on the
   mirror-reset notice. Three more mojibake sites are comments-only:
   `SyncPanel.tsx:5` and `:197` (`閳?`), `:746` (`涓婁笅鏂囧崰鐢ㄧ巼` → `上下文占用率`),
   plus `service.ts:909` (`宸插悓姝ヤ細璇濇暟` → `已同步会话数`).
2. **Wrong string, zh only, two keys.** `locales.ts:230-231` reads
   `'{shown} 个·径'` / `'显示 {shown} / 共 {total} 个·径'`. Shipped is
   `ui-conversation/src/client/locales.ts:319-320` `'{shown} 个路径'` /
   `'显示 {shown} / 共 {total} 个路径'`. The `路` of `路径` has become `·` (U+00B7 —
   the exact inverse of the corruption in bug 1, where `·` became `路`). The English side
   is correct (`locales.ts:510-511`), so only the zh dictionary drifted. Every `grep` and
   `glob` card summary is affected.
3. **`formatRunDuration` drops the hours branch, and `formatLiveRunDuration` is absent.**
   `message-stats.ts:45-52` computes `minutes = Math.floor(total / 60)` with no
   `hours`. Shipped `message-chrome.ts:49-60` adds `hours` and `duration.hours`
   (`locale.ts:172` `{hours}小时{minutes}分{seconds}秒`). A turn running ≥1 h shows
   `90分05秒` instead of `1小时30分05秒`. The plugin has no `durationHours` key at all
   (`locales.ts:262-263` defines only seconds/minutes).
4. **Diff line cap is one line short of the checkout.**
   `tool-cards.ts:20` `CHAT_DIFF_MAX_LINES = 8`, with a comment claiming the caps are
   "half the primitives' own defaults". Shipped is **9**
   (`ui-tool/.../diff-card-model.ts:7`: "Room for a path, one removed/added pair, and
   three context lines on each side"). Read (8) and search (8) match
   (`read-card-model.ts:17`, `search-card-model.ts:12`); the comment's premise is wrong
   anyway — `DEFAULT_DIFF_MAX_LINES = 16` (`ui-primitives/DiffBlock.tsx:12`).
5. **Cache-hit share computed by different arithmetic in two places.**
   `session-chrome.ts:284` does `Math.round((cacheRead / (input + cacheRead)) * 1000) / 10`
   — an ad-hoc ratio that includes `cacheWrite` in neither side and *does* round a
   partial hit to `100%`. Shipped routes everything through `formatCacheHitPercent`
   (`token-format.ts:67-98`), which never reports `100` for a partial hit and adds
   precision instead. The plugin *has* that function (`message-stats.ts:139`) and uses it
   for the turn pill (`stat-panels.tsx:123`) — so the same session shows two different
   cache-hit numbers in the header vs. the turn dialog.
6. **Retry-attempt label double-counts the unit.** `SyncPanel.tsx:1097` composes
   `第 + retry + 次，共 + maximum + 次` from `locales.ts:195-197`. Even allowing the
   re-wording, the result carries a space: `第 3 次，共 5 次`.
7. **Turn notice copy diverges from the shipped strings.**
   `turnFailed` = `本轮失败` (`locales.ts:201`) vs shipped `message.turnError`
   `本轮运行失败` (`ui-chat/.../locale.ts:156`); `turnMaxTokensHint` =
   `本轮达到模型输出上限，回答可能被截断。` (`locales.ts:203`) vs
   `回答被截断，已有输出保留在对话中。发送"继续"可让模型接着续写。`
   (`locale.ts:158`). `terminalDone` = `完成` (`locales.ts:247`) vs
   `terminal.done` = `已完成` (`ui-conversation/.../locales.ts:352`).
   Out-of-session, `rowRunning` = `执行中` (`locales.ts:254`) vs shipped
   `row.running` = `运行中` (`ui-conversation/.../locales.ts:285`).
8. **Two locale keys with identical zh values.** `copyCode`/`copiedCode`
   (`locales.ts:181-182`) and `messageCopy` (`:204`) both mean `复制`; the shipped
   `copy`/`copied` pair is separate (`ui-conversation/.../locales.ts:25-26`).
9. **Surface-op handling is a coarse range delete.** `applySurface`
   (`transcript.ts:362-377`) deletes *every* row whose `seq` falls in
   `[startSeq, endSeq]`. Shipped classifies per event: a replacement copy is skipped so
   the transcript keeps what the user already saw
   (`ui-chat/.../message.ts:51`, `core/session/src/surface.ts:84-85, 105-106`), and a
   `tool/result` rewrite is restricted to exactly one shadowed result
   (`surface.ts:461-469`). A multi-node replaced range therefore removes user and
   assistant rows here that the shipped view keeps.
10. **Assistant-block reader diverges from the shipped classifier.**
    `transcript.ts:424-449` *drops* `tool-call` blocks and *invents* an `unknown` block
    for anything else; shipped maps `tool-call` to a real block and everything
    unrecognized to `kind:'other'` (`event-projection.ts:114-122`).
11. **Tool-title coverage gap — 8 wire names vs. ~50 shipped keys.** The plugin maps
    only `pwsh,bash,write,grep,glob,web_search,web_fetch,read_image`
    (`tool-cards.ts:52-61`) and falls back to a family variant
    (`tool-cards.ts:104`). Shipped `TOOL_TITLES` covers ~50 names
    (`ui-tool/.../models/tool-call-model.ts:75-119`). Every unlisted tool — `subagent`,
    `job_list`, `todo`/plan, `ask_user_question`, `terminal_*`, `lsp`, `workflow`,
    `ralph`, `team_*`, `goal`, `schedule_*`, `cordis_*`, `session_event_*` — renders as
    `工具调用`/`Tool call` plus `name · summary`, where a local session shows the
    shipped Chinese title (`创建代理`, `查看后台任务`, …).
12. **`tool-presentation.ts` families overlap the shipped title map and mislead.**
    `:43` maps `pwsh|bash|…` to `toolLabelTerminal` (`终端`), but the title actually
    used comes from `TOOL_TITLE_KEYS`/`VARIANT_TITLE_KEYS`
    (`tool-cards.ts:42-50,104`), where `bash`/`pwsh` → `运行命令`. `toolLabelTerminal`
    (`locales.ts:163`) is therefore unreachable for those names. `:50` invents a
    `share` glyph for subagent/workflow, which the comment admits has no shipped
    counterpart.

## Stale copies

Diffed plugin file → checkout file, `Compare-Object` on all lines.

| Copied file | Verdict | Drifted declarations |
|---|---|---|
| `src/client/accessibility.module.css` vs `ui-chat/src/client/chat/accessibility.module.css` | **identical** (8 lines) | — |
| `src/client/MessageIconActions.module.css` vs `…/chat/MessageIconActions.module.css` | drifted (29 lines) | `.timeStart`/`.timeEnd`: plugin `font-size: var(--dsh-content-font-size-secondary, 13px)` + `color: var(--dsw-alias-label-tertiary)` (`:17-19`, `:27-29`) vs shipped `calc(… - 1px)` + `color: inherit` (`:24-26`). `.endInfo` (`gap: 8px; min-width: 0; margin-left: 8px; display: inline-flex; align-items: center`) **missing entirely** from the plugin. `.actions[data-clock='end'] .action svg` **missing** — shipped sets 17px (`:85-86`), plugin still 15px (`:74-75`). |
| `src/client/ReasoningRow.module.css` vs `…/chat/ReasoningRow.module.css` | drifted (31 lines) | Plugin's `.summary[data-follow-end]` / `.summaryText` (`:77-90`) vs shipped `data-streaming` \+ `mask-image: linear-gradient(to right, black calc(100% - 48px), transparent)` (`:86-90`); shipped `.root:not([data-preview]) .separator, … .summary { display: none }` (`:95-96`) has no plugin counterpart; shipped `.summary` is `label-tertiary`/13px (`:74-75`) vs plugin `label-tertiary`/13px at a different selector (`:65-67`). |
| `src/client/stat-dialog.module.css` vs `…/chat/stat-dialog.module.css` | drifted (1 line) | Missing `backdrop-filter: var(--dsw-menu-backdrop-filter)` (shipped `:24`). |
| `src/client/TurnUsagePanel.module.css` vs `…/chat/TurnUsagePanel.module.css` | drifted (8 lines) | Pill label: plugin `font-size: var(--dsh-content-font-size-secondary, 13px)` + `color: var(--dsw-alias-label-secondary)` (`:30`, `:54`) vs shipped `calc(… - 1px)` + `var(--dsw-alias-label-tertiary)` (`:28`, `:52`). |

Also copied but not byte-diffed (different selector namespaces): `ToolRow.module.css`
against `ui-tool/.../ToolRow.module.css`, and `sync.module.css` against
`ui-chat/.../ChatView.module.css` + `TurnTailNodeView.module.css`.

## Event types with no rendering at all

`transcript.ts` projects exactly **7** types: `user/message` (human source only,
`:383-391`), `assistant/message` (`:393-410`), `tool/call` (`:172-177`), `tool/result`
(`:179-196`), `llm/retry` (`:198-225`), `llm/retry-started` (`:227-232`), and
`turn/end` — the last only to emit a notice row (`:234-256`).

The shipped build knows **59** event types
(`packages/core/session/src/known-event-types.ts:22-82`). Beyond those 7, every remaining
type is silently dropped by the hand-drawn pane. The ones with a *rendered* counterpart
in the shipped chat are:

| Missing renderer | Plugin | Shipped | Effect |
|---|---|---|---|
| command lifecycle | none | `command.ts:174-216`, `CommandNodeView.tsx`, `GenericCommandCard.tsx` | `/…` commands invisible |
| compaction | only `kindCompaction` in the trajectory ledger | `command.ts:101-131`, `CompactionItem.tsx`, `CompactionCommandCard.tsx` | no `上下文已压缩` row |
| injected context | dropped (`transcript.ts:388`) | `message.ts:74-83` builds it, but `isVisibleChatNode` excludes it (`chat-visibility.ts:10-13`) | **no visible difference** |
| system prompt | dropped | `request-prompt.ts:62-83`, also excluded by `chat-visibility.ts:10-13` | **no visible difference** |
| permission command | dropped | built, then excluded (`chat-visibility.ts:13`) | **no visible difference** |
| approval ask/decide | none | `approval/asked`, `approval/decided`; `ApprovalCommand.tsx` | approval card absent |
| todo / plan | none | `todo/write`, `locale.ts:77-108, 431-462` | to-do card absent |
| deliverables | none | `deliverables/presented` | card absent |
| team / schedule / goal | none | `team/*`, `schedule/change`, `goal/change` | cards absent |
| image offload | none | `image/offload` is a projection type (`known-event-types.ts:85-87`) | — |

**Counts.** 59 known types − 7 projected = **52 types with no plugin rendering**. Of
those, 40 are legitimately log-only/state-only in the shipped chat too; **12** have a
shipped *visible* counterpart the pane cannot draw: `command/run`, `command/done`,
`compaction/start`, `compaction/summary`, `compaction/end`, `compaction/prune`,
`approval/asked`, `approval/decided`, `todo/write`, `deliverables/presented`,
`team/task`, `schedule/change`. Separately, `turn/start` and `step/start` are *used*
(by `turnFactsOf` `transcript.ts:274` and `turnMetricsOf`) but never render, so
turn boundaries and step grouping have no visual anchor.

`PANEL_ONLY_TYPES` holds exactly one entry, `workspace/changes`
(`official-session.tsx:392`), dropped from the shipped-route window (`:530`, `:569`,
`:633`) so the Host-computed files panel is not asked for a summary that cannot arrive.
That is the *only* event the shipped route filters.

## Intent-vs-code disagreements

- `README.md:125-132`: "the work-details mode … is a Host-backed chat setting read
  through the plugin's own `configForms` scope, and the pane is that same client
  instance — so a mirrored Session folds completed turns, groups its process rows, and
  previews settled reasoning exactly as the server's own window does". No such read
  exists in `src/`. It is true only on the `adopt|scope|address` routes, where the
  shipped `TranscriptViewPolicy` (`transcript-view.ts:19-45`) does the reading — and
  false for the hand-drawn pane and for the trajectory tab.
- `PROGRESS.md:416` asserts the mode is read via `ctx.configForms.get('ui-chat')`. That
  call appears nowhere in `src/`.
- `README.md:84-87` claims "Both panes reuse `ui-primitives` … so the console follows a
  theme change, a font-size preference, and a hairline change". The stale CSS above is
  precisely the font-size-preference plumbing (`--dsh-content-font-size-secondary`,
  `--dsh-content-font-delta`), so this holds only loosely.
- `tool-cards.ts:18` ("half the primitives' own defaults") mis-states both the shipped
  chat caps (8/9/8, not 8/8/8) and the primitive defaults (16 across the board).
- `tool-presentation.ts:49` admits the `share` glyph "is this console's own" — the one
  place the code concedes an invented mark, consistent with `README.md:84`'s
  "Nothing user-visible is invented".

## Method / limits

Read-only inspection of both checkouts; no builds run, no files modified. Arithmetic
diffs are line-by-line reads of the two sources, not execution. The shipped side was
traced from `register.ts:22` through the node definitions to the seat components;
`official-session.tsx`'s adopted-Session path is a structural mirror of
`ui-subagent`'s `SidebarChatTab`, so on a patched build the pane *is* the shipped
renderer and this report's table does not apply. Verification of the mojibake used a
GBK-936 → UTF-8 round-trip; the two `閳?` sites are unrecoverable (the byte that
follows the em-dash 0x94 is 0x3F, `?`).
