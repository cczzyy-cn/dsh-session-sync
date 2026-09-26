# Host 侧适配：让镜像会话在服务器上成为"真会话"

> ## ⚠️ 本文的方案已按实测改过两处，别再照 §2、§9 的原文实现
>
> **① 不归档。** 原文推荐"物化 + **归档**"，理由是归档能让会话只读。实测证明它同时让会话**不可读**：
> `ui-workspace` 的 `guardedOpen`（`rows/WorkspaceBrowser.tsx:851-859`）对归档行只提示
> `archivedNotOpenable`（"已归档对话暂时无法查看"），而 `tree.ts:251-262` 的默认筛选**直接隐藏**归档行。
> 为只读而归档，代价是连读都读不了。
>
> **现在的形状**：物化（不归档）+ 插件自己的 `agent/pre-step` 门禁（返回 `{kind:'reject'}`）+ 一份持久化台账
> （`$DSH_HOME/dsh-session-sync-materialized.json`）。shipped 的 `ArchivedSessionGate`
> （`api/session-controller/src/archived-session-gate.ts:23-32`）就是同一个接缝。`0.5.5` 起，旧构建留下的归档
> 会在认领时被自动取消。
>
> **② 写入顺序的收尾不同。** §9 的清单以 `workspaceRegistry.archiveSession(源站 id)` 收尾，现在没有这一步；
> 换成"记进台账"，并在每次追加前把日志尾部与镜像在同一 seq 上的事件比一次（不一致就停手并上报——
> 副本自己长出来的事件会占用源站接下来要用的 seq，在其上继续追加等于在中段埋一个洞）。
>
> 线上验证（三条判据）与那两个只有真跑起来才现形的缺陷（`SessionAlreadyOwnedError` 该算 `wait`、
> `eventCount` 在契约里是可选的）记在 `PROGRESS.md` §2。下面的正文保留原样，作为当时的推理记录。

> 结论先行：不必给 Host 打补丁。DSH 已经有两条现成机制——**冷读日志的历史分页** 和
> **归档闸门**（归档会话不可能跑出模型步）——所以正确形状是"**物化 + 归档**"：
> 由插件的 Host 半边把镜像写成一份符合 DSH 格式的会话日志，再把它归档。
> 本文件列出这条路的承重点、写动词策略、风险与验证计划，供评审后再动手。

## 1. 为什么需要它

客户端伪装（`scope` / `adopt`）只覆盖**浏览器半边**。凡是要按会话 id 向**宿主**取数的能力都断在边界上：

| 症状 | Host 侧的调用 |
| --- | --- |
| `历史加载失败 … not found` | `Session.open()` → `remote.session.page` |
| 原版「加载更早」不出现/不可用 | 同上（`Session.loadOlder`，session.ts:413 → transport.ts:228 → index.ts:451） |
| 跳转 `loadThrough` | 同上，`JUMP_PAGE_OPTIONS` |
| `/api/changes.summary` 404 | `ui-deliverables` 的 Host 路由 |
| `反馈状态加载失败` | `remote.messageFeedback.list` |
| 分支 / fork 不能用 | Host 创建会话 |

其中**只读**的那部分（历史、跳转、投影基线）正是"物化"能一次性解决的。

## 2. 两条候选形状

| | A. 物化 + 归档（推荐） | B. Host 服务适配 |
| --- | --- | --- |
| 做法 | Host 半边把镜像事件写成真会话日志（v4），并 `archiveSession` | 改 DSH 的 Host，让 `history.page` 从内存镜像作答 |
| 需要改 DSH 吗 | **不需要** | 需要（Host 侧补丁，比客户端 `adopt` 重） |
| 分页 | `session-query` 冷读日志，原版控件直接可用 | 需自己实现 message/turn 对齐的分页 |
| 会话在列表里 | 自然出现（日志即真相） | 需自己注册进列表 |
| 跑模型步 | **被 `ArchivedSessionGate` 自动拒**（`agent/pre-step` → reject） | 需自己加拒答逻辑 |
| 主要风险 | 日志格式版本耦合、事件必须过 DSH 校验 | 与上游 Host 语义分叉、维护成本 |

## 3. A 的承重点（逐条都要过）

1. **日志必须由 DSH 自己的格式代码写**：`session.v4.jsonl.zstd`，带 header、密集 seq、
   事件校验（`session-format-v3-to-v4`、`session-persistence-jsonl` 的编解码与 invariant）。
   手写字节不安全：一条不合法事件可能让**整个会话**在 Host 眼里不可读。
2. **seq 必须保持源站原值**。这是最容易被忽略的一条：若用 `session.append(type,data)` 这类
   本地写入 API，**seq 由本地重排**，镜像的 seq 键（客户端窗口、`missingEvents`、分页游标）
   全部错位。必须走"导入/还原"式的编码路径，把源站 seq 原样落盘。
3. **会话 id 必须与客户端询问的 id 一致**。今天客户端用的是合成 id
   `dsh-session-sync:<machine>/<sessionId>`，其中 `/` 会破坏日志目录路径（`sessions/<project>/session-<id>/`）。
   推荐改成 **直接复用源站会话自己的 id**（`session-ba0c1a83-…`），客户端 adopted id 随之改为它。
   - 代价：失去 `machineName` 前缀，理论上两台源站同名同 id 会撞——uuid 碰撞实际不可能，但要在文档里写明。
   - 收益：Host 侧无需知道"同步"这件事，一切按真会话走。
4. **项目目录**：日志落在源站那条会话的 cwd 对应目录下（header 里就有 cwd），列表分组自然正确。
5. **单写者**：日志只能由服务器进程写（插件 Host 半边）；镜像与日志同步增长。
6. **写完才归档**：`archiveSession` 对"未知会话"会 reject，顺序必须是"日志先落地 → 归档"。
7. **归档要持久**：归档集存在 workspace registry 的持久状态里，重启后仍然拒绝模型步。

## 4. 写动词策略（谁答、谁转发）

| 动词 | 物化方案下的行为 | 处置 |
| --- | --- | --- |
| prompt | 归档闸门拒（`agent/pre-step` reject，轮次 `blocked`） | **保持拒绝**；发言仍走我们的接管通道转发源站 |
| cancel / steer | 无本地回合可取消 | 拒绝（同上） |
| fork / 分支 | 会在**服务器**上建一个新会话（语义错误：应fork源站） | 面板已隐藏；Host 侧仍可 fork —— 记录为已知偏差 |
| 反馈 rating/note | 写进**服务器**的 `messageFeedback`（归属错误） | 面板已隐藏；若要正确，需走同步链路写回源站 |
| 交付物摘要 | 由服务器 workspace 现算（内容错） | 面板已过滤公告；同上 |
| rename / 标题 | 写服务器本地 header（不回流源站） | 记录为已知偏差（可选：反向同步标题） |
| 归档 / 取消归档 | 本地动作，正合我们所需 | **使用它**（物化后立刻归档） |

## 5. 风险与未知

- **格式版本耦合**：DSH 升级若改 v4 → v5，物化代码要跟着走；升级路径本身有 migration 支持，
  但我们要能识别"这份日志是哪个版本写的"。缓解：物化时以当前安装的格式版本为准，并在 `state` 里暴露它。
- **校验失败的影响面**：一条不合法事件会让会话在 Host 眼里整体不可读（比"少几条"严重）。
  缓解：写入前逐条校验，校验不过的事件**不落盘**，并在 `state` 里计数上报（与现有 `missingEvents` 并列）。
- **磁盘增长**：镜像窗口多大，日志就多大（当前每会话数百条事件量级，可接受）。
- **列表污染**：物化会话出现在服务器 DSH 自己的列表里（这是特性，但要对用户说明"这条是镜像"）。
  可选：用归档过滤（列表默认隐藏归档会话？需确认）。
- **重复身份**：若源站与服务器指向同一台机器的同一会话 id，会撞（实际不可能，写明即可）。

## 6. 验证计划

1. **决定性小实验（第一刀，先做这个）**：在一个一次性实例上，手工把"另一个实例的一条会话"
   物化成日志 → 看服务器自己的 DSH **列表里是否出现**、**`loadOlder` 是否能翻**、**归档后 prompt 是否被拒**。
   三步都过，才值得做完整实现。
2. 完整实现后：本地两实例端到端（原版「加载更早」出现在 shipped 面板里、点击翻页、低位 seq 下降、
   控制台无错误），再部署服务器。
3. 回归：`missingEvents` 不为 0 的会话（有空洞）物化后仍可读；一条坏事件被挡在盘外且被计数。

## 7. 需要先定的两件事

1. **会话 id 是否改为复用源站 id**（推荐是）。这会改动客户端 adopted id 与镜像的键，
   属于身份层变更，一旦定了后续都按它做。
2. **第一刀是否只做只读**（物化 + 归档 + 原版分页），把写动词（prompt/fork/反馈）保持在"拒绝 + 面板隐藏"，
   留作第二步。

## 9. 写入器的入口与一个新增前提（2026-09-25 探明）

**入口（Host 侧服务，插件可用）**：

```ts
// session-persistence/src/index.ts:150
abstract create(header: SessionHeader, options?): Promise<SessionHandle>   // id 已存在 → SessionAlreadyExistsError
// session-persistence/src/handle.ts:97 / 109 / 116
append(events: readonly SessionEvent[], options?): Promise<void>   // 收完整事件对象 ⇒ 源站 seq/time 原样带得进去
flush() / close()
```

写入面无缺口：`append` 收的是完整事件，所以"保持源站 seq"不需要自己编码字节 ✓。
日志格式、压缩、目录布局都由这一层负责 ✓。

**新增前提：物化必须先拿到"从 seq 0 开始"的完整事件流。**

同文件 118 行的语义写着：*"events are contiguous from seq 0 and never rewritten"* ——
一个从中间开始的日志不是合法会话。而**镜像现在只持有尾部窗口**（实测：这个会话的窗口是
seq 9499..9898，前面还有九千多条）。所以物化前必须**回填源站整条日志**：

- 源站侧已经有分页能力（我们为"加载更早"做的 `{kind:'older'}` 正是它）⇒ 反复往回翻到 seq 0 即可；
- 代价：一次性、按会话（当前量级：几千到一万条事件，几十页）；翻完之后的增量就是普通帧；
- 短会话/新会话天然满足（窗口就覆盖了整条），长会话才需要回填。

**因此写入器的顺序是**：

```text
1. 回填：把源站该会话从 seq 0 到当前的事件全部取到（分页前进，直到 hasMore=false）
2. 逐条校验（事件类型、必要字段、seq 连续）；不过的不落盘，并在 state 里计数上报
3. persistence.create(源站 header) → 按序 append → flush
4. workspaceRegistry.archiveSession(源站 id) ⇒ 归档，只读
5. 之后的新帧继续 append（同一个 handle）
```

## 12. 长会话物化：写入器通过，回填的询问通道待修（2026-09-25）

> **2026-09-25 晚：已修好，整条路走通。** 根因不是分页也不是链路，而是**一批装不下**：follow 的开场快照是**一整帧**，源站把它作为一个 `/frames` body 发出去时是 **12 MB**（3478 条 × ≈3.6 KB），而服务器 `MAX_BODY_BYTES` = 4 MB ⇒ 每次都被拒；被拒的那批**原样留队重试**，于是快照永远送不完、`cursor` 永远 -1、要 cursor 的读页永远被拒——一个硬上限自锁了整条链。
>
> 修法（提交 `ff98129`）：`batchEvents()` 按字节预算切批（保序、不丢件）+ 服务器对超大 body 先回**具名 413**（否则 Node 重置连接，发送端只看到网络错误）。实测：镜像 320 → **3478** 条、`missingEvents: 0`、源站 `page = {throughSeq: 3477, records: 3158, hasMore: false}`、物化 `written 3478 / skipped 0 / archived true`，日志 3479 条 / seq 0..3477 与源站逐帧一致。
>
> 下面这一节保留当时的推理与读数，作为"为什么当时会判错"的记录。

**写入器对长会话同样正确**。把 `session-f6ba2b3b`（3478 事件）的镜像从尾部窗口 3158 翻到 0 之后：

```json
{"result":{"ok":true,"written":3478,"skipped":0,"archived":true}}
源站: 记录 3479 | seq 0..3477 | 首 session, permission/preset, sandbox/mode | 尾 turn/end, session/end-seed
物化: 记录 3479 | seq 0..3477 | 首 session, permission/preset, sandbox/mode | 尾 turn/end, session/end-seed
```

**但"进程内回填"只跑一轮就退**（实测：耗时恰好 6s = 一个 tick 循环；镜像下沿停在 3158 不动）。
外部用同一批 `transcript?before=…` 询问则能一路翻到 0（6 轮）⇒ 说明**分页本身没问题**，
问题在"服务器把询问投给源站"这一步只成功过一次。

已排除的假设：`hub.machine()` 不会重建记录（保留 `origin` ✓）；`publishIndex` 只改现有记录 ✓；
`state.linked` 是"本实例是否为上游客户端"，与源站下行无关（server 角色恒为 false）✓。

**下一步（有针对性）**：给服务器端加两个计数并导出到 `/state` —— `asksSent` 与 `asksSkippedNoOrigin` ——
然后复现一次，直接读出是"没送出去"（`record.origin` 为空）还是"送了没人回"。据此再修。

> **这一步最后没做，因为它问错了方向。** 真正的问题不在"服务器有没有把询问投出去"，而在**源站收到之后根本没法读页**：`pullOlder` 要先拿 `cursor`，而那个 cursor 一直没被设上，因为带 cursor 的开场快照（12 MB）被服务器按体积拒了。最后加的诊断是另外两个：`page.reason`（**为什么**被跳过，具名到 `no-cursor`）和 `follows[]`（每会话 `cursor` / `opened`）——`cursor: -1` 从此能区分"刚打开"和"开场一小时没成"。教训：**在加计数器之前，先确认被计数的那个量能解释已经看到的现象。**


两个一次性实例（server 用**自己的** sessions 目录、origin 发布一条短会话 `session-4cf56909`，222 事件）。
触发：`POST /dsh-session-sync/materialize {"machineName":"mat-origin","sessionId":"session-4cf56909-…"}`。

```json
{"result":{"ok":true,"written":222,"skipped":0,"archived":true}}
```

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 写入 | ✅ | `written 222 / skipped 0 / archived true`（归档成功 ⇒ 日志已存在且被 registry 认作"已知会话"，与 ③ 的推理一致） |
| 落盘位置 | ✅ | server home 自己的 `sessions\--C-…-git-c-vision--\session-4cf56909-…\session.v4.jsonl.zstd`（90 KB；项目目录来自 header 的 cwd） |
| **seq 与源站一致** | ✅ | 逐帧解压对比：**源站 223 记录 / seq 0..221 / 首 `session, permission/preset, sandbox/mode` / 尾 `turn/end, session/end-seed`；物化 223 / seq 0..221 / 头尾类型完全相同** |
| Host 认它 | ✅ | 插件 `/sessions`（读 Host summaries）返回该会话：`cwd` 正确、`blank:false`、`updatedAt` 来自日志 ⇒ Host 解析了这份日志 |
| 原版分页 | ✅（组合） | 第 8 节的 ② 已在**同类的"外来日志"**上实测过原版「加载更早」；这里换的只是日志来源 |
| prompt 被拒 | ✅（组合） | 本次 `archived:true` 是真实 registry 的结果；归档即拒答由上游测试证明（第 8 节 ③） |

写入器第一版**一次通过**，零跳过。已知的下一步（都不阻塞）：

1. **长会话回填**：~~写入器已经会拒（`backfill is required`），回填实现是下一步。~~ **已做（2026-09-25）**：根因是 `follow` 开场快照那一帧 12 MB 撞服务器 4 MB 上限，修法是按字节切批 + 服务器回具名 413。实测镜像 3478 条 / 0 缺失、物化 `written 3478 / skipped 0`、与源站日志逐帧一致。
2. **增量追加**：现在写完就 `close()`；之后要持有 handle 让新帧继续 append。
3. **客户端那条伪装可以撤**：物化成立后这条会话就是真会话，DSH 自己能画。
4. 标题未物化（`title` 显示为 id）——标题投影不在日志里，属外观项。


## 10. 已定的两项（2026-09-25）

1. **会话 id 复用源站 id**：不只是选择，而是**硬约束**——镜像事件自身带 `sessionId`
   （如 `session-log-deepseek/delivery-accepted`，`invariant.ts:32` 要求它点名所在会话），
   所以物化日志的会话 id 必须等于源站 id。
2. **第一刀只做只读**：物化 + 归档 + 原版分页；写动词（prompt / fork / 反馈）保持"拒绝 + 面板隐藏"。



## 8. 第一刀的实验结果（2026-09-25，已跑）

不去写物化代码，先问一个更根本的问题：**DSH 会不会把一份"外来日志"当成真会话？**
做法：一次性实例（独立 `DSH_HOME`、sessions 目录**不** junction），把源站
`--C-Users-14339-Desktop-git-c-vision--/session-f6ba2b3b-…`（3.5 MB，空闲 12h+）**整目录拷贝**进去，
然后只看 DSH 自己的行为——全程不涉及本插件。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| ① 进列表 | **通过** | 实例侧栏出现 `c-vision · 15 小时`，标题与时间都从日志读出 |
| ② 原版分页 | **通过** | 打开该会话，顶部出现 **DSH 原版**的「加载更早」（不是我们插件的控件）；点一次后顶部多出更早的一行，控件随之消失（该会话恰两页，第二页就是日志开头 → `hasMore` 转 false） |
| ③ 归档后 prompt 被拒 | **通过（组合证据）** | `WorkspaceRegistry.archiveSession` 只拒"未知会话"（`workspace/src/index.ts:361` + 测试），而 ① 已证明物化会话是"已知"的 ⇒ 可归档；归档后模型步一律被拒由上游测试证明（`archived-session-gate.host.spec.ts:55-63`：归档 → `{kind:'reject'}`，取消归档 → `{kind:'enter'}`）⇒ prompt 跑不出轮次、不会在服务器上长出第二条真相 |

结论：**承重点全部成立**——只要日志合法、id 与客户端询问的一致，Host 就会列出它、按会话 id 供历史与下一页，
而归档让它在服务器上**只读**。所以可以写物化实现了（校验后落盘、保持源站 seq、复用源站 id）。

> 注：③ 的端到端确认（真去归档一条物化会话并发 prompt）留到物化实现之后，在一次性实例上做——
> 那时才有"真的物化会话"可测；现在先不动 UI 点击类实验，省下预算给实现。

