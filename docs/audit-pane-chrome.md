# dsh-session-sync 控制台 vs DSH 原生会话页：页面外壳差异审计

被审仓库（均只读）：插件 `C:\Users\14339\Desktop\git\dsh-session-sync`（v0.4.7）；参考实现 `C:\Users\14339\Desktop\git\deepseek-harness`（**0.1.7-rc.1**，`package.json` 已核）。简称：**P** = 插件，**S** = shipped。

---

## 0. 路线摘要（哪条路走什么时候；每条显示/隐藏什么）

feature detection 在 `official-session.tsx:1016-1023`（`routeOf`），顺序 `adopt` → `scope` → `address`：

| 条件 | 路线 |
| --- | --- |
| `ctx.sessions.adopt` 存在（打了补丁的构建） | `adopt` |
| 否则 `binding` 且 `sessions.retainAgentScope` 存在（**rc.1 有**：`packages/api/session-controller/src/client/sessions/service.ts:487`） | `scope` |
| 否则 `sessions.list` 里有一个本地会话可作父地址 | `address` |
| 都不满足 | 无路线 → 手绘面板（`SyncPanel.tsx:638-692`）+ 手绘 composer（`SyncPanel.tsx:698-740`） |

`composerOwned = route !== undefined && route !== 'adopt'`（`official-session.tsx:849-852`）。渲染入口：`official-session.tsx:1123-1130` 永远调 `renderFactorySlot('conversation.content', {variant:'embedded', phase:'active', hero:false})`。

**每条路线显示/隐藏（逐项）**

| 元素 | `adopt` | `scope` / `address` | 依据 |
| --- | --- | --- | --- |
| shipped 输入框 seat | **显示** | **隐藏**（`display:none`） | 隐藏规则 `sync.module.css:1551-1553`，类挂在 `SyncPanel.tsx:631`（`composerOwned` 时加 `drivesWindow`）；seat 本体 `ui-conversation/src/client/skeleton/ConversationContent.tsx:176-180` |
| shipped 历史失败横幅 | **显示** | **隐藏**（`[class*="openError"]`） | 同上 `sync.module.css:1552`；横幅 `ui-chat/src/client/chat/ChatView.tsx:236-240`，类 `ChatView.module.css:104` |
| 模型选择器 / 权限选择器 / 附件按钮 | **显示** | **隐藏**（它们在输入框 seat 内） | seat 声明 `ui-conversation/src/client/apply.ts:384-391`；注册处 `ui-model-selection/src/client/index.ts:181`、`ui-permission-presets/src/client/index.ts:167`、`ui-attachment/src/client/index.ts:16` |
| composer 阻断（输入框变 inert + 原因） | 不提 | **提**（`blocks.set(id,{reason})`） | `official-session.tsx:883, 959-971`；消费 `ConversationContent.tsx:38, 139, 149-153` |
| 插件自己的接管 composer + 状态行 | 隐藏 | **显示** | `SyncPanel.tsx:698`（`composerOwned` 为真） |
| 插件自己的「加载更早的消息」行 | 显示（条件 `state.transcript?.hasMore`） | 显示 | `SyncPanel.tsx:619-630` |
| 评分 / 分支按钮 | **隐藏** | **隐藏**（对所有路线） | `sync.module.css:1526-1535`（按 aria-label 匹配） |
| 手绘 transcript | 不画 | 不画 | `SyncPanel.tsx:605-637` |
| 手绘面板整体 | 不画 | 不画 | 只在无路线时（`SyncPanel.tsx:526-531` 的 `shipped` 为 undefined） |

**shipped 侧自己怎么决定「有没有更早」**：`ui-chat/src/client/chat/ChatView.tsx:241-247`（`hasMore` 才渲染 `chat.loadOlder`＝`加载更早`，`ui-chat/src/client/locale.ts:88`）。插件喂窗口时**恒传 `hasMore=false`**（`official-session.tsx:532-536`），所以 shipped 控件永不出现，只有插件自己的行出现。

---

## 1. 差异表

| # | 差异 | 插件证据 (file:line) | shipped 证据 (file:line) | 用户可见? | 冒充本地会话的危害 |
| --- | --- | --- | --- | --- | --- |
| 1 | 控制台是**自己的顶层主面板** `main` key `session-sync`（+ 自己的 `sidebar.panellist` 行） | `client/index.ts:46, 96-122` | shipped 会话页是 `main` key `conversation`（`ui-conversation/src/client/apply.ts:494-506`）；`ui-sidebar/src/client/index.ts` **不注册任何 panellist 行**，唯一 shipped 行是插件管理器（`ui-plugin-manager/src/client/index.ts:100-106`, order 0） | 是（侧栏多一行+中心面板名） | **高** |
| 2 | 会话头部是**另一套 DOM**：`<h2>` 标题 + 机器名 + 自造徽章 | `SyncPanel.tsx:537-579`；`.viewTitle`/`.viewMachine` `sync.module.css:1468-1486` | shipped 是面包屑 `<nav class=crumbs>` + `titleCluster` + `headerActions` + `headerUtilities` + `headerCorner`（`ui-conversation/.../ConversationSession.tsx:69-139`） | 是 | **高** |
| 3 | 头部盒尺寸不同：P `padding:10px 20px 0` / `min-height:30px` / `border-bottom:.5px l3`；S `min-height:76px` / `padding:10px 28px 0 20px` / 同色 l3 | `sync.module.css:1064-1078` | `ui-conversation/src/client/skeleton/ConversationRoot.module.css:15-23, 64-75` | 是（76px 是侧栏 tab 条对齐值） | 中 |
| 4 | 会话列表比 shipped 浏览器**多一级「机器」**（机器→cwd→会话） | `SyncPanel.tsx:254-333`；`buildTree` `SyncPanel.tsx:1396-1426` | shipped 分层只有 workspace→session（`ui-workspace/src/client/rows/WorkspaceBrowser.tsx:387-576`，缩进 `--dsh-workspace-indent: depth*12px`，`WorkspaceBrowser.tsx:434`）；**没有机器概念** | 是 | **高** |
| 5 | 会话行按 `.rowTime` 显示「N 个会话」；相对时间另算 | `machineTrailing` `SyncPanel.tsx:1372-1377`；`rowTime` `sync.module.css:424-428` | shipped 行尾是 `.time`（`Rows.module.css:221-226`，`font-size:10px`）+ hover 才出的 row actions | 是 | 中 |
| 6 | 列表行**没有**重命名/归档/置顶/右键菜单/拖拽排序 | 行就是 `<button role=treeitem>`：`SyncPanel.tsx:296-326, 382-402` | `ui-workspace/src/client/rows/Rows.module.css:274-303`（`.rowActions` hover）、`:228-256`（schedule/pin 指示）；归档过滤菜单 `WorkspaceBrowser.tsx:119-132` | 是 | **高** |
| 7 | 没有视图选项菜单（分组/排序/归档过滤） | 无对应代码（**插件自造，无 shipped counterpart**） | `WorkspaceBrowser.tsx:105-168`（`IconSlidersTwoOutlineRegular`，`min-width:200px` `WorkspaceBrowser.module.css:39-43`） | 是 | **高** |
| 8 | 没有 shipped 的「再显示 5 条」溢出按钮（`COLLAPSED_SESSION_LIMIT = 5`） | 无 | `WorkspaceBrowser.tsx:53-69, 552-573`；`WorkspaceBrowser.module.css:494-513` | 是 | 中 |
| 9 | 空态/加载态文案不同：P「还没有机器连接…」/「本机不是同步服务器…」/「读取中…」；S 用骨架行 | `locales.ts:63-64, 37`；`SyncPanel.tsx:244-253` | 骨架 `WorkspaceBrowser.tsx:774-788`（`skeletonRow/skeletonDot/skeletonBar`）；空态 `t('empty.none')` `WorkspaceBrowser.tsx:589-591` | 是 | 中 |
| 10 | 列表容器间距/内边距不同：P `gap:3px; padding:0 6px 8px; margin-right:2px`；S `padding-left:4px` + 右内边距算法 + 行间 4px | `sync.module.css:269-278` | `WorkspaceBrowser.module.css:353-375`（`--dsh-session-list-scrollbar-width:5px` `:1-3`） | 是（细微） | 低 |
| 11 | 会话行 32px / 项目行 34px / 半径 8px / 缩进 24px、40px —— 与 shipped **一致**（唯一完全对齐的一组） | `sync.module.css:328-353, 368-374` | `Rows.module.css:1-8, 94-108` | — | 低（这是像的地方） |
| 12 | 折叠箭头用 `IconTriangleRightFillRegular` + `.arrowOpen{rotate 90deg}` —— 同 shipped | `SyncPanel.tsx:397-399`；`sync.module.css:403-409` | `Rows.module.css:148-154` | 否 | 低 |
| 13 | 标签条：对话/轨迹 两枚**硬编码**按钮，标签来自插件字典 | `SyncPanel.tsx:582-601`；`locales.ts:91-92` | shipped 由 View 注册表派生：`conversation.view` id `chat` label `t('view.chat')`（`ui-chat/src/client/apply.ts:146-151`），id `trajectory` label `t('view.trajectory')`（`ui-trajectory/src/client/index.ts:79-84`），标签文案 `ui-chat/src/client/locale.ts:68`、`ui-trajectory/src/client/locales.ts:8` —— **值相同**（对话/轨迹） | 几乎不可见（当前只有 2 个 View） | 中（第三方注册 View 时漏 tab） |
| 14 | 标签条 CSS **逐值同源**：`gap:36px; margin-top:10px; padding-left:8px` / `13px/16px wt500` / 2px 下划线 / 选中色 business-primary | `sync.module.css:1086-1126` | `ConversationRoot.module.css:193-238` | 否 | 低 |
| 15 | 但 P 多一条 `:focus-visible` 蓝环，shipped 无 | `sync.module.css:1128-1131` | `ConversationRoot.module.css:206-238`（无 focus 规则） | 几乎不可见 | 低 |
| 16 | 头部右簇是**只读**芯片（模型/预设/子代理）+ 14px 环；S 这几个座位是**选择器**，且在 composer bar 内而非头部 | `ChromeChips` `SyncPanel.tsx:754-790`；`ContextRing` `:797-844`；`chromeChip` `sync.module.css:1143-1158`（`font: var(--dsw-font-xxxs-11)`＝**11px/14px**，`--dsw-font-xxxs-11` 定义 `ui-theme/src/styles/gradient-shadow-text.css:257`） | `conversation.input.model` / `conversation.input.permission` 座位（`ui-conversation/apply.ts:386-390`） | 是 | 中 |
| 17 | 自造路线徽章 `原件 · <route> · <first>–<last>`（灰底 4px 圆角 12px） | `SyncPanel.tsx:570-575`；`locales.ts:72`；`sync.module.css:449-458` | **无 shipped counterpart**（`paneRouteHint` 也是自造，`locales.ts:73`） | 是 | **高**（一眼可辨） |
| 18 | 自造 `缺 N 条` 红字徽章（列表行 + 头部各一处） | `SyncPanel.tsx:292-294, 317-319, 565-569`；`locales.ts:68`；`sync.module.css:439-445` | **无 shipped counterpart** | 是 | **高** |
| 19 | 手绘 composer 卡：`max-width: calc(min(920px,100%) + 32px)` / `radius 22px` / `padding-top:8px` / `--dsw-elevation-soft` / `--dsw-specific-input-major` —— 与 S 的 `.card` **同值** | `sync.module.css:1866-1880` | `ui-conversation/src/client/skeleton/InputBar.module.css:45-69` | 否 | 低 |
| 20 | 但卡内是**纯 `<textarea rows=2>`**（`min-height:44px; max-height:200px`），S 是 contenteditable 富文本（`min-height:36px`，上限走 `--dsh-composer-text-max-height:336px`） | `SyncPanel.tsx:704-716`；`sync.module.css:1882-1894` | `ConversationContent.tsx:166-180`、`ConversationRoot.module.css:346-358`、`InputBar.module.css:169-177` | 是 | 中 |
| 21 | 卡内工具行只有「发送到 <机器名>」+ 投递状态 + 34px 圆发送键；S 工具行是 `+` / 模型 / 权限 / activity / 右侧座位 | `SyncPanel.tsx:717-736`；`.sendButton` `sync.module.css:1934-1946`（34px，同 S `.primary` 34px `InputBar.module.css:377`） | `ui-conversation/apply.ts:380-393`（子座位清单） | 是（**仅 feed 路线**：adopt 路线上 S 控件在） | **高** |
| 22 | 底部状态行是**纯文本** `N 轮 · M 步 · K tok/s · …`，居中、11px、tabular-nums；S 是图标胶囊（14px svg、`radius 24px`、可点开统计弹窗） | `StatusRow` `SyncPanel.tsx:847-864`；`locales.ts:104-107`；`sync.module.css:1232-1243` | `StatsPills.tsx:137-184`（`stats.counts`＝`{turns} 轮 {steps} 步`，`ui-chat/src/client/locale.ts:78`）+ `StatsPills.module.css:12-54` | 是（仅 feed 路线） | 中 |
| 23 | 自造「加载更早的消息」胶囊按钮；S 用 `加载更早`（文案不同） | `SyncPanel.tsx:619-630, 645-656`；`locales.ts:69`；`sync.module.css:467-491`（`padding:4px 12px; radius 999px`） | `ChatView.tsx:241-247`；`ui-chat/src/client/locale.ts:88` | 是（adopt 路线也在） | 中 |
| 24 | 「回到底部」用的 aria-label 是 `滚动到底部`；S 是 `回到底部` | `locales.ts:80`；`SyncPanel.tsx:684` | `ui-chat/src/client/locale.ts:89` | 是（hover/AT） | 低 |
| 25 | 空 transcript 显示插件文案；S 什么都不画 | `SyncPanel.tsx:657-662`；`locales.ts:152-154` | `ChatView.tsx:221-247`（无空态节点） | 是 | 中 |
| 26 | 手绘 hero（鱼 + `探索未至之境` + `预览版` 徽章）—— 文案与 S 相同，但没有 S 的工作区选择器，也没有 hover 游动动画（自述） | `HeroPlaceholder` `SyncPanel.tsx:889-905`；`locales.ts:88-89`；`sync.module.css:507-578` | `ui-conversation/src/client/locale.ts:73-75`（`hero.headline`/`hero.preview`/`hero.chooseWorkspace`）；`ConversationContent.tsx:104-128, 159-160` | 是（仅无路线构建） | 中 |
| 27 | 轨迹页是**重建件**：工具条 32px、时间线 50px + 44px 槽、表头/行 30px、事件列 122px —— 数字全部对得上 | `TrajectoryView.tsx:1-17`；`sync.module.css:594-607, 706-712, 1245-1252` | `ui-trajectory/src/client/views.module.css:3`（`--dsh-trajectory-toolbar-height:32px`）、`TrajectoryTimeline.module.css:16-17`、`TrajectoryTable.module.css:37,49,116,132,435` | 是（细节） | 中 |
| 28 | 轨迹页 `30 次 × 3 秒` 分页预算、`加载更早` 常显等行为是插件自己的 | `SyncPanel.tsx:619-630`；`PROGRESS.md:281-286` 自述 | `ChatView.tsx:241-247` | 是 | 低 |
| 29 | shipped 的「用时 3 秒 ⌄」回合折叠、步骤分组、工具卡：**全部来自 shipped**（不是插件画的） | 无插件实现（`PROGRESS.md:415-419` 明确说明跟随服务器设置） | `ui-chat/src/client/locale.ts:64-67`；`TurnProcessNodeView`/`TurnTailNodeView` | — | 低 |
| 30 | shipped 的轮次导航轨（TurnNavigator）在 feed 路线上会一起出现；插件没有为它做任何屏蔽 | 无相关代码 | `ChatView.tsx:223-231` | 是 | 低 |

---

## 2. 明确的 bug / 字典错配（附精确 key 与两侧取值）

1. **`searchPaths`（zh）被写成 `·` 而非 `路`** —— 这是本次审计里最硬的一条。
   - P `locales.ts:230`：`searchPaths: '{shown} 个·径'` —— 码位实测 `4E2A 00B7 5F84`（`个` **U+00B7 MIDDLE DOT** `径`）。
   - P `locales.ts:231`：`searchPathsTruncated: '显示 {shown} / 共 {total} 个·径'` —— 同样 `00B7`。
   - S `ui-conversation/src/client/locales.ts:319-320`：`'{shown} 个路径'` / `'显示 {shown} / 共 {total} 个路径'`（`8DEF`＝路）。
   - 结论：**错字**，中文字符被吞成了间隔号。用户会看到「3 个·径」。
2. **同一对键还有一个非错字但不等值的差异**：P 在**未截断**时也输出 `显示 {shown} / 共 {total} …`（`locales.ts:231` 被无条件使用），S 未截断时只输出 `{shown} 个路径`（S 的两分支在 `SearchBlock.tsx:118-133` 由 `truncated` 选择）。P 的 `SearchBlock` 调用点只有一处、无 truncated 分派。
3. **`SyncPanel.tsx:240` 的关闭按钮字形错了**：JSX 文本是 `脳`（U+8133，日文「脑」），应为 `×`（U+00D7）。这是镜像重置提示条的关闭键，用户可见。
4. **两处注释被 GBK 往返损坏**（`U+FFFD` + 乱码，且吞掉了原文）：
   - `SyncPanel.tsx:5`：`… the Sessions themselves 閳?the shape`
   - `SyncPanel.tsx:197`：`… keeps the talk column 閳?  // and therefore its back button on a narrow window 閳?reachable.` —— 后半句的换行被吞，注释结构已坏。
   （`PROGRESS.md:356` 自述这类事故已用 `scripts/check-encoding.mjs` 抓过；见第 5 条。）
5. **`check-encoding.mjs` 抓不到上面 1/3/4 三类**：脚本只查 `U+8DEF 路`、`U+9225`、`U+9239`、`U+950F`、`U+9227`（`scripts/check-encoding.mjs:11`），且只扫 `src`、`client`、`lib`（`:12`）。实测 `node scripts/check-encoding.mjs` → `mojibake check: clean`，退出码 0，而仓库里同时存在 `U+00B7`、`U+FFFD`、`U+8133` 的损坏。**检查器有盲区，别把它当"编码干净"的证据。**
6. **`SyncPanel.tsx:549-556` JSX 粘连**：`/>          <Button`（前一个 Button 的闭合与下一个开标签同一行，中间是纯空格）。渲染无影响，是编辑事故的残留。
7. **路线徽章名不副实**：`SyncPanel.tsx:570-575` 只要 `official.supported` 为真就渲染「原件 · …」，但同一渲染里 `shipped` 可能为 `undefined`（`:526-531`：`renderSlot`/`SessionProvider` 缺失，或 `state.transcript === undefined`），此时面板画的其实是手绘 transcript。徽章在说"这是 DSH 原件"而画面上不是。`paneRouteHint`（`locales.ts:73`）同样断言"这个面板用的是 DSH 自己的会话页"。
8. **`feedLive` 造的 transient 行缺契约字段**：`official-session.tsx:740-761` 的 `data` 只有 `{attemptId, turn, step, chunk}` 里前三项的 `attemptId` + `chunk`，**没有顶层 `turn`/`step`**；契约要求 `AssistantLiveChunkEvent.data = { attemptId, turn, step, chunk }`（`packages/api/session-controller/src/client/contract/events.ts:7-17`）。注：走 `adopt`/`scope` 时 `this.handle !== undefined` **不会**进这条分支（`:663-672`），所以只有"有 binding 但无 handle"的情形才可能露出——当前建成路线下这条分支基本不可达，属于**未被执行过的代码路径**。
9. **未使用的字典键**（`locales.ts`）：`ledgerEmpty:93`、`ledgerEvent:94`、`ledgerContent:95`、`ledgerTurn:96`、`chromeContext:97`、`messageCopy` 之外还有 `tjDuration:122`…`tjClose:149` 中未被 `TrajectoryView.tsx` 引用的若干键、`toolArguments:167`、`toolResult:155`、`back:151`、`openSession:74`（仅在 `aria-label` 拼接里用到，见 `SyncPanel.tsx:305-307`）。定位方式：`grep -n "t('<key>')" src/client/*.tsx`。这不是用户可见缺陷，但会掩盖真正的缺键。
10. **`terminalNoOutput` 两侧形态不一致**：zh `'（无输出）'`（`locales.ts:248`）带全角括号，en `'No output'`（`:528`）不带；shipped 的对应键 `'terminal.noOutput'` 是 `'无输出'`（`ui-conversation/.../locales.ts:353`，**无括号**）。即：不改 key，但 zh 抄多了一对括号。
11. **`toolLabelSubagent` 与 shipped 的措辞不同**：P `'子代理'`（`locales.ts:160`）vs S `'tool.title.subagent' = '创建代理'`（`ui-conversation/.../locales.ts:141`）。手绘工具行会显示"子代理"，shipped 卡片显示"创建代理"。
12. **同一概念两套词**：模型重试行 P 用 `执行中`（`rowRunning:254`）而 S 用 `运行中`（`ui-conversation/.../locales.ts:285` `'row.running'`）；终端块 P 用 `执行中`（`terminalRunning:245`）而 S 用 `运行中`（`:350` `'terminal.running'`）。

**未发现**的错配（已逐条核对，写在这里是为了避免被误报）：`toolTitlePwsh/Bash/Grep/Glob/WebSearch/WebFetch/ReadImage`（`locales.ts:211-217`）与 S `ui-conversation/.../locales.ts:303-308` **完全一致**；`tabChat/tabTrajectory`（`locales.ts:91-92`）与 S `locale.ts:68` / `locales.ts:8` 一致；`heroHeadline/heroPreview`（`:88-89`）与 S `:73-74` 一致；`presetDangerFullAccess`（`:103`）与 S 的 `完全权限` 一致。

---

## 3. 「逐字复制」的 CSS 现在是否还等于 checkout

复制清单在 `SyncPanel.tsx:102-107`。逐个 SHA/行级比对结果：

| 文件 | 结果 |
| --- | --- |
| `accessibility.module.css` | **逐字节相同**（137/137 字节，SHA256 相等）—— 唯一还成立的复制 |
| `MessageIconActions.module.css` | **已过期**（S 3287 字节 / P 3204 字节） |
| `ReasoningRow.module.css` | **已过期**（S 2353 / P 2217） |
| `ToolRow.module.css` | **已过期**（S 347 行 / P 357 行） |
| `TurnUsagePanel.module.css` | **已过期**（S 1988 / P 2119） |
| `stat-dialog.module.css` | **已过期**（只差 1 行，但正是毛玻璃那行） |

具体丢失/漂移（左=P，右=S）：

**MessageIconActions**（S: `ui-chat/src/client/chat/MessageIconActions.module.css`）
- 字号：P `font-size: var(--dsh-content-font-size-secondary, 13px)` vs S `font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px)` → 助手尾部时钟**大 1px**。
- 颜色：P `color: var(--dsw-alias-label-tertiary)` vs S `color: inherit`。
- **S 有 `.endInfo`（`gap:8px; min-width:0; margin-left:8px; display:inline-flex; align-items:center`），P 完全没有这个类**。
- S 有 `.actions[data-clock='end'] .action svg { width/height: calc(17px + var(--dsh-content-font-delta,0px)) }` —— P 无（P 的图标固定 15px，见 `sync.module.css:1650` 注释）。
- S 的 hover 揭示规则用了 `:has(...)` 组合（`[data-chat-flow-kind='user']:has(~ …)`），P 是旧版简化式。

**ReasoningRow**（S: `ui-chat/src/client/chat/ReasoningRow.module.css`）
- **S 的预览门控整块缺失**：`.root:not([data-preview]) .separator, .root:not([data-preview]) .summary { display:none }`、`.summary[data-streaming] { mask-image: linear-gradient(to right, black calc(100% - 48px), transparent) }`。P 用自造属性名 `data-follow-end`（`sync.module.css` 的 `.summary[data-follow-end]`，见 diff）。
- **S 的粘性折叠头缺失**：`.root[data-expanded] [data-open] [data-disclosure-row] { position:sticky; top:0; z-index:1; background: var(--dsw-alias-bg-base) }` —— P 无，展开长思考体时折叠键会滚出视野（S 的注释正说明这条是为它加的）。
- S `.summary[data-streaming] .summaryText { min-width: 0 }` 也缺。

**ToolRow**（S: `ui-tool/src/client/tool/components/ToolRow.module.css`）
- **S 的 hover 变色整组缺失**：S 有 6 处 `transition: color 100ms ease`、`.row:hover .title, .row:hover .summary:not(.errorSummary):not(.stoppedSummary), .row:hover .summarySuffix, .row:hover .fileLink { … }`；P 全无。
- **S 的 `.stoppedSummary { color: var(--dsw-alias-state-warn-label) }` 缺失**：被中断的工具行在 P 上没有警告色。P 的 `ToolCallRow` 仍在用 `toolCss.errorSummary`/`toolCss.summary`（`SyncPanel.tsx:1257`），即它知道自己需要 `stoppedSummary` 却没用。
- S 的 `.detailsBodyWrap{position:relative}` + `.detailsBodyWrap .inspectButton{top:12px;right:12px;margin:0;color:var(--dsw-alias-label-primary)}` 缺失（inspect 按钮错位）。
- 反向：P 多出 `dsh-tool-row-sweep` 动画、`.codeBody` 字号重绑 —— 这些是 P 自加（S 的同类动画在 `ReasoningRow` 那边），属有意偏离，但意味着"逐字复制"这句话只对旧版本成立。

**TurnUsagePanel**：P `font-size: var(--dsh-content-font-size-secondary, 13px)` + `color: var(--dsw-alias-label-secondary)` vs S `calc(… - 1px)` + `color: var(--dsw-alias-label-tertiary)` → 本轮用量胶囊**大 1px、颜色更重**。

**stat-dialog**：P 缺 `backdrop-filter: var(--dsw-menu-backdrop-filter)`（S `ui-chat/src/client/chat/stat-dialog.module.css`）→ 统计弹窗在 P 上不毛玻璃。

**结论**：`SyncPanel.tsx:102-104` 的注释（"a future upstream change is re-copied rather than re-derived"）在 `0.1.7-rc.1` 上**已经不成立**——6 份复制里 5 份漂移，且都是"P 少、S 多"的方向，说明复制发生在更早的 DSH 版本。文档与代码分歧点：`README.md`（"Nothing user-visible is invented"）与 `PROGRESS.md:415-419`（"本来就跟随服务器 DSH 设置"）都按"与 shipped 一致"叙述，但上面这些行级差异说明一致性只到"看起来像"，不是"同源"。

---

## 4. 一眼分辨「镜像会话」与「本地会话」（按显眼程度排序）

1. **列表里多一级「机器名」行**（`SyncPanel.tsx:254-268`，`IconGlobeOutlineRegular` `:394`）——shipped 树里没有机器这一层（`WorkspaceBrowser.tsx:387` 只 workspace→session）。屏幕上有 `DESKTOP-M1EERFC` 这种行就等于自报身份。
2. **头部那枚 `原件 · scope · 9574–10252` 徽章**（`SyncPanel.tsx:570-575`，灰底小胶囊）——shipped 头部绝无此物。
3. **`缺 N 条` 红字**（列表行 `SyncPanel.tsx:317-319`、头部 `:565-569`）——shipped 没有这个状态。
4. **列表上方那行角色/链路状态**（`Client · 已连接到服务器 · 正在发布`，`SyncPanel.tsx:221-225` + `roleLine` `:1346-1369`）——shipped 列表区没有这类系统状态行。
5. **composer 里是「发送到 <机器名>」而不是模型/权限选择器**（`SyncPanel.tsx:717-736`）——只在 feed 路线出现；一旦出现就极其明显。
6. **底部状态行没有图标胶囊**（`N 轮 · M 步 · K tok/s` 纯文本，`SyncPanel.tsx:859-862`）——shipped 是两枚带 svg 的圆角胶囊（`StatsPills.tsx:164-184`）。
7. **头部没有面包屑**（本地子会话显示 `父 / 子`），只有 `<h2>` 标题 + 机器名（`SyncPanel.tsx:557-558`）。
8. **侧栏多一行地球行**（`PanelIcon.tsx:26`）+ 中心面板 key 是 `session-sync`（`client/index.ts:46`）——注意 URL/面板名不写入地址栏，所以这条主要靠侧栏。
9. **搜索框 placeholder 文案** `搜索会话`（`locales.ts:78`）vs shipped 的 `search.placeholder`。
10. **「加载更早的消息」胶囊 + 常显**（`locales.ts:69`）vs shipped 的 `加载更早`，以及 shipped 自己的那条永不出现（因为插件恒传 `hasMore=false`，`official-session.tsx:532-536`）。
11. **空列表文案** `这台机器还没有发布会话。`（`locales.ts:85`）——shipped 是 `empty.none`。
12. 最不显眼但要命的一条：**`adopt` 路线上 composer 是 shipped 的**，所以上面第 5、6 条会消失；此时只剩 1–4、7–11 这些"结构性"线索。若把列表列收起（`listHide`，`SyncPanel.tsx:542-548`），则连 1、3、4 都看不见，只剩头部徽章与缺项的面包屑——**这正是该插件最容易"混过去"的状态**。

---

## 5. 方法学备注（供复核）

- 全部数字取自源文件逐行读取；CSS 字节级/SHA256 比对用 `Get-FileHash` + `Compare-Object`，未跑任何构建。
- `official-session.tsx` 的路线判定、`composerOwned`、`hasMore=false`、`phase:'active', hero:false` 均为源码直读；`retainAgentScope` 在 rc.1 存在这一点已在 `packages/api/session-controller/src/client/sessions/service.ts:487` 核实（不在 `ui-*` 下，glob `packages/client/**` 搜不到，容易误判为不存在）。
- 未修改任何文件；未执行构建。唯一执行的命令是只读的 `node scripts/check-encoding.mjs`。
