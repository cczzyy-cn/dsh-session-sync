# `@deepseek-ai/dsh-experimental-agent-team-profile` 能给本插件提供什么

> **这是一份分析，不是计划。** 打算做什么仍然看 `docs/project-plan.md`，现在是什么形状看 `README.md`，
> 事实与实测看 `PROGRESS.md`。
>
> 每条结论都标出它是**怎么被核实的**：读到的文件行号，或者标成「**待验**」（没核实的不写成结论）。
> 被分析的包在 DSH checkout 里：`C:\Users\14339\Desktop\git\deepseek-harness\packages\experimental\agent-team-profile\`，
> 版本 `0.1.7-rc.2`（`package.json:4`）。

---

## 0. 结论先行

1. **不能依赖它。** Agent Teams 是**单进程**的：成员共享同一个 cwd，不提供远端成员，mailbox 也
   明确不保证跨进程 exactly-once（`packages/experimental/agent-team/README.zh.md:206,210`）。
   而本插件的命题恰恰是跨进程/跨机器——把会话中继到另一台机器上去读、去接管。方向相反。
2. **但它示范了两条本插件正在自己手搓的缝**，这才是价值所在：
   - **组合层**：能力与角色由 **profile patch 声明**，而不是由运行期配置开关决定；
   - **派生层**：把「日志 → 可读状态」做成**投影**（无变化就不发帧、失败挨着最后有效状态），
     再配一个**不变式伴生**在写入前裁决候选事件。
3. **它回答了一个本插件 P0 级的问题**：`--patch` overlay 是"DSH 官方认可的、不改 profile 就挂载一个插件"的入口
   （`apps/cli/reference/README.md:9`），而本插件现在唯一的挂载路径是 `dsh plugin add` + pnpm + junction，
   `PROGRESS.md` §1/§6 里为此记着两个会把真实 profile 清空的坑。
4. **反过来也成立**：Agent Teams 自己列出的未决方向里就有「跨进程 mailbox 事务」，而本插件的中继、
   机器身份、命令生命周期、日志镜像已经是一个候选底座（§4）。这条是方向，不是现在的活。

---

## 1. 它到底是什么形状（读到的）

| 文件 | 内容 | 核实 |
| --- | --- | --- |
| `package.json` | `dsh.bundle.patch: ./cordis.patch.yml`；`icon: ./icon.svg`；依赖三个兄弟包；**没有** `dsh.client` | `package.json:5,35-44` |
| `cordis.patch.yml` | 4 行 `disabled: true`（`tool-subagent`、`tool-subagent-fork`、`tool-subagent-control`、`tool-subagent-list-agents`）+ `insert:` 3 行，每行带自己的 `config:` | `cordis.patch.yml:4-33` |
| `src/index.ts` | `export {}`——**Host 入口不执行任何逻辑**，本包的运行期内容就是那份 patch 文档 | `src/index.ts:8` |
| `README.zh.md` | 随 dsh 提供、**默认关闭**、插件页开启；patch 保留行 id，用户 profile patch 仍能单独配置每一行 | `README.zh.md:12,45,51,61` |

**层序与 patch 语义**（这条决定了下面所有"能不能"）：

> bundle patches（按 `dsh.profile.bundles` 顺序）→ profile 自己的 `cordis.patch.yml` →
> `$DSH_HOME/cordis.patch.yml` → `--patch` overlay（argv 顺序）。
> **后面的层按行胜出**；patch 会**整体替换**目标行的 `config`（不是深合并），也可以插入新行；
> 未命中的目标只在 stderr 警告。
> —— `apps/cli/reference/README.md:9`（英文原文同页）

由此可以直接下三个断言：

- **一个包自己的 patch 可以禁用更早层（含随附层）的行**——agent-team-profile 自己就是这么干的
  （禁用 `dsh-base` 的 4 个 subagent 行），且它只是个普通包，不是 checkout 补丁。
- **`disabled: true` 打在不存在或已被移除的 id 上不会失败**，只报警告（`apps/cli/tests/dump-config-schema.spec.ts:344-351`）。
  这对本插件是好消息：patch 可以写"排除项"，上游删了那行也不会把启动搞挂。
- **overlay 插入的行可以给绝对路径 / `file://` URL 当 `name`**，相对名则相对 patch 文件所在目录解析
  （`apps/cli/tests/dump-config-schema.spec.ts:390-397` 用 `pathToFileURL(...).href` 当插件名）。

---

## 2. 可以直接借的（按性价比排序）

### S1 角色即组合：把 `isServer` 从运行期开关搬进组合层

**现状**：本插件两种角色由配置文档里的一个布尔决定——`SyncConfig.isServer`，
`service.submitCommand()` 第一句就是 `if (!this.config.isServer) return …`
（`src/host/service.ts:422`），监听器也由它拉起。也就是说**任何装了这个插件的机器，
只要有人翻一下开关，就会开始在 `0.0.0.0:<port>` 上开一个带密码握手的同步口**
（README「Security」段自己写着这个口不受浏览器 gate 保护）。

**可借的形状**：agent-team 把「装哪几行」交给 patch，而不是让同一份代码在运行期猜自己是谁
（`cordis.patch.yml:16-33`）。对映到本插件就是两个层：
`…-sync-server`（hub + transport + 控制台）与 `…-sync-origin`（link + 发布 + 设置页），
各自 `insert:` 自己需要的那一行。收益有三条，都是结构性的：

- 服务器上那份 profile **不含** origin 的行，源站上那份**不含**监听器——"谁能开监听"变成安装事实；
- headless 的源站可以完全不带浏览器半边（agent-team 的 UI 包 Host 入口是惰性的，只有 Web 客户端加载器
  才挂载它浏览器入口，所以 headless 不会起 Web 服务——`README.zh.md:61`，同一个形状本插件已经
  用 `dsh.client.platform = web` 做到了，只是没有按角色切开）；
- 现行"`patches/` 只作历史、不引入新的 Host 源码补丁"（`docs/project-plan.md:98`）不受影响——
  这里改的是**本插件自己的** `cordis.patch.yml`，不是上游源码。

**代价（诚实）**：这是发布形状的改动，会动到"一个包同时装两端"的既有部署习惯，
服务器与本机都得重新装一次；而且本插件的配置文档是**逐机**的（机器名、密码、发布列表都不同），
所以角色以外的值仍应留在 `$DSH_HOME/dsh-session-sync.json` 里，只把"装哪些行"搬进 patch。

### S2 用 `--patch` overlay 挂载：绕开 profile 安装那条路

**现状**：`PROGRESS.md` §1 记着两个真实的坑——`profiles\web` 是 junction 时 `dsh plugin add`
会把真实 profile 清空；以及一次性实例的 `DSH_HOME` 必须包一层 `.ps1` 才能注入。
`scripts/e2e-dsh.ps1` 现在是"复制真 profile 的形状 + 拷工作树进去"来绕过它们。
而 P0#1 是"端到端验证只能在用户的机器上做"（`docs/project-plan.md:45-46`）。

**可借的形状**：overlay 是官方层序里的最后一层，它插入的行与 bundle 插入的行**同权**
（`apps/cli/reference/README.md:9`），于是可以写成：

```yaml
# 不装进 profile，只这一次启动挂上
- insert:
    - id: session-sync
      name: 'file:///C:/Users/14339/Desktop/git/dsh-session-sync/lib/index.js'
```

启动 `dsh web --patch <该文件>`。

**Host 半边这条是核实过的，不是设想**：DSH 自己的构建产物 e2e 就有一个"绝对路径 overlay 插件"
的用例——patch 写成 `[{ insert: [{ id, name: <绝对路径>, config: { marker } }] }]`，
启动后那个模块的 `apply(ctx, config)` **真的跑了**并写出了 marker 文件
（`apps/cli/tests/built-bin.e2e.ts:445-457`）。注意它同时证明了两件事：绝对路径可以是插件名，
**而且这一行的 `config:` 会被投给 `apply`**——这正是 S9 想要的入口。

对 `scripts/e2e-dsh.ps1` 而言，这能去掉"把工作树拷进一次性 profile"
这一步；对本机迭代而言，它让"改 Host 半边"不必先走一次会清空 profile 的 `plugin add`。

**浏览器半边也一起来（读代码核实，不靠推断）**：客户端模块系统的激活扫描就是
`for (const entry of ctx.loader.entries()) this.dirty.add(entry.options.name)`
（`packages/client/modules/src/index.ts:636-639`）——**它按 loader 条目扫，不区分这一行是哪一层插进来的**；
而定位包清单时，`locatePkgJson()` 明确把 `.` / `file:` / 绝对路径都当作 path-like 处理
（同文件 `:871-875`），并且"**最近的、声明了该名字的祖先 manifest** 拥有这个模块"（同文件 `:860-869`）。
本插件的 `package.json` 声明了 `dsh.client.platform = web`（`package.json:16-18`），
所以只要那一行的 `name` **指进包内**（例如 `…/dsh-session-sync/lib/index.js`），
最近的祖先 manifest 就是它自己的 `package.json`，浏览器半边会被照常发现并挂进 `/plugins/??…` 组合。

> 反过来的边界要记住：**指进包内**是条件。把 `lib/index.js` 单独拷到别处再指过去，
> 找不到祖先 manifest，就只剩 Host 半边——没有控制台。

### S3 投影：把 fold 搬到 Host，并让"没有可见变化"真的不发帧

**现状**：本插件把**原始事件**推给浏览器，由浏览器自己折成可读行——
`src/client/transcript.ts`（24 KB）、`session-chrome.ts`（27 KB）、`tool-cards.ts`（35 KB）
都在做这件事。而流式文本是"每 150 ms 把**整段**已累积文本再发一遍"：
`flushStream()` 只看 `liveDirty` 非空就整段重发（`src/host/service.ts:1064-1073`），
与"控制台看到的东西有没有变"无关。窗口是按 4,000 条事件切的，实测一场 3,478 条的日志
序列化 12.5 MB（`PROGRESS.md` §3）。

**可借的形状**（agent-team 的投影，三处细节都值钱）：

- **只替换被触及的集合**：投影的 `apply` 只替换变化的部分；**仅邮箱变化时保留客户端视图引用、不产生 frame**
  （`packages/experimental/agent-team/README.zh.md:177`）。
- **客户端零请求**：面板"打开面板不发起投影请求"，它读的是共享 store 里的
  `projectionsBySession[lead].values.agentTeam`（`client-ui-agent-team/README.zh.md:32,52`）。
- **失败挨着最后有效状态**：投影报告某条记录被拒时，面板"在最后有效的 roster 与任务**上方**显示该失败"
  （同文件 `:40`）。

对映到本插件：把 `transcript.ts` 那套折叠**上移到 Host 的 hub 侧**，出一条带版本的视图
（行 + 计数），并规定**派生结果没变就不发帧**——流式文本那条从"每 150 ms 整段重发"变成"只在
新增了可见内容时发增量"。这与 0.9.0 刚做的「洞 / 落后」拆分是同一种思想（把"读者要动作的"与
"只是常态的"分开），只是当时只做在了计数上，没做到帧上。

**边界（必须说清）**：DSH 的投影机制是**挂在一条会话上**的，而本插件的镜像是**内存态、不是 DSH 会话**
（这正是 0.8.0 删掉物化之后立下的规矩，`docs/project-plan.md:92`）。
所以这里借的是**语义**（版本化、只替换触及集合、无变化不发帧、失败挨着最后有效状态），
**不是** `ctx` 上的那个投影 API。本插件的载体仍然是它自己的 `/events` 流。

### S4 不变式伴生：把「中段空洞的修复」从"期望"变成"可观测"

**现状**：未解问题 #1——`reportGap` / `holesOf` 有实现、有单测、有合成端到端，但
**线上 24 轮 `missing=0 / holes=0`，从没被观测到发生过**（`PROGRESS.md:267-269`，
`docs/project-plan.md:54`）。

**可借的形状**：agent-team 有一份 `./invariant` 伴生入口，**把每条候选事件对照已提交前缀回放，
在 append 之前拒绝非法转换**（`agent-team/README.zh.md:125,147`）。本插件现在的镜像**是"先收下、
再算缺多少"**：`publishFrames` 收批，`shortfallOf()` 事后算洞与落后。

如果把"候选批 vs 已提交镜像前缀"的裁决放进准入路径，并**把裁决结果计数出来**
（接受 / 去重 / 判为历史 / 拒绝并触发定点补读），那么"洞被修复过"就变成一条**会自己出现的读数**，
而不是一句希望。这也正好落在这个项目自己的纪律上——"看到'某件事永远完不成'先量体积/条数"
（`PROGRESS.md` §6）——**先让那件事可数**。

**边界**：同 S3，`./invariant` 的机制也挂在会话日志的 append 上，镜像是内存态，所以借的还是设计
（候选 vs 已提交前缀、写入前拒绝、拒绝要计数），不是那个 `./invariant` 导出本身。

### S5 投递语义：把 id 的铸造点与"保证的边界"写清楚

**现状**（读代码核实的，比 README 更准）：

- server 侧 `submitCommand()` 每收一次 POST 就 `mintId()` 一个新 `commandId`（`src/host/hub.ts:496`）；
- 只有**从未发出**的命令会在源站重连时 flush（`record.pending`），**已 `delivered` 的绝不重发**
  （`hub.ts:456-467`）；重复 ack 被终态挡住（`hub.ts:532`）；
- 源站侧 `runCommand()` 的准入检查只有两条：还在发布列表里、没过 TTL——**没有按 `commandId` 去重**
  （`src/host/service.ts:1089-1100`）。

也就是说**投递路径本身不会重复**（这条比想象中干净，值得写进 README），
但**控制台重复提交**（双击、代理重试、页面重放）会得到两个 id ⇒ 两句 prompt。
agent-team 对这件事的答案是**语义**而不是机制：消息 id 属于入队时就写下的持久记录，
所以文档里能写死一句"**排队的消息绝不能重发**"（`agent-team/README.zh.md:71`），
并且把保证的边界明确成"**进程内重试 + 目标侧去重，而不是跨进程 exactly-once**"（同文件 `:133`）。

**可借的形状**：两件小事，都便宜。

1. 让**发送方**铸造 `commandId`（控制台提交前生成、随 POST 带上），源站在 TTL 窗口内记住已准入的 id，
   重复到达时直接回 `accepted`（或一个具名的 `duplicate`）而不再次 `prompt`；
2. 在 README「A prompt is a claim」那一节后面补一句**保证边界**：本插件的命令是
   "queued/delivered/accepted/failed/expired"六态 + TTL，**不是**端到端 exactly-once，
   重复提交由发送方负责不重发。这与本仓库自己的"先写症状与证据，范围要写清"是同一种诚实。

### S6 授权：把"读（发布）"与"写（接管）"分成两种授予

**现状**：`from` 字段看起来像"谁发的"，读 `service.ts:423` 才知道它填的是
**同步服务器自己的机器名**（`this.config.machineName`），不是操作者身份。
而 token 只把**发布身份**绑到机器名上（README「Security」段）；接管则是"任何能进这个 GUI 的人"
都能对任何已发布的会话执行。

**可借的形状**：agent-team 的每个方法都接收**确切的实时调用方**，只有 Lead 能 spawn / reassign /
interrupt，而浏览器投影是**只读**的（面板不能 spawn/rename/delete/interrupt——
`client-ui-agent-team/README.zh.md:92`）。对映过来：发布 = 只读授予，接管 = 写授予，
**两者分开**，并且每条被接管的会话在源站侧能看到"谁、从哪台机器接管的"。
这不只是礼貌：本插件的接管会**唤醒冷会话**并改变另一台机器上的对话，这是最需要留痕的一种操作。

### S7 模型工具：本插件现在**一个都没有**

**核实**：在 `src/` 下 grep `ctx.tools` / `registerTool` / `tools.register` —— **0 条命中**
（只有 `locales.ts` 与 `transcript.ts` 里的 `toolResult` 字样，那是渲染工具结果，不是注册工具）。
Host 半边只注册路由（`src/index.ts:72-83`）。

**可借的形状**：tool-agent-team 是"薄适配器"的范本——它把九个工具注册在**成员 Agent 自己的 `ctx`** 上
（`maybeInstall` 走遍 live Agent 并订阅 `agent/created`，Agent dispose 时 disposer 逆序撤销，
HMR 重装前先 dispose），并且"**适配器不添加更弱的路径**"，全部委托给领域服务
（`tool-agent-team/README.zh.md:84,86,103`）。它还示范了**作用域覆盖**：
与全局控件同名的 scoped 注册只为团队成员覆盖那些全局控件（同文件 `:99`）。

对映到本插件：**服务端自己的 agent** 完全可以拿到一组 scoped 工具去用那面镜像——
列机器与会话、读一段远端 transcript、往远端会话发一条 prompt。这是新能力（不是重构）：
它把控制台从"只有人能看的界面"变成"服务器上的 agent 也能工作的面"，
而且实现是薄的——hub 已经握着镜像，工具只是适配器（`/transcript`、`/command` 两条路由
已经是同一件事的 HTTP 版本）。配上 Agent Teams 就是"让 teammate 去那台机器上干活"。

**代价**：会给模型加常驻 schema 与一段策略文本（token/KV cache 的影响按 tool-agent-team
README 的「模型体验」段估计），且**写入类工具要与 S6 的授予一起做**，否则等于把接管权交给模型。

### S8 显示元数据：`icon` + `./locale/*.json` 的 `meta.title` / `meta.description`

可选 bundle 必须声明 `icon`，并导出带 `meta.title`、`meta.description` 的 `./locale/*.json`，
插件页的「官方」分组才能渲染本地化标题、描述与图片（`2026-09-21-experimental-capabilities-as-optional-bundles.zh.md:13`）。
本插件的 `package.json` 没有 `icon` 字段（`package.json:1-41`），插件页上它是个没有图标的卡片。
这是本条里最小的一条，但也是唯一一条**纯增量、零风险**的。

### S9 上限即部署值：把硬编码常量变成校验过的配置

**现状**：`COMMAND_TTL_MS = 120_000`、`PENDING_LIMIT`、`MAX_BODY_BYTES`、4,000 条窗口、
400 条一页、20 s 超时……散在 `src/shared/protocol.ts`、`src/host/hub.ts`、路由与链路各处。

**可借的形状**：agent-team 的每个上限都是**启动时校验的部署值**（`maxMembers` / `maxTasks` /
`maxPendingMessagesPerMember` / `maxMessageBytes` / `disposalTimeoutMs`，
`agent-team/README.zh.md:49-55`），耗尽时给**类型化错误**而不是复用 id 或静默丢弃
（同文件 `:108`）。它的取值就写在组合层里（`agent-team-profile/cordis.patch.yml:19-24`）。

对映过来：静态上限进 patch 的 `config:`（可按部署调），逐机运行值留在 JSON 文档；
越界时给具名理由。这条与 §3 那条"实测值要写进 state"是同一个方向——本插件已经会在
state 里报 `batch.bytes`，把那套诚实扩展到**所有硬上限**即可。

---

## 3. 不能借的（把它说清楚，比"能借什么"更重要）

| 看起来能借 | 为什么不能 |
| --- | --- |
| **把 Agent Teams 当传输** | 单进程、共享 cwd、不提供远端成员；mailbox 只保证"进程内重试 + 目标侧去重"，**不保证跨进程 exactly-once**，而且"不支持多个 harness 进程并发操作同一 Team"（`agent-team/README.zh.md:206,210`）。本插件的全部命题都在进程/机器之外。 |
| **对实验包建立依赖** | 实验包的发布规则里写着"**稳定发布包也不能对其建立运行时依赖**"，实验组之外的包不得在 `dependencies`/`optionalDependencies`/`peerDependencies` 里引用它们（`2026-08-18-experimental-agent-teams-packages.zh.md:17,39`）。本插件是外部发布的插件，属于被这条规则挡在外面的那一侧。 |
| **自称"随安装提供、默认关闭"** | `dsh.bundle.optional` 这类"包自己声明"的做法被**明确否决**——名单在启动器代码里（`OPTIONAL_BUNDLES`），"选择权留在产品手里"（`2026-09-15-shipped-optional-bundles.zh.md:13,23`）。本插件只能继续走**用户自行安装**那条路。 |
| **借投影 / 不变式的 API** | 两者都挂在"一条真实会话"的 append 上；本插件的镜像是内存态、不是 DSH 会话（`docs/project-plan.md:92`）。借语义可以，借 API 不行。 |
| **用 patch 做"按会话"的替换** | patch 是**组合层**的静态层序，粒度是"行"，不是"某一条会话"。本插件要替换 shipped 输入框那种**逐会话**的接管，仍然只能在运行期做（现状就是这么做的）。 |

---

## 4. 反向发现：本插件可能是它缺的那块

Agent Teams 的开发备注把**「跨进程 mailbox 事务」**列为"尚未决定的探索方向"，与嵌套 Team、
owner 自动释放、worktree 隔离并列（`agent-team/README.zh.md:224-226`）；限制段明说
"不提供**远端成员**"（同文件 `:206`）。

而本插件**已经有**这块底座的四件东西：

| 它缺的 | 本插件已有的 |
| --- | --- |
| 跨进程身份 | 每机器一个 token，绑定到机器名（README「Security」） |
| 跨进程投递 | 持久 outbox + 重试；**成员关系去重**而不是高水位（`README.md:194-198`） |
| 命令生命周期 | `queued/delivered/accepted/failed/expired` + TTL + 有界队列（`hub.ts:440-518`） |
| 远端状态可读 | 每条远端会话的日志镜像 + 分页补读（`hub.ts` / `/transcript`） |

所以有一条**方向性**的可能：**远端 teammate**——执行体在另一台机器、邮箱在同步服务器、
任务板升到机队级（连 `writeScopes` 的"重叠路径只警告不阻止"都突然有了意义：
两台机器真的会碰同一批文件）。

**为什么不建议现在做**：这要求实验包长出 remote provider（上游的活，本插件不做上游改动——
`docs/project-plan.md:98`）；它会新增一个**写入者模型**（现在只有"人在控制台接管"这一种），
而 0.8.0 刚刚用一整轮把"让 DSH 变成参与者"那条路删掉（`docs/project-plan.md:15-21`）。
**先记下来，不排期。**

---

## 5. 如果要动手，顺序与判据

按"判据可执行、给数字"（`docs/project-plan.md:102`）来写。

| 步 | 做什么 | 判据 |
| --- | --- | --- |
| 0 | **实机确认 overlay 那条**：写一份只含 `insert` 的 yml，`name` 指向本仓库 `lib/index.js`，跑 `dsh web --patch <yml>` | 两半都起来：`/plugins/events` 里出现该插件的 `rev`，页面上设置页与面板行都在（读代码已推出这个结论，这一步是把它变成事实） |
| 1 | `icon` + `./locale/*.json` 的 `meta.title`/`meta.description`（S8） | 插件页该卡片有图标与中英标题（`package.json` 加字段即可，无运行期风险） |
| 2 | 发送方铸造 `commandId` + 源站 TTL 窗口内去重（S5.1） | 新测试：同一 `commandId` 连发两次，源站的 `prompt` 只被调用**一次**，两次都拿到 `accepted` |
| 3 | 准入裁决计数（S4）：接受/去重/判为历史/拒绝并补读各自计数进 `state` | 线上或 e2e 制造一个洞，`state` 里"拒绝→补读→洞归零"**三个数都出现**（未解问题 #1 的判据从"希望"变成"读数"） |
| 4 | 投影化流式文本（S3）：派生没变不发帧 | 同一段思考的字节数**降下来**（现在是每 150 ms 整段重发）；控制台渲染不变 |
| 5 | 角色拆层（S1）：server / origin 两个 bundle | 源站那份 profile 的进程里**不开** `<port>` 监听；服务器那份不含发布链路的行 |
| 6 | scoped 模型工具（S7，与 S6 的授予同时做） | 服务器上的 agent 能列机器/会话、读一段远端 transcript；**写入类工具默认关** |

**不做什么**（与 `docs/project-plan.md:94-98` 的负向清单一致）：不物化、不写别人的会话日志、
不引入上游源码补丁、不 fork 上游、**不对实验包建立依赖**。

---

## 6. 证据索引

| 断言 | 出处 |
| --- | --- |
| 层序、`later layers win per row`、config 整体替换、未命中只警告 | `apps/cli/reference/README.md:9` |
| overlay 插入行可用 `file://` 绝对名；未命中目标报 stderr | `apps/cli/tests/dump-config-schema.spec.ts:344-351,390-397` |
| overlay 用绝对路径当插件名**真的加载**，且该行 `config` 投给 `apply` | `apps/cli/tests/built-bin.e2e.ts:445-457` |
| 浏览器半边来自"扫描 Host loader 条目里的 `dsh.client`"；缺 `./client` 直接报错 | `packages/client/modules/src/index.ts:2-3,847` |
| 激活扫描遍历 **所有** loader 条目（不区分由哪一层插入） | `packages/client/modules/src/index.ts:636-639` |
| 行名为 `.`/`file:`/绝对路径时按 path-like 定位，最近的声明该名的祖先 manifest 拥有该模块 | `packages/client/modules/src/index.ts:860-875` |
| 可选 bundle 的 `icon` + `locale` 显示元数据 | `2026-09-21-experimental-capabilities-as-optional-bundles.zh.md:13` |
| 可选名单由启动器决定，包不能自称 | `2026-09-15-shipped-optional-bundles.zh.md:13,23` |
| 实验包不得被(稳定)外部包运行时依赖 | `2026-08-18-experimental-agent-teams-packages.zh.md:17,39` |
| 单进程 / 共享 cwd / 无远端成员 / 跨进程不保证 | `agent-team/README.zh.md:206,210,224-226` |
| 投影只替换被触及集合、仅邮箱变化不发帧、失败挨着最后有效状态 | `agent-team/README.zh.md:177`、`client-ui-agent-team/README.zh.md:32,40,52` |
| 不变式伴生在 append 前拒绝非法转换 | `agent-team/README.zh.md:125,147` |
| 上限是启动时校验的部署值，耗尽给类型化错误 | `agent-team/README.zh.md:49-55,108` |
| scoped 注册、disposer 逆序撤销、作用域覆盖同名全局 | `tool-agent-team/README.zh.md:84,86,99,103` |
| 本插件：`isServer` 决定角色 | `src/host/service.ts:422` |
| 本插件：`from` 是服务器自己的机器名 | `src/host/service.ts:423` |
| 本插件：`commandId` 由 server 每次铸造；只 flush `pending`；终态挡重复 ack | `src/host/hub.ts:456-467,496,532` |
| 本插件：源站准入**不按** `commandId` 去重 | `src/host/service.ts:1089-1100` |
| 本插件：流式文本每 tick 整段重发 | `src/host/service.ts:1064-1073` |
| 本插件：**没有任何**模型工具注册 | `grep ctx.tools\|registerTool\|tools.register src/` = 0 |
| 本插件：`package.json` 无 `icon` | `package.json:1-41` |
| 8 MB/4000 条、12.5 MB 单帧、10–20 s 一页 | `PROGRESS.md` §3 |
| 洞修复线上从未被观测到 | `PROGRESS.md:267-269`、`docs/project-plan.md:54` |
| 最硬的一条规矩：插件永不写 DSH 的会话日志 | `docs/project-plan.md:92` |
| 远程 teammate 的代价：不碰上游、不新增写入者模型 | `docs/project-plan.md:15-21,98` |

---

## 7. 附：如果改造服务端官方 DSH，能不能读写各机器会话

> 这一节回答一个**被 `docs/project-plan.md:97-98` 明确排除**的分支——"不追求官方整页，除非上游出现
> 'Host 能读一条它没有的会话'的接缝（那是 Host 侧改动，本项目不做）"。
> 问法换了：**如果就是改 Host，能不能做到。** 结论是"读能、写要发明一个不存在的缝"，
> 而两者的代价**不对称**。下面每条都指到行号。

### 7.1 读：**能**，而且上游是**明确邀请**第三方做这件事的

关键发现是三段拼起来的：

1. **`ctx.sessionPersistence` 是一个 seam，不是一个框架**：本包"只导出抽象 `SessionPersistence` 服务、
   `SessionHandle` 约定…**每个提供方拥有自己完整的存储运行时**"，并且"**第三方后端可以直接实现该服务**"
   （`packages/session/session-persistence/README.zh.md:32,79`）。
   服务面是 `create / open(id,'read'|'write') / stat / list / flush`（同文件 `:36-45`）。
2. **工作区记账就是被 `list()` 喂的**：`WorkspaceRegistry.listStoredHeaders()` 直接
   `const snapshots = await this.ctx.sessionPersistence.list()`（`packages/workspace/workspace/src/index.ts:824-828`），
   再 `indexHeaders(...)` 进成员表。
3. 于是**一个"远程提供方"把镜像会话列出来，它们就会出现在官方工作区列表里**，
   历史由 Host 自己的路径服务（客户端 `sessions.retain(target)` 打开的是 Host 的历史/follow，
   `packages/api/session-controller/README.zh.md:72`）。

**但有三个硬约束，第一个是真障碍：**

| 约束 | 事实 | 对本插件的含义 |
| --- | --- | --- |
| **cwd 必须在本机解析成真目录** | `indexHeader()` 取 `header.cwd`；没有 ⇒ 标为 `header has no cwd`；有则 `realpathNormalize` + `stat(...).isDirectory()`，失败 ⇒ `cwd does not resolve` / `is not a directory`，**该会话被从成员里滤掉**并记一条 `workspace '…' filtered session '…'`（`workspace/workspace/src/index.ts:806-821,836-850`） | 源站的 `C:\Users\…\proj` 在 Linux 服务器上不存在 ⇒ 要么**给每台机器建影子目录并把 header 的 cwd 映射过去**（不改上游，但要发明"路径映射"这个概念），要么**放宽这个检查**（改上游，大概一个字段的量） |
| **只追加、连续 seq、不返回撕裂尾部** | 提供方必须遵守的不变量（`session-persistence/README.zh.md:83-88`） | 镜像是**尾部 4000 条 + 可能有洞**：低端以下的 seq 提供不出来。要么窗口足够，要么提供方**能按需向源站读页**（本插件已有这条能力），否则"连续"这条不成立 |
| **单写者 / 冷读** | 每个后端实例内每会话一个写者；产品 JSONL 提供方靠内核锁跨进程提供租约（同文件 `:53,149`） | 远程会话只有源站是写者 ⇒ 提供方对它**只能给 read 句柄**；而 `ctx.sessionPersistence` 是**单个**服务，所以这个提供方得**联邦**：本地会话委托给产品 JSONL 后端，借用会话自己服务。这是 R0 的主要工程量 |

**顺带一条已经在产品里的形状**：恢复（agent-loop）会用写句柄把 `interruptedTurnClosers` 追加进日志，
而**只读观察方（session-query）只在内存里配平**中断的冷日志（`session-persistence/README.zh.md:61`）。
也就是说"只读地看一条被中断的日志"在上游是**已经存在**的能力，不必发明。

### 7.2 写：**难的那一半，而且难点不在持久化**

官方 `prompt` 落到本机 agent-loop：它会恢复会话、追加事件（`session/end-seed`、回合骨架），
让 Host 从记录者变成**参与者**——这正是 0.8.0 用一整轮删掉的那条路（`docs/project-plan.md:15-21`）。
持久化提供方**管不住这件事**，因为提供方只是存储，写来自 loop。

**但上游已经有一个现成的形状**："会话存在、可读、**但不会运行模型步骤**"：

- `ArchivedSessionGate` 读 `ctx.workspaceRegistry.archivedSessionIds`，挂 `agent/pre-step`，
  **拒绝**为已归档会话（及其子代理后代）提出的步骤（`packages/api/session-controller/src/archived-session-gate.ts:23-52`；
  装配处 `src/index.ts:162-165`：`"An archived Session, or a subagent descendant of one, runs no model step"`）。
- 归档本身是一个**公开服务方法** + durable 集合：`workspaceRegistry.archiveSession()` / `unarchiveSession()`
  （`workspace/workspace/src/index.ts:363-386,397-406`），状态在 schema 里（`spec.ts:62` 的 `archivedSessionIds`）。

所以"**只读镜像**"的准入不需要发明。**缺的只有一件：把 prompt 路由到别处。**
`session.prompt` 目前必然落到本机 loop；要送到源站，必须在 session-controller 层新增一个
"这条会话的发言**由外部拥有**"的缝——而且它必须与 `pre-step` 门禁**并存**，
否则就变成"既能被拒绝、又能被本地执行"。这是整件事里**唯一必须新增**的缝。

**另外有一条白拿的**：官方 prompt **自己就按 `requestId` 幂等**——
`commands.ts:330` `if (hasPromptRequest(agent, request.requestId)) return { accepted: true }`，
而 `hasPromptRequest`（`:602-612`）扫的是 durable user source 的 `rpcId`。
本插件现在**每次投递都新铸一个 `requestId`**（`src/host/service.ts:1103` `mintRequestId()`），
**等于把上游已经提供的幂等扔掉了**：改成用 `commandId` 派生 `requestId`，重复投递就由 Host 自己挡住——
比 §2/S5 里"自己记一张去重表"更省、更对。

### 7.3 建议的取舍

| 做法 | 读 | 写 | 上游改动 | 结论 |
| --- | --- | --- | --- | --- |
| **R0** 远程 persistence 提供方（联邦本地 JSONL） | 官方工作区列表 + 官方历史页 | ✗（写仍走本插件接管框） | 无 | **值得**——P1#6"控制台是抄的 UI"从根上消失；代价是路径映射 + 按需补页 + 联邦 |
| **R1** R0 + 一个"cwd 由提供方声明、不经本机 stat"的口子 | 同上，且不必造影子目录 | ✗ | 小（一个字段） | 若用户愿意维护一个补丁，比 R0 干净 |
| **R2** 官方页 + 官方输入框直接写到源站 | 同上 | ✓ | **中**（新增"外部拥有的 prompt"缝） | **不建议**——它就是 0.8.0 证伪过的"Host 成为参与者"，只是换了个入口 |
| **折中（实际建议）** | R0/R1 | 保持现状：客户端把 shipped 输入框的座位换成接管框（本插件已在做，`README.md:116-122`） | 无（或仅 R1 那一个字段） | **官方页负责读得好看，插件负责写得对**；两边都不越界 |

### 7.4 谁才是写者：单写者是**被强制**的，且永远只有一个

"客户端和服务端都能写吗"这个问法在 DSH 里不成立，因为**每条会话只有一个写者，而且是双重强制的**：

- **进程内**：JSONL 后端为每个会话保留一个 `writers` 槽，第二次以写模式打开直接
  `SessionAlreadyOwnedError`（`packages/session/session-persistence-jsonl/src/storage.ts:386-431,484-498`）。
- **跨进程**：`lease.ts` 用**内核锁**（POSIX `flock(2)`，Windows 具名信号量）锁住会话产物目录，
  冲突同样映射为 `SessionAlreadyOwnedError`，"**Readers never touch the lock**"，
  进程死亡由内核释放锁，而且"**故意不设过期**"——以免征用了一个卡住的写者、让它恢复后的 append 落在后面
  （`packages/session/session-persistence-jsonl/src/lease.ts:2-27,64-68`）。
- **控制器层**把这件事暴露成一个具名错误：`session/writer-held`
  （`packages/api/session-controller/src/types.ts:213`、`commands.ts:536`、`agent.ts:219`）。
- **浏览器客户端从不持有写者**：它的提交只是本地回显（"回显只存在于 Client 内存"，
  `api/session-controller/README.zh.md:48`），真正的准入在 Host（`commands.ts:330` 那处 `requestId` 幂等
  就是准入点的检查）。

对映到本插件的四组关系：

| 谁 → 谁 | 能不能写 | 机制 |
| --- | --- | --- |
| 插件**浏览器半边** → 任何地方 | 不能直接写 | 它只有 HTTP（`src/index.ts:106-181`：`POST /config`、`POST /command`）；它**请求**自己的 Host |
| **服务器 Host** → 镜像会话 | **不能**（也不该） | 镜像在内存里，服务器对那条会话没有写句柄 |
| **服务器 Host** → 源站会话 | 只能**间接**：把 prompt 排队送过去 | 落笔的是源站的 agent-loop（`controller.prompt(...)`，`src/host/service.ts:1102-1108`） |
| **源站 Host** → 自己的会话 | 能，且**只有它**能 | 它持有那条会话的写句柄（agent-loop 是生产环境的获取点，persistence README `:28,151`） |

**所以：读是对称的（两台机器都能读对方发布的会话），写是单向的（只有拥有者写，另一端只能请求它写）。**
§7.3 的 R2 也不改变这条——它只是把 prompt 从"插进本机队列"改成"转发到源站"，**落笔仍在源站**。
但反过来说，**这条性质不会自动成立**：R0/R1 必须靠两件事强制它——provider 对借用会话
**只发 read 句柄**（否则服务器 Host 会真去开写），以及 `pre-step` 门禁挡住本机执行。
**物化那条路当年正是栽在这里**：它让服务器的 DSH 成了同一条会话的**第二个写者**（往副本里写）。

---

## 8. 方案：把写做成「生产者自声明的 user 角色消息」（**不需要改上游**）

目标：插件把一条来自别处的东西，**以用户级消息的形式**写进目标会话，同时**不伪装成用户本人**。
上游把这件事做成了一条**受邀请的**接缝，三件东西都是现成的。

### 8.1 三件现成的东西

**(1) 落笔的 API 是 Agent 句柄，不是"会话存储"。**
`handle.agent.followup(message)`（下一个轮次）与 `handle.agent.steer(message)`（下一个步骤边界）
"把带标识的 **user 角色消息**路由进 agent 的收件箱"（`packages/core/agent/README.zh.md:47`），
而且"`followup`、`steer` 与 `inject` 以带标识的 **user 角色消息**馈送所属会话；被接纳的内容成为
模型在后续步骤中读取的**派生历史**的一部分"（同文件 `:144`）。

**shipped 的 `sessionController.prompt` 就是它的薄包装**——这一点读代码才看得准：

```ts
// packages/api/session-controller/src/commands.ts:331-333,355,364-365
const source: MessageSource = { kind: 'user', rpcId: request.requestId, ... }
const message: UserMessage = createUserMessage({ content, source })
if (request.mode === 'steer') agent.steer(message)
else agent.followup(message)
```

也就是说：**"模拟用户级写"不是绕过控制器，而是控制器本身在做的事**；插件完全可以在
源站自己调这两个方法。

**(2) 来源是"每个生产者自己声明自己的 kind"，且上游明说 user 消息可以带任何生产者的 kind。**
`MessageSourceMap` 的文档原话：**"Merge-extensible sum type — each producer declares its own `kind`
in its own module; there is no shared catch-all `plugin` kind. Model and tool sources answer their role
messages; **user messages carry any producer's kind**, and consumers fall through unknown kinds."**
（`packages/llm/llm/src/message.ts:103-115`）

两个先例，形状可以直接照抄：

| 谁 | 它声明了什么 | 出处 |
| --- | --- | --- |
| shipped 控制器自己 | `'user-rpc': { kind: 'user'; rpcId: SessionRequestId; clientTimeZone?: string }` | `packages/api/session-controller/src/types.ts:400-405` |
| agent-team | `'team-message': { kind: 'team-message'; teamId; messageId; senderId; senderName }`——**而它的投递就是"每条已投递 peer 消息都是用户角色消息"** | `packages/experimental/agent-team/src/types.ts:138-149`、`agent-team/README.zh.md:187` |

⇒ 本插件照这个形状声明自己的：`'session-sync': { kind: 'session-sync'; machine; sessionId; commandId }`。
**注意**：不要写 `{ kind: 'plugin', plugin: … }`——那是 v3 格式的旧形状（v3→v4 迁移会把它重写成
`plugin:<name>`，见 `packages/session/session-format-v3-to-v4/tests/sources.spec.ts:62,74`），
当前词汇里没有这个 catch-all。

**(3) 内容形态的词表里已经有本插件需要的两个词。**

| `ContextForm` | 上游定义 | 对本插件 |
| --- | --- | --- |
| `'recall'` | "Material lifted out of **another session's log**, possibly reduced on the way in" | **跨机器搬来的内容就是这个** |
| `'relay'` | "A message **another agent** addressed to this one" | 服务器上代发的 prompt |

（`packages/llm/llm/src/message.ts:55-67`）

### 8.2 方案怎么落

```text
服务器（借用方，不写）            源站（唯一写者）
控制台/官方页  ──prompt──▶ hub ──DownstreamCommand──▶ 插件
                                                       │ ctx.agents.get(sessionId)（冷则 resume）
                                                       │ createUserMessage({ content, source: {
                                                       │   kind: 'session-sync', machine, sessionId, commandId }})
                                                       ▼
                                             agent.followup(msg)  ← 下一轮
                                             agent.steer(msg)     ← 步骤边界
```

结果：这条消息**在模型眼里就是用户输入**（进收件箱、进保留历史、被当作用户批次读），
但在日志与 UI 里**诚实地写着它来自哪台机器的 session-sync**——也就是 §2/S6 想要的归因。

**落笔仍在源站**：§7.4 的单写者结论不变，这条方案只是换掉了"源站以什么身份落笔"。

### 8.3 代价：两条必须写清的取舍

| 取舍 | 走 `sessionController.prompt`（现状） | 走 Agent API + 自声明 source（本方案） |
| --- | --- | --- |
| **上游白送的幂等** | **有**：`hasPromptRequest` 认 `source.kind === 'user' && source.rpcId === requestId`，重复 prompt 直接 `{ accepted: true }`（`commands.ts:330,602-612`） | **没有**：自声明 source 不命中那条检查 ⇒ 插件必须自己按 `commandId` 去重（§2/S5.1 那张表就是它） |
| **来源归因** | 无：与用户手打**不可区分** | **有**：日志/UI 里写清机器与会话 |
| **准入校验** | 齐全：附件准入 `ctx.attachments.admitPromptContent`、图片模型能力、`fileUploads` 凭据、准入期间 agent 被销毁的复查（`commands.ts:336-376`） | **跳过**：纯文本没问题；带附件/图片要么走控制器，要么自己复刻这几步 |

**所以这是一个二选一，不能都要**：要么"有幂等、无归因"，要么"有归因、自己管幂等"。
（能都要的唯一办法是上游在 prompt 请求里允许带 source——那是改上游，属 §7 那条分支。）

另外一条不论哪条路都存在、但要知道的：`resolveAgent()` 会**恢复冷会话**（`commands.ts:329`），
而恢复会用写句柄追加 `interruptedTurnClosers`（`session-persistence/README.zh.md:61`）。
本插件现在的接管已经是这个行为，不算新增。

### 8.4 顺带找到的第三个接缝（不建议用于"代表用户发言"）

`agent/pre-step` 的 `enter` 分支带**完整、带标识且冻结的消息批次**，
监听器可以**替换进入该步骤的消息**（`packages/core/agent/README.zh.md:85`：

> `PreStepDecision` 要么是 `{ kind: 'reject' }`，要么是 `{ kind: 'enter', messages, startsRequestSeries? }`。

这把"在准入那一刻注入内容"变成可能，代价是**它不进收件箱投影**（`agent/inbox/*` 不会有它），
"接纳不等于提交"也让失败更难看见。**适合附带上下文，不适合代表用户发言**——
代表用户发言应当走 8.1 的 `followup`/`steer`，因为那才是"可被看见的待处理输入"。

### 8.5 落地要点（与本插件现有架构的接法）

- 本插件的 Host 半边**不 import 任何 `@deepseek-ai/*`**，而是把消费的服务**结构化声明**在
  `src/host/dsh.ts`（见 `README.md:498-502`）。所以这一条就是往 `dsh.ts` 里再加一个
  `AgentRegistryLike`（`get(id)` / `resume(...)`）与 `UserMessageLike` 的形状，**不新增依赖**。
- 触发点仍是现有的 `runCommand`（`src/host/service.ts:1084-1114`）：把它的
  `controller.prompt(...)` 换成一次 `agents.get(id).followup|steer(...)`；
  发布检查、TTL 检查、ack 三态**都不用动**。
- **验收判据**：同一 `commandId` 连发两次 ⇒ 源站的收件箱里只有**一条**消息（幂等由插件自己保证）；
  源站日志里那条消息的 `source.kind === 'session-sync'` 且带 `machine`/`sessionId`；
  控制台/官方页把它显示为"来自 X 机器"而非用户本人。

---

## 9. 服务端能不能替人**做选择**（提问 / 审批）

能，而且这是比"代发 prompt"更成熟的一条路——上游的交互 seam 天生就是
"**提供方无关 + 可承接**"的形状。但它与 §8 是**两条不同的路**，见 9.5。

### 9.1 两个 seam 的形状一样：**waterfall，谁先应答谁占据唯一决策槽位**

| | 提问 | 审批 |
| --- | --- | --- |
| 服务 | `ctx.userQuestions.ask(request)` | `ctx.approval.request(req)` |
| 事件 | `'user-questions/request'`，`@mode waterfall` | `'approval/request'`，`@mode waterfall` |
| 语义 | 工具/权限插件在"**人类回答后 agent 才能继续**"时使用 | "这个具体操作是否可以继续？" |
| 派发 | **scope-filtered**：agent-scoped 监听器只收到自己那个 agent | 同左 |
| 应答 | 返回答案 = **claim**；调 `next()` = 委托 | 同左；"第一个应答占据唯一的决策槽位" |
| 出处 | `docs/subsystems/user-questions.zh.md:5,164,174` | `docs/subsystems/approval.zh.md:5,86,154-167` |

两条都有 `{ prepend: true }` 的注册位（`user-approval/tests/approval.spec.ts:437`），
也就是**插件可以挤到 shipped UI 应答者前面**。

于是"服务端替人做选择"的机制就是：**源站插件注册一个 agent-scoped 的应答者，把请求送到控制台，
人点选后回传，listener 返回答案即 claim。** 不需要改上游——`ctx.userQuestions` / `ctx.approval`
都是随附服务。

### 9.2 两种交互在**镜像里**的可见程度不同（这决定控制台能不能把它们画出来）

| | 落日志吗 | 镜像（本插件）能看到什么 |
| --- | --- | --- |
| **审批** | **有专门的审计事件对**：`request()` "追加 `approval/asked`，获取一个结果，追加对应的 `approval/decided`"；而且是"**仅记录日志的审计事件对**"，**不进入模型 transcript**（`approval.zh.md:86,88`） | 控制台可以显示"某台机器上有一条审批在等人"以及它最终被怎么裁决了——**这是上游已经保证的** |
| **提问** | 没有专门的日志事件对；但**提问是工具调用的参数、答案是工具结果**：`ask_user` 的 `execute` 里 `await ctx.userQuestions.ask({ questions, agent: exec.agent, signal })` 并把答案作为工具结果返回（`packages/interaction/tool-ask-user/src/index.ts:79-98`） | 以**工具卡**的形式可见：问题与选项在参数里、选中项在结果里 |

**所以两条都能在控制台上呈现**，只是载体不同（一条是审计事件，一条是工具卡）。

### 9.3 方案

```text
源站（agent 正在跑的进程）                      服务器（控制台）
agent 调 ask_user / 触发审批
      │ ctx.userQuestions.ask({ agent, questions })   ← 等一个 Promise
      ▼
waterfall: user-questions/request ──▶ 插件注册的 answerer（prepend）
                                        │ 经同步链路送到控制台
                                        │ 人点选
                                        ▼ 答案经 DownstreamCommand 回来
                                      listener return 答案  ⇒ claim
```

**必须做的设计决定：本地 UI 与远端控制台谁答**（waterfall 只有一个赢家）：

| 策略 | 做法 | 代价 |
| --- | --- | --- |
| **本地优先** | listener 直接 `next()`，只**旁路**把请求发给控制台做只读展示 | 远端只能看"正在问什么"，不能答——最保守 |
| **远端优先** | listener claim，不再 `next()` | 源站本机的人**看不到**这条提问了（除非插件自己也在本机画一个） |
| **两边竞速（推荐）** | `prepend` 注册，同时把请求交给本地 UI 与远端控制台，**先答者 claim**，另一边收尾撤下 | 要处理"答完另一边还挂着"的收尾；本机 UI 需要插件显式把自己作为 answerer 参与 |

### 9.4 边界（都是好消息，但要知道）

- **`never` 策略在 waterfall 之前强制**，所以"以 `prepend` 注册的应答者也无法绕过它"
  （`approval.zh.md:86`）。⇒ **源站自己的策略仍然最高**：插件不能替源站把一条被策略拒绝的审批放行。
- **只有运行时根才有人类应答者**：`ask()` 的文档写明"human interaction is valid only for the exact live
  runtime root … an **owned child has no human answerer and would block forever**"
  （`user-questions.zh.md:138-149`）。⇒ 插件只对它发布的那类**顶层会话**有意义，
  这也正好是本插件发布的东西（子代理/teammate 的提问按设计不该由人答）。
- **安全**：审批是权限裁决的替代品。"让服务器上的人批准另一台机器上的工具调用"必须与
  §2/S6 的授予一起做——否则等于把远端机器的权限裁决权交给任何能进控制台的人。
  这也是 §7.4 里那句"写是单向的、且必须被强制"延伸到**裁决**上的同一条规矩。

### 9.5 与 §8 的分工（互补，不重叠）

| | §8 代表用户**发言** | §9 代替用户**裁决** |
| --- | --- | --- |
| 落笔形态 | 一条 **user 角色消息**（`followup`/`steer`） | 一个**被等待的返回值**（工具结果 / 审批结果） |
| 模型看得见 | **看得见**，成为保留历史的一部分 | 提问：以工具结果可见；审批：**不进入 transcript**，模型只看到调用方派生的工具结果 |
| 需要来源归因吗 | 需要（否则与用户手打不可区分） | **不需要**（模型看不到"谁答的"） |
| 幂等 | 插件自己保证（§8.3 的取舍） | 由 waterfall 的"唯一决策槽位"天然保证——**第一个应答即唯一结果** |
