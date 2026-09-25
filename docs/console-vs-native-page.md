# 服务端同步会话页 vs DSH 原版会话页：差异清单与「伪装成本地会话」评估

> 判据：**同一台机器、同一个浏览器、同一个会话**并排看——左窗口是本机 DSH 的原版会话页
> （`127.0.0.1:3080`，源码运行 `dsh-v0.1.7-rc.1`），右窗口是服务端控制台
> （`dsh.c-zy.cc`，DSH `0.1.7-rc.2`）里那条**同一会话的镜像**。两端都实测过，不是从文档推断。
> 每条差异都给了证据：截图现象 + 代码位置（`文件:行`）。

## 0. 结论

**正文已经是原件，外壳是自己画的。** 控制台当前走 `scope` 路线，会话正文由 DSH 自己的
`conversation.content` 渲染器画出（`official-session.tsx:1016-1025`），所以**行级**（工具行、
思考行、用户气泡、操作行、用量/用时药丸）与原版一致——并排看是同一套词汇、同一套样式，代码也说明
它**就是**那个渲染器（本次是相邻时间点的对照，没做逐行比对，见 §7）。
认得出来是镜像的地方**全部在页面外壳**，而且最刺眼的那条是个**布局 bug**：

| 区域 | 伪装成度 | 一眼可辨？ |
| --- | --- | --- |
| 对话正文（行、折叠、卡片） | **高**——就是原件 | 否（除非看实时行） |
| 面板标题行（header） | **低**——标题被挤成 0 宽，位置被机器名占据 | **是** |
| 输入区（composer） | **低**——插件自己的接管输入框 | **是** |
| 轨迹 tab | **低**——是"日志账本"，不是原版那张视图 | **是** |
| 左侧列表 | **中**——行词汇对，行为不同（无相对时间 / 无 hover 菜单 / 多一层机器） | 半 |
| 状态行（footer） | **中**——少一个上下文环、分隔符不同 | 半 |
| shell 集成（左栏工作区、标签页标题） | **低**——会话不在 shell 自己的列表里 | **是** |

> **先分清两条路，否则这份清单会被读错。** 服务端今天跑 `0.1.7-rc.2`，控制台走 **`scope`** 路线，
> 于是**对话正文就是 shipped 渲染器本身**——行级**没有**差异，只有外壳是插件画的。
> 而在既没有 `adopt` 也没有 `retainAgentScope` 的构建上，控制台会退回**手绘面板**
> （`SyncPanel.tsx:638-692`），那一类差异**连正文都会漂移**，单列在 §2.9，
> 细节与逐条 `文件:行` 见两份原始审计：`docs/audit-pane-body.md`、`docs/audit-pane-chrome.md`。
> 本文 §2.1–2.8 说的都是**今天线上能看到**的东西。

一句话给结论：**把这页截图发给一个 DSH 用户，他第一眼会先看到标题不见了、然后看到输入框写着
「在服务器侧接管续聊」**——这两条决定了他会不会认为这是本机会话。其余都是第二眼的事。

> **数据层是另一个答案，而且那个答案是"像"**：镜像里的事件与 DSH 自己的日志**逐条相同**
> （本次实测 829/829，连 `surfaceOp` 都一致，见 §7）。所以问题不在"内容对不对"，
> 而在"外壳像不像"和"身份像不像"（镜像会话没有 catalog 行、不在工作区列表里、header 也没有可读出口）。

## 1. 现场事实（本轮实测，决定了"能伪装到哪一步"）

| 事实 | 证据 |
| --- | --- |
| 服务端跑 `@deepseek-ai/dsh@0.1.7-rc.2`（`npx` 缓存目录 `4f4f47d9854f3c73`），**未打 adopt 补丁** | `systemctl cat dsh-web` 的 `ExecStart`；该目录 `lib/client.js` 里 `AdoptedSessionHandle` 计数 **0** |
| 打过补丁的那份是 `0.1.7-alpha.2`（缓存目录 `d460afef2690c19d`，`AdoptedSessionHandle` ×2），**已随版本失效** | 同上；这正是 PROGRESS「版本一变补丁静默消失」那条预告 |
| 补丁脚本只认 alpha.2（除非显式覆写版本） | `patches/install-dsh-adopt.sh:23` `TARGET_VERSION=${DSH_SESSION_CONTROLLER_VERSION:-0.1.7-alpha.2}` |
| 于是控制台落到 **`scope`** 路线（有 `retainAgentScope`，没有 `adopt`） | 头部徽标实测 `原件 · scope · …`；`official-session.tsx:1016` `routeOf()` 的优先级 |
| `scope` 路线的代价：**shipped 输入框被摘掉**，换成插件的接管输入框 | `official-session.tsx:850` `composerOwned = route !== 'adopt'`；`SyncPanel.tsx:631` 给 pane 加 `drivesWindow` |
| 本机是**源站**（client），服务端是 server；对照期间发布列表被改成**只发布本会话**（`session-e08471af-087a-4807-9899-67705bdd57ea`，即"服务端与 dsh 会话页面差异伪装"这条），镜像 `0–441` 实时跟进 | 本机 `~/.dsh/dsh-session-sync.json`（对照开始时是 `d4b49737` + `f6ba2b3b` 两条，中途变成这一条）；控制台标题行与树行实测 |

并排窗口：两个 Chrome 窗口各 974×1047（1920 屏的一半），控制台会话面板实测宽 **605px**
（左栏 0–50 = DSH 图标轨，65–330 = 插件的机器树，360–965 = 会话面板）。

## 2. 差异清单（按「一眼可辨」排序）

### 2.1 【高·bug】会话标题在面板标题行里被挤成 0 宽度

- **现象**：控制台标题行是 `[▤] DESKTOP-M1EERFC ◯进行中 [原件·scope·0–441] (deepseek-flash·high) …` ——
  **原版该放会话标题的位置什么都没有**（实测截图里 `▤` 与机器名之间是空的）。
- **可证伪的验证**：点标题行最左的「收起会话列表」按钮，让面板拿到整宽 → 标题立刻出现：
  `服务端与 dsh 会话页面差异伪装  DESKTOP-M1EERFC  ◯进行中 …`。**所以标题数据是有的，是被布局挤掉的**。
- **根因（代码）**：这一行是 `display:flex; gap:8px` 且**不换行**，其中唯一可收缩的项就是标题
  （`sync.module.css:1468` `.viewTitle{flex:0 1 auto; min-width:0; overflow:hidden}`），
  而机器名（`:1478 flex:none`）、`进行中`、`缺 N 条`（`:439`）、`原件 · scope · 范围`（`:449`）、
  右侧 chip 簇（`SyncPanel.tsx:754`）全是刚性宽度。按截图量出的各段宽度相加，刚性项合计约 **700px** >
  面板的 605px ⇒ 标题被压到 0。
- **影响**：这是"这是不是一个本机会话"的第一眼判据，而且**它在窄窗口下必然发生**（用户把窗口贴半边就会看到）。

### 2.2 【高】标题行上多出来的八样东西

原版标题行（实测）：`服务端与 dsh 会话页面差异伪装` · `◯ 2 个子智能体 ⌄` · `⟳ 标准模式` · 右侧三个槽位图标。

控制台标题行（实测，面板整宽时）：`[▤] 标题 DESKTOP-M1EERFC ◯进行中 [原件 · scope · 0–441] (deepseek-flash · high) (完全权限) (子代理 2) ◯环`。

| 多出来的 | 代码 | 原版有没有 |
| --- | --- | --- |
| **机器名** `DESKTOP-M1EERFC`（占了标题的位置） | `SyncPanel.tsx:558` | 没有（原版标题行只有会话的 breadcrumb） |
| **`进行中`** 文字 + 状态点 | `SyncPanel.tsx:559-563` | 没有（运行态在原版是行内状态点，不在标题行） |
| **`原件 · scope · 0–441`** 路线徽标 | `SyncPanel.tsx:570-575`、`locales.ts:72` | 没有（这是插件的自述） |
| **`缺 N 条`** 缺口徽标 | `SyncPanel.tsx:565-569`、`locales.ts:68` | 没有 |
| **`[▤]` 收起列表按钮** | `SyncPanel.tsx:542` | 没有（原版那是 shell 侧栏的控件） |
| **模型 · 推理档** `deepseek-flash · high` | `SyncPanel.tsx:769-776` | 原版把模型选择放在**输入框里**，且写的是显示名 `DeepSeek-V41-Flash High` |
| **权限** `完全权限` | `SyncPanel.tsx:777-781` | 原版在输入框里 |
| **`子代理 2`** | `SyncPanel.tsx:782-786`、`locales.ts:100` | 原版是 `2 个子智能体 ⌄`（下拉可打开子会话） |

反过来，**原版有而控制台没有的**：标题行右侧的 `conversation.session.header.actions / utilities / corner`
三个槽位（`ui-conversation/src/client/skeleton/ConversationSession.tsx:127-138`）—— 打开方式、任务列表、
计划、右侧栏展开这些 shipped 贡献全都落不进来。

再补两条**结构性**差异（源码值，不是肉眼判断）：

- **头部盒尺寸不同**：控制台 `.viewHeader{padding:10px 20px 0}` + 标题行 `min-height:30px`
  （`sync.module.css:1064-1078`）；原版 `ConversationRoot.module.css:15-23,64-75` 是
  `min-height:76px` + `padding:10px 28px 0 20px`（76px 是侧栏 tab 条的对齐值）。并排看会差约 10px。
- **控制台是"另一块主面板"**：它注册的是 `main` 槽的 `key: session-sync`（`client/index.ts:105-122`），
  **外加**一条 `sidebar.panellist` 行（`:96-103`，实测就是左栏那个地球图标）；原版会话页是 `main` 槽的
  `key: conversation`，而 `ui-sidebar` **自己不注册任何 panellist 行**（唯一一条 shipped 行来自插件管理器）。
  这就是"左栏多一行地球"和"会话不在工作区列表里"的结构原因——不是样式问题，是它根本不是同一个面板。

### 2.3 【高】输入区：插件自己的接管输入框

- 控制台：一个大空卡片，占位文字 `在服务器侧接管续聊…`，底部一行 `发送到 DESKTOP-M1EERFC`，右侧圆形发送键
  （`locales.ts:170-171`）。
- 原版：`发消息或创建任务，/ 调用指令，@ 文件或对话` + `+ 附件` + `⚠ 完全权限 ⌄` + 相机 + `DeepSeek-V41-Flash High ⌄`，
  上方还有一条 `☰ 任务 1 进行中 · 4 待处理`。
- 差别不只是文案：接管输入框**没有**附件、slash 指令、`@` 文件/会话引用、模型切换、权限切换、任务条。
  这是 `scope`/`address` 路线的必然结果（把 prompt 送回源站是插件自己的通道，而 shipped 输入框会去问一个
  从没听说过这个会话的 Host）；只有 `adopt` 路线能把动词交给 shipped 输入框。
- **顺带**：卡片高度也不同（接管框是空的多行卡片，约 100px；原版是单行卡片 + 工具行）。

### 2.4 【高】「轨迹」tab 是另一种模型，不是原版那张视图

同一个会话，同一个 tab，两张完全不同的表：

| | 原版（`ui-trajectory`） | 控制台（`TrajectoryView.tsx`） |
| --- | --- | --- |
| 行 | `工具 grep {…} → Found 9 matches …`、`助手 Confirmed: …` | `事件 \| 内容` 两列：`策略 permission: danger-full-access`、`其他 subagent/model-selection-policy`、`轮次 #1`、`步骤 #1/1`、`系统 You are an AI agent powered by …`、`用户 检查服务端…`、`上下文 deepseek-official/deepseek-flash · high · 46 tools` |
| 左侧栏 | 竖直标签 `输入模型工具` | 竖直标签 `工具` |
| `kind` 词表 | **闭集 8 个**：系统 / 用户 / 上下文 / 已压缩 / 消息 / 助手 / 工具 / 子工具（`ui-trajectory/src/client/locales.ts:22-30`），另配回合/分组表头（`TrajectoryTurnHeader.tsx`、`TrajectoryGroupHeader.tsx`） | 自己一套：**策略 / 其他 / 轮次 / 步骤** + 借用的 系统 / 用户 / 上下文 |

**别把这条说过头**：`系统`/`用户`/`上下文` 原版也有（原版甚至有"系统提示词"子页），所以不是"控制台多暴露了
内部信息"。真正的差异是**行的模型**：原版渲染**会话单元**，控制台渲染**每一条持久事件**——
`策略`/`其他`/`轮次`/`步骤` 这四个标签在原版词表里**不存在**，而它的 `轮次 #1`/`步骤 #1/1` 行是原版
回合/分组表头的替身。（另：本次对照不是同一段会话的同一位置——控制台停在**账本顶部**、原版停在**实时边缘**；
词表差异因此成立，"逐行一一对应"这次没有验。）

工具栏（`时长 / 轮次 / 调用`）和时间线条是照抄的（`TrajectoryView.tsx:1-17` 自述 "copied to the figure
from `ui-trajectory`"），几何也对得上（工具条 32px、时间线 50px + 44px 标签槽、表头/行 30px、事件列 122px），
**所以"框架"看不出破绽，"主体"是另一套模型**。对"伪装"的后果只有一个，但很硬：切到轨迹页立刻露馅。

### 2.5 【中】左侧列表：行词汇对，行为不同

原版行（实测，`dsh-session-sync` 分组下）：
`◯ 服务端与 dsh 会话页面差异…  4分钟` —— 状态点 + 标题 + **相对时间**；hover 出 `…` 菜单（改名/复刻/归档/置顶），
行可拖拽排序（`ui-workspace/src/client/rows/Rows.tsx:614-659`）。

控制台行（`SyncPanel.tsx:295-325`）：

| 差异 | 代码 | 原版 |
| --- | --- | --- |
| 行的尾格在 running 时**用 `进行中` 顶掉了相对时间** | `:320-324` | 尾格是 `primaryStatus.trailingLabel ?? timeLabel(...)`，"进行中"不在那组标签里（那组是待确认/待审阅/待回答），**时间照常显示**（`Rows.tsx:633-639`） |
| 没有 hover 菜单、没有置顶标记、不能拖拽排序 | 行就是 `<button>`，无 `rowActions` | 都有 |
| 多一层**机器**，且是树的根 | `SyncPanel.tsx:262-286` | shipped 没有"机器"这个概念，只有 workspace→session |
| cwd 行右侧多一个**会话计数** `1` | `:283` `trailing={String(project.sessions.length)}` | 原版把计数放在分组的副标题里，不是尾格数字（`rows/Rows.module.css:93`） |
| 列表上方多一行**连接状态**（`Client · 已连接到服务器 · 正在发布`） | `:221-225` + `roleLine`（`:1346`） | 没有 |
| 没有**视图选项菜单**（分组/排序/归档过滤） | 无 | `WorkspaceBrowser.tsx:105-168` |

结论：**行看起来像，但一动鼠标就不像**——尤其那条恒为"进行中"、永远不显示时间的尾格（镜像会话几乎总在运行）。

### 2.6 【中】状态行：少了上下文环，分隔符不同

| | 实测 |
| --- | --- |
| 原版 | `⟳ 1 轮 44 步 · 238 tok/s   ▤ 3.5M tok · 缓存命中 98%   ◯ 12%` |
| 控制台 | `1 轮 · 44 步 · 153 tok/s   3.5M tok · 缓存命中 95.6%` |

- 原版：`轮` 与 `步` 之间**没有** `·`（`1 轮 44 步`），各组有图标（刷新/库/环），**末尾有上下文占用环 + 百分比**。
- 控制台（`SyncPanel.tsx:846-864`）：`N 轮 · N 步`，纯文本无图标，**没有尾部的上下文环**——那个环被搬到
  标题行右侧了（`:787` `ContextRing`），而且只在镜像拿得到 context 事件时才画。
- 更实质的一层：原版那三组是**图标胶囊**（14px svg、radius 24px），而且**可以点开统计弹窗**
  （`ui-chat` 的 `StatsPills.tsx:137-184`）；控制台那行是 11px 纯文本、不可点
  （`sync.module.css:1232-1243`）。所以它不只是"少个环"，是"少了一个入口"。

### 2.7 【中】shell 层面的三处：会话"不在本地列表里"

| 差异 | 证据 |
| --- | --- |
| 镜像会话**不出现在 shell 自己的左栏工作区列表**，也不在 shell 的会话目录里 | `scope` 路线只 `retainScope`，**只有 `adopt` 会发布目录行**（`official-session.tsx:76` 注释：catalog row an adoption publishes）|
| **浏览器标签页标题不变** | 原版打开会话后标签页是 `服务端与 dsh 会话页面差异伪装`；控制台打开后标签页仍是 `DeepSeek Harness` |
| 控制台面板**取代了 shell 的会话视图**，而不是"多开一个会话" | 面板由 `main` 槽的 `key: session-sync` 提供（`src/client/index.ts:105-122`） |

### 2.8 【低】其余零散差异

- **模型 chip 写的是 wire id**：`deepseek-flash · high`（`SyncPanel.tsx:772-773` 直接打印 `model.model`），
  原版写显示名 `DeepSeek-V41-Flash High`。
- **`加载更早的消息`**（`locales.ts:69`）是插件的控件，原版没有这一行。机制：插件给 shipped 窗口时
  **恒传 `hasMore=false`**（`official-session.tsx:532-536`），所以 shipped 自己那个"加载更早"永远不会出现
  （它在 feed 路线上本来也只会去问一个没听说过这个会话的 Host），于是这一行成了**所有路线上都在**的替代控件。
- **空态 hero**：插件的 hero 抄了原版新会话首屏（`SyncPanel.tsx:889` 起），但多一行提示
  `从列表打开一个会话，即可阅读并接管。`。
- **cwd 写法**：控制台树行显示 `C:\Users\14339\Desktop\git\d…`（Windows 形式），物化到服务器的 header 里
  是 `/C:/Users/...`（`portableCwd` 的设计行为，只在物化产物里可见，界面上看不到）。
- **行几何确实同源**（这点插件做对了）：32px 会话行 / 34px 项目行的行高、8px 圆角、缩进与折叠箭头
  都对得上（`sync.module.css:328-353,368-374` vs `Rows.module.css:1-8,94-108,148-154`）。

### 2.9 如果退回「手绘面板」（没有 `scope`/`adopt` 的构建）——正文也会漂移

线上今天看不到这一栏，但它是**任何一次 DSH 降级/换构建**都可能落回的状态（PROGRESS 记过：
补丁随版本静默失效），而且 `README.md:100-101` 把它当作"stock build 的兜底"。按 `文件:行` 的完整表见
`docs/audit-pane-body.md`，摘要：

| 差异 | 控制台证据 | 原版证据 | 严重度 |
| --- | --- | --- | --- |
| **没有回合折叠 / 过程分组**（`用时 N 秒 ⌄` 那一层） | 唯一的回合级处理是 `transcript.ts:337-350` `markTurnTails` | `ui-chat` `ChatGroupSeat.tsx:133,150`、`process-groups.ts:152-163` | **高** |
| **`transcriptView`（工作详情）从不被读**：grep 全 `src/` 只有 `PROGRESS.md:416` 提到它；`ConfigSection.tsx` 只有同步设置 | 无调用点 | shipped `transcript-view.ts:19-45` | **高**（且在**手绘面板与轨迹页上都无效**；`README.md:125-132` / `PROGRESS.md:416` 说"本插件读同一个值"，与代码不符） |
| 没有命令卡片、没有压缩卡片 | `transcript.ts:362-377` `applySurface` 把被替换的事件**整段删掉** | `command.ts:174-216`、`command.ts:101-131`、`core/session/src/surface.ts:84-106` | 中 |
| 没有分支操作、没有回合导航轨、图片只给一个文字 chip | `SyncPanel.tsx:979-988` | `MessageIconActions.tsx:91-106`、`turn-navigation.ts:79-97` | 中 |
| **多一个"用时"药丸，原版没有对应物** | `SyncPanel.tsx:1050-1052` → `stat-panels.tsx:183-236` | 回合尾只有 `usageAction`（`TurnTailNodeView.tsx:73-75`） | 中（**这是手绘面板上最清楚的"不是本机会话"标志之一**；注：按 rc.1 检出，线上是 rc.2） |
| 事件覆盖：shipped 认 **59** 种事件类型，插件只投影 **7** 种 ⇒ **52 种没有渲染**，其中 **12** 种在原版有可见对应（`command/run`、`command/done`、`compaction/*`、`approval/asked|decided`、`todo/write`、`deliverables/presented`、`team/task`、`schedule/change`） | 计数来自 `packages/core/session/src/known-event-types.ts:22-82` 解析 | 同上 | 中 |
| 工具标题只覆盖 **8** 个 wire 名，shipped 约 **50** 个 ⇒ `subagent`/`job_list`/`todo`/`ask_user_question`/`terminal_*`/`lsp`/`workflow`/`team_*`/`goal`/`schedule_*`/`cordis_*` 全落到 `工具调用 · name` | `tool-cards.ts:52-61` | `ui-tool/.../tool-call-model.ts:75-119` | 中 |
| 五份"逐字抄"的样式表已经漂移 | `MessageIconActions`（29 行）、`ToolRow`/`ReasoningRow`（31 行）、`stat-dialog`（缺 `backdrop-filter`）、`TurnUsagePanel`（药丸 color/font-size）；`accessibility` 仍一致 | 对照检出内同名文件 | 低-中 |

## 3. 明确缺陷（与"像不像"无关，都是 bug；前两条已在源码里逐字复核）

| 缺陷 | 位置 | 现象 |
| --- | --- | --- |
| **路线徽标会显示浮点数** | `official-session.tsx:746` 合成实时行的 seq `lastSeq + 1 - 1/(transient+1)`；`:599-606` `windowRange()` 把它当范围末端；`SyncPanel.tsx:573` 直接打印 | 实测先后出现 `0—151.99609375`、`0–219.99776785714286`；安静时是 `0–441`。**原生页面不可能有这种数字** |
| **标题被挤成 0 宽**（§2.1） | `sync.module.css:1468` + `SyncPanel.tsx:537-579` | 窄窗口下会话标题完全消失，**必然复现** |
| **镜像重置提示的关闭键渲染成乱码 `脳`** | `SyncPanel.tsx:240`（字面 U+8113；GBK-936 往返可还原为 `×`） | 一个可见的控制键显示成汉字乱码 |
| **`路径` 被写成 `个·径`** | `locales.ts:230-231`（shipped 为 `'{shown} 个路径'`；英文侧正确） | 所有 grep/glob 卡片的摘要文案出错 |
| 时长格式化**没有小时分支** | `message-stats.ts:45-52`（shipped `message-chrome.ts:49-60` 有小时 + `duration.hours`） | 超过 1 小时的回合显示 `90分05秒`，而不是 `1小时30分05秒` |
| diff 卡片**行数上限差一** | `tool-cards.ts:20` `CHAT_DIFF_MAX_LINES = 8`，shipped 是 **9**（`diff-card-model.ts:7`） | 最后一个改动行被提前折叠 |
| **缓存命中率有两套算法** | `session-chrome.ts:284` 自算（漏 `cacheWrite`，且会把部分命中凑成 100%）；回合药丸用移植过来的 `formatCacheHitPercent`（`stat-panels.tsx:123`） | 同一个会话、同一屏上两个不同的数 |
| 近似文案与原版不一致 | `turnFailed`（`本轮失败` vs `本轮运行失败`）、`terminalDone`（`完成` vs `已完成`）、`rowRunning`（`执行中` vs `运行中`） | 逐字比对才看得出，但都属于"抄就要抄对" |
| 死分支 | `locales.ts:163` `toolLabelTerminal` 永远渲染不到（`tool-cards.ts:104` 先命中 `toolTitleBash`） | 维护陷阱 |
| 另外三处乱码只在注释里 | `SyncPanel.tsx:5,197,746`、`service.ts:909`（`閳?`，字节已被写成 `0x3F`，原文不可恢复；`:197` 那处把换行也吞了） | 不影响界面，但同一类事故（PowerShell GBK 往返）已经发生过多次 |
| **路线徽标名不副实** | `SyncPanel.tsx:570-575` 只要 `official.supported` 为真就渲染「原件 · …」，而**同一次渲染里** `shipped` 可能是 `undefined`（`:526-531`，镜像还没有 transcript / 拿不到席位）——那时画的其实是**手绘 transcript**。`paneRouteHint`（`locales.ts:73`）也照旧断言"这个面板用的是 DSH 自己的会话页" | 徽标会说谎，且恰好在你排查"为什么画得不一样"时会骗你 |
| **乱码检查器抓不到上面两条** | `scripts/check-encoding.mjs`（可疑码位表 `:11`、扫描根 `:12`）覆盖不到 U+00B7 / U+8133 / U+FFFD | 本次实测：树里同时存在 `个·径`、`脳`、`閳?`，而 `node scripts/check-encoding.mjs` 输出 `mojibake check: clean`、exit 0。**别把它当"编码干净"的证据** |

> 方法论备注：上表里"两套算法""差一"这类结论来自**逐行源码读**，不是执行观测；
> 能断言的是**公式不同**，不是线上实测输出。要坐实就得拿一个真实会话的两种读数对一次。


## 4. 提高伪装度的建议（按性价比排序）

| 级别 | 做什么 | 为什么值 |
| --- | --- | --- |
| **P0** | 标题行的布局：标题不许收缩到 0（给 `.viewTitle` 一个 `min-width`，或把机器名/徽标/chip 簇改成会自己换行/收进 `…` 菜单）；并把 `原件 · scope`、`缺 N 条` 从标题行移走（进 tooltip 或状态区） | 第一眼判据；现在是**必然复现**的 bug |
| **P0** | `windowRange()` 取整（`Math.floor`），徽标不再出现小数 | 一行改动，去掉一个不可能出现的数字 |
| **P1** | 对齐字符串与 chip：`子代理 N` → `N 个子智能体`；模型 chip 用显示名而不是 wire id；状态行的 `轮 步` 分隔符与上下文环位置跟原版一致 | 都是"读出来就不对"的细节，成本低 |
| **P1** | 列表行行为：running 时**保相对时间**（`进行中` 移到状态点/悬浮），补上 hover 菜单（至少置顶/归档不显示，也不要让行看起来可点却无操作），去掉 cwd 行的计数 | 交互是第二眼判据，成本中等 |
| **P2** | 把 `adopt` 路线在服务端恢复：把 `patches/` 里那份补丁**移植到 `0.1.7-rc.2`**（或推到上游） | 这是**唯一**能让 shipped 输入框也能发言、并让会话进入 shell 目录/左栏的路；届时 §2.3、§2.7 的前两条自动消失 |
| **P3** | 轨迹页：要么同样走 shipped 的轨迹视图（同一条 `conversation.view` 缝），要么把行模型改成**会话单元**（工具调用带结果、助手消息、回合/分组表头），并把自造的 `策略`/`其他`/`轮次`/`步骤` 标签收掉 | 整页露馅（原版词表里没有这四个标签） |
| **P4** | 空态提示行、`加载更早的消息` 的措辞与位置；顺手把 `scripts/check-encoding.mjs` 的可疑码位表补上 U+00B7 / U+8133 / U+FFFD | 锦上添花（检查器那条是防止同类事故再发生） |

## 5. 不该改的（诚实性 vs 伪装度的取舍）

这几条是**故意的**，README 里写明了理由，改之前要知道代价：

- `缺 N 条`、`原件 · scope` 徽标是**运维可见的事实**：镜像缺事件、面板走哪条路线。为了让页面更像本地会话
  而把它们删掉，就等于把"这份日志不完整"和"这条会话不是本地的"两件事藏起来（README 明确说"Nothing
  user-visible is invented"与路线标记"Operator-visible on purpose"）。折中做法是**移位置**（tooltip/状态区），
  不是删除。
- 接管输入框的 `发送到 <机器>` 是必要的：prompt 真的会送到那台机器。
- 镜像只有尾部窗口（默认 4000 条）⇒ 长会话**必须**有插件自己的翻页控件，原版没有对应物。
- 附件、slash、`@` 引用、模型选择在 `scope` 路线上无法提供（只有 `adopt` 能给 shipped 输入框动词）。
- 图片块只显示事实（镜像不带附件字节）、交付物卡片不显示（摘要只有源站 Host 现算）。

## 6. 本轮复现步骤（可重跑）

1. 本机起 DSH（`127.0.0.1:3080`）+ 服务端 `dsh.c-zy.cc`（DSH `0.1.7-rc.2`）。
2. 本机配置里把**当前这个会话**标为同步（`~/.dsh/dsh-session-sync.json` 的 `syncSessions`）。
3. 服务端控制台（左栏「服务器同步工作区」）→ 机器 → cwd → 会话行，打开。
4. 把两个浏览器窗口并排（各占一半宽），逐块对照：标题行 / 输入区 / 轨迹 tab / 左侧列表 / 状态行。
5. 标题行的布局验证：点标题行最左的 `▤` 收起列表 → 标题出现；再点一次还原。

## 7. 数据层：镜像里的数据 = DSH 官方数据吗（2026-09-25 实测）

**结论：事件层逐条相同（本次 829/829），但"官方数据"不止事件层——尾部窗口、附件字节、header 三处并不相同。**

### 7.1 怎么测的（可复跑）

1. **官方侧**：本机会话日志
   `~/.dsh/sessions/--C-Users-14339-Desktop-git-dsh-session-sync--/session-e08471af-…/session.v4.jsonl.zstd`。
   ⚠️ 它不是一个 zstd 流，而是**每次追加一个 zstd frame**（本次实测 508 个 frame 起点魔数）。
   **Node 的 `zstdDecompressSync` / `createZstdDecompress` 只解第一个 frame**（解出 228 字节 = 那条 header），
   必须按魔数 `28 B5 2F FD` 逐帧解。
2. **镜像侧**：服务器上
   `curl -b <cookie> 'http://127.0.0.1:3080/dsh-session-sync/transcript?machine=DESKTOP-M1EERFC&session=session-e08471af-…&limit=4000'`
   → `{"transcript":{events:[…]}}`（2.93 MB / 829 条）。
3. **判据**：两侧把每条事件规范化（键排序的 JSON）后按 seq 排序，串起来算一个 sha256。
   **同一个数就是逐条相同**（连 `time`、`data`、`surfaceOp`、`sourceEventSeqs` 都算进去了）。

### 7.2 实测数字

| 量 | 官方日志（0..828 截断） | 服务器镜像 | |
| --- | --- | --- | --- |
| 事件条数 | 829 | 829 | ✓ |
| seq 范围 | 0..828，**零空洞** | 0..828，**零空洞** | ✓ |
| 每条的字段集合 | `type, seq, time, data, sourceEventSeqs, surfaceOp` | **完全相同** | ✓ |
| 带 `surfaceOp` 的条数 | 274 | 274 | ✓ |
| 带 `sourceEventSeqs` 的条数 | 149 | 149 | ✓ |
| 24 种事件类型的直方图 | `step/start 116`、`tool/call 150`、`tool/result 149`、`assistant/message 116`、`session-log-deepseek/delivery-accepted 117`、`step/end 115`… | **逐项相同** | ✓ |
| **规范化合并摘要** | `1e2a2d41a9926c15e74bfc92a044d934` | `1e2a2d41a9926c15e74bfc92a044d934` | **✓ 完全相同** |

（另一段 0..802 的独立复核同样相同：`732b6889a01549b0793c1b72d21f68e0`。）
镜像 `state` 里该会话 `eventCount: 829`、**`missingEvents: 0`**、`running: true`、
`title`/`cwd` 与源站一致。

### 7.3 但"一样"有边界——四处不一样

| 不一样的地方 | 事实 |
| --- | --- |
| **不是全量，是尾部窗口** | 镜像按 `EVENT_LIMIT = 4000`（`hub.ts:30`）只留最新 4000 条，超出即从前面裁（调用方最高可把该会话抬到 `RETAIN_LIMIT = 40000`，但那是 `materialize` 专用的一次性 hold）。本次会话 829 条 < 4000，所以这次恰好等于全量；**超过 4000 条的会话，镜像 ≠ 官方日志**，这是设计，不是 bug |
| **实时尾部有几十条的滞后** | 实测同一时刻镜像到 `seq 828`，而源站日志已到 `858`。原因是源站日志**按批 flush**、镜像按帧转发；这部分**不计入** `missingEvents`（它算的是"洞 + 落后于源站自报水位"） |
| **附件字节不传** | 事件里的附件引用是逐字过来的，但**blob 不在这条链路上**——所以页面只能显示"这里有一张图（类型/大小）"，画不出图。**事件层一样，会话自足性不一样** |
| **header 这次没有直接观测** | 源站每批都声明 header（协议 `PublishFramesPayload.header`，0.4.7 起），镜像把它存在 hub 里；但**镜像侧的 header 没有可读路由**（只有 `/materialize` 用它），所以"镜像存的那份是否逐字段等于源站"本次**没测**。已有的实测是**物化产物**那条路：3478/3479 条逐字节相同，唯一差异是 `portableCwd` 刻意把 `cwd` 从 `C:\…` 改写成 `/C:/…`（`docs/host-side-session-plan.md` / PROGRESS 记录）。要现在坐实，得跑一次 `POST /materialize`——它会在服务器上写出一条真会话并归档，我没有擅自执行 |

### 7.4 派生量：数据一样，**页面是投影**

数据逐条相同 **不推出**"页面显示的一样"：渲染器只投影一部分事件——
`workspace/changes` 在喂给 shipped 渲染器时被过滤（本次 1 条，`official-session.tsx:392-397`），
另有 12 种有官方可见对应的事件类型在手绘面板上不渲染（§2.9）。
轨迹页更是另一个模型（§2.4）。
反过来，镜像里**没有伪造的事件**：每一帧都是源站 `follow` 转发出来的官方事件，
实时文字来自源站自己的 assistant 帧（只是不落盘）。

### 7.5 一句话回答

**事件层的答案是"一样"**——829 条逐条相同、零空洞、连 `surfaceOp` 都一致，所以控制台里
读到的对话内容与 DSH 自己那份**是同一份数据**。
**但"伪装本地会话"不止需要事件相同**：它还是**尾部窗口**（长会话会短）、
**不带附件字节**（图片画不出）、**内存态**（服务器重启即丢）、
而且**镜像里的会话不是 DSH 的会话**——它没有 catalog 行、不在工作区列表里、`header` 也没有可读出口。
数据像，身份不像。

## 8. 证据与复核（哪些是实测、哪些是源码读、哪些被否掉）

| 结论 | 怎么得到的 |
| --- | --- |
| §2.1–2.8 的"现象"列 | **并排实测**（左右两个窗口逐块截图对照，同一会话） |
| §2.1 的布局根因 | 实测**证伪式**验证（收起列表 → 标题出现）+ 源码值 |
| **§7 的"事件层逐条相同"** | **两端算同一个规范化合并摘要**（829 条，`1e2a2d41…` == `1e2a2d41…`；另一段 0..802 为 `732b6889…` == `732b6889…`）。官方侧要先按 zstd frame 魔数逐帧解（Node 只解第一帧） |
| **§7 的"超 4000 条就不是全量"** | 源码 `EVENT_LIMIT = 4000`（`src/host/hub.ts:30`）+ README Limitations 的自述；本次会话 829 条未触及该上限，所以**这一条本次没有被线上证伪过** |
| **§7 的"附件字节不传"** | README + 源码（媒体类型/大小随事件走，blob 不走）；本次会话没有图片事件，**未实测** |
| §2.9、§3 的多数条目 | **源码逐行读**（两份审计：`docs/audit-pane-body.md`、`docs/audit-pane-chrome.md`）。算术类差异（吞吐/TTFT/缓存命中两套公式）只能断言**公式不同**，不是线上观测输出 |
| `个·径`、`脳` 两条 | 我自己按码位复核过（`locales.ts:230`、`SyncPanel.tsx:240`）；`check-encoding` 报 clean 也是我自己跑的 |
| **被否掉的一条** | 审计过程中出现过"README 本身已被 GBK 损坏（`鈥?`、`鍔犺浇鏇存棭鐨勬秷鎭`）"的结论——**不成立**。用 `read` 工具复核：`README.md` 里 `已停止`（:62）、`加载更早的消息`（:81、:117）都在，三个所谓坏串一个都不存在。那是**用 PowerShell 默认编码（ANSI/GBK）读 UTF-8 文件**当场制造出来的假阳性——正是 PROGRESS §6 记过的那类事故，只不过这次发生在**读**的一侧 |
| 不能从本文推出的 | 本次没有验"行级逐行一一对应"（两边看的不是同一段位置）；没有验 `adopt` 路线下的观感（服务端现在没有 `adopt`）；没有验非中文界面；没有验镜像侧 `header`（要跑 `/materialize`，未执行） |

