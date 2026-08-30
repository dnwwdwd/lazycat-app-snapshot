# 咪咪应用备份技术实现文档 PDD

> 文档版本：V1  
> 产品名称：咪咪应用备份（Mimi App Backup）
> LPK 包标识：`cloud.lazycat.app.mimi-app-backup`
> 代码仓库：<https://github.com/dnwwdwd/lazycat-app-snapshot>
> 后端技术栈：Go  
> 前端技术栈：Vite + React + TypeScript
> 目标平台：懒猫微服 LPK V2  
> 登录方式：懒猫 OIDC
> 支持语言：简体中文（zh-CN）、English（en-US）  
> 最后更新：2026-08-29
> 说明：文档版本固定为 V1，后续调整只更新“最后更新”和变更记录。

## 1. 实现结论

V1 在已经跑通的 POC 数据链路上继续开发，不重构已验证的数据入口、应用目录查询、文件探测和网盘写入方式。

已经验证的链路固定为：

```text
当前懒猫用户上下文
→ Lzc SDK QueryApplication
→ 当前用户可见应用目录
→ appvar.other.read 运行时投影
→ /lzcapp/run/data/app/var
→ appid / deploy_id 源映射
→ 文件与数据库探测
→ 手动备份
→ 当前用户懒猫网盘
```

V1 增加：

- 懒猫 OIDC 登录和服务端会话。
- 正式 Vite/React 管理端，由 Go 同源托管构建产物。
- SQLite Online Backup。
- ZIP 归档。
- 计划、批次、任务队列和补跑。
- 备份库、校验、存储维护和告警。
- 中英文国际化。

备份应用自身保持 `multi_instance: true`。每个懒猫用户运行独立实例，并拥有独立控制库、计划、队列、快照索引和设置。

管理员跨用户备份不进入 V1。管理员与普通用户都只处理当前 OIDC 用户在平台上下文中可访问的数据。

## 2. POC 已验证基线

当前仓库 POC 已经完成：

1. 读取当前用户身份。
2. 通过 Go Lzc SDK 调用 `QueryApplication`。
3. 请求不传 `other_uid`，启用 `only_owner`。
4. 再次校验应用 `owner` 与当前 `tenant_uid`。
5. 使用 `appvar.other.read` 和 LZCOS 兼容权限获得应用数据投影。
6. 从 `/lzcapp/run/data/app/var` 读取当前用户可见的应用数据。
7. 按应用标识解析源目录。
8. 全量遍历目录。
9. 统计文件数、目录数和容量。
10. 识别 SQLite、MySQL、PostgreSQL、MongoDB 和 Redis 特征。
11. 对指定普通文件计算 SHA-256。
12. 创建一次手动 `tar.gz` 快照。
13. 写入当前用户的懒猫网盘。

本次改造只把 `tar.gz` 替换为 ZIP。以下行为保持不变：

- 应用目录查询。
- 当前用户过滤。
- appvar 投影根目录。
- appvar 源映射。
- 文件扫描。
- 数据库识别。
- SHA-256 探针。
- 当前用户网盘写入。
- 后端拒绝浏览器传入源绝对路径。

POC 的全量探测页面保留在仓库中，供开发验证和故障排查使用。生产构建不注册该页面，不纳入 PRD 菜单和功能。

## 3. V1 支持边界

### 3.1 支持

- 当前用户可见的单实例应用。
- 当前用户拥有的多实例应用实例。
- 普通文件和目录。
- 配置、附件、图片、模型、向量索引和全文索引。
- 标准 SQLite 3。
- 手动和定时备份。
- 批量目标。
- ZIP 归档。
- 当前用户网盘存储。
- 校验、保留和导出。
- 中文和英文。

### 3.2 阻断

以下数据库被检测后阻止整个实例任务：

- MySQL、MariaDB。
- PostgreSQL。
- MongoDB。
- Redis。
- Elasticsearch、OpenSearch、ClickHouse。
- DuckDB、LMDB、RocksDB、LevelDB、Pebble、bbolt、BadgerDB。
- H2、HSQLDB、Derby。
- SQLCipher。
- 无法确认类型的数据库文件或目录。

### 3.3 不实现

- 管理员跨用户查询和备份。
- `QueryApplication.other_uid`。
- 目标应用写回。
- 自动停启目标应用。
- 直接恢复。
- 系统级应用数据备份。
- LightOS 系统盘。
- 其他应用文稿、媒体、RemoteFS 和 NAS。
- 宿主机路径挂载。
- 本地账号和密码登录。

## 4. 技术栈

### 4.1 后端

| 类别 | 技术 | 用途 |
| --- | --- | --- |
| 语言 | Go | API、OIDC、调度、扫描、ZIP、校验和任务 |
| HTTP | `net/http` + `chi` | REST、OIDC 回调、SSE、静态资源和健康检查 |
| OIDC | `coreos/go-oidc/v3` + `golang.org/x/oauth2` | Discovery、Authorization Code、PKCE、ID Token 和 UserInfo |
| 控制数据库 | SQLite WAL | 会话、应用目录、计划、批次、任务、快照、告警和设置 |
| SQLite 驱动 | `modernc.org/sqlite` | 控制库和目标 SQLite Online Backup |
| 调度 | `robfig/cron/v3` + 持久化调度层 | Cron、补跑、批次展开和窗口 |
| 并发 | context、channel、`x/sync` | 工作池、取消、信号量和背压 |
| 归档 | Go 标准库 `archive/zip` | ZIP 和 ZIP64 |
| 校验 | SHA-256 | ZIP、SQLite 和可选单文件校验 |
| 文件系统 | Go 标准库 + `x/sys/unix` | 安全遍历、Statfs、fsync 和路径约束 |
| 日志 | `log/slog` | 结构化日志和脱敏 |
| 接口契约 | OpenAPI | 前后端 DTO、分页和错误码 |
| 懒猫平台 | Go Lzc SDK | 应用实例目录、运行时信息和通知 |

### 4.2 前端

| 类别 | 技术 | 用途 |
| --- | --- | --- |
| 框架 | Vite + React | 页面、组件和静态构建 |
| 语言 | TypeScript | API 客户端和组件类型安全 |
| UI | 现有原型组件 | 管理后台组件和无障碍交互 |
| 样式 | 原型 CSS | 设计令牌和响应式布局 |
| 图标 | Lucide | 菜单、状态和操作图标 |
| 查询 | 同源 Fetch API 客户端 | 会话、分页、同步状态和错误码 |
| 接口契约 | OpenAPI 3.1 + `openapi-typescript` | DTO 与生成类型漂移检查 |
| 国际化 | 前端 locale 模块 | `zh-CN` 和 `en-US` |
| 实时状态 | EventSource / SSE | 任务、批次、告警和系统状态 |
| 图表 | 轻量图表库 | 容量、成功率和吞吐趋势 |

### 4.3 生产运行形态

一个 LPK 使用一个业务服务容器。该容器运行 Go 进程，负责：

- OIDC Client。
- API。
- Vite 静态资源。
- 应用目录同步。
- 调度器。
- 持久化任务队列。
- ZIP 工作池。
- SQLite 快照工作池。
- 网盘写入。
- SSE。
- 站内告警、审计和当前用户设置。

生产环境不常驻 Node.js。Vite 在构建阶段生成静态资源，由 Go 同源托管。正式构建脚本先构建 Vite，再编译 `cmd/server` 为 Linux 二进制并一同放入 LPK 内容目录。现有 Vite/React 原型是正式前端入口；POC 诊断页与 API 仍只作为开发资产保留。阶段 0–5 完成本地实现后，`cloud.lazycat.app.mimi-app-backup-v0.1.2.lpk` 已完成本地打包和 lint。

## 5. LPK 配置

### 5.1 `package.yml`

V1 权限：

```yaml
permissions:
  required:
    - appvar.other.read
    - document.write
  optional:
    - user.notify
```

用途：

- `appvar.other.read`：读取当前用户上下文可见的其他应用 appvar。
- `document.write`：向当前用户懒猫网盘写入备份。
- `user.notify`：预留给后续外部通知；阶段 5 只保存站内提醒偏好和站内告警，未把它作为已验证能力。

V1 不申请：

```text
appvar.other.write
compose.override
device.block
lightos.manage
document.read
media.read
```

应用不设置 `admin_only: true`。普通用户和管理员都可以使用自己的多实例应用实例。

### 5.2 `lzc-manifest.yml`

保留当前已验证的运行结构，并增加 OIDC：

```yaml
application:
  subdomain: mimi-app-backup
  multi_instance: true
  background_task: true
  oidc_redirect_path: /auth/oidc/callback
  routes:
    - /=http://web.cloud.lazycat.app.mimi-app-backup.lzcapp:8080

services:
  web:
    image: <正式镜像或 embed image>
    user: "0"
    command: <Go 启动命令>
    environment:
      - BACKUP_APP_DEPLOY_UID=${LAZYCAT_APP_DEPLOY_UID}
      - BACKUP_DOCUMENT_ROOT=/lzcapp/document
      - BACKUP_APPVAR_ROOT=/lzcapp/run/data/app/var
      - BACKUP_APPVAR_MODE=runtime-appvar
      - BACKUP_APPVAR_LAYOUT=appid
      - BACKUP_PROVIDER_VERSION=lzcos-runtime-appvar-v1

      - OIDC_CLIENT_ID=${LAZYCAT_AUTH_OIDC_CLIENT_ID}
      - OIDC_CLIENT_SECRET=${LAZYCAT_AUTH_OIDC_CLIENT_SECRET}
      - OIDC_ISSUER_URI=${LAZYCAT_AUTH_OIDC_ISSUER_URI}
      - OIDC_AUTH_URI=${LAZYCAT_AUTH_OIDC_AUTH_URI}
      - OIDC_TOKEN_URI=${LAZYCAT_AUTH_OIDC_TOKEN_URI}
      - OIDC_USERINFO_URI=${LAZYCAT_AUTH_OIDC_USERINFO_URI}

    healthcheck:
      test_url: http://127.0.0.1:8080/api/health
      start_period: 10s
      interval: 30s
      timeout: 5s
      retries: 3

ext_config:
  permissions:
    - PERM_OTHER_APP_DATA_ADMIN
```

约束：

- `/lzcapp/run/data/app/var` 是当前 POC 已验证的容器内运行时投影。
- `PERM_OTHER_APP_DATA_ADMIN` 是当前 LZCOS 兼容声明，继续保留。
- 不将该路径改为宿主机路径。
- `OIDC_CLIENT_SECRET` 每次容器重启可能变化，不写入数据库或日志。
- `BACKUP_DOCUMENT_ROOT=/lzcapp/document` 保持当前 POC 已验证的网盘路径。
- 后续迁移稳定文稿路径时通过存储适配层处理，不在本次改造中改变链路。

## 6. OIDC 登录

### 6.1 登录要求

所有业务页面和 API 必须拥有有效 OIDC 会话。健康检查、OIDC 登录入口和回调是唯一例外。

入口鉴权 Header 继续保留，OIDC 用于建立应用自身会话和用户信息。

### 6.2 Authorization Code Flow

流程：

1. 用户访问业务页面。
2. Go 检查服务端会话。
3. 无会话时返回同源登录页，不生成 OIDC 登录事务。
4. 用户点击登录页中的按钮，浏览器 `POST /auth/login`。
5. Go 生成 `state`、`nonce` 和 PKCE verifier，并将短生命周期登录事务保存到控制库。
6. 跳转 OIDC authorization endpoint。
7. OIDC 回调返回授权码。
8. Go 校验 `state`。
9. 使用 code + verifier 换取 Token。
10. 校验 ID Token 签名、issuer、audience、nonce 和过期时间。
11. 调用 UserInfo。
12. 获取 UID、显示名称、邮箱和 groups。
13. 创建服务端会话并跳转 `/` 首页。

### 6.3 OIDC profile UID 与懒猫网关 UID

OIDC profile UID 从 UserInfo 的 `preferred_username` claim 读取，保存为 `session.uid`，用于用户显示和审计。

懒猫网关 UID 从 OIDC 回调请求的 `X-HC-User-ID` 读取，保存为 `session.gateway_uid`，并作为该会话的 `tenant_uid`。后端不接受前端提交任一种 UID。

### 6.4 角色

OIDC groups 用于确认角色：

```text
NORMAL
ADMIN
```

角色只进入：

- 用户菜单。
- 审计记录。
- 告警上下文。
- 后续功能预留。

`ADMIN` 不扩大数据范围。后端仍不调用 `other_uid`。

### 6.5 身份绑定

每个请求执行：

```text
session.gateway_uid == X-HC-User-ID
```

此判断沿用 `agent-desk` 的同命名空间绑定方式。OIDC profile UID 不参与比较；`LAZYCAT_APP_DEPLOY_UID` 是应用部署标识，只作为 OIDC 登录事务内部作用域，不作为用户 UID。回调校验 `state`、`nonce`、授权码、ID Token、UserInfo 和网关 UID 是否存在，然后创建带 `gateway_uid` 的会话；创建会话后的业务请求才校验 `session.gateway_uid == X-HC-User-ID`。

失败处理：

- 删除会话。
- API 返回 403；浏览器访问清除 Cookie 后进入登录页，要求用户再次主动授权。
- 不返回任何业务数据。
- 记录脱敏安全日志。

### 6.6 会话

Cookie：

- HttpOnly。
- Secure。
- SameSite=Lax。
- Path=/。
- 使用随机 session ID。
- 不在 Cookie 内保存用户信息和 Token。

会话记录：

- session ID hash。
- OIDC subject。
- OIDC profile UID。
- 懒猫网关 UID。
- 名称。
- 邮箱。
- groups。
- 创建时间。
- 到期时间。
- 最近访问时间。

OIDC Client Secret、access token 和 refresh token不写入普通日志。V1 完成 UserInfo 后可以丢弃 access token；会话过期后重新登录。

### 6.7 后台任务

调度器和 Worker 不依赖浏览器会话。后台身份固定为容器启动时读取的 `tenant_uid`。

后台应用目录查询继续使用：

```text
WithRealUID(tenant_uid)
QueryApplication(
  deploy_ids = [],
  other_uid = unset,
  only_owner = true,
  ignore_pending_pkg = true
)
```

每条结果再次校验：

```text
AppInfo.owner == tenant_uid
```

## 7. 用户和租户模型

### 7.1 备份应用多实例

`multi_instance: true` 保持不变。每个用户实例拥有独立：

- `/lzcapp/var`。
- 控制库。
- 会话。
- 计划。
- 任务。
- 快照索引。
- 告警。
- 设置。

### 7.2 管理员

管理员也进入自己的多实例容器。V1 不实现：

- 全局用户目录。
- 租户切换。
- `other_uid`。
- 其他用户网盘写入。
- 跨用户快照索引。

### 7.3 目标单实例应用

单实例目标应用允许进入探测和备份。

规则：

- 应用必须由当前用户目录查询返回。
- `owner` 校验必须通过。
- 运行时投影必须能解析源目录。
- 页面和计划创建流程显示共享实例风险提示。
- 风险提示不作为创建计划或手动备份的服务端前置条件。
- 快照 manifest 保存 `multi_instance=false` 和风险标记。

### 7.4 目标多实例应用

多实例目标以当前用户的 `deploy_id` 为实例身份。运行时投影只能解析当前用户实例。

唯一键：

```text
tenant_uid + appid + deploy_id
```

## 8. 应用目录同步

### 8.1 全量同步

1. 使用当前 `tenant_uid` 建立 SDK 请求上下文。
2. 调用 `QueryApplication`。
3. 不传 `other_uid`。
4. 启用 `only_owner=true`。
5. 过滤空 `deploy_id`。
6. 过滤 owner 不匹配。
7. 排除备份应用自身。
8. 保存应用、实例模式、版本和状态。
9. 对新增或变化项创建轻量探测任务。

### 8.2 增量同步

- 订阅安装和卸载事件。
- 事件触发重新查询。
- 定期全量对账。
- 计划执行前重新查询。
- 消失实例停止新任务，历史快照保留。
- 当前首个实现包使用单个可合并的同步协调器和最多 8 个探测 worker。`POST /api/applications/sync` 返回 202；列表接口返回最近持久化结果与同步状态。

### 8.3 分页

应用 API 使用游标分页：

- 默认 50。
- 最大 200。
- 名称、appid 和 deploy_id 建立规范化索引。
- 大小和文件数异步刷新。

## 9. appvar 数据入口

### 9.1 已验证投影

V1 使用当前 POC 已跑通的投影：

```text
/lzcapp/run/data/app/var
```

源选择器不等待新的 SDK 文件 API，也不修改已验证链路。

### 9.2 映射

当前运行时布局按 `appid` 解析：

```text
/lzcapp/run/data/app/var/<appid>
```

`deploy_id` 作为任务、锁、快照和目录身份保存。

解析步骤：

1. 从后端应用目录获取已验证对象。
2. 校验 appid 和 deploy_id 字符。
3. 在固定投影根下拼接 appid。
4. 拒绝符号链接目标。
5. `EvalSymlinks`。
6. 校验解析结果仍位于固定投影根内。
7. 获取设备、inode 和验证时间。
8. 返回后端私有源根。

同一租户若出现多个不同 `deploy_id` 指向同一个 `appid`，且运行时投影仍只有一个 appid 目录，状态设为 `SOURCE_MAPPING_AMBIGUOUS`，停止备份，等待平台提供更细粒度映射。

不接受浏览器源路径。

### 9.3 只读策略

当前兼容投影可能在文件系统层表现为可写。服务必须执行应用层只读：

- 所有源文件只使用只读打开方式。
- 不调用创建、截断、重命名、删除、chmod、chown 和写入。
- 源路径和目标网盘路径使用独立类型。
- 写入接口只接受 StorageProvider 返回的目标。
- 备份前后对抽样文件执行大小、mtime 和 SHA-256 对比。
- 源目录只读约束由服务端路径解析、打开方式和权限边界共同保证；真实平台验收确认目标应用数据未被写入。

页面显示：

```text
应用层只读（兼容投影）
```

### 9.4 路径安全

- 跳过越界符号链接。
- 跳过 Socket、命名管道、块设备和字符设备。
- 拒绝 `..`。
- 拒绝绝对相对条目。
- 限制目录深度、路径长度和文件数量。
- ZIP entry 始终使用 `/` 分隔的安全相对路径。

## 10. 能力探测

### 10.1 轻量探测

用于应用列表：

- 源可用性。
- 文件和目录数量估算。
- 数据大小估算。
- SQLite 数量。
- 数据库特征。
- 无数据判断。
- 实例模式。

### 10.2 完整预检

用于任务执行：

- 完整目录遍历。
- 文件计划。
- SQLite 主文件与辅助文件关系。
- 不支持数据库。
- 特殊文件。
- 源稳定性。
- 网盘空间。
- ZIP 临时目录。
- 任务窗口。

发现阻断数据库后，不创建 ZIP。

### 10.3 数据库识别

SQLite 通过文件头识别：

```text
SQLite format 3\0
```

服务型数据库使用文件与目录签名。特征规则集中在兼容性模块中，并带版本号。

## 11. ZIP 备份引擎

### 11.1 格式变更

当前 POC：

```text
snapshot.tar.gz
```

V1：

```text
snapshot.zip
```

删除 `compress/gzip` 和 tar 写入链路，改用 Go `archive/zip`。扫描、源读取、SHA-256 和目标目录逻辑保持不变。

### 11.2 最终目录

```text
MimiAppBakcup/
└── <scheduled_at>/
    └── <deploy_id>/
        ├── snapshot.zip
        └── manifest.json
```

`scheduled_at`：

```text
yyyyMMdd'T'HHmmss.SSS'Z'
```

碰撞时追加短批次 ID。

### 11.3 ZIP 内部结构

```text
snapshot.zip
├── appvar/
│   └── <源相对路径>
└── _snapshot/
    ├── manifest.json
    ├── file-index.jsonl
    └── warnings.json
```

### 11.4 ZIP 写入

流程：

1. 在 `_partial/<job_id>` 创建临时 ZIP。
2. 创建 `zip.Writer`。
3. 遍历已通过预检的文件计划。
4. 为目录和普通文件创建安全 Entry。
5. 普通文件流式复制。
6. SQLite 使用临时一致性副本。
7. 写入内部文件索引和 warnings。
8. 生成内部 manifest。
9. 关闭 ZIP。
10. fsync。
11. 计算 ZIP SHA-256。
12. 移动 ZIP 到最终目录。
13. 最后写外部 manifest。
14. 更新控制库。

### 11.5 压缩策略

- 文本、JSON、数据库和普通二进制使用 Deflate。
- ZIP、GZIP、Zstandard、JPEG、PNG、音视频等已压缩格式使用 Store。
- 压缩级别由设置控制。
- 使用 ZIP64 支持大文件和大量 Entry。
- 单文件流式处理，不将完整文件读入内存。

### 11.6 时间和权限

快照完成时从当前 tenant 的设置读取 IANA 时区，网盘目录使用 `<yyyy-MM-dd_HH-mm-ss.SSS>_<timezone-safe>/` 作为第一层，例如 `2026-08-28_09-18-01.653_Asia-Shanghai/`。斜杠会转换为连字符，目录保持单段、安全且可读；快照 API 与 manifest 中的时间仍保存 UTC RFC 3339，由前端按同一设置时区显示。

ZIP Entry 保存：

- 相对路径。
- 文件类型。
- 修改时间。
- Unix 权限位。
- 原始大小。

不保存宿主机绝对路径和用户凭据。

## 12. SQLite 一致性快照

### 12.1 识别和排除

识别标准 SQLite 后：

- 主数据库不进入普通文件复制。
- 对应 `-wal`、`-shm` 和 `-journal` 不单独复制。
- 创建 SQLite 任务。

### 12.2 在线备份

1. 以只读方式打开源 SQLite。
2. 在 `/lzcapp/cache/jobs/<job_id>/sqlite` 创建临时目标。
3. 使用 SQLite Online Backup API 分页复制。
4. 处理 busy 和 locked 重试。
5. 执行 `PRAGMA quick_check`。
6. 将临时快照写入 ZIP 中原始相对路径。
7. 任务结束时释放临时工作文件，不触及网盘快照目录。

失败时任务失败，不回退为普通复制。

### 12.3 加密 SQLite

SQLCipher 或无法识别格式的数据库被阻断。V1 不要求用户提供数据库密钥。

## 13. 普通文件一致性

普通文件采用尽力一致：

1. 打开前记录 size、mtime 和 inode。
2. 只读复制到 ZIP。
3. 复制后再次 stat。
4. 文件发生变化时重试。
5. 达到重试上限后：
   - 严格模式：任务失败。
   - 宽松模式：任务成功但有警告。

默认使用严格模式处理配置和索引目录。

## 14. Manifest

### 14.1 外部 Manifest

最终目录中的 `manifest.json` 至少包含：

```text
format_version
product_version
status
tenant_uid
oidc_subject
user_role
appid
application_name
application_version
deploy_id
multi_instance
shared_instance_warning
plan_id
batch_id
job_id
trigger_type
scheduled_at
started_at
captured_at
finished_at
source_provider
source_provider_version
source_readonly_mode
archive_name
archive_size
archive_sha256
file_count
directory_count
sqlite_count
skipped_count
warning_count
original_bytes
zip_bytes
compression_ratio
consistency
```

不保存文件正文、OIDC Token 和源绝对路径。

### 14.2 内部 Manifest

ZIP 中 `_snapshot/manifest.json` 与外部 manifest 使用同一业务内容。外部 manifest 可以增加最终 ZIP 哈希；内部 manifest 对应字段在写入 ZIP 时留空或标记为 `calculated_after_close`。

### 14.3 完成协议

外部 manifest 最后写入：

```json
{
  "status": "completed",
  "archive_name": "snapshot.zip"
}
```

备份库只索引：

- manifest 存在。
- status 为 completed。
- ZIP 存在。
- ZIP 大小一致。
- ZIP SHA-256 一致。

不再创建 `COMPLETED` 文件。

## 15. 网盘存储

### 15.1 当前路径

保持 POC 已验证路径：

```text
BACKUP_DOCUMENT_ROOT=/lzcapp/document
```

产品根：

```text
/lzcapp/document/MimiAppBakcup
```

该目录对应当前用户自己的懒猫网盘。

### 15.2 StorageProvider

存储模块只暴露相对路径操作：

- CreatePartial。
- OpenWriter。
- Rename。
- WriteManifest。
- Stat。
- RemovePartial。
- FreeSpace。

业务层不直接拼接宿主机路径。

存储页仅在浏览器中使用既有 `StorageSummary.archiveBytes` 和 `availableBytes` 计算显示比例。原始比例大于零且小于 0.1% 时，显示为 `<0.1%` 并使用最小可见条宽；该展示规则不回写汇总数据，不改变 `FreeSpace`、存储扫描或网盘目录。

### 15.3 临时和回收站

```text
MimiAppBakcup/
├── _partial/
├── _restore_exports/
└── <scheduled_at>/
```

V1 不提供清理、删除、回收站或自动保留删除能力。失败任务产生的临时目录保留在 `_partial/`，由用户在网盘侧自行管理；产品只展示状态，不主动移除任何目录或文件。

### 15.4 快照索引

外部 `manifest.json` 是备份库索引入口。后台定期扫描当前用户的 `MimiAppBakcup` 根目录，对账：

- 控制库有记录、网盘文件存在。
- 网盘有 manifest、控制库缺少记录。
- ZIP 缺失。
- manifest 状态异常。
- ZIP 大小或 SHA-256 不一致。
- `_partial` 中的临时目录状态。

对账只读取当前用户网盘。

快照详情先读取控制库中的快照元数据，再独立读取文件索引。快照 API 额外返回 `storageStatus`（`AVAILABLE`、`MISSING` 或 `INACCESSIBLE`）描述记录目录当前是否可达；目录缺失只标记为 `MISSING`，不把详情打开过程当作完整性校验。前端将范围、实际归档统计和创建时完整性记录合并展示，文件索引默认截取前 30 条；截取只影响展示，不改变索引读取、快照数据或接口。完整性校验和导出仍属于服务端维护边界，快照详情界面保持只读；产品不提供删除、移入回收站或清理入口。

### 15.5 快照校验

快速校验：

- 外部 manifest 格式。
- ZIP 是否存在。
- ZIP 大小。
- ZIP SHA-256。
- ZIP 中内部 manifest 是否存在。

完整校验：

- 遍历全部 ZIP Entry。
- 验证 ZIP CRC。
- 对比文件索引数量和大小。
- 检查危险路径。
- 对 SQLite Entry 临时解压后执行 `quick_check`。
- 更新快照完整性状态。

### 15.6 保留与数据生命周期

V1 只记录快照和计划元数据，不执行任何快照删除、目录清理、回收站转移或自动保留删除。历史版本中出现的 `keepLast`、`keepDaily`、`keepWeekly`、`keepMonthly` 和 `trashGraceHours` 字段仅为控制库兼容字段，服务端不以它们触发物理文件操作；用户需要释放空间时，直接在懒猫网盘侧管理文件。

### 15.7 恢复副本导出

V1 只导出到当前用户网盘：

```text
MimiAppBakcup/_restore_exports/<export_id>/
```

导出流程：

- 检查可用空间。
- 校验 ZIP。
- 拒绝绝对路径和 `..`。
- 不跟随 ZIP 内符号链接。
- 不覆盖已有目录。
- 解压完成后对比文件数量和大小。
- 不写入目标应用 appvar。

## 16. 计划与调度

### 16.1 计划类型

- 手动。
- 每小时。
- 每天。
- 每周。
- 五段 Cron。

### 16.2 目标

- 单个应用实例。
- 多个应用实例。

计划不保存其他用户 UID。

### 16.3 触发

1. 计算到期计划。
2. 重新同步当前用户应用目录。
3. 展开目标。
4. 执行能力预检。
5. 创建批次和任务。
6. 保存统一 `scheduled_at`。
7. Worker 受控执行。

### 16.4 补跑

应用实例重启后：

- 加载计划。
- 找出补跑窗口内漏掉的执行点。
- 创建补跑批次。
- 超过最大延迟的执行点标记跳过并告警。

### 16.5 后台运行和漏跑

`background_task: true` 保持启用。

多实例应用在微服重启后的自动启动行为必须通过真机回归。无活动实例时，系统不能承诺计划按时触发，因此实现以下保障：

- 每次用户打开应用后立即计算漏跑。
- 设置页显示最近调度心跳。
- 超过补跑窗口的任务记录为跳过。
- 无法保证无人值守时在页面显示明确说明。
- 后续如平台支持 owner 级自启动，直接接入，不改变计划模型。

## 17. 持久化任务队列

### 17.1 状态

```text
QUEUED
LEASED
PRECHECKING
SCANNING
SQLITE_SNAPSHOT
ZIP_WRITING
VERIFYING
COMMITTING
SUCCEEDED
SUCCEEDED_WITH_WARNINGS
FAILED
CANCELLED
TIMED_OUT
SKIPPED
INTERRUPTED
```

### 17.2 租约

Worker 获取任务时写入：

- worker ID。
- lease token。
- lease expires at。
- heartbeat at。

过期租约由恢复器回收。

### 17.3 实例锁

锁键：

```text
tenant_uid + deploy_id
```

同一个实例不能并发执行两个备份任务。

### 17.4 幂等

批次幂等键：

```text
tenant_uid + plan_id + scheduled_at
```

任务幂等键：

```text
batch_id + deploy_id
```

## 18. 并发和规模

### 18.1 工作池

独立工作池：

- 元数据探测。
- 普通 ZIP。
- SQLite。
- 校验。

### 18.2 资源预算

并发由以下预算共同限制：

- CPU。
- 可用内存。
- 磁盘读取吞吐。
- 网盘写入吞吐。
- 文件描述符。
- 临时空间。
- 单任务大小。

不为每个任务直接创建长期 goroutine。

### 18.3 容量目标

每个用户实例：

- 至少 10,000 条应用实例记录。
- 单批次至少 5,000 个任务记录。
- 5,000 个任务在 10 秒内完成持久化展开，不包含扫描和写入。
- 100,000 条任务历史可分页查询。
- 单文件大小不决定内存占用。

## 19. 控制数据库

### 19.1 数据域

控制库保存当前用户的数据：

- OIDC 登录事务。
- OIDC 会话。
- 用户快照。
- 应用。
- 应用实例。
- 能力检测。
- 计划。
- 批次。
- 任务。
- 任务尝试。
- 快照。
- ZIP 文件索引元数据。
- 告警。
- 设置。
- 审计记录。
- 事件序列。
- 分布式租约和实例锁。

控制库在每用户 `/lzcapp/var/backup.sqlite` 运行版本化迁移。数据库启用 WAL、外键和 busy timeout；阶段 1–4 已加入 OIDC 登录事务、会话、应用、应用实例、数据库发现、目录同步、计划、批次、任务、快照和存储记录，阶段 5 的迁移加入设置、告警、审计和事件序列。

### 19.2 租户字段

所有业务表保存 `tenant_uid`。虽然多实例容器已经隔离，数据库仍保留该字段用于：

- 一致性断言。
- 审计。
- 防止未来改为单实例后误混数据。
- 数据导入和迁移校验。

### 19.3 索引

关键索引：

- tenant + appid。
- tenant + deploy_id。
- tenant + plan status。
- tenant + task status + priority。
- tenant + scheduled_at。
- tenant + snapshot captured_at。
- tenant + alert unread。

## 20. API

### 20.1 OIDC

```text
GET  /auth/login
POST /auth/login
GET  /auth/oidc/callback
POST /auth/logout
GET  /api/session
```

### 20.2 应用

```text
GET  /api/applications
POST /api/applications/sync
GET  /api/applications/{appid}
GET  /api/instances/{deploy_id}
GET  /api/instances/{deploy_id}/backup-scope
POST /api/instances/{deploy_id}/probe
POST /api/instances/{deploy_id}/backup
GET  /api/backup-jobs/{id}
```

阶段 4 已把手动请求纳入持久化批次与任务队列。请求只能携带当前目录中的 `deploy_id`；共享实例风险作为展示与快照元数据，不阻断入队。请求完成鉴权和实例校验后，以不随浏览器断开取消的上下文写入批次与任务；作业状态、错误码、批次、任务和最终 `snapshot_id` 都按当前租户过滤。Worker 认领任务时写入 lease token、worker ID、到期时间和心跳；过期租约在启动时回收，可重试任务按计划中的退避重新排队。浏览器不能提交 tenant、owner、源路径或租约字段。

### 20.3 计划

```text
GET    /api/plans
POST   /api/plans
GET    /api/plans/{id}
PUT    /api/plans/{id}
POST   /api/plans/{id}/run
POST   /api/plans/{id}/pause
POST   /api/plans/{id}/resume
```

### 20.4 任务

```text
GET  /api/batches
GET  /api/batches/{id}
GET  /api/tasks
GET  /api/tasks/{id}
POST /api/tasks/{id}/cancel
POST /api/tasks/{id}/retry
```

### 20.5 快照

```text
GET    /api/backups
GET    /api/backups/{id}
GET    /api/backups/{id}/files
POST   /api/backups/{id}/verify
POST   /api/backups/{id}/export
```

阶段 3 已实现快照列表、详情和快速校验，阶段 4 在此基础上补齐备份库维护。

阶段 4 已提供文件索引、快速/完整 ZIP 校验、导出到当前用户 `_restore_exports/` 和存储扫描。V1 不提供计划删除、快照删除、移入回收站或存储清理；导出拒绝 ZIP 路径穿越和符号链接，不写入目标应用。

### 20.6 存储、告警和设置

```text
GET  /api/storage
POST /api/storage/scan

GET  /api/overview
GET  /api/alerts
POST /api/alerts/{id}/read
POST /api/alerts/{id}/resolve
POST /api/alerts/{id}/mute

GET  /api/settings
PUT  /api/settings

GET  /api/audit
```

阶段 5 的 overview 聚合当前租户的应用保护状态、计划、任务、告警、最近审计和存储摘要。设置只开放语言、时区、补跑、重试、保留兼容字段和站内提醒偏好等已被执行引擎采用或可安全展示的值；接口不接受用户 UID、宿主机路径、权限声明或未接入引擎的配置。告警、设置和审计均按当前会话 tenant 过滤。设置在用户点击保存后一次提交服务端定义字段并提示结果。

`GET /api/backups`、`/api/batches`、`/api/tasks`、`/api/alerts`、`/api/audit` 和范围目录接口均接受 `cursor`、`limit` 并返回 `nextCursor`。快照按 `finished_at, id` 倒序，批次/任务/告警/审计按 `created_at, id` 倒序；任务的 `status`、`batch_id`、`deploy_id` 与告警的 `status` 保持过滤。范围目录按安全相对路径和类型升序。游标是只用于继续查询的不透明值，绑定当前 tenant、查询类型和上述筛选范围；格式、范围或筛选不匹配时统一返回 `INVALID_CURSOR`。控制库仅增加 tenant 与排序/过滤字段索引，不迁移业务数据。

### 20.7 实时事件

```text
GET /api/events
```

SSE 事件包括 `batch.updated`、`task.updated`、`snapshot.updated`、`alert.created`、`storage.updated`、`audit.created` 和 `session.expiring`。事件只携带当前租户业务对象 ID、状态和安全摘要，不携带文件正文、源绝对路径、Token、Cookie 或其他用户信息。

单次连接至多持续 25 秒，并使用事件 ID 支持短时重连。前端在会话建立后只维护一条订阅，不因资源刷新或会话对象重复赋值重建连接；事件在 1.2 秒窗口内合并为一次 REST 重读，断线后以 15 秒退避重新连接。服务端只读取当前 tenant 的最近事件，浏览器在事件遗漏、断线或重启后重新调用 REST 接口读取 SQLite 中的权威状态。SSE 不承担状态恢复，也不作为唯一事实来源。

## 21. 前端页面实现

前端页面必须逐项覆盖 PRD。

### 21.1 全局

Vite 前端包含：

- OIDC 入口和错误页。
- 主布局。
- 八个主菜单。
- 详情页。
- 计划向导。

`prototype` 与 `api` 目录包含：

- 布局。
- 表格。
- 状态。
- 表单。
- 弹窗。
- 图表。
- 反馈组件。

正式接口客户端使用同源 Cookie。阶段 5 已将首次使用检查、概览、应用列表和详情、计划编辑、任务和批次详情、快照与文件索引、存储维护、告警、设置与审计接入正式 API。前端使用限时 SSE 触发 REST 刷新，不以 SSE 或本地状态替代权威数据，也不生成任务成功、进度、告警或配置保存的模拟结果。

正式界面以 `designs/web.tsx` 为唯一视觉和页面结构来源；其中样式模板逐字迁移到 `apps/web/src/styles.css`。生产代码位于 `apps/web/src/ui/`，包含单一实时数据控制层、共享组件、八个页面与弹窗。控制层并行读取 session、overview、applications、plans、tasks、batches、backups、storage、alerts、settings 和 audit；只保持一条 SSE 订阅，事件在 1.2 秒内合并，断线后 15 秒重连。401 或身份不匹配时回到 OIDC 登录页。

应用、计划目标、任务和快照在前端一律以 `deployId` 关联；`appid` 只用于显示。没有后端字段的运行状态、目录数、任务日志/阶段/吞吐、逐文件哈希、固定配额和固定活动不进入正式页面。总队列暂停/恢复保持禁用，首次使用向导不进入正式入口。

### 21.2 OIDC

前端不保存 Token。所有请求使用同源 Cookie。收到 401 或 session.expiring 时进入重新登录流程。

### 21.3 应用页面

应用页面不提供用户、owner 和租户筛选。数据完全由当前会话接口返回。

单实例显示共享实例警告；多实例显示用户隔离标签。

### 21.4 POC 页面

POC 诊断页面和独立构建目标已从当前代码库移除。已完成的验证记录与回归手册继续作为平台边界证据保存，不属于正式产品页面或运行入口。

### 21.5 PRD 页面与后端映射

| PRD 页面 | 后端模块 | 主要接口 |
| --- | --- | --- |
| 概览 | operations、plans、queue、snapshots、storage | overview、events |
| 应用 | catalog、source、probe | applications、instances、probe |
| 应用详情 | catalog、probe、plans、queue、snapshots | application、instance、plans、tasks、backups |
| 备份计划 | plans、scheduler、queue | plans CRUD、run、pause、resume |
| 任务中心 | queue、operations | batches、tasks、cancel、retry、events |
| 备份库 | snapshots、storage | backups、files、verify、export |
| 存储 | storage、snapshots、operations | storage、scan、events |
| 告警 | operations、queue | alerts、read、resolve、mute、events |
| 设置与审计 | operations、auth、scheduler、queue、storage、i18n | session、settings、audit、events |

任何 PRD 按钮必须对应后端能力和稳定错误码。前端不得以本地模拟状态替代尚未实现的业务接口。

## 22. 项目目录结构

以下为当前正式实现目录。POC 入口和构建目标已移除；历史验证记录仍保留在需求、决策、进度和回归手册中。

```text
lazycat-app-snapshot/
├── apps/
│   ├── server/
│   │   ├── cmd/
│   │   │   └── server/
│   │   ├── internal/
│   │   │   ├── auth/
│   │   │   ├── identity/
│   │   │   ├── domain/
│   │   │   ├── platform/
│   │   │   ├── catalog/
│   │   │   ├── source/
│   │   │   ├── probe/
│   │   │   ├── backup/
│   │   │   ├── storage/
│   │   │   ├── plans/
│   │   │   ├── scheduler/
│   │   │   ├── queue/
│   │   │   ├── snapshots/
│   │   │   ├── operations/
│   │   │   ├── httpapi/
│   │   │   └── persistence/
│   └── web/
│       ├── public/
│       └── src/
│           ├── api/
│           ├── i18n/
│           └── ui/
├── api/
│   └── openapi/
├── lzc/
├── package.yml
├── lzc-manifest.yml
└── lzc-build.yml
```

## 23. 告警和通知

告警源：

- OIDC。
- 身份不一致。
- 权限。
- 应用目录。
- appvar 投影。
- 数据库阻断。
- SQLite。
- ZIP。
- 网盘。
- 任务。
- 校验。
- 临时目录。
- 控制库。
- 补跑。

阶段 5 已实现站内告警：最终失败任务会自动创建告警，用户可按当前租户读取、标记已读、处理或静默；计划、任务、快照、存储和设置操作写入当前租户审计。`user.notify` 仍是可选权限和后续外部通知边界，未授权或未验证时不会影响备份主流程。

## 24. 国际化

### 24.1 前端

前端 locale 模块维护：

```text
zh-CN
en-US
```

翻译覆盖：

- 菜单。
- 页面。
- 表单。
- 状态。
- 错误。
- OIDC。
- 告警。
- 通知。
- 日期和容量。

阶段 5 已实现八个主菜单、统一详情弹窗和设置页的 `zh-CN`、`en-US` 文案。详情入口共享单一弹窗状态，任务与快照之间切换时不叠加遮罩；语言切换只改变当前浏览器显示和当前租户的安全设置，不提交或展示 Token、Cookie、用户目录或源路径。

### 24.2 后端

后端返回：

```json
{
  "code": "UNSUPPORTED_DATABASE",
  "message": "Unsupported database detected",
  "params": {
    "databaseType": "PostgreSQL",
    "relativePath": "pgdata"
  },
  "requestId": "..."
}
```

`message` 是安全的回退说明；前端使用稳定的 `code` 和 `params` 输出对应语言的提示。接口不返回 Token、Cookie、源绝对路径或其他用户信息。

## 25. 日志和可观测性

### 25.1 日志

字段：

- trace ID。
- tenant hash。
- appid。
- deploy ID hash。
- plan ID。
- batch ID。
- task ID。
- stage。
- error code。
- duration。
- bytes。

不记录：

- OIDC Secret。
- Token。
- Cookie。
- 文件正文。
- 完整源绝对路径。
- 其他用户信息。

### 25.2 指标

- 应用同步耗时。
- 探测任务数。
- 队列深度。
- 任务吞吐。
- 读取和 ZIP 写入速度。
- SQLite 耗时。
- 成功率。
- ZIP 压缩比。
- 网盘剩余空间。
- 会话登录失败率。

## 26. 构建检查与真实平台外部确认

项目规则禁止新增、修改、生成或运行测试、验证代码和测试专用 fixture。本地检查只编译 Go 服务端与构建 Vite 前端，不运行测试套件，也不将构建结果视为平台行为的证明。

真实懒猫设备可记录以下外部确认：OIDC 回调；已登录业务请求的 `session.gateway_uid == X-HC-User-ID`；A/B 两个用户的目录、API 与快照隔离；当前用户网盘写入；后台启动和补跑；目标单实例与多实例处理；amd64 与 arm64 的运行结果。平台、权限、运行时投影或源解析器变化后，按 POC 回归手册重新确认已验证数据入口。这些确认不组成独立开发阶段。

## 27. 从 POC 迁移到 V1

### 27.1 保留

- Lzc SDK 查询。
- `WithRealUID`。
- owner 过滤。
- `appvar.other.read`。
- `PERM_OTHER_APP_DATA_ADMIN`。
- `/lzcapp/run/data/app/var`。
- appid 布局。
- 探测。
- 数据库识别。
- SHA-256。
- `/lzcapp/document`。
- 当前用户多实例部署。

### 27.2 替换

```text
tar.gz → ZIP
Vite 原型入口 → Vite 正式入口
临时 POC API → 正式领域 API
内存状态 → SQLite 持久化状态
手动单任务 → 调度器和队列
原始 SQLite 读取 → Online Backup
```

### 27.3 保留参考

POC 页面和 API 可以继续在开发构建中存在，生产构建关闭。

## 28. 发布与验收

V1 发布前必须满足：

1. OIDC 登录完整可用。
2. 身份三方一致性通过。
3. 普通用户和管理员都无法跨用户。
4. 当前 POC 数据链路未回归。
5. 单实例和多实例目标都能按规则处理。
6. ZIP 替换完成。
7. ZIP 内外 manifest 可用。
8. SQLite Online Backup 通过。
9. 不支持数据库阻断。
10. 手动和定时备份可用。
11. 重启恢复和补跑可用。
12. 所有 PRD 页面可用。
13. POC 页面不在生产导航。
14. 中文和英文一致。
15. amd64 和 arm64 通过真机测试。

阶段 0–5 完成本地实现。`cloud.lazycat.app.mimi-app-backup-v0.1.2.lpk` 已在 Go/Vite 构建检查通过后生成并完成本地 lint；真实平台确认不组成独立开发阶段。未获得用户明确授权时，不发布、部署、推送或创建合并请求。

## 29. 后续能力

- 管理员跨用户备份，独立权限、授权和审计。
- 恢复组件。
- 服务型数据库适配器。
- 应用备份协议。
- Notus 专用 flush。
- 增量、去重和内容寻址。
- S3、WebDAV、SFTP 和 NAS。
- 加密和密钥导出。
- 恢复演练。
- 系统应用官方接口。

## 30. 参考资料

- [懒猫 OIDC](https://developer.lazycat.cloud/advanced-oidc.html)
- [懒猫 HTTP Headers](https://developer.lazycat.cloud/http-request-headers.html)
- [懒猫多实例](https://developer.lazycat.cloud/advanced-multi-instance.html)
- [懒猫开发者环境变量](https://developer.lazycat.cloud/advanced-envs.html)
- [package.yml 权限规范](https://developer.lazycat.cloud/spec/package.html)
- [lzc-manifest.yml 规范](https://developer.lazycat.cloud/spec/manifest.html)
- [文件访问](https://developer.lazycat.cloud/advanced-file.html)
- [当前项目仓库](https://github.com/dnwwdwd/lazycat-app-snapshot)
- [SQLite Online Backup API](https://sqlite.org/backup.html)
- [Go archive/zip](https://pkg.go.dev/archive/zip)

## 31. 选择性范围实现

`PlanTarget`、`BackupJob`、`BackupTask` 和 `Snapshot` 持久化 `BackupScope`：模式、规范化目录、单文件、范围修订和服务端摘要。迁移后的旧记录默认为 `FULL`，但没有摘要，因此读取层将其标识为旧版完整备份。内外 manifest 同时写入不可变范围快照和实际归档统计；文件索引仍以 ZIP 实际内容为准。

范围路径只接受当前用户已解析 appvar 根下的相对路径。服务端去重、移除父目录已覆盖的项，拒绝绝对路径、`..`、SQLite 伴随文件和后续扫描中不可选的链接、特殊文件。`GET /api/instances/{deployId}/backup-scope` 通过同一当前用户 source resolver 返回有限条安全元数据，不返回绝对路径或文件内容。

计划运行前为每个目标重新解析并验证范围。任一范围错误会原子暂停计划、清空 `next_run_at`、取消未租约任务并让本批次记录具体失败路径。队列运行期间发现范围失效时复用相同暂停路径；该错误不可重试，不生成快照。范围保存变更会在同一控制库事务中取消未开始的旧修订任务。前端范围选择器只创建 `FULL` 或 `CUSTOM`；服务端继续保留 `CORE` 的历史记录读取和执行兼容，不新增核心数据判定逻辑。

暂停事件经当前租户 operations 服务写入审计和站内告警。整个链路维持现有 `appvar.other.read`、当前 tenant source resolver、目标数据只读和当前用户 document-root 写入边界。

## 32. 变更记录

| 日期 | 文档版本 | 变更 |
| --- | --- | --- |
| 2026-08-30 | V1 | LPK 包标识改为 `cloud.lazycat.app.mimi-app-backup`，包内服务路由同步为 `web.cloud.lazycat.app.mimi-app-backup.lzcapp:8080`；中文说明更新为“自动备份懒猫应用数据”。 |
| 2026-08-30 | V1 | 修复无快照租户读取存储汇总时的空值错误，LPK 版本升至 `0.1.1`，用于替换已安装的 `0.1.0`。 |
| 2026-08-30 | V1 | 设置页恢复设计源的分区、入口卡片和间距；计划弹窗恢复四步向导。告警严重程度标签置于卡片左上，应用页面与相关弹窗优先展示服务端返回的真实图标。设计源文件和样式原文未改动；LPK 版本升至 `0.1.2`，用于替换已安装的 `0.1.1`。 |
| 2026-08-30 | V1 | 正式界面改以 `designs/web.tsx` 为唯一视觉和页面结构来源，生产前端改为 `src/ui/` 的实时控制层、页面和弹窗；旧生产原型实现移除。快照、批次、任务、告警、审计和安全范围目录新增 tenant 限制的稳定游标分页，并以 `deployId` 作为前端关联键。 |
| 2026-08-29 | V1 | 存储页以既有容量汇总计算小占用显示并提供最小可见进度；页面布局重排不涉及接口、存储数据或写入权限。 |
| 2026-08-29 | V1 | 应用、计划、批次、任务和快照详情统一使用前端单一居中弹窗，并支持任务/快照往返切换；快照详情只在视图层合并元数据并默认截取文件索引，不新增接口、权限或数据写入。 |
| 2026-08-29 | V1 | 计划创建和编辑界面只产生 `FULL`、`CUSTOM` 范围；`CORE` 仅保留历史记录兼容，避免以目录名或应用类型猜测核心数据。 |
| 2026-08-29 | V1 | 控制库、任务和快照引入不可变范围快照与范围暂停原因；计划运行前校验全部目标，范围失效写入当前租户审计和站内告警。 |
| 2026-08-28 | V1 | 快照详情读取改为元数据优先，增加 `storageStatus` 目录可达状态；前端详情不触发校验、不提供导出和回收站操作；任务/批次详情与表格表头统一采用分层视觉规范。 |
| 2026-08-28 | V1 | 当前用户网盘备份根目录改为 `MimiAppBakcup`；存储层不迁移、合并、扫描或修改旧 `LazycatAppBackup` 目录。 |
| 2026-08-28 | V1 | 批次详情前端改用既有 `GET /api/batches/{batchId}`，移除通过批次列表和分页参数查找详情的冗余请求；未新增接口、权限或数据边界。 |
| 2026-08-28 | V1 | SSE 客户端调整为单连接、1.2 秒事件合并和 15 秒退避重连，避免会话重复赋值导致的取消连接与全页并发刷新；网盘提交目录按当前 tenant 设置的时区生成可读时间段并写入时区标识。 |
| 2026-08-28 | V1 | 计划目标收敛为显式实例列表，API 仅接受 `EXPLICIT`；控制库升级时将旧的动态目标计划停用并清空下一次运行时间，保留记录供用户重新选择目标后保存。 |
| 2026-08-28 | V1 | 每天和每周计划持久化本地执行时间，调度器结合计划时区生成 Cron；计划界面将补跑以“错过后不跑”开关呈现。 |
| 2026-08-27 | V1 | 参考 `agent-desk` 修正会话绑定：OIDC profile UID 与懒猫网关 UID 分开存储；回调保存 `X-HC-User-ID`，业务请求只比较 `session.gateway_uid` 与当前 `X-HC-User-ID`。 |
| 2026-08-27 | V1 | `LAZYCAT_APP_DEPLOY_UID` 保持为登录事务内部作用域；正式子域名为 `mimi-app-backup`，POC 为 `mimi-app-backup-poc`。 |
| 2026-08-27 | V1 | 单实例继续显示共享数据风险，但该提示不再要求确认框，也不阻断查看任务、手动备份或计划创建；手动入队完成校验后与浏览器请求取消解耦。 |
| 2026-08-27 | V1 | 产品更名为“咪咪应用备份（Mimi App Backup）”，LPK 包标识改为 `mimi-app-backup`，正式与 POC 路由同步更新；Go/Vite 构建通过并生成 `mimi-app-backup-0.1.0.lpk`。 |
| 2026-08-27 | V1 | OIDC 入口采用显式登录页和 `POST /auth/login`：仅在用户点击后创建 PKCE 登录事务；回调统一进入首页。浏览器遇到网关 UID 不匹配的旧会话会清理 Cookie 并回到登录页，API 返回 403。 |
| 2026-08-27 | V1 | 删除阶段 6。阶段 0–5 构成完整本地实现路线；构建、LPK 打包和真实平台确认改为路线外事项，不再占用开发阶段。 |
| 2026-08-27 | V1 | 阶段 5 完成本地实现：控制库新增当前租户的设置、告警、审计和事件序列；正式 API 新增 overview、alerts、settings、audit 和限时 SSE；八个主菜单及首次使用、详情、计划编辑、存储、告警和设置接入真实数据并提供中英文文案。外部 `user.notify`、OIDC 回调、网关 UID 会话绑定、A/B 隔离、网盘写入和后台补跑仍待真实平台验收；该阶段记录不包含 LPK 打包。 |
| 2026-08-27 | V1 | 阶段 4 完成本地实现：计划 CRUD 与立即运行、Cron/时区/补跑、批次和任务租约、重试、重启回收、文件索引、导出和存储扫描 API；产品不提供计划/快照删除、回收站或存储清理。 |
| 2026-08-28 | V1 | 明确产品生命周期边界：不提供清理、删除、回收站或自动保留删除；存储页只读展示实际 ZIP 占用、临时写入和目录可达状态，设置修改即时保存。 |
| 2026-08-27 | V1 | 阶段 3 增加当前租户手动备份闭环：完整预检、SQLite Online Backup、严格普通文件 ZIP、内外 manifest、SHA-256、快速校验、当前用户文稿目录原子提交、最小快照 API 与前端；计划和通用队列仍待后续阶段。 |
| 2026-08-27 | V1 | 首个正式实现包采用 Vite/React 同源托管，加入 OIDC、SQLite 控制库、应用同步/探测和 OpenAPI 契约；ZIP、计划和队列仍待后续阶段。 |
| 2026-08-27 | V1 | 对齐 PRD，增加 OIDC，保留 POC 链路，支持单/多实例，禁用管理员跨用户，改用 ZIP |
