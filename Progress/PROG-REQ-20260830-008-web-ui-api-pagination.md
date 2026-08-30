# Progress — 正式界面迁移、API 对齐与游标分页

**Requirement:** REQ-20260830-008
**Status:** 本地实现完成；真实平台验证待执行
**Last updated:** 2026-08-30

## 本次实现

- `designs/web.tsx` 的样式模板原文迁移到正式前端，品牌图标放入前端公共根目录并继续使用 `/lzc-icon.png`。
- 新的 `src/ui/` 分为实时控制层、共用组件、八个页面和详情/计划弹窗；`App.tsx` 已改为正式入口，旧生产 React 页面、布局、控制器和模拟数据已删除。
- 实时控制层并行读取 session、overview、applications、plans、tasks、batches、backups、storage、alerts、settings 与 audit；SSE 只建立一条连接，1.2 秒合并刷新，15 秒重连，401/403 返回 OIDC 登录。
- 应用、任务、快照、告警、审计和批次界面使用服务端游标分页；计划目标、页面关联和应用批量立即备份统一使用 `deployId`。批量操作逐项提交并显示成功/失败数量。范围目录支持查询与分页，范围保存继续由服务端复核。
- 后端新增快照、批次、任务、告警、审计的稳定时间加 ID 游标查询；安全范围目录按相对路径和类型分页。新增当前租户与排序/筛选字段索引，不修改业务数据。
- OpenAPI、`schema.d.ts` 和客户端已增加 `cursor`、`limit`、`nextCursor`。
- 登录页按正式界面的浅色画布、品牌、面板和按钮语言重写，保留 OIDC 交互和身份不一致提示。
- 修复空快照租户的存储汇总：失败校验数为空时按 `0` 处理，避免概览接口返回 `PHASE5_OPERATION_FAILED`；该类未分类服务端错误现在会连同请求 ID 写入服务端日志。
- 根据界面复核，设置页恢复 `web.tsx` 的分区菜单、入口卡片和设置项间距；计划弹窗恢复四步向导；告警卡片移除左侧图标并将“告警”和严重程度标签置于左上；应用列表与弹窗优先使用服务端返回的真实应用图标。`designs/web.tsx` 与其 CSS 原文未修改。
- 修复应用列表遗漏 `databaseFindings` 的问题：服务端现为每个当前页实例返回已保存的 SQLite 与其他数据库检测结果，前端把受支持 SQLite 明确显示为 `SQLite 3 · 数量`。应用标识直接使用懒猫目录返回的图标地址，并在加载失败时回退为首字母标识；图像请求不发送来源页地址。全部空状态继续复用源设计的 `.empty` 类，并由共用组件保证图标与文字纵向、横向居中；所有数据表的操作组按最左侧图标对齐。`styles.css` 未修改。

## 已知限制

- CSS 严格保留设计源内容，因此没有追加键盘焦点、点击面积或动态效果调整。
- 未执行测试；本项目规则禁止修改或运行测试。真实平台仍需核验 OIDC、A/B 租户隔离、appvar 范围、网盘写入和后台任务。

## 本地检查

- `npm run api:generate --prefix apps/web`：通过。
- `npx vite build`（`apps/web/`）：通过。
- Homebrew 安装的 Go 1.27.0 已完成本次 Go 文件格式化；`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`：通过。
- `lzc-cli project build --output mimi-app-backup-0.1.0.lpk`：通过，生成本地 Git 忽略的 LPK；未安装、部署或发布。
- 包标识更新后重新执行 `lzc-cli project build --output mimi-app-backup-0.1.0.lpk`、`lzc-cli lpk info` 与 `lzc-cli lpk lint`：通过。产物为 20,838,400 字节、SHA-256 `ddbcb14d88d651894e5ac9501b663223157a28953bc616309eae5ed18ae53269`，包标识为 `cloud.lazycat.app.mimi-app-backup`，无 lint 警告；未安装、部署或发布。
- 修复空快照汇总错误后，`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`npx vite build`（`apps/web/`）、`lzc-cli project release`、`lzc-cli lpk info`、`lzc-cli lpk lint` 与 `git diff --check`：通过。LPK 版本升至 `0.1.1`，以便替换已安装的 `0.1.0`；产物为 `cloud.lazycat.app.mimi-app-backup-v0.1.1.lpk`（20,838,400 字节，SHA-256 `99b084e895a79324e3ac485bd70fb55aa9e56ff4a3c0962fd64df99e14caa3c3`），无 lint 警告。未安装、部署或发布。
- 界面修正后，`npx vite build`（`apps/web/`）、`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`lzc-cli project release`、`lzc-cli lpk info`、`lzc-cli lpk lint` 与 `git diff --check`：通过。LPK 版本升至 `0.1.2`，用于替换已安装的 `0.1.1`；产物为 `cloud.lazycat.app.mimi-app-backup-v0.1.2.lpk`（20,856,832 字节，SHA-256 `6e6cc36dfbda710d1fa3538b82b70ff3001b72a3590160ed747f35ac052bfe7a`），无 lint 警告。未安装、部署或发布。
- 未运行测试，未发布、部署、推送或创建合并请求。

- 本轮 UI/API 对齐已升至 `0.1.3`，用于替换已安装的 `0.1.2`；前端和 Go 编译检查、LPK 信息和 lint 检查均已完成。
- 本轮 UI/API 对齐后，`npm run api:generate --prefix apps/web`、`npx vite build`（`apps/web/`）、`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`lzc-cli project release`、`lzc-cli lpk info`、`lzc-cli lpk lint` 与 `git diff --check`：通过。产物为 `cloud.lazycat.app.mimi-app-backup-v0.1.3.lpk`（20,871,168 字节，SHA-256 `8da9e45880c78935c03cb696bb7e2891841df5bb8d712165a3eacf6003cd40d3`），无 lint 警告；未安装、部署、发布、推送或创建合并请求。
- 游标范围校验补齐后，`npm run api:generate --prefix apps/web`、`npx vite build`（`apps/web/`）、`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`lzc-cli project release`、`lzc-cli lpk info`、`lzc-cli lpk lint` 与 `git diff --check`：通过。LPK 版本升至 `0.1.4`，产物为 `cloud.lazycat.app.mimi-app-backup-v0.1.4.lpk`（20,875,264 字节，SHA-256 `1d0c6d898951d7fc241b6f94738036182c6c93082e8da0dc9329f3c7ed0d412b`），无 lint 警告；未安装、部署、发布、推送或创建合并请求。
- 修复应用列表数据库特征、真实应用图标、表格操作列与空状态对齐后，`npm run api:generate --prefix apps/web`、`npx vite build`（`apps/web/`）、`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`lzc-cli project release`、`lzc-cli lpk info`、`lzc-cli lpk lint` 与 `git diff --check`：通过。LPK 版本升至 `0.1.5`，产物为 `cloud.lazycat.app.mimi-app-backup-v0.1.5.lpk`（20,875,776 字节，SHA-256 `1fc5b69a99cc87cd5e7a7e96481fd807f43bc74bd9fc375803ed8ccc2061ee14`），无 lint 警告；未安装、部署、发布、推送或创建合并请求。

## UI parity checklist（2026-08-30）

本清单以 `designs/web.tsx` 的 JSX 和交互为视觉基准，并把真实 API、租户范围和本需求中已经确认的删除项单独标明。每项状态按本次审计要求记为 `待处理`，不表示已经确认要实现；其中“需求已确认删除”项需要在后续复核时保持删除结论。API 评估使用：`有` = 现有 OpenAPI/客户端可直接支持；`部分` = 有相关字段或接口，但没有完整支持源界面；`无` = 当前没有对应接口/字段，或源界面只有模拟数据。

### 1. 全局壳层与共用组件

| 状态 | 源文件 | 生产文件 | 差异描述 | API 可用性评估 |
| --- | --- | --- | --- | --- |
| 待处理 | `designs/web.tsx:135-147` | `apps/web/src/ui/components.tsx:4-45` | `PageHeader` 的眉题从 `MIMI APP BACKUP · V1` 变为 `Mimi App Backup`；`AppMark` 从设计提供的彩色首字母改为优先显示服务端同源应用图标；`ModeBadge` 少了设计中的锁/警告图标，且多实例文案从“用户隔离 · 多实例”缩短为“多实例”；设计的 `IconButton` 统一提供 `title` 与 `aria-label`，生产页面仍有多处直接使用无 `aria-label` 的图标按钮。真实图标是需求中允许的真实数据调整，其余仍需确认是否要恢复视觉和无障碍细节。 | 图标、应用实例名称和 `deployId` 有；设计首字母、图标形态和无障碍属性不需要 API。 |
| 待处理 | `designs/web.tsx:138-145` | `apps/web/src/ui/components.tsx:13-27`, `apps/web/src/ui/pages.tsx:100-101` | 设计状态徽章按源状态映射图标和颜色，生产已增加双语及服务端状态，但生产 `StatusBadge` 的图标分支没有把 `BACKUPABLE_SHARED_WARNING`、`SUCCEEDED_WITH_WARNINGS`、`EMERGENCY` 等状态完全按设计语义区分（颜色映射虽已覆盖部分状态）；`Toggle` 保留 `aria-pressed` 的设计属性，生产 `SettingToggle` 没有该属性。 | 状态值和设置字段有；图标映射与 `aria-pressed` 是前端行为。 |
| 待处理 | `designs/web.tsx:201-211` | `apps/web/src/ui/App.tsx:14-25` | 设计在 React 内维护模拟登录状态、提示条和弹窗堆栈；生产由服务端会话控制并在 401/403 时转向 OIDC，符合真实数据方向，但生产弹窗没有设计的返回上一级堆栈。生产侧边用户卡还少了设计中的角色和右侧箭头，移动抽屉少了设计中的 OIDC UID 提示。 | 会话、UID、角色均有 `/api/session`；弹窗堆栈和移动抽屉内容是前端行为。 |
| 待处理 | `designs/web.tsx:133`（样式字符串） | `apps/web/src/styles.css:1-7` | 样式文本逐字一致（字符数均为 26,789，去除换行后也一致），本项无 CSS 差异；后续只需复核生产 JSX 是否使用了设计已有的 class。 | 不适用。 |

### 2. 概览页

| 状态 | 源文件 | 生产文件 | 差异描述 | API 可用性评估 |
| --- | --- | --- | --- | --- |
| 待处理 | `designs/web.tsx:149-151` | `apps/web/src/ui/pages.tsx:11-26` | 设计标题为“系统与保护概览”，有“首次使用向导”和“立即备份”两个入口；生产改为“当前保护状态”，两入口均没有。首次使用向导和固定指标已在需求中确认删除；“立即备份”可由应用页完成，但源界面的直达入口仍缺失。 | OIDC/应用和手动备份接口有；首次向导没有独立 API。 |
| 待处理 | `designs/web.tsx:150-151` | `apps/web/src/ui/pages.tsx:17-22` | 设计有 8 个 KPI（可见、可备份、已保护、待首次备份、不支持、24 小时任务、排队/运行、网盘占用）；生产只有 4 个服务端 KPI。设计中的固定配额、吞吐、“预计 9 分钟”等模拟指标按需求应删除；服务端 `succeeded24h`、`failed24h`、`unreadAlerts` 已在 `Overview` 中，但生产没有展示。 | `Overview` 已提供大部分计数，吞吐和预计清空时间无字段。 |
| 待处理 | `designs/web.tsx:151` | `apps/web/src/ui/pages.tsx:23-26` | 保护分布从设计的“正常保护/待首次备份/共享风险/数据库不支持/其他状态”变为生产的“已保护/待首次备份/数据库不支持/无应用数据”；共享风险与其他状态没有单独显示。生产也没有设计中的“查看全部”入口。 | 现有 `Overview` 有 `noDataCount`，没有独立 `sharedRiskCount`/`otherStatus`；应用页可按实例状态筛选。 |
| 待处理 | `designs/web.tsx:151` | `apps/web/src/ui/pages.tsx:23-26` | 设计的“未来 24 小时计划”显示频率、目标数量、时区和状态，生产只显示名称、下次执行和状态；设计每行是展示行，生产整行可点击跳转计划页。 | 计划对象有 `scheduleType`、`targets`、`timezone`、`nextRunAt`，可补齐显示。 |
| 待处理 | `designs/web.tsx:151` | `apps/web/src/ui/pages.tsx:24-26` | 设计的风险提醒有严重级别图标、应用对象和“告警中心”入口；生产只取当前页 `OPEN` 告警，以统一铃铛样式展示标题和时间，没有级别标签，也没有单条关联对象信息。设计最近活动为 4 条固定文案，生产改为服务端审计活动；固定活动按需求应删除。 | 告警级别在 `Alert.level` 中有，但列表查询只支持 `status`；审计活动有 `recentActivity`。 |
| 待处理 | `designs/web.tsx:151` | `apps/web/src/ui/pages.tsx:21,64` | 设计容量卡固定显示 `100.00 GB`、剩余容量和“查看存储”；生产使用 `archiveBytes + availableBytes` 的服务端总量，概览没有“查看存储”按钮。服务端汇总方式符合需求，但直达入口和目录说明不一致。 | `StorageSummary` 有归档和可用容量；没有固定 100 GB 配额字段。 |

### 3. 应用页

| 状态 | 源文件 | 生产文件 | 差异描述 | API 可用性评估 |
| --- | --- | --- | --- | --- |
| 待处理 | `designs/web.tsx:154-158` | `apps/web/src/ui/pages.tsx:32-47`, `apps/web/src/ui/live.ts:42-53,90-95` | 设计有 8 个本地筛选页签：全部、可备份、已保护、未保护、无应用数据、数据库不支持、系统或权限受限、需要重新检测；生产只有搜索、部署模式和备份能力两个下拉框。`protection_status` 已在 OpenAPI 中定义，但生产没有对应筛选；生产也没有页签计数。 | `mode`、`capability_status`、`protection_status` 查询参数有；运行状态、数据库类型、是否含 SQLite 的查询参数没有。 |
| 待处理 | `designs/web.tsx:155-158` | `apps/web/src/ui/pages.tsx:45-47` | 设计还有运行状态、数据库类型、SQLite 有无筛选及“清除筛选”按钮；生产没有这些入口。生产 API 的 `ApplicationInstance` 没有 `runningState` 或单独 `databaseType`，仅提供 `databaseFindings`、`sqliteCount`，因此这些筛选不能直接照搬。 | 运行/数据库/SQLite 筛选无对应后端字段或查询参数；清除筛选是前端可实现。 |
| 待处理 | `designs/web.tsx:157-158` | `apps/web/src/ui/pages.tsx:46-47` | 设计批量选择按 `appid`，提供“批量立即备份”“批量创建计划”“批量重新检测”；生产按决策要求改用 `deployId`，只提供“逐项立即备份”，并用浏览器 `alert` 汇报提交结果，缺少批量建计划、批量重新检测和源设计的状态统计。 | 单实例备份、建计划、实例 probe 接口均有；没有独立批量接口，逐项提交可复用现有接口。 |
| 待处理 | `designs/web.tsx:158` | `apps/web/src/ui/pages.tsx:44-47` | 设计“重新扫描全部”逐个触发本地 `onReprobe`；生产改为一次 `POST /api/applications/sync`，这是符合真实同步模型的功能调整。需要确认按钮完成后是否应显示同步状态或刷新反馈，而不是只等待 SSE/刷新。 | `syncApplications` 有，返回 `SyncStatus`；生产当前没有显式展示同步状态。 |
| 待处理 | `designs/web.tsx:158` | `apps/web/src/ui/pages.tsx:47` | 设计表格 11 列：应用/appid、部署实例、运行/模式、数据概览、数据库特征、可备份性、保护状态、最近备份、下次执行、操作；生产 9 列，合并了应用与 `deployId`，去掉版本、运行状态、目录数、保护状态等信息，立即备份图标从 `Play` 改为 `Archive`。`protectionStatus` 可用但未展示。 | 应用版本、总大小、文件数、SQLite 数、跳过数、保护状态有；运行状态和目录数没有。 |
| 待处理 | `designs/web.tsx:158` | `apps/web/src/ui/pages.tsx:47` | 设计每行操作包括立即备份、创建计划、详情、任务、快照、重新检测；生产只有详情、重新检测、立即备份，计划/任务/快照入口全部移出应用列表。相关弹窗和接口仍存在。 | `startBackup`、`createPlan`、`tasks`、`backups`、`probeInstance` 均有，属于已有 API 可恢复入口。 |
| 待处理 | `designs/web.tsx:184` | `apps/web/src/ui/dialogs.tsx:49`, `apps/web/src/ui/live.ts:112-116` | 设计自定义范围在计划向导中复用递归 `TreePreview` 和本地文件树；生产改为服务端安全相对路径目录查询，并支持搜索、可选标记和下一页。这是安全范围和游标分页要求带来的结构差异，需要确认是否保留设计的树状视觉（API 目录结果本身是扁平列表）。 | `/api/instances/{deployId}/backup-scope`、`q`、`cursor`、`limit`、`selectable` 均有。 |

### 4. 计划页与计划弹窗

| 状态 | 源文件 | 生产文件 | 差异描述 | API 可用性评估 |
| --- | --- | --- | --- | --- |
| 待处理 | `designs/web.tsx:161` | `apps/web/src/ui/pages.tsx:52-54` | 设计计划卡显示目标应用数量、频率和 Cron、下次执行及窗口/补跑规则、最近结果与连续失败次数、最近执行和网盘侧保留提示；生产改为目标实例、计划时间、最近批次状态、保留最近数量和重试次数，但没有窗口/补跑规则及连续失败次数。生产使用 `deployId` 目标，符合决策。 | 计划有 `catchUp`、`maxCatchUpSeconds`、`retry`、`retention`；连续失败次数和计划最近结果没有计划字段，可从批次/任务推导。 |
| 待处理 | `designs/web.tsx:161,192-196` | `apps/web/src/ui/pages.tsx:52-53`, `apps/web/src/ui/dialogs.tsx:61-97` | 设计创建/编辑计划弹窗使用 `PlanRecord` 本地对象，默认首个目标为 `notus-ai`；生产没有假设目标，改为服务端保存并使用安全目录 API，符合真实数据要求。生产编辑时 `notify` 初始值固定为 `true`，没有从已有计划的通知值初始化，可能改变编辑结果；需要复核。 | 创建、更新、范围查询、Cron、重试、保留策略接口有。 |
| 待处理 | `designs/web.tsx:187` | `apps/web/src/ui/dialogs.tsx:104-107` | 计划详情设计显示模式、Cron 可读文本、备份窗口、目标应用预检结果和完整执行规则（补跑、重试、通知、保留）；生产只显示 ID、状态、计划字段、时区、下次执行、重试次数和目标实例范围模式，缺少预检状态与执行规则。 | `BackupPlan` 已包含相关计划字段和目标范围；可直接补齐大部分。 |

### 5. 任务页与任务/批次弹窗

| 状态 | 源文件 | 生产文件 | 差异描述 | API 可用性评估 |
| --- | --- | --- | --- | --- |
| 待处理 | `designs/web.tsx:163` | `apps/web/src/ui/pages.tsx:56-59` | 设计顶部显示运行中、排队中、失败徽章，并在运行队列卡提供暂停/恢复总队列；生产改为禁用“暂停总队列不可用”按钮。需求已确认总队列暂停不提供，但顶部三个计数徽章也一并消失。 | `Overview` 和任务列表可提供计数；服务端没有总队列暂停接口。 |
| 待处理 | `designs/web.tsx:163` | `apps/web/src/ui/pages.tsx:56-57` | 设计当前执行行显示队列位置、计划名、预计大小和阶段进度条；生产只显示应用、`deployId`、任务 ID、计划时间、状态和详情。服务端任务有阶段状态（`LEASED` 至 `COMMITTING`），没有百分比、预计大小或队列位置。 | 阶段状态、计划 ID/批次 ID有；进度百分比、源大小和队列位置无。 |
| 待处理 | `designs/web.tsx:163` | `apps/web/src/ui/pages.tsx:57-59` | 设计任务历史有搜索框（计划、应用、批次、任务 ID）和成功/警告/失败筛选；生产只有服务端 `status` 下拉框，未提供搜索，也未提供警告、运行阶段等完整状态选项。 | 任务查询有 `status`、`batch_id`，没有 `q`；完整状态值在契约中有。 |
| 待处理 | `designs/web.tsx:163` | `apps/web/src/ui/pages.tsx:58-59` | 设计最近批次显示实例任务数量、成功数并有“查看批次”；生产使用服务端批次列表显示状态，整行可点击但不展示任务统计。批次统计字段已可用。 | `BackupBatch` 有总数、成功、失败、跳过、运行中、排队中。 |
| 待处理 | `designs/web.tsx:163,189` | `apps/web/src/ui/pages.tsx:59`, `apps/web/src/ui/dialogs.tsx:109-114` | 设计任务详情包含 11 阶段时间线、源/ZIP 大小、耗时、吞吐、资源状态和完整日志，并可进入生成快照；生产改为任务字段、错误码和尝试记录，符合当前 `TaskDetail` 契约，但没有设计的阶段、日志、统计和快照跳转。 | `TaskDetail` 有尝试记录、快照 ID、错误码；阶段时间、日志、吞吐和资源状态无字段。 |
| 待处理 | `designs/web.tsx:190` | `apps/web/src/ui/dialogs.tsx:116-120` | 设计批次详情可显示成功/警告、失败/是否超窗，并点击实例任务进入任务详情；生产显示服务端状态、成功/失败、运行/排队，实例任务不可点击。生产字段更贴合 API，但缺少批次内任务详情入口。 | 批次状态与统计有；按批次读取任务有；可复用任务详情接口。 |
| 待处理 | `designs/web.tsx:163,206-209` | `apps/web/src/ui/pages.tsx:59` | 生产在任务表新增设计没有的失败重试、排队取消按钮，调用真实 API；该额外入口需要决定是否纳入正式视觉。 | `retryTask`、`cancelTask` 均有。 |

### 6. 备份库、快照弹窗与存储页

| 状态 | 源文件 | 生产文件 | 差异描述 | API 可用性评估 |
| --- | --- | --- | --- | --- |
| 待处理 | `designs/web.tsx:165` | `apps/web/src/ui/pages.tsx:61` | 设计备份库有“按应用/按时间/按计划”页签、搜索和完整性筛选；生产只有服务端游标列表，没有页签和筛选。当前备份列表 API 只定义 `cursor`、`limit`，没有浏览方式、搜索或完整性过滤参数。 | 游标分页有；页签可在当前页本地实现但不能代表全量结果，服务端过滤参数无。 |
| 待处理 | `designs/web.tsx:165` | `apps/web/src/ui/pages.tsx:61` | 设计表格显示完成时间、应用/版本、`deployId`/模式、文件/原始大小、ZIP、SQLite、完整性、最近校验、保留状态；生产显示完成时间、应用/`deployId`、归档大小、文件/SQLite、完整性、存储状态。版本、模式、原始大小、最近校验、保留状态没有展示。 | `Snapshot` 有应用版本、模式、原始大小、`verifiedAt`、保留状态和存储状态；除“最近校验”文案外均可补齐。 |
| 待处理 | `designs/web.tsx:188` | `apps/web/src/ui/dialogs.tsx:122-126` | 设计快照详情包含应用头部、版本、捕获/完成时间、模式风险、目录状态、网盘路径、范围摘要、原始大小、SQLite 副本、计划/批次/任务 ID、可搜索的前 30 条 ZIP 路径及 SHA-256，并可查看关联任务；生产详情显示归档字段和服务端文件索引（类型/大小/修改时间），但缺少应用头部、捕获时间、模式、范围/跳过/警告、计划/批次/任务关联、搜索和关联任务入口。 | 生产 `Snapshot` 已有大部分元数据；`SnapshotFile` 没有 SHA-256，且快照详情接口没有任务跳转动作字段以外的 UI。 |
| 待处理 | `designs/web.tsx:188,209` | `apps/web/src/api/client.ts:142-151`, `apps/web/src/ui/dialogs.tsx:122-126` | 设计与生产都没有在快照详情显示“验证”或“导出”按钮，符合当前 V1 快照详情不提供导出入口；客户端已有 `verifyBackup`、`verifyBackupFull`、`exportBackup`，属于接口能力与界面能力不一致，后续需保持明确的 V1 删除结论。 | 验证和导出接口有；按 PRD 当前界面不应显示导出。 |
| 待处理 | `designs/web.tsx:167` | `apps/web/src/ui/pages.tsx:63-64` | 设计存储页除容量卡外还有“重建快照索引”、固定目录结构、维护摘要、占用最大的应用三块；生产仅保留服务端容量/临时目录/最近校验四项和扫描按钮。设计重建按钮与维护摘要多为模拟或静态信息，需求未提供对应 API。 | `scanStorage` 有；没有重建索引、维护摘要、按应用占用汇总接口。 |
| 待处理 | `designs/web.tsx:167` | `apps/web/src/ui/pages.tsx:64` | 设计使用固定 `100 GB` 配额和 `INITIAL_APPS` 计算占用最大的应用；生产采用服务端 `availableBytes`，不再显示固定配额或模拟应用数据，符合需求删除固定配额/演示数据。需要确认是否保留不带固定数值的目录结构说明。 | 存储汇总有；目录结构是产品约束文本，不是 API 数据。 |

### 7. 告警页与告警弹窗

| 状态 | 源文件 | 生产文件 | 差异描述 | API 可用性评估 |
| --- | --- | --- | --- | --- |
| 待处理 | `designs/web.tsx:169` | `apps/web/src/ui/pages.tsx:67-72` | 设计按 `info/warning/critical/urgent` 级别筛选；生产按 `OPEN/MUTED/RESOLVED` 状态筛选。服务端只支持状态参数，因此生产筛选更符合 API，但源界面级别筛选没有对应查询参数。 | 状态筛选有；级别筛选只能在已加载页面本地做，无法保证全量。 |
| 待处理 | `designs/web.tsx:169` | `apps/web/src/ui/pages.tsx:71` | 设计每张卡有级别图标、未读点、应用对象、发生时间、告警说明和针对该告警的修复建议；生产显示“告警”标签、级别、类型、时间和服务端消息，修复建议是统一静态文案，且没有未读点。`Alert` 契约没有应用名和 guidance 字段。 | `Alert.level/type/message/referenceType/referenceId/status/readAt` 有；应用名和具体 guidance 无。 |
| 待处理 | `designs/web.tsx:169,209` | `apps/web/src/ui/pages.tsx:71`, `apps/web/src/ui/dialogs.tsx:128-130` | 设计“立即重试”只更新本地告警状态；生产对高严重级别仍显示“立即重试”，但点击后只是打开告警详情，没有调用备份/任务重试接口。该文案会造成操作预期不一致。 | 没有通用告警重试接口；可根据 `referenceType/referenceId` 关联对象后再决定是否调用任务重试。 |
| 待处理 | `designs/web.tsx:169` | `apps/web/src/ui/pages.tsx:71` | 设计可逐条标记已读、临时静默和查看关联对象；生产调用真实 `readAlert`/`muteAlert`，并把“全部标记为已读”限制在当前已加载页，符合分页模型。生产没有“处理/resolve”操作，虽客户端已有 `resolveAlert`。 | 已读、静默、处理接口均有；resolve 入口缺失。 |
| 待处理 | `designs/web.tsx:209` | `apps/web/src/ui/dialogs.tsx:128-130` | 设计告警弹窗显示标题、消息、修复建议、关联对象、告警时间和已读状态；生产显示类型、状态、创建时间、关联类型和关联 ID，字段更接近服务端契约，缺少源设计的 guidance/应用文案。 | 服务端字段可支持生产现状；guidance 无。 |

### 8. 设置页

| 状态 | 源文件 | 生产文件 | 差异描述 | API 可用性评估 |
| --- | --- | --- | --- | --- |
| 待处理 | `designs/web.tsx:171-181` | `apps/web/src/ui/pages.tsx:74-98` | 设置页分区菜单、入口卡片和总体布局保持一致；生产增加中英文切换、服务端读取/保存和分页审计列表，设计为中文静态内容。此项属于真实数据与国际化调整，需要逐项确认文案而非回退静态文本。 | `settings`、`updateSettings`、`audit` 和 `cursor` 均有。 |
| 待处理 | `designs/web.tsx:174` | `apps/web/src/ui/pages.tsx:90` | 设计账户页有“模拟会话过期”按钮；生产移除该模拟入口，改为真实重新登录、重新验证和退出登录。模拟按钮属于设计演示行为，按需求应删除；生产重新登录/重新验证均跳 OIDC，退出调用 `/auth/logout`。 | OIDC 登录/退出有；模拟过期无，也不应新增。 |
| 待处理 | `designs/web.tsx:175-179` | `apps/web/src/ui/pages.tsx:91-95` | 设计外观、备份偏好、通知、审计、权限环境均使用本地或固定值；生产能保存 locale/timezone/catchUp/retry/notify 字段，但系统通知、连续失败升级、空间不足、超出窗口、每日摘要等开关仍只在当前页面更新并提示“没有服务端保存字段”。 | OpenAPI `Settings` 仅有 locale、timezone、catchUp、retry、retention、notifyFirstFailure、notifySuccess；其余字段无。 |
| 待处理 | `designs/web.tsx:178` | `apps/web/src/ui/pages.tsx:94` | 设计审计区展示固定的两条记录和“最近索引重建”时间；生产改为当前租户审计游标列表，并显示服务端最新记录，符合真实数据要求，但缺少“索引重建”说明。 | 审计接口和分页有；没有索引重建时间字段。 |
| 待处理 | `designs/web.tsx:179` | `apps/web/src/ui/pages.tsx:95` | 设计权限环境显示当前应用数量、LzcOS 版本和后台运行状态；生产显示当前应用数量、后台运行状态和当前租户，移除了固定的 LzcOS `v1.4.8`。固定版本按需求不应保留。 | 当前租户、应用数量有；LzcOS 版本无。 |

### 9. 弹窗路由、登录页与数据层

| 状态 | 源文件 | 生产文件 | 差异描述 | API 可用性评估 |
| --- | --- | --- | --- | --- |
| 待处理 | `designs/web.tsx:208-209` | `apps/web/src/ui/App.tsx:21,25`, `apps/web/src/ui/dialogs.tsx:9-35` | 设计弹窗类型包括 setup、confirm/shared、batch-confirm、app、plan、job、batch、snapshot、alert、plan-wizard，并支持返回上一级；生产类型改为 app、backup、plan、plan-detail、task、batch、snapshot、alert，没有 setup、批量确认、confirm/shared 分支，也没有弹窗堆栈返回。首次向导按需求删除；其余跨详情入口需确认。 | 单备份、计划、任务、批次、快照、告警接口有；弹窗堆栈是前端行为。 |
| 待处理 | `designs/web.tsx:209` | `apps/web/src/ui/dialogs.tsx:20-23` | 设计关闭按钮有 `aria-label="关闭"`、16px 图标，且可通过设计的返回按钮回到上级详情；生产关闭按钮没有 aria-label，图标默认尺寸，弹窗头没有返回按钮。 | 不适用，属于前端无障碍与交互。 |
| 待处理 | `designs/web.tsx:186,209` | `apps/web/src/ui/dialogs.tsx:41-58` | 设计应用详情展示运行状态、数据目录状态、数据大小/文件/目录/SQLite/跳过项、只读数据范围树、保护状态/历史成功率，并提供创建/编辑计划、查看任务历史、查看备份库；生产应用详情只显示基本字段、数据库检测和关联计划，缺少上述数据概览、范围树、保护状态和三个操作按钮。 | 应用详情字段大部分来自 `ApplicationInstance`；目录树需另读 backup-scope，历史成功率需从任务/快照推导；三个关联接口均有。 |
| 待处理 | `designs/web.tsx:209` | `apps/web/src/ui/dialogs.tsx:55-59` | 设计立即备份确认显示文件数、SQLite 数、共享实例二次提示、“立即执行/我已了解并继续”；生产只显示 `deployId` 和总字节，按钮为“立即入队”，没有第二条“不写回/不直接恢复”提示。需求允许单实例直接入队，但视觉提示内容仍有差异。 | 手动备份接口有；共享风险字段由应用实例提供，确认参数已标为兼容字段。 |
| 待处理 | `designs/web.tsx:192-196` | `apps/web/src/ui/dialogs.tsx:61-97` | 计划向导四步结构基本保留，但生产把范围改为服务端安全目录和游标、把目标键改为 `deployId`，符合需求；生产 Cron 有效提示从设计的“解析执行时间”改为“Cron 格式有效”，且编辑已有计划时通知开关默认值固定为 true，需修正或确认。 | 计划及范围 API 有；Cron 解析字段由服务端校验。 |
| 待处理 | `designs/web.tsx:199` | `apps/server/internal/httpapi/auth_page.go:48-101`（生产登录页不在 `apps/web/src/ui`） | 设计登录视图嵌在 React 中，有 `LAZYCAT OIDC` 提示、锁图标提示和“使用懒猫账号登录”按钮；生产由 Go 渲染真实 OIDC 页面，保留浅色画布、品牌和显式 POST 登录，但没有锁图标提示，品牌副标题和按钮文案略有差异，图标路径为 `/assets/lzc-icon.png`。 | `/auth/login`、`return_to`、OIDC 回调和身份不一致提示均有；不是前端 API 缺失。 |
| 待处理 | `designs/web.tsx:202-209` | `apps/web/src/ui/live.ts:4-119`, `apps/web/src/api/client.ts:112-177` | 设计数据来自本地 `INITIAL_*` 并模拟备份进度；生产通过一次 `useLiveBackupData` 并行读取 session/overview/应用/计划/任务/批次/快照/存储/告警/设置/审计，SSE 1.2 秒合并、15 秒重连、分页状态保留，符合需求。差异主要是生产不再填充模拟记录，需在真实平台补充空数据、401/403、分页和 SSE 状态的界面核验。 | 所需 REST、SSE、游标与错误码客户端均有；真实平台证据仍待执行。 |

## UI parity checklist — 处理状态（2026-08-30）

下表覆盖本次已处理的审计项；原始清单保留审计当时的快照和行号。`已完成`指生产界面已经以真实接口恢复该项，`按决策保留`指该项没有可用接口或已明确禁止保留模拟数据。

| 状态 | 审计项 | 当前处理结果 |
| --- | --- | --- |
| 已完成 | 全局壳层与共用组件 | 已恢复 `MIMI APP BACKUP · V1` 眉题、模式徽章的锁/警告图标和文案、状态徽章的语义图标，以及开关的 `aria-pressed`。侧边栏按本次需求移除了 `Workspace`、英文应用名和版本号。应用图标只加载服务端返回的同源地址，避免外部地址在打开页面时获取用户网络信息。 |
| 已完成 | 概览页 | 已恢复“系统与保护概览”、立即备份入口、8 个真实 KPI、保护概览/计划/告警直达入口，以及计划频率、目标数和时区。首次使用向导、固定配额和模拟吞吐指标按既有决定继续删除。 |
| 已完成 | 应用页 | 已恢复 8 个可由接口支持的筛选页签、清除筛选、`deployId` 批量建计划和逐项重新检测；列表接入真实数据库检测结果、保护状态、版本、数据统计，以及立即备份、建计划、详情、按实例查看任务、跨快照分页查找详情和重新检测操作。 |
| 已完成 | 计划向导 | 计划目标不再依赖应用页当前 15 条记录：向导使用专用的应用搜索/游标数据源，并能回读已编辑计划的目标。自定义范围进入第三步会自动读取安全目录；未选中任何目录或文件时不能保存。通知开关现在保存到真实的全局通知设置。 |
| 已完成 | 任务与批次 | 任务页恢复真实运行/排队/24 小时失败计数；批次显示任务、成功和失败统计并使用游标分页。按应用打开任务页使用 `deploy_id` 查询；批次内任务可打开详情，任务详情可打开关联快照。总队列暂停仍保持禁用，因为服务端没有该接口。 |
| 已完成 | 表格与分页 | 应用、任务、快照表的操作标题及按钮统一右对齐，操作按钮改用源设计相同的小图标尺寸；所有服务端游标列表默认每页 15 条并可切换 15/30/50/100 条。 |
| 已完成 | 游标范围校验 | 游标已绑定当前租户、查询类型和已支持的筛选条件；把游标用于其他筛选、其他应用范围或其他租户时，服务端返回 `INVALID_CURSOR`，前端从第一页重新读取。 |
| 已完成 | 备份库与快照详情 | 快照表已显示应用版本、部署模式、原始大小、ZIP、SQLite、校验时间、保留和存储状态。快照详情已增加应用头部、捕获时间、模式、范围、跳过/警告、关联 ID、前 30 条可搜索文件索引和关联任务入口；逐文件 SHA-256 没有 API 字段，因此不显示。 |
| 已完成 | 告警页 | 已补未读点；查看关联对象会按真实引用打开任务、快照或应用；任务引用才显示并调用重试，其他告警不再显示无效的“立即重试”；已补真实的已处理操作。 |
| 已完成 | 设置页 | 删除所有仅在当前页面翻转、但没有 API 字段的通知开关；保留并保存接口支持的语言、时区、补跑、重试、首次失败通知和成功通知。审计列表已接入分页。 |
| 已完成 | 弹窗路由 | 已恢复弹窗堆栈的“返回上一级”操作；关闭按钮补齐标签和 16px 图标。 |
| 按决策保留 | 无接口/演示字段 | 运行状态、目录数量、百分比进度、任务日志和吞吐、逐文件 SHA-256、固定 100 GB 配额、索引重建、LzcOS 固定版本、计划连续失败次数、告警具体修复文案和全量级别筛选继续不显示；这些字段没有真实接口，或属于已经禁止的演示数据。 |
