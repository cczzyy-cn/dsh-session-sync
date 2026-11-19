> **2026-11-19 状态：方案 B 已证伪并关闭。** 三轮实验（见 `PROGRESS.md`「官方整页路线（方案 B）的 P0 结论」）
> 表明：`uiWorkspace.openSession()` 能把镜像会话放上官方整页，但它内部那一次必然失败的 Host 历史读会留下
> **常驻红字**；绕开它（前置行选举）则选不上会话；`openSession` 之后再用镜像 transcript 替换窗口也冲不掉红字。
> 官方 `ui-conversation` 的 Known Limitations 已明说这需要 Session-provider capability。**本文件因此转为方案 C 的记录**：
> 会话页维持「官方正文 + 官方轨迹 + 官方底部统计」，外壳继续只用官方原语，等上游补能力后再回到 B。
# 会话页全官方 UI 方案

> 2026-11-19。本文是**方案**，不是记录；事实与证据在 `PROGRESS.md`，现状形状以 `README.md` 为准。
> 所有"官方能做到什么"都以 **DSH `0.2.2-rc.5`** 的包内文档与类型为准（`dsh-client-ui-conversation` /
> `dsh-client-ui-layout` / `dsh-client-ui-slots` / `dsh-api-session-controller`）；标【待验】的是本方案
> 必须先用隔离实例证实的点。

## 0. 结论

**能做到"会话页全部是官方 UI"，但只能覆盖页面骨架，"接管续聊"的输入框是唯一没有官方对应物的控件。**

先分清三句话，它们要的东西完全不同：

| 说法 | 要什么 | 官方支持 |
| --- | --- | --- |
| ① 会话页 = 官方那一页 | 用 `main[key=conversation]` 的 `ConversationPanel` 画整页：页头、标题、视图 tab、正文、输入栏、底部统计 | **有**（`ctx.layout.selectPanel(null)` 把主面板切回 Conversation，且不改当前会话） |
| ② 正文用官方组件 | 复用 `conversation.content` Factory（现状已经是） | **有缝但未文档化**：`retainAgentScope` 只有类型、`docs/` 与所有 README 均无记载 |
| ③ 控件也用官方原语 | 自绘外壳换成 `ui-primitives`（`Input`/`Button`/`DisclosureRow`）与官方 token | **有**（0.10.x 起已部分做到） |

推荐 **方案 B**：①+②，即**主面板切到官方 Conversation 整页**，接管输入改用官方的
`conversation.composer` chain takeover（approval / user-questions 用的同一机制）。这样页面上除输入框内容外
没有插件自绘的 chrome，而"接管"仍然存在。

若愿意放弃接管（只读镜像），选 **方案 A（纯 ①）**：会话页零插件控件，连 takeover 都不需要。

## 1. 现状：会话页里哪些是官方的（证据）

| 区域 | 现在由谁画 | 证据 |
| --- | --- | --- |
| 左侧树（机器→目录→会话） | 插件 | `SyncPanel.tsx` 的 `TreeRow`/`buildTree` |
| 页头（标题、机器名、`原件 · scope`、`整份日志`、`缺 N 条/落后 N`） | 插件 | `SyncPanel.tsx` `Conversation` 的头部行 |
| `对话 / 轨迹` 两个 tab 本身 | 插件 | `SyncPanel.tsx` 的 `tab` state |
| 正文（消息、工具卡、回合折叠、流式） | **官方** | `official-session.tsx`：`conversation.content` Factory + `session-sync.conversation`（`scope: session`） |
| 轨迹页 | **官方** | `conversation.view` 传 `trajectory`，`ui-trajectory` 自己画（0.10.41 起） |
| 底部统计胶囊 / 占用率环 | **官方组件**，数值由插件喂 | `footer-projections.ts` 向 Session 投影存储发布 |
| 输入栏 | 插件（官方胶囊被隐藏，坐在 `conversation.input.dock`） | README「接管输入栏」一节 |
| `加载更早的消息` | 插件 | 镜像分页比官方 Host 分页多一条链路 |

也就是说：**正文与轨迹已经是官方组件，页头 / tab / 输入栏 / 树还是插件画的。**

## 2. 官方接口盘点（0.2.2-rc.5）

- `ctx.layout.selectPanel(id)`：选中一个已注册的 `main` 面板；**传 `null` 选中 Conversation 且不改变当前会话**
  （`ui-layout` README「Global panels occupy the root-scoped `main` keyed slot; `conversation` is the reserved key」）。
- `main` 是 keyed 槽，键 `conversation` 由 `ui-conversation` 占用；本插件当前占 `session-sync`。
- `conversation.composer` 是 chain 槽，`select(owner)` 的 owner 货币是
  `{ sessionId, session, pendingInteraction }`；非空即接管，官方默认 composer 仍挂在下面。
- 官方页头自带 `conversation.session.header.*`（标题、actions、utilities、views.actions、corner），
  视图 tab 由 `conversation.view` 注册表决定（`chat` / `trajectory` / 任何 View）。
- 官方页的标题与统计都读 Session 投影（`useProjection`）——镜像已经有标题与统计，喂法已存在。
- **官方明说的限制**：`conversation.content` 不接受"独立寻址的 Session"，
  其 Factory 继承渲染位置的 Session（`ui-conversation` README「Known Limitations」第 2 条：
  *"that requires a separate Session-provider capability"*）。这正是本插件现在自绘面板 + retained 合成会话的原因。

## 3. 三个方案

### 方案 A —— 纯官方整页（只读）

选中一个远端会话后：retain 合成会话 → 让布局的"当前会话"指向它 → `ctx.layout.selectPanel(null)`。
页面上一切（页头、tab、正文、输入栏、底部）都由官方画；输入栏因 `useAccess` 不含 `session/prompt` 而
隐藏 Send（`ui-conversation` README 明说这条），即"官方输入框但要么隐藏要么发不出去"。

- 优点：零插件 chrome，最像产品；维护面最小。
- 代价：**不能接管续聊**——整个产品的核心能力之一。
- 适用：只想读镜像的场景，或作为 B 的降级形态。

### 方案 B —— 官方整页 + 官方 composer takeover（推荐）

在 A 的基础上注册一个**常驻**的 `conversation.composer` chain entry：`select` 只在"当前会话是合成的镜像会话"
时返回非空，组件用 `ui-primitives` 的 `Input`/`Button` 实现接管输入并走现有的
`sendPrompt` / `answerQuestion` / `decideApproval`。

- 优点：页头 / tab / 正文 / 底部 / 轨迹全官方；接管保留；用的还是官方 takeover 机制（approval 同款），
  不需要新接口。
- 代价：输入框内部仍是插件的控件（这是唯一一个"没有官方对应物"的位置，本质如此：官方 composer 只会
  把 prompt 发给本机 Host）。
- 风险：官方 README 只描述了"某请求挂起期间临时接管"的用例，**常驻 takeover** 是【待验】项之一。

### 方案 C —— 维持现状，只把外壳收敛成官方原语

不动页面归属，把自绘页头/tab/输入栏里的 div、按钮、间距全部换成 `ui-primitives` 与官方 token。
0.10.x 已经做了一部分；这条路不解决"页头不是官方页头"的问题，只是让它更像。

## 4. 落地步骤（以方案 B 为目标）

**P0 探针（一天，隔离实例，不动生产）**——回答 §5 的五个问题，任何一个否掉就退回 A 或 C。

**P1 主面板归属切换**：`main[key=session-sync]` 只保留树（列表面板）；点会话后
`ctx.layout.selectPanel(null)`，树的返回按钮 `selectPanel('session-sync')`。
验收：`ctx.layout.panelInfo.id === 'conversation'`；树面板再次点击能回来。

**P2 当前会话指向合成会话**：找到一个服务能设置"当前会话"（Controller 明确
*"view selection remains outside the Controller"*），把 retained 的 `dsh-session-sync:<machine>/<session>`
设为当前。验收：官方页头出现该镜像会话的标题，`[data-slot="conversation.session.header"]` 存在且只有 1 个。

**P3 composer takeover**：注册常驻 chain entry，`select` 判据是"当前会话 id 以 `dsh-session-sync:` 开头"。
验收：官方输入栏被接管且 Send 走的是插件的 `sendPrompt`；`answeredRemotely` / `answeredLocally` 读数不变。

**P4 删掉重复件**：自绘页头、tab、底部读数（官方已有）、`加载更早的消息` 的页内横幅
（官方轨迹页不翻镜像，这一条要单独决定：留一个 `conversation.chat.text-interaction` 或 header 按钮）。

**P5 回归**：204 例测试 + 真浏览器（headless CDP）截图对比；窄屏 420 / 宽屏 1280 各一张。

## 5. 【待验】清单（P0 必须回答）

1. `selectPanel(null)` 之后，插件自己的 `main` 面板注册是否还在（能否切回）。
2. "当前会话"由哪个服务设置（侧边栏点会话时调的那个），retained 的合成会话能否被它选中。
3. 官方页头对合成会话取不取得到标题/统计（投影是我们喂的，`title` 目前只在索引里）。
4. 官方页对合成会话的更多菜单（重命名、fork、导出、归档）会不会调用会失败的 Host 操作；`useAccess` 是否足够抑制。
5. 常驻 `conversation.composer` takeover 是否被允许（`select` 是纯函数、无生命周期限制，但没有文档用例）。
6. 官方页的 `conversation.view` 切换（对话/轨迹）与插件的镜像分页如何共存——官方轨迹页翻的是 Host 窗口，
   镜像的"加载更早"在这一页上没有座位。

## 6. 验收判据（给数字，不给形容词）

- `ctx.layout.panelInfo.id` = `conversation`；
- 会话页 DOM 里 `[data-slot]` 的官方槽位数量 ≥ 现状（页头、header、view、composer、footer 各 1）；
- 插件自有 DOM 只剩左侧树与 takeover 输入框内部；
- 控制台 `exception 0 / console error 0`（headless CDP 两次：宽屏 1280、窄屏 420）；
- 现有 204 例测试 0 失败；新增 routing 决策测试（`select` 判据）在旧代码上先红后绿。

## 7. 风险与回退

- **合成会话被官方操作带偏**：rename/fork 等 Host 调用会失败并弹错；由 `useAccess` 抑制，P0 第 4 条验。
- **retained 会话泄漏**：切换/卸载时必须 `release()`；现有 `closed()` 已删，改由布局切换 effect 收。
- **窄屏**：官方页自带抽屉与宽度处理，理论上比自绘稳，但要截图对比（P5）。
- **回退**：`official-session.tsx` 已经有 `supported` 特性探测与自绘兜底，把页面归属切回
  `main[key=session-sync]` 即回到方案 C；两条渲染路径并存，不删旧代码。

## 8. 若要做到"零插件控件"

需要上游三个接口，缺一不可：

1. **Session-provider capability**：让 `conversation.content` 接受独立寻址的 Session（官方 README 已把它列为 deferred）；
2. **composer 提交路由**：官方 composer 能把 prompt 交给非 Host 的实现；
3. **投影写入的公开面**：现在往 `session.projections.apply` 写是结构探测（文档说 Host 是唯一计算点）。

在这三条落地之前，"全部官方"的天花板就是方案 B。

## 方案 C 清单（2026-11-19 当前执行面）

| 区域 | 现在的画法 | 结论 |
| --- | --- | --- |
| 正文 / 轨迹 / 底部统计 | 官方 `conversation.content`、`ui-trajectory`、官方统计胶囊 | 官方，不动 |
| 页头按钮、提示条关闭、动作 | 官方 `Button` / `Input` / `Switch` / `StateDot` / icons | 官方原语（0.10.46 补齐提示条关闭） |
| 机器→目录→会话树行 | 自绘 `role="treeitem"` 行 | **有意自绘**：工作区浏览器的行是它自己的语义，没有可借的官方原语 |
| 接管输入卡 | 自绘卡片（与官方输入卡同几何） | **有意自绘**：官方 composer 会把 prompt 发给不认识的 Host |
| `对话 / 轨迹` 页签 | 自绘页签条 | 没有官方页签原语可借；官方页签属于官方 Conversation 页，B 已关闭 |

**不再做的事**：不往 `sessions.list` 里写合成行、不调 `uiWorkspace.openSession()`、不改 `uiSession` 的私有面 —— 这三条都已被 B 的证伪过程排除。