# dsh-session-sync 推进记录

> 只写被证据支撑的事实：跑过的命令、测到的数字、看到的现象。每条结论都要能指出它是怎么被验证的。
> 本文件不参与构建。最近更新：2026-09-27（0.9.0：版本握手、洞/落后拆分、两档端到端）

## 0. 现状一眼看

| 项 | 值 |
| --- | --- |
| 仓库 | `C:\Users\14339\Desktop\git\dsh-session-sync` |
| 版本 | **`0.9.0`**（tag `v0.9.0`）· 版本握手 + 洞/落后拆分 + 两档端到端（见 §2） |
| 服务器 | `210.16.120.228` · DSH **`0.1.7-rc.2`**（`npx` 缓存 `4f4f47d9854f3c73`）· 插件 **`0.9.0`** · unit `dsh-web.service` |
| 控制台路线 | **`scope`**：服务器上 `dsh-api-session-controller/lib/client.js` 命中 `retainAgentScope` ⇒ 特性探测确定走它；`adopt` 在任何已发布构建里都不存在（该路线已从代码删除） |
| 服务器镜像 | 按需重建：源站 reconcile + follow 快照；此刻本机发布列表为空（`syncSessions: {}`），所以镜像里没有会话 |
| 旧副本 | 已留档移走（**未删**）到服务器 `/root/legacy-copies-<ts>/`：两个会话目录 + 投影缓存 + 台账 |
| 本机（源站） | DSH 源码运行（checkout = `dsh-v0.1.7-rc.1`）· profile 装 **0.9.0**；Host 半边要等一次本机重启才换（会杀掉正在跑的会话，留给用户） |
| 控制台 | `https://dsh.c-zy.cc/?token=<43 位>`（浏览器 cookie 持久） |
| 同步口 | `210.16.120.228:8791`（源站连它；**不经** Cloudflare） |
| 测试 | **38 通过 / 0 失败**（13 suites，1.0s）· 含整链回归 `tests/e2e-chain.spec.ts`、版本 `tests/version.spec.ts`、客户端树 `tests/client-tree.spec.ts` |
| 端到端脚本 | `scripts/e2e-dsh.ps1`：构建工作树 → 两个真 `dsh web` 实例（3098/3099）→ 发布真会话 → 断言镜像 222 条 / 零缺口 / 版本握手 / 掉线再恢复，跑完自清理。**实测 all checks passed** |
| 文档 | `PROGRESS.md` 349 行（现状 + 本版日志 + 手册）；2026-09-25 及以前归档在 `docs/history-2026-09.md`；计划在 `docs/project-plan.md` |
| 版本握手 | `state.pluginVersion`（本机）+ `machines[].pluginVersion`（各源站自报）；设置页显示并在不一致时标红；`build-and-install.ps1` 会核对产物自报的版本 |

**2026-09-25 服务器更新（三次）**：插件 `13b7aa2`（按字节切批 + 具名 413）→ `b2a7811`（回填分页边界）→ `4f3ed9a`/`c3862a2`/`5a80c15`/`32298d1`（保留上限 / 预算 / 跨平台 cwd / 拒写截断）→ **`v0.4.0`（tag）**。每次都用 lock 的 tar.gz + 安装产物的代码标记双向核对（`v0.4.0` 这次 9 个 host 标记 + 2 个 client 标记全中、旧串 `no follow or no page API` 为 0），`systemctl restart dsh-web` 后 active、3080/8791 在听。依赖也从裸 `github:` 改成 **`github:cczzyy-cn/dsh-session-sync#v0.4.0`**（lock → `8eeb0dd`），改前备份 `/root/package.json.bak-<时间戳>`。**本机 origin 跑的是 18:12:58 启动的构建**（`lib` 与仓库哈希一致，即含全部修复）。

**2026-09-24 服务器更新**：DSH → 最新发布版 `0.1.7-rc.2`，插件 → `db28d2e`。**顺序很重要：先插件、后 DSH**——补丁那份产物只对 alpha.2 有效，升版后控制台靠插件里的 `scope` 路线画原件，而旧插件只会 `adopt`，顺序颠倒会掉回手绘面板。

线上实测：控制台画的是 **DSH 原件**（shipped 头部 `deepseek-flash · low`/`完全权限`、`用时 3 秒 ⌄` 回合折叠、shipped 操作行与 `3 轮 · 28 步 · 18 tok/s` 状态行），输入框由插件接管（`在服务器侧接管续聊…`），会话树无「缺 N 条」。新缓存目录 `4f4f47d9854f3c73` 里 `is a mirror and accepts no prompt` = **0**，即**补丁已随版本失效且不再需要**；`patches/` 保留给"想让 shipped 输入框也能发言"的宿主与 alpha.2 回滚路径。回滚 unit：`/etc/systemd/system/dsh-web.service.bak-2026-09-24-173039`。

只改 `src/client/**` 的提交（如 `d535743`、阶梯那次的主体）→ **不需要重启本机源站**；任何改到 `src/host/**`、`src/shared/**`、`src/index.ts` 的提交都**需要用户重启本机**（会杀掉当时正在跑的那个会话）。

---

## 0.5 任务清单已搬到 `docs/project-plan.md`

原来这一节记的是**物化**那条线的完成度（"让镜像会话在服务器上成为真会话"），而它在 0.8.0 里
被整条删除了（见 §2）。留着一张描述**已废止目标**的尺子，正是这份文档以前吃过一次的亏
（过时的完成度比缺口本身更坏），所以整节移除：**现在打算做什么看 `docs/project-plan.md`，
现在是什么形状看 `README.md`。**

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

> 2026-09-25 及以前的推进日志（从"② 的答案"一路到 0.3.x）已归档到 `docs/history-2026-09.md`。
> 这一段只留本版（0.8.x）的改动与验证；历史文件是当时的推理记录，不要照它实现。

### Phase 3 收尾：文档收敛与客户端决策测试（2026-09-27）

- **PROGRESS 归档**：1211 行 → **340 行**。2026-09-25 及以前的 §2 整段搬到 `docs/history-2026-09.md`（818 行，开头写明"这是历史、有些结论已被证伪、别照它实现"）。首屏只留：现状表、环境事实、本版日志、关键数据、未解问题、操作手册、方法与坑。
- **§0.5「任务清单」整节删除**：它记的是物化那条线的完成度，而那条线已被删除——留一张描述**已废止目标**的尺子，正是这份文档以前吃过一次的亏。现在：打算做什么看 `docs/project-plan.md`，现在什么形状看 `README.md`。
- **§4「未解问题」重写**：物化那批（副本被写脏、读到就冻结、投影缓存、官方页毛刺、标题投影、归档不可读）随功能一起删除。剩下六条，其中一条是**澄清**：Cloudflare 切断的是 **DSH 自己的** `/plugins/events`（插件自己的 SSE 每 15 秒发 `: keepalive`），所以它**不在本插件的修法范围内**——以前把它记成"本插件未修的问题"并不准确。
- **客户端决策测试**：把树的分组/排序/搜索（`buildTree` + `matches`）从 `SyncPanel.tsx` 抽到无依赖的 `src/client/tree.ts`，新增 `tests/client-tree.spec.ts` 六条——机器按名字排（不是按发布先后，否则行会跳）、正在跑的会话置顶再按时间、目录按路径分组并排序、没有 `cwd` 的会话自成一组、搜索丢掉空机器、标题/目录/id 都命中且大小写不敏感并 trim。测试 32 → **38**；客户端半边 stub `tsc` 仍为 0。
- **README 同步**：镜像"缺多少"改写成 holes/behind 两个读数；**修掉一处过时的限制**（它写着中段空洞还不能被分页修，而 `reportGap` 早就在修——这条一直挂在计划 Phase 0 的漂移清单上）；设置页与 `/state` 的描述补上版本握手。

### Phase 2：把「缺 N 条」拆成洞与落后，并让离线的机器看得见（2026-09-27）

**要解决的问题**（这是 PROGRESS 自己记了很久的一笔账）：`missingEvents = holes + behind`，两个意思相反的量合在一个数字里，
于是**每个正常运行中的会话都挂着一枚「缺 N 条」**。读者因此无法区分"镜像坏了"与"源站刚发布了新事件"。

**做了什么**：

- 协议：`MirroredSession` 增加 `holes`（镜像内部真缺的段——扫描会去定点补读，是欠的修复）与 `behind`（源站已发布、镜像还没拿到——正在跑的会话的常态）；
  `missingEvents` 保留为两者之和，因为"一次 episode 是否清掉"仍按总数判断。
- hub：`shortfallOf()` 一次算出两个读数，`summary()` 都报出去；`missingOf()` 改成它的和。
- 控制台：树行与页头只在 `holes > 0` 时显示红色「缺 N 条」；`behind > 0` 时显示一枚淡色「落后 N」（悬停说明这不是故障）；设置页把两个总数分开显示。
- 中英文案各四条。

**验证**：`tests/hole-repair.spec.ts` 新增两条（洞只算洞；源站报了更高水位只算落后）；`tests/e2e-chain.spec.ts` 断言一份已交付的快照既不是落后也不是洞。测试 30 → **32**。

**离线那一半**：控制台对离线机器的变暗与「离线」文案早就有了，但它**从来没被验证过**。这轮把它写进 `scripts/e2e-dsh.ps1`：
停掉源站实例 → 服务器在 45 秒内把它标成 offline → 重启源站 → 镜像重新跟上。**实跑 all checks passed**。

### Phase 1 第二档：两个真 `dsh web` 实例的端到端脚本（`scripts/e2e-dsh.ps1`，2026-09-27）

**它跑了什么**（`powershell -ExecutionPolicy Bypass -File scripts/e2e-dsh.ps1`，约 40 秒）：

1. **先构建工作树**，再把它装进一次性 profile——所以它验的是"你正在改的这份代码"，而不是上一次发布的包；
2. 两个隔离 home（`%TEMP%\dsh-sync-e2e-<ts>\{server,origin}`）各起一个真 `dsh web`（3099 / 3098）；
3. 源站发布一份**真会话日志**（这次是 140 KB 的 `session-4cf56909`，从真实 home **复制**，不动原件）；
4. 断言**服务器插件的 `/state`**：镜像里那条会话 `eventCount 222`、`missingEvents 0`；`transcript` 路由读得出来；源站自报 `linked: true` 与 `published: 1`；
5. 断言**版本握手**：两端都报出被装进去的那份构建的版本（见下一条）；
6. 收尾：按 `--port` 精确杀进程、用 `cmd /c rmdir` 删 junction、删临时树——**跑完复核过：端口 3098/3099 已释放、临时目录已空**（这条必须验，本项目有过残留实例的前科）。

**实跑**：`all checks passed`（exit 0），222 条事件、零缺口。

**它遵守的规矩**（每条都踩过一次）：`DSH_HOME` 用包一层 `.ps1` 的 `Start-Process` 注入（harness 会覆写自己 shell 里的 `DSH_HOME`）；**不用 junction 当 profile**（`dsh plugin add` 会把真实 profile 清空），而是复制真 profile 的形状、只把 `.pnpm` 与 `vision` 这类只读入口 junction 过去，插件本体是工作树的**拷贝**；junction 一律 `cmd /c rmdir`；参数与变量都不叫 `$home`（PS 自动变量）也不叫 `$pid`。

### 版本握手：两端插件版本随发布过去，并在设置页比较（2026-09-27）

**它要解决的问题**：这个项目已经两次靠人手读 lockfile 才发现"两边不是同一份构建"（0.4.x 那次，以及本机 0.7.1 / 服务器 0.7.3 那次）。协议里没有任何字段说这件事。

**做了什么**：

- 新增 `src/host/version.ts` 的 `pluginVersion()`：从**自己所在的模块**推 `package.json`（构建产物在 `lib/`、源码在 `src/host/`，两个候选都试），并**按 name 校验**——拿到的版本必须属于这个包，否则报 `unknown`，绝不猜。
- 协议：`PublishIndexPayload.pluginVersion?`、`MirroredMachine.pluginVersion?`、`SyncState.pluginVersion`（本机自己的）。
- 发布链路：源站每次索引都带上自己的版本 → `OriginLink.publishIndex` 原样发出（机器名仍由 token 决定，客户端不报名字）→ 服务器只接受字符串，存进 machine record，**整体替换不合并**（不再声明的机器不该继续显示旧版本）。
- 设置页状态块：`插件版本 0.8.0 · DESKTOP-M1EERFC 0.8.0`，两端不一致时标红并写"两端版本不一致"。
- 出口：`src/index.ts` 重新导出 `pluginVersion()`，于是 `node -e "import('…/lib/index.js')"` 能问出一份**装好的**构建自报的版本——这是唯一能问"这个进程加载的是哪份代码"的办法。
- `scripts/build-and-install.ps1` 加了一道发布校验：构建后**问产物本人**（不是 grep 字符串）它自报的版本，与 `package.json` 不一致就抛错。实跑输出：`built 0.8.0; the bundle states the same version`。

**验证**：`tests/version.spec.ts` 钉住"从源码侧也读得出真版本"；`tests/e2e-chain.spec.ts` 多一条——镜像里的机器版本必须等于源站自报的版本（穿过真实的 `/publish` 与 hub）；两实例脚本里再验一次。

### Phase 1：整条链的端到端回归进了仓库（`tests/e2e-chain.spec.ts`，2026-09-27）

**为什么需要它**：这条链过去只在浏览器里、对着部署好的两端被手验过；"接管续聊"这一腿此前**没有任何自动化覆盖**，而改 Host 半边又必须重启用户正在用的实例——于是"改完就能验"一直做不到。

**它跑了什么**（一个进程里，全是真件）：真 server-role 引擎（自己起监听）↔ 真 client-role 引擎（自己开链路）↔ 真镜像；源站那头是一个模仿 `SessionController` 的替身。一条用例串起六件事：

1. 发布 → 镜像握住源站开场窗口（3 条），`missingEvents: 0`——源站说日志更早还有内容，那是 `hasOlder`，不是缺口；
2. 控制台读最新窗口（seq 3..5），`hasMore: true`；
3. 读窗口之下的一页 → 源站的 `page` 被调用，且**切在下沿之上**（`beforeSeq === oldest + 1`，页里包含读者已有的那条——这个边界这个项目错过三次）；
4. 那一页**真的到了**：镜像从 3 条长到 6 条。"被读了"与"读者看得见"的区别，正是 `0.4.3` 修掉的那条（页被缓冲在一个会被 resync 替换的 follow handle 上）；
5. **接管**：`submitCommand` → 源站的 `prompt` 收到 `'hello from the console'`（首尾空白被裁掉）→ 控制台从自己的 SSE 收到 `accepted`；
6. 契约守卫：两半的 `state` 里都没有 `materialize`/`materialized`（防删掉的功能偷偷长回来）；未发布的会话被拒。

**实跑**：`node --experimental-transform-types --test "tests/*.spec.ts"` → **29 通过 / 0 失败**（10 suites，约 1.0s）；新用例自己 0.3s。**不需要 DSH、不需要用户机器、不占 3098/3099**（用 18805/18806）。

**写它时踩到的两个"看起来像 bug"**：镜像守住的是**开场窗口**而不是整条日志（拿"镜像条数 == 源站事件数"当判据会一直等下去）；读页的触发条件是 `start === 0 && before !== undefined && originHasOlder`，而请求里的边界是**读方下沿 + 1**。

**还没做（下一轮）**：plan §3.3 Phase 1 里"真起两个 `dsh web` 实例"那一档仍在外面——它要验的是"插件能不能在真 DSH 里加载、真 `SessionController` 的行为是否与替身一致"，这些在进程内替身里看不到。

### 「写成真会话」（物化）整条移除（v0.8.0，2026-09-27）

**用户的决定**：不要真会话功能。于是这条线**删除**，而不是加个默认关的开关——留一个不再有人读的开关，正是这个项目一直在清理的那种漂移。

**Host 侧删掉的**：

- 三个文件：`src/host/materialize.ts`（把镜像写成 DSH 日志）、`src/host/ledger.ts`（只读台账）、`src/host/logfile.ts`（切 DSH 自己的 `session/end-seed`、清投影缓存）。
- `service.ts`：`DIVERGED_REASON` 与 `BACKFILL_*` 常量，`ledger`/`materializing`/`waits`/`repairs`/`headerSeen` 字段，以及 `materialize()` / `holdsMirrorOf()` / `clearStaleArchive()` / `copyDiverged()` / `repairCopy()` / `unaccounted()` / `releaseMaterialized()` / `materializeTick()` / `syncMaterialized()` / `backfill()` 一整块（约 500 行）；`view()` 里的 `materialize`/`materialized`、`patch()` 里的开关与即时 tick、`start()` 里的每轮物化。
- `index.ts`：`agent/pre-step` 门禁与 `/materialize`、`/materialize/release` 两条路由。
- `protocol.ts`：`MATERIALIZED_FILE_NAME`、`SyncConfig.materialize`、`SyncState.materialize`/`materialized`、`ConfigPatch.materialize`、`SessionHeader` 与两个发布载荷里的 `header`。
- `dsh.ts`：`HostContext.on('agent/pre-step')`、`PreStepLike`、`PreStepDecisionLike`、`WorkspaceRegistryLike`、`FollowSnapshotFrame.header`。
- `transport.ts`：`headerOut` 与 `publishFrames` 的 header 参数（header 跨链路的**唯一**消费者就是那个写入器）。
- `hub.ts`：镜像里的 `header`、`sessionHeader()`，以及只为回填存在的保留上限（`RETAIN_LIMIT`、`transcript({retain,release})`）。

**客户端删掉的**：设置页的「写成真会话」开关与「已写成真会话」列表、会话行上的「真会话」徽标与 `uiWorkspace.openSession` 跳转、`routing.ts` 的 `freshIds`/`rowTarget`、`CopyStateAction.tsx`（DSH 页头那枚状态片）整个文件、`api.ts` 空态里的 `materialize`，以及中英各 12 条文案。

**顺带修掉一条既有类型错**：`tool-cards.ts` 的 `pickString(parseArgs(...))` 把可能为 `undefined` 的值传给了一个不接受的参数——客户端半边在本仓库无法整体 `tsc`，所以它一直是隐形的。这轮给它写了一份最小 stub（react / jsx-runtime / ui-primitives / client-store / css modules），**第一次**把客户端半边整体过了一遍 `tsc`：退出 0。

**效应**：`lib/index.js` 152,841 → **102,073 B**（−33%）；`client/client.js` 324,598 → **310,315 B**。测试 **28 通过 / 0 失败**（删掉的是只为这条线存在的 6 个测试文件与若干用例，另补了一条"文档里的旧键被忽略"）。

**验证边界（诚实）**：Host 半边 `tsc` 0、客户端半边 stub `tsc` 0、构建通过、28 条测试全绿；**线上尚未部署**。

**服务器上留下的东西（用户已定：清掉）**：那两份副本（`session-e08471af` 5076 条、`f6ba2b3b` 3478 条）与台账文件已经**留档移走**，没有删除——见下面的上线记录。升级之前，旧版本的门禁仍然护着它们。

**上线（`v0.8.0`，这次**必须**重启服务器：Host 半边变了）**：

- 本机：commit `f2b167a`、tag `v0.8.0`、push 到 `origin/main`（docs 跟着一条 `e7d3fa3`）。
- 服务器：`#v0.7.4` → `#v0.8.0`，lock → `tar.gz/f2b167ae9097e66a806008e2a76c7651590418fa`；装出的产物与本机构建**逐字节相同**（`lib/index.js` **102,073 B**、`client/client.js` **310,315 B**）；旧功能标记：host `materialize|MirrorLedger|agent/pre-step` = **0**、client `真会话` = **0**。
- 重启前后：`systemctl stop dsh-web` → 移走旧副本 → `systemctl start`；`active`、`127.0.0.1:3080` 与 `0.0.0.0:8791` 在听。
- **旧副本的留档位置**：`/root/legacy-copies-<ts>/`，里面是 `session-e08471af-…`、`session-f6ba2b3b-…` 两个目录、`session-e08471af-….json`（投影缓存）与 `dsh-session-sync-materialized.json`（台账）。服务器 `sessions/` 下只剩它自己的三条（`0a8b2f20`/`d7ab13f0`/`cf35e2ac`），`/dsh-session-sync/sessions` 里也不再有那两条。
- `/state` 的自检：`materialize` / `materialized` 两个键**都不在了**（`grep -o 'materializ[a-z]*' | wc -l` = 0）。`machines[].sessions` 此刻为空，因为本机发布列表是空的（`syncSessions: {}`），不是缺陷。
- **浏览器拿到的确实是新包**（不重启浏览器那侧）：shell 里 `rev=d43163288038`，取 `/plugins/??dsh-session-sync/client.js&rev=…` → `200`、310,353 B（= 盘上 310,315 + 38 B 注册表外壳），`scopeCapable` 命中、`真会话` 为 0。
- 本机 profile：`pnpm update dsh-session-sync` → **0.8.0**（产物字节与服务器一致）。**本机 Host 半边仍是进程里那份旧的**（进程 23:24 启动），要对齐需要一次本机重启——那会杀掉正在跑的会话，留给用户。

### scope 路线收口：adopt 与 address 两条死路删掉，官方渲染只剩一条（2026-09-27）

**决定**：A 线（控制台）走 **`scope`** 路线——用 DSH 自己的会话组件画，不再维护"只有打过补丁的宿主才有"的 `adopt`。

**先核实线上到底走哪条**（否则"执行 scope 路线"没有对象）：

- 服务器单元：`ExecStart=/usr/bin/npx -y @deepseek-ai/dsh@0.1.7-rc.2 web --port 3080 …`；`npx` 缓存里 `4f4f47d9854f3c73` = **0.1.7-rc.2**（另一个 `d460afef2690c19d` = alpha.2，正是当年打补丁的目标）。
- `grep -rl retainAgentScope /root/.npm/_npx/4f4f47d9854f3c73/node_modules/@deepseek-ai/` → `dsh-api-session-controller/lib/client.js` 命中；`adopt` 在**任何**已发布构建里都没有。
- 插件侧的判定是确定性的（`routeOf()` 先看 adopt、再看 scope），adopt 不存在 ⇒ **线上控制台走的就是 scope**；这与 README 里 `原件 · scope` 的实测一致。
- 本机 rc.1 源码同样有这条缝（`packages/api/session-controller/src/client/sessions/service.ts:487`）。

**改了什么**（纯客户端半边 ⇒ 不需要重启任何 Host）：

- `src/client/official-session.tsx`：删掉 `adopt` 与 `address` 两条路线，以及只为它们存在的东西——`AdoptSource` / `AdoptedSessionHandle` / `AdoptVerbs` / `SubagentAddressLike` / `RemoteResultLike` / `RemoteFailureLike` / `SessionSummaryLike` / `OfficialTransport` / `OfficialMirror.handle` / `parentId()` / `summaryOf()` / `rowOf()`；`OfficialRoute` 收敛成 `'scope'`。
- 判定抽进无依赖的 `routing.ts`：`scopeCapable(service)`——**两半都要**（`retainAgentScope` 负责"能保留"，`binding` 负责"有窗口"），缺一个就继续用手绘面板（保留但没有窗口 = 画个空面板，比手绘更坏）。
- README：三路线表改成一条；`patches/` 记作历史（插件已无 adopt 路线，打上也无效）；Limitations 里"每条路线但 adopt"之类的措辞一并改掉。
- `patches/` 文件**保留**（alpha.2 的回滚产物），只是不再被任何代码路径使用。

**验证**：

- `tests/client-routing.spec.ts` 新增 5 条钉住 `scopeCapable`（两半齐全 / 缺窗口 / 缺保留 / 动词不是函数 / 上下文没有）。**91 通过 / 0 失败**（原 86）。
- 客户端半边在本仓库**无法直接 `tsc`**（缺 `react` 与 shipped 包，见 §"完成度检查"那条）。本轮用一份一次性配置把 `official-session.tsx` + `api.ts` 拉进程序做类型检查（`%TEMP%\synccheck`，react/jsx-runtime/client-store/ui-slots 用最小声明顶替），**退出 0**；顺带抓出并修掉一条**既有**类型错：`prependOlder` 的入参被声明成整个 `MirrorTranscript`，而调用点只带 `events/hasMore`。
- `tsdown` 两半产物重建：`client/client.js` 329,057 → **324,598 B**（−4.4 KB，删掉的正是这条路）；`lib/index.js` 未变（Host 半边没碰）。

**行点击的目标：用户选了"保持现状"**（2026-09-27）。今天"有副本"的行仍旧打开 DSH 官方会话页（`rowTarget` 语义未改），所以服务器上那条已发布的会话点开看到的还是官方页——**scope 面板只在没有副本的会话上出现**，或者把设置页的 `写成真会话` 关掉。

**上线（`v0.7.4`，只改客户端半边 ⇒ 两个 Host 都没重启）**：

- 本机：commit `ef665d9`、tag `v0.7.4`、push 到 `origin/main` 与 tag。
  > 踩到一次：凭据管理器里 `gh:github.com:cczzyy-cn` 的 blob 是 **UTF-8**，不是 UTF-16——按 Unicode 解出来是 20 个乱码字，GitHub 直接 401。改成 `[Text.Encoding]::UTF8.GetString()` 后 40 字符的 `gho_…` 一次推成功（先用 `api.github.com/user` 验过 token 有效再推）。
- 服务器：`#v0.7.3` → `#v0.7.4`，lock → `tar.gz/ef665d9d159715d7e592f9a49993d78645a2a474`；装出的包 `0.7.4`，`client/client.js` 324,598 B（sha256 与本地产物**逐字节相同**：`86a67dfa…`）；`dsh-web` 全程 active。
- **没有重启，浏览器拿到的确实是新包**（这条不靠推断）：从服务器上带 cookie 取 `/plugins/??dsh-session-sync/client.js&rev=ff41a8771b62` → `200`、324,636 B（= 盘上 324,598 + 38 B 注册表外壳），其中 `scopeCapable` 在、新文案在、`OfficialTransport`/`AdoptSource`/旧的三路线文案**全为 0**。
- 本机 profile：`pnpm update dsh-session-sync` → `0.7.4`（lock → `ef665d9`）；`lib/` 自 `0.7.3` 起未变，所以本机 Host 半边是同一份代码，只是内存里仍是 01:13 装载的那次加载。


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

> 物化那一批（副本被写脏、读到就冻结、投影缓存、官方页毛刺、标题投影、归档不可读）随功能一起删除了，不再列。
> 这里是 0.8.0 之后仍然开着的：

1. **中段空洞的修复从未被线上观测到。** `reportGap`/`holesOf` 有实现、有单测、有合成端到端（0.4.1→0.4.3 三轮修成），
   但线上监控 24 轮 `missing=0 / holes=0`——**没坏过，所以没看见过**。判据：`state.machines[].sessions[].holes > 0` 时，
   下一轮它应当自己回落到 0（`tests/hole-repair*.spec.ts` 三个层次都钉着这条）。
2. **Cloudflare 会切断空闲连接，而那条流不是我们的。** 浏览器里的 `GET /plugins/events net::ERR_HTTP2_PROTOCOL_ERROR` 是 
**DSH 自己的**插件事件流（它不发心跳）；插件自己的 `/dsh-session-sync/events` 每 15 秒发一次 `: keepalive`。
   所以这一项**不在本插件的修法范围内**：要么在 DSH 侧修，要么把控制台放在不经 Cloudflare 的路径上。
3. **控制台仍然是"抄"的 shipped UI。** 会话正文现在由官方组件画（`scope` 路线），但树、工具卡家族表、`locales` 里的串仍是抄的；
   上游一改就会漂移，只能靠人眼比对发现。缓解：`scopeCapable` 特性探测 + 自绘兜底，功能不受影响。
4. **接管续聊的线上回归没有做。** 进程内整链（`tests/e2e-chain.spec.ts`）已经覆盖 `submitCommand → 源站 prompt → accepted`，
   但"真在两台机器上发一条 prompt 并看到回复"这条只在 0.5.x 时代验过。
5. **改 Host 半边要重启用户的本机**（会杀掉正在跑的会话）。这条不会消失，只能用 Phase 1 的两档验证把代价压到最低——两档都已就位。
6. **`github:` 依赖按 commit 解析**，版本号只是标识：**改完 `src/**` 必须把 `lib/`、`client/` 两个产物一起提交**
   （`scripts/build-and-install.ps1` 会核对产物自报的版本，但不会替你提交）。

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

