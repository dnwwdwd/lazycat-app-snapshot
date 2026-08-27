# REQ-20260827-004 — 前端原型翻译与组件化

**类型：** 功能实现 / 前端工程化  
**状态：** 已完成 — 原型已翻译为 Vite/React 组件与页面  
**依据：** PRD §11–22；PDD §21–22  
**进度记录：** `Progress/PROG-REQ-20260827-004-frontend-prototype-split.md`

## 目标

将 `designs/index.html` 中的 React、样式、数据和交互逻辑机械翻译到 `apps/web/`，形成可构建的前端组件、页面和应用编排入口。

## 交付范围

- `prototype/data.ts`：原型数据、导航分组和状态样例。
- `prototype/components.tsx`：图标、状态、下拉框、侧栏、移动端导航和顶部栏。
- `prototype/pages.tsx`：概览、应用、计划、任务、备份库、存储、告警、设置和首次向导页面。
- `prototype/overlays.tsx`：详情抽屉、任务抽屉、快照抽屉、计划/风险/会话/备份进度弹窗。
- `prototype/PrototypeApp.tsx`：路由状态、批量选择、备份模拟进度、Toast 和全局叠层编排。
- `styles.css`：完整迁移原型 CSS，包括 720px 移动端断点、底部导航、表单校验反馈和间距令牌。
- `public/assets/lzc-icon.png`：沿用原型品牌图标。

## 对齐边界

- 页面信息架构、八个主菜单、首次向导、详情/抽屉/弹窗和移动端判断逻辑与原型保持一致，并覆盖 PRD 页面入口。
- 页面中的状态和备份进度仍是原型演示数据；OIDC、正式领域 API、SSE、控制库、ZIP/SQLite 后端和持久化队列不在本轮伪造实现。
- 保持当前用户范围、单实例共享风险、目标只读、服务型数据库阻断和不提供直接恢复等 PRD/PDD 边界文案。

## 验收条件

- `npm run build` 成功。
- `npm test -- --run` 成功。
- 入口默认展示“应用资产柜”，导航可切换八个主菜单和首次向导。
- 原型 CSS 与交互代码完成机械迁移，未新增跨租户、宿主路径或目标应用写回能力。
