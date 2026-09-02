# Progress — 页面标识清理与应用重新检测反馈

**Requirement:** REQ-20260831-011
**Status:** 本地实现完成；真实懒猫验证待执行
**Last updated:** 2026-09-01

## 本次交付定义

- 删除正式业务页共用标题中的重复产品版本眉题。
- 修复重新检测的异步同步状态时序，并让单项和批量操作有明确的受理反馈。
- 把无法从已授权 appvar 投影解析或读取的数据源归类为“系统或权限受限”，不再显示“需要重新检测”或通用 `PROBE_FAILED`。
- 把达到扫描目录项上限的已知资源边界归类为“系统或权限受限”，记录稳定原因码，避免被兜底为 `PROBE_FAILED`。
- 保留 `PROBE_FAILED` 仅用于未分类的真实探测异常；读取权限拒绝单独归类为受限状态。
- 移除首屏数据完成后的自动 toast，保留读取中的全局 loading 和操作结果提示。

## 计划验证

- `npm run build --prefix apps/web`
- `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`
- `git diff --check`
- `sh lzc/build-package.sh`、`lzc-cli project release --output cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`、`lzc-cli lpk info`、`lzc-cli lpk lint`
- 真实设备：确认 LightOS 与 Totoro 显示“系统或权限受限”且不进入“需要重新检测”；确认普通 appvar 应用的重新检测 toast、同步中的列表状态和终态结果。

## 本地实现与验证

- 源解析器以目录存在、目录类型、符号链接边界和可访问性判断 appvar 数据源能力。投影根、应用候选目录或遍历路径缺失、不可访问或返回路径错误时，服务写为 `SYSTEM_UNSUPPORTED` 及稳定原因码；没有按 appid 维护白名单。
- 实际读取权限拒绝写为 `SYSTEM_UNSUPPORTED/SOURCE_PERMISSION_DENIED`；投影不可见或候选目录不可用写为 `SYSTEM_UNSUPPORTED/SOURCE_PROJECTION_UNAVAILABLE`。扫描器达到 100,000 个目录项时返回稳定 sentinel，目录同步写为 `SYSTEM_UNSUPPORTED/SOURCE_ENTRY_LIMIT_EXCEEDED`。只有超时和其他未分类的真实探测异常保留 `PROBE_FAILED`。探测状态和原因码仍由同一次目录同步持久化。
- 正式业务页的共用 `PageHeader` 已删除 `MIMI APP BACKUP · V1`；语言设置只保留在设置页“外观”。
- 单项重新检测和批量重新检测在服务端受理后显示站内 toast。提示只说明“已提交，正在同步”，不把异步探测结果误报为完成。
- 目录同步协调器在创建后台扫描前将当前 tenant 的 `catalog_syncs` 状态写为 `RUNNING`。应用列表的下一次读取会进入现有轮询流程，直到服务端写入成功或失败终态。
- `PROBE_FAILED` 行会显示服务端返回的 `probeErrorCode`。这个状态表示后端解析或探测失败；状态在终态后仍存在时，需要按错误码检查 appvar 投影、数据目录或探测器。
- 已取消首屏数据完成后的自动 toast。全局、应用页和设置页的 toast 均在重置时清理上一个定时器，在卸载时取消定时器，并拒绝将 `zh-CN` 或 `en-US` 渲染为消息内容。
- `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`：通过。
- `cd apps/web && npx vite build`：通过。
- 本次修复后再次执行 `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`：通过。
- 本次修复后再次执行 `cd apps/web && npx vite build`：通过。
- 本次修复后执行 `git diff --check`：通过。
- `lzc-cli project release --output cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`：通过，生成本地 LPK。`package.yml` 版本保持 `0.1.0`。
- `lzc-cli lpk info cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`：包标识为 `cloud.lazycat.app.mimi-app-backup`，版本为 `0.1.0`，大小 19,926,016 字节。
- `lzc-cli lpk lint cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`：无警告。包内 `web/index.html` 仍保留 `<html lang="zh-CN">`，JS 不再包含首屏自动 toast 文案。
- 产物 SHA-256：`29c074c1faf4212fd8537479b0fcda1a5f877fe16bae1cc4b36064dee12d6111`。
- 本轮 `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`：通过。
- 本轮 `cd apps/web && npx vite build`：通过。
- 本轮 `git diff --check`：通过。
- 本轮 `lzc-cli project release --output cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`：通过；构建脚本同时完成 OpenAPI 类型生成、Vite 构建和 Go 编译。`lzc-cli lpk info` 确认包标识 `cloud.lazycat.app.mimi-app-backup`、版本 `0.1.0`、LPK V2、大小 19,930,112 字节；`lzc-cli lpk lint` 无警告。
- 本轮产物 SHA-256：`40efb90a4f7008c7dc61099a13184a219e8be914f0c34c88e9387412f36da596`。
- `npm run build --prefix apps/web`：未通过。脚本内的 `api:check` 重新生成了当前工作区既有 OpenAPI 改动对应的 `schema.d.ts` 字段，并因该文件相对 `HEAD` 已有差异而按预期退出；随后直接运行的 Vite 生产构建通过。
- 2026-09-01 本轮再次执行 `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`cd apps/web && npx vite build` 与 `git diff --check`，均通过。
- 2026-09-01 `lzc-cli project release --output cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk` 通过；构建脚本完成 OpenAPI 类型生成、Vite 构建和 Go 编译。`lzc-cli lpk info` 确认包标识 `cloud.lazycat.app.mimi-app-backup`、版本 `0.1.0`、LPK V2、大小 19,930,112 字节；`lzc-cli lpk lint` 无警告。产物 SHA-256：`2b2da63e7a438fad3c6ea37c61068a7ffa4e37dc93434af48c4007d9a442155f`。
- 未运行测试、未安装、未部署、未发布、未推送，也未创建合并请求。真实设备仍需确认 LightOS 与 Totoro 的最终状态和普通 appvar 应用重新检测回归。
