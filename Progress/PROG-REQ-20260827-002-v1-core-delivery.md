# Progress — V1 核心交付

**Requirement:** REQ-20260827-002
**Status:** Local implementation complete — 阶段 0–5 已结束；真实平台确认不列为开发阶段
**Last updated:** 2026-08-27

## SQLite 持续锁诊断与修复

- 设备中的 `cloud.lazycat.app.mrslimslim.gpt-image-canvas` 任务在 2026-09-01 经过四次尝试后最终失败。新版 Online Backup 的最后一次持续 31 秒，证明 30 秒锁退避已经生效；目标 Node 进程持续持有 `gpt-image-canvas.sqlite` 的 SQLite POSIX 写锁，不能安全地在应用运行时取得快照。
- 备份引擎将窗口耗尽与其他 SQLite 快照错误拆分为 `SQLITE_SOURCE_LOCKED` 和 `SQLITE_SNAPSHOT_FAILED`。前端为前者显示暂停目标应用后重试的可读提示；服务端仅记录任务 ID 与稳定错误码，不记录源路径。
- 本轮不自动停止、重启或写入目标应用。真实设备需要在暂停目标应用后重试该任务，确认一致快照可提交；随后恢复运行并确认持续锁仍安全失败。
- 2026-09-01：`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`npm run build --prefix apps/web`、`lzc-cli project build -o cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`、`lzc-cli lpk info` 和 `lzc-cli lpk lint` 通过。新包为 19.04 MiB（19,962,880 bytes），SHA-256 `f9ec7f007a9555c2f3e3585f10950db017e4516e4a6180af579d539cceea75d2`；未部署或发布。

## 当前修复交付定义

- 修正应用详情元数据、应用图标、任务可见性、卡片样式与下拉组件使用；页面资源分开加载，已得到会话时侧栏和设置不再显示全局加载文案。
- 单实例保留风险提示但不再以确认框阻断查看、立即备份或计划创建；手动入队脱离浏览器请求取消，仍保留当前租户、实例和只读源边界。
- 正式与 POC 子域名分别调整为 `mimi-app-backup` 与 `mimi-app-backup-poc`。待实现后执行 Go/Vite/LPK 本地构建；真实设备验证网关取消后的入队与平台图标 URL。

## 本次修复的本地构建记录

- `gofmt` 已覆盖本轮 Go 改动；`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server` 通过。
- `npm run api:generate --prefix apps/web` 与 `npm run build --prefix apps/web` 通过；前端产物已包含本轮详情、图标、Dropdown 和加载状态改动。
- `sh lzc/build-package.sh`、`lzc-cli project build -o mimi-app-backup-0.1.0.lpk`、`lzc-cli lpk lint mimi-app-backup-0.1.0.lpk` 通过。包内 `manifest.yml` 已确认 `subdomain: mimi-app-backup` 和内部路由 `web.mimi-app-backup.lzcapp:8080`。
- 未运行测试套件。真实设备仍须验证手动入队在网关取消后不被中止，以及 SDK 目录返回的图标 URL 可加载。

## 本次包重命名与构建

- 产品名称统一为“咪咪应用备份（Mimi App Backup）”；`package.yml` 的 `package` 更新为 `mimi-app-backup`，正式与 POC manifest 的内部服务路由同步为 `web.mimi-app-backup.lzcapp:8080`。
- 前端国际化、侧栏品牌、OIDC 登录页、原型预览和 OpenAPI 标题已同步使用新名称；当前版本使用 `MimiAppBakcup/<deploy_id>/<时间>/` 作为快照网盘路径。
- `sh lzc/build-package.sh`：通过，Go 服务端和 Vite 前端生产构建完成。
- `lzc-cli project build -o mimi-app-backup-0.1.0.lpk`：通过，生成 22,742,528 字节的 LPK V2 包，SHA-256 为 `61366eab0a0bfd0644b98b615a37e380e201caceb6b65d0ec58ff2d66bdb3c5e`。
- `lzc-cli lpk info mimi-app-backup-0.1.0.lpk`：通过，报告 `package: mimi-app-backup`、`version: 0.1.0`、无嵌入镜像。
- `lzc-cli lpk lint mimi-app-backup-0.1.0.lpk`：通过，无 LPK lint 警告。图标仍超过应用商店 200 KiB 建议值，未在本轮改动。

## 当前基线

`appvar.other.read` POC 已通过。V1 使用已验证的当前用户应用目录、`/lzcapp/run/data/app/var` 运行时投影、服务端源解析、文件与数据库探测及当前用户网盘写入路径。POC 诊断能力保留在开发资产中，不进入正式产品导航。

## 本次 OIDC 会话绑定修复

- `agent-desk` 的会话模型把 OIDC profile 身份与懒猫网关身份分开保存。它在 OIDC 回调读取 `X-HC-User-ID`，写入会话的 `GatewayUserID`，后续请求只比较该字段与当前 Header。
- 本项目同步该模型：`preferred_username` 只保存为 profile UID；回调的 `X-HC-User-ID` 保存为 `session.gateway_uid`；业务请求只比较 `session.gateway_uid == X-HC-User-ID`。两种 UID 不作相等判断，`LAZYCAT_APP_DEPLOY_UID` 也不参与。
- 子域名曾错误设为 `safehold` / `safehold-poc`，本次已更正为 `mimi-app-backup` / `mimi-app-backup-poc`；重新打包后将以包内 manifest 为准。
- 先前的 Go/Vite/LPK 构建记录不覆盖本轮修复；本轮将重新执行构建和 lint，未运行测试套件，也未在真实设备完成 OIDC 回调。

## 阶段计划

| 阶段 | 交付内容 | 状态 | 外部确认 |
| --- | --- | --- | --- |
| 0. POC 门与治理 | POC 通过、V1 需求、总进度、工作流程和 `main` 分支规则 | 完成 | 已建立 V1 实现基线 |
| 1. 身份与控制库 | OIDC、会话、每用户控制库和迁移 | 本地实现完成，真机待验 | 取得真实 OIDC 回调和会话网关 UID/入口 UID 匹配证据 |
| 2. 应用与能力层 | 目录同步、正式实例模型、能力探测、存储适配层和领域 API | 本地实现完成，真机待验 | 当前用户应用与状态在真实平台可用，A/B 用户目录与 API 隔离得到确认 |
| 3. 备份最小闭环 | ZIP、SQLite Online Backup、manifest、校验、部分写入清理 | 本地实现完成，真机待验 | 普通文件和 SQLite 在当前用户网盘形成可校验 ZIP 快照 |
| 4. 计划与备份库 | 计划、批次、队列、限流、重试、补跑、保留、快照索引和存储维护 | 本地实现完成，真机待验 | 重启恢复和有界并发验证通过 |
| 5. 正式界面与国际化 | 八个主菜单、详情页、状态反馈、中文和英文 | 本地实现完成，真机待验 | 正式页面、错误反馈和中英文文案在真实会话与业务数据下可用 |

## 本轮完成

- 基于懒猫 OIDC 与入口 Header 规范，将自动跳转授权改为显式登录页。用户点击按钮后才开始 OIDC；授权回调成功后进入首页。浏览器遇到旧会话身份不匹配时清理会话并回到登录页，API 仍保持 403 和无业务数据的边界。
- 将已通过 POC 从进行中状态归档为完成。
- 建立 V1 核心交付需求和项目总进度。
- 将项目总进度扩展为 PRD 功能域和 PDD 技术域的交付台账，区分 POC 基线与正式 V1 完成状态。
- 建立 Vibe Coding 工作流程，并把所有实现直接在 `main` 进行的规则写入 `AGENTS.md`。
- 将新增的需求、进度、流程和关键入口加入 `DOCUMENT_MAP.md`。

## 本轮实现

- 新增 `cmd/server`、OIDC Authorization Code + PKCE、服务端会话和每次请求的会话网关 UID/`X-HC-User-ID` 校验。
- 在 `/lzcapp/var/backup.sqlite` 建立版本化控制库迁移，保存带 `tenant_uid` 的登录事务、会话、应用、实例、数据库发现和同步状态。
- 复用 POC 的当前用户 SDK 目录边界、固定 appvar 投影和只读探测规则，提供目录同步、游标分页、实例详情和受限刷新 API。
- 建立 `api/openapi/openapi.yaml` 与前端生成类型检查；应用资产柜、服务端筛选/游标分页、统一详情弹窗、重新检测、顶部用户信息和退出登录接入同源 API。
- 正式 LPK 构建改为 `cmd/server`；`cmd/poc` 和独立 POC 构建脚本继续用于平台诊断。
- 新增当前租户手动备份作业：实例复核、单实例共享风险提示、完整预检、SQLite Online Backup、严格普通文件读取、ZIP 内外 manifest、SHA-256、当前用户网盘原子提交和快照记录。
- 新增手动作业状态、快照列表/详情和快速校验 API；应用页的立即备份和最小备份库改用正式同源 API，不再模拟完成进度或快照数据。

## 当前实现工作

阶段 4 已完成：计划支持显式实例和当前用户未来可备份实例目标、每小时/每天/每周/Cron、时区、暂停、立即运行、补跑、有限重试和退避；批次/任务保存幂等键、租约、心跳和尝试记录，服务启动时回收过期租约。手动备份也通过同一持久队列运行。

备份库已支持文件索引、完整 ZIP 校验、导出到 `_restore_exports/`、回收站、保留、扫描和过期目录清理；前端的计划、任务、备份库和存储页面只读取或调用正式接口，不使用本地模拟结果。告警、SSE、设置、完整计划向导和完整国际化进入阶段 5。

真实懒猫设备仍需完成 OIDC 回调、`session.gateway_uid == X-HC-User-ID`、A/B 用户目录/API/快照隔离和当前用户网盘写入验证。后台自启动和补跑还需在对应运行时行为上补证。

阶段 5 已落实运营边界：告警、设置、审计和短时 SSE 事件全部限定在当前用户控制库；REST 仍是断线重连后的权威读取路径。计划向导、概览、任务和批次详情、告警、设置以及中英文页面只调用正式 API。可选 `user.notify`、SSE 与真实平台权限的行为继续保留为真机待验证项。

阶段 5 已完成本地实现。控制库迁移加入告警、设置、审计和事件序列；`/api/overview`、`/api/alerts`、`/api/settings`、`/api/audit` 与 `/api/events` 均只处理当前会话对应的 tenant。事件流每次连接有时限，事件间隙或重连后由浏览器重新读取 REST 权威数据。任务和批次更新、快照校验、存储维护以及用户发起的计划、任务、快照和设置操作写入当前用户审计；最终失败任务会创建站内告警。

前端已接入首次使用检查、概览、应用筛选和详情、重新检测和手动备份、计划编辑、任务与批次详情、备份库和文件索引、存储维护、告警处理、设置与审计。页面不生成任务成功、进度、告警或配置保存的模拟结果；`zh-CN` 和 `en-US` 按稳定错误码显示安全提示。可选 `user.notify` 仍只是权限和偏好边界，未作为真实外部通知能力验收。

本轮起按项目新增规则，不新增或修改测试/验证代码，也不运行测试套件；交付时只执行 Go 服务端和 Vite 前端构建检查。

## 历史检查与当前规则

以下内容是新增“不得新增、修改或运行测试/验证代码”规则以前留下的历史记录，只用于说明既有工作区状态，不作为本轮或后续阶段的执行要求。

- `go test ./...`：通过，覆盖迁移升级、登录事务一次性消费、三方身份不匹配后的会话删除、管理员角色不扩权、owner 二次过滤、游标筛选、同步合并、探测并发上限、路径穿越和符号链接拒绝。
- `go vet ./...`：通过。
- `npm test --prefix apps/web -- --run`：通过，15 项测试覆盖同源 Cookie、错误码中文映射、目录同步、筛选/游标参数、实例详情、重新检测以及计划/任务/存储正式接口请求。
- `npm run build --prefix apps/web`：通过，包含 OpenAPI 生成类型与漂移检查。
- `sh lzc/build-package.sh`：通过，产物包含 `lzc-dist/bin/backup-server`。
- `sh lzc/build-poc-package.sh`：通过，产物包含 `lzc-dist-poc/bin/backup-poc`。
- `lzc-cli project build -o lazycat-app-backup-0.1.0.lpk`：通过，生成 22,018,048 字节的本地正式 LPK。CLI 提示 `lzc-icon.png` 为 1,198,969 字节，超过应用商店要求的 200 KiB；本地打包未受阻，提交商店前需要压缩图标。
- 阶段 3 定向测试：普通文件 ZIP、ZIP64 条目数、SQLite Online Backup 与 `quick_check`、内部/外部 manifest、SHA-256、快速校验、共享实例确认、阻断数据库失败不入库、服务重启中断作业释放实例锁、API 会话边界、存储路径和恶意 ZIP 条目拒绝，均在 `go test ./...` 中通过。
- 阶段 4 定向测试：计划目标二次校验与共享实例确认、补跑批次展开、批次/任务幂等、持久任务队列、过期租约回收、手动备份通过队列完成、任务尝试记录、当前租户计划 API、文件索引、ZIP CRC 和 SQLite `quick_check` 的完整校验、导出、回收站与快照不可再读，均在当时的 `go test ./...` 中通过。

本轮只允许 Go 服务端和 Vite 前端构建检查。阶段 5 最新源代码与更名后的正式包已完成本地构建和 LPK 检查；真实懒猫设备上的 OIDC 回调、网关 UID 会话绑定、A/B 用户目录/API/快照隔离、当前用户网盘写入、后台启动和补跑仍未执行。

## 本次本地检查

- `sh lzc/build-package.sh`：通过；包含 Go 服务端构建、OpenAPI 类型漂移检查与 Vite 生产构建。
- `lzc-cli project build -o mimi-app-backup-0.1.0.lpk`：通过；输出 LPK V2 正式包。
- `lzc-cli lpk info mimi-app-backup-0.1.0.lpk`：通过；包 ID 为 `mimi-app-backup`，无嵌入镜像。
- `lzc-cli lpk lint mimi-app-backup-0.1.0.lpk`：通过；无 lint 警告。
- 未运行测试套件，遵守项目验证规则。
- 未在真实懒猫设备执行 OIDC 回调、网关 UID 会话绑定或 A/B 隔离检查；本次本地构建不构成平台验收。

## 真实平台外部确认

- 真实平台确认不占用开发阶段；不新增、修改或运行测试/验证代码。
- 涉及平台权限、用户隔离、网盘写入和运行时投影的功能必须补充真实环境证据。
- 平台、权限、投影或源解析器变化后，重新执行 `docs/APPVAR_READ_POC_RUNBOOK.md`。
- 尚未在真实平台运行 OIDC 回调、双用户目录/API/快照矩阵和当前用户网盘写入，不能标记为平台验收通过。
