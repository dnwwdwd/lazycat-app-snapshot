# Progress — 计划选择性备份范围

**Requirement:** REQ-20260829-007  
**Status:** 本地实现完成；真实平台验证待执行  
**Last updated:** 2026-08-29

## 本次实现

- 控制库为计划目标、作业、任务、快照增加 `BackupScope` JSON；旧记录读取为“旧版完整备份”。范围包含模式、目录、文件、修订号和摘要。
- `GET /api/instances/{deployId}/backup-scope` 只返回当前用户数据根下的安全相对路径、类型、大小和 SQLite 标记。
- 计划保存时清洗路径、去重、移除被父目录覆盖的项，拒绝 SQLite 伴随文件；范围变化递增修订并取消未启动的旧任务。
- 计划运行前重新解析所有目标。任一范围失效时持久化暂停原因、停止后续运行、跳过本批次任务、写入审计和站内告警。
- 执行期间的范围失效保留实际失效相对路径和预期类型；该错误不重试，也不写入不完整快照。
- 前端计划编辑器改为四步单列向导：先选择整个应用或选择性备份，再批量添加应用；选择性备份会逐个配置范围，最后再设置并确认计划。范围设置只提供完整和自定义；历史 `CORE` 范围仍可读取。任务和快照详情显示范围、实际归档与 SQLite 处理；范围修订与跳过记录仅保留在持久化数据和 manifest 中。
- 重做 V2 高保真原型 `designs/backup-scope-plan/index.html`，与正式前端采用相同的四步流程，并在小屏断点改为单列、44px 以上的可点击行和底部操作区。
- 自定义范围改为可展开文件树，父目录选择覆盖全部子目录和文件；目录、SQLite、配置、文档、图片、代码和普通文件显示不同的线性图标与色彩底。Cron 输入实时转换为可读的执行时间，格式不完整或字段超界时直接显示原因。原型同步展示这些交互。
- 向导标题、步骤编号、应用搜索和应用卡高度、Cron 时区布局、底部按钮、下拉边框、全局无阴影和设置目录菜单边线已统一调整；取消、上一步和保存按钮分别使用灰色、LPK 蓝色和主色。
- 计划向导收敛为单个黄色保存按钮；保存不会立即入队，立即执行保留在计划列表的单独操作中。
- 快照详情移除范围修订和跳过项，归档统计改为两项紧凑信息；计划列表改用可读的周期、定时或 Cron 含义，新增计划详情弹窗，并将查看、立即执行、暂停/启用、编辑收敛为带无障碍标签的图标操作。

## 本地检查

- 计划列表与快照详情收口后执行 `npx vite build`（`apps/web/`）和 `git diff --check`：通过。
- `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`：通过。
- `npm run api:generate --prefix apps/web`：通过。
- `npx vite build`（`apps/web/`）：通过。
- 本轮界面收口后再次执行 `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`npm run api:generate --prefix apps/web`、`npx vite build`（`apps/web/`）、原型内嵌脚本 `node --check` 和 `git diff --check`：全部通过。
- 收敛计划确认区后再次执行 `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`npx vite build`（`apps/web/`）、原型内嵌脚本 `node --check` 和 `git diff --check`：全部通过。
- `sh lzc/build-package.sh`、`lzc-cli project build -o mimi-app-backup-0.1.0.lpk`：通过，已重打包含四步向导、范围类型图标和 Cron 解读的本地包；产物为 19,742,208 字节，SHA-256 为 `9de4dda15ec1f88fe27b6b15cf7aca2480fc5715ecf31bf513faa12467fe6c1f`。
- `lzc-cli lpk lint mimi-app-backup-0.1.0.lpk`：通过，无 lint 警告。
- 2026-08-29 重新打包 `mimi-app-backup-0.1.0.lpk`：`sh lzc/build-package.sh`、`lzc-cli project build -o mimi-app-backup-0.1.0.lpk` 通过；产物为 19,764,736 字节，SHA-256 为 `3f03924c0f55440821652e50701ab6f09780ae817e4880e869c25ec5b85f2591`。
- 本次产物再次执行 `lzc-cli lpk lint mimi-app-backup-0.1.0.lpk`：通过，无 lint 警告。
- `git diff --check`：通过。
- `npm run build --prefix apps/web` 的 `api:check` 会把工作区此前已有的 OpenAPI 类型漂移视为差异；直接 Vite 生产构建通过。
- 未运行测试，未发布、部署、推送或创建合并请求。

## 待补证据

- 在真实双用户环境确认范围目录接口与计划执行只读取当前用户 appvar。
- 验证目录失效、单文件改名、类型变化与源根不可读后的暂停原因、任务状态、告警和审计。
- 验证重新选择范围后旧排队任务取消、新修订恢复计划，运行中的旧修订任务仍按原范围安全结束。
