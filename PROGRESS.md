# dsh-session-sync 推进记录

> 只写被证据支撑的事实：跑过的命令、测到的数字、看到的现象。每条结论都要能指出它是怎么被验证的。
> 本文件不参与构建。最近更新：2026-09-25（长会话回填的根因是"一批装不下"，已修；未上线）

## 0. 现状一眼看

| 项 | 值 |
| --- | --- |
| 仓库 | `C:\Users\14339\Desktop\git\dsh-session-sync` |
| 版本 | 本地 = 远端 = `db28d2e`（降级阶梯那次提交） |
| 服务器 | `210.16.120.228` · Ubuntu 24.04 · **DSH `0.1.7-rc.2`（npm `next` 通道，未打补丁）** · 插件 `db28d2e` · unit `dsh-web.service` · active |
| 本机 | DSH 源码运行（checkout = `dsh-v0.1.7-rc.1` 标签），运行时用 rc.1 源码 |
| 控制台 | `https://dsh.c-zy.cc/?token=<43 位>` |
| 镜像 | **内存态**：服务器一重启就没了，靠源站 10 秒 reconcile + follow 快照重建 |
| 同步口 | `210.16.120.228:8791`（源站连它；**不经** Cloudflare） |

**2026-09-24 服务器更新**：DSH → 最新发布版 `0.1.7-rc.2`，插件 → `db28d2e`。**顺序很重要：先插件、后 DSH**——补丁那份产物只对 alpha.2 有效，升版后控制台靠插件里的 `scope` 路线画原件，而旧插件只会 `adopt`，顺序颠倒会掉回手绘面板。

线上实测：控制台画的是 **DSH 原件**（shipped 头部 `deepseek-flash · low`/`完全权限`、`用时 3 秒 ⌄` 回合折叠、shipped 操作行与 `3 轮 · 28 步 · 18 tok/s` 状态行），输入框由插件接管（`在服务器侧接管续聊…`），会话树无「缺 N 条」。新缓存目录 `4f4f47d9854f3c73` 里 `is a mirror and accepts no prompt` = **0**，即**补丁已随版本失效且不再需要**；`patches/` 保留给"想让 shipped 输入框也能发言"的宿主与 alpha.2 回滚路径。回滚 unit：`/etc/systemd/system/dsh-web.service.bak-2026-09-24-173039`。

只改 `src/client/**` 的提交（如 `d535743`、阶梯那次的主体）→ **不需要重启本机源站**；任何改到 `src/host/**`、`src/shared/**`、`src/index.ts` 的提交都**需要用户重启本机**（会杀掉当时正在跑的那个会话）。

---

## 0.5 任务清单（进行中，随进展更新）

目标：**让镜像会话在同步服务器上成为"真会话"**（Host 侧适配），于是 DSH 自己的历史分页/跳转/面板全部可用，
而写入（prompt / fork / 反馈）仍回源站。方案与证据见 `docs/host-side-session-plan.md`。

| # | 任务 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | **长会话回填**（镜像只有尾部窗口时，翻到 seq 0 再物化） | ✅ **通了**（2026-09-25，见下） | 根因不是分页也不是链路，而是**一批装不下**：回填自己走完 3478 事件，物化 `written 3478 / skipped 0 / archived true` |
| 2 | **增量追加**：物化后持有 handle，新帧继续 append | ⏳ 未开始 | 现在写完即 `close()`，物化后新事件不会进日志 |
| 3 | **自动物化**：会话被镜像/发布时自动触发 | ⏳ 未开始 | 现在只能手工 `POST /dsh-session-sync/materialize` |
| 4 | **部署到服务器并线上验证** | ⏳ 未开始 | 服务器插件仍是 `242bb8f`；物化相关改动（`0b206f9` 起）都还没上线。**顺序：先升服务器、后重启本机**（见下） |
| 5 | **撤掉客户端伪装**（合成 id / `retainAgentScope` / 自绘「加载更早」退休） | ⏳ 未开始 | 依赖 1–4：不先让长会话有完整历史，撤掉伪装会立刻退化成"看不到历史" |
| 6 | **文档与版本**（README + 本文件 + 版本号） | 🔶 随做随记 | 本节已改；插件版本仍 `0.3.0` |

### 1 的根因与证据（2026-09-25，已在两个一次性实例上端到端复现并修好）

**上一轮写的"下一步"（修 follow 开场快照的韧性）方向对了一半，但它不是根因。** 真正的因果链是：

```text
物化要先回填 ⇒ 服务器向源站要 {kind:'older'} 页 ⇒ 源站 pullOlder 要用 follow 的 cursor 当 throughSeq
                                        ⇒ cursor 一直是 -1 ⇒ 源站直接 return，一页都不读
cursor 为什么一直是 -1：follow 的开场快照是**一整帧**，源站把它交给 /frames 时
                        那一批是 12 MB，而服务器 MAX_BODY_BYTES = 4 MB ⇒ 每次都被拒
                        同一批在每次重连后原样重发 ⇒ 永远拒 ⇒ 快照永远"没送完"
```

**实测数字（源站 `session-f6ba2b3b`，3479 条日志）**：

| 量 | 值 | 怎么测的 |
| --- | --- | --- |
| 整场日志作为**一个** `/frames` body | **12.55 MB** | 解压源站 `session.v4.jsonl.zstd`，按 `{sessionId,events}` 序列化后量长度 |
| 最新 400 条 | 1.04 MB | 同上 |
| 最新 1000 条 | 3.15 MB | 同上 |
| 服务器上一批的实测体积 | **426 KB / 222 条**（短会话） | 源站 state 的新字段 `batch` |
| 修复后同一条长会话 | 镜像 320 → **3478** 条，`missingEvents: 0` | 服务器 state |
| 修复后源站读页 | `records: 3158, hasMore: false, throughSeq: 3477` | 源站 state 的 `page`（上一轮这里只有 `throughSeq: -1` + 报错） |
| 修复后物化 | `written 3478 / skipped 0 / archived true`，日志 3479 条 / seq 0..3477，头尾类型与源站相同 | `POST /materialize` + 逐帧解压比对 |

**改了什么**（提交 `ff98129`）：

1. `batchEvents()`（`shared/protocol.ts`）按**字节预算**切批，保序、不丢件；单条超过整个预算时**单独成批**（宁可让服务器按名字拒它，也不在发送端静默丢）。
2. `MAX_BODY_BYTES`（4 MB）与 `FRAMES_BODY_BYTES`（2 MB）搬进共享协议——发送端的预算从**接收端真正执行的限制**推导，而不是各自猜一个数。
3. 服务器对超大 body **先按 `content-length` 回 413**（带字节数），不再"读到一半抛异常"：那样 Node 会重置连接，发送端只看到网络错误，于是把同一批重试到天荒地老。

**这一条为什么之前查不出来**：发送端唯一能看到的证据是"服务器答了 413"，而**那批到底多大**没有任何地方记。现在 state 里有 `batch`（最大批字节数/条数/切了几批/还排队多少）和 `follows[]`（每会话 `cursor`、`opened`、`firstSeq..lastSeq`、`pending`），以及 `page.reason` 的具名取值（`no-cursor` 等）。`cursor: -1` 从此区分得开"刚打开"和"开场一小时没成"。

**上线顺序（`ff98129` 起）**：

1. **先升服务器**（`210.16.120.228`）：它现在的版本收不下大 body、也不会回 413，先换成带 413 的版本——**服务器侧只多接一个 413 分支，旧源站照旧工作**，所以这一步单独上是安全的、可停可留。
2. **再重启本机源站**：本机插件才带切批逻辑（`batchEvents`）。重启会杀掉本机正在跑的会话，**要先问用户**。
3. 之后线上验证只看两个数字：服务器 state 里该会话的 `eventCount` 是否等于源站日志条数、`missingEvents` 是否为 0；以及源站 `page.reason` 是否消失（即读页真的发生了）。

> 反过来（先重启本机、后升服务器）不会坏，但中间那段仍然会撞 4 MB：源站切好的批 ≤2 MB，旧服务器照样只认 ≤4 MB，所以**只要本机先带切批就没有硬卡点**——顺序的真正约束是"服务器得能回 413，才不会让发送端把网络错误当重试理由"。



**环境坑（已记）**：`job_kill` 只杀 pwsh 外壳，**node 子进程会活着**——曾出现 8799 上听着残留实例、
源站连它而我查询另一台（3099），两台镜像各自为政，浪费了一轮排查。清理要按 `--port 3098/3099` 精确杀进程。

---

## 1. 环境与访问事实

- **SSH**：`root@210.16.120.228`，只能用 `~/.ssh/id_ed25519_dsh`；客户端是 `OpenSSH_for_windows_7.7p1`。
- **控制台 token**：`grep -o 'token=[A-Za-z0-9_-]*' /root/dsh-web.log | tail -1`。用它 `GET /?token=…` 换一个签名 cookie（`dsh-auth-<hash>`，密钥存在 credentials 里，**持久**）——所以**服务器重启后旧 cookie 仍然可用**，不必每次重新取 token。
- **服务器只绑 `127.0.0.1:3080`**，前面是 nginx + Cloudflare（灰云）。
- **服务器 profile**：`/root/.dsh/profiles/web`（pnpm 装的是 `codeload.github.com/…/tar.gz/<commit>`）。
- **本机配置**：`~/.dsh/dsh-session-sync.json` —— `machineName: DESKTOP-M1EERFC`、`serverUrl: 210.16.120.228:8791`、`syncSessions` = 两个会话 id。
- **GitHub**：`~/.dsh/tools/gh/bin/gh.exe` 已不存在；token 在 **Windows 凭据管理器** `gh:github.com:cczzyy-cn`，推送时用 P/Invoke `CredRead` 读出，临时改 remote URL，推完还原。
- **端口 22 会短暂不可达**（实测约 2 分钟；同一时刻 8791 也不可达，443/80 与经 Cloudflare 的 web 正常；服务器上**没有 fail2ban、没有针对本机 IP 的 DROP 规则**）。所以"连不上"先按链路抖动处理，不要急着改配置。
- **`DSH_HOME` 会被 harness 覆写注入**：本会话的 shell 子进程里 `$env:DSH_HOME` 恒等于**本机真实 home** `C:\Users\14339\.dsh`（实测：设完再读，读回来还是真实 home）。所以想让一次性实例用独立 home，**不能靠在自己这条命令里设 `$env:DSH_HOME`**——包一层 `.ps1` 再 `Start-Process -File`（已验证：探针在实例进程内读到的是参数里那个 home）。
- **一次性实例的搭法（本次实测可用）**：`$env:TEMP\dsh-mat-origin`（client，3098）与 `dsh-mat-server`（server，3099），两边 `profiles\web` 都 junction 到真实 profile。**`profiles\web` 是 junction 时 `dsh plugin add` 会把真实 profile 清空**（踩过）；正确顺序是"先装插件、再建 junction"。server 侧的 `sessions` 指向自己的空树（放一份要物化的源日志），origin 侧 junction 到真实 sessions（于是有真实长会话可回填）。
- **`.ps1` 里别用 `$Home` 当参数名**（PS 只读自动变量，报 `VariableNotWritable`）；也别用 `$pid`。

---

## 2. 推进日志（晚 → 早）

### 长会话回填通了：根因是**一批装不下**，不是分页（2026-09-25）

上一轮把卡点记成"follow 开场快照的韧性 / 分页被自锁"，方向只对了一半。真实的单一根因是**体积**：

| 提交 | 做了什么 | 为什么 |
| --- | --- | --- |
| `ff98129` | `batchEvents()` 按字节预算切批（保序、不丢件、单条超预算则单独成批）；`MAX_BODY_BYTES`/`FRAMES_BODY_BYTES` 进共享协议；服务器对超大 body **先回 413**（带字节数）再读 | 源站把 3478 条开场快照作**一个** 12 MB 的 `/frames` body 发出去，服务器上限 4 MB，每次都被拒；被拒的那批**原样留队重试**，于是快照永远送不完、`cursor` 永远 -1、要 cursor 的读页永远被拒。**一个硬上限自锁了整条链** |
| `e6e00d5` | `loadConfig` 容忍 UTF-8 BOM | 搭一次性实例时踩到：PowerShell/记事本写出的配置带 BOM，`JSON.parse` 直接拒，而"配置读不出来"被当成"没有配置文件"⇒ **全部设置静默回默认** |
| `745f702` | state 新增 `batch`（最大批字节/条数/批数/排队数）、`follows[]`（每会话 `cursor`/`opened`/`firstSeq..lastSeq`/`pending`）、`page.reason` 具名化 | 发送端唯一能看到的证据是"服务器答了 413"，而**那批多大**没有任何地方记；`cursor: -1` 也分不开"刚打开"和"开场一小时没成" |
| `eabaff6` | `tests/`：9 个确定性测试（`node --experimental-transform-types --test "tests/*.spec.ts"`） | 端到端那条用**真的**同步服务器 + 真的镜像 + 真的 client 角色引擎 + 12 MB 的假会话；**在修复前的代码上它会失败**（`timed out waiting for all 3478 events in the mirror`）——这是"测试确实抓到了这个 bug"的证据 |

**验证（两个一次性实例，同一份构建）**：源站 `page = {beforeSeq: 3158, throughSeq: 3477, records: 3158, hasMore: false}`（上一轮这里是 `throughSeq: -1` + `no follow or no page API`）；服务器镜像 `eventCount` 320 → **3478**、`missingEvents: 0`；`POST /materialize` → `written 3478 / skipped 0 / archived true`，落盘日志 3479 条 / seq 0..3477 / 头尾类型与源站逐个一致。

**顺带一条方法论教训**：上一轮把"`throughSeq: -1` + `linkError: This operation was aborted`"读成"链路抖动打断快照读"。真实的 `linkError` 是**下游效应**——被拒的 POST 触发 `reconnect()`，abort 掉了正在跑的流。**"同时出现的两个症状"很容易被读成一个因果链，而它们可能都是第三个原因的结果。**

### 镜像的旧历史终于能进 shipped 面板（2026-09-24/25）
用户报「没有加载历史会话」。查明：**镜像只持有尾部窗口**（这个会话最新 seq 已过万，窗口只有 400 条），而 shipped 面板**没有回到更早的路**——它自己的"加载更早"会去问 Host（从没听说过这个合成会话），而我当初给窗口传 `hasMore:false`，所以它连显示都没有；插件自己的分页通道此前**只有手绘面板在用**。

服务端事实：默认窗口是尾部（400 条，seq 9499..9898，`hasMore: true`），显式 `before=9476` 要一页 → 返回 298 条（seq 9178..9475）✓。

三次提交，每一步都被线上现象推着走：

| 提交 | 做了什么 | 为什么 |
| --- | --- | --- |
| `7cf951b` | `api.ts` 旧页到达时**单独通知观察者**（`older`）；`OfficialMirror.prependOlder()` 用 `prepend` 并入同一窗口；`SyncPanel` 在 shipped 面板上方放「加载更早的消息」 | 旧页是唯一"插在窗口之前"的到达，不能当 replace |
| `0de5282` | 路线标记带上窗口范围（`原件 · scope · 9574–10252`） | 分页是否到达面板，从外面看不见；低位 seq 是唯一判据 |
| `242bb8f` | **帧不再是"都是新闻"**：窗口已有的 seq 丢弃；**低于窗口下沿的当历史 prepend**（每帧一批、帧内升序＝跨帧降序正好是 prepend 语义） | 旧页会**以两条路**到达——客户端读的那页，和服务端镜像长出后源站按普通 `events` 帧重放的那份。后者被当新事件 append，于是 seq 8819 落在窗口（9418+）之前，`ui-conversation` 的装配器抛 `received non-appended Match`（`assembler.ts:538`：同一节点的 match 必须严格按 seq 递增），**事件流随之中断、面板不再更新** |

**线上实测**：点一次「加载更早的消息」，标记低位 **9873 → 9574**（一页），高位随实时流增长，面板继续正常渲染——`non-appended Match` 没有再出现。

**顺带两次教训（都是本轮被打断的原因）**：本会话两次在同一类失败上结束——模型流式返回的 tool call 参数不是合法 JSON，DeepSeek 拒绝整段请求，DSH 以 `turn/end reason=error code=MALFORMED_RESPONSE` 结束该轮，并把 `错误 本轮运行失败…` 注入 agent 收件箱（`agent/inbox/spliced`）。两次都**没有把畸形调用写进历史**（据镜像：52/52 条 `tool/call` 的 `arguments` 都能解析；且失败后的下一轮能正常发出请求）。缓解办法：**单轮更短、工具输入更小**——最长的工具参数（大段 PowerShell 内联脚本）正是最可能被截断成非法 JSON 的地方；凭据推送逻辑因此固化成 `%TEMP%\dsh-push.ps1`，以后推送是一行调用。

### 线上「历史加载失败：session "dsh-session-sync:…" not found」的定性与处置（2026-09-24）
**这是 shipped 聊天自己的错误条**（`ui-chat` 的 `chat.loadError`，`ChatView.tsx:236` 只在 `openState === 'error'` 时渲染），含义是：**有人对合成会话调用过 `open()`，Host 读了历史并回了 `session/not-found`**。

查证链（避免猜）：
- 客户端**唯一**会 open 的公开入口是 `retain()`（`service.ts:289 reference.attachOpening(this.manager.get(id).open())`）；`manager.get()` 注释明确 "no auto-open"，生产代码里也没有谁直接调 `session.open()`（只有测试会）。
- **我们这边不是发起者**：面板头部标记显示线上走的是 `scope` 路线，而 `retainAgentScope → retainScope` 不 attach opening。
- 会 retain 的 shipped 集成有一批，且都被"会话级 Host 数据"驱动：`ui-commands` 的 `sessions.using(sessionId, …)`（命令目录）、`ui-workspace/navigation.ts:387` 的 `retain(target,{source:'mainView'})`、`ui-sidebar-right/session-view.ts:33` 的 `retain(…, {source:'sidebarView'})`，以及 shipped 输入框够得着的一切。**把输入框用 CSS 藏起来并不能阻止它运行**——这正是它间歇出现的原因。

**试过并否决的方案**：feed 路线只渲染 `conversation.session`（不带 content 外壳，从根上不挂载输入框那一族）。实测**面板画成空白**——content 外壳提供的正是这个 View 所依赖的上下文。已回退，并把这条结论写进 `OfficialConversation` 的注释。

**最终处置**：
1. 头部加**路线标记**（`原件 · adopt|scope|address`，带 tooltip 说明各自代价）。这是"给定构建走哪条路"的可见事实——它当场回答了本次调查的第一个问题。
2. feed 路线（`drivesWindow` 类）在面板内隐藏两样 shipped 家具：输入框 seat（`data-composer-seat`）与那条历史失败横幅（`[class*="openError"]`）。**可匹配性有据**：shipped 的 CSS-module 类名保留了可读半段（实测 `EvIC1a_openError`），`data-composer-seat` 也在 bundle 里。横幅被藏的理由写进了 CSS 注释：它报告的是一次**本面板既不用也无法满足**的宿主读取（transcript 来自镜像），事实本身仍由路线标记呈现。

**验证**：一次性实例（本机 rc.1）上——面板正常渲染、shipped 输入框隐藏、接管输入框在、无横幅；线上部署 `6c20d5c` 后——面板头部 `原件 · scope`、内容正常、无横幅。

### 交付物相关不显示 + 「工作详情」跟随服务器设置（2026-09-24）
用户看到线上控制台一条 `GET /api/changes.summary?sessionId=dsh-session-sync:DESKTOP-M1EERFC/… 404`。查清了：

- **是谁**：官方插件 `ui-deliverables`。它从 transcript 里认出 `workspace/changes` 事件（`turn-deliverables.ts:182` 记下 `{seq}`），再按 `(sessionId, seq)` 向 **Host** 要改动摘要（`Deliverables.tsx:80`）。
- **为什么 404 无害但必须去掉**：Host 上根本没有这个合成会话。该插件的 `decode` 把 `!response.ok` 当成自己的 `'missing'`（"Host 不再提供"），而 `retryable: () => false` → 只读一次、不重试，卡片停在"不可用"。即代价 = **每条 announcement 一次 404 + 一张永远空的卡片**。
- **为什么补不了**：`workspace/changes` 的 data 只有 `{ turn }`（`workspace-changes/src/types.ts:106`），files/added/deleted 是**拥有 workspace 的那台 Host 现算**的——镜像里没有这份数据。
- **做法**：在**喂给渲染器**时过滤掉这类事件（`PANEL_ONLY_TYPES` / `isPanelOnly()`），但**仍然记下它的 seq**（那是实时行位置的基准）。镜像本身不删——服务端 `/transcript` 里仍能看到它们，所以"过滤确实生效"可以被独立证明。
- **实测**：服务器部署 `5975820` 后，镜像窗口 395 条事件里**有 2 条** `workspace/changes`，而 DevTools Console **已无** `/api/changes.summary` 404；改动文件的工具行照常显示（它们是普通事件）。

**「思考/工具详细是否展开」**——结论：**本来就跟随服务器 DSH 设置**，无需改动。
- 它由 `ui-chat` 的 `transcriptView`（工作详情：compact/standard/detailed/verbose）决定，该设置经 `ctx.configForms.get('ui-chat')` 读取（`ui-chat/src/client/apply.ts:89`），是**插件级、Host 持久化**的值（`transcript-view.ts` 注释写着 "Host-backed"，`setMode` 经 `host.set()` 写回 Host）——**不是**按会话下发的投影。
- 所以我们的面板（同一个客户端实例）读的就是同一个值：原件里的折叠/分组/预览与服务器自己的窗口一致，**设置改了也实时跟随**。
- 它控制什么：完成回合是否折叠过程行、步骤分组（全部折叠 / 仅历史 / 不分组）、实时标题是否带详情、已结算的思考行是否预览首行。**单行展开是本地点击状态，不是设置项**（DSH 里也是如此）。
- 服务器上目前**没有** `settings.yaml`（只有一个 `.imported`），因此取默认值 `standard`（折叠完成回合 + 分组步骤）——与控制台看到的 `用时 3 秒 ⌄`、`已读取文件并执行了命令` 完全一致。

### 降级阶梯：不用补丁也能画原件（已在本机 rc.1 端到端验证）
用户问"能否伪装本地会话，寻找其他方案"。查了官方插件（唯一渲染"别人会话"的先例是 `ui-subagent`：`sessions.retain(address)` + `SessionProvider`）后，挖出三条缝并按优先级实现：

| 路线 | 依据 | 代价 |
| --- | --- | --- |
| `adopt` | 我们的 DSH 补丁 | 无（born-open + 插件给 verbs，shipped 输入框能用） |
| `scope` | `retainAgentScope(id)`——注释写着 **"without history or catalog I/O"**，直接 `retainScope` | 依赖一个不在契约里、但发布版里就有的方法；`openState` 停在 `cold` |
| `address` | `retain(SubagentAddress)`——`resolveTarget` 对**地址对象**跳过"未知会话"守卫（传字符串会被拦） | 必然触发一次失败的 Host 历史读取（真实 Host 报 `session/not-found`） |

**实测（本机 checkout = rc.1，未打补丁；两个一次性实例）**：控制台打开镜像会话后画的是**原件**——shipped 头部（`deepseek-flash · low` / `完全权限` / `子代理 N`）、**`用时 3 秒 ⌄` 回合折叠**（手绘面板明确不抄的东西）、shipped 操作行与底部状态行。走 `scope` 路线：无 Host I/O、无错误条。

**两个关键发现（代码 + 实测，不靠猜）**：
1. 渲染器**不要求** `openState === 'open'`——它只驱动 `useChatScroll({ready})`、loading 提示、error 条（`ui-chat/src/client/chat/ChatView.tsx:213`），行照常渲染，所以 `cold` 的会话也能画；`binding().session.handleRunning` 在实例上存在时顺手调用，running 也就准了。
2. **`ctx.conversation.blocks` 的屏蔽会被别人覆盖**：`ui-model-selection` 为该会话建模型目录时会 `publish(undefined)` 清掉它（实测：块设成功、日志可证，但输入框仍可输入；它自己的注释也写着这是 "*an affordance, not enforcement*"）。改成**确定性做法**：feed 路线下插件的 pane 直接隐藏 shipped 输入框的 seat（`data-composer-seat`），由插件自己的接管输入框顶上——实测 shipped 输入框消失、`在服务器侧接管续聊…` 就位。

**边界（诚实记录）**：`scope`/`address` 只能"读"，发言只能走插件自己的 composer（只有 `adopt` 能把 verbs 交给 shipped composer）；`address` 路线未做端到端实测（rc.1 有 `retainAgentScope`，走不到它），只做了源码级推演；`cold` 下 shipped 的自动跟随不初始化（滚动本身可用）。

### DSH 侧：`sessions.adopt` —— 让控制台能画"原件"（未提交，在 DSH 工作树里）
用户要求"使用 dsh 原件"。查清了为什么做不到，以及缺的到底是什么：

- 插件里那条路早就写好了（`eccffad`，`renderFactorySlot('conversation.content', {variant:'embedded'})`），只等 `ctx.sessions.adopt`。
- 而 `ISessions` 契约里**没有** `adopt`（只有 `retain/create/fork/…`）。
- **插件自己伪造引用也过不去**：渲染器走 `ui-session` 的 `bindingSource(reference)`，它要求 `sessions.binding(id) === reference.binding`——绑定必须由 sessions 服务自己持有，伪造的引用会抛 `not active in this Controller`。所以"用原件"必须由 DSH 提供这个能力。
- 缺的材料其实都已发布：`MutableSessionEventSource` 是公开导出，`SessionBinding` 是公开契约，DSH 自己的测试替身 `TestSessions.materialize()` 已经演过一遍"造一个本地代"。

**做法**（三个包，插件一行不用改）：给真 `ClientSessions` 加一个"本地代"——把 `Session` 以 `mirror` 选项造出来（天生 `openState='open'`，不读 Host 历史），注册进 manager 与目录，物化 scope，于是 `binding(id)`/`retain(id)` 与 Host 生的会话**完全同路**；窗口由 adoptee 通过句柄驱动（`replace/append/live/settle/abandon/setRunning/release`）。协议里 `summary` 每个字段都可选、`displayTitle` 兼作标题回退、`running` 可放顶层——因为插件传的就是那个拼法。

**验证**：`tsc -b tsconfig.client.json` 通过；oxlint 0 错；`verify-no-unknown-casts`/`verify-export-jsdoc`/`gen-client-catalog --check` 通过；session-controller 全套 863 通过（唯一失败是 Windows 建符号链接 `EPERM`，与本次无关）；ui-session + ui-conversation 515 通过；新增 `tests/adopt.client.spec.ts` 6 项全过（含"能力可被检测"与"引用身份与 `binding(id)` 相同"这两条渲染器真正校验的条件）。

**副作用**：放宽 `ISessions` 会波及所有测试替身——`TestSessions`、ui-conversation 的字面量、ui-workspace 的 `FakeSessions` 都补了 `adopt`。

**还没做**：线上控制台由**服务器**的 DSH 渲染（npm 上的 `0.1.7-alpha.2`），所以要用上原件，那份构建里也得有这个改动（等发版后更新，或把本机构建装上去）——这是当时选项 B，用户先选了 A。

**本机端到端验证（2026-09-24 02:00）**：用两个一次性实例（临时 `DSH_HOME`，`profiles`/`sessions` 用 junction 复用，端口 3098/3099）在本机跑通：一个 server 角色、一个 client 角色发布会话。控制台打开那条镜像会话后，渲染出来的是**DSH 原件**——shipped 头部（`deepseek-flash · low` / `完全权限` / `子代理`）、**回合级折叠**（`用时 3 秒 ⌄`，手绘面板明确不抄这个）、以及 shipped 输入框（`发消息或创建任务，/ 调用指令，@ 文件或对话`）。两侧实例已清理。

**服务器一份文件搞定（2026-09-24 02:2x，线上已生效）**：服务器跑的就是 `dsh-v0.1.7-alpha.2` 标签（`git describe` 确认本机 checkout 的 HEAD 就是该标签，工作树相对它的差异**只有**这次 8 个文件），而改动**全在 client 半边** → 只需替换 `@deepseek-ai/dsh-api-session-controller/lib/client.js` 一个文件。

```text
原版 f71e7142…  →  新版 bee02fb4…（152 KB，含 mirror 实现与 AdoptedSessionHandle）
服务器 curl 自证：plugins/??…client.js&rev=4b0755a7e02d → 200 / 155309 字节 / 含新实现
即浏览器拿到的 rev 已经变了 —— 任何客户端刷新后都会走原件
```

**线上已确认成功**（用户硬刷新后看到 shipped 头部、`用时 N 秒 ⌄` 折叠、shipped 输入框）。

**复现与恢复**（把"手工拷一个文件"变成可复现）：

```text
patches/dsh-v0.1.7-alpha.2-sessions-adopt.patch    源码补丁（相对该标签，git apply 即可）
patches/dsh-api-session-controller-client.js       要放进服务器的那份产物
patches/install-dsh-adopt.sh                       定位安装位置 → 备份 → 替换（--check 可预演）
```

**这一点必须记住**：补丁住在 **npx 缓存目录**里（`/root/.npm/_npx/<hash>/…`，按版本分目录）。服务器上任何一次 `pnpm update dsh` / DSH 版本变化都会**换一个新目录**，补丁随之静默消失——控制台会悄悄退回手绘面板，而且不会报错。恢复方式就是再跑一次那个脚本（它按**版本号**匹配，不会把 0.1.7 的 bundle 灌进 0.1.5 的缓存里）：

```sh
/root/dsh-adopt/install-dsh-adopt.sh          # 或 --check 先看它打算动哪个文件
systemctl restart dsh-web
```

### `16b46e0` fix(console)：工具行标题对齐原页面
用户把**同一个会话**的两个窗口并排看：左边是本机 DSH 的真实会话页，右边是同步控制台。差异里有一条是纯粹的 bug —— 中文词典里 `toolTitlePwsh`/`Bash`/`Grep`/`Glob` **填的是英文串**（`Pwsh`/`Bash`/`Grep`/`Glob`），而 DSH 的中文是 `运行命令`/`运行命令`/`搜索文件内容`/`查找文件`（权威表：`ui-conversation/src/client/locales.ts` 的 `tool.title.*`；英文侧恰好就是这几个英文串，所以对照英文词典看不出问题）。
输出/字形/摘要都对，只有**标题**不同——而标题正是读者第一眼比较的那一格。

### `5d5a6e9` docs：README 校准
README 里四处已过时：`Remote history paging is not implemented`（已实现）、"重放既不重复也不丢失"（正是被证伪的那句）、缺了缺口计数/自愈/发件箱/历史拉取、Layout 漏 6 个文件。补上浏览器路由表，并**如实记下"中段空洞还修不了"**。

### `d535743` fix(console)：等够一页的时间
客户端原来只等 6×1.2≈7 秒。实测一页要 **10–20 秒**（源站读日志 + POST 回传 + 过代理），于是按钮先弹回、内容后到，看起来像"点了没反应"。改为最多 10×3 秒。

### `fa95d11` chore(host)：把最近一次历史读取的结果上报出来
源站的读取失败只写进一个**谁也读不到的日志**。仿照本项目既有的 `follow` 诊断，在 state 里加 `page = { sessionId, beforeSeq, throughSeq, records, hasMore, error }`。
**这一条是当晚最有效的工具**：一次读数就证明"读取其实是成功的（`records: 297`）"，把怀疑从"源站不给"扭转到"我的探针在骗我"。

### `70df728` fix(host)：用快照的 `hasMore`，而不是"最低 seq"
第一版让源站上报 `firstSeq`（我交付的 follow 窗口的最低 seq）——**和镜像的起点是同一个数**，所以"下面还有"永远不成立，重启后仍拉不动。真正知道答案的是**开场快照自己的 `hasMore`**（它说的是"日志在窗口下面还有东西"）。
验证（假控件的确定性测试）：`index before the ask` 带 `hasOlder:true`，读尽一页后该字段消失。

### `9ad1fab` feat(host)：把尾部窗口之前的历史拉回来
链路：索引上报 `hasOlder` → 镜像在读者越界时发 `{kind:'older', sessionId, beforeSeq, maxMessages}` → 源站 `controller.page({address, throughSeq: follow 的 cursor, beforeSeq, maxMessages})` 读自己的日志 → **当作普通持久事件**回传（走同一个 buffer + 发件箱）→ 客户端按 seq 合并（早的插前面）。
`throughSeq` 必须是**follow 开场帧的 `cursor`**——DSH 的契约要求"后读的一页不能与正在看的窗口不一致"。

### `db8c1a0` / `35cf06c` 服务端分页
`/transcript` 从"返回镜像全部事件"改成"**最新 400 条** + `hasMore` + `before`/`limit` 翻页"。
第一版踩了自己的坑：`before` 不带 `limit` 被我当成"全部更早"，于是第一页 400 条、第二次点击拉 4000 条。改为**客户端用自己手里那一页的长度当 limit**（它因此不需要知道任何常量）。

### `0626082` feat(host)：未确认即未发布（发件箱）
原来把事件交给 socket 就算发布；一次被拒/失败的 POST 就把这批带走，而且它们位于镜像已持有范围**之上**，丢得不留痕迹。
现在批次在发件箱里按序等待到服务器 2xx，链路恢复即重发，上限 8000 条事件，**POST 加 20 秒超时**（黑洞连接曾让 fetch 永远 pending：发件箱不再流动、永不重连、而界面看着"已连接"）。

### `5da91bf` fix(host)：abort 之前先交出缓冲
`restartFollows` / `resyncSession` 会 abort 并重建每个 follow，abort 会把 `pending` 一起带走。改为先 `drain` 交给链路（幂等，多发不要钱）。
范围诚实说明：窗口只有一个 flush 周期（150ms），更大的丢失（已进入发送队列的那批）由 `0626082` 解决。

### `f9d3597` / `5801d7b` 水位与逐会话徽标
源站在索引里上报 `lastSeq`。没有它，**空镜像和"还没有事件"分不清**——实测：伪造索引让某会话的记录消失 → `missing 222` 出现 → 真源站重放 → `0`。控制台在**会话行**和**标题栏**显示 `缺 N 条`（只在设置页有个总数时，不知道是哪个会话该重新发布）。

### `95eee77` / `db3dd33` 自愈
镜像发现缺口 → 发 `{kind:'resync'}` → 源站重开 follow → 快照重放 → 按成员去重把洞填上。重试 30 秒；检测同时挂在"有批次到达"和**周期扫描**上（只在到达时检测会漏掉安静会话——测试里期望 2 次请求只来了 1 次）。

### `cd27a68` 把缺失放到运维已经在看的地方
设置页有总数之前，判断"输出断了"只能解码源站会话文件、两端逐条比对。

### `d257116` 乱序不再整批丢
镜像原来用高水位线判重：一批乱序到达的旧事件会被**整批丢弃**，而丢的正好是洞——所以洞永远补不上。改成**按成员去重**（`Set<seq>` + 按 seq 排序），洞第一次变得可以被重放填平。

---

## 3. 关键数据（实测）

**本轮起点（用户报"没有拉起旧会话"）**

```
源站会话文件   seq 0 .. 4177      4178 条，完全连续无洞
服务器镜像     seq 3232 .. 3558    327 条      ← 只有尾部窗口
```

**镜像向回走**（一次点击一页）：`3099 → 2489 → 2187 → 1877 → 1509 → 1200 → 897 → 607 → 309`，条数 `327 → 3623`（约整场对话的 90%）。
一页的记录数实测 `154 / 297 / 298 / 302 / 305`；**一页端到端 10–20 秒**。

**分页 HTTP 实测**（灌 1000 条）：默认 `600..999`、`before=600&limit=400` → `200..599`、`before=200` → `0..199`，**首尾相接、无重叠无空洞**。

**体积**：209 条事件 ≈ 417 KB（≈2 KB/条）→ 4,000 条的窗口 ≈ 8 MB。一次切换原本要把这个全传一遍、不缓存、过 Cloudflare。

**长会话的实测体积（2026-09-25，源站 `session-f6ba2b3b`，3479 条日志、3.4 MB zstd）**

| 一个 `/frames` body 装多少 | 字节 | 说明 |
| --- | --- | --- |
| 整场日志（3478 条） | **12.55 MB** | 正是 follow 开场快照那一帧；服务器上限 **4 MB** ⇒ 必被拒 |
| 最新 1000 条 | 3.15 MB | 一次 flush 若攒到 1000 条就已经贴着上限 |
| 最新 400 条 | 1.04 MB | |
| 实际发出的最大一批（修复后） | **0.81 MB / 320 条** | 源站 state 的 `batch.bytes` / `batch.size` |

结论：**触发条件不是"会话多大"，而是"一帧里有多少条"**——该会话每条约 3.6 KB（比早先估的 2 KB 大一倍），所以约 1100 条就会顶到 4 MB。

**确定性测试（可复跑）**

仓库内 `tests/*.spec.ts`（9 条，`node --experimental-transform-types --test "tests/*.spec.ts"`，不需要 DSH）：

| 测试 | 断言 |
| --- | --- |
| 切批不越线 | 12 MB 的 3478 条 → 每批的 `{sessionId,events}` body ≤ `MAX_BODY_BYTES`；顺序不变、一件不丢 |
| 超预算单条 | 单独成批，不丢 |
| 条数上限 | 小事件按 1000 条封顶 |
| 服务器收超大 body | 413 且**点名字节数**；同一连接随后的小批仍 200 |
| 切批后端到端 | 每一批都被接受，总条数不变 |
| 长会话快照（端到端） | 镜像拿到全部 3478 条、`missingEvents 0`、`opened: true` 且 `cursor` 有值、读页真的到达源站 |
| 没有快照时 | `opened: false`、`cursor: -1`（具名状态，不是含糊的一句错） |
| 配置文档 | 存读往返；带 BOM 的文档仍读得出；真损坏的仍当"没有" |

`%TEMP%` 下的旧 `.mts` 脚本（本轮之前）：乱序到达 / 洞重放 / 缺口检测 / 空镜像 + 水位 / 发件箱 / 历史拉取 / `hasOlder` —— 见上一版记录。

**运行期读数（源站 `state`）**：`linked=true`、无 `linkError`、`posts: /publish:44 /frames:118 /stream-delta:270`、`follow.events=5489`。

---

## 4. 未解问题

1. **中段空洞修不了。** 镜像里有一条约 **400 条**的内部空洞，长期不收敛；`resync` 重放的是**尾部快照**，够不到洞。控制台如实显示 `缺 400 条`。
   *方案（机制已具备，不需要新协议）*：`missingOf` 报出 `holes` 时，用现成的 `{kind:'older'}` 以**空洞上沿**为 `beforeSeq` 请求一页，让源站把缺的那段读回来。
2. **`missingEvents = holes + behind` 的语义**：`behind` 在活跃会话里天然非零（镜像追着源站跑），于是正常活动时会话行也会显示"缺 N 条"。实测波动 `400 / 405 / 408 / 426`。要么分开显示 holes / behind，要么徽标只在 `holes > 0` 时出现。
3. **Cloudflare 会切断空闲 SSE**（浏览器报 `net::ERR_HTTP2_PROTOCOL_ERROR`）。nginx 侧超时 600 秒、当天无日志；DSH 的 SSE **不发心跳**。未修，暂靠使用频率绕过。
4. **源站日志读不到**（`dsh-web.log` 只有 `dsh web: …token…` 一行）。运维可见的事实必须写进 state/UI —— 本项目既有模式，`state.follow` / `state.page` 都是这么来的。
5. **每次源站侧改动都要重启本机**，而重启会杀掉正在跑的会话（所以要先问用户）。
6. **版本仍 `0.3.0`**，但行为已差很远；是否发 `0.4.0` 待定（`github:` 依赖按 commit 解析，版本号只是标识）。
7. **控制台是"抄本"，不是原件。** 插件里有 `eccffad feat(client): render a mirrored Session through the shipped conversation page`，那条路要求客户端上下文提供 `ctx.sessions.adopt` **和** `retain`；**当前没有任何 DSH 构建提供 `adopt`**（`session-controller/src/client/sessions/service.ts` 只有 `retain`）。所以 `official.supported === false`，控制台一律走自己那套手绘面板——抄了 `ui-chat` 的样式表与行词汇，但**行标记是自己的**。后果：**原页面一变，抄本就会漂移**，而漂移只能靠人对着两个窗口比对发现（`16b46e0` 就是这么发现的）。
   - 同类风险面：`tool-presentation.ts` / `tool-cards.ts` 的家族表、`locales.ts` 里所有"抄自 ui-conversation 的串"。DSH 还有一个 `tool.title.inspect: '查看'` 本插件没映射（遇到 `inspect` 这类工具名会落到别的标题）。
   - 一旦某个 DSH 构建提供 `adopt`，这条抄本路径会被自动绕过、无需改代码。

---

## 5. 操作手册（可复制）

**改代码后本地构建并装进 profile**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-and-install.ps1
```

**部署到服务器**（`pnpm update` 拿远端 commit；lockfile 里的 tar.gz 哈希就是验证依据）

```sh
cd /root/.dsh/profiles/web
pnpm update dsh-session-sync
grep -m1 'tar.gz' pnpm-lock.yaml          # 应等于刚推的 commit
grep -c '<新代码里的某个标记>' node_modules/dsh-session-sync/lib/index.js
systemctl restart dsh-web && systemctl is-active dsh-web
```

**读服务器镜像状态**（先换 cookie，再读 state / transcript）

```sh
TOKEN=$(grep -o "token=[A-Za-z0-9_-]*" /root/dsh-web.log | tail -1 | cut -d= -f2)
curl -s -c /tmp/cj -o /dev/null "http://127.0.0.1:3080/?token=$TOKEN"
curl -s -b /tmp/cj "http://127.0.0.1:3080/dsh-session-sync/state"
curl -s -b /tmp/cj "http://127.0.0.1:3080/dsh-session-sync/transcript?machine=…&session=…&limit=4000"
```

> `limit=N` 返回的是**最新 N 条**，所以它的首条**不是**镜像的低端。要量低端就 `limit=4000`（未满时首条即最低；满了说明镜像已到上限）。这条踩过坑，见 §6。

**读源站自己的诊断**（本机 host 的插件状态）

```powershell
curl.exe -s -b "$env:TEMP\local-cj.txt" http://127.0.0.1:3080/dsh-session-sync/state
# 看 follow.linked / linkError / posts，以及：
#   page    = { beforeSeq, throughSeq, records, hasMore, reason }
#   batch   = { bytes, size, batches, waiting }   ← 一批到底多大 / 还排队多少
#   follows = [{ sessionId, cursor, opened, firstSeq, lastSeq, pending, events, ended }]
# 判据：`opened: true` 且 `cursor >= 0` 才意味着这一会话的读页通道是通的；
#       `page.reason` 直接说被跳过的原因（no-cursor / no-follow / rate-limited …）。
```

**跑仓库内的确定性测试**（不需要 DSH，不碰任何运行中的实例）

```powershell
node --experimental-transform-types --test "tests/*.spec.ts"
```

> `--experimental-transform-types` 是必需的：`service.ts` 用了构造函数参数属性，Node 的 strip-only 模式不支持。

**远端一次内联命令的正确写法**（详见 skill `remote-ssh-ops`）

```sh
ssh -n root@210.16.120.228 "echo <base64> | base64 -d > /tmp/t.sh && bash /tmp/t.sh > /tmp/out.txt 2>&1; echo EXIT=\$?; cat /tmp/out.txt"
```

---

## 6. 工具与方法论的坑（都是本会话踩出来的）

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| `& ssh` / `bash -s < file` | 命令挂死 | `ssh -n … "echo <b64> \| base64 -d > f && bash f"`，输出重定向到文件再取 |
| `printf %s` 经 `.cmd` | 输出空、`EXIT=0` | 用 `echo`（`%` 被 cmd 吃掉） |
| PowerShell 5.1 读文件 | 中文乱码 | `Get-Content -Encoding UTF8`；执行策略 Restricted 时 `iex (Get-Content … -Raw)` |
| 等待判据 | 曾空等 900 秒 | 判据必须是**真的会出现**的字符串 |
| `git push` | 无 gh、无 TTY | 从凭据管理器读 token → 临时改 remote URL → 推 → 还原；提交信息用 `git commit -F`（内嵌引号会坏） |
| **探针量错** | 用 `limit=400` 的首条当镜像低端，于是"新历史从下面长出来"完全看不见，误判为卡死 | 量低端用 `limit=4000`；先确认探针测的是不是你以为的那个量 |
| **点击坐标** | 自己按截图算，偏了 290 像素，于是"按钮点了没反应" | 用 `see(text=true)` 给的 `screen_center`，不要手算 |
| 日志读不到 | 两端都看不见插件日志 | 把事实写进 state（既有模式），别指望日志 |
| 结论过头 | "重放既不重复也不丢失" 被后续证据证伪 | 先写症状与证据，再写根因；范围要写清（例如 `drain` 只覆盖一个 flush 周期） |
| **两个症状读成一个因果链** | `throughSeq: -1` 和 `linkError: This operation was aborted` 一起出现，于是记成"链路抖动打断快照读、快照因此完不成"，烧掉一轮 | 它们可能都是**第三个原因**的结果（这里是被拒的 12 MB POST 触发 `reconnect()` 才 abort 了流）。先找"谁能解释**两个**症状"，再下结论 |
| **硬上限最容易被跳过** | 12 MB 一帧撞 4 MB 上限，表现成"分页不可用 / 链路抖动 / 快照完不成"三种像模像样的症状 | 看到"某件事永远完不成"先量**体积/条数**，和两端的限制对一遍；**把实测值写进 state**（`batch`） |
| **PowerShell 写文件带 BOM** | `Set-Content -Encoding UTF8`（PS 5.1）写出 EF BB BF，`JSON.parse` 直接拒；"配置读不出"被当成"没有配置"⇒ 全部回默认，看起来像插件忘了设置 | 写文件用 `[IO.File]::WriteAllText($p, $s, (New-Object Text.UTF8Encoding($false)))`；读文件容忍 BOM（`e6e00d5` 已修） |
| **harness 覆写 `DSH_HOME`** | 在自己命令里设 `$env:DSH_HOME` 没用（被覆写成真实 home），一次性实例于是读真实配置 | 包一层 `.ps1` + `Start-Process -File`（参数传 home）；先用"在实例进程里打印 home"的探针验证一次 |
| **`profiles\web` 是 junction 时装插件** | `dsh plugin add` 会把真实 profile（连同其它插件）清空 | 顺序反过来：**先**在真实 profile 里 `add`，**再**建 junction；或者不要在 junction 上跑 `add` |

**验证纪律**：能在本地用假控件复现的，先写确定性测试（本轮 9 个测试；其中端到端那条**在修复前的代码上确实失败**——新写的测试要在旧代码上跑一遍，否则不知道它测的是什么）；生产验证要给出**数字**（seq 范围、条数、字节数、耗时），不要只说"好了"。
