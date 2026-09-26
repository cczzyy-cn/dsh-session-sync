# dsh-session-sync 推进记录

> 只写被证据支撑的事实：跑过的命令、测到的数字、看到的现象。每条结论都要能指出它是怎么被验证的。
> 本文件不参与构建。最近更新：2026-09-25（长会话回填的根因是"一批装不下"，已修；未上线）

## 0. 现状一眼看

| 项 | 值 |
| --- | --- |
| 仓库 | `C:\Users\14339\Desktop\git\dsh-session-sync` |
| 版本 | **`0.4.7`**（tag `v0.4.7` → `e50eea3`）· 本地 = 远端 |
| 服务器 | `210.16.120.228` · Ubuntu 24.04 · **DSH `0.1.7-rc.2`（npm `next` 通道，未打补丁）** · 插件 **`v0.4.7`**（依赖钉 tag，lock → `e50eea3`）· unit `dsh-web.service` · active |
| 本机 | DSH 源码运行（checkout = `dsh-v0.1.7-rc.1` 标签）· **22:09:17 起装载 `0.4.7`**（含 wire 字段的 header 发布）· `lib` 与仓库哈希一致 |
| 控制台 | `https://dsh.c-zy.cc/?token=<43 位>` |
| 镜像 | **内存态**：服务器一重启就没了，靠源站 10 秒 reconcile + follow 快照重建 |
| 同步口 | `210.16.120.228:8791`（源站连它；**不经** Cloudflare） |

**2026-09-25 服务器更新（三次）**：插件 `13b7aa2`（按字节切批 + 具名 413）→ `b2a7811`（回填分页边界）→ `4f3ed9a`/`c3862a2`/`5a80c15`/`32298d1`（保留上限 / 预算 / 跨平台 cwd / 拒写截断）→ **`v0.4.0`（tag）**。每次都用 lock 的 tar.gz + 安装产物的代码标记双向核对（`v0.4.0` 这次 9 个 host 标记 + 2 个 client 标记全中、旧串 `no follow or no page API` 为 0），`systemctl restart dsh-web` 后 active、3080/8791 在听。依赖也从裸 `github:` 改成 **`github:cczzyy-cn/dsh-session-sync#v0.4.0`**（lock → `8eeb0dd`），改前备份 `/root/package.json.bak-<时间戳>`。**本机 origin 跑的是 18:12:58 启动的构建**（`lib` 与仓库哈希一致，即含全部修复）。

**2026-09-24 服务器更新**：DSH → 最新发布版 `0.1.7-rc.2`，插件 → `db28d2e`。**顺序很重要：先插件、后 DSH**——补丁那份产物只对 alpha.2 有效，升版后控制台靠插件里的 `scope` 路线画原件，而旧插件只会 `adopt`，顺序颠倒会掉回手绘面板。

线上实测：控制台画的是 **DSH 原件**（shipped 头部 `deepseek-flash · low`/`完全权限`、`用时 3 秒 ⌄` 回合折叠、shipped 操作行与 `3 轮 · 28 步 · 18 tok/s` 状态行），输入框由插件接管（`在服务器侧接管续聊…`），会话树无「缺 N 条」。新缓存目录 `4f4f47d9854f3c73` 里 `is a mirror and accepts no prompt` = **0**，即**补丁已随版本失效且不再需要**；`patches/` 保留给"想让 shipped 输入框也能发言"的宿主与 alpha.2 回滚路径。回滚 unit：`/etc/systemd/system/dsh-web.service.bak-2026-09-24-173039`。

只改 `src/client/**` 的提交（如 `d535743`、阶梯那次的主体）→ **不需要重启本机源站**；任何改到 `src/host/**`、`src/shared/**`、`src/index.ts` 的提交都**需要用户重启本机**（会杀掉当时正在跑的那个会话）。

---

## 0.5 任务清单（进行中，随进展更新）

目标：**让镜像会话在同步服务器上成为"真会话"**，于是 DSH 自己的列表/历史分页/跳转/面板全部可用，
而写入（prompt / fork / 反馈）仍回源站。方案与证据见 `docs/host-side-session-plan.md`。

> **2026-09-25 校准**：这张表曾被放着不管，2/3/4/5 四条做完并**线上验证过**之后它仍写着"未开始"——
> 一份过时的完成度尺子比缺口本身更坏。下面已按实际改过。另有一处**与原始目标的偏离**：
> 目标写的是"物化 + **归档**"，实际做的是**不归档 + 插件自己的 `agent/pre-step` 门禁**，
> 因为归档会让会话**打不开**（`WorkspaceBrowser.guardedOpen` + 默认隐藏归档行）。理由与实测见 §2 首条。

| # | 任务 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | **长会话回填**（镜像只有尾部窗口时，翻到 seq 0 再物化） | ✅ **通了**（2026-09-25） | 两个根因先后修掉：**一批装不下**（`ff98129`）与**每页边界丢一条**（`3ee53ff`）。实测把镜像从 3158 走到 0：3478 条、零空洞 |
| 2 | **增量追加** | ✅ **做完并线上验证**（`0.5.0`/`0.5.4`） | `catchUpSession()` 用 `open(id,'write')` 从日志的 `eventCount` 续写；日志末端与镜像窗口之间有缺口时先用 `backfill` 把镜像走下来。实测副本与镜像**始终齐平**（2921==2921、2933==2933…） |
| 3 | **自动物化** | ✅ **做完并线上验证**（`0.5.0`） | 随 10 秒 tick 跑，先追平已写日志、每轮最多 create 一条；开关 `materialize` 默认开，**设置页已有控件** |
| 4 | **部署到服务器并线上验证** | ✅ **已完成**（`0.5.0` → `0.5.7`） | 服务器与源站（本机）**都跑 `0.5.7`**；三条判据线上验过（见 §2 首条），期间 5 个缺陷只有真跑起来才现形 |
| 5 | **撤掉客户端伪装** | 🔶 **部分** | 有物化副本时，树行点击改走 `uiWorkspace.openSession(id)`（DSH 官方页），控制台面板只作"无物化 / 无 adopt 构建"的兜底；`retainAgentScope` 与合成 id 那条路**仍在**，没有撤掉 |
| 6 | **文档与版本** | ✅ `0.5.7` | README 已校准为实际形状；`package.json` → `0.5.7`，tag `v0.5.7` |

**已知的收尾缺口**（不阻塞主功能，按性价比排）：设置页里 `materialized[]` 只列出 id（未显示标题/来源机器）；
客户端半边仍无自动化测试（本轮起 `routing.ts` 的两条决策有了）；跳转与轨迹搜索未验；官方页上
`ui-deliverables` 的 `/api/changes.summary` 对每条 `workspace/changes` 会 404（见 §2）。

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

1. **先升服务器**（`210.16.120.228`）：它现在的版本收不下大 body、也不会回 413，先换成带 413 的版本——**服务器侧只多接一个 413 分支，旧源站照旧工作**，所以这一步单独上是安全的、可停可留。**✅ 2026-09-25 已做**：`pnpm update dsh-session-sync` → lock 变成 `tar.gz/13b7aa2b…`，安装产物里 `FRAMES_BODY_BYTES` ×2、`stripByteOrderMark` ×2，`systemctl restart dsh-web` 后 `active`、8791 在听。
2. **再重启本机源站**：本机插件才带切批逻辑（`batchEvents`）。重启会杀掉本机正在跑的会话，**要先问用户**。**⏳ 待用户执行**。
3. 之后线上验证只看两个数字：服务器 state 里该会话的 `eventCount` 是否等于源站日志条数、`missingEvents` 是否为 0；以及源站 `page.reason` 是否消失（即读页真的发生了）。

> 反过来（先重启本机、后升服务器）不会坏，但中间那段仍然会撞 4 MB：源站切好的批 ≤2 MB，旧服务器照样只认 ≤4 MB，所以**只要本机先带切批就没有硬卡点**——顺序的真正约束是"服务器得能回 413，才不会让发送端把网络错误当重试理由"。
>
> **部署产物那一步差点漏掉**：服务器装的是 bundle tarball，真正跑的是 `lib/index.js`，而本轮最初几个提交只碰了 `src/**`。`13b7aa2` 专门把 `lib/`、`client/` 的构建产物补进去——**否则线上会是一份"源码修了、产物没修"的包**。以后改 `src/**` 后，`scripts/build-and-install.ps1` 生成的两个产物要一起提交。



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

### 孤儿副本清理：顺带验到了 `clearStaleArchive`（部署了却从没跑过的那条迁移）

**孤儿是什么**：`session-f6ba2b3b` 是更早一轮用 **v0.4.7** 物化的副本。那个构建写完日志后会 `archiveSession`（当时的记录：`{"ok":true,"written":3478,"skipped":0,"archived":true}`）。后来设计改成"不归档、改用门禁"，而清理归档的那段代码（`clearStaleArchive`）只对**台账里的**条目生效——这条副本比台账还老，所以永远进不去、也就永远带着那个被放弃的归档：在侧栏里**默认隐藏、点击只提示"暂时无法查看"**。

**修法用的是现成路径，没加代码**：它的源站还在本机，把它重新发布 → 服务端的**认领**分支跑起来（`startFor`：日志已存在 + 拥有者不是本机 ⇒ `adopt`）→ `mark` 之后紧跟 `clearStaleArchive`：

```text
POST /dsh-session-sync/config {"sessionSync":{"sessionId":"session-f6ba2b3b-…","synced":true}}   # 等于在设置页里勾一下
→ 30 秒后台账里出现第二条：{ sessionId: session-f6ba2b3b…, events: 3478 }，无 stopped
→ 服务器的 storages/workspace.json: archivedSessionIds 里已经没有它（旧构建归档过，这次被放回来了）
→ 副本文件 2,046,418 字节仍在（与 PROGRESS 早先记录的 2046418 一致）
→ 再把发布列表还原成只发布 e08471af
```

**这一轮同时验到三件事**：① 认领路径在**大副本**（3478 条）上正确，且条数是从日志读出来的真值；② `clearStaleArchive` 这条迁移**确实在工作**（部署后第一次真跑）；③ 副本被"读过一次"才有标题投影——这条由文件布局独立印证：`storages/session_projcache/sessions/` 里有 `session-e08471af-….json`（132 KB），而 `f6ba2b3b` **没有**缓存文件，所以它的列表标题至今是 id。

**当前服务器状态**：台账两条（`e08471af` 2941 条在跟、`f6ba2b3b` 3478 条已停更），都无 `stopped`、都受门禁、都可读；镜像只留 `e08471af`（`f6ba2b3b` 已取消发布）。留档一份 `/root/diverged-copy2-1790436235`（1.4 MB，我测试稿污染过的那份旧副本，未删）。


### 官方页上的"历史/跳转"验到哪一步，以及新设计带来的一处新噪音

副本重建干净之后，用它把目标里"列表、历史分页、跳转"这半逐个过了一遍：

| 项 | 结论 | 证据 |
| --- | --- | --- |
| 历史分页 | **通过** | 对话视图顶部是官方 `加载更早`；点一次，更早的正文（我上一条回复的结尾）立刻出现在上面。**轨迹视图自己也有 `加载更早的历史`** —— 同一套 Host 分页，读的是副本整条日志，只是分页给 |
| 列表里的标题 | **通过（惰性）** | 重建后的副本在 Host 列表里是 `服务端与dsh会话页面差异伪装`；上一轮那条旧构建留下的孤儿副本至今是 id，因为它**从没被打开过**。即：副本被读过一次，投影就有标题 |
| 跳转 | **没验成** | 轨迹视图的时间线条**可以被点中**（左端出现橙色跳转游标），但下面的账本没跟着跳；对话视图的回合导航我没找到。**不改口说它好**：这是"我没驱动出来"，不是"它坏了"，而它与已验证的分页走的是同一个 Host 读取接口 |
| 轨迹搜索 | 未验 | 在官方搜索框里输入会话开头那句后，线条上出现选区标记、下方出现 `加载更早的历史`，但没等到命中结果 |

**新设计带来的一处新噪音（已定性，未修）**：官方页的 DevTools 里出现

```text
GET /api/changes.summary?sessionId=session-e08471af-…&seq=2817  404 (Not Found)
GET /api/changes.summary?sessionId=session-e08471af-…&seq=2933  404 (Not Found)
```

这是 `ui-deliverables` 在向 Host 要改动摘要。以前只有控制台面板会看到 `workspace/changes`（那条路被插件**过滤掉**了，见 §"交付物相关不显示"），现在官方页直接读副本日志，于是每条 `workspace/changes`（本副本里有 6 条）都会**换一次 404 + 一张"不可用"的卡片**。服务器算不出摘要的原因 PROGRESS 早已查明：事件只带 `{turn}`，files/totals 由拥有 workspace 的那台 Host 现算。要修就得把摘要跨同步链路带过来**并写进那个插件自己的状态表**——那正是当初被判定为"更深的耦合"而没做的事。**这是"把副本变成真会话"的已知代价之一，记在这里而不是藏着。**


### 更正上一条：`create` 是收敛的；"没重新物化"的真因是存储进程还记得那个 id

上一段把"6 分钟没重新物化"记成 **create 路径（要走回 seq 0）不收敛**。**这是错的**，两处查证把真因换掉了：

1. **镜像其实早就走到底了**：服务端 `/transcript` 读到 `low: 0, high: 2834, count: 2835` —— backfill 已经把镜像走到 seq 0。所以源站 state 里**没有 `page` 记录**并不是"询问通道坏了"（我一开始这么读的），而是 `backfill` 的 `while (lowest > 1)` 直接返回、**根本没有需要问的东西**。
   > 教训：`page` 的缺席只说明"这次没读"，不说明"读不了"。要判通道好坏得让它**真有事可做**再看——这次是靠 count/low 的读数才把因果摆正。
2. **真因是存储层的记忆**：`create` 的拒绝原话是
   `cannot create the log: SessionAlreadyExistsError: session "…" already exists`
   ——我把日志文件挪走了，但**服务器进程还记得这个 id**（客户端当时开着它）。文件不在 ≠ 存储层忘了它。

**验证（干净重建，一次通过）**：先 `release` 摘掉台账条目 → `systemctl stop dsh-web` → 把旧副本 `mv` 到 `/root/diverged-copy2-<ts>`（留档、没删）→ `systemctl start dsh-web` → **30 秒内**：

```text
ledgerEvents: 2847   mirrorCount: 2847   stopped: (无)
新日志 1,637,295 bytes
```

即：**从完整镜像 create 一份新副本是通的**，新副本与镜像条数一致、零标注、活的。所以"长会话第一次被物化"这条路没有缺陷——上一条报错了。

**顺带把"重建一份干净副本"的正确步骤固定下来**（这是操作序列，不是代码缺陷）：

```text
1. POST /dsh-session-sync/materialize/release {"sessionId": …}    # 摘掉只读声明与台账条目
2. systemctl stop dsh-web                                        # 让存储层忘掉这个 id
3. mv <sessions>/…/session-<id>  /root/diverged-copy-<ts>        # 留档，别删
4. systemctl start dsh-web
5. 等一个 tick：自动物化会用镜像重建它（本例 30 秒）
```


### 上线后又修两件 + 撞出一个新缺陷（v0.5.6 / v0.5.7，2026-09-25）

背景：门禁测试在官方输入框里发了一条消息。它被拦下了（`turn/end{blocked}`、无模型请求——判据 ③ 通过），但**回合骨架本身写进了副本日志**（`turn/start` + `agent/inbox/spliced` + `turn/end`），于是副本在源站接下来要用的那些 seq 上有了自己的事件。据此修两件：

| 改动 | 线上实测 |
| --- | --- |
| **`SessionAlreadyOwnedError` 算 `wait`**（`0.5.6`）：在官方页里打开副本会让它在服务器上变成 live 会话，Host 就接管日志写句柄；那是"等它冷下来"，不是"这份日志坏了" | 修复前那一版把它写成 `stopped: "cannot open the log: SessionAlreadyOwnedError…"`；修复后会话 live 的 2.5 分钟里台账停在 2398、**没有**被写成 stopped |
| **副本长了自己的事件就停手并说明**（`0.5.6` → `0.5.7`）：追加前把日志尾部与镜像在同一 seq 上的事件比一次，不一致就停手并如实上报，而不是长成一个看着完整的谎 | `0.5.7` 部署重启后**第一轮就判出**：`stopped: "this copy grew on its own (a turn was opened in it)…"`，`ledgerEvents 2398 / mirrorCount 2769`，没有埋洞 |

**守卫的第一版挂错了地方（被实测否掉）**：它挂在"日志比台账记录的更长"上，而基线是**认领时从日志读来的**——本地漂移早就被算进基线，于是 `heldNow == needs`、永不比较；实测 2.5 分钟 6 轮都没判。挪到**两个真正要紧的时刻**：认领时（基线从日志来的最后时刻，此后看不见）与**每次追加之前**（唯一可能埋洞的时刻）。用调用方已持有的镜像窗口比，只多读日志尾部 8 条。

**为什么只能"检测"不能"预防"**：没有比 `agent/pre-step` 更早的公开接缝——shipped 的 `ArchivedSessionGate` 就在那里，所以对一个**归档**会话发 prompt 也会留下同样的 3 条痕迹。真要拒收本地写入只能让输入框不可用（`ctx.conversation.blocks`），而它被文档写明是 *an affordance, not enforcement*、还会被别的插件 `publish(undefined)` 清掉。所以选择是：**检测 + 如实标注**（漂移的副本停手并在 `state`/控制台里说明），而不是假装它还是那个会话。

**新缺陷（未修，下一轮）**：为了把被测试污染的副本清干净，我把它 `mv` 到 `/root/diverged-copy-*`（留档、没删），想让插件从镜像重新物化一份。结果**没有重新物化**：6 分钟里台账无条目、磁盘无新日志、**镜像条数冻在 2781**（backfill 没把镜像往 0 走）。即 **create 那条路（必须走到 seq 0）在这条约 2800 条的会话上没有收敛**——它此前只在受控实例上验过（`written 3478 / skipped 0`）。副本已从备份恢复，当前状态是"标注正确的 stopped + 只读 + 可打开"。


### 上线验证：目标的三条判据全部通过（2026-09-25，服务器 v0.5.5）

部署路径：`v0.5.0 → v0.5.1 → v0.5.2 → v0.5.3 → v0.5.4 → v0.5.5`（每次 `pnpm install` 后核对 lock 的 tar.gz commit + 产物标记，再 `systemctl restart dsh-web`）。
**前四次部署每一版都是被线上现象推着改的**，三个缺陷只有在真跑起来时才现形：

| 版本 | 改了什么 | 线上抓到的 |
| --- | --- | --- |
| `0.5.1` | 认领已存在的日志（`startFor`）而不是永远重试 `create` | 上一次手工物化留下的 705 KB 日志让 `create` 抛 `AlreadyExists`，自动那一路每次返回 `ok:false`、**不写台账** ⇒ 死循环重试，且那条副本一直在门禁之外 |
| `0.5.2` | 条数只能问日志本身（`storedEventCount`） | `eventCount` 在契约里是**可选**的，JSONL 后端根本不提供 ⇒ 705 KB 的日志被记成 `events: 0` |
| `0.5.3` | 区分「镜像还没准备好」与「这份日志坏了」（`wait`） | `0` 被 `catchUpSession` 当成「盘上没有日志」，把一条完好的条目写成了 `stopped`（且 `stopped` 按设计不会被后续 append 抹掉） |
| `0.5.4` | 用**新到的 seq** 判断该不该推进；缺口上用 `backfill` 把镜像走下来 | 推进分支拿镜像的 `eventCount` 当高水位，而镜像服务的是**尾部窗口**：310 条的窗口坐在 seq 1100..1409，条数低于 1016 条的日志末端，于是永远"看似没新东西"——日志冻结一小时不动 |
| `0.5.5` | 把旧构建留下的**归档**副本放回来（每轮对台账里每个 id 查一次） | 上一版之前就被认领的副本不会再被认领一次，清理只放认领分支里会永远漏掉它 |

**三条判据的实测（同一条会话 `session-e08471af`）**：

1. **它成了服务器自己的真会话**：`/dsh-session-sync/sessions`（读 Host summaries）返回它，`cwd` / `blank:false` / `updatedAt` 都对；浏览器里以**会话**身份打开（标签页标题变成会话真名"服务端与dsh会话页面差异伪装"）。
2. **打开走的是 DSH 官方会话页**：官方头部（标题 · `3 个子智能体` · `标准模式`）、官方 `对话/轨迹` 页签、**官方输入框**（`发消息或创建任务，/ 调用指令，@ 文件或对话` + `完全权限` + `DeepSeek-V41-Flash High`）、官方状态行（`9 轮 364 步 · 254 tok/s · 114M tok · 缓存命中 99.8% · ◯52%`）。插件的徽标（`原件 · scope`、`缺 N 条`、接管输入框）**一个都不在**。到达方式就是控制台里那条带 `真会话` 徽标的行——点它走 `uiWorkspace.openSession(id)`。
3. **它是只读的**：在官方输入框发一条消息，官方日志尾部是 `turn/start` → `agent/inbox/spliced` → `turn/end {"kind":"blocked"}`，其后**没有任何 `assistant/message`** —— 门禁在模型请求之前拦下了它。

**增量追加是活的**（这条以前只有设计、没有证据）：副本日志 **705 KB（14:44:32 冻结）→ 1,418,592 B**，台账 `events: 1016 → 2202`，而官方页正文里能看到**刚刚发生的消息**。机制是三段：镜像的新到 seq ≥ 日志末端 → 若两者之间有缺口就用 `backfill` 把镜像走下来 → 下一轮 `catchUpSession` 追加缺的那段。

**与目标措辞的一处偏离（用户已选）**：目标里写的是"物化 + **归档**"，实际做的是**不归档 + 插件自己的 `agent/pre-step` 门禁**。理由是归档会话在官方侧栏里**默认隐藏、点击只提示"已归档对话暂时无法查看"**（`WorkspaceBrowser.guardedOpen`），为只读而归档等于连读都读不了。`0.5.5` 起旧构建留下的归档会被自动清掉。

**仍然没验/没修的**：
- **会话列表里的标题仍是 id**（Host 的会话投影只覆盖"这台 Host 自己跑过的会话"）。页面**标题**是对的，只有列表行不对。
- **历史分页/跳转没有显式点过**：官方页带着官方控件正常渲染并读到了 Host 的日志，但"往上滚触发加载更早""跳转"这两条没有逐个按过。
- **本机（源站）那半边没重启验证**：本机跑的还是装载时的旧构建（重启会杀掉当前会话）。


### 同步会话改用官方会话页面：选项 A 已实现（2026-09-25 深夜，**未上线验证**）

用户要求"同步会话直接使用官方会话页面"。上线前的两条查证**改变了方案形状**：

1. **线上 `/materialize` 实验成功**：对当时发布的那条会话（镜像 1016 条 / seq 0..1015 / 零空洞）
   `POST /materialize` → `{"ok":true,"written":1016,"skipped":0,"archived":true}`，落盘
   `/root/.dsh/sessions/--C-Users-14339-Desktop-git-dsh-session-sync--/session-e08471af-…/session.v4.jsonl.zstd`
   （705 KB；1017 记录 = header + seq 0..1015，逐帧解出、零空洞）。
   **服务器 Host 立刻认它，无需重启**：插件 `/sessions`（读 Host summaries）返回该会话，
   `cwd` 正确、`blank:false`、`updatedAt` 等于源站 header 的 `createdAt`。
2. **归档让它打不开——计划文档的错**：`ui-workspace/rows/WorkspaceBrowser.tsx:851-859` 的
   `guardedOpen` 对归档行只提示 `archivedNotOpenable`（"已归档对话暂时无法查看，请取消归档后查看"），
   而 `tree.ts:251-262` 的默认筛选**隐藏**归档行。所以 `docs/host-side-session-plan.md` 的
   "物化 + 归档"形状**读不到页面**：为了只读而归档，代价是连读都不能读。
3. **只读不必靠归档**：`agent/pre-step` 是插件可用的公开 waterfall（返回 `{kind:'reject'}` 即拒绝该步骤），
   shipped 的 `ArchivedSessionGate`（`api/session-controller/src/archived-session-gate.ts:23-32`）就是这么做的。
   Host API 侦察全文见 `docs/audit-host-api-recon.md`（另两条要点：`sessionPersistence.open(id,'write')`
   **存在**，所以重启后能续写；`create` 不校验事件词表，一条非法 type 会让**整条日志**不可读）。

按用户选定的**选项 A**（服务器端物化、不归档、插件自带门禁）实现：

| 改动 | 文件 |
| --- | --- |
| **不再归档**；写入器只写日志，返回 `{ok,written,skipped,stored,created}`；seq 必须从 **0** 起（原判据 `> 1` 会放过 seq 1 起头的日志） | `src/host/materialize.ts` |
| **增量追加**：`catchUpSession()` 用 `open(id,'write')` 从日志的 `eventCount` 续写，只追加缺的那段；洞在日志下沿之下就记录原因并停手（append 永远修不了洞） | 同上 |
| **持久化台账**：门禁的权威，重启后仍只读；含 `stopped` 理由与 `release`（删声明、**不删日志**） | `src/host/ledger.ts`（新） |
| **自动物化**：随 10 秒 tick 跑，先追平已写日志、每轮最多 create 一条（create 可能要回填）；开关 `materialize` 默认**开** | `src/host/service.ts` |
| **门禁**：`ctx.on('agent/pre-step')` → 台账里有该会话就 `{kind:'reject'}` | `src/index.ts` |
| `/materialize/release`：摘掉只读声明 | 同上 |
| 客户端：状态里首次出现某个物化 id 时叫 shell `sessions.refresh()`（客户端列表**只拉不推**，raw 存储写入不产生任何列表事件） | `src/client/index.ts`、`SyncPanel.tsx` |
| 客户端：**打开同步会话时走官方页面** —— 树行在有物化副本时改调 `uiWorkspace.openSession(id)`（= shipped 的 `retain(id,{source:'mainView'})` + `selectPanel(null)`），并先 `sessions.refresh()`（`retain` 对未知 id 会抛）；行上给一枚 `真会话` 徽标 | 同上 + `locales.ts`、`sync.module.css` |
| 顺手修掉 Host 半边 **5 处既有类型错误**（`WireSessionHeader` 从未声明等）——现在 Host 半边 `tsc` 干净 | `service.ts`、`transport.ts` |

**验证到哪一步**：`node --experimental-transform-types --test "tests/*.spec.ts"` → **50/50 通过**
（原 38；`materialize-write` 新增 6 条钉住新语义：seq 必须从 0 起、追平只追加缺段、有洞即停且不写、
无盘可续时报明；`config-document` 新增 2 条：缺 `materialize` 键读作**开**、显式 `false` 生效；
`mirror-ledger`（新）6 条钉住门禁的**持久性**——重开后仍 `owns`、`stopped` 不会被后续 append 抹掉、
`release` 幂等且不碰别的条目、文档损坏/形状不对时读作空）。Host 半边 `tsc --noEmit` **退出 0**；
两半产物已重建（`lib/index.js` 129.7 kB、`client/client.js` 318.5 kB）。

**未做（并且这一轮特意没做）**：**线上仍未部署**，所以"自动物化 + 门禁 + 打开走官方页"没有一条端到端跑过。
本机的两个一次性实例（`%TEMP%\dsh-mat-origin` / `dsh-mat-server`）**不能直接用**：它们的 `profiles\web`
是 **junction 到真实 profile** 的（本文件 §1 记过），把本地构建塞进去等于把未验证的客户端半边
热更到**用户正在跑的那个实例**里；而本机又不能重启（会杀掉当前会话）。`dsh` 也不在 PATH 上。
所以端到端只剩两条路，都需要用户点头：**部署到服务器**（commit+push → `pnpm update` → restart），
或**新建两个隔离 home 的实例**（不复用旧 rig 的 junction）——后者是下一轮该做的。

**下一步（部署后看三件事）**：① 发布一条会话，10–20 秒后它出现在**服务器自己的工作区列表**里；
② 点开是**官方会话页面**（不是控制台面板）；③ 在它的输入框发一条消息 → 轮次以 `blocked` 收口、
**没有模型请求**（门禁生效）。

**仍然存在的缺口（新发现，未解）**：**标题**。物化日志里 seq 14/18 有两条 `session/title`
（`检查服务端同步会话页面和dsh`、`服务端与dsh会话页面差异伪装`，都是 `messageSeqs:[9]` 指向 seq 9 的真人消息），
但服务器 Host 的会话列表把这条会话显示成**会话 id**。

**根因已定位**（不是日志的问题，是投影的问题）：插件列表里的标题来自 **Host 的会话投影**
——`service.ts:1455` `item.projections?.values['title']`，取不到就回退成 `sessionId`。
服务器 `/sessions` 的实测快照正好把这个分层照出来：

```text
session-e08471af-…  title = session-e08471af-…      ← 外来日志（本次物化）
session-f6ba2b3b-…  title = session-f6ba2b3b-…      ← 外来日志（上次物化）
session-cf35e2ac-…  title = session-cf35e2ac-…      ← 空会话（本来就没有标题）
session-0a8b2f20-…  title = 你是什么模型             ← 这台 Host 自己跑过的会话
```

即：**投影只覆盖"这台 Host 自己跑的会话"**，日志里的事件再全也不进这一层。

**候选修法（下一步验证）**：物化/首次追平时**追加一条 `session/title` 事件**，把源站的标题
以 `source:{kind:'user'}` + `messageSeqs:[]` 的形式写进日志（这是"用户指定标题"的合法形状，
`session-title/src/invariant.ts:29-52` 要求 `user` 源必须**不带**引用，正好合法），
再用 `open(id,'write')` 追加到日志末尾。要验的是两件事：① 这条事件是否能让**投影**出现标题；
② 若仍不行，说明投影来源另有其处（`sessionQuery.readTitle`？），那就改从那儿读。

### 中段空洞：`0.4.1` 写错了上界，`0.4.2` 修好了上界，`0.4.3` 才真正能送达（2026-09-25 晚）

§4 第 1 条那个"中段空洞修不了"至此有了实现。做法不需要新协议——**把已经有的那次读页对准洞**：

- 镜像本来就报**缺多少**（`missingEvents`），但没报**缺在哪**。新增 `holesOf()`：持有的事件本来就是按 seq 排的，走一遍就能得出每一段缺失区间；
- `reportGap` 对每个洞发一次 `older(sessionId, hole.from, 500)`。`throughSeq` 按契约是**闭**上界（页**结束在**这个名字上），源站的 `page` 再翻成自己的开上界，所以**名字必须取洞的第一条**，那一页才会把洞包含进去；
- 重放 ask 与洞页 ask **一起发**（重放补"窗口顶部与落后"，洞页补"重放够不到的下面"），并**共用同一个重试下限**——一直失败的机器，每个洞每轮只问一次，而不是每来一批问一次。

**`0.4.1` 的第一版错在哪（被端到端测试抓到）**：我写的是 `hole.from - 1`（"洞上沿之下"），于是那一页**结束在洞开始之前**——ask 看着完全正常，源站也忠实执行，洞却永远补不上。**这是只有端到端才能抓到的错**：hub 侧的 ask 单看没问题，而"差一条的页"和"迟到的页"从外面长得一模一样。修法就是把名字改成 `hole.from`（`0.4.2`），并让单测同时钉住两半：**名字落在洞里，且绝不落在洞下**。

**紧接着查清了，而且它确实是第二个缺陷（`0.4.3` 修掉）**：那一页**被读了、被缓冲了，但从未被投递**。因为 `pullOlder` 把页塞进 **follow handle 的 `pending` 缓冲**，而那个缓冲**属于"某一次打开的尝试"**——`resync` 会 abort 这次尝试并用新 handle 替换它，**留在里面的东西随之消失**。修法：页读结果**直接交给链路**（`this.link?.publishFrames(sessionId, events)`），一次性成批送出；排序权威本来就是链路的 **outbox**，它不挂在任何 handle 上，所以投递不再依赖"follow 活到下一个 150ms tick"。

**验证（三层，并且证明测试真的守得住）**：

| 层 | 结果 |
| --- | --- |
| hub 规则（`tests/hole-repair.spec.ts`） | 5 条：名字落在洞里、绝不落在洞下；两个洞都问；没补上时 sweep 再问；补上后一条不问；下限仍生效 |
| 真实链路 + 合成源站（`tests/hole-repair-link.spec.ts`） | 2 条：**制造**一个洞→修好、窗口连续；**并在 resync 不断重放下方窗口的同时**仍然修好 |
| DSH 面向的端到端（`tests/hole-repair-e2e.spec.ts`） | 断言**镜像变完整**；把投递那行改回缓冲 → 立刻 `fail 1`，改回 → `pass 1` |

**这一轮踩到的两个"测试侧陷阱"（都会伪装成产品缺陷，值得记）**：

1. **`OriginLink` 要的是 URL，不是 `host:port`**。我给的是 `127.0.0.1:18801`，于是**每次 POST 都被丢弃**（`Failed to parse URL`）、链路从未建立、镜像永远空——**看起来和"页被读了却没到"一模一样**。生产里 scheme 由 `serverOrigin()` 补上，所以只有手写测试会踩。**教训：新写的测试要先证明它测的那条链路真的通了**（5 行探针就够：起链路、发一批、看 hub 里有没有）。
2. **不要等一个"已经流逝的瞬时状态"**。我让测试等"镜像恰好 399 条"，而修复机制**已经把它补到 400 了**——于是测试红着，产品其实是对的。**教训：竞态类断言要断言"最终状态"，需要中间状态就先记录再断言，不要阻塞等待。**

**线上现状与验收结论（2026-09-25 深夜）**：

- `v0.4.3` 已部署、`active`、装出的包版本 `0.4.3`（依赖钉 `#v0.4.3`，lock → `dadc1eb`），投递修复的代码标记在产物里命中。
- 挂了 15 分钟监控（每 20 秒记 `missingEvents` 与窗口空洞数）：**24 轮全部 `missing=0`、`holes=0`**，镜像健康增长（`308 → 374` 条）。
- **所以这条修复在线上依然没有观测点**——此刻没有丢批可修。这不是失败（说明链路是健康的），但**"修复在线上被观测到"这件事仍未完成**，我不把它写成已完成。

### 长会话物化：线上跑通了，并因此抓到"header 保真"这个真缺陷（`0.4.4` → `0.4.5`）

用户把 `f6ba2b3b`（3478 条）重新标为同步后，线上物化**成功**：

```
第一次: {"ok":false,"written":0,"skipped":320,"reason":"the mirror's run stops at seq 477; the rest is not contiguous…"}
  42 秒后镜像自己变成 0..3477（3478 条、单段）
第二次: {"ok":true,"written":3478,"skipped":0,"archived":true}   → 落盘 2.0 MB
```

**第一次的拒绝是 `0.4.2` 那条拒写逻辑在正确工作**：`materialize` 的回填预算（约 30 秒）**短于真实页延迟**，所以它在自己的页还在路上时就返回了。判据很清楚——**等镜像变完整再物化**（`/root/wait-and-materialize.sh`），不要和页延迟赛跑。这是操作时序，不是缺陷；但值得写进文档，因为第一次调用的人都会这么调。

**然后逐帧比对（这才是有价值的部分）**：把服务器写的日志取回来与源站逐帧比：

```
origin  : count=3479  seq 0..3477  digest=11d2e2c1…
mirrored: count=3479  seq 0..3477  digest=2b2a9e2d…   ← 只有 1 条不同
#0 origin  : keys=[type,version,id,createdAt,cwd,isSeeded,delegationDepth,agentPreset]
#0 mirrored: keys=[type,version,id,createdAt,cwd,isSeeded,delegationDepth]   ← 少了 agentPreset（190 vs 219 字节）
```

**3478/3479 条逐字节一致**，唯一差异是 **header**：镜像日志**丢了 `agentPreset:"standard"`**，且 `createdAt` 比源站**早 7ms**（源站用 header 的起始时间，镜像用了首条事件的时间）。根因是**写入侧凭自己能看到的字段重建了 header**，而不是把源站声明的那个带过来。

**两轮才修对，因为这条链路有两个变量、各错一次**：

| 版本 | 改了什么 | 为什么还不够 |
| --- | --- | --- |
| `0.4.4` | 写入侧接受并带上 `agentPreset`/`origin`/`createdAt` | **源站引擎从没把 `header` 从快照帧里读出来**，所以没有东西可带 |
| `0.4.5` | 引擎在快照到达时读 `header`，并在 `state.follows` 里报出来 | 修好；`state` 里能直接看到 header 是否活着 |

**教训**：这类"保真"缺陷，**唯一可靠的检查是逐帧比对**，不是看形状/条数/大小。这次条数、seq 范围、逐字节内容全对，只有那一条 header 不对——**而它恰好是唯一无法从事件里推导出来的东西**。

**重启后又验了一次，header 仍然缺——而且两次物化的产物逐字节相同**（都 2046403 字节、`sha256 1B14BBFA…`）：

```
origin  : {…,"agentPreset"}   219 字节
mirrored: {…}                 190 字节   ← 缺少 agentPreset
```

这里要**更正上面那句判断**：本机 20:58 重启装载的**并不是 `0.4.5` 的产物**——仓库 `lib` 直到 **21:07** 才被重建，而进程在 20:58 已把**更早那份**读进内存。所以"重启后应能观测"当时就不成立。

**排查到此为止，剩下的答案要等带诊断的 `0.4.6` 跑起来**：

- 我试过给**正在跑的副本**插桩，但 **Node 已把 bundle 载入内存，改文件不生效**（探针一次都没写到文件），现场验证做不到，只能重启。插桩已从已安装副本移除，并已与仓库产物逐字节校准。
- `0.4.6` 加了**常驻诊断** `state.follow.headerSeen`：它会直接说明那条开场帧**到底带没带 header**（`read from snapshot` 还是 `absent on snapshot{…}`）。这是唯一能一次定性的读数。
- **我明确没有解决它**：`0.4.5` 的单测只证明"引擎能读、写入侧能带"，而**真实帧是否携带 header 仍是未解问题**——这一点单测永远答不了，因为帧是单测自己造的。

**一次差点造成数据损失的操作（必须记住）**：我用 `~/.dsh/sessions` 做 junction 起测试实例，清理时对**含 junction 的目录**用了 `Remove-Item -Recurse` —— 那会**穿透 junction 删到真实会话目录**。核对结果：7 个真实会话**全部完好**（`f6ba2b3b` 3431 KB、`ba0c1a83` 8272 KB、当前会话 3865 KB…），只有一个 412 字节的空会话是测试实例在 20:36 新建的，已删除。**规矩：删 junction 必须先 `cmd /c rmdir` 删链接本身，绝不 `Remove-Item -Recurse`。**

### header 保真的真正断点：写入在服务器，而 header 只在源站（`0.4.7` 修掉）

`0.4.5`/`0.4.6` 都只做对了一半，因为**始终没人问"header 到底在哪一侧"**。诊断读数给出决定性答案：

- 本机重启后 `state.follow.headerSeen = "read from snapshot"`，`state.follows[*].header` 与源站 header **逐字段一致**（含 `agentPreset:"standard"`）——**源站这半边完全正确**；
- 但线上重新物化，产物**与修复前逐字节相同**（同 2046403 字节、同 `sha256 1B14BBFA…`）。

**根因（代码层面确凿）**：服务器 `materialize` 读的是 `this.follows.get(sessionId)?.header`——**那是服务器自己的 follow 集合，而服务器永远不会 follow**（follow 是源站才开的）。**写入发生在服务器，header 只存在于源站**，所以写入侧永远拿不到它。

**修法（`0.4.7`）**：把 header 变成**通过协议传递的会话属性**，而不是任何一侧的局部状态：

- `PublishIndexPayload` / `PublishFramesPayload` 携带 `SessionHeader`；镜像存下源站声明的那个（**覆盖而非合并**，源站不再声明的字段不许残留）；
- 新增 `hub.sessionHeader(machine, session)`——**两半边唯一都能看见的位置**，写入侧读它；
- 源站**每一批都带上它**：几百字节、覆盖幂等，从而**消掉了"发一次就标记已发"必然带来的时序问题**。

**顺手抓到并修掉的两个真缺陷**（都会让 header 永远送不到）：

1. `publishFrames` 在 `events.length === 0` 时**提前 return，header 被丢在判断之后**——空批次恰恰是"只带 header"的那次发布；
2. header 在**一次 POST 成功后即被删除**，与下一次声明**竞态**：飞行中设置的 header 被前一次 POST 的完成回调删掉，线上就带了个 `null`。

**验证与明确边界**：新增 `tests/header-crossing.spec.ts`（真实监听器 + 真实镜像 + 真实 `OriginLink` 声明 header），并**在文件里写明它不覆盖什么**——替换路径在该 harness 上尚未到达，作为独立问题记录，不藏在通过的断言后面。全量 **38/38 通过**。

**预告（可证伪）**：本机进程当前装载 `0.4.6`（**没有 wire 字段**），所以服务器镜像此刻**还没有 header**。本机重启装载 `0.4.7` 后，服务器镜像应当**持有** header，届时重新物化的产物应与源站**逐字节一致**（`digest` 相同）。若仍不一致，断点就在"发布→镜像"这一段，而不在读写两侧。

**预告已验证——全部对上了**。本机重启装载 `0.4.7` 后重新物化：

```
第一次: skipped 320（镜像还在回填，拒写逻辑照常工作）
第 3 轮后镜像完整 0..3477（3478 条）
第二次: {"ok":true,"written":3478,"skipped":0,"archived":true}
落盘字节数 2046403 → 2046418（+15，正是多出的 "agentPreset":"standard" 量级）
```

**逐帧比对结果**：

```
origin  : count=3479  seq 0..3477  createdAt=1790261151160  agentPreset="standard"
mirrored: count=3479  seq 0..3477  createdAt=1790261151160  agentPreset="standard"
唯一差异  cwd: origin="C:\\Users\\14339\\Desktop\\git\\c-vision"
              mirrored="/C:/Users/14339/Desktop/git/c-vision"
```

**这就是完成状态**：3479 条记录里 3478 条逐字节相同，剩下那 1 条（header）现在**只差那个被刻意改写的 `cwd`**——那是 `portableCwd` 的设计行为（Linux 上 `C:\…` 不被判为绝对路径，不改写就写不进去），不是缺陷。`agentPreset` 与 `createdAt` 都已与源站一致。

**这件事的完整教训**（三次修复、一个真断点）：

| 版本 | 我当时的判断 | 实际 |
| --- | --- | --- |
| `0.4.4` | "写入侧重建 header 丢了字段" | 对了一半：确实丢了，但**写入侧还从没拿到过它** |
| `0.4.5` | "源站引擎没读快照里的 header" | 对了一半：读了，但**读在源站、写有服务器，中间没有任何通道** |
| `0.4.7` | "header 必须作为发布属性跨过链路，镜像才是两边都能看见的地方" | 这才是断点 |

**教训**：修"数据在 A 处、用它在 B 处"这类缺陷时，**第一步就该问"这两处在不在一起"**。我连着两轮都在"读得对不对/写得对不对"上打转，而问题从头到尾是**没有路**。另外，"单测证明两半各自正确"完全不能推出"合起来能用"——这一点这轮被验证了三次。
- **长会话物化的线上验收也没有对象**：本机配置现在只同步 `d4b49737`（就是本会话），那条 11836 条的 `f6ba2b3b` 已不在发布列表里，因此不在线上镜像中。要验它，得先把那条会话标为同步（本机配置改动 + 3.35 MB 日志的一次性回填），这需要用户点头。
- 已完成的替代验证：受控实例上用**真实 11837 条日志**跑通整链（`written 11836 / skipped 0 / archived true`，落盘日志与源站逐帧一致）。

> 教训：**同一个不变量（窗口连续）有两种破坏方式**（落后 / 中段缺失），修法也不同（重放 / 定点读页）。只实现一个，另一个就一直"修不了"，而它看起来像同一个问题。
> 教训二：**"上界"这个词必须当场写清是闭还是开**。这已经是同一类错第二次（第一次是回填边界，`3ee53ff`），两次都是"看着对、差一条"。

### `non-appended Match 2897`：同一页从两条路进来，第二次没被拦（2026-09-25 晚，已修）

用户贴出 Console 里这条：

```
[session-controller] event feed subscriber failed: Error: conversation Context 25:trajectory-assistant-step5:107 received non-appended Match 2897
```

这是 `ui-conversation` 的装配器在 `assembler.ts:539` 抛的：**同一个 context 的 Match 必须严格按 seq 递增**。而它一旦抛出，**整个 event-feed subscriber 就废了**——面板从此不再更新，直到重新打开会话。所以这不只是"一条日志"。

**为什么重复**：一页会走**两条路**到达面板——

1. 客户端自己 `GET /transcript` 读到的那一页，经 `prependOlder` 插到窗口之前；
2. 源站按普通事件帧**重放**它窗口里的事件，而重放里包含"镜像现在已经持有的、位于窗口之下"的那些——`appendEvents` 判断"低于窗口下沿 ⇒ 当历史"，于是**也走 `prependOlder`**。

`appendEvents` 已经按窗口成员去重，但 `prependOlder` **没有**：第二条路把第一条路已经插进去的事件**又插了一遍**，装配器的严格递增规则就拒了。修法（`85909df`）：`prependOlder` 也拿**当前窗口快照**做成员判断（那是唯一知道窗口里到底有什么的地方），已在窗口里的事件跳过而不是重插。

> **教训**：`242bb8f` 修的是"**帧**里的旧事件不要当新事件 append"，这次是"**页**里的旧事件不要重复 prepend"——同一个不变量（**同一条事件只能进窗口一次**）有两条入口，上一轮只堵了一条。

### "历史按钮一直在、点了不加载"：翻页是通的，慢在投递（2026-09-25 晚，已修）

用户报"服务器历史按钮一直显示且无法加载历史会话"。**先量，不猜**——在一次点击前后同时读两端：

| 侧 | 点击前 | 点击后 |
| --- | --- | --- |
| 服务器镜像 | 696 条 / `2419..3114` | **1005 条 / `2126..3130`**（下沿降 293 条） |
| 源站 `page` | `null` | **`{beforeSeq: 2420, records: 294}`** |
| 源站投递队列 | — | `/frames:34`、**`waiting: 1766`** |

**结论：服务器与协议都没问题**——按钮确实触发了源站读页、页也读出来了。问题在**投递与等待**：

1. **页是经 SSE 慢吞吞送回来的**，而客户端等待窗口只有 `10 × 3 秒 = 30 秒`；源站那一刻还压着 **1766 条**排队。而浏览器到服务器那条 SSE 恰好是整条链里**最不稳的一环**（Console 里 `GET /plugins/events net::ERR_HTTP2_PROTOCOL_ERROR 200` 反复出现 7 次，就是 §4 第 3 条那个"Cloudflare 切空闲 SSE"）。
2. **页太小**：`OLDER_PAGE_MESSAGES = 50` 是**消息**数，而"一个事件 ≠ 一条消息"——实测这条会话大约 **6 个事件/消息**，所以一页只给 ~294 条事件，长会话要来回十倍次数。

**修法**（`9dc8742`）：

- 客户端等待改为 **30 次 × 3 秒**，并且**两种到达都算成功**：拿到那一页，或"窗口下沿已经移到了起始位之下"（同一页，只是已被合并）——这样不再把整件事押在那条不稳的流上；
- 读方要的页大小提到**源站自己的上限 500 消息**（与 `materialize` 同一口径）。

> **教训**："点了没反应"要拆成三段量：**请求有没有发出 → 对面有没有干活 → 结果有没有回来**。这次前两段都是好的，只看界面会误判成"翻页坏了"，而真相是第三段慢 + 客户端等得不够久。另外：**50 条消息 ≠ 50 个事件**，这个换算在工具密集的会话里是 6 倍。

### 第四、五个问题：跨平台 cwd，以及"成功"形状的静默截断（2026-09-25 晚，都已修）

回填预算加宽后（`c3862a2`，一轮等 30 秒 = 覆盖实测 10–20 秒的页延迟），受控整链用**真实 8.08 MB / 11837 条日志**跑通：`{"ok":true,"written":11836,"skipped":0,"archived":true}`，物化日志 11837 记录 / seq 0..11835 / 头尾类型与源站相同。

但**在线上**（Windows 源站 → Linux 服务器）它连日志都建不出来：

```json
{"ok":false,"written":0,"skipped":9323,"archived":false,
 "reason":"cannot create the log: SessionFormatError: format v4 header cwd must be absolute"}
```

**问题四：`node:path.isAbsolute` 判的是本机平台。** Linux 不认 `C:\…`，于是 Windows 源站的会话永远物化不到 Linux 服务器上。修法（`5a80c15`）是 `portableCwd`：把盘符路径改写成 `/C:/a/b`（到处都是绝对路径，且仍看得出原始盘符）；本机已认的直接原样传（**同一个输入在 Windows 上不得被改写**）；无法改写的**丢掉而不是猜**——错的 cwd 比没有更糟。测试注入两套平台语义，所以在谁的机器上跑都钉得住。

**问题五（最危险）：写入器会"成功地"写半条日志。** cwd 修好后线上返回：

```json
{"ok":true,"written":767,"skipped":9323,"archived":true}
```

写入器逐条对 seq 校验，**一个洞不是留一个洞，而是让日志到此为止**——洞之后每条都被当成"乱序"跳过。于是它写了 seq 0..766、归档、报 `ok: true`，而那份只读日志替的是 11835 条的会话，**结果里没有一个字说这件事**。这比拒绝更糟：镜像本来就短，现在还有一份日志声称它完整。修法（`32298d1`）：写入前先确认这段连续区间真的到达最后一条镜像事件，否则拒写并报出停在哪一条。

> **教训**：`skipped` 计数看着像"少量坏记录被挡在盘外"，其实一个洞就能让它是 9323/10090。**"写成功"的判据必须是"写出的连续性覆盖了输入的范围"**，而不是"至少写进去了一些"。

**仍未解决**：这条线上会话的镜像**中间有洞**（`missing: 9040`）。物化需要从 seq 0 起**连续**，所以在那之前它会被正确地拒写。洞的来源是镜像自身的重放/裁剪历史（本会话 §4 第 1 条早有记载）。**下一步**：让 `missingOf` 报出的 `holes` 各自触发一次 `{kind:'older'}` 读页（`beforeSeq` = 洞的上沿），把洞逐段补上；机制齐备，不需要新协议。

### 第三个瓶颈：镜像的浏览上限挡住了回填（2026-09-25 晚，已修）

线上 walk（本机 17:02 重启后的构建）**40 轮零空洞**、每页边界都在——边界修正确实在跑。但它停在 `7836..11835`（**恰好 4000 条**）不动，和上一轮一模一样。原因不是分页：

**镜像按设计只保留最新 4000 条，从前面裁。** 回填要的是**开头**，所以每页一到就被上面那些事件挤出窗口；下沿于是永远停在 cap 上，而会话看起来"完整"（`missingEvents: 0`）。**任何超过 4000 条的会话都无法物化**——这正是 `written 3478` 那次能成功、而 11836 条这条永远不动的原因。

**修法**（`4f3ed9a`）：给会话加一个**只在调用方明说需要历史时才抬高的天花板**：

- `SessionRecord.retain`，只能由 `transcript({retain})` 抬高，受 hub 自己的 `RETAIN_LIMIT = 40000` 硬夹（**调用方不能自己指定内存预算**），且**不会被普通读降回去**；
- `materialize` 在开始读之前抬高、在 `finally` 里显式释放（hold 是"这一次走查"的，不是会话终身的）；
- 顺手修了一个同类错觉：`transcript` 的页大小被 `EVENT_LIMIT` 夹住，于是持有 4500 条的调用方只能拿到最新 4000 条——**从调用方看和"回填没前进"完全一样**。现在夹到该会话自己的天花板。
- **浏览式翻页故意不抬**：否则任何滚动阅读的读者都能让镜像按会话数膨胀。所以"下沿能否越过 4000"这条判据只在 materialize 路径上成立，线上 walk 停在 4000 是**设计如此**。

`tests/mirror-retention.spec.ts` 四条规则各一条断言（默认裁剪 / 抬高后不裁 / 不降且不越硬顶 / 释放后恢复裁剪）。

**整链在新构建上复验**（受控两端，源站是那份真实 3479 条日志）：`POST /materialize` → `{"ok":true,"written":3478,"skipped":0,"archived":true}`，耗时 0.9s；物化日志与源站逐帧一致（3479 记录 / seq 0..3477 / 头尾类型相同）；镜像 `events=3478 missing=0`。

### 回填能走通了，但它每页丢一条（2026-09-25 晚，已修）

本机重启后实测：**读页通道通了**——源站 `page = {beforeSeq: 11254, throughSeq: 11835, records: 296, hasMore: true}`，上一轮这里恒是 `throughSeq: -1` + `no follow or no page API`。镜像也确实开始往回长（`282 → 580 → 876 → 2071 …`）。

但**每一页的边界上正好少一条**，洞的位置逐条等于那次请求的 `beforeSeq`：

```text
镜像 11554..11835（282 条）
请求 before=11554 -> 拿到 ..11552   ⇒ 11553 成了洞
请求 before=11254 -> 拿到 ..11253   ⇒ 11254 成了洞
... 10 页之后：3468 条 / 10 个洞，洞 = [254, 601, 915, 1244, 1556, 1886, 2187, 2500, 2812, 3157]
```

**根因是两侧对"上界"的语义差一**：镜像要的是"我持有的最低那条也要包含在内"（**闭**），而 DSH 的 `controller.page({beforeSeq})` 是**开**区间（只给严格更低的）。hub 在上游先减了一，源站又原样透传，于是"请求下沿之下"永远把下沿自己漏掉。**这个 bug 从外面看不出来**：每页形状都完好、只是少一条，只在 `missingEvents` 上留一个数。

**修法**（`3ee53ff`）：语义只翻译一次，放在唯一知情的那一处（源站 `pullOlder`，它同时知道读方要什么和 `page` 要什么）：

- hub 与 `backfill` 一律**原样传"我持有的最低 seq"**（参数 `beforeSeq` 改名 `throughSeq`，注释写明是闭区间）；
- 源站 `pullOlder` 里 `const beforeSeq = throughSeq + 1` 再交给 `page`。

**验证（受控两端，源站是真实 3479 条日志）**：同一套走查，改前 `0..3477 (3468 条) holes=[10 个]`，改后 **`0..3477 (3478 条) holes=[]`**，且每轮"请求的那个边界事件" `present=true`。回归测试 `tests/page-boundary.spec.ts` 断言的就是那个上界，**改回旧语义它会红**（实测 `fail 1`）。

> **教训**：`missingEvents` 是这类"每页丢一条"的**唯一**外部症状，而它看起来只是"镜像落后一点"。分页链路必须对**"边界那条在不在"**下断言——每页都合法、都少一条，是最容易被看一眼放过的一种坏。

**本机旧代码的现场证据（16:5x，重启本地之前）**：源站 `page = {beforeSeq: 9758, throughSeq: 11835, records: 304}`，而它上一轮读到的最低是 `9759` —— 请求上界比实际需要的小一，正是这个 bug 的指纹。本机重启后这里应变成 `beforeSeq: 9759`（读到自己持有的最低那条）。

**另一条要记住的**：这一轮我用 PowerShell 的 `Get-Content`/`Set-Content` 往返改文件，把 `—`（U+2014）写成了 `鈥?`（**GBK 解码 UTF-8 再写回**），提交并推送了。仓库里那个 `scripts/check-encoding.mjs` 正是为这件事写的（它之前已经抓到过两次同类事故），这次也是它抓到的。修法不是猜字符：用**未损坏的版本**逐处对齐还原（`873125a`）。**改文件一律用 Node/`[IO.File]::WriteAllText` + `UTF8Encoding($false)`，不要用 PowerShell 的读写往返。**

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
6. ~~**版本仍 `0.3.0`**，但行为已差很远；是否发 `0.4.0` 待定。~~ **已发 `0.4.0`（tag `v0.4.0`）**。注意：`github:` 依赖仍按 **commit** 解析，版本号只是标识——所以**改完 `src/**` 必须把 `lib/`、`client/` 两个产物一起提交**，服务器装的是 tarball 里的它们。
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

