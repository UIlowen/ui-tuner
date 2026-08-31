# UI Tuner — Codex 可执行开发计划

> 目标：开发一个面向 AI Coding / Vibecoding 场景的 Chrome UI 调整插件。  
> 核心闭环：**Select → Tune → Prompt → Apply to Code**。

---

## 0. 项目目标

UI Tuner 是一个 Chrome Extension + Local Bridge + MCP Server 组合工具。

用户可以在本地运行的 React / Next.js / Vite Demo 页面中：

1. 直接点击真实 DOM 元素。
2. 在 Chrome Side Panel 中查看该元素的 UI 参数。
3. 通过数值输入或 Scrub Input 实时修改样式。
4. 修改仅作用于浏览器 Preview，不立即修改源码。
5. 将当前元素、源码位置、样式、调整记录和自然语言需求发送给 Coding Agent。
6. Agent 修改真实源码。
7. Vite / Next.js HMR 刷新页面。
8. 插件重新定位元素并展示修改结果。
9. 用户可以 Accept / Revert。

---

# 1. MVP 边界

## 1.1 V0.1 必须支持

### 项目类型

- React
- Next.js
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui

### 浏览器

- Chrome
- Manifest V3

### 页面环境

V0.1 只支持本地开发环境：

```txt
http://localhost/*
http://127.0.0.1/*
```

不优先支持生产环境网页。

### Agent

优先支持：

- Codex
- Claude Code
- Cursor

Agent 接入统一通过 Local Bridge / MCP Adapter。

---

## 1.2 V0.1 暂不支持

以下功能不要在第一阶段实现：

- Figma Import
- AI 自动生成完整页面
- Vue
- Svelte
- Angular
- Animation Editor
- 完整 Grid Editor
- 自由拖拽布局
- Production CMS
- Design System 自动生成
- Responsive 自动设计
- iframe 深度编辑
- Shadow DOM 深度编辑
- 多页面视觉回归系统
- 云端账号体系
- 登录
- 团队协作

如开发中发现上述需求，请记录到 `docs/backlog.md`，不要扩展当前 Scope。

---

# 2. 产品核心原则

## 2.1 Browser 负责 Preview

Chrome Extension 负责：

- Element Picker
- Hover Highlight
- Element Selection
- DOM Context
- Computed Style
- Style Inspector
- Live Preview
- ChangeSet
- Screenshot
- Source Metadata 展示
- Agent Prompt UI

---

## 2.2 Agent 负责 Source Change

Agent 负责：

- 理解用户意图
- 判断真实源码实现位置
- 修改 TSX / JSX / CSS / Tailwind
- 避免生成不必要的 inline style
- 判断组件 / Variant / Design Token
- 保持项目原有代码风格
- 保存文件
- 返回修改结果

Chrome Extension 不负责直接重写项目源代码。

---

## 2.3 Preview Change 和 Source Change 必须隔离

定义两类修改：

```ts
type ChangeType =
  | "preview"
  | "source";
```

### Preview Change

只存在浏览器。

示例：

```txt
gap
24px → 16px
```

### Source Change

已经由 Agent 修改真实源码。

示例：

```diff
- className="grid gap-6"
+ className="grid gap-4"
```

---

# 3. 技术栈

## 3.1 Monorepo

使用：

```txt
pnpm
Turborepo
TypeScript
```

---

## 3.2 Chrome Extension

使用：

```txt
React
TypeScript
Vite
Manifest V3
Chrome SidePanel API
Chrome Scripting API
Zustand
Radix UI
Tailwind CSS
```

---

## 3.3 Local Bridge

使用：

```txt
Node.js
TypeScript
WebSocket
MCP SDK
```

---

## 3.4 测试

使用：

```txt
Vitest
Playwright
```

---

# 4. Repo 结构

初始化如下：

```txt
ui-tuner/

apps/

  chrome-extension/
    src/
      background/
      content/
      sidepanel/
      overlay/
      messaging/
      state/
      styles/

  bridge/
    src/
      server/
      websocket/
      mcp/
      agents/
      project/
      source/
      changes/

packages/

  protocol/
    src/

  inspector/
    src/
      picker/
      overlay/
      dom/
      measurement/
      styles/

  change-set/
    src/

  source-resolver/
    src/
      react/
      next/
      vite/

  ui/
    src/

  shared/
    src/

examples/

  react-vite/

  next-tailwind/

  next-shadcn/

docs/

  architecture.md
  protocol.md
  backlog.md
  testing.md

package.json
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
```

---

# 5. 第一阶段：项目基础设施

## Task 1.1 初始化 Monorepo

完成：

- pnpm workspace
- Turborepo
- TypeScript
- ESLint
- Prettier
- Vitest
- shared tsconfig

验收：

```bash
pnpm install
pnpm build
pnpm test
```

全部正常。

---

## Task 1.2 创建 Chrome Extension

Manifest V3。

需要：

```json
{
  "manifest_version": 3,
  "permissions": [
    "activeTab",
    "scripting",
    "sidePanel",
    "storage"
  ]
}
```

仅针对 localhost 开发环境设置 host permissions。

实现：

- background service worker
- content script
- side panel
- messaging layer

验收：

1. Chrome 可加载 unpacked extension。
2. 打开 localhost 页面。
3. 点击扩展可以打开 Side Panel。
4. Side Panel 可以和 Content Script 双向通信。

---

# 6. 第二阶段：Element Picker

## Task 2.1 Hover Element

开启 Edit Mode 后：

```txt
mousemove
↓
elementFromPoint()
↓
获取 HTMLElement
↓
绘制 Overlay
```

Overlay 必须显示：

- 边框
- Element tag / component name
- width
- height

例如：

```txt
Button
120 × 40
```

---

## Task 2.2 Overlay

Overlay 必须使用独立层，不修改目标 DOM。

建议：

```txt
ui-tuner-overlay-root
```

要求：

- pointer-events: none
- position: fixed
- z-index 足够高
- 不影响页面布局
- 页面滚动后位置正确
- resize 后位置正确

---

## Task 2.3 Select Element

点击元素后：

```ts
interface SelectedElement {
  id: string;
  tagName: string;
  selector: string;
  boundingRect: BoundingRect;
}
```

需要锁定当前元素。

按：

```txt
Esc
```

取消。

---

## Task 2.4 Parent Selection

实现：

```txt
⌘ + ↑
```

选择 Parent Element。

结构：

```txt
Text
↑
Button
↑
CardFooter
↑
PricingCard
```

Side Panel 显示 Breadcrumb。

---

## Task 2.5 Multi Select

MVP 后半段实现：

```txt
Shift + Click
```

可添加多个 Selection。

限制：

```txt
max selections = 10
```

---

# 7. 第三阶段：Element Context

## Task 3.1 DOM Snapshot

不要发送完整页面。

只抓：

```txt
selected element
parent
children
必要 sibling
```

结构：

```ts
interface DomSnapshot {
  outerHTML: string;
  parentHTML?: string;
  childrenHTML?: string[];
}
```

设置长度限制。

例如：

```txt
MAX_HTML_LENGTH = 12000
```

超出截断。

---

## Task 3.2 Computed Style

只保留设计相关属性。

创建白名单：

```ts
const STYLE_PROPERTIES = [
  "display",
  "position",

  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",

  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",

  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",

  "gap",
  "row-gap",
  "column-gap",

  "flex-direction",
  "justify-content",
  "align-items",
  "flex-wrap",

  "grid-template-columns",
  "grid-template-rows",

  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "color",

  "background-color",
  "background-image",

  "border-width",
  "border-color",
  "border-style",
  "border-radius",

  "box-shadow",
  "opacity",

  "transform"
];
```

不要直接发送完整 `getComputedStyle()`。

---

# 8. 第四阶段：Style Inspector

Side Panel 第一版包含三个 Tab：

```txt
Style
Agent
Changes
```

默认：

```txt
Style
```

---

# 9. Style Inspector 信息架构

## 9.1 Element Header

显示：

```txt
PricingCard

src/components/PricingCard.tsx:42

div > section > PricingCard
```

状态：

```txt
Source linked
Source inferred
Preview only
```

---

## 9.2 Layout

支持：

```txt
Display

Flex
Grid
Block
Inline
```

Flex：

```txt
Direction
Row
Column

Alignment

3 × 3 alignment control

Wrap

Gap
```

---

## 9.3 Size

支持：

```txt
Width
Height

Min Width
Min Height

Max Width
Max Height
```

数值类型：

```ts
type CssDimension =
  | number
  | "auto"
  | "fit-content"
  | "max-content"
  | string;
```

---

## 9.4 Spacing

支持：

```txt
Padding
Margin
Gap
```

Padding 两种模式：

### Simple

```txt
Vertical
Horizontal
```

### Advanced

```txt
Top
Right
Bottom
Left
```

---

## 9.5 Typography

支持：

```txt
Font Family
Font Weight
Font Size
Line Height
Letter Spacing
Text Align
Color
```

---

## 9.6 Fill

支持：

```txt
Background Color
Opacity
```

V0.1 Gradient 只读。

---

## 9.7 Border

支持：

```txt
Border Width
Border Color
Border Radius
```

---

## 9.8 Effects

V0.1 支持：

```txt
Box Shadow
Opacity
```

---

# 10. Scrub Input

这是 P0 功能。

组件：

```txt
ScrubInput
```

API：

```ts
interface ScrubInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onPreview(value: number): void;
  onCommit(value: number): void;
}
```

交互：

```txt
Drag
±1

Shift + Drag
±10

Option + Drag
±0.1

ArrowUp
+1

ArrowDown
-1

Shift + Arrow
±10

Double Click
进入文本输入
```

拖动期间：

```txt
只触发 onPreview
```

鼠标释放：

```txt
触发 onCommit
```

---

# 11. Preview CSS Engine

不要直接：

```js
element.style.xxx = value
```

使用独立 CSS Override。

选中元素注入：

```html
data-ui-tuner-id="ut-000001"
```

创建 style：

```html
<style id="ui-tuner-preview-style">
</style>
```

生成：

```css
[data-ui-tuner-id="ut-000001"] {
  gap: 16px !important;
  padding-top: 20px !important;
}
```

---

# 12. ChangeSet 数据模型

建立：

```ts
interface StyleChange {
  id: string;

  elementId: string;

  property: string;

  previousValue: string;

  nextValue: string;

  source: "manual" | "agent";

  createdAt: number;
}
```

ChangeSet：

```ts
interface ChangeSet {
  id: string;

  pageUrl: string;

  elementIdentity: ElementIdentity;

  changes: StyleChange[];
}
```

---

# 13. Changes Tab

展示：

```txt
Changes

Preview · 3

Button

Height
40 → 36

Padding X
16 → 12

Radius
8 → 6

Revert
```

底部：

```txt
Reset All

Apply 3 Changes
```

---

# 14. Undo / Revert

V0.1 至少实现：

```txt
Revert single property
Revert element
Reset all preview changes
```

完整 Undo Stack 可以放 P1。

---

# 15. 第五阶段：Local Bridge

运行：

```bash
npx ui-tuner
```

启动：

```txt
localhost:47321
```

输出：

```txt
UI Tuner

✓ Project detected
  Next.js

✓ Root
  /Users/.../project

✓ Dev server
  http://localhost:3000

✓ Chrome connected

✓ MCP server ready
```

---

# 16. Chrome ↔ Bridge

使用：

```txt
WebSocket
```

定义共享 Protocol。

---

# 17. Protocol

放到：

```txt
packages/protocol
```

消息结构：

```ts
type UiTunerMessage =
  | SelectionChangedMessage
  | PreviewChangedMessage
  | ApplyChangesMessage
  | AgentRequestMessage
  | AgentResultMessage
  | SourceResolvedMessage;
```

---

## Selection Changed

```ts
interface SelectionChangedMessage {
  type: "selection.changed";

  payload: ElementContext;
}
```

---

## Preview Changed

```ts
interface PreviewChangedMessage {
  type: "preview.changed";

  payload: ChangeSet;
}
```

---

## Apply Changes

```ts
interface ApplyChangesMessage {
  type: "changes.apply";

  payload: {
    context: ElementContext;
    changeSet: ChangeSet;
  };
}
```

---

# 18. ElementContext

统一数据模型：

```ts
interface ElementContext {
  page: {
    url: string;

    viewport: {
      width: number;
      height: number;
    };
  };

  element: {
    id: string;

    tagName: string;

    selector: string;

    text?: string;

    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };

  component?: {
    name?: string;

    source?: {
      file: string;
      line?: number;
      column?: number;
    };
  };

  styles: Record<string, string>;

  dom?: DomSnapshot;

  screenshot?: string;
}
```

---

# 19. 第六阶段：Source Resolver

目标：

```txt
DOM
↓
Component
↓
Source File
↓
Line / Column
```

优先方案：

- React source metadata
- Source Map
- framework adapter
- element-source 类能力

Source 状态：

```ts
type SourceConfidence =
  | "exact"
  | "inferred"
  | "unknown";
```

---

# 20. Source UI

如果精准：

```txt
Button

button.tsx:42

● Source linked
```

如果推测：

```txt
Button

Possible:
button.tsx

● Source inferred
```

无法定位：

```txt
Button

● Preview only
```

不能伪造源码位置。

---

# 21. Element Identity

不要只保存 HTMLElement 引用。

创建：

```ts
interface ElementIdentity {
  uiTunerId: string;

  sourceFile?: string;

  sourceLine?: number;

  componentName?: string;

  selector?: string;

  textFingerprint?: string;

  domFingerprint?: string;
}
```

---

# 22. HMR 后重新定位

React HMR 后 HTMLElement 会失效。

重新匹配优先级：

```txt
1. source location
2. component name
3. stable selector
4. DOM path
5. text fingerprint
6. geometry proximity
```

如果重新匹配失败：

Side Panel 显示：

```txt
Element changed after refresh.

Reselect element
```

不要静默选择错误元素。

---

# 23. 第七阶段：Agent Tab

Agent 面板：

```txt
Context

[ PricingCard × ]

src/components/PricingCard.tsx

Screenshot

----------------

Instruction

[ textarea ]

----------------

Agent

Codex ▼

Include

☑ DOM
☑ Styles
☑ Source
☑ Screenshot
☐ Parent Tree

Send
```

---

# 24. Agent Request

默认 Context：

```txt
Level 1
```

包含：

```txt
Element
Component
Source
Computed Style
Current Preview Changes
Prompt
```

---

# 25. Context Level

定义：

```ts
type ContextLevel =
  | 1
  | 2
  | 3;
```

Level 1：

```txt
element
component
source
styles
changes
prompt
```

Level 2：

```txt
parent
children
component stack
```

Level 3：

```txt
screenshot
siblings
viewport
extra DOM
```

默认 Level 1。

避免无意义 Token 消耗。

---

# 26. Agent Prompt 组装

用户输入：

```txt
整体紧凑一点，标题不要变小
```

最终 Agent Context 应包含：

```txt
Selected Component:
PricingCard

Source:
src/components/PricingCard.tsx:42

Current relevant styles:
gap: 24px
padding: 24px
border-radius: 16px

User preview changes:
gap: 24px → 16px
padding: 24px → 20px

Instruction:
整体紧凑一点，标题不要变小
```

---

# 27. MCP Server

V0.1 只提供以下 Tools。

---

## ui_get_selection

返回：

```txt
当前选中元素 Context
```

---

## ui_get_changes

返回：

```txt
当前 Preview ChangeSet
```

---

## ui_get_context

参数：

```ts
{
  level: 1 | 2 | 3
}
```

---

## ui_capture

重新抓取：

```txt
element screenshot
viewport
DOM
style
```

---

## ui_notify_applied

Agent 修改源码完成后调用。

参数：

```ts
{
  files: string[];
  summary: string;
}
```

---

# 28. Agent 修改约束

Agent 必须遵循：

## Tailwind 项目

优先修改：

```diff
- gap-6
+ gap-4
```

禁止无必要生成：

```tsx
style={{ gap: "16px" }}
```

---

## CSS Module

优先修改现有 class。

---

## Component Library

优先保持：

```txt
variant
size
token
```

语义。

不要无必要拆掉组件抽象。

---

# 29. Apply to Code 流程

完整流程：

```txt
Preview Change
↓
Generate ChangeSet
↓
Send to Bridge
↓
Agent
↓
Resolve Source
↓
Modify Source
↓
Save
↓
HMR
↓
Extension detects DOM refresh
↓
Re-identify Element
↓
Remove matching Preview Override
↓
Compare
↓
Applied
```

---

# 30. Apply Dialog

点击：

```txt
Apply to Code
```

显示：

```txt
Apply Changes

PricingCard

4 visual changes

Scope

● This instance

○ Component

Agent

Codex

Cancel

Apply
```

V0.1：

```txt
This instance
Component
```

Variant Scope 放 P1。

---

# 31. Apply Result

成功：

```txt
✓ Applied

4 changes

src/components/PricingCard.tsx

View Diff
Revert
```

失败：

```txt
Unable to apply changes

Reason:
Source could not be resolved.

Preview changes are still active.

Retry
```

---

# 32. Screenshot

支持：

```txt
Selected Element Screenshot
```

第一版只在用户 Agent Context 勾选 Screenshot 时抓取。

不要每次 Select 都截图。

避免性能损耗。

---

# 33. 性能要求

Element Hover：

```txt
目标 >= 30fps
```

不要在 mousemove 中：

- serialize 大量 DOM
- screenshot
- 读取全部 computed style
- 调用 Bridge

Hover 只做：

```txt
elementFromPoint
boundingClientRect
overlay render
```

Select 后才抓 Context。

---

# 34. UI 状态

Side Panel 必须明确以下状态：

```txt
Idle

Picking

Selected

Preview Modified

Applying

Applied

Apply Failed

Source Unknown

Bridge Offline

Agent Offline
```

---

# 35. Bridge Offline

如果 Bridge 未启动：

```txt
Local Bridge is not connected.

Preview editing is still available.

Run:

npx ui-tuner

Reconnect
```

用户仍可以使用 Preview。

---

# 36. Agent Offline

如果 Agent 不可用：

```txt
Agent unavailable

Preview changes are safe.

You can continue adjusting styles.
```

不要丢失 ChangeSet。

---

# 37. 浏览器刷新

页面刷新后：

保存：

```txt
ChangeSet
Selected Element Identity
```

优先使用 extension storage / in-memory tab state。

不要把大量 DOM Snapshot 持久化。

---

# 38. 安全边界

V0.1 只允许连接：

```txt
localhost
127.0.0.1
```

Bridge 默认只监听：

```txt
127.0.0.1
```

不要监听：

```txt
0.0.0.0
```

MVP 不实现远程访问。

---

# 39. Example Projects

必须创建三个验证项目。

---

## Example A

```txt
examples/react-vite
```

包含：

```txt
Card
Button
Form
Navbar
List
```

CSS：

```txt
普通 CSS / Tailwind
```

---

## Example B

```txt
examples/next-tailwind
```

测试：

```txt
Next.js App Router
Tailwind
Server Component
Client Component
```

---

## Example C

```txt
examples/next-shadcn
```

测试：

```txt
Button
Card
Dialog
Input
Tabs
```

---

# 40. 测试重点

## Unit Test

测试：

```txt
ChangeSet
Style parser
CSS value parser
Element Identity
Protocol
Source confidence
```

---

## Playwright

必须覆盖：

### Test 01

```txt
打开 React Demo
进入 Pick Mode
Hover Button
出现 Overlay
```

### Test 02

```txt
点击 Button
Side Panel 显示尺寸
```

### Test 03

```txt
Height
40 → 36

页面实时变化
```

### Test 04

```txt
Reset

恢复 40
```

### Test 05

```txt
Gap
24 → 16

Changes 显示 Change
```

### Test 06

```txt
Apply to Code

Bridge 收到 ChangeSet
```

### Test 07

```txt
模拟 Agent 修改源码

HMR

Element 被重新定位
```

---

# 41. MVP 体验指标

目标：

## Element Selection

```txt
用户从开启 Pick Mode
到选中目标元素

< 3 秒
```

---

## Simple Visual Change

例如：

```txt
gap
24 → 16
```

完成时间：

```txt
< 5 秒
```

---

## Preview Latency

Scrub 调整数值：

```txt
< 50ms 感知延迟
```

---

## Source Accuracy

Source linked 状态下：

```txt
>= 90%
```

定位正确。

如果无法达到，不允许显示 `exact`。

---

# 42. 开发顺序

严格按照以下阶段执行。

不要同时开发所有模块。

---

## Milestone 1

基础插件。

完成：

```txt
Monorepo
Chrome Extension
SidePanel
Content Script
Messaging
```

验收：

```txt
Side Panel 可以和页面通信
```

---

## Milestone 2

Element Picker。

完成：

```txt
Hover
Overlay
Select
Parent
Breadcrumb
```

验收：

```txt
可以稳定选择页面元素
```

---

## Milestone 3

Style Inspector。

完成：

```txt
Size
Spacing
Layout
Typography
Fill
Border
Scrub Input
```

验收：

```txt
修改实时 Preview
```

---

## Milestone 4

ChangeSet。

完成：

```txt
记录
Revert
Reset
Changes Tab
```

验收：

```txt
所有 Preview 修改可恢复
```

---

## Milestone 5

Bridge。

完成：

```txt
Node Server
WebSocket
Protocol
Chrome Connection
```

验收：

```txt
浏览器可以发送 Selection + ChangeSet
```

---

## Milestone 6

Source Resolver。

完成：

```txt
React
Next
Vite
Component
File
Line
Confidence
```

验收：

```txt
Demo 项目可以显示源码位置
```

---

## Milestone 7

Agent + MCP。

完成：

```txt
Agent Tab
Prompt Context
MCP Tools
Codex Adapter
```

验收：

```txt
Codex 可以获取当前元素 Context
```

---

## Milestone 8

Apply to Code。

完成：

```txt
ChangeSet → Agent
Source Modify
HMR
Element Re-identify
Applied State
```

验收：

```txt
浏览器 UI 调整能够最终落到真实源码
```

---

# 43. Codex 执行规范

Codex 在开发本项目时必须：

1. 每次只处理一个 Milestone 或明确 Task。
2. 修改前先检查现有代码结构。
3. 不重复创建已有工具函数。
4. 避免过度抽象。
5. 保持 package 边界清晰。
6. 公共类型必须放 `packages/protocol` 或 `packages/shared`。
7. Chrome Extension 不直接依赖 Node API。
8. Bridge 不直接依赖浏览器 API。
9. 不把 Agent SDK 写死在核心逻辑。
10. Agent 必须通过 Adapter。
11. 每完成一个 Milestone，补对应 Test。
12. 任何 Scope 外功能进入 `docs/backlog.md`。
13. 不因为临时方便生成 inline style 作为永久源码方案。
14. 不破坏用户项目原有 Design Token / Component abstraction。
15. Source 无法确定时必须返回 unknown，而不是猜测后静默修改。

---

# 44. Agent Adapter

定义：

```ts
interface AgentAdapter {
  id: string;

  name: string;

  isAvailable(): Promise<boolean>;

  applyChanges(
    request: ApplyChangeRequest
  ): Promise<ApplyChangeResult>;
}
```

实现：

```txt
CodexAdapter
ClaudeCodeAdapter
CursorAdapter
```

第一版优先完成：

```txt
CodexAdapter
```

其他 Adapter 可以占位但不要假实现成功。

---

# 45. ApplyChangeRequest

```ts
interface ApplyChangeRequest {
  project: {
    root: string;
    framework?: string;
    styling?: string;
  };

  context: ElementContext;

  changes: ChangeSet;

  instruction?: string;

  scope: "instance" | "component";
}
```

---

# 46. ApplyChangeResult

```ts
interface ApplyChangeResult {
  success: boolean;

  files?: string[];

  summary?: string;

  diff?: string;

  error?: {
    code: string;
    message: string;
  };
}
```

---

# 47. Error Codes

统一：

```txt
BRIDGE_OFFLINE

AGENT_OFFLINE

SOURCE_NOT_FOUND

SOURCE_AMBIGUOUS

APPLY_FAILED

HMR_TIMEOUT

ELEMENT_REIDENTIFY_FAILED

UNSUPPORTED_PAGE

UNSUPPORTED_FRAMEWORK
```

---

# 48. UI 设计要求

整体风格：

```txt
专业工具
克制
高信息密度
接近 Figma / Linear / Raycast
```

不要：

```txt
大面积渐变
游戏化
复杂装饰
过度卡片化
过多阴影
```

Side Panel 目标宽度：

```txt
320 ~ 380px
```

推荐：

```txt
360px
```

---

# 49. 核心交互模型

整个产品必须围绕：

```txt
Select
↓
Tune
↓
Prompt
↓
Apply
```

禁止增加第五个同等级核心操作。

---

# 50. 最终 Definition of Done

V0.1 完成时，必须可以演示以下场景：

---

## Demo Scenario

运行：

```bash
pnpm dev
```

启动：

```txt
Next.js Demo
Chrome Extension
Local Bridge
```

用户：

### Step 1

进入：

```txt
http://localhost:3000
```

---

### Step 2

打开 UI Tuner。

---

### Step 3

点击 Select。

---

### Step 4

点击页面一个 Card。

---

### Step 5

Side Panel 显示：

```txt
PricingCard

src/components/PricingCard.tsx:42
```

---

### Step 6

修改：

```txt
Gap
24 → 16

Padding
24 → 20

Radius
16 → 12
```

页面立即变化。

---

### Step 7

Changes 显示：

```txt
3 Preview Changes
```

---

### Step 8

Agent 输入：

```txt
按照当前调整后的视觉密度，
把同一区域的其他卡片统一，
标题字号保持不变。
```

---

### Step 9

点击：

```txt
Apply to Code
```

---

### Step 10

Codex 获取：

```txt
Element Context
Source
Computed Style
Preview ChangeSet
Prompt
```

---

### Step 11

Codex 修改真实源码。

---

### Step 12

Next.js HMR。

---

### Step 13

插件重新识别 Card。

Preview CSS 被清除。

---

### Step 14

显示：

```txt
✓ Applied

src/components/PricingCard.tsx

View Diff
```

---

如果以上完整流程稳定运行，即认为 V0.1 MVP 完成。

---

# 51. Codex 第一条执行指令

将本文件放到项目根目录：

```txt
UI_TUNER_EXECUTION_PLAN.md
```

然后给 Codex：

```txt
Read UI_TUNER_EXECUTION_PLAN.md completely.

We are building UI Tuner from scratch.

Do not implement the entire product at once.

Start only with Milestone 1.

Tasks:

1. Initialize the pnpm + Turborepo monorepo.
2. Create apps/chrome-extension.
3. Implement Manifest V3.
4. Implement a React Side Panel.
5. Implement a Content Script.
6. Implement bidirectional messaging between Side Panel and Content Script.
7. Add minimal tests and development scripts.
8. Create docs/architecture.md describing the current architecture.

Do not start Element Picker, MCP, Agent integration, or Source Resolver yet.

After implementation:

- run typecheck
- run tests
- run build
- report changed files
- report known issues
- report the exact command for loading/running the extension locally.
```

---

# 52. 后续 Codex 工作方式

每完成一个 Milestone，下一轮 Prompt 使用：

```txt
Read UI_TUNER_EXECUTION_PLAN.md.

Milestone N-1 is complete.

Now implement only Milestone N.

Before editing:
1. inspect the existing implementation;
2. reuse existing architecture;
3. identify any mismatch with the execution plan.

After editing:
1. run typecheck;
2. run tests;
3. run build;
4. summarize changed files;
5. list remaining risks;
6. do not start the next milestone.
```

---

# 53. 决策原则

如实现过程中存在多种技术方案，按以下优先级选择：

```txt
1. 稳定性
2. UI 调整实时性
3. Source Mapping 准确性
4. 可维护性
5. Token 效率
6. 功能覆盖率
```

不要为了支持更多框架牺牲 React / Next.js 主流程可靠性。

---

# 54. V0.1 最核心判断

这个产品成功与否，最终只看一件事：

> 设计师看到页面哪里不对，能不能直接点它、快速调它，并让 Agent 准确知道“改谁、怎么改、改到哪里”。

任何不能提升这条链路效率的功能，在 V0.1 都不是核心功能。
