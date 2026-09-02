# Bug 台账

本台账记录已经影响现有承诺、设计或实现的缺陷。产品需求和功能改进继续记录在 `Requirements/`，阶段进度继续记录在 `Progress/`。

## 状态约定

- `待定位`：现象已确认，根因尚未找到。
- `修复中`：根因已确认，修复尚未完成。
- `待验证`：本地修复完成，仍需目标环境确认。
- `已修复`：修复完成，所需验证已经取得。
- `已缓解`：影响已受控，根因仍未完全消除。

## 当前记录

| ID | 状态 | 严重程度 | 问题 | 根因 | 关闭证据 |
| --- | --- | --- | --- | --- | --- |
| BUG-20260831-001 | 已修复 | 高 | 正式 UI 所有页面数据长期加载，应用列表与设置页超时，入口代理记录 `context canceled` | SQLite 单连接下嵌套查询自锁；设置请求被目录同步顺序阻塞 | Go/Vite/LPK 检查通过；2026-08-31 用户完成真机回归并确认无问题 |
| BUG-20260831-002 | 待验证 | 高 | 普通用户登录后只能看到自己安装的 10+ 个应用，无法看到管理员安装的其余已安装应用；产品实际要求所有登录用户共同使用全部已安装应用 | 目录同步将 `only_owner=true` 且按 `owner == gateway_uid` 过滤，错误地把应用安装者当成使用权限边界 | Go/Vite 构建与 LPK 检查通过；待普通用户升级后验证应用目录与管理员一致 |
| BUG-20260831-005 | 待验证 | 中 | LightOS 与 Totoro 显示“需要重新检测”和 `PROBE_FAILED` | 探测器超过目录项上限时返回普通错误，目录同步将它压缩成通用失败状态 | Go/Vite/LPK 检查通过；待真实设备回归 |
| BUG-20260831-004 | 待验证 | 中 | 右上角 `.toast` 可能持续显示 `zh-CN` | 首屏数据就绪会自动触发 toast；toast 入口未拒绝语言代码，页面级定时器也未统一清理 | Go/Vite 构建与差异检查通过；待真机确认首屏无持续 toast |
| BUG-20260901-006 | 待验证 | 中 | 设置页开启成功通知后，备份完成没有懒猫系统消息 | 任务终态只写入站内事件/告警，从未调用 `user.notify` 对应的 MessageService | Go 编译通过；待真实设备确认成功/失败消息与可选权限降级行为 |
| BUG-20260901-008 | 待验证 | 高 | 定时自定义范围包含 SQLite 时任务以 `SQLITE_SNAPSHOT_FAILED` 失败 | Online Backup 对 `BUSY/LOCKED` 只重试约 150ms，漏掉部分锁错误形式；源 SQLite URI 未转义特殊文件名 | Go/Vite 构建与差异检查通过；待真实设备在繁忙 SQLite 与自定义范围下回归 |
| BUG-20260901-007 | 待验证 | 低 | 英文登录页仍显示固定中文文案和版本眉题 | 品牌副标题、眉题和说明文字写死在 Go 登录页模板之外，未纳入中英文文案对象 | Go/Vite/LPK 检查通过；待确认英文浏览器登录页只显示英文文案 |

## BUG-20260901-006：成功通知开关没有触发懒猫系统消息

- **状态：** 修复待真机验证
- **发现日期：** 2026-09-01
- **严重程度：** 中
- **关联决定：** `DEC-20260901-016`
- **关联进度：** `Progress/PROG-REQ-20260901-012-active-notification.md`
- **影响范围：** 设置页成功通知、首次失败通知、手动和定时备份任务终态
- **未受影响边界：** 备份快照、当前租户站内告警、审计、`appvar.other.read`、目标应用只读和当前用户网盘写入

### 现象与根因

设置页的 `notifySuccess` 会通过 `PUT /api/settings` 保存到当前租户控制库，但队列任务完成后只发布 `task.updated` 事件；失败任务另外创建站内告警。服务端没有任何懒猫系统消息调用，所以开关改变后不会出现主动通知。

### 修复

新增 `platform.SDKNotifier`，使用懒猫 SDK 的 `common.MessageService.NewMessage` 创建普通消息。请求以当前租户 UID 填充 `receiver`，并通过 `gohelper.WithRealUID` 绑定 API Gateway 上下文。`operations.Service.TaskUpdated` 在 `SUCCEEDED`、`SUCCEEDED_WITH_WARNINGS`、`FAILED` 和 `TIMED_OUT` 终态读取通知设置，按开关发送消息；正文只包含应用名称，`meta` 只包含任务、批次、应用实例和状态标识符。

`user.notify` 是可选权限。消息服务拒绝、网关不可用或连接超时只记录服务端日志，不改变已完成的备份任务、快照、站内告警或审计。

### 验证与待补证据

- `gofmt` 与 `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`：通过。
- 未运行测试套件，遵守项目验证规则。
- 真实懒猫设备待确认：开启成功通知后手动和定时备份能收到系统消息；关闭开关后不发送；缺少可选 `user.notify` 时备份仍能完成并保留站内结果。

## BUG-20260901-008：定时自定义范围的 SQLite 快照过早失败

- **状态：** 待验证
- **发现日期：** 2026-09-01
- **严重程度：** 高
- **关联需求：** `REQ-20260829-007`、`REQ-20260827-002`
- **关联进度：** `Progress/PROG-REQ-20260829-007-selective-backup-scope.md`、`Progress/PROG-REQ-20260901-012-active-notification.md`
- **影响范围：** 包含标准 SQLite 的定时自定义范围任务；任务失败后的系统消息
- **未受影响边界：** `appvar.other.read`、目标应用只读、SQLite 失败不降级为普通文件复制、当前用户网盘写入和租户隔离

### 现象与根因

任务中心原先只保留稳定错误码 `SQLITE_SNAPSHOT_FAILED`，不会返回源数据库路径或驱动原始错误。静态排查发现 Online Backup 对锁竞争只有三次 50ms 递增等待，约 150ms 后就把正常的应用写入窗口视为失败；`database table is locked` 和 `SQLITE_LOCKED` 也不在旧判断范围内。源数据库以字符串拼接为 `file:` URI，路径中的 `?`、`#` 或非 ASCII 字符会被 SQLite URI 解析器误解。

2026-09-01 真机复查确认，本次失败目标为 `cloud.lazycat.app.mrslimslim.gpt-image-canvas`。新包的最后一次 Online Backup 尝试持续 31 秒后失败，正好耗尽 30 秒窗口；目标 Node 进程 PID 35263 持有 `gpt-image-canvas.sqlite` 的 SQLite POSIX 写锁（锁区 `1073741824–1073742335`）。这属于持续独占锁，不是普通短暂写入，也没有数据库损坏证据；同目录保留的 journal 文件头为全零，符合持久 journal 的非活动状态。

### 修复

源和临时目标数据库改用标准编码的 `file:` URI；源连接保持只读，临时目标保持短生命周期可写。两个连接都配置 5 秒 SQLite busy timeout。Online Backup 遇到 `BUSY` 或 `LOCKED` 时在 30 秒有界窗口内退避重试；窗口耗尽时记录稳定错误码 `SQLITE_SOURCE_LOCKED`，任务中心显示“暂停目标应用后重新执行备份”的中英文提示。其他 SQLite 错误、任务取消或上下文超时仍保留原有错误码。快照失败不降级为普通文件复制，也不自动停止或写入目标应用。

通知链路已接入任务终态回调：成功完成读取 `notifySuccess`，失败或超时读取 `notifyFirstFailure`，再以任务所属租户作为 `MessageService` 接收者。消息服务不可用只记录服务端日志，不改变任务和快照结果。

### 验证与待补证据

- 设备运行的 2026-09-01 包已确认包含 30 秒退避逻辑；失败任务完成四次尝试后才进入最终失败，说明普通锁竞争处理已执行。
- 2026-09-01：`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`npm run build --prefix apps/web`、`lzc-cli project build -o cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`、`lzc-cli lpk info`、`lzc-cli lpk lint` 和 `git diff --check` 通过。新 LPK 为 19.04 MiB（19,962,880 bytes），SHA-256 `f9ec7f007a9555c2f3e3585f10950db017e4516e4a6180af579d539cceea75d2`；未部署或发布。
- 未运行测试套件，遵守项目验证规则。
- 未运行测试套件，遵守项目验证规则。
- 真实懒猫设备需先暂停 `cloud.lazycat.app.mrslimslim.gpt-image-canvas`，再在任务中心对失败任务执行“重试”；预期生成一致 SQLite 快照。随后保持该应用运行并再次执行，可确认任务记录 `SQLITE_SOURCE_LOCKED`、不会产生不一致的普通文件副本，并只在最终失败时发送一次失败通知。

## BUG-20260901-007：英文登录页文案未完整国际化

- **状态：** 待验证
- **发现日期：** 2026-09-01
- **严重程度：** 低
- **关联需求：** `REQ-20260830-008`
- **影响范围：** 未登录用户访问 `/auth/login` 时的品牌和登录说明

### 现象与根因

登录页虽然根据 `Accept-Language` 选择标题、主标题和按钮，但品牌副标题 `MIMI BACKUP · V1`、眉题 `MIMI APP BACKUP` 和中文说明固定写在模板中。英文浏览器因此仍会看到未翻译或不必要的文案。

### 修复

登录页文案对象新增按语言选择的品牌名称，移除版本副标题、眉题和登录说明；`html lang` 使用 `en-US` 或 `zh-CN`，主标题、按钮和身份不一致提示继续按请求语言返回。同步清理 OIDC 登录设计稿中的同类固定文案。

### 验证与待补证据

- `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`：通过。
- `(cd apps/web && npx vite build)`：通过。
- `lzc-cli project build -o cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`：通过。
- `lzc-cli lpk info` 与 `lzc-cli lpk lint`：通过，无警告。
- 真实设备待确认：英文浏览器访问登录页时无中文固定文案，中文浏览器仍显示中文品牌和登录按钮。

## BUG-20260831-002：普通用户应用目录被错误按安装者过滤

- **状态：** 待验证
- **发现日期：** 2026-08-31
- **关联需求：** `REQ-20260830-008`
- **关联进度：** `Progress/PROG-REQ-20260830-008-web-ui-api-pagination.md`
- **影响范围：** 应用列表、应用探测、应用概览计数、设置页当前用户应用数量

### 根因

应用安装者 `owner` 只代表平台上的安装来源，不代表应用是否可被其他登录用户使用。旧修复把普通用户目录查询固定为 `only_owner=true`，并在服务端再次过滤 `owner == gateway_uid`，导致普通用户只能看到自己安装的 10+ 个应用；管理员的全量结果反而符合产品预期。

### 修复

1. 已认证的应用目录请求仍从会话 `gateway_uid` 创建租户绑定的目录服务。
2. SDK 使用 `WithRealUID(gateway_uid)`，但 `only_owner=false`，不按返回的 `owner` 过滤。
3. 所有登录角色都执行同一份全量目录同步；应用服务进程首次收到某个租户请求时强制执行一次同步，替换旧范围逻辑遗留的目录结果。
4. 概览、设置、告警、审计、事件和概览存储汇总仍按当前会话租户读取；不启用 `other_uid`，不提供控制库和网盘的跨租户查询。

### 验证

- 本地通过 Go 服务端构建、Vite 生产构建、`git diff --check`、LPK 信息检查和 lint；产物 SHA-256 为 `9b1bdcf45aeb9ad81e1677c8af7d4d243bcfb5d3643c8fa96973abdbedd8aa40`。
- 真实设备仍需安装包含本修复的 LPK，使用管理员和普通用户分别登录，确认两者应用目录总数一致，同时两者的计划、任务、快照和网盘记录继续隔离。
| BUG-20260831-003 | 待验证 | 中 | 应用“重新检测”没有成功提示，且可能在同步状态写入前读回旧列表 | 探测接口异步启动全量同步；同步状态在 API 响应后才落库，前端丢弃受理结果 | Go 编译和 Vite 构建通过；真实设备待确认 |

## BUG-20260831-003：应用重新检测缺少反馈且可能不触发后续刷新

- **状态：** 待验证
- **发现日期：** 2026-08-31
- **严重程度：** 中
- **关联需求：** `REQ-20260831-011`
- **影响范围：** 应用页单项/批量重新检测、应用目录同步状态和 `PROBE_FAILED` 展示
- **未受影响边界：** OIDC、当前 tenant 过滤、`appvar.other.read`、目标应用只读和当前用户网盘写入

### 现象与定位

单项重新检测调用 `POST /api/instances/{deployId}/probe`，服务端实际启动的是当前 tenant 的全量目录同步，并非浏览器本地刷新。前端请求成功后只重读一次列表，没有显示成功提示；在后台协程尚未把 `catalog_syncs` 写为 `RUNNING` 时，这次读取仍可得到旧结果，因而不会继续轮询到新探测结果。

`PROBE_FAILED` 是后端源解析或探测器返回错误后写入控制库的状态，不表示前端列表尚未加载。修复将把 `RUNNING` 在 API 返回前持久化，前端明确提示“已提交，正在同步”，并显示服务端返回的探测失败码。

### 修复与待补证据

同步协调器现在先把 `catalog_syncs` 写为 `RUNNING`，再启动后台全量目录扫描；启动失败会返回稳定错误码。单项和批量重新检测在 202 受理后显示站内提示，`PROBE_FAILED` 行展示 `probeErrorCode`。Go 编译和 Vite 生产构建已通过。

真实懒猫设备仍需确认：点击图标后立即出现提示，应用页保持同步状态并在终态后刷新；对持续失败的实例按页面显示的错误码核对 appvar 投影和数据目录。

## BUG-20260831-005：Totoro 被错误归类为需要重新检测

- **状态：** 待验证
- **发现日期：** 2026-08-31
- **严重程度：** 中
- **关联需求：** `REQ-20260831-011`
- **关联决定：** `DEC-20260831-014`
- **影响范围：** `cloud.lazycat.totoro` 的应用行、应用筛选和重新检测操作
- **未受影响边界：** 当前 tenant 目录查询、`appvar.other.read`、目标应用只读、当前用户网盘写入

### 排查结论

这不是前端异步加载或同步状态没有落库。重新检测接口在返回前已经把 `catalog_syncs` 写为 `RUNNING`，探测结束后 `ReplaceInstances` 会把 `capability_status` 和 `probe_error_code` 一起持久化。截图里的终态是后端已经保存的结果。

Totoro 商店说明明确其每个助手运行在独立隔离的 LightOS 文件系统。当前备份应用只能读取已验证的 `/lzcapp/run/data/app/var` appvar 投影；LightOS 开发文档、现有 SDK 和包权限没有提供第三方 LPK 读取该隔离文件系统的按实例 API。SDK 的 `AppInfo` 也没有 LightOS 类型或数据源类型字段，因此不能可靠地用商店标签或应用 ID 做分类。旧代码把源解析和文件遍历的非超时错误压缩为 `PROBE_FAILED`，页面因此同时显示“需要重新检测”和同名失败码。

之前的投影和权限分类已覆盖路径错误与权限错误，但扫描器超过 100,000 个目录项时返回普通文本错误。分类器无法识别该错误，最终落入 `PROBE_FAILED` 兜底。这个分支不经过异步状态写入，因而不能由前端刷新或状态更新时序造成。

没有真机服务日志时，无法从旧包确认 LightOS 与 Totoro 的实际目录项数量；代码已经把这条确定的未分类路径改为稳定原因码，设备回归将确认它们是否命中扫描上限。

### 修复方向与验证

目录同步以 appvar 投影能力和扫描边界通用分类：投影根、应用候选目录或遍历路径缺失、不可访问或返回路径错误时，写入 `SYSTEM_UNSUPPORTED/SOURCE_PROJECTION_UNAVAILABLE`；实际权限拒绝写为 `SYSTEM_UNSUPPORTED/SOURCE_PERMISSION_DENIED`；全局投影不可见写为 `SYSTEM_UNSUPPORTED/RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE`。扫描超过 100,000 个目录项时，探测器返回 `ErrEntryLimitExceeded`，目录同步写为 `SYSTEM_UNSUPPORTED/SOURCE_ENTRY_LIMIT_EXCEEDED`。没有应用 ID 白名单。未分类探测异常继续保留 `PROBE_FAILED`，方便后续在真机日志中定位。

本轮 Go 编译、Vite 生产构建、`git diff --check`、LPK 重新打包、信息检查和 lint 均通过。产物为 `cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`，SHA-256 为 `2b2da63e7a438fad3c6ea37c61068a7ffa4e37dc93434af48c4007d9a442155f`。真实设备需要确认 LightOS 与 Totoro 显示“系统或权限受限”，以及一个普通 appvar 应用可以继续完成重新检测。

## BUG-20260831-004：语言代码被留在右上角 toast

- **状态：** 待验证
- **发现日期：** 2026-08-31
- **严重程度：** 中
- **关联需求：** `REQ-20260831-011`
- **影响范围：** 首屏读取、应用重新检测、设置保存和确认操作的站内 toast
- **未受影响边界：** `html lang`、语言选择、OIDC、当前 tenant 过滤、`appvar.other.read`、目标应用只读和当前用户网盘写入

### 现象与修复

浏览器检查结果显示固定右上角元素为 `.toast`。`<html lang="zh-CN">` 仅是语言元数据，不产生可见元素，不修改此属性。
前端已取消首屏数据就绪后的自动 toast。全局、应用页和设置页的提示入口现在只接受非空的人类可读文本，拒绝 `zh-CN` 和 `en-US`；发出新提示时清理旧定时器，页面卸载时也取消定时器。

### 验证与待补证据

本地已通过 Go 编译、Vite 生产构建、`git diff --check`、LPK 信息检查与 lint。产物为 `cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`，SHA-256 为 `29c074c1faf4212fd8537479b0fcda1a5f877fe16bae1cc4b36064dee12d6111`，包内保留 `html lang="zh-CN"` 且不含首屏自动 toast 文案。真实懒猫设备仍需确认：首屏 loading 结束后不出现右上角 toast；重新检测、设置保存和确认操作仍显示不超过 3 秒的可读提示。

## BUG-20260831-001：正式 UI 数据读取超时与代理取消

- **状态：** 已修复
- **发现日期：** 2026-08-31
- **关闭日期：** 2026-08-31
- **严重程度：** 高
- **关联需求：** `REQ-20260830-008`
- **关联进度：** `Progress/PROG-REQ-20260830-008-web-ui-api-pagination.md`
- **影响版本：** LPK `0.1.2`
- **当前包标识：** `cloud.lazycat.app.mimi-app-backup`
- **影响范围：** 正式 React UI、`GET /api/applications`、设置初始化、LZC HTTP 入口代理日志
- **未受影响边界：** OIDC 身份校验、租户隔离、`appvar.other.read`、目标应用数据只读、当前用户网盘写入规则

### 用户可见现象

1. 前端迁移为正式 UI 后，应用、概览、计划、任务、备份库、存储、告警和设置页面长期没有数据。
2. 页面显示“正在读取”或“请求等待超时，请重新加载”。
3. 设置页持续显示“正在读取设置”。
4. LZC 入口代理输出两条相同日志：

   ```text
   app-1 | 2026/08/31 12:29:31 http: proxy error: context canceled
   app-1 | 2026/08/31 12:29:31 http: proxy error: context canceled
   ```

### 运行日志与时间线

设备日志提供了以下顺序：

```text
12:28:59 app route -> http://web.cloud.lazycat.app.backup.lzcapp:8080
12:28:59 web-1 INFO starting backup V1 server address=:8080
12:29:01 Internal health check successful
12:29:31 http: proxy error: context canceled
```

`web-1` 的启动日志证明 Go 服务已启动。两秒后的内部健康检查成功，证明 `:8080/api/health` 可达，入口路由也已经指向当时包内的 `web` 服务。约 30 秒后出现的代理取消与页面请求等待超时一致。

### 排除项

| 怀疑项 | 证据 | 结论 |
| --- | --- | --- |
| 后端没有重启或仍在运行旧实例 | 同一轮日志包含新的服务启动时间和成功健康检查 | 排除 |
| 后端 API 没有接入正式 UI | `apps/web/src/ui/live.ts` 已调用 session、applications、overview、plans、tasks、batches、backups、storage、alerts、settings 和 audit 接口；请求已经进入应用服务 | 排除 |
| LPK 打包目录缺少新前端 | LPK 构建包含带内容哈希的 Vite JS/CSS、Go 二进制和 `index.html`，包内清单可正常读取 | 排除 |
| 浏览器缓存一直返回旧页面 | API 与 `index.html` 使用 `no-store`，Vite 资源文件名包含内容哈希 | 不是本次持续超时的根因 |
| 包版本或包标识直接导致请求超时 | 不同包标识下均能启动、通过健康检查并进入业务请求 | 不是本次持续超时的根因；包标识仍需与内部服务域名一致 |

### 根因一：SQLite 单连接自锁

控制数据库在 `persistence.Open` 中设置 `db.SetMaxOpenConns(1)`。这是当前 SQLite 控制库的既有串行连接约束。

`Store.ListInstances` 原先执行以下流程：

1. 调用 `s.db.QueryContext` 查询应用实例列表并取得 `rows`。
2. 在 `for rows.Next()` 内扫描一个实例。
3. 在外层 `rows` 尚未关闭时调用 `s.findings(...)`。
4. `s.findings` 再次通过同一个 `*sql.DB` 调用 `QueryContext`。

外层结果集占用唯一连接，内层查询等待同一个连接；外层循环又必须等内层查询返回后才能结束并关闭结果集。两者互相等待，`GET /api/applications` 一直无法完成。

页面读取超时后取消请求，请求上下文随之结束。LZC 入口代理正在等待上游响应，因此记录 `http: proxy error: context canceled`。该日志描述的是请求被下游取消，单独出现时不等于后端崩溃；本次它与持续加载、应用列表超时同时出现，取消原因来自被自锁阻塞的业务请求。

### 根因二：设置读取依赖了应用目录同步

前端原先按以下顺序串行读取：

```text
session → applications → overview → plans → tasks → batches
→ backups → storage → alerts → settings → audit
```

应用列表自锁时，刷新流程在 `applications` 处提前结束，`settings` 请求不会发出。即使应用请求成功，只要目录同步状态为 `RUNNING`，刷新流程也会提前返回，设置页仍会停留在“正在读取设置”。设置表自身使用单次 `QueryRowContext`，没有发现同类嵌套查询问题。

### 修复

后端修复位于 `apps/server/internal/persistence/store.go`：

1. 先完整扫描应用列表并检查 `rows.Err()`。
2. 显式关闭外层 `rows`，释放唯一 SQLite 连接。
3. 处理 `limit + 1` 分页记录并裁剪为当前可见页。
4. 只对当前可见实例逐项调用 `s.findings`。

该顺序与已有的 `InstancesForApp` 实现保持一致。随后审计了持久化层其他 `rows.Next()` 循环，没有发现仍在未关闭结果集时调用第二个 Store 查询的同类路径。

前端修复位于 `apps/web/src/ui/live.ts`：

1. session 成功后立即读取 settings。
2. settings 不再等待应用目录同步完成。
3. 其余资源继续串行读取，避免重新制造入口并发请求风暴。
4. 普通 GET 保留后端 12 秒读取超时和前端 15 秒最终取消；SSE 与写操作不套用该读取超时。

### 包标识收口

最终交付包使用：

```text
package: cloud.lazycat.app.mimi-app-backup
version: 0.1.2
route: http://web.cloud.lazycat.app.mimi-app-backup.lzcapp:8080
```

包标识和内部服务域名同时更新，避免出现包身份与 `${service_name}.${lzcapp_appid}.lzcapp` 域名不一致。

### 验证证据

本地执行并通过：

```text
go build -o /tmp/mimi-backup-server ./apps/server/cmd/server
npm run build --prefix apps/web
lzc-cli project release --output cloud.lazycat.app.mimi-app-backup-v0.1.2.lpk
lzc-cli lpk info cloud.lazycat.app.mimi-app-backup-v0.1.2.lpk
lzc-cli lpk lint cloud.lazycat.app.mimi-app-backup-v0.1.2.lpk
git diff --check
```

LPK 检查结果：

- 包标识：`cloud.lazycat.app.mimi-app-backup`
- 版本：`0.1.2`
- 大小：19,901,952 字节
- SHA-256：`6e5095cbbb72534e0f205ec52cd5f90800e6c2f2d25ecaeee7590855ad41c79c`
- `lzc-cli lpk lint`：无警告

项目规则禁止新增、修改或运行测试代码，因此本次没有运行测试套件。编译、前端构建和包检查不能替代真机结果。

2026-08-31，用户在懒猫设备上完成回归并确认“现在没问题了”。该确认覆盖此前持续加载和请求超时的用户可见问题，因此本记录状态从“待验证”关闭为“已修复”。

### 后续回归检查

- 应用页必须在读取时限内返回真实实例数据和数据库检测结果。
- 目录同步为 `RUNNING` 时，设置页仍应独立完成读取。
- 新增持久化列表查询时，不得在 `rows` 未关闭期间通过同一个单连接 `*sql.DB` 发起第二次查询。
- 入口代理偶发一条 `context canceled` 时，先检查是否由刷新、关闭页面或 SSE 重连触发；如果同时出现持续加载或 `REQUEST_TIMEOUT`，继续检查上游 handler 是否阻塞。
- 后续变更包标识时，必须同步修改 `package.yml`、内部服务域名、文档和产物文件名。
