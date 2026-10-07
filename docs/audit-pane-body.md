# 镜像会话 vs. 官方自带 DSH 会话页：正文差异审计

范围。(A) = 插件自己的会话面板，由 `SyncPanel.tsx` 的各行绘制
（`transcript.ts` → `ToolCallRow` / `AssistantBlockView` / `NoticeLine` / `RetryLine`）。
(B) = DSH 0.1.7-rc.1 的官方自带渲染器，`ui-chat` + `ui-conversation`，入口
`packages/client/ui-chat/src/client/conversation-nodes/register.ts:22`。

**路线前提，它统辖下面每一行。** 当 `official-session.tsx` 拿到一条路线
（`src/client/official-session.tsx:1016`）时，(A) **字面上就是** (B)：面板渲染官方自带的
`conversation.content`（`official-session.tsx:1123`），插件侧唯一的改动是三处 CSS 屏蔽
（`sync.module.css:1526-1535`、`:1551-1554`）以及丢掉 `workspace/changes`
（`official-session.tsx:392-397`）。下面所有正文差异都是**手绘面板**的差异 —— 未打补丁的
构建显示的正是手绘面板（`SyncPanel.tsx:638-692`），README 也称其为 "the console keeps
the hand-drawn pane"（`README.md:100-101`）。插件自己的头部在**每一条**路线上都替换掉
官方自带头部（`SyncPanel.tsx:557-601`）。

行号引用写作 `file:line`；插件路径相对于
`C:\Users\14339\Desktop\git\dsh-session-sync`，官方自带路径相对于
`C:\Users\14339\Desktop\git\deepseek-harness`。

## 差异

| 差异 | 插件证据 | 官方自带证据 | 用户可见? | 严重度 |
|---|---|---|---|---|
| **完全不读 `transcriptView`（工作详情）。** compact/standard/detailed/verbose 永远到不了手绘面板。 | 全无读取：在 `src/` 上 grep `transcriptView` 只返回 `PROGRESS.md:416`；`ConfigSection.tsx`（整份文件）只提供同步设置 | 策略表 `presentation-policy.ts:24-53`；消费点 `ChatGroupSeat.tsx:101,133,141`、`ChatNodeSeat.tsx:71`、`ReasoningRow.tsx:59` | 是，每一次折叠/分组/预览判定 | **高** |
| 没有轮次折叠 / 过程分组。步骤都是扁平的助手行。 | `transcript.ts:337-350`（`markTurnTails`）是唯一的轮级处理 | `foldCompletedTurns` `ChatGroupSeat.tsx:133,150`；分组标题 `ChatGroupSeat.tsx:91-126`；分组在 `process-groups.ts:152-163` 里构建 | 是 —— 标准模式的本地会话会折叠已完成轮次；本面板从不折叠 | **高** |
| 没有 `turn-process` 行，也没有步骤分组标题（"已完成工作 / 用时 …"）。 | 缺失；`transcript.ts:29-34` 里没有对应类型 | `turn-process.ts`、`turn-process-presentation.ts:55`、`ChatGroupSeat.tsx:108-113` | 是 | **高** |
| 已结束的思考（reasoning）从不预览首行。折叠行只带标题。 | `SyncPanel.tsx:1139,1159-1166` 无条件渲染摘要 | 预览受策略门控：`ReasoningRow.tsx:59`、`presentation-policy.ts:21` | 是，compact 模式下（官方自带隐藏，插件显示） | 中 |
| 没有命令 / 斜杠命令卡片。 | `transcript.ts` 里任何地方都没有 `command/run`/`command/done` 分支 | `command.ts:36-48`、`:174-216` | 是 —— `/compact`、`/plan` 等直接消失 | 中 |
| 没有压缩卡片（`上下文已压缩` + 摘要 + 被遮蔽计数）。 | `applySurface`（`transcript.ts:362-377`）会**删除**被替换的事件；不为它们产出任何东西。`kindCompaction` 存在（`locales.ts:117`），但只有 `TrajectoryView` 用这个 kind | `command.ts:101-131`（`compactSummary`）、`:207-214`；字符串 `locale.ts:128-133` | 是 —— 压缩留下一道无声的接缝 | 中 |
| 不渲染图片。镜像缺少字节的块会退化成文字芯片。 | `SyncPanel.tsx:979-988`、`transcript.ts:442-459` | `event-projection.ts:118` `{ kind:'image', attachment }` → 真正的 `<img>` | 是 | 中 |
| 没有分支操作。助手尾部只有复制 + 用量 + 时间。 | `SyncPanel.tsx:1037-1054` | `MessageIconActions.tsx:91-106`（`IconBranchOutlineRegular`），接线于 `TurnTailNodeView.tsx:69-70` | 是（即便在官方自带路线上也被屏蔽：`sync.module.css:1532-1534`） | 中 |
| 没有消息反馈操作（👍/👎）。 | 缺失 | `ui-chat/.../MessageIconActions.tsx:30` 的 `extraActions` 座位；在官方自带路线上被屏蔽 `sync.module.css:1526-1531` | 是 | 低（有意为之，见 `sync.module.css:1513-1525`） |
| 没有轮次导航轨。 | 缺失；`TrajectoryView` 是另一个界面 | `TurnNavigator.tsx`，投影 `turn-navigation.ts:79-97` | 是 | 中 |
| **多出来**的轮次用时胶囊，官方自带没有对应物。 | `SyncPanel.tsx:1050-1052` → `stat-panels.tsx:183-236` | 官方自带尾部只带 `usageAction`，受 `performanceUsage==='detailed'` 门控：`TurnTailNodeView.tsx:73-75` | 是 —— 一个自造控件 | 中 |
| 轮次用时弹窗按**每轮**显示 TPS + TTFT；官方自带只把这些作为会话总量显示。 | `stat-panels.tsx:218-230` | `StatsPills.tsx:200-227`（`stats.dialog.ttft` = 平均值，`stats.dialog.speed`） | 是 | 低 |
| ~~输入栏状态行不是官方自带的胶囊行。~~ **已修（0.10.40）**：chat 页且走官方 footer 时，底部就是 `StatsPills` 自己渲染（含官方 compact 分支的行为）；插件自绘的纯文本行只剩轨迹页与无 `retainAgentScope` 的老构建。 | `footer-projections.ts`（把总量映射成官方投影形状）、`official-session.tsx` 的 `publishFooter` | `StatsPills.tsx:332-346` compact 分支；`StatsPills.tsx:143,150-158` | 否（官方件本身） | — |
| 上下文指示器：插件自绘 14px/2px 圆环 + 面板（**头部**这一枚仍在；**底部**那一枚自 0.10.40 起是官方 `ContextMeter` 自己渲染，两者读同一份读数）。 | `SyncPanel.tsx:797-843`（`radius=5.5`、`viewBox 0 0 14 14`、stroke 2）；底部：`footer-projections.ts` 的 `contextPressure` | `ContextMeter.tsx` —— 官方自带用量表，带 system/tools/messages 细分 `locale.ts:66-68` | 头部是；底部已修 | 中 |
| 头部外壳是手绘芯片，不是官方自带头部。 | `SyncPanel.tsx:557-601`、`ChromeChips` `:754-790` | `ConversationHeader.tsx` | 是 | 中 |
| `已停止` 芯片：样式逐字节相同，但位置不同 —— 插件把它作为各块的兄弟节点追加。 | `SyncPanel.tsx:953`；`sync.module.css` 的 `.stopped` == 官方自带 `AssistantMarkdown.module.css:63-71`（已核对相同） | 渲染在 markdown 正文内部：`AssistantMarkdown.tsx:148`；轮过程标题也是 `TurnProcessNodeView.tsx:37,42` | 边缘 | 低 |
| 重试行由五个片段手工拼成。 | `SyncPanel.tsx:1097` 拼出 `第 3 次，共 5 次` | 一个模板 `locale.ts:152`：`{label}（{retry}/{maximum}） · {seconds}s` | 是 —— 标点/间距不同 | 低 |
| 未知的助手块会渲染成 JSON 转储。 | `SyncPanel.tsx:989-995` `JsonBlock` | `message.extraBlock` `locale.ts:111`；`message.unknownBlock` `locale.ts:136` | 罕见 | 低 |
| "加载更早"控件是插件自己的按钮。 | `SyncPanel.tsx:645-656`、`:620-629` | `chat.loadOlder` `locale.ts:88` = `加载更早`（插件是 `加载更早的消息`，`locales.ts:69`） | 是 | 低 |

## 明确的 bug

1. **渲染字形里的乱码。** `SyncPanel.tsx:240` 渲染出字面量 `脳`
   （U+8113）。GBK-936 往返回复可还原出 `×`（U+00D7）—— 这是镜像重置提示条上的
   关闭按钮。另外三处乱码只在注释里：
   `SyncPanel.tsx:5` 与 `:197`（`閳?`）、`:746`（`涓婁笅鏂囧崰鐢ㄧ巼` → `上下文占用率`），
   外加 `service.ts:909`（`宸插悓姝ヤ細璇濇暟` → `已同步会话数`）。
2. **字符串写错，仅 zh，两个键。** `locales.ts:230-231` 写的是
   `'{shown} 个·径'` / `'显示 {shown} / 共 {total} 个·径'`。官方自带是
   `ui-conversation/src/client/locales.ts:319-320` 的 `'{shown} 个路径'` /
   `'显示 {shown} / 共 {total} 个路径'`。`路径` 的 `路` 变成了 `·`（U+00B7 ——
   恰是 bug 1 那处损坏的反向，那里 `·` 变成了 `路`）。英文侧是正确的
   （`locales.ts:510-511`），所以只有 zh 字典漂了。每一张 `grep` 和
   `glob` 卡片摘要都受影响。
3. **`formatRunDuration` 丢掉了小时分支，且没有 `formatLiveRunDuration`。**
   `message-stats.ts:45-52` 算的是 `minutes = Math.floor(total / 60)`，没有
   `hours`。官方自带 `message-chrome.ts:49-60` 会加上 `hours` 与 `duration.hours`
   （`locale.ts:172` `{hours}小时{minutes}分{seconds}秒`）。运行 ≥1 h 的轮次显示
   `90分05秒` 而不是 `1小时30分05秒`。插件根本没有 `durationHours` 键
   （`locales.ts:262-263` 只定义了秒/分）。
4. **diff 行数上限比 checkout 少一行。**
   `tool-cards.ts:20` 的 `CHAT_DIFF_MAX_LINES = 8`，注释声称这些上限是
   "half the primitives' own defaults"。官方自带是 **9**
   （`ui-tool/.../diff-card-model.ts:7`："Room for a path, one removed/added pair, and
   three context lines on each side"）。read（8）与 search（8）对得上
   （`read-card-model.ts:17`、`search-card-model.ts:12`）；而这条注释的前提本身就错了 ——
   `DEFAULT_DIFF_MAX_LINES = 16`（`ui-primitives/DiffBlock.tsx:12`）。
5. **缓存命中率在两处用了不同的算法。**
   `session-chrome.ts:284` 算的是 `Math.round((cacheRead / (input + cacheRead)) * 1000) / 10`
   —— 一个临时凑出的比例，`cacheWrite` 两边都不计入，而且**会**把部分命中进成 `100%`。
   官方自带全部走 `formatCacheHitPercent`
   （`token-format.ts:67-98`），它对部分命中从不上报 `100`，而是增加精度。插件**有**这个
   函数（`message-stats.ts:139`）并用它算轮次胶囊（`stat-panels.tsx:123`）—— 所以同一个
   会话在头部与轮次弹窗里会显示两个不同的缓存命中数。
6. **重试次数标签把单位重复计了。** `SyncPanel.tsx:1097` 用 `locales.ts:195-197`
   拼出 `第 + retry + 次，共 + maximum + 次`。即便不计较改写本身，结果里也留着一个
   空格：`第 3 次，共 5 次`。
7. **轮次提示文案与官方自带字符串有分歧。**
   `turnFailed` = `本轮失败`（`locales.ts:201`）vs 官方自带 `message.turnError`
   `本轮运行失败`（`ui-chat/.../locale.ts:156`）；`turnMaxTokensHint` =
   `本轮达到模型输出上限，回答可能被截断。`（`locales.ts:203`）vs
   `回答被截断，已有输出保留在对话中。发送"继续"可让模型接着续写。`
   （`locale.ts:158`）。`terminalDone` = `完成`（`locales.ts:247`）vs
   `terminal.done` = `已完成`（`ui-conversation/.../locales.ts:352`）。
   会话之外，`rowRunning` = `执行中`（`locales.ts:254`）vs 官方自带
   `row.running` = `运行中`（`ui-conversation/.../locales.ts:285`）。
8. **两个 locale 键的 zh 值完全相同。** `copyCode`/`copiedCode`
   （`locales.ts:181-182`）与 `messageCopy`（`:204`）都表示 `复制`；官方自带的
   `copy`/`copied` 是分开的一对（`ui-conversation/.../locales.ts:25-26`）。
9. **surface 操作的处理是粗粒度的区间删除。** `applySurface`
   （`transcript.ts:362-377`）会删除 `seq` 落在
   `[startSeq, endSeq]` 内的**每一**行。官方自带按事件逐个分类：替换副本会被跳过，
   于是正文保留用户已经看到过的内容
   （`ui-chat/.../message.ts:51`、`core/session/src/surface.ts:84-85, 105-106`），
   而 `tool/result` 改写被限制为恰好一条被遮蔽的结果
   （`surface.ts:461-469`）。因此多节点替换区间在这里会删掉官方自带视图保留的
   用户行与助手行。
10. **助手块读取器与官方自带的分类器有分歧。**
    `transcript.ts:424-449` 会**丢弃** `tool-call` 块，并为其它任何东西**造出**一个
    `unknown` 块；官方自带把 `tool-call` 映射为真实块，把一切无法识别的映射为
    `kind:'other'`（`event-projection.ts:114-122`）。
11. **工具标题覆盖缺口 —— 8 个 wire 名 vs 约 50 个官方自带键。** 插件只映射
    `pwsh,bash,write,grep,glob,web_search,web_fetch,read_image`
    （`tool-cards.ts:52-61`），其余退回某个 family 变体
    （`tool-cards.ts:104`）。官方自带 `TOOL_TITLES` 覆盖约 50 个名字
    （`ui-tool/.../models/tool-call-model.ts:75-119`）。每个未列出的工具 —— `subagent`、
    `job_list`、`todo`/plan、`ask_user_question`、`terminal_*`、`lsp`、`workflow`、
    `ralph`、`team_*`、`goal`、`schedule_*`、`cordis_*`、`session_event_*` —— 都渲染成
    `工具调用`/`Tool call` 加 `name · summary`，而本地会话显示的是官方自带中文标题
    （`创建代理`、`查看后台任务`、…）。
12. **`tool-presentation.ts` 的 family 与官方自带标题表重叠，且有误导。**
    `:43` 把 `pwsh|bash|…` 映射到 `toolLabelTerminal`（`终端`），但真正用到的标题来自
    `TOOL_TITLE_KEYS`/`VARIANT_TITLE_KEYS`
    （`tool-cards.ts:42-50,104`），其中 `bash`/`pwsh` → `运行命令`。因此对这些名字
    而言 `toolLabelTerminal`（`locales.ts:163`）不可达。`:50` 为 subagent/workflow 造了
    一个 `share` 字形，注释自己也承认它没有官方自带对应物。

## 过期的复制件

插件文件 → checkout 文件逐一 diff，全行 `Compare-Object`。

| 复制的文件 | 结论 | 漂移的声明 |
|---|---|---|
| `src/client/accessibility.module.css` vs `ui-chat/src/client/chat/accessibility.module.css` | **完全一致**（8 行） | — |
| `src/client/MessageIconActions.module.css` vs `…/chat/MessageIconActions.module.css` | 已漂移（29 行） | `.timeStart`/`.timeEnd`：插件 `font-size: var(--dsh-content-font-size-secondary, 13px)` + `color: var(--dsw-alias-label-tertiary)`（`:17-19`、`:27-29`）vs 官方自带 `calc(… - 1px)` + `color: inherit`（`:24-26`）。`.endInfo`（`gap: 8px; min-width: 0; margin-left: 8px; display: inline-flex; align-items: center`）在插件里**完全缺失**。`.actions[data-clock='end'] .action svg` **缺失** —— 官方自带设为 17px（`:85-86`），插件仍是 15px（`:74-75`）。 |
| `src/client/ReasoningRow.module.css` vs `…/chat/ReasoningRow.module.css` | 已漂移（31 行） | 插件的 `.summary[data-follow-end]` / `.summaryText`（`:77-90`）vs 官方自带 `data-streaming` \+ `mask-image: linear-gradient(to right, black calc(100% - 48px), transparent)`（`:86-90`）；官方自带 `.root:not([data-preview]) .separator, … .summary { display: none }`（`:95-96`）在插件里没有对应物；官方自带 `.summary` 是 `label-tertiary`/13px（`:74-75`）vs 插件在另一个选择器上也是 `label-tertiary`/13px（`:65-67`）。 |
| `src/client/stat-dialog.module.css` vs `…/chat/stat-dialog.module.css` | 已漂移（1 行） | 缺少 `backdrop-filter: var(--dsw-menu-backdrop-filter)`（官方自带 `:24`）。 |
| `src/client/TurnUsagePanel.module.css` vs `…/chat/TurnUsagePanel.module.css` | 已漂移（8 行） | 胶囊标签：插件 `font-size: var(--dsh-content-font-size-secondary, 13px)` + `color: var(--dsw-alias-label-secondary)`（`:30`、`:54`）vs 官方自带 `calc(… - 1px)` + `var(--dsw-alias-label-tertiary)`（`:28`、`:52`）。 |

另有同样被复制但未做字节级 diff 的文件（选择器命名空间不同）：`ToolRow.module.css`
对 `ui-tool/.../ToolRow.module.css`，以及 `sync.module.css` 对
`ui-chat/.../ChatView.module.css` + `TurnTailNodeView.module.css`。

## 完全没有渲染的事件类型

`transcript.ts` 恰好投影 **7** 种类型：`user/message`（仅 human source，
`:383-391`）、`assistant/message`（`:393-410`）、`tool/call`（`:172-177`）、`tool/result`
（`:179-196`）、`llm/retry`（`:198-225`）、`llm/retry-started`（`:227-232`），以及
`turn/end` —— 最后一种只用来发出一条提示行（`:234-256`）。

官方自带构建认识 **59** 种事件类型
（`packages/core/session/src/known-event-types.ts:22-82`）。除这 7 种之外，其余每种
类型都被手绘面板静默丢弃。其中在官方自带聊天页里有**已渲染**对应物的是：

| 缺失的渲染器 | 插件 | 官方自带 | 效果 |
|---|---|---|---|
| command 生命周期 | 无 | `command.ts:174-216`、`CommandNodeView.tsx`、`GenericCommandCard.tsx` | `/…` 命令不可见 |
| 压缩 | 只有轨迹账本里的 `kindCompaction` | `command.ts:101-131`、`CompactionItem.tsx`、`CompactionCommandCard.tsx` | 没有 `上下文已压缩` 行 |
| 注入上下文 | 丢弃（`transcript.ts:388`） | `message.ts:74-83` 会构建它，但 `isVisibleChatNode` 排除它（`chat-visibility.ts:10-13`） | **无可视差异** |
| 系统提示词 | 丢弃 | `request-prompt.ts:62-83`，同样被 `chat-visibility.ts:10-13` 排除 | **无可视差异** |
| 权限命令 | 丢弃 | 已构建，随后被排除（`chat-visibility.ts:13`） | **无可视差异** |
| 审批询问/裁决 | 无 | `approval/asked`、`approval/decided`；`ApprovalCommand.tsx` | 审批卡片缺失 |
| todo / plan | 无 | `todo/write`、`locale.ts:77-108, 431-462` | 待办卡片缺失 |
| 交付物 | 无 | `deliverables/presented` | 卡片缺失 |
| team / schedule / goal | 无 | `team/*`、`schedule/change`、`goal/change` | 卡片缺失 |
| image offload | 无 | `image/offload` 是投影类型（`known-event-types.ts:85-87`） | — |

**计数。** 59 种已知类型 − 7 种已投影 = **52 种没有插件渲染**。其中 40 种在官方
自带聊天页里本来也只是日志/状态；**12** 种有官方自带**可见**对应物而本面板画不出来：
`command/run`、`command/done`、
`compaction/start`、`compaction/summary`、`compaction/end`、`compaction/prune`、
`approval/asked`、`approval/decided`、`todo/write`、`deliverables/presented`、
`team/task`、`schedule/change`。另外，`turn/start` 与 `step/start` 虽然被**用到**
（由 `turnFactsOf` `transcript.ts:274` 与 `turnMetricsOf`），却从不渲染，所以
轮次边界与步骤分组都没有视觉锚点。

`PANEL_ONLY_TYPES` 恰好只有一项，`workspace/changes`
（`official-session.tsx:392`），它被从官方自带路线的窗口里丢掉（`:530`、`:569`、
`:633`），这样 Host 计算的文件面板就不会被索要一份根本到不了的摘要。
那是官方自带路线**唯一**过滤掉的事件。

## 意图与代码不一致之处

- `README.md:125-132`："the work-details mode … is a Host-backed chat setting read
  through the plugin's own `configForms` scope, and the pane is that same client
  instance — so a mirrored Session folds completed turns, groups its process rows, and
  previews settled reasoning exactly as the server's own window does"。`src/` 里不存在
  这样的读取。它只在 `adopt|scope|address` 路线上成立，因为那里是官方自带的
  `TranscriptViewPolicy`（`transcript-view.ts:19-45`）在做读取 —— 对手绘面板
  和轨迹标签页则是假的。
- `PROGRESS.md:416` 断言该模式经 `ctx.configForms.get('ui-chat')` 读取。这个调用
  在 `src/` 里根本不存在。
- `README.md:84-87` 声称 "Both panes reuse `ui-primitives` … so the console follows a
  theme change, a font-size preference, and a hairline change"。上面那些过期 CSS
  正是字号偏好这条管线（`--dsh-content-font-size-secondary`、
  `--dsh-content-font-delta`），所以这句话只勉强成立。
- `tool-cards.ts:18`（"half the primitives' own defaults"）把官方自带聊天页的上限
  （8/9/8，不是 8/8/8）和原语默认值（一律 16）都说错了。
- `tool-presentation.ts:49` 承认 `share` 字形 "is this console's own" —— 这是代码里
  唯一让一步、承认自造标记的地方，与 `README.md:84` 的
  "Nothing user-visible is invented" 正相呼应。

## 方法 / 局限

对两个 checkout 都只做只读检查；未跑构建，未改任何文件。算术上的差异来自对两份
源码的逐行阅读，不是执行。官方自带一侧从 `register.ts:22` 顺着节点定义一路追到
各 seat 组件；`official-session.tsx` 的 adopted-Session 路径是
`ui-subagent` 的 `SidebarChatTab` 的结构镜像，所以在打过补丁的构建上面板**就是**官方
自带渲染器，本报告的表格不适用。乱码核验用 GBK-936 → UTF-8 往返回复；两处 `閳?`
不可恢复（em dash 之后的那个字节 0x94 变成了 0x3F，即 `?`）。
