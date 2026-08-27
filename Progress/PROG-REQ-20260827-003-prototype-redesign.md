# Progress — V1 原型重设计

**Requirement:** REQ-20260827-003  
**Status:** Completed — interactive high-fidelity prototype delivered  
**Last updated:** 2026-08-27

## 完成内容

- 读取 PRD、PDD、现有前端原型和 `lzc-icon.png`。
- 创建 `designs/index.html`，默认进入“应用资产柜”。
- 加入八个主菜单、首次使用向导、应用详情、计划向导、任务详情、快照详情、风险确认和会话弹窗。
- 加入搜索、标签筛选、批量选择、立即备份模拟进度、计划启停、告警确认、设置分组切换和 Toast 反馈。
- 复制品牌图标到 `designs/assets/lzc-icon.png`。
- 使用 `record-asset.mjs` 登记资产，并更新 `DOCUMENT_MAP.md` 与需求台账。

## 验证

- `curl -I http://localhost:4311/index.html` 返回 200。
- `curl http://localhost:58458/index.html?rev=v6-no-border` 返回 200；当前预览服务已绑定 58458，避免浏览器当前标签出现“页面无法访问”。
- `npx --yes prettier --check /tmp/lazycat-prototype.jsx` 通过，Babel JSX 语法可解析。
- V12 控件和计划弹窗调整后执行 Babel Standalone 转换：通过（176628 chars）。
- V12 控件和计划弹窗调整后执行 `npx --yes prettier --check /tmp/lazycat-prototype.jsx`：通过。
- `rg -n "<select" designs/index.html` 仅保留 `Dropdown` 组件内部的受控原生 select。
- V11 间距调整后再次执行 Babel Standalone 转换：通过（162930 chars）。
- V11 间距调整后再次执行 `npx --yes prettier --check /tmp/lazycat-prototype.jsx`：通过。
- `curl http://localhost:64234/index.html?rev=v11-rhythm` 返回 HTTP 200。
- `curl http://localhost:64234/index.html?rev=v12-plan-form` 返回 HTTP 200。
- `curl -I http://localhost:4311/index.html?rev=v13-controls-form` 返回 HTTP 200。
- `npx --yes prettier --check /tmp/lazycat-prototype.jsx` 通过；`npx --yes esbuild /tmp/lazycat-prototype.jsx --loader:.jsx=jsx` 通过。
- `rg -n '<select' designs/index.html` 仅命中 `Dropdown` 组件内部原生 select。
- 修复 `StoragePage` 与 `SettingsPage` 的 JSX 闭合问题；使用 Babel Standalone 7.29.0 完整转换通过（153844 chars）。
- 根据预览反馈完成第二轮视觉整理：统一画布背景、页面留白、卡片层级、标签样式、表格密度、抽屉/弹窗比例，并补充 900px 断点下的导航与表单布局。
- 根据截图反馈完成第三轮间距重构：移除大部分可见卡片边框色，改用柔和底色/阴影分组，增加页面区块、统计卡、表格行和弹窗内部的留白，并统一各页面的主题色与层级节奏。
- 按最终反馈完成全局无边框覆盖：卡片、表格容器、输入控件、弹窗内层、设置面板和列表项均移除可见 border，改用更大的 sibling gap、浅底色和阴影表达层级。
- 针对预览中仍可见的顶部卡片彩色横线，删除 `stat-card::before/after` 源装饰规则，并对顶部卡片与容器追加 `border: 0 !important`、透明边框色和无 outline 的硬覆盖；层级仅保留柔和扩散阴影。
- 按移动端反馈移除 Topbar 面包屑 DOM 与相关样式；新增移动端底部主导航，覆盖全部 PRD 菜单，采用图标在上、名称在下、可横向滑动、暖黄选中态与 24–26px 圆角悬浮菜单栏，并为窄屏补充搜索栏、统计卡、表格工具栏和内容底部安全间距。
- 根据顶部卡片复核反馈，收敛页面间距节奏：标题到首区块 18px、统计卡内间距 14px、主区块之间 18px，移除重复的 `22–24px` 外边距和 Overview 统计卡内联顶距，避免卡片贴合或留白过度。
- 修复顶部统计卡未生效的网格布局：补齐 `.stats-grid { display: grid; }`，统一四列/双列响应式排列与 14px 卡片间距。
- 按反馈将移动端断点从 900px 收窄至 720px；新建计划改为单弹窗表单，目标、频率、时间、保留、通知和共享风险确认在同一窗口完成。
- 定位到卡片重叠的真实原因：页面父级 `gap` 与卡片内部 sibling `margin-top` 同时生效，且部分栅格容器缺少明确的纵向节奏。新增 V11 间距令牌（页面 18px、卡片栈 16px、列表项 12px），让每个 stack 只由父容器负责间距，并清除重复 margin。
- 为卡片、雷达、存储面板、设置面板、首次使用向导、抽屉和弹窗统一使用 flex-column + gap；设置内容、计划列表、活动列表和计划行补充明确的子项间距，避免未设置间距时发生贴合或重叠。
- 备份计划清单补充独立的行间留白与浅色分组底，桌面和移动端保持同一节奏；设置面板内容 wrapper 改为 `settings-content`，不再依赖 inline `marginTop`。
- 已启动 `python3 -m http.server 4311 --directory designs` 供本地预览，并保留 64234 端口用于当前复核。
- 按反馈新增共享 `Dropdown` 下拉框组件，统一替换应用筛选、设置、首次使用向导和计划相关的原生下拉框；组件统一处理箭头、内边距、宽度、键盘焦点和 `required` 语义。
- 消息提示语移除可见 border 与彩色 inset 阴影，只保留轻量背景色和状态图标，避免提示条看起来像带边框卡片。
- 重做单弹窗新建备份计划：计划名称、目标实例、执行频率、执行时间、时区、保留策略和单实例风险确认均有必填标记；空值、无目标、时间缺失和风险未确认时显示字段错误并阻止保存，同时通过 Toast 提示首个错误。
- 修复通知选项布局：复选框恢复为 16px 控件，三个通知项使用响应式选项卡（桌面三列、移动端单列），补充说明文案，避免被 `.field input` 通用样式撑变形。
- 本轮清理提示条和 Toast 的历史边框/内描边规则，避免仅靠覆盖样式隐藏边框；新建计划的保存操作统一进入 `validate()`，未勾选共享风险时也会显示字段级错误与 Toast 提示。
- 按移动端复核反馈，将底部导航在可完整容纳菜单的宽度下改为整体居中；窄屏仍保持左起横向滚动，避免首尾菜单被裁切。

## 未执行

- 当前环境缺少可用 Chromium 运行库，未完成自动截图和浏览器控制台检查；原型仍可通过本地 HTTP 页面交互预览。
