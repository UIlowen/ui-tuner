# UI Tuner 交接文档

> 用途：任何新会话（Claude / Codex / 其他 Agent）接手开发时，读完本文档即可获得完整上下文。
> 配合根目录 `UI_TUNER_EXECUTION_PLAN.md`（完整执行计划）与 `docs/architecture.md`（已实现架构）使用。
> 规则：**每完成一个 Milestone，更新本文档**。

---

## 1. 当前状态快照（2026-09-04）

| 项       | 状态                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 里程碑   | **M1–M8 完成** + **注释模式重构**（2026-09-02）+ **页面侧编辑卡**（2026-09-03，SDD 14 任务）+ **页面侧交互打磨**（2026-09-04：退出即净页 / 改动行高亮 / 卡片就近弹出）+ **Codex 风格视觉重做**（2026-09-04：编辑卡紧凑/展开两态、Remix 图标、属性控件与面板换外观）+ **编辑卡 UI 细节打磨**（2026-09-04：去「未保存」/ 展开用 icon 替 tag / 模块间距加大 / 点击高亮 + 即时 reset）+ **编辑卡交互修正 + 影子样式修复**（2026-09-04：属性图标开关替设置图标 / 去收起箭头 / 行激活态真的画出来 / 修「reset 后保存仍出气泡」/ 修 shadow root 里 Tailwind 边框投影整族失效）+ **属性控件收敛 + 二次保存修复**（2026-09-04：单值属性一律折叠下拉 / 默认态零高亮、强调色只给正在调的控件 / 修「重置已保存属性后无法二次保存」）+ **行激活态移除 + 点击外部关闭**（2026-09-04：去掉行容器高亮、只留控件自身 focus ring / Codex 风格点击卡片外部关闭编辑卡 + picker 抑制）。核心闭环不变，但**样式编辑已从 Side Panel 迁到页面上的编辑卡**：面板只剩「选取/注释列表/Agent/Apply」 |
| 分支     | **`feat/ui-ux-polish`（47 commits，尚未推送，无 upstream）**，基于 `main`。远端 `origin` = GitHub 私有仓库 `UIlowen/ui-tuner`。**git 推送/拉取 GitHub 需走本机代理**：`HTTPS_PROXY=http://127.0.0.1:7892 git push`（与 codex 同坑） |
| 验证     | `pnpm build / test / typecheck / lint` 全绿（**385 例测试**：protocol 26 / inspector 119 / bridge 74 / extension 166）；真机 `.playwright-mcp/verify-codex-card-ui.mjs` **106/106 断言全过**                                              |
| 已知限制 | 页面刷新/导航后需手动 Reconnect；预览修改随页面刷新消失（§37 跨刷新持久化依赖 HMR 重定位，backlog）；颜色提交丢失 alpha（V0.1）；**CLI 未发布 npm——`npx ui-tuner` 不可用**，本地用 `pnpm bridge --cwd <项目路径>`；codex exec 调 MCP 工具需 `--dangerously-bypass-approvals-and-sandbox`；**编辑卡的麦克风是禁用占位**（灰态 + 「语音输入即将上线」，未接语音识别）；**编辑卡指令输入框内按 Esc 会连带退出整个注释模式**（未修，backlog）；`docs/architecture.md` 仍描述注释模式之前的三 Tab 面板（未同步，读它时以本文档 §4/§6 为准） |

## 2. 三十秒上下文

UI Tuner = Chrome Extension + Local Bridge + MCP Server。核心闭环：**Select → Tune → Prompt → Apply to Code**。让设计师在本地 React/Next/Vite 页面上直接点元素、实时调样式、把调整交给 Coding Agent 落到真实源码。

- 浏览器只负责 **Preview**（不写源码）；Agent 只负责 **Source Change**（计划 §2）。
- V0.1 只支持 `http://localhost/*` 与 `http://127.0.0.1/*`（安全边界，计划 §38，勿放宽）。
- 严格按 Milestone 推进，**一次只做一个**（计划 §42/§43）；Scope 外需求记入 `docs/backlog.md`。

## 3. 仓库结构与关键文件

```txt
UI Tuner/
  UI_TUNER_EXECUTION_PLAN.md   执行计划（唯一需求来源）
  docs/
    architecture.md            已实现架构（**停留在 M8/三 Tab 面板，未同步注释模式与编辑卡**）
    handover.md                本文档
    backlog.md                 顺延项 / scope 外需求
    superpowers/specs/         2026-09-02-annotation-mode-design.md、2026-09-03-page-editor-card-design.md
    superpowers/plans/         同名实施计划（任务级 TDD 清单）
  dev/index.html               localhost 测试页（pnpm page 启动）
  examples/
    react-vite/                计划 §39 Example A（独立 npm 项目，不进 pnpm workspace）：
                               Navbar/Card/Button/Form/List，Source Resolver 验证对象
  packages/
    protocol/                  跨上下文消息类型（公共类型只放这里，规则 6）
    inspector/                 chrome-free DOM 能力：Picker / Overlay / Selection /
                               styles(白名单/解析/取色) / PreviewEngine / ChangeTracker /
                               InstructionStore(元素→自然语言指令) / StagingEngine(保存才记录) /
                               Annotations(页面气泡注释层) / snapshot / domFingerprint（§21）
    bridge/                    本地 Bridge：CLI(bin ui-tuner, :47321 仅 127.0.0.1) + WebSocket
                               服务 + 项目/dev server 检测 + resolver/(源码索引+打分定位)
                               + adapter/(Codex 真实现 + prompt/fileDiff) + mcp/(§27 五工具,
                               stateless StreamableHTTP 挂在同 server /mcp)；
                               不 import 浏览器 API（规则 8）
  apps/
    chrome-extension/
      public/manifest.json     MV3 manifest（content script 仅 localhost）
      sidepanel.html           Side Panel 入口
      vite.config.{sidepanel,content,background}.ts   三个独立构建
      src/
        background/            SW：点击图标开面板
        content/               内容脚本：接线 inspector ↔ Port（chrome 知识只在这里）
          card/                **页面侧编辑卡**：EditorCard.tsx（React，紧凑/展开两态）+
                               mount-card.tsx（挂到 shadow root `ui-tuner-editor-card-root`）+
                               placement.ts（就近弹出的纯函数）+ inject-styles.ts
                               （Tailwind token scoped 到 :host，adoptedStyleSheets）
        sidepanel/             React App（App.tsx = 两态注释面板，**已无 Style Tab**；
                               components/ = ChangesTab / AgentTab / ApplySection）
        style-editor/          样式控件（ScrubInput / rows / StylePanel / StyleEditContext）——
                               从 sidepanel 抽出，供**编辑卡**复用（面板不再直接编辑）
        ui/                    icons.tsx（Remix Icon 派生的内联 SVG 组件）+ REMIXICON-LICENSE
        styles/                sidepanel.css（主题令牌）+ tokens.test.ts（与 card.css 的防漂移守卫）
        i18n/                  messages.ts（zh/en，键必须齐平）+ use-t.ts
        messaging/channel.ts   Port 类型化封装（PortLike 结构接口）
        state/                 zustand store（sidepanel-store：连接/picking/selection/changes/
                               instructions/agent/apply；prefs：语言 + 主题）
```

## 4. 技术决策与约束（勿推翻，除非有硬理由）

| 约束                                                                                                                                                                 | 原因                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| TypeScript **锁 5.9.x**                                                                                                                                              | typescript-eslint 8.x 不支持 TS 7；稳定性优先（计划 §53）                           |
| 三个 Vite 构建：sidepanel(ES) 先跑且唯一 `emptyOutDir`；content 必须 **IIFE**；background ES 单文件                                                                  | MV3 产物格式硬约束；详见 architecture.md §4                                         |
| Side Panel ↔ Content Script 用 `chrome.tabs.connect` **直连 Port**（`ui-tuner`），不经 background 中转                                                               | 实时性 + 避免 SW 回收复杂度                                                         |
| 消息一律 `{ type, payload }`（payload 非数组对象），边界处 `isUiTunerMessage()` 收窄，非法消息静默丢弃                                                               | protocol 包守卫，channel.ts 统一执行                                                |
| `Channel` 依赖 `PortLike` 结构接口；inspector 不 import chrome                                                                                                       | 单测免 mock chrome；新逻辑照此模式保持可测                                          |
| bridge 不得 import 浏览器 API（规则 8）                                                                                                                              | 包边界                                                                              |
| Overlay：Shadow DOM 隔离 + 持 Element 引用每帧重测 rect + 无目标即停 rAF；样式只在 `inspector/src/styles/overlay.ts`                                                 | 滚动/resize/布局位移天然正确（计划 §2.2/§33）                                       |
| Picker：mousemove 只写坐标缓存（passive），`elementFromPoint` 每帧至多一次；点击在 document capture 拦截                                                             | 计划 §33 性能红线                                                                   |
| 选取状态以 content 回报的 `picker.state` 为准（面板不做乐观更新）                                                                                                    | Esc 等面板外路径不产生状态漂移                                                      |
| **Preview 只走 `<style id="ui-tuner-preview-style">` 生成 `[data-ui-tuner-id=…] { prop: value !important }`，禁止写 `element.style`（计划 §11）**                    | 可整块撤销、不动页面内联状态；与源码隔离（§2.3）                                    |
| 样式读写只走 `STYLE_PROPERTIES` 白名单（计划 §7）；PreviewEngine 拒绝白名单外属性                                                                                    | 永不读/写完整 computed style                                                        |
| ChangeSet 真相在 content script（ChangeTracker）；面板只镜像 `preview.changed` 回报                                                                                  | 页面刷新即清空，符合 §37 in-memory 原则                                             |
| **Side Panel 直连 Bridge WebSocket（ws://127.0.0.1:47321），不经 background SW**；manifest host_permissions 含 ws://localhost、ws://127.0.0.1                        | MV3 SW 空闲回收会断 WS；content script 受页面 CSP 限制不能连；面板开 = Agent 通道活 |
| Bridge 只绑 127.0.0.1、固定端口 47321（§15/§38）；`/health` JSON 端点                                                                                                | 安全边界；npx ui-tuner / pnpm bridge 启动                                           |
| **Source Resolver 在 bridge（Node 侧）做 regex 级静态扫描**（不在浏览器里跑）：`src/**/*.{tsx,jsx,ts,js}` 建索引（组件名/JSX 文本/className/标签/id，上限 500 文件） | 浏览器没有文件系统；V1 无 parser 依赖，Vite/React 常规结构优先（handover M6 指引）  |
| **置信度纪律（§20）：exact 必须有 JSX 文本命中且唯一领先（给 file:line）；inferred 只给文件不给行号；unknown 不伪造**                                                | 「查看详情」按钮 → Card.tsx 调用点（与 React JSX 语义一致）                         |
| 源码索引每次 selection 解析时重建（无缓存/无文件监听）                                                                                                               | dev 项目小，重建为毫秒级；大项目缓存属 backlog                                      |
| 有 change 记录**或有已保存指令**的元素在选中转移时保留 `data-ui-tuner-id`（SelectionTracker `keepId`）                                                                | Preview override CSS 与元素失联；气泡也要靠它定位「仅指令」元素（无 override）       |
| ScrubInput 拖动帧只发 `onPreview`（rAF 节流、DOM 直写不触发 React 渲染）；释放才 `onCommit`（计划 §10）                                                              | 拖拽 60fps 不重渲染面板                                                             |
| pnpm 11 + Turborepo 2；`onlyBuiltDependencies: [esbuild]` 在 pnpm-workspace.yaml                                                                                     | pnpm ≥10 默认拦截构建脚本                                                           |
| UI 风格：克制、高信息密度、Figma/Linear/Raycast 质感（计划 §48）；已用 zinc 暗色 + Tailwind 4                                                                        | 禁渐变堆砌/游戏化                                                                   |
| **样式编辑只在页面编辑卡里发生；Side Panel 不再有 Style Tab / 不再下发 `sidepanel.stylePreview`（该协议消息已删除）**                                                | 设计师在元素旁边调，所见即所得；面板只负责总览/Agent/Apply（注释模式设计）          |
| 编辑卡挂在 **shadow root**（host `ui-tuner-editor-card-root`，z-index 2147483645），Tailwind token scoped 到 `:host` / `:host(.dark)`，经 `adoptedStyleSheets` 注入 | 不污染宿主页面样式，也不被宿主样式污染                                              |
| **「保存才记录」`StagingEngine`**：拖动/输入只 `stage`→PreviewEngine（页面实时可见但不落账）；`commit` 才写 ChangeTracker；`rollback` 还原基线                          | 取消/删除能干净还原；避免 M8 那种「拖一下就产生一条记录」的噪声                     |
| **仅指令元素是一等公民**：`Annotations.sync(changes, instructions)` 取并集出气泡，`ChangesTab` 计数把无改动行但有指令的元素算 1 条，`applyChanges` 允许 `changes: []` + instruction | 只写自然语言（不动数值）也是有效诉求，此前会在气泡/计数/Apply 三处被当作「空」丢弃  |
| Picker 放行注释层点击（`passThroughHostIds`）；气泡点击派发 `onOpenEditor` 而不是只读浮层                                                                            | 点气泡要能重开该元素的编辑卡（含已存指令与序号）                                    |
| 面板两态注释模式：`picking` 只由 content 的 `picker.state` ack 决定，选中元素**不**退出注释模式；「完成此元素」走 `sidepanel.clearSelection`                           | 连续标注多个元素；避免面板乐观更新造成状态漂移                                      |
| **气泡只在注释模式激活时绘制**：`Annotations.setVisible()` 由 content 的 `startPicking`/`stopPicking` 驱动（连接时默认 false，Picker 的 Esc 也走 `stopPicking`）；隐藏改宿主节点 `display` 而非卸载重挂，隐藏期停掉 rAF | 单纯浏览页面时不该带标注；走 display 才能让序号与气泡状态跨模式切换存活，重新激活原样恢复 |
| **退出注释模式只清「页面侧」选中视觉**：`clearPageSelection()`（≠ `clearSelection()`）清 tracker/overlay 但**不发 `selection.cleared`**，也保留 `lastSelector`/`lastFingerprint` | 用户要「退出后页面干净」，但 `ApplySection` 整体门控在 `selection` 上——发了 cleared 就等于顺手删掉 Apply 入口；保留指纹是为了 apply 后 HMR 重定位（`locateAppliedElement`） |
| **卡片高亮「已改动」属性行**：`changedProperties` 由 content 从 ChangeTracker 去重算出 → `EditorCard` 转成 `StyleEditApi.changed` → `rows.tsx` 的 `useIsChanged()` 给 `Row` 打 `data-changed` + 紫色左边线；卡片挂载时把**第一处**标记 `scrollIntoView({block:"nearest"})` | 几十个属性里看不出上一步改了什么；body 只有 320px 高，不滚动的话标记等于没有。复合控件（间距轴 / 对齐九宫格）一次写多个属性，传全部、命中任一即亮 |
| **编辑卡就近弹出**：`content/card/placement.ts` 纯函数按「右→左→下→上」四候选取第一个放得下的，**只用「选边那一轴」判定放不放得下，另一轴 clamp**（右/左候选 clamp y，下/上候选 clamp x），四候选都不行才 clamp 首选位；`mount-card.show(props, anchor)` 用 **`flushSync`** 先提交渲染再量 `container.getBoundingClientRect()` | 卡片贴在元素旁边才符合「在元素上调」的心智；不先同步渲染就量尺寸，会拿到未渲染的 0×0 而漏判所有溢出。两轴都要求「完全放得下」会让贴视口底边的元素否决掉所有侧边（差 2px 也算否决），最后回落到 clamp 的首选位——**正好压在元素上**（真机实测：卡片 952..1272 与元素 1132..1272 重叠） |
| **编辑卡只有紧凑/展开两态**（Codex 式），且**默认态由 props 推出、不记忆**：`number !== null ∨ changedProperties 非空 ∨ 已有指令` → 展开，否则紧凑（单行输入 + ✓） | 新选元素的常见诉求是「写一句话」，紧凑态就够；已注释的元素必须展开，否则上一轮的改动行高亮与自动滚动会被藏在一行输入框后面。由 props 推出 → `types.ts`/`placement.ts`/`content/index.ts` 都不用加接线，`key: elementId` 的 remount 天然按元素重算 |
| **图标一律来自 `src/ui/icons.tsx`**（Remix Icon v4.9.1 派生的内联 SVG，`viewBox="0 0 24 24"` + `fill="currentColor"`，许可全文在 `src/ui/REMIXICON-LICENSE`）；不再用 Unicode 字符当图标 | Remix 是**填充型**几何，必须显式 `fill="currentColor"` 才跟随主题（否则暗色下是死黑）；不用图标字体是因为 `manifest.json` 没有 `web_accessible_resources`，字体会逼出一次 manifest 变更 |
| **23 个主题令牌在 `styles/sidepanel.css`（`:root`/`.dark`）与 `content/card/card.css`（`:host`/`:host(.dark)`）之间逐字复制**，3 个圆角（`--radius-card/control/pill`）作为字面量写在各自的 `@theme inline`；`styles/tokens.test.ts` 是唯一的防漂移守卫 | shadow root 里 `:root` 拿不到页面根，所以重复是**必要的**（选择器不同，抽不出共享文件）；但没有任何构建步骤会发现两边漂移——一处改名就让那个界面裸奔，故用测试断言三组令牌名集合相等 |
| **卡片尺寸变化后必须重新 clamp**：mount 层对 `container` 挂 `ResizeObserver` → `clampOffset()` + `applyOffset()`（`unmount()` 里 disconnect） | 放置只在 `show()` 时按当时量到的尺寸做一次，而紧凑态 40px ↔ 展开态 ~396px 差一个数量级，指令 textarea 还能被用户拖高；贴底元素展开后 footer 会掉到视口外，**取消/保存点不到**（真机验收实测 bottom 916 > 720） |
| **content 侧监听 `chrome.storage.onChanged` 同步 locale/theme**（`applyStoredPrefs()` 与 connect 时的 hydrate 共用一处） | 面板是另一个 JS 上下文且是唯一写入方；只在 connect 时读一次，切主题/语言后**已打开页面上的卡片会停在旧主题直到刷新**（真机验收实测：面板已暗、卡片仍亮） |
| **头部一个属性图标开关（`SlidersIcon`，Remix equalizer-line）兼任「展开/收起底部属性区」**：`PropertiesToggle` 组件在紧凑态与展开态头部各出现一次（`aria-label` = 展开/收起 + `aria-expanded`），紧凑态没有徽章时它前面是拖拽把手；tag 名（`div`/`span`）、`SettingsIcon`、右侧 `ChevronUpIcon` 全部删除，`tagName` prop 从 `types.ts`/`mount-card`/`content/index.ts` 整条链路去掉 | 用户要「更简洁」：一个图标控制属性区开合就够，设置图标是纯装饰、tag 名对调样式没帮助，收起箭头与属性图标语义重复。展开态头部因此只剩 1 个按钮（真机断言 `headerButtons === 1`） |
| **`card.css` 里必须有一段 `@layer base { *, ::before, ::after, ::backdrop { --tw-*: … } }` 把 Tailwind 的初值补回来**（内容 = Tailwind 自己那份 `@supports` fallback，42 个变量） | Tailwind v4 把 border/shadow/ring/tabular-nums 全编译成读 `--tw-*` 的声明，初值只来自 `@property` 注册；而 **Chrome 不注册来自 shadow tree 样式表的 `@property`**（card.css 是 `adoptedStyleSheets` 进 shadow root 的），于是 `border-style: var(--tw-border-style)`、`box-shadow: var(--tw-inset-shadow), …` 整条在计算值阶段失效 → 真机实测卡片 `border: 0px none`、`box-shadow: none`，`shadow-2xl`/`ring-1`/改动行 `border-l-2` **一个都没画出来**，而类名全都对。Tailwind 那份 fallback 的 `@supports` 查询把 Chrome 排除在外，所以必须自己无条件写一遍；放 `base` 层是为了让后面的 `utilities` 层仍能按元素覆盖 |
| **`content/index.ts` 的 `onRevert`：查到已记录的 change 就把它的 `previousValue` 重新 stage 回预览；查不到才 `stagingEngine.unstage(property)`** | 两条分支各有各的坑，顺序不能反。**只改未保存**的属性：预览值留在 staging 会话里，不 `unstage` 就只回滚页面视觉，保存时那条值照样被 commit 成改动并多出一个气泡（用户报的「最大的 bug」）。**重置已保存**的属性：记录已经在 ChangeTracker 里，光 `unstage` 只是撤预览、记录还挂着，而 `EditorCard` 的 `canSave` 看的是「有没有 dirty」→ **保存按钮再也不亮，无法二次保存**（用户报的第二个 bug）；把 `previousValue` 再 stage 一次，这个「撤销」本身就成了本次会话的改动，保存时会把记录改掉/删掉。回归测试 `records no change for an unsaved edit that was reset before saving` + `keeps 保存 usable after resetting a change that was already saved`；两次 mutation check 都如期杀红 |
| **`EditorCard` 的 `canSave = dirtySet.size > 0 \|\| instructionDirty`（读原始集合），而传给 `rows` 的 `dirty` 是「减去 `reverted` 之后」的** | 「保存按钮亮不亮」和「这一行要不要画重置按钮」是两个问题：撤销一个已保存的属性后，重置按钮必须消失（已经回到原值了），但保存必须还能点（这次会话确实动了东西）。共用同一个集合就会出现「按钮消失 = 保存也禁用」的死锁 |
| **单值属性（display / flex-direction / flex-wrap / font-weight / text-align）一律用 `SelectRow` 折叠下拉**；`<select>` 的值若不在候选列表里，就把页面真值**插到第一项**（`offered`） | 段选（segment）把 5 个候选全摊在 24px 高的行里，挤且**永远有一个被强调色圈着**（当前值），设计师没动手就满眼高亮。下拉收起后一行只占一格。补插真值是必须的：页面 computed 值可能是 `display: inline`、`text-align: start`、`font-weight: 300`，而 `<select>` 匹配不到 option 时**静默显示第一项**，等于当面撒谎说元素是 `left`（mutation check：去掉 prepend → 真机断言如期失败，select 报 `left` 而页面是 `start`） |
| **行激活态是中性色**（`bg-inset-deep` + `ring-1 ring-edge-strong`），强调色只出现在**正在被调的那个控件**上（它自己的 focus/drag ring）与「已被上一步改动」的行（`border-l-2 border-accent-text`） | 用户明确要「默认状态不要高亮，只需要调节参数控件高亮」。行容器再套一层 `ring-2 ring-accent-text/60` 的话，24px 的行里外两圈紫读成一坨；而且「哪一行被点过」和「哪一个值被我改过」在视觉上必须能分开 |
| **可交互控件用 `focus:` 而不是 `focus-visible:`；shadow host 上写 `color-scheme`** | `ScrubInput` 的滑块是 `div[role=slider]`，Chrome 对**非文本元素上的鼠标点击不匹配 `:focus-visible`** → 设计师刚抓住的控件反而毫无反馈（真机实测）。原生 `<select>` 的下拉弹层由浏览器绘制，跟随 host 的 `color-scheme`：不声明就是亮色弹层，暗色卡片上极其刺眼 |
| **属性行容器不画激活态**：`Row` 没有 `data-active` / `bg-inset-deep ring-1` 分支，高亮只来自控件自身的 `focus:` ring 与「已改动」行的 `border-l-2 border-accent-text` | 24px 行里外两圈 ring 读成一坨；「哪一行被点过」和「哪一个值被我改过」在视觉上必须能分开。行容器再套强调色会让默认态满眼高亮，违反「默认态零高亮」原则 |
| **编辑卡点击外部关闭（Codex 风格）**：`mount-card.tsx` 在 `show()` 时挂 `window` capture `mousedown`/`click`，`mousedown` 检测 `composedPath()` 不含 container 即调 `onDismiss`（rollback + hide），`click` 用 `stopPropagation` 阻止 picker 的 document-capture handler 选中元素；关闭后延迟 200ms 才摘 handler，吃掉同一次物理点击的 click 事件 | 用户要「激活面板后鼠标不能再 hover 页面任何元素」。**window capture 先于 document capture**（window → document → target），所以 mousedown 先关掉卡片，picker 的 document-capture mousedown 再触发时卡片已关；click 事件则靠 stopPropagation 挡住 picker 的 click handler。延迟摘 handler 是因为同一物理点击的 mousedown 关卡后，click 还会来——如果不挡，picker 的 click handler 会选中点击位置的元素 |
| **卡片打开期间 picker 完全停止**：`content/index.ts` 的 `openEditorCard` 在 `show()` 前 `picker.stop()` + `overlay.setHover(null)`，关闭时（save/cancel/delete/dismiss 四条路径）用 `wasPicking` 标记恢复；从气泡打开的卡（picker 本就未运行）关闭后不重启 picker | 单纯停止 click 事件还不够——mousemove 仍会触发 overlay 高亮，视觉上「鼠标不能再 hover 页面任何元素」不成立。完全停 picker 才能让卡片打开期间页面完全静默 |

## 5. 常用命令

```bash
pnpm install
pnpm build        # 全部构建（turbo 保证 protocol/inspector 先于 extension）
pnpm test         # vitest（turbo 编排，每包各自跑）
pnpm typecheck
pnpm lint
pnpm dev          # 扩展三个构建并行 watch
pnpm page         # 测试页 http://localhost:8000（绑定 127.0.0.1）
pnpm bridge       # Local Bridge（--cwd <项目路径> 指定目标项目；npx ui-tuner 为发布后命令）
```

**真机验证循环**：改代码 → `pnpm build` → `chrome://extensions` 点扩展卡片刷新 → **刷新 localhost 页面**（content script 只在页面加载时注入，旧页面不会换新脚本）→ 重开 Side Panel → 在 `http://localhost:8000` 上操作。加载目录：`apps/chrome-extension/dist`（⌘⇧G 粘贴路径最快）。

## 6. 已交付摘要

**M1**：Monorepo + MV3 扩展骨架 + Side Panel(React 19/zustand/Tailwind 4) + Content Script + background SW + 双向 Port 通道（`content.ready` / `sidepanel.ping` / `content.pong`）。真机验收通过。

**M2**：`packages/inspector`（Picker / Overlay / SelectionTracker / identity）+ protocol 新消息（`sidepanel.picking` / `picker.state` / `selection.changed` / `selection.cleared` / `sidepanel.selectAncestor`）+ content 接线 + Side Panel 选取卡片与 Breadcrumb。真机验收通过（在用户真实项目上验证）。

**M3**：Style Inspector。

- inspector 新增：`styles/whitelist`（§7 白名单）、`styles/computed`（pickStyles）、`styles/parse`（CSS 值解析 + scrubMultiplier）、`styles/color`（rgb→hex）、`dom/snapshot`（§3.1，总预算 12000 截断）、`preview/PreviewEngine`（§11 override CSS 引擎）、`changes/ChangeTracker`（§12 记录）。
- protocol：`SelectionPayload` 增加 `styles`（必填）与 `dom?`；新增 `sidepanel.stylePreview`（面板→页面，`committed` 区分拖动帧/提交）与 `preview.changed`（页面→面板，回报 StyleChange 列表）。
- content：选中时抓白名单 computed style + DOM snapshot；处理 stylePreview（首帧捕获原始值 → engine.setOverride → commit 时记录/回报；拖回原值则丢弃记录与 override）；PreviewEngine/ChangeTracker 模块级、跨重连存活、随页面刷新消亡。
- Side Panel：三 Tab（Style 默认 / Agent 占位 / Changes 列表）；StylePanel 分组 Layout(display/flex 3×3 对齐/wrap/gap)/Size/Spacing(Simple V/H + Advanced T/R/B/L)/Typography/Fill/Border/Effects；**ScrubInput（P0）**：拖动 ±step/Shift ×10/Option ×0.1、方向键、双击输入。
- 测试 106 例（inspector 79 / protocol 11 / extension 16）。

**M4**：ChangeSet。

- protocol 新增：`sidepanel.revertChange {changeId}` / `sidepanel.revertElement {elementId}` / `sidepanel.resetChanges`。
- inspector：`ChangeTracker.revert(changeId)` / `revertElement(elementId)`。
- content：`syncAfterChanges()` —— revert/reset 后移除受影响 override、回报 `preview.changed`，若当前选中元素受影响则**重发 selection.changed**（面板 styleValues 恢复页面真值）；重连时（content.ready 后）若有存量记录主动补发 `preview.changed`（面板 Changes 列表恢复）。
- 面板 store：`revertChange/revertElement/resetChanges` 动作 + `elementNames`（elementId→tagName，从 selection 累积，Changes 分组标签用）。
- ChangesTab（§13 格式）：按元素分组（tagName + ut-id）、每条 `prop prev → next ↩` 单条 Revert、每组 Revert、底部 **Reset All**；「Apply · M8」占位计数。
- 测试 111 例（inspector 81 / protocol 12 / extension 18）。

**M5**：Local Bridge。

- 新包 `packages/bridge`：`BridgeServer`（node:http + ws，127.0.0.1:47321，`/health` 端点，hello→welcome 握手，存最新 `bridge.sync`）、`detectProject`（package.json 依赖判定 Next.js/Vite/CRA/…）、`probeDevServer`（3000/5173/8080/4000/8000 探活）、CLI `cli.ts`（bin `ui-tuner`，§15 启动横幅）。tsc 直出 ESM（相对导入带 .js），无浏览器 API（规则 8）。
- protocol：`bridge.hello` / `bridge.welcome`（含 BridgeProject {name, framework, root} + devServerUrl）/ `bridge.sync`（selection + changes 镜像，服务 M7 的 ui_get_selection / ui_get_changes）。
- 扩展：`messaging/bridge-channel.ts`（WebSocketLike 结构接口 + 边界守卫，同 Channel 模式）；manifest host_permissions 加 `ws://localhost/*`、`ws://127.0.0.1/*`；store `attachBridge`（hello/welcome/断线 offline）+ selection/changes 变化自动 `bridge.sync` 转发；面板 BridgeCard（§35：offline 不阻塞 Preview，提示 `npx ui-tuner` + Reconnect）。
- 测试 133 例（inspector 81 / protocol 13 / bridge 20 / extension 19）。
- 验收后修正：CLI 增加 `--cwd <项目路径>`（未发布 npm 期间从仓库根启动 Bridge 指向用户项目；`npx ui-tuner` 为发布后命令）；修复 BridgeServer 端口占用时 ws 转发 `error` 事件导致的裸崩（现友好报错退出）。
- 真机验收通过（静态 HTML 项目：框架显示 Unknown 为正确答案；root/dev server 检测与 selection+changes 镜像均验证）。

**M6**：Source Resolver。

- 新示例项目 `examples/react-vite`（计划 §39 Example A，**独立 npm 项目不进 pnpm workspace**）：Navbar/Card/Button/Form/List + 普通 CSS；README 内含各元素预期解析结果表（已自动化为锚定测试）。
- bridge 新增 `resolver/`：`indexer`（扫 `src/**/*.{tsx,jsx,ts,js}`，regex 级提取默认导出组件名 / JSX 文本字面量（跨行）/ className token（含模板串静态部分与表达式内字符串）/ 小写 JSX 标签 / id，每命中带行号；跳过 node_modules/dist 等，上限 500 文件 200KB/文件）+ `resolve`（信号打分：文本 4(+唯一1)/class 1(≤3)/标签 1/id 3；exact 需文本命中且领先 ≥2 → file:line；≥3 → inferred（只文件不行号）；否则 unknown）。BridgeServer 收到带 selection 的 `bridge.sync` 即解析并回发 `bridge.sourceResolved`；解析异常降级 unknown 不影响 sync 通道。
- protocol：`SourceConfidence` / `ElementIdentity`（§21）/ `SourceResolution` / `bridge.sourceResolved` 消息；`SelectionElement` 增 `domFingerprint`（inspector `domFingerprintFor`：`tag#id.cls>[子标签]` 结构签名，§22 重定位地基）。
- 扩展：store `source` 状态（stale 守卫：elementId 不匹配当前选中则丢弃；重选/清除/断线置 null）；SelectionCard 按 §20 三态渲染（● Source linked 绿 + `组件 · file:line` / ● Source inferred 黄 + `Possible: file` / Preview only）。
- 测试 162 例（inspector 84 / protocol 14 / bridge 43 / extension 21）；含 `resolve.example.test.ts` 对真实 examples/react-vite 的 10 例锚定测试（M6 验收的自动化形态）。
- 真机验收通过（2026-09-01，自动化 E2E 9/9：Chrome for Testing + 真实扩展 + live Bridge —— 品牌 Chrome 152 禁 `--load-extension`；`sidePanel.open()` 有手势门禁，自动化用面板后台标签页等价。脚本 `/tmp/ui-tuner-e2e/acceptance.mjs` 是 §40 E2E 地基）。

**M7**：Agent + MCP。

- protocol：新消息 `agent.request`（SP→Bridge：instruction + include 开关 + contextLevel）/ `bridge.agents`（AgentInfo 可用性，welcome 后推送）/ `agent.applied`（Bridge→SP，ui_notify_applied 触发）/ `agent.capture` + `agent.captureResult`（ui_capture 往返）；新类型 `ContextLevel`(1|2|3) / `AgentInclude` / `AgentInfo`；`assembleAgentContext()`（§26 纯文本组装，面板预览与 MCP ui_get_context 共用，杜绝漂移）。
- bridge `adapter/`（§44）：`AgentAdapter` 接口 {id,name,isAvailable(),applyChanges()}；Codex 优先，ClaudeCode/Cursor 占位——`isAvailable()` 真实探测 CLI（`<bin> --version` 3s 超时），`applyChanges()` 一律诚实返回 `NOT_IMPLEMENTED`（M8），**绝不假实现成功**。
- bridge `mcp/`（§27）：stateless StreamableHTTP 挂在同一 47321 server 的 `/mcp` 路径（与 WS 侧共享 lastSync/lastResolution/lastAgentRequest）；五工具 `ui_get_selection` / `ui_get_changes` / `ui_get_context{level}` / `ui_capture{withScreenshot}` / `ui_notify_applied{files,summary}`。空状态诚实回报（未选中/面板未连）；`ui_capture` 经 WS 往返面板拿新鲜 selection+changes+截图（截图作 MCP image content）。
- 扩展 AgentTab（§23）：Context 卡（元素 + 源码行 + 截图占位）/ Instruction textarea / Agent 行（Codex + ●available，§36 Offline 提示）/ Include 五开关 / Context Level 1/2/3 / §26 Prompt 实时预览 + Copy / 发送至 Bridge；store 增 agent 状态（agents/agentInstruction/agentInclude/agentContextLevel/agentSent/lastApplied），`registerCaptureHandler` 注入 `chrome.tabs.captureVisibleTab`（store 保持 chrome-free 可测）。
- 测试 187 例（inspector 84 / protocol 20 / bridge 56 / extension 27）。
- 真机验收通过（2026-09-01）：Codex CLI 经 `codex mcp add ui-tuner --url http://127.0.0.1:47321/mcp` 注册后，`ui_get_context` 真实返回选中元素 Context（组件 Card · src/components/Card.tsx:10 · 指令「整体紧凑一点，标题不要变小」）。**两个 codex 侧坑**：① codex 需走本机代理（`HTTPS_PROXY=http://127.0.0.1:7892`，且 `NO_PROXY=localhost,127.0.0.1` 排除 loopback）否则模型流反复重连；② codex exec 调 MCP 工具需 `--dangerously-bypass-approvals-and-sandbox`（approval:never 会把 tools/call 当需审批而自动取消——"user cancelled MCP tool call"，请求根本不到 bridge）。

**M8**：Apply to Code（§29 流程 / §30 Dialog / §31 Result / §34 applying / §44–§47）。

- protocol：`ApplyScope`(instance|component) / `ApplyErrorCode`(SOURCE_NOT_FOUND|AGENT_OFFLINE|APPLY_FAILED|NOT_IMPLEMENTED) / `ApplyElementContext` / `ApplyChangeRequest` / `ApplyChangeResult`；消息 `changes.apply`(SP→Bridge) / `apply.result`(Bridge→SP) / `sidepanel.confirmApply`(SP→content) / `apply.confirmed`(content→SP)。
- bridge `adapter/prompt.ts` `buildCodexApplyPrompt()`：§28 约束（Tailwind 改 utility class 不加 inline style；CSS Module/plain CSS 改类规则；组件库保 variant/size/token 语义；最小改动）。`CodexAdapter.applyChanges()` 真实现：无 source→`SOURCE_NOT_FOUND`、不可用→`AGENT_OFFLINE`、spawn `codex exec`→`fileDiff.ts`（`snapshotSourceFiles`/`detectChangedFiles`，mtime+size 签名，不依赖 git，上限 2000 文件）检测改动→成功报 files+summary；exit≠0/无改动/超时→诚实 `APPLY_FAILED`（§47 绝不假成功）。
- **关键修复**：`defaultCodexRunner` spawn 必须 `stdio:["ignore","pipe","pipe"]` —— 默认 pipe 的 stdin 永不关闭会让 codex 阻塞在 "Reading additional input from stdin…"（真机卡 7 分钟 CPU 0:00.06 的根因）。`codexEnv()` 透传代理并强制 `NO_PROXY` 含 loopback（模型流走代理、/mcp 不走）。env-gated 调试 `UI_TUNER_DEBUG_CODEX=1` 落盘 `/tmp/ui-tuner-codex-last.log`。
- 面板 `ApplySection.tsx`（ChangesTab 挂载）：idle「Apply to Code」按钮 → §30 Dialog（scope radio instance/component + agent + sourceUnknown 警告）→ §34 applying 态 → §31 Result 卡（✓ Applied  emerald / Unable to apply changes 红 + Retry）；store `applyState/applyResult/applyConfirmedCount` + `applyChanges(scope)`（只发选中元素的 changes）+ stale 守卫。
- HMR 重定位（§22）：content `locateAppliedElement`（data-ui-tuner-id → selector+fingerprint 回退）+ `confirmOneChange` 轮询（移除 override→读 computed→`cssValuesEqual` 比对→不匹配则恢复 override 重试，8s 超时）；确认后 drop override+记录（面板 Preview 计数归零）。
- 测试 224 例（protocol 21 / inspector 91 / bridge 71 / extension 41）。
- 真机验收通过（2026-09-01，自动化 E2E 8/8，`/tmp/ui-tuner-e2e/m8-acceptance.mjs`）：选中「查看详情」→ Height 38→52 页面实时 → Changes 记录 → §30 Dialog → codex 真实改源码（Card.tsx 加 `className="card-details-button"`、styles.css 加 `.card-details-button{height:52px}`，遵循 plain-CSS 约束未加 inline style；并给 Button 加 className prop）→ Vite HMR → confirmApply 验证源码 computed=52px → ✓ Applied 卡（1 changes · Card.tsx, styles.css）。
- **真机自测 2（2026-09-02，对用户真实纯静态项目 vehicle-dashboard :8080，E2E 11/11 `/tmp/ui-tuner-e2e/selftest-gRange.mjs`）**：选中 `#gRangeText`（数据驱动文本 → inferred `index.html`）→ font-size 12.5→20 → Apply → codex 精确改 `.filter-bar .fb-range`（**非** `.page-header .date`）→ 刷新后源码改动生效。暴露并修复两个真实缺陷：
  - **Apply prompt 缺精确定位** → codex 凭文本语义猜错元素。修复：prompt Target 段加 `css selector` + `domFingerprint` + 显式「按 id/selector grep 定位，勿猜」指令。
  - **静态 HTML 无 HMR** → codex 改盘后页面不刷新、确认轮询必超时。修复：framework==="Unknown" 时跳过 confirmApply、Result 卡提示「刷新页面查看」+ `sidepanel.reloadPage` 消息（content `location.reload()`）。
  - 配套：`formatStyleChangeLine` 抽到 protocol 统一 §26 与 Changes 复制的改动行渲染；source unknown 时 Apply 入口+对话框按钮禁用。
- **真机自测 3（2026-09-02，vehicle-dashboard :8080）——颜色改动「提交后页面恢复原值」修复**：用户操作链 选中→改色→页面实时变→松手→change+1→**页面又变回原色**，记录的 change 是 `color: rgb(47, 109, 246) → #2f6df6`（同色）。两层根因，都已修：
  - **主因（受控控件绑定滞后值，父级重渲染回拨）**：预览帧（`committed:false`）**不更新** store 的 `styleValues`，但会更新 `log`、且每帧 content 回 `preview.changed` 更新 `changes`；App 顶层订阅 `log`+`changes`（徽标）→ **每次拖动/取色整个面板都重渲染**。于是绑定滞后 `styleValues` 的受控控件被重渲染**拨回原值**：
    - `ColorRow` 颜色框 `value={hex}`（hex 由 `styleValues` 派生）→ 重渲染拨回原色 → blur 提交原色。修复：本地 `draft` state 跟踪拖动期实时色值，blur 提交 draft。
    - `ScrubInput`（**所有数字拖动**：宽高/间距/gap/字号等）原来每次渲染无条件执行 `currentValue.current = value`，拖动中被滞后 prop 重置 → `pointerUp` 提交原值 → 页面回退、change 成 no-op。修复：改为 `useEffect` 仅在「非拖动且非编辑」时同步 ref。**这是「改了数值又变回原来的 / 改了像没变化」的根因**（间距控件也走 ScrubInput，一并修复）。`TextRow`（每击键即 commit 同步更新 store）、`SegmentRow`（点击直接 commit）本无此问题。
  - **兜底（同色 no-op 不记录）**：即便真提交了同色（打开取色器没动就关），也不该记成改动。`inspector/styles/color.ts` 新增 `colorKey()`（保留 alpha 的颜色归一化：opaque→`#rrggbb`，半透明→`rgba(r,g,b,a)`；8 位 hex / rgb / rgba / 逗号 / 斜杠语法都归一）；`cssValuesEqual()`（confirm.ts）颜色感知——先字符串归一比较，不等再比 `colorKey`；content 的 commit no-op 丢弃（content/index.ts）改用 `cssValuesEqual`。注意 `rgba(...,0.5)` ≠ `rgb(...)`（alpha 不同仍算改动）。
  - 回归测试（jsdom + RTL，**新增扩展组件测试基建**）：`rows.test.tsx`（ColorRow）、`ScrubInput.test.tsx`——复现「父组件重渲染把受控值拨回原值」，未修复时分别断言 `expected '#2f6df6' to be '#ff0000'`、`onCommit to be called with 52` 如期失败。**加固**：`ScrubInput.endDrag` 把 `commit()` 提到 `releasePointerCapture` 之前并给后者加 try/catch（pointer 被隐式释放时 release 抛 NotFoundError 会吞掉 commit）。
  - **端到端验证（2026-09-02，vehicle-dashboard :8080，`/tmp/ui-tuner-e2e/selftest-revert.mjs`，8/8 全过）**：真实浏览器里 ① 取色 `#ff0000` → swatch 不被回拨、页面变红且**保持**、Changes 记录 `rgb(47,109,246) → #ff0000`、Reset 还原；② 合成 pointer 拖动 font-size +20 → 提交 32.5（非原值 12.5）、页面 override `font-size:32.5px !important` 生效且**不回退**、面板 slider 显示 32.5。注：Playwright 真实鼠标 + pointer capture 在 headed Chrome 会把 pointerup 误投（自动化怪癖，非产品 bug），故拖动改用页面内合成 pointer 事件驱动。
  - 修复后符合预期逻辑：改属性实时可见、**提交后保留**（override 不撤）直到 Apply；Apply 后 HMR 项目无缝换源、静态项目刷新生效。
  - 另：width/height 设在 `display:inline` 元素（如 `<span>`）、gap 设在非 flex/grid 容器上**本就无视觉效果**——这是 CSS 固有行为，不是 bug。
- 测试 242 例（protocol 21 / inspector 100 / bridge 71 / extension 50）。

**注释模式重构（2026-09-02，`docs/superpowers/{specs,plans}/2026-09-02-annotation-mode*`，7 任务；分支 `feat/ui-ux-polish`）**

- 面板去 Tab → **两态注释模式**：空闲态只有「选取元素」，选中态显示 Breadcrumb + 操作；footer 吸底；Agent 高级设置折叠。新增中英文切换与亮/暗/跟随系统主题（`state/prefs.ts` + `i18n/messages.ts`，zh/en 键必须齐平，有 parity 测试）。
- inspector `annotations/Annotations.ts`：页面侧注释层（shadow host `ui-tuner-annotations-root`），气泡为**蓝色序号圆点**，按注释先后编号、重置后重新计数；Picker 新增 `passThroughHostIds` 放行注释层点击（否则点气泡被 Picker 吃掉）。
- protocol 新增 `sidepanel.clearSelection`（「完成此元素」）+ store `clearSelection`；**选中元素不再退出注释模式**（`picking` 只认 content 回报的 `picker.state` ack，面板不做乐观更新）；编辑卡里也有「取消」= 还原此元素改动并取消选中，注释模式保持。
- 气泡点击语义从「只读浮层」改为派发 `onOpenEditor`（为编辑卡铺路）。

**页面侧编辑卡（2026-09-03，`docs/superpowers/{specs,plans}/2026-09-03-page-editor-card*`，SDD 14 任务全绿，过程台账在 `.superpowers/sdd/2026-09-03-page-editor-card/`）**

- inspector 新增 `staging/StagingEngine.ts`（**保存才记录**：stage 只写 PreviewEngine → 页面实时可见但不落账；commit 才写 ChangeTracker；rollback 还原基线）与 `changes/InstructionStore.ts`（elementId → 自然语言指令，页面侧存储）。
- 扩展 `content/card/`：`EditorCard.tsx`（属性/自然语言两页签 + 折叠 + 取消/保存/删除）、`mount-card.tsx`（挂 shadow root `ui-tuner-editor-card-root`）、`inject-styles.ts`（Tailwind token scoped 到 `:host` / `:host(.dark)`，`adoptedStyleSheets` 注入）。样式控件从 `sidepanel/` 抽到 **`src/style-editor/`**（ScrubInput / rows / StylePanel / StyleEditContext）供卡片复用，行为保持不变。
- protocol：`preview.changed` 增 `instructions`（elementId→指令，面板镜像）；**删除 `sidepanel.stylePreview`**——面板不再下发编辑，改由页面卡片就地编辑。
- 面板：删掉编辑区；`ChangesTab` 组头显示该元素的自然语言指令；复制 / Agent Context / Apply prompt 三处都把元素指令纳入上下文（**元素指令在前、Agent 页全局备注在后**，合并进已有的单个 `instruction` 字段，无需改协议 schema）。
- SDD 终审（1 Critical + 2 Important）已在 `4ce156a` 修完并复审通过：卡片 remount key、「仅指令」元素支持、apply 串联。
- 测试 305 例（protocol 26 / inspector 121 / bridge 72 / extension 86）。

**真机验收轮（2026-09-03，`f8cf5a4` + 本轮「仅指令元素走 Apply」）**

复现用户报的 5 个验收问题，4 个在 HEAD 已不复现（含带 stage/气泡重开/Esc 退出的完整序列复验）；真凶是**「只写自然语言、不动数值」的元素在四处被当成空**：

1. **页面没有气泡** —— `Annotations.sync` 只吃 changes，且 `SelectionTracker.keepId` 也只看 changes，选中一转移 `data-ui-tuner-id` 就被摘掉。修复：`sync(changes, instructions)` 取并集（非空指令即注释），`keepId` 同步放宽；content 每次 mutation 都传两份数据。
2. **面板计数 `Preview · 0`** —— 修复：无改动行但有指令的元素计 1 条，且与有改动的元素不重复计数。
3. **空态文案还指向已删除的面板 Style 面板** —— 修复：改指页面编辑卡（zh/en 同步）。
4. **Apply 入口完全不渲染** —— 修复：`applyChanges` 守卫从「无改动就 return」改为「**既无改动又无指令**才 return」；`ApplySection` 用 `hasWork = 有改动 ∨ 有指令` 门控（按钮渲染 / 两处 disabled / 两处 title）；弹窗文案改「仅自然语言指令（无视觉改动）」而不是「0 处视觉改动」；bridge `buildCodexApplyPrompt` 在 `changes` 为空时**不再输出空的**「Apply these exact style changes」列表，改声明「无实测属性改动，用户指令即全部诉求」；`CodexAdapter` summary 不再谎称 `Applied 0 change(s)`，改 `Applied the user instruction to <files>`。协议无需改动（`changes: StyleChange[]` 本就允许空数组，`instruction?` 已存在）。

- 验证：`pnpm build/test/typecheck/lint` 全绿（**311 例**）；mutation check（把 `hasWork` 强制为真 → 「无改动又无指令时按钮不渲染」用例如期失败）；真机浏览器 `.playwright-mcp/verify-instruction-only-apply.mjs`（仅指令保存 → `Preview · 1` → **「应用到代码」按钮出现**（此前完全不渲染）→ 弹窗显示「仅自然语言指令（无视觉改动）」且不再有「0 处视觉改动」）；真实 codex exec `.playwright-mcp/verify-instruction-only-codex.mjs`（`changes: []` + 指令「把这个按钮改成次要样式（ghost variant）」→ 142.7s → success，`files: ["src/components/Card.tsx"]`，summary 为 `Applied the user instruction to …`，盘上 diff **恰好一行** `<Button>` → `<Button variant="ghost">`，相邻「导出报表」按钮未被误改；验证后已还原 fixture）。
- 环境注意：验证时 47321 上跑着用户另一个项目（vehicle-dashboard）的 Bridge，**没有抢占端口**；因此浏览器侧源码解析为 unknown，端到端 Codex 那一程改用直连 `CodexAdapter` 的方式跑（同一份 prompt/runner/fileDiff 代码路径）。
- 未修（已进 backlog）：编辑卡 textarea 内按 Esc 会退出整个注释模式。

**气泡随注释模式显隐（2026-09-03，`61dc977`）**

用户要求：**退出注释模式后不显示标注气泡，激活后再显示**。

- 实现：`Annotations.setVisible(visible)` —— 隐藏改**宿主节点** `style.display`，不卸载重挂，因此气泡与序号（`numbers`/`nextNumber`）跨模式切换存活，重新激活即原样恢复；`scheduleRender()` 增加 `!this.visible` 门控、隐藏时 `stopLoop()`，隐藏期零开销；`mount()` 也遵守该标志（重连后仍是隐藏态）。content 侧 `startPicking` → `setVisible(true)`、`stopPicking` → `setVisible(false)`，连接后先 `mount()` 再置 false；Picker 自己的 Esc（`onCancel`）改为复用 `stopPicking()`，两条退出路径共用一处实现。
- 验证：inspector 13/13、content 3/3，全量 **314 例**绿；两次 mutation check（去掉 `stopPicking` 里的隐藏 → content 用例如期失败；去掉 `scheduleRender` 的可见性门控 → inspector「隐藏期不绘制」用例如期失败，报 `expected '280px' to be ''`）；真机浏览器 `.playwright-mcp/verify-annotation-visibility.mjs` **9/9 通过**：连接后不可见 → 注释模式内保存后气泡「1」可见且 Preview 生效（height 80→120px）→ 面板「退出注释模式」后不可见、**Preview 改动仍在**、面板 `Preview · 1` 未丢 → 重新激活气泡恢复且**序号仍是 1** → Esc 退出同样隐藏。
- 踩坑记录：首版验证脚本用气泡的**内联样式**（`display`/`left`）判定「是否显示」，结果退出后误报 ❌ —— 内联位置是**故意保留**的（序号靠它恢复），真正的隐藏发生在宿主层。改为量**渲染几何**（`getBoundingClientRect().width > 0`）+ **命中测试**（`elementFromPoint` 是否落在注释宿主上）后 9/9 通过。教训：验收断言要量用户实际能看到/点到的东西，不要量实现留下的中间状态。

**页面侧交互打磨：退出即净页 / 改动行高亮 / 卡片就近弹出（2026-09-04）**

用户带截图提了三条（截图里的错误示范：注释模式已关，页面上却还留着紫色选中框 + `div 347 × 143` 标签）：

1. **退出编辑后页面回到正常预览，不要有任何元素选中** —— `stopPicking()` 增加 `clearPageSelection()`：`tracker.clear()` + `selectionActive = false` + `overlay.setSelected(null)`（选中框、尺寸标签、悬停框全部消失），编辑卡也已在 `closeEditorSession()` 里关掉。**关键取舍（用户选定「只清页面，面板留 Apply 目标」）**：不发 `selection.cleared`，因为 `ApplySection` 整体门控在 `selection` 上，发了就等于把 Apply 入口一起删掉；`lastSelector`/`lastFingerprint` 也保留，apply 后 HMR 重定位还要用。有改动/有指令的元素靠 `keepId` 保住 `data-ui-tuner-id`，所以 Preview 覆盖与气泡都不受影响。
2. **点气泡要能看出上一步改了哪些属性（用户选定「行内标记 + 自动滚到第一处」）** —— content 侧新增 `changedPropertiesFor(elementId)`（从 ChangeTracker 过滤 + 去重）→ `EditorCardProps.changedProperties` → `EditorCard` 转成 `StyleEditApi.changed`（`ReadonlySet<string>`）→ `rows.tsx` 新增 `useIsChanged(property | readonly string[])`，`Row` 命中时打 `data-changed="true"` + `title=「上一步已改动」` + 紫色左边线与底色。`ScrubField`/`TextRow`/`SegmentRow`/`ColorRow` 各自接线；`AlignmentControl`（九宫格）与 `AxisScrub`（间距轴）原本手抄了一份 `Row` 的 markup，这轮**改为复用 `Row`**，`AxisScrub` 新增 `properties: readonly [string,string]` 表示「这个轴写哪两个属性」，命中任一即亮。`EditorCard` 挂载时把第一处标记 `scrollIntoView({block:"nearest"})` —— body 只有 320px 高，不滚就等于没标。`ReadOnlyRow` 故意不接（它永远不可能在 changed 集合里）。
3. **卡片跟随元素就近弹出且不超出页面** —— 新增纯函数 `content/card/placement.ts`：`placeNearAnchor({card, anchor, viewport, gap=12, margin=8})`，按「右 → 左 → 下 → 上」四个候选取第一个完整落在视口内的，四个都放不下才 clamp 回视口。`CardMount.show(props, anchor?)` 接 anchor（`openEditorCard` 传 `element.getBoundingClientRect()`），并用 **`flushSync`** 先同步提交渲染再量卡片尺寸——否则量到的是未渲染的 0×0，所有溢出判断都会失效。宿主是 `position:fixed;top:0;left:0` + `transform: translate(x,y)`，所以 offset 与 rect 都是视口坐标，不需要滚动换算。

- 验证：`pnpm build/test/typecheck/lint` 全绿，**328 例**（extension 91 → **105**：placement 7 / mount-card +2 / EditorCard +2 / rows +2 / content +1）；**5 次 mutation check 全部如期杀死**（去掉 `overlay.setSelected(null)`、`useIsChanged` 恒 false、去掉自动滚动、placement 只留首个候选、`show` 忽略 anchor）。
- 真机浏览器 `.playwright-mcp/verify-exit-highlight-placement.mjs` **26/26 通过**：#boxA 常规位置 → 卡片在右侧、间隙 12px、顶部对齐；#boxRight 贴右边缘 → **翻到左侧**；#boxBottom 贴底 → **翻到上方**；三处卡片均 280×422 完整落在 1280×720 内。点气泡 2 → 卡片标记「圆角」行、`title` 为「上一步已改动」、**scrollTop 650**（scrollHeight 1057 / clientHeight 320）且标记行在可视区内；点气泡 1 → 标记「高」行；无改动的 #boxBottom 卡片**一行都不标**（负对照）。退出注释模式后：选中框 / 尺寸标签 / 悬停框 `display:none` 且渲染宽度 0、编辑卡清空、气泡隐藏，而 **#boxA height 仍 120px、#boxRight radius 仍 48px、面板 `Preview · 2`、「应用到代码」仍在**；退出前的对照组确认选中框当时确实是 `block`（否则断言空洞）。
- 踩坑记录：脚本用 `[role="slider"][aria-valuenow="16"]` 定位「圆角」滑块，结果 `.first()` 命中的是**字号**（computed font-size 也是 16），于是「标记圆角」和「radius 变成 24px」两条误报 ❌——产品行为其实是对的（它老老实实高亮了真正被改的字号行）。修法：把 fixture 的 border-radius 设成**卡片内唯一**的 36px，并**紧跟保存加一条「radius 确实生效」的断言**，让定位错误立刻暴露在源头而不是污染后面的判断。教训延续上一轮：断言要量用户看到的东西，而定位器要保证自己指向的确实是那个东西。
- 未修（已在 backlog）：编辑卡输入框内按 Esc 仍会连带退出整个注释模式。

**Codex 风格视觉重做（2026-09-04，编辑卡两态 + Remix 图标 + 属性控件/面板换外观）**

用户带 Codex 注释交互截图（选中加注释 / 文字描述 / 属性展开 / 点气泡查看注释）要求「按照他的交互逻辑以及面板的 UI 样式、属性控件组件去修改目前的面板，所有 icon 用 remix 平台的开源图标」。四项决策已锁定：**范围 = 编辑卡 + Side Panel 一起**、**交互结构 = Codex 两态**（取代「属性精调 / 自然语言」页签 + 折叠条）、**属性控件 = 保留拖拽只换外观**、**麦克风 = 放图标但禁用**。

- **图标系统**：`remixicon` v4.9.1 作为 extension 的 devDependency（**只是路径数据来源**，不进运行时依赖），手工抽出 `src/ui/icons.tsx` 的 28 个组件（`makeIcon(d)` 共用 `viewBox="0 0 24 24"` + `fill="currentColor"` + `aria-hidden`），许可全文拷到 `src/ui/REMIXICON-LICENSE`（注意包内许可不是标准 Apache-2.0，而是「Remix Icon License v1.0」）。**不用图标字体**：`manifest.json` 没有 `web_accessible_resources`，字体会逼出一次 manifest 变更，内联 SVG 不用。全项目从此不再有 Unicode 字符当图标（⠿ ▴ ▾ ⇔ ▸ ↩ ✕ ☀ ☾ ◐ ✓ 全删）。
- **令牌**：新增 3 个圆角（`--radius-card: 14px` / `--radius-control: 6px` / `--radius-pill: 999px`），作为字面量分别写进 `styles/sidepanel.css` 与 `content/card/card.css` 各自的 `@theme inline`；散落的硬编码色（`ring-violet-500/70`、`bg-violet-500/20`、`ring-zinc-500`）换成 `ring-accent-text/60`、`bg-accent-text/15` 等令牌，亮暗两套才都对。**明确不做「共享 tokens.css」抽取**（两边选择器不同——`:root`/`.dark` vs `:host`/`:host(.dark)`，抽不干净，只换来构建风险），改为新增 `styles/tokens.test.ts` 用正则提取两个文件的 `--*` 声明名、断言三组集合相等。
- **编辑卡两态**：`EditorCard.tsx` 重写，删掉 `mode` / `collapsed` 两个 state，只留 `viewState: "compact" | "expanded"`，**默认态由 props 推出且不记忆**（`annotated = number !== null ∨ changedProperties 非空 ∨ 已有指令`）。紧凑态一行 = 序号徽章 + `div` 标签 pill + 单行 `<input>`（Enter = 提交）+ 禁用麦克风 + 圆形 ✓；展开态 = 拖拽把手/徽章/标签/收起箭头 + `rows={3}` textarea + `StylePanel` + 底部 删除/麦克风/取消/保存；卡宽 280 → **320px**，外壳 `rounded-card`。**`types.ts` / `placement.ts` / `content/index.ts` 因此不需要新接线**（默认态完全由已有 props 推出），`key: elementId` 的 remount 天然按元素重算。**明确不做**：7 个属性分组不改成手风琴（截图只露出两组，但折叠分组会让 `rows.test.tsx` 的行查询失效，且属于新增行为而非「照搬交互」）。
- **属性控件**：`ScrubInput.tsx` **一行逻辑都没动**——`role="slider"` + aria 三件套、pointer capture、`scrubMultiplier`（Shift ×10 / Option ×0.1）、rAF 节流 `flushPreview`、拖拽期 `applyDragValue` 直写 DOM、`releasePointerCapture` 的 try/catch 守卫、方向键、双击进 `<input>`、以及「`currentValue` ref 只在 idle 时同步 prop」那段（M8 真机自测 3 的回归修复）全部原样保留；只把 idle 外观从实心 `bg-control` 换成凹陷字段 `bg-inset rounded-control`、拖拽/聚焦换成 `bg-accent-text/15 ring-accent-text/60`、`⇔` 换成 `DragIcon`。`rows.tsx` 的 `SegmentRow` 新增可选 `icon`（有则渲图标 + `aria-label`，无则照旧渲文字，所以 display/direction/wrap/weight 仍是文字）；`GroupHeader` 新增 `icon`，`StylePanel` 七个分组各传一个；`ColorRow` 右侧显示计算值原文（`rgba(18, 18, 20, 1)`），本地 `draft` 追踪保留。**所有 `data-changed` / `title` / `aria-*` 钩子一个没少**——改动行高亮与自动滚动都靠它们。
- **Side Panel**：`App.tsx`（主题 ☀☾◐ → Remix 图标，「中/EN」保留文字）、`ChangesTab.tsx`（还原 / 全部重置换图标，每行改成「属性名暗 / 旧值划线 → 新值亮」两列）、`AgentTab.tsx`、`ApplySection.tsx`（应用到代码 / 已应用 / 重试 / 忽略 加图标，圆角统一 `rounded-control`）。**store / 协议 / 数据流一行未动**，面板宽度也不动（由用户拖拽决定）。
- **i18n**：删 `card.properties` / `card.naturalLanguage`（页签没了），改 `card.instructionPlaceholder` 为「这个元素要怎么改？」，新增 `card.submit` / `card.micSoon`；`card.collapse` / `card.expand` 保留但语义变成「收起为紧凑态 / 展开」。zh/en 键齐平由 `messages.test.ts` 守着。

**真机验收暴露的两个真实缺陷（都超出了原计划的「不改文件」清单，已修）**：

1. **贴底元素展开后 footer 掉到视口外，取消/保存点不到** —— 放置只在 `show()` 时按**当时**量到的尺寸做一次，而紧凑态 40px ↔ 展开态 ~396px 差一个数量级（实测 `bottom 916 > 720`），指令 textarea 还能被用户拖高。修复在 **mount 层**（不动 props/协议）：`mount-card.tsx` 对 `container` 挂 `ResizeObserver` → `clampOffset()` + `applyOffset()`，`unmount()` 里 disconnect。移动宿主不会改变 container 的尺寸，所以不会自激。
2. **面板切了暗色，已打开页面上的卡片仍是亮色** —— prefs 只在 connect 时 hydrate 一次，而面板是另一个 JS 上下文且是唯一写入方。修复在 `content/index.ts`：抽出 `applyStoredPrefs()`（connect 路径与实时路径共用），并新增 `chrome.storage.onChanged` 监听（只对 `areaName === "local"` 生效）。

- 验证：`pnpm build/test/typecheck/lint` 全绿，**373 例**（extension 105 → **150**：icons 28 / tokens 3 / EditorCard 重写 10 / mount-card +1 / content +1 / rows & ScrubInput 断言未改仍通过）；**mutation check 4 次全部如期杀死**（默认态硬写成 `"compact"` → 展开态用例失败；去掉麦克风 `disabled` → 麦克风用例失败；`card.css` 改一个令牌名 → `tokens.test.ts` 失败；注释掉 observer 里的 `clampOffset()` → 新增的重 clamp 用例失败，报 `translate(312px, 700px)` ≠ `translate(312px, 372px)`）。
- 真机浏览器 `.playwright-mcp/verify-codex-card-ui.mjs` **62/62 断言全过**：新选取 `#boxA` → 紧凑态（徽章/标签/单行输入/禁用麦克风/圆形 ✓ 都在，整卡在视口内）→ 输入一句话 + ✓ → 气泡「1」+ 面板 `Preview · 1`；点气泡 → 展开、改动行高亮且 `inView`；按标签定位「高」滑块 → 断言 `inBody && grabbable` → 真实鼠标拖 +40px → 80→120px → 双击行内 input 填 140 + Enter → 140px；三个边角元素（`#boxRight` / `#boxBottom` / `#boxCorner`）紧凑态放置 + 必要时翻边，**展开后**断言仍在视口内、保存按钮命中卡片宿主、不遮住目标元素；亮/暗两套主题各采样卡片与面板图标，断言 `fill === currentColor` 且暗色下没有 `rgb(0, 0, 0)`（图标随主题变色，不是死黑）。
- **踩坑记录（本轮 5 条 ❌ 里有 3 条是探针自己的错、2 条是真 bug）**：① 徽章探针用 `[data-drag-handle]`，但那个属性在紧凑态挂在徽章上、展开态挂在拖拽把手上 → 改为 `[class*="bg-accent-text"]` 并把 `dragHandle` 单独回报；② `input[class*="ring-accent-text"]` 也会命中 `TextRow`（它的 `focus-visible:ring-accent-text/50`），`.first()` 在 DOM 序里是间距行 → 140 被打进间距、多出一条 change；改用**行级定位** `div:has(> span[title="高"]) input`；③ 拖动前不检查目标是否真的可点 → 「高」滑块的 rect 在 320px body 底边下 3px，鼠标落在 footer 上，于是三条拖动断言全红而产品没错；现在每次拖动前都按标签滚进可视区并断言 `inBody && grabbable`；④ 主题探针读卡片宿主的 `dark` class，但切主题时根本没有卡片打开 → 永远 false，「亮色」那组采样其实没被强制成亮色；改为按面板按钮的可访问名（`主题：亮色（点击切换）`）驱动。**教训强化版：断言前先证明探针指向的确实是那个东西、且那个东西真的可被用户点到——否则失败里混着自己的 bug，会把对的实现改坏。**
- 已知遗留：`mount-card.test.tsx` 的 `act(...)` 警告是既有噪声，本轮未动。

**编辑卡后续优化（2026-09-04）**

用户针对上一轮交付提出两点小优化：

1. **卡片层级/投影 + 页面背景反差**：编辑卡之前容易融入页面背景。现在卡片主题由**页面背景 luminance** 决定（`mount-card.tsx` 读取 `document.body` 背景色），浅色页面 → 暗色卡片，深色页面 → 亮色卡片；Side Panel 主题只控制面板自身，不再决定卡片。同时保留 `shadow-2xl` + `ring-1 ring-black/[0.06] dark:ring-white/[0.08]` 增强层级。
2. **已改动属性行增加 reset 按钮**：对 `changedProperties` 里的属性，在属性行右侧显示一个还原图标（UndoIcon），点击后回滚该属性到原始值，并立即移除该行的 `data-changed` 高亮。`StyleEditApi` 新增 `revertStyle(property | property[])`；`StagingEngine` 新增 `unstage(property)` 防止回滚后保存又把旧值 commit 进去。基本行（ScrubField/TextRow/ColorRow/SegmentRow）和复合行（AlignmentControl/AxisScrub）都接上了 reset。

- 验证：`pnpm build/test/typecheck/lint` 全绿，**373 例**（extension 150 → **154**：EditorCard +2 / rows +2；inspector **119**：新增 `StagingEngine.test.ts` 2 例）。
- 真机浏览器 `.playwright-mcp/verify-codex-card-ui.mjs` **62/62 断言全过**。

**编辑卡 UI 细节打磨（2026-09-04）**

用户针对当前交付提出四点 UI 细节打磨：

1. **去掉「未保存」文字徽章**：紧凑态未保存时改为 `SettingsIcon` 设置图标，同时保留拖拽把手；展开态头部也去掉 tag name pill，改为同一设置图标。紧凑态 padding 增加到 `py-2.5 px-2`。
2. **展开态用 icon 替 tag**：`EditorCard` 展开 header 不再显示元素标签名，只保留设置图标 + 序号徽章（如有）。
3. **减少属性模块拥挤**：`StylePanel` 行间距从 `space-y-0.5` 加大到 `space-y-1`；`GroupHeader` 上间距从 `mt-2.5` 加大到 `mt-4`；`Row` 增加 `py-0.5 px-1` 内边距，让左右内边距更舒展。
4. **属性行点击激活 + 即时 reset**：
   - 行容器增加 `focus-within:ring-1 focus-within:ring-accent-text/30`，点击输入框时整行出现边框高亮。
   - `ScrubInput` 拖拽态和 focus 态 ring 从 `ring-1` 增强到 `ring-2`；`TextRow`、`ColorRow`、`SegmentRow` 的 focus/active ring 同步增强。
   - `StyleEditApi` 新增 `dirty: ReadonlySet<string>` 追踪当前编辑会话中的改动；`Row` 接收 `dirty` prop，对 `changed || dirty` 都显示 reset 按钮，调用 `revertStyle` 回滚。

- 验证：`pnpm build/test/typecheck/lint` 全绿，**375 例**（protocol 26 / inspector 119 / bridge 74 / extension 156），rows 新增 1 例 dirty reset。
- 真机浏览器 `.playwright-mcp/verify-codex-card-ui.mjs` 断言「紧凑态显示『未保存』徽章」改为「紧凑态用设置图标替代『未保存』徽章」，**62/62 断言全过**。

**编辑卡交互修正 + 影子样式修复（2026-09-04）**

用户验收上一轮后报了「三个重大错误」+「一个最大的 bug」。（上一轮的第 1/2 条——用 `SettingsIcon` 替代「未保存」徽章——被用户明确否决：「我不要设置 icon，是去掉这个功能」。）

1. **「还没做出更改就出现了重置 icon」**：reset 的门槛是 `changed || dirty`，而 `dirty` 之前把**空操作**也算进去了。三处收紧：`ScrubInput.endDrag` 在释放 pointer capture 之后 `if (next === startValue) return`（同点按下抬起不算改动）、方向键撞到 `min/max` 不再 commit、双击输入原值回车不 commit；`SegmentRow` 点已选中项直接 return。补 4 例测试（`ScrubInput.test.tsx` 3 例空操作 + `rows.test.tsx` 1 例 segment 空点击）。
2. **「把 div、span 这类的改成属性 icon，用它控制底部属性展开/收起；右边的收起箭头也不需要」**：新增 `SlidersIcon`（Remix `equalizer-line`），删掉 `SettingsIcon` 与 `ChevronUpIcon`；`EditorCard` 抽出 `PropertiesToggle`（`aria-label` 展开/收起 + `aria-expanded`，开启时 `bg-accent-text/15` 着色），紧凑态与展开态头部各挂一个，展开态右侧的收起箭头按钮整块删除 → 头部只剩 1 个按钮。`tagName` 从 `EditorCardProps`、`mount-card`、`content/index.ts` 的 `openEditorCard` 一路删干净（4 个测试 fixture 同步）。
3. **「选中没有激活状态（添加高亮 border）」**：`Row` 改用 React state 记 active——`onFocusCapture` 置真、`onBlurCapture` 里判断 `relatedTarget` 是否还在本行内（行内焦点迁移不算失焦），行容器打 `data-active="true"` + `ring-2 ring-accent-text/60` + 底色 `bg-accent-text/[0.07]`，标签色从 `text-faint` 提到 `text-text`。补 3 例（`rows.test.tsx`：focusIn 出现 / 行内迁移不丢 / focusOut 清除；React 19 下必须用 `fireEvent.focusIn/focusOut`，`focus/blur` 不冒泡）。
4. **「修改了属性未保存前，我重置回去，然后保存居然会出现注释气泡」**：`content/index.ts` 的 `onRevert` 原本是「先查 ChangeTracker，没记录就 return」——未保存的编辑只存在于 staging 会话里，于是 reset 只回滚了页面视觉，保存时 `commit()` 把那条预览值当成真改动记下来。改成**先 `stagingEngine.unstage(property)` 再查记录**。回归测试 `records no change for an unsaved edit that was reset before saving`（改字重 → 还原字重 → 改 display → 保存，断言 `preview.changed` 只带 `["display"]`）；mutation check 通过：把 `unstage` 挪回原位 → 该用例如期失败，报 `['font-weight','display']` ≠ `['display']`。

**真机验收又挖出两个此前没人看见的问题（第 3 条的断言先红，顺着查下去才发现是全局性的）**：

5. **卡片在真实浏览器里根本没有边框、没有投影、没有任何 ring**。断言 `data-active="true"` 已生效但 `getComputedStyle().boxShadow === "none"`；再量卡片本体：`border: 0px none`（`border-edge` 的颜色是对的，宽度/样式没了）、`box-shadow: none`（`shadow-2xl` + `ring-1` 全废）、改动行的 `border-l-2` 强调条也不可见。根因：Tailwind v4 把这些工具类编译成 `border-style: var(--tw-border-style)` / `box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)`，**工具类只声明自己那一个变量，其余全靠 `@property` 的 initial-value**；而 card.css 是 `adoptedStyleSheets` 进 shadow root 的，Chrome 不注册来自 shadow tree 样式表的 `@property`（实测 shadow 内 `getPropertyValue('--tw-border-style')` 为 `""`，同一份规则放 document 里就能读到 `solid`）→ 变量 guaranteed-invalid → 整条声明在计算值阶段失效。Tailwind 自带的同值 fallback 被 `@supports` 查询挡在 Safari/Firefox，Chrome 拿不到。修复：在 `card.css` 用 `@layer base { *, ::before, ::after, ::backdrop { … } }` 无条件补上那 42 个 `--tw-*` 初值（base 层在 utilities 之前，工具类仍能按元素覆盖）。**此前几轮的「层级/投影增强」「focus ring 增强」「改动行左边条」其实一个都没画出来**——类名全对，视觉全无。
6. **边框画出来之后卡片高了 2px（紧凑态 48 → 50），把 `placement.ts` 的老毛病顶了出来**：贴视口底边的元素（真机 `#boxCorner`，top=664 / bottom=720）在四个候选位上都被「另一轴超出 8px margin」整体否决（左侧候选 y=664 > maxY=662，差 2px），最后回落到 clamp 后的首选位，**卡片正好压在元素上**（952..1272 vs 元素 1132..1272）。改为只用「选边那一轴」判定放不放得下、另一轴 clamp，卡片沿视口边滑动；补 2 例 `placement.test.ts`（贴底角落元素翻到左侧且 y 被 clamp；卡片接近视口宽时下方候选向左滑）。

- 验证：`pnpm build/test/typecheck/lint` 全绿，**385 例**（protocol 26 / inspector 119 / bridge 74 / extension **166**：EditorCard 21 / mount-card 9 / placement 9 / rows +4 / ScrubInput +3 / content +1）。
- 真机浏览器 `.playwright-mcp/verify-codex-card-ui.mjs` **78/78 断言全过**，本轮新增：卡片本体「真的画出 1px solid 边框 + 投影」、改动行「左边条 2px solid」、单击属性行「画出 2px 高亮 ring」（并断言 ring 的 spread 是 2px，`!== "none"` 太松）、只选中不改动 →「无 reset / 保存禁用 / 页宽不动」、拖动 → reset 出现 → 点 reset →「页宽回原值 / reset 消失 / 保存回禁用」→ 改一句指令再保存 →「气泡仍是 `["1"]` / 面板 `Preview · 1` / 宽度保持」、展开态「头部只有 1 个按钮」、紧凑态「没有 tag 名文字」。
- **教训（本轮最贵的一条）：类名对 ≠ 画出来了。** 在 shadow root + Tailwind v4 这个组合下，`border`/`shadow`/`ring`/`tabular-nums` 整族静默失效了好几轮，jsdom 不做布局与层叠所以单测永远绿，只有真机读 computed style 才看得见。验收脚本从此对视觉断言一律量「画出来的东西」（computed border/box-shadow），而不是 class 或 `data-*`。

**属性控件收敛 + 二次保存修复（2026-09-04）**

用户带着两张截图验收上一轮，提了三条：「图一默认状态不要高亮，只需要调节参数控件高亮」「图二这类型的一律换成下拉隐藏选择」「回过头来查看注释面板，重置参数没法进行二次保存了」。

1. **默认态零高亮**：截图里字重段选把当前值 `400` 圈在紫色圆角块里、行高字段带一圈紫边——**设计师什么都没动**，卡片里已经有三四处强调色。三处收敛：`Row` 的激活态从 `ring-2 ring-accent-text/60` + `bg-accent-text/[0.07]` 改成中性的 `bg-inset-deep` + `ring-1 ring-edge-strong`（标签也不再提到 `text-text`）；`ScrubInput` / `TextRow` / `ColorRow` / `SelectRow` 的 `focus-visible:` 全换成 `focus:`（滑块是 `div[role=slider]`，Chrome 对非文本元素上的鼠标点击不匹配 `:focus-visible`，正是「点了没反应」的原因）；`card.css` 的 `:host` 补 `color-scheme`，让原生 `<select>` 弹层跟随卡片明暗。强调色现在只有两个来源：**正在被调的那个控件**、**上一步已改动的行**。
2. **单值属性一律折叠下拉**：`SegmentRow`（显示 / 方向 / 换行 / 字重 / 对齐）全部换成 `SelectRow` 的原生 `<select>`，收起后一行一格；`SegmentRow` 组件删除。`SelectRow` 在页面真值不在候选列表时把真值插到第一项——`text-align: start`、`display: inline`、`font-weight: 300` 都会出现，而 `<select>` 匹配不到 option 时静默显示第一项，等于当面撒谎。
3. **「重置已保存属性后无法二次保存」**：`content/index.ts` 的 `onRevert` 上一轮为了修「reset 后保存仍出气泡」改成了「先 `unstage` 再查记录」，把另一条路堵死了——重开注释面板重置一个**已保存**的属性时，记录还在 ChangeTracker 里，`unstage` 只撤掉预览，`EditorCard.canSave` 看的 `dirty` 是空的 → 保存永久禁用。改成**查到记录就 `stage(element, property, change.previousValue)`（撤销本身成为本次会话的改动），查不到才 `unstage`**；`EditorCard` 的 `canSave` 读原始 `dirtySet`，而传给 `rows` 的 `dirty` 仍是「减去 `reverted`」的（重置按钮该消失，保存该能点）。

- 验证：`pnpm build/test/typecheck/lint` 全绿，**388 例**（protocol 26 / inspector 119 / bridge 74 / extension **169**）。
- 真机浏览器 `.playwright-mcp/verify-codex-card-ui.mjs` **106/106 断言全过**，本轮新增两段：**Section I**（`#boxRight` 展开态）5 个下拉行「行内 0 个按钮 / 行高与数值行一致 / 候选 ≥2 且关闭时 option 不绘制 / `对齐` 报出页面真值 `start` 并插在首位」、空闲态整个属性区**零处强调色**、所有下拉都不含强调色、滑块「点击前无强调色 → 点击后是属性区唯一的强调色命中」、焦点移到字体输入框后「命中只剩那个 input、滑块回到无」、下拉改值 → 出现 `还原 显示` + 保存可用 → 取消丢弃；**Section J**（二次保存）改高度 → 保存（气泡 `["1","2"]`、`Preview · 2`）→ 重开气泡 2 → 点 `还原 高`（立刻 60px、**保存可用**、重置按钮消失、计数仍 `Preview · 2`）→ 取消（100px 回来、气泡 2 还在）→ 再开再重置 → **`保存` 点得到且可用** → 保存（60px、气泡回落 `["1"]`、`Preview · 1`）。
- **两次 mutation check 都杀红了预期的断言**：把 `canSave` 改回读过滤后的 `dirty` → jsdom 恰好 1 例失败（`keeps 保存 usable after resetting a change that was already saved`）；把**构建产物**拷到 `/tmp/ui-tuner-mutant-dist` 里改掉 SelectRow 的真值 prepend 与行激活态的中性色（不动仓库源码，靠脚本新加的 `EXT_DIST` 环境变量加载）→ 真机恰好 4 条断言失败（102/106），其余全过。
- **教训（脚本层，两条都花了不少时间）**：① **Chrome 把 Tailwind 的透明度修饰符颜色序列化成 `oklab(0.811153 0.0405392 -0.0928167 / 0.7)`**，不是 `rgba(196, 181, 253, 0.7)`——用子串匹配 `--accent-text` 的 RGB 分量判「有没有画出强调色」会整片漏检（首轮 4 条假失败）。改成用 1×1 canvas 把候选颜色与 host 的 `--accent-text` 都绘出来比字节。② **canvas 在低 alpha 下反预乘会漂移**（10% 强调色 g 181 → 177），首轮 mutation 只杀掉 2/4；改成拿**预乘**字节与「按候选自己的 alpha 重绘的强调色」比（alpha 字节是精确存的）才对。从此脚本里「量颜色」一律走这个 `ACCENT_PROBE`。

**行激活态移除 + 点击外部关闭（2026-09-04）**

用户带着两张截图验收：「图1激活属性框为啥背后出现边框，我只需要属性的那个控件激活」「图2当前状态我无法退出这个面板，codex做法是点击面板以外的区域取消面板（也就是说激活面板，鼠标不能再hover页面任何元素）」。

1. **行激活态彻底移除**：上一轮把行激活态从强调色改成中性色（`bg-inset-deep ring-1`），但用户截图显示行容器仍有一圈可见边框。24px 的行里外两圈 ring 读成一坨，而且「哪一行被点过」和「哪一个值被我改过」在视觉上必须分开。`Row` 组件删掉 `useState(active)` / `data-active` / `onFocusCapture` / `onBlurCapture` / 条件 className 分支，对应 3 例 jsdom 测试也删除。高亮现在只有两个来源：**控件自身的 `focus:` ring**（正在调的控件）、**`border-l-2 border-accent-text`**（已改动的行）。
2. **点击外部关闭编辑卡（Codex 风格）**：`mount-card.tsx` 在 `show()` 时挂 `window` capture 阶段的 `mousedown` + `click` handler。`mousedown` 检测 `composedPath()` 不含 card container 即同步调 `onDismiss`（rollback + hide）；`click` handler 用 `stopPropagation` 阻止 picker 的 document-capture click handler 选中元素。关闭后**延迟 200ms 才摘 handler**——同一物理点击的 mousedown 关掉卡片后，click 还会来，不挡就会触发 picker 选中点击位置的元素。
3. **卡片打开期间 picker 完全停止**：`content/index.ts` 的 `openEditorCard` 在 `show()` 前检查 `picker.isEnabled`（`wasPicking`），运行中就 `picker.stop()` + `overlay.setHover(null)`。关闭时四条路径（save/cancel/delete/dismiss）都用 `wasPicking` 标记决定是否 `startPicking()`。从气泡打开的卡（picker 本就未运行）关闭后不重启 picker。`EditorCardProps` 新增 `onDismiss(): void`。

- 验证：`pnpm build/test/typecheck/lint` 全绿，**385 例**（protocol 26 / inspector 119 / bridge 74 / extension **166**）。

**编辑卡对齐 Codex UI：属性精简 + 指令移到头部（2026-09-04）**

用户带着三张 Codex 截图验收：「codex 就保留了这个常规的属性调整，我们也对齐一样。因为你现在是把该元素所有的 css 属性都搬过来了，有一些属性根本没法调，不太合理」「图 2 和 3 是单文字描述以及展开属性面板的状态，我需要你对齐他的 UI,包括内容、排版布局，交互方式」。

1. **属性列表精简到 17 项**：`StylePanel.tsx` 删掉所有 `GroupHeader` 分组结构（Layout/Size/Spacing/Typography/Fill/Border/Effects），扁平排列 Codex 截图里的 17 项常用属性：文本颜色、背景、Opacity、字体、字号、字重、边框圆角半径、边框颜色、边框宽度、宽度、高度、内边距、外边距、布局方向、分布、居中、间距。删除 `display`/`position`/`min-width`/`min-height`/`max-width`/`max-height`/`line-height`/`letter-spacing`/`text-align`/`background-image`/`border-style`/`box-shadow`/`transform`/`grid-template-columns`/`grid-template-rows`/`flex-wrap`/`row-gap`/`column-gap` 等不常用或不可调的属性。`AlignmentControl` 3×3 网格组件删除，`justify-content` 和 `align-items` 改为独立 `SelectRow`。`font-family` 从 `TextRow` 改为 `SelectRow`（4 个常用字体栈选项）。Flex 相关属性（flex-direction/justify-content/align-items/gap）仅在 `display: flex` 时条件渲染。
2. **指令移到头部**：`EditorCard.tsx` 展开态的指令从 body 的 `<textarea>` 移到 header 的 `<input>`（单行），位于 ⚙ 属性开关右侧、拖拽把手左侧。元素标签名作为副标题显示在头部下方（仅当指令存在时）。紧凑态保持原样：⚙ + 指令 input + 提交按钮。`EditorCardProps` 新增 `tagName?: string`，`content/index.ts` 的 `openEditorCard` 传入 `tagName: element.tagName.toLowerCase()`。
3. **测试同步更新**：`EditorCard.test.tsx` 把所有检查「布局」分组标题的断言改成检查「文本颜色」属性标签（属性面板存在的标志）；`mount-card.test.tsx` 把检查 `TEXTAREA` vs `INPUT` 的断言改成检查属性面板内容；`content/index.test.tsx` 把 `font-family` 的 `rowControl` 从 `"input"` 改成 `"select"`，把测试用的 `display` 属性改成 `font-family`（display 已从属性列表删除）；所有「还原 高」改成「还原 高度」（新标签）。

- 验证：`pnpm build/test/typecheck/lint` 全绿，**385 例**（protocol 26 / inspector 119 / bridge 74 / extension **166**）。

## 7. 项目状态：核心闭环完成，`feat/ui-ux-polish` 待推送 + 待合并决策

核心闭环 **Select → Tune → Prompt → Apply to Code** 已端到端打通并多轮真机验收（M8、注释模式、页面编辑卡）。无后续里程碑，剩余为 backlog 增强项。

**下一步待用户决策（截至 2026-09-04）**：
1. `feat/ui-ux-polish`（47 commits）**从未推送**，无 upstream。推送需代理：`HTTPS_PROXY=http://127.0.0.1:7892 git push -u origin feat/ui-ux-polish`（`docs/superpowers/plans/2026-09-02-annotation-mode.md` Task 7 Step 2 就是这一步）。
2. 合并到 `main` 的决策（PR 还是直接 merge）尚未做。
3. `docs/architecture.md` 未同步注释模式 + 页面编辑卡（仍写三 Tab 面板与 `sidepanel.stylePreview`）；下次动架构文档时一并补。

**注意**：顺延项都在 `docs/backlog.md`（Next App Router 适配、数据驱动文本索引、索引缓存、HMR 跨刷新持久化 §37、颜色 alpha、CLI npm 发布、codex MCP 免 bypass flag、ui_capture 元素级裁剪、**编辑卡内 Esc 只关卡片**、**编辑卡语音输入**（麦克风目前是禁用占位））。

## 8. 新会话启动模板（计划 §52）

```txt
Read UI_TUNER_EXECUTION_PLAN.md 和 docs/handover.md.

Milestone N-1 is complete.

Now implement only Milestone N.

Before editing:
1. inspect the existing implementation;
2. reuse existing architecture;
3. identify any mismatch with the execution plan.

After editing:
1. run typecheck; 2. run tests; 3. run build;
4. summarize changed files; 5. list remaining risks;
6. do not start the next milestone.
```
