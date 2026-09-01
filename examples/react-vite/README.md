# Example A — react-vite

UI Tuner M6（Source Resolver）验证项目（计划 §39 Example A）。Vite + React 常规结构，普通 CSS。

```bash
npm install
npm run dev    # http://127.0.0.1:5173
```

组件（`src/components/`）：Navbar / Card / Button / Form / List。

Source Resolver 预期：

| 选取元素                  | 预期结果                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| 「总览」导航链接          | exact → `src/components/Navbar.tsx`                                |
| 「本月费用概览」标题      | exact → `src/components/Card.tsx`                                  |
| 「查看详情」按钮          | exact → `src/components/Card.tsx`（JSX 调用点，与 React 语义一致） |
| 「记录费用」提交按钮      | exact → `src/components/Form.tsx`                                  |
| `card stat-card` 卡片容器 | inferred → Possible: `Card.tsx`                                    |
| `app-shell` 最外层 div    | unknown → Preview only                                             |
| 车牌文本（数组数据渲染）  | unknown → Preview only（数据驱动文本 V1 不索引）                   |
