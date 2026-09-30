# DSH 0.1.7-rc.1 — Host 半边会话镜像的 API 事实

对 `C:\Users\14339\Desktop\git\deepseek-harness`（checkout 根）的只读探查。路径约定：以 `packages/` 开头的路径相对 checkout 根；其余路径相对同一个 `packages/` 目录。每条断言都带 `path:line`。凡答案就是「没有这东西」，就直接写明。

## Q1 — `sessionPersistence`

**服务。** `abstract class SessionPersistence extends Service`，键 `ctx.sessionPersistence`（`packages/session/session-persistence/src/index.ts:135`；context 声明 `:109-113`）。shipped 后端：`packages/session/session-persistence-jsonl/src/index.ts:245`。本节路径若未另行说明，均在 `packages/session/session-persistence/src/` 下。

| 成员 | 精确签名 | 行号 |
|---|---|---|
| `create` | `create(header: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle>` | `index.ts:150` |
| `open` | `open(id: SessionId, access: SessionAccess, options?: SessionPersistenceOpenOptions): Promise<SessionHandle>` | `index.ts:165` |
| `flush` | `flush(): Promise<void>`——覆盖所有活跃写句柄的服务级屏障 | `index.ts:178` |
| `stat` | `stat(id: SessionId, options?: SessionPersistenceStatOptions): Promise<SessionPersistenceSnapshot \| undefined>` | `index.ts:194` |
| `list` | `list(options?: SessionPersistenceListOptions): Promise<readonly SessionPersistenceSnapshot[]>` | `index.ts:201` |

类型：`SessionPersistenceSnapshot { header; revision; eventCount?; sizeBytes? }` `index.ts:50-59`；`SessionPersistenceCreateOptions { signal?; inheritedEventCount? }` `:62-71`；`Open/Stat/ListOptions { signal? }` `:91-107`。`SessionHandle`（`handle.ts:59-117`）：`id`、`header`、`inheritedEventCount`、`access`、`read(offset?, length?, options?): Promise<SessionHandleReadResult>` `:83`、`append(events, options?): Promise<void>` `:97`、`flush(options?)` `:109`、`close(): Promise<void>` `:116`、`AsyncDisposable` `:59`。`SessionAccess='read'|'write'` `:14`。

**不存在：** 没有服务级的 `load`、`read`、`close`、`delete`。整个接缝里没有对已存会话的删除/替换（在 `session-persistence/src` 上 `grep 'delete|remove'` 只命中 `storage-contract.ts:81` 的一处注释）。读取只能通过句柄进行。

**`create` 校验**（jsonl `index.ts:314-333`）：(1) `signal.throwIfAborted()` `:315`；(2) `materializeCreateHeader` `:316` → `storage-contract.ts:112-121`——无损 JSON 深拷贝快照（`TypeError('session metadata must be losslessly JSON-serializable')`），并要求 `createdAt` 为非负安全整数（`TypeError('session metadata createdAt must be a non-negative safe integer')`）；(3) `toHeaderLine(snapshot, options?.inheritedEventCount)` `:319` → `format.ts:119-134`——带 seed 的 header 必须有 cut（`'seeded session header requires an inherited event count'`），不带 seed 的 header 的 cut 必须是 0（`'unseeded session header inherited event count must be 0'`），随后 `encodeCurrentHeader` → `assertReleasedV4Header`。注意 `create` 从不调用 `assertVersion`；版本门禁是 v4 header 编码器。(4) **id 重复** → `SessionAlreadyExistsError` `index.ts:323-325`；消息 `` `session "${sessionId}" already exists` `` 见 `errors.ts:22-28`。

**打开已有日志以追加：可以。** `open(id,'write')`（接缝 `index.ts:165`，实现 jsonl `index.ts:342-419`）。它会认领单写者所有权（`tracker.claimWrite(id)` `:377` → `SessionAlreadyOwnedError`，`storage.ts:429-432`，类 `errors.ts:31-37`），盘上什么都没有时抛 `SessionPersistenceNotFoundError`（`:381`，类 `errors.ts:13-19`），返回的句柄游标就是已存事件数（`:393`），因此下一次 `append` 必须从那个 seq 续上。`open(id,'read')` 从不认领所有权，在另一个句柄或进程持有写时也能用（`:347-374`）。

**`append` 校验**（契约 `handle.ts:85-97`；实现 `storage.ts:187-196`、`:319-343`）：句柄已关闭 → `SessionHandleClosedError`（`storage.ts:188`、`:372-374`）；`materializeAppendBatch(events)` `:191` → `storage-contract.ts:131-137` 对整批做无损 JSON 快照，`TypeError(...not losslessly JSON-serializable...)` 在任何东西入队之前抛出；`assertContiguous(id, batch, cursor)` `:323` → `storage-contract.ts:145-151`，每个 `seq` 必须等于 `cursor+index`，否则抛 `Error('append seq mismatch for "<id>": expected N at index I, got S')`——都在任何字节写出之前；读句柄 → `SessionReadOnlyError` `:320`（类 `errors.ts:40-49`）；丢失 lease → `SessionOwnershipLostError`（声明于 `errors.ts:59-65`；文档称 shipped 的进程内后端至今不会抛它）。**一个非法事件：** 写路径从不运行 `validateStoredEvents`。`eventLine` 只做 `JSON.stringify(sessionFormatCatalog.encodeCurrentEvent(...))`（`format.ts:322-324` → v4 `encodeEvent`，`session-format-v3-to-v4/src/codec.ts:46-53`），而它**不**查 `KNOWN_SESSION_EVENT_TYPES`。因此，`type` 未知又没有 `ignorable: true` 的事件会被顺利写进去，日志随之变得**不可读**：下次读取时 `validateStoredEvents` 抛 `SessionFormatUnsupportedError`（`storage-contract.ts:74-80`）。不连续或非 JSON 的批次会被原子拒绝；*物理*写入只写了一半时会 fsync 后回滚（jsonl `index.ts:1324-1352`）。`validateStoredEvents` 还会拒绝带旧式 `reason:'fallback'` 的 `request/header` `:83-92`，否则包装成 `SessionPersistenceCorruptionError` `:98-101`。

**`flush`/`close`。** 服务级 `flush()` = `tracker.flushAll()`（jsonl `index.ts:426-428`、`storage.ts:508-523`），以 `AggregateError` 拒绝并逐个点名失败的会话。句柄 `flush()` 会为一个空的已创建会话物化出只有 header 的产物（`storage.ts:203-212`）。句柄 `close()` 排空被路由的实时事件、释放内核写锁，幂等且不可取消（`storage.ts:223-259`、`handle.ts:111-116`）。`append` 是尽力而为；只有已 resolve 的 `flush` 才承诺崩溃后仍存活（`handle.ts:85-97`）。

**`SessionHeader` v4 形状：** `packages/core/session/src/types.ts:94-131`——`version`、`id`、`createdAt`、`cwd?`、`parentSession?`、`isSeeded`、`origin?:'subagent'`、`delegationDepth?`、`agentPreset?`；`SESSION_FORMAT_VERSION = 4` 见 `types.ts:89`。逻辑校验 `assertReleasedV4Header`（`session-format-v3-to-v4/src/validation.ts:19-42`）：要求恰好有 `['version','id','createdAt','isSeeded','delegationDepth']`，允许 `['cwd','parentSession','origin','agentPreset']`，`cwd` 为绝对路径，`origin` 为 `'subagent'`；抛 `SessionFormatError`。物理首行：`isHeaderLine`（`session-persistence-jsonl/src/format.ts:159-186`），`type:'session'`，必需键见 `:96`，编码时 `delegationDepth` 默认为 `0` `:130-133`。读路径还会运行 `assertStoredId`/`assertVersion`（`storage-contract.ts:35-39`、`:46-53`）。

## Q2 — `workspaceRegistry`

`class WorkspaceRegistry extends Service`，键 `ctx.workspaceRegistry`（`packages/workspace/workspace/src/index.ts:170-171`；声明 `:113-116`），`static inject = ['storageDomain','sessionPersistence']` `:171`。

- `archiveSession(sessionId: SessionId, options: ArchiveSessionOptions = {}): Promise<void>` — `:361`；`ArchiveSessionOptions { stopActivity?: boolean }` `:103-111`。
- `unarchiveSession(sessionId: SessionId): Promise<void>` — `:395`。
- `get archivedSessionIds(): readonly SessionId[]` — `:340`（按归档顺序读取；这是归档状态的唯一读取点）。
- `archiveSession` 在该 id 既不是 live 也不在存储中时抛 `WorkspaceUnknownSessionError`（`:366-368`，类 `:47-55`）；当 `workspace/session-activity` 瀑布报告有活动、且未给 `stopActivity:true` 时抛 `WorkspaceActiveSessionError`（`:369-374`，类 `:63-72`）；它在同一次持久写里丢掉该会话的 pin（`:376-380`）。`pinSession` 拒绝已归档的 id（`WorkspaceArchivedSessionPinError` `:429-431`）。

**重启后仍在：是。** `workspaceDomainState` 带 `archivedSessionIds: z.array(sessionId).default([])`（`spec.ts:57-65`），域 `workspace` v2（`spec.ts:76-84`）；写入走 `setState` → `global.set(state)`（`index.ts:879-882`），JSON 后端在 resolve 之前先持久写 `global.json`（`packages/storage/storage-json/src/per-record-unit.ts:247-253`）；启动时在 `index.ts:198-202` 重新读取。

**客户端渲染。** 客户端快照带这个集合（`api/workspace-controller/src/types.ts:142,163,173`；Host 推送 `feed.ts:59,75,116-119` 发出 `{ type:'archived', archivedSessionIds }`；客户端 `client/model.ts:355`）。归档行**默认是隐藏，而不只是变灰**，由一个三态开关 `ArchivedFilter = 'default' | 'show' | 'only'`（`client/ui-workspace/src/client/tree.ts:230-235`）控制，作用在 `sessionVisible` `:243-262`：`case 'default': return !archived.has(session.id)`、`case 'show': return true`、`case 'only': return archived.has(session.id)`。记账槽位会保留，因此取消归档能恢复原位置（`tree.ts:237-242`、`workspace/src/index.ts:334-342`）；显示时，行会获得 `css.archived`（`client/ui-workspace/src/client/rows/Rows.tsx:471,574`）、一行归档状态（`:437-440`），并且禁用拖拽（`:555`）。默认过滤器 `stores.ts:89`/setter `:127`；菜单 `rows/WorkspaceBrowser.tsx:130-145`；读取 `:839-848`。

## Q3 — 新写出的日志会不重启就出现吗？

**没有任何东西监视 sessions 目录。** 在 `packages` 上 `grep 'chokidar|fs.watch|watchFile|FSWatcher'` 只命中 credentials/hmr/fs-local/skill-filesystem/client-hmr/webworker-runtime——从不命中任何 session 包。JSONL 后端只 import `readdirSync`（`session-persistence-jsonl/src/index.ts:16`）和 `open, mkdir, readdir, realpath, link, rm, stat, truncate`（`:17`）：没有 watcher，也没有轮询定时器。每次调用 `list()` 都是一次全新的目录遍历（`:475-509` → `listArtifacts` → `listGenerations` → `readdir` `:1025-1035`）。

**Host 半边：下一次调用就能看见，不用重启。** `sessionPersistence.list()/stat()` 和 `ctx.sessionQuery.listSessions()`（`session-query/src/index.ts:174-176` → `corpus.ts:61`、`:262` `persistence.list(...)`）都会重读存储；`create` 还会让尚未物化的会话立刻在进程内可被列出（jsonl `index.ts:504-506`）。

**客户端半边：启动时或显式刷新时拉取——没有轮询。** `SessionManager.refreshList()` → `this.remote.session.list({})`（`api/session-controller/src/client/sessions/manager.ts:392-403`），在连接时触发（`handleConnected()` `:736-740`）。列表的实时变更只来自 Host 推送的事件 `api-session/added|removed|status|activity|error`（`client/index.ts:116-126`），而 Host 上这些事件只由进程内 Session-store 事件触发——`ctx.on('session/created'|'session/disposed'|'agent/*')`（`api/session-controller/src/index.ts:167-198`）。直接经由 `sessionPersistence` 写出的日志，一个都不会触发。

**显式刷新 API：** 客户端侧 `ctx.sessions.refresh(): Promise<void>`（`api/session-controller/src/client/contract/sessions.ts:105-109`；实现 `client/sessions/service.ts:353-355`）。Host 半边用推送代替拉取：`ctx.emit('api-session/added', summary: SessionSummary): void`——声明 `api/session-controller/src/types.ts:589`，客户端转发 `api/remotes/src/remote-events.ts:22`，Host 发出点 `api/session-controller/src/index.ts:168`（插件可以发出它，但必须自己构造 `SessionSummary`）。Host 半边**没有**「让工作区注册表失效」的 API：header 索引和一次性的历史 bootstrap 都在 `[Service.init]`（`workspace/src/index.ts:196-218`）里构建，只有 `sessionKnown`/`readSessionHeader`（`:470-475`、`:851-867`）里才有一次惰性重读。没有工作区记账的会话仍然会渲染：未记账的会话排在浏览器本地的 **Ungrouped** 分组里（`client/ui-workspace/src/client/tree.ts:337-382`，尤其 `:367-380`）。

## Q4 — 从插件在官方页面里打开会话

**主视图选择。** Main 是一个带 key 的根槽位：`'main': { kind:'keyed'; scope:'root' }`（`client/ui-layout/src/client/index.ts:66`），渲染为 `return renderSlot('main', {}, { entryKey: panelId ?? 'conversation' })`（`client/ui-layout/src/client/AppFrame.tsx:40-43`）——所以 `null` 显示对话。官方占用者注册 `key:'conversation'`（`client/ui-conversation/src/client/apply.ts:494-499`）。选择器：`selectPanel(panelId: MainPanelId | null): void`（`client/ui-layout/src/client/service.ts:28-34`，实现 `:68-74`；抛 `layout.selectPanel: main panel "…" is not registered` `:69-71`）。

**浏览器插件可以按顺序调用的受支持调用：**

1. `ctx.uiWorkspace.openSession(target: SessionTarget): void`（`client/ui-workspace/src/client/navigation.ts:36`，实现 `:200-202`）——「选中一个会话并把它的对话显示出来，作为一次 UI 导航动作」。
2. 它内部的路径：`const ref = ctx.sessions.retain(target, { source: 'mainView' })`（`navigation.ts:387`；契约 `api/session-controller/src/client/contract/sessions.ts:58`，实现 `client/sessions/service.ts:282-295`），然后 `ctx.layout.selectPanel(null)`（`navigation.ts:409`）。`retain` 经客户端目录解析，**当 id 不在目录里时会抛 `sessions.retain: unknown session <id>`（`manager.ts:142`）**——所以写完日志之后要立刻先 `await ctx.sessions.refresh()`（或让 Host 发出 `api-session/added`）。`SessionTarget = SessionId | SubagentAddress`（`contract/sessions.ts:22`）；`SessionRetainOptions { source; signal? }` `:36-39`；`SessionReference { sessionId; binding; ready; release() }` `:25-33`。`source` 可合并扩展——用 `declare module '@deepseek-ai/dsh-api-session-controller/client' { interface SessionReferenceSourceMap { myMirrorView: unknown } }` 声明你自己的（范式：`client/ui-session/src/client/index.ts:183-185` 声明了 `mainView: unknown`；基础映射 `api/session-controller/src/client/index.ts:79-88`）。
3. **retain ≠ 导航。** `retain` 持有客户端侧的 generation/流引用和一个 `retainedBy` 计数；它不改变可见面板。可见切换是 `selectPanel(null)`，再加上 `UiWorkspaceService.replaceMain` 里的 `mainReference`/`selection` 记账（`navigation.ts:380-410`）。释放引用只会拆掉流。

## Q5 — Host 半边读取会话（不用浏览器）

可以——`ctx.sessionQuery`（`session-query/src/index.ts:87`，类 `:98`）：`listSessions(signal?: AbortSignal): Promise<SessionRecord[]>` `:174-176`（优先 live、最新在前；在 `corpus.ts:262` 回退到 `sessionPersistence.list()`）；`readSession(sessionId: SessionId): Promise<SessionLogSnapshot>` `:184-198`（完整重放校验过的 header + 事件日志，且不让该会话变成 live）；`observeSession(sessionId, options: SessionObservationOptions = {}): Promise<SessionObservation>` `:140-145`（最省的一次精确读取：`header`、`events`、`cursor`、`revision`、`retain()`）；另有 `filterSessions(filters, signal?)` `:206-212` 和 `readTitle(id, signal?)` `:220-224`。如果 `sessionQuery` 没有被组合进来，就用更低一层：`ctx.sessionPersistence.stat(id)`/`.list()`，或 `open(id,'read')` + `handle.read()`。**不要**用 `ctx.sessions` 做这件事——那是客户端侧的 store。

## Q6 — 归档会话门禁

```ts
export const ArchivedSessionGate: Plugin.Object<void> = {
  name: 'archived-session-gate',
  inject: ['agents', 'sessions', 'workspaceRegistry'],
  apply(ctx: Context): void {
    ctx.on('agent/pre-step', (payload, next) =>
      underArchivedSession(ctx, payload.agent) ? Promise.resolve({ kind: 'reject' as const }) : next())
  },
}
```

（`api/session-controller/src/archived-session-gate.ts:23-32`；在 `api/session-controller/src/index.ts:165` 处加载；`underArchivedSession` 沿 subagent 血统向上走，对照 `workspaceRegistry.archivedSessionIds` `:43-56`——有环路保护；已归档会话的 fork *不*受门禁 `:36-38`）。

**对已归档会话提问会怎样：** 这道门禁是*唯一*的归档检查——`commands.prompt` 只校验 content/timezone/agent/model，从不查归档集合（`api/session-controller/src/commands.ts:311-374`）。提问被接受；回合开启；第一个被提出的步骤被拒绝（`core/agent-loop/src/agent.ts:275-284`）；循环设置 `turnEnds = { kind:'blocked' }` 并**在没有任何模型请求的情况下**返回（`agent.ts:316-319`；`TurnEndReasonMap.blocked: { kind:'blocked' }` 见 `core/session/src/types.ts:206`）；回合以 `session.append('turn/end', { turn, reason: turnEnds })` 收尾（`agent.ts:364-370`）。可见结果：`turn/start` … `turn/end {reason:{kind:'blocked'}}`，没有任何 assistant 输出。没有专门的 "blocked" transcript 节点——只有 `error` 和 `max-tokens` 会有提示（`client/ui-chat/src/client/conversation-nodes/turn-error.ts:32`、`turn-max-tokens.ts:42`、`turn-tail.ts:82`）。另外，UI 会事先阻止这种局面：归档行无法打开，并抛 `archivedNotOpenable` = "Archived sessions cannot be opened. Unarchive it to view."（`client/ui-workspace/src/client/locales.ts:170`、`RowActionToast.tsx:73`、`rows/Rows.tsx:474,580`），而当前已选中的归档会话会被清掉（`navigation.ts:363-378`、`:284-310`）。

## Q7 — 向已经存在的会话日志追加（重启之后）

**可以——对已有 id 存在写句柄：** `SessionPersistence.open(id, 'write', options?): Promise<SessionHandle>`（`session-persistence/src/index.ts:165`；jsonl 实现 `index.ts:342-419`）。错误：`SessionPersistenceNotFoundError`（盘上什么都没有，`:381`）和 `SessionAlreadyOwnedError`（已有活跃写句柄持有该 id，`:377` → `storage.ts:429-432`；`open` 的 catch 会释放认领，并把锁释放失败并入一个 `AggregateError` `:400-418`）。句柄从已存事件数开始（`:393`），因此 `handle.append(newEvents)` 必须从那个 seq 开始（`assertContiguous`，`storage.ts:323`）；`handle.flush()` 是持久化屏障。

**运行中会话走的是同一条路。** `AgentLoop.resumeWith` 会做 `handle = await persistence.open(id, 'write', { signal })`、`handle.read(0, undefined, …)`，然后 `handle.append(closers)`（`core/agent-loop/src/index.ts:842-864`）；全新的会话则用 `persistence.create(...)`（`createStoredSession` `:679-687`）加上 `appendUnstoredSuffix` `:698-706`。后端把*实时*事件路由给持有该 id 的那个写句柄：`ctx.on('session/event', (session, event) => { this.writers.get(session.id)?.enqueueLive(event, …) })`（`session-persistence-jsonl/src/storage.ts:534-539`；`adopt()` 把一个写句柄绑定为 writer `:482-486`）。因此，持有 `open(id,'write')` 的插件会自动收到该 live 会话的事件——并且**绝不能**手动追加一个 live 会话已经在为该 id 发出的事件，否则共享游标会破坏连续性。

**替换已存日志：不行。** 没有任何东西会覆盖或截断已有日志。`create` 拒绝已存在的 id（`SessionAlreadyExistsError` jsonl `index.ts:323-325`），物化也拒绝发布到已有的已提交日志之上——`rejectExistingLog`：`'refusing to materialize "<id>": a log already exists on disk (open it instead)'`（`:1260-1270`）。树里唯一的「替换」是格式迁移路径：为一个**历史**（更旧版本）产物发布新的*当前*代（`publishStoredMigration` `:692-714`）；原地截断只作为崩溃尾部修复（`truncateTornTail` `:889-893`、`repair` `:1364-1369`）和追加回滚（`rollbackAppend` `:1354-1362`）存在。

**如果客户端开着日志时它被删掉**（不存在删除 API，所以这是带外操作）：已打开的读句柄会失败——`resolveCurrentLog` → `undefined` 且没有待处理条目 → `SessionPersistenceNotFoundError`（`storage.ts:143-153`），而变短的日志会触发 `'stored log shrank below a previously observed prefix'`（`:172-173`）；`stat()` 返回 `undefined`（jsonl `index.ts:462-466`）；`list()` 静默跳过缺失的产物（`:499-502`）。**隐患：** `appendLines` 用 `open(path,'a')` 打开（`:1327`），而它会*创建*缺失的文件，所以在带外删除之后经已有写句柄追加，会重建出一个**没有 header** 的日志；下次读取便以损坏失败（`:952` `'empty or header-less Zstandard session log'`、`:791-801`）。客户端会一直显示这一行，直到下一次拉取（`ctx.sessions.refresh()`）——没有任何东西推送移除，因为 `api-session/removed` 只来自 `session/disposed`（`api/session-controller/src/index.ts:170-172`）。

## 镜像设计的实用注意事项

1. `create` 会校验 header（JSON 无损、`createdAt`、seeded/cut、v4 字段集），但写入时**从不**校验事件词表；一个坏的 `type` 会静默产出不可读的日志。镜像事件必须是真正的 `SessionEvent`，`seq` 从 0 起密集递增，且类型已知（或带 `ignorable: true`）。
2. `create` 在第一次 `append`/`flush` 之前只存在于本进程；只有已 resolve 的 `flush` 才承诺重启后仍存活。
3. 写出日志并不会把该会话放进任何工作区的持久 `sessionIds`；一旦客户端列表拿到它，它会渲染在 *Ungrouped* 分组下。`archiveSession` 要求该 id 是 live 或在持久化存储里（`workspace/src/index.ts:366-368`，`sessionKnown` `:470-475`）。
4. 客户端只会通过 `ctx.sessions.refresh()`（客户端）或 Host 发出 `api-session/added` 才知道有新写出的日志——没有 watcher，也没有轮询。
5. 如果镜像的 id 在同一个 Host 里也是 live 的，`open(id,'write')` 会抛 `SessionAlreadyOwnedError`，而实时路由监听器还会往插件持有的写句柄里喂事件；绝不要重复追加。
