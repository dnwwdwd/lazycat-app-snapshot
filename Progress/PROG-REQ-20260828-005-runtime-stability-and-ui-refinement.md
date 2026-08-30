# Progress — 运行稳定性与界面细化

**Requirement:** REQ-20260828-005  
**Status:** 本地实现与构建检查完成；真实平台验证待执行  
**Last updated:** 2026-08-28

## 本次交付定义

- 收敛 SSE 生命周期与事件刷新，避免浏览器取消连接时的代理错误日志风暴和整页并发加载。
- 完成应用列表、概览、侧栏、日期/网盘目录和设置页的用户指定体验调整。
- 保持当前用户隔离、只读源数据和当前用户网盘写入路径不变。

## 计划验证

- `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`
- `npm run build`（在 `apps/web/`）
- 真实设备：观察 SSE 连接稳定性、代理日志、设置时区后的目录名与显示时间。

## 本地实现与证据

- 前端改为单一 SSE 生命周期，事件使用 1.2 秒窗口合并刷新；连接断开后等待 15 秒再重新连接，避免重复取消连接和并发整页请求。
- 应用列表新增确认备份弹窗，不可备份实例保留禁用备份图标；应用详情弹窗移除重新检测和立即备份；状态标签改为图标与文字组合。
- 备份库列表移除快速校验盾牌，仅保留查看详情；快照详情中的校验能力保持不变。
- 侧栏承载紧凑账户和语言选择，生产顶部栏已移除；设置页重排为清晰的操作分区。
- 备份服务从当前 tenant 设置读取时区，使用含时区标识的可读目录名提交到 `LazycatAppBackup/`。
- `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server` 通过。
- `npm run build`（`apps/web/`）通过，包含 OpenAPI 生成漂移检查与 Vite 生产构建。
- `sh lzc/build-package.sh` 与 `lzc-cli project build -o mimi-app-backup-0.1.0.lpk` 已完成，重新生成 `mimi-app-backup-0.1.0.lpk`（22 MiB）。构建器提示应用商店提交用的 `lzc-icon.png` 为 1,198,969 bytes，超过 200 KiB；该告警未阻断本地 LPK 输出，尚未处理图标压缩。
- 未运行测试套件，遵循项目约束。真实懒猫环境的代理日志、SSE 稳定性及网盘目录时区仍需验证。
- 本轮：批次详情改为 `GET /api/batches/{batchId}`，不再以 `limit=200` 拉取列表，消除详情点击会触发分页参数校验的路径。备份详情弹窗、任务中心、存储页和计划编辑器已按实际数据结构重新组织；计划编辑提供搜索、应用图标、批量目标和分层频率设置。生产入口检索结果仅剩 `Dropdown` 组件内部的原生 `select`。
- 本轮验证：`npm run build`（`apps/web/`）通过，包含 OpenAPI 类型漂移检查与 Vite 生产构建；`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server` 通过；`git diff --check` 通过。未运行测试套件，遵循项目约束。
- 本轮续改：设置页重组为参考图的目录式双栏布局。左侧为个人、备份偏好、维护与记录入口；右侧先呈现可进入的设置条目，进入后编辑对应的服务端真实设置。`npm run build`（`apps/web/`）已在此次样式调整后通过；`git diff --check` 通过。未运行测试套件，遵循项目约束。
- 本轮续改：移除全部主页面标题上方的环境/tenant eyebrow 和侧栏语言选择；语言只在设置页“外观”中通过基础 `Dropdown` 修改。`npm run build`（`apps/web/`）与 `git diff --check` 已在本次调整后通过；未运行测试套件，遵循项目约束。
- 2026-08-28：按用户请求重新执行 `sh lzc/build-package.sh` 与 `lzc-cli project build -o mimi-app-backup-0.1.0.lpk`，生成 `mimi-app-backup-0.1.0.lpk`（22 MiB，SHA-256：`eb1aa5387bcecb6cfccd1499f7abefb947d802ae9d9c3d0f3b9175333b517661`）。构建器继续提示 `lzc-icon.png` 为 1,198,969 bytes，超过应用商店 200 KiB 限制；该告警未阻断本地 LPK 输出，未发布或部署。
- 本轮：网盘备份根目录改为 `MimiAppBakcup`，生产存储层不迁移、合并或修改旧目录；当前用户范围、相对路径校验和源数据只读边界不变。`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server` 通过；`npm run api:generate && npx vite build`（`apps/web/`）通过；`git diff --check` 通过。未重新打包、发布或部署。
- 本轮：备份库详情改为先请求控制库快照元数据，再独立读取文件索引。文件索引路径不存在或读取失败时，详情弹窗仍可打开并显示元数据；`npx vite build`（`apps/web/`）与 `git diff --check` 通过。未重新打包、发布或部署。
- 2026-08-28：按用户请求重新执行 `sh lzc/build-package.sh` 与 `lzc-cli project build -o mimi-app-backup-0.1.0.lpk`，生成 `mimi-app-backup-0.1.0.lpk`（22 MiB，SHA-256：`a6c966b86231166337eaf514d49f8cfd12f0b77afcabe3fb6eb9d1b75fcd0147`）。构建器继续提示 `lzc-icon.png` 超过商店 200 KiB 限制；该告警未阻断本地包输出，未发布或部署。
- 本轮：在保留数量、回收站宽限期、自动重试和重试间隔字段下补充实际行为说明；计划编辑器移除泛化的流程提示。`npx vite build`（`apps/web/`）与 `git diff --check` 通过；未重新打包、发布或部署。
- 本轮：移除“未来新增的可备份应用”动态目标及其后端展开逻辑。计划 API 仅接受显式目标；控制库迁移会停用旧动态计划并清空下次执行时间，用户可重新选择应用后保存。`npm run api:generate && npx vite build`（`apps/web/`）、`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server` 和 `git diff --check` 均通过；未运行测试套件。
- 本轮：计划弹窗将保留和重试改为常驻的“高级选项”；每天和每周可选择执行时间，服务端按计划时区生成对应 Cron；补跑改为“错过后不跑”开关。`npm run api:generate && npx vite build`（`apps/web/`）、`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server` 和 `git diff --check` 均通过；未运行测试套件。
- 本轮：概览单列布局为“下一批计划”和“风险提醒”设置独立的 20px 纵向间距，不依赖默认 Grid 间距。`npx vite build`（`apps/web/`）与 `git diff --check` 通过；未运行测试套件。
- 本轮：修复设置目录分支错误。“备份偏好”改为调度与保留设置入口，“维护与记录”保留审计记录。`npx vite build`（`apps/web/`）与 `git diff --check` 通过；未运行测试套件。
- 本轮：概览“下一批计划”和“风险提醒”的条目间距收敛为 8px，移除人为最小行高；计划时间显式使用 3px 顶部间距，不再受浏览器默认 `p` 外边距影响。`npx vite build`（`apps/web/`）与 `git diff --check -- apps/web/src/styles.css` 通过；未运行测试套件。
