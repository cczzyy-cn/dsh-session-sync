# dsh-session-sync 推进记录

> 只写被证据支撑的事实：跑过的命令、测到的数字、看到的现象。每条结论都要能指出它是怎么被验证的。
> 本文件不参与构建。最近更新：2026-09-24（服务器升到最新 DSH + 插件；控制台用原件渲染）

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

## 1. 环境与访问事实

- **SSH**：`root@210.16.120.228`，只能用 `~/.ssh/id_ed25519_dsh`；客户端是 `OpenSSH_for_windows_7.7p1`。
- **控制台 token**：`grep -o 'token=[A-Za-z0-9_-]*' /root/dsh-web.log | tail -1`。用它 `GET /?token=…` 换一个签名 cookie（`dsh-auth-<hash>`，密钥存在 credentials 里，**持久**）——所以**服务器重启后旧 cookie 仍然可用**，不必每次重新取 token。
- **服务器只绑 `127.0.0.1:3080`**，前面是 nginx + Cloudflare（灰云）。
- **服务器 profile**：`/root/.dsh/profiles/web`（pnpm 装的是 `codeload.github.com/…/tar.gz/<commit>`）。
- **本机配置**：`~/.dsh/dsh-session-sync.json` —— `machineName: DESKTOP-M1EERFC`、`serverUrl: 210.16.120.228:8791`、`syncSessions` = 两个会话 id。
- **GitHub**：`~/.dsh/tools/gh/bin/gh.exe` 已不存在；token 在 **Windows 凭据管理器** `gh:github.com:cczzyy-cn`，推送时用 P/Invoke `CredRead` 读出，临时改 remote URL，推完还原。
- **端口 22 会短暂不可达**（实测约 2 分钟；同一时刻 8791 也不可达，443/80 与经 Cloudflare 的 web 正常；服务器上**没有 fail2ban、没有针对本机 IP 的 DROP 规则**）。所以"连不上"先按链路抖动处理，不要急着改配置。

---

## 2. 推进日志（晚 → 早）

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

**确定性测试（可复跑，均在 `%TEMP%` 下的 `.mts`）**

| 测试 | 断言 |
| --- | --- |
| 乱序到达 | 注入 `[5..13]` → 一条不少 |
| 洞重放 | `[5..20]` 完整 |
| 缺口检测 | `missingEvents 6`，3 秒内发出请求；30 秒后重试；补齐后停止 |
| 空镜像 + 水位 | `missing 222` 并请求重放 |
| 发件箱 | `/frames` 被拒 2 次 → 重连 → 重试 → `[0,1,2,3,4]` 全到且顺序正确 |
| 历史拉取 | `page()` 收到 `throughSeq=904, beforeSeq=900, maxMessages=50`，旧事件确实送出 |
| `hasOlder` | 索引 `hasOlder:true` → 读尽后该字段消失 |

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
# 看 follow.linked / linkError / posts，以及 page = { beforeSeq, throughSeq, records, hasMore, error }
```

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

**验证纪律**：能在本地用假控件复现的，先写确定性测试（本轮 7 个测试抓到 2 个真 bug）；生产验证要给出**数字**（seq 范围、条数、耗时），不要只说"好了"。
