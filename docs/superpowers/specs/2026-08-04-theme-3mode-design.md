# 三档主题（亮 / 暗 / 跟随系统）设计

日期：2026-08-04

## 背景

当前暗色模式通过 `body.dark` 类 + 约 30 条手工硬编码覆盖规则实现，颜色零散
（`#1a1a1a`/`#252525`/`#2d2d2d`/`#333`…），强调色在暗底上突兀、切换生硬、缺少系统性。

本次采用用户选定的「方案 C」：亮 / 暗 / 跟随系统三档主题，并基于 CSS 变量重构颜色系统。

## 目标

1. 三档主题：亮色、暗色、跟随系统（`prefers-color-scheme`），通过居中弹窗选择。
2. 颜色收敛为语义 CSS 变量，亮色观感不变。
3. 暗色基调为冷蓝灰现代风。
4. 原生控件（select/input/滚动条）随主题通过 `color-scheme` 适配。
5. 切换有平滑过渡。

## 设计

### 1. CSS 变量重构

- `:root` 定义全部语义变量（亮色值，观感不变）
- `body.dark` 用同名变量覆盖暗色值（冷蓝灰）
- 变量清单：
  - 背景层：`--bg`、`--surface`（侧边栏/设置面板）、`--raised`（弹窗/输入/下拉）、`--hover`
  - 文本层：`--text`、`--text-2`（次要）、`--text-muted`（占位/辅助）
  - `--border`、`--scrollbar`
  - 强调与状态：`--accent`、`--success`、`--warning`、`--danger`
- 全部硬编码色值替换为 `var(--x)`。
- `:root { color-scheme: light }`、`body.dark { color-scheme: dark }`。
- `body` 及主要容器加 `background-color/color/border-color` 约 0.2s 过渡。

### 2. 暗色板（冷蓝灰）

```
--bg:      #0f1216
--surface: #161b22
--raised:  #1c2330
--border:  #263040
--text:    #e4e9f0
--text-2:  #9aa5b5
--text-muted: #68748a
--accent:  #5b8dda
--success: #3fae62
--warning: #d99414
--danger:  #e05252
--hover:   rgba(255,255,255,0.07)
```

### 3. JS 三态逻辑

- 存储键 `lyric_theme`，值 `'light' | 'dark' | 'auto'`。
- 旧值 `'dark'/'light'` 直接兼容；缺失/异常默认 `auto`。
- `applyTheme(mode)`：
  - `dark → body.dark` 加类；`light → 移除`；`auto →` 按
    `matchMedia('(prefers-color-scheme: dark)').matches` 决定。
  - 边栏主题按钮图标保持 🌓 不变。
- 监听 `matchMedia('(prefers-color-scheme: dark)')` 的 `change`：
  **仅当 mode 为 auto 时实时跟随**系统切换；手动指定 light/dark 不响应。
- 点击边栏主题按钮弹出居中选择弹窗（复用 `modal-mask` 风格，新增独立小 modal）：
  三个选项「☀️ 亮色 / 🌙 暗色 / 🖥️ 跟随系统」，当前项高亮，选中即应用并关闭；
  Esc / 遮罩点击关闭。与系统主题跟随弹窗共存（主题弹窗独立于通用 dialogModal）。

### 4. 测试（vitest + jsdom）

jsdom 无真实 `matchMedia`，测试内用 `Object.defineProperty(win, 'matchMedia', ...)` stub，
stub 提供 `matches` 与可触发的 `change` 回调捕获。

新增用例：
1. 未存储 → 默认 `auto`，按系统偏好（stub 暗 → body 含 `.dark`）
2. 旧值 `'dark'` → 解析为暗色；`'light'` → 浅色
3. 弹窗选择 `'dark'` → `.dark` 生效且存储 `'dark'`；再选 `'light'` → 移除
4. auto 下触发系统 change → 实时跟随；手动指定 dark 后系统变化不响应
5. 主题弹窗：打开含三个选项、当前项高亮

色值本身不做机器断言（jsdom 计算样式对 CSS 变量支持有限），
以 classList + localStorage + matchMedia 行为断言为主；视觉效果用 Edge 冒烟人工核对。

### 5. 验证

- 现有 27 测试保持全绿。
- Edge 冒烟：三态切换、auto 跟随系统、原生控件/滚动条暗色适配、
  主题弹窗交互一致性。