# 懒猫应用备份技术实现文档

> 文档版本：V1  
> 产品名称：懒猫应用备份（Lazycat App Backup）  
> 后端技术栈：Go  
> 前端技术栈：Next.js + TypeScript  
> 目标平台：懒猫微服 LPK V2  
> 支持语言：简体中文（zh-CN）、English（en-US）  
> 最后更新：2026-08-26
> 说明：本文档版本固定为 V1，后续调整只更新“最后更新”和变更记录。

## 1. 实现结论

V1 采用“每个懒猫用户一个独立备份应用实例”的多实例部署模型。

- 备份应用配置 `multi_instance: true`。
- 每个用户打开应用后，系统为该用户启动独立的备份应用容器。
- 每个容器只管理当前用户拥有的目标应用实例。
- 每个容器拥有独立的 `/lzcapp/var`、控制数据库、计划、任务队列、快照索引和告警记录。
- 每个容器只向 `/lzcapp/documents/<当前用户 UID>` 写入备份，不允许选择管理员或其他用户的 UID。
- 前端和后端不提供用户切换、owner 筛选、跨用户查询或管理员全局视图。
- 目标应用必须是当前用户拥有的多实例应用，并且 `AppInfo.owner` 必须等于当前备份应用实例的 `LAZYCAT_APP_DEPLOY_UID`。
- 单实例目标应用的 `/lzcapp/var` 可能同时包含多个用户的数据，V1 将其标记为“共享实例不支持”，不读取、不扫描、不备份。
- 本轮 POC 为验证“选择应用 → 全量探测 → 手动快照”链路，允许单实例目标在页面显示共享数据风险后继续只读探测和一次手动快照；这不改变 V1 的支持边界。
- 普通文件和目录使用文件级备份。
- 标准 SQLite 使用 SQLite Online Backup API 创建一致性副本。
- MySQL、PostgreSQL、MongoDB、Redis 以及其他已知数据库在预检阶段阻断。
- 备份载荷直接写入当前用户自己的懒猫网盘应用文稿目录，不长期保存在备份应用容器中。
- 一个用户命中成百上千个应用实例时，系统先快速创建持久化任务，再由有界工作池按资源预算执行。

## 2. 用户隔离模型

### 2.1 租户定义

每个备份应用实例就是一个独立租户。租户身份从运行时环境读取：

```text
tenant_uid    = LAZYCAT_APP_DEPLOY_UID
backup_app_id = LAZYCAT_APP_ID
```

当前 POC 只依赖平台注入的 `LAZYCAT_APP_DEPLOY_UID`。开发盒没有稳定注入 `LAZYCAT_APP_DEPLOY_ID`，因此 POC 不把部署 ID 作为启动或健康检查条件。V1 若需要备份应用自身 deploy ID，必须先通过已验证的平台 API 获取，不能依赖未确认的 manifest 变量展开。

`tenant_uid` 是该容器唯一允许服务的懒猫用户。运行期间不得通过前端参数、数据库设置或管理员身份切换租户。

### 2.2 三层隔离

V1 同时使用三层隔离。

#### 平台容器隔离

备份应用使用多实例部署。不同用户运行不同容器，容器内的 `/lzcapp/var`、`/lzcapp/cache` 和应用文稿视图彼此隔离。

#### 领域数据隔离

所有控制面记录保存 `tenant_uid`。任何应用实例、计划、批次、任务和快照在创建前都校验：

```text
source_instance.owner_uid == tenant_uid
```

不满足时返回 `INSTANCE_OWNER_MISMATCH`，不允许继续解析源路径。

#### 请求隔离

所有浏览器请求经过 Go 身份中间件。中间件读取入口注入的 `X-HC-User-ID`，并要求：

```text
X-HC-User-ID == tenant_uid
```

缺少身份头或 UID 不匹配时返回 `403`。后端不接受请求体、Query 参数或自定义 Header 中的 `uid`、`owner_uid`、`storage_uid`、`other_uid` 作为授权依据。

### 2.3 管理员行为

管理员访问自己的备份应用实例时，只能管理管理员本人拥有的应用实例和管理员本人的网盘目录。管理员角色不会解锁其他家庭成员的数据。

V1 不实现：

- 管理员全局实例目录。
- 代表其他用户创建计划。
- 将其他用户的快照写入管理员网盘。
- 以 `other_uid` 查询其他用户。
- 在同一个控制数据库中保存多个用户的数据。

### 2.4 单实例目标应用

懒猫单实例应用由多个用户共享一个容器，应用自行处理用户隔离。备份工具读取的是原始 appvar 文件，无法通用判断某条数据库记录或某个文件属于哪个用户。

V1 对所有单实例目标应用执行以下处理：

```text
capability = SHARED_INSTANCE_UNSUPPORTED
backup_allowed = false
```

页面说明：

```text
该应用使用共享实例，应用数据目录可能包含多个用户的数据。
V1 无法按用户安全拆分，暂不提供备份。
```

后续只有在目标应用提供用户级导出接口，或平台提供用户级 appvar 快照接口后，才允许支持单实例应用。

POC 例外：服务端仍校验 `owner_uid == tenant_uid`、源路径边界和源目录可读性；单实例扫描成功后返回 `BACKUPABLE` 并附带 `sourceWarning`，手动快照按钮可以执行。该结果只能证明平台源投影可读，不能证明共享 appvar 已完成用户级拆分。

## 3. V1 能力边界

### 3.1 正式支持

- 当前用户拥有的多实例应用。
- 普通文件和目录。
- JSON、JSONL、YAML、TOML、CSV、Markdown、文本文件。
- 图片、附件、模型文件、配置文件和应用运行资源。
- 向量索引、全文索引和自定义二进制目录，按文件级方式备份。
- 标准 SQLite 3，通过 Online Backup API 生成一致性副本。
- 单实例计划、应用全部实例计划、批量计划和 Cron 定时计划。
- 将结果写入当前用户自己的懒猫网盘应用文稿目录。
- 中英文国际化。

### 3.2 明确不支持

- 其他用户拥有的应用实例。
- 单实例共享应用的 appvar。
- MySQL、MariaDB、PostgreSQL、MongoDB、Redis。
- Elasticsearch、ClickHouse、OpenSearch 等服务型数据库。
- DuckDB、LMDB、RocksDB、LevelDB、Pebble、bbolt、BadgerDB、H2、HSQLDB、Derby 等其他文件或目录数据库。
- SQLCipher 或无法确认格式的加密 SQLite。
- 懒猫网盘、懒猫相册、LightOS 和其他系统级特殊数据。
- 其他应用的应用文稿、媒体目录、RemoteFS、NAS 和宿主机任意目录。
- 直接写回目标应用 appvar。
- 自动停止、启动或重启目标应用。
- 跨用户集中备份、集中查看和统一恢复。

### 3.3 安全不变量

1. 当前备份实例只处理 `owner_uid == tenant_uid` 的目标实例。
2. 目标实例必须为多实例应用。
3. 源 appvar 始终只读。
4. 不申请 `appvar.other.write`。
5. 不使用 `QueryApplication.other_uid`。
6. 不允许前端提交源绝对路径。
7. 不硬编码宿主机 `/data/appvar/<deploy_id>`。
8. 不允许选择其他用户的网盘 UID。
9. 目标根目录固定从 `/lzcapp/documents/<tenant_uid>` 派生。
10. 未写入 `COMPLETED` 的目录不算成功快照。
11. 检测到不支持数据库时不降级为普通文件备份。
12. SQLite 在线备份失败时不直接复制活动数据库文件。
13. 任何列表、SSE、日志、导出和告警都不得返回其他用户的数据。

## 4. 技术栈

### 4.1 后端

| 类别 | 技术 | 用途 |
| --- | --- | --- |
| 语言 | Go | API、调度、队列、扫描、归档和后台任务 |
| HTTP | `net/http` + `chi` | REST API、静态资源、健康检查和 SSE |
| 控制数据库 | SQLite WAL | 当前用户的目录、计划、批次、任务、快照和设置 |
| SQLite 驱动 | `modernc.org/sqlite` | 多架构构建和 SQLite Online Backup API |
| 调度 | `robfig/cron/v3` + 持久化调度层 | Cron、补跑、批次展开和备份窗口 |
| 并发 | Go context、channel、`x/sync` | 有界工作池、取消、限流和资源预算 |
| 文件系统 | Go 标准库 + `golang.org/x/sys/unix` | 安全遍历、文件类型、Statfs、fsync 和路径校验 |
| 归档 | `archive/tar` | 流式归档和分片 |
| 压缩 | `klauspost/compress/zstd` | 低内存流式压缩 |
| 校验 | SHA-256 | 归档分片、SQLite、索引和清单校验 |
| 日志 | `log/slog` | 结构化日志、tenant 字段和脱敏 |
| 接口契约 | OpenAPI | 前后端 DTO、错误码、分页和事件模型 |
| 懒猫平台 | Go Lzc SDK | 当前用户应用实例查询、实例变化和通知 |

### 4.2 前端

当前 POC 使用 `apps/web` 中的 Vite + React 静态构建；V1 规划中的 Next.js 依赖和大规模数据组件尚未进入此 POC。

| 类别 | 技术 | 用途 |
| --- | --- | --- |
| 框架 | Next.js App Router（V1 规划） | 路由、布局和静态导出 |
| 语言 | TypeScript 严格模式 | 类型安全 |
| 部署 | Static Export | 由 Go 同源托管，生产环境不运行 Node.js |
| UI | React + shadcn/ui + Radix UI | 页面组件、弹窗、菜单和无障碍交互 |
| 样式 | Tailwind CSS | 设计令牌和响应式布局 |
| 图标 | Lucide | 菜单、状态和操作图标 |
| 服务端状态 | TanStack Query | 缓存、分页、失效和重试 |
| 表格 | TanStack Table + 虚拟滚动 | 大规模应用、任务和快照列表 |
| 表单 | React Hook Form + Zod | 计划和设置表单 |
| 国际化 | next-intl | `zh-CN` 与 `en-US` |
| 实时状态 | EventSource/SSE | 当前用户的任务、批次和告警 |

### 4.3 运行形态

V1 使用一个多实例 LPK。每个用户实例运行一个 Go 进程，Go 进程内部包含：

- HTTP API。
- Next.js 静态资源托管。
- 当前用户身份校验。
- 应用目录同步。
- 调度器。
- 持久化任务队列。
- 有界备份工作池。
- SQLite 快照工作池。
- 网盘写入和校验。
- SSE 聚合。

不为每个用户额外启动常驻 Node.js 服务，也不在 V1 中拆分多个 Worker 容器。多实例部署已经会按用户复制容器，单进程结构可以降低每个用户实例的内存占用和挂载复杂度。

## 5. LPK 配置

### 5.1 `package.yml`

```yaml
package: cloud.lazycat.app.backup
version: 0.1.0
name: 懒猫应用备份 POC
description: 验证当前用户可安全读取自己拥有的应用 appvar
author: dnwwdwd
homepage: https://github.com/dnwwdwd/lazycat-app-snapshot
license: MIT
min_os_version: "1.5.0"

locales:
  zh:
    name: 懒猫应用备份 POC
    description: 验证当前用户可安全读取自己拥有的应用 appvar
  zh_CN:
    name: 懒猫应用备份 POC
    description: 验证当前用户可安全读取自己拥有的应用 appvar
  en:
    name: Lazycat App Backup POC
    description: Verify safe, tenant-isolated read access to the current user's appvar
  ja:
    name: Lazycat App Backup POC
    description: 現在のユーザーが所有するアプリの appvar を安全に読み取れることを検証します

permissions:
  required:
    - appvar.other.read
    - document.private
  optional:
    - user.notify
```

不设置 `admin_only: true`。普通用户和管理员都只能使用自己的多实例容器。

### 5.2 `lzc-manifest.yml`

```yaml
application:
  subdomain: app-backup-poc
  multi_instance: true
  background_task: true
  routes:
    - /=http://web.cloud.lazycat.app.backup.lzcapp:8080

services:
  web:
    image: registry.lazycat.cloud/u30387910/library/debian:cb352a5223b8abc9
    command: sh /lzcapp/pkg/content/lzc/run.sh
    environment:
      - BACKUP_APP_DEPLOY_UID=${LAZYCAT_APP_DEPLOY_UID}
      - BACKUP_WEB_ROOT=/lzcapp/pkg/content/web
    healthcheck:
      test_url: http://127.0.0.1:8080/api/health
```

POC 构建脚本将前端产物和静态 Linux amd64 Go 二进制放入 LPK 内容目录。运行脚本只启动二进制，不在容器启动时安装依赖或执行前端构建。服务不向 `/lzcapp/pkg/content` 写入数据，也不使用宿主机挂载。

当前 POC 已实现“选择应用 → 递归探测 appvar → 手动读取快照”的服务端闭环。应用目录在 Lazycat 运行时通过官方 Lzc SDK 的 `QueryApplication` 获取，请求固定为空 `deploy_ids`、`only_owner=true`、`ignore_pending_pkg=true`，不传 `other_uid`；服务端还会再次过滤 `AppInfo.owner == tenant_uid`。本地 fixture 仍用于离线测试。浏览器只能提交已展示的 `deploy_id` 和相对文件路径；后端会再次校验 `owner_uid == tenant_uid`、路径未越界和数据库类型。多实例是 V1 的正式入口，单实例在 POC 中只增加共享数据警告。手动快照只写当前用户 `/lzcapp/documents/<tenant_uid>` 下的 POC 目录，响应只返回归档元数据和 SHA-256，不返回文件正文。

真实平台的 `QueryApplication` 目录适配已接入，appvar 投影到源根目录的官方映射仍需在设备上验证。目录可用但没有批准的源投影时，页面显示 `SOURCE_NOT_READY`，不会猜测宿主路径或伪造数据。POC 快照对 SQLite 采用原始读取，V1 的 SQLite Online Backup、调度和恢复能力仍未实现。

设备验证中已观察到两类状态：应用目录查询可以返回当前用户的应用；选中应用后，如果 `appvar.other.read` 没有提供业务容器可见的只读源投影，报告会显示 `platform source resolver is not configured`。这表示平台源解析能力尚未接入当前包，不表示产品页面或应用目录不可做。解析器需要由 Lazycat 提供正式的只读文件投影/API；宿主侧 `/lzcsys/data/appvar/...` 路径不属于业务容器可用接口，不能作为实现替代。

### 5.3 后台运行限制

`background_task: true` 用于避免实例在执行长任务时因不活跃被停止。官方现有说明中，由该字段带来的自动启动行为只覆盖单实例应用，因此多实例定时任务必须完成下面的真机验证：

1. 当前用户能否为自己的备份应用 `deploy_id` 开启自启动。
2. `PackageManager.ChangeDeployCfg` 的 `autostart` 是否允许实例 owner 调用。
3. 微服重启后，该用户的备份应用实例是否能自动恢复。
4. 无法自动恢复时，应用启动后能否按补跑窗口执行漏跑计划。

V1 必须始终实现补跑机制。自启动 POC 未通过时，页面显示：

```text
当前系统无法保证多实例应用在重启后自动运行。
定时计划会在你下次打开应用时按补跑规则执行。
```

不得在未验证的情况下承诺完全无人值守的重启后定时备份。

## 6. 当前用户身份

### 6.1 容器身份

Go 进程启动时读取并冻结：

```text
LAZYCAT_APP_DEPLOY_UID
BACKUP_APP_DEPLOY_UID
LAZYCAT_APP_ID
LAZYCAT_BOX_DOMAIN
```

启动条件：

- `LAZYCAT_APP_DEPLOY_UID` 必须非空。
- `BACKUP_APP_DEPLOY_UID` 必须等于 `LAZYCAT_APP_DEPLOY_UID`。
- 当前备份应用必须以多实例运行；目标应用是否多实例由报告展示，POC 允许单实例进入只读验证并显示警告。
- POC 不要求 `LAZYCAT_APP_DEPLOY_ID` 或 `BACKUP_APP_DEPLOY_ID`。

不满足时进入只读诊断页面，不启动调度器和 Worker。

### 6.2 HTTP 身份

懒猫入口鉴权成功后会向应用注入 `X-HC-User-ID`。Go 中间件按以下顺序处理：

1. 验证请求来自受信任 ingress 转发链。
2. 读取 `X-HC-User-ID`。
3. 要求其等于 `tenant_uid`。
4. 读取 `X-HC-User-Role` 仅用于页面展示。
5. 将 `tenant_uid` 写入请求上下文。
6. 所有业务服务只从请求上下文获取租户，不读取前端 UID 参数。

### 6.3 后台任务身份

调度任务没有浏览器请求上下文，后台进程使用容器启动时冻结的 `tenant_uid`。调用 Lzc SDK 查询应用时：

- `other_uid` 始终为空。
- `only_owner` 设置为 `true`。
- 返回结果必须再次检查 `AppInfo.owner == tenant_uid`。
- V1 返回的单实例应用只用于展示“不支持”状态，不进入 SourceResolver；本轮 POC 可将单实例交给只读源探测器，并在报告中附带共享数据警告。

真机 POC 必须确认 Go 后台通过运行时 SDK 凭据调用 `QueryApplication` 时，系统识别的当前用户就是 `LAZYCAT_APP_DEPLOY_UID`。如果无法建立该用户上下文，V1 不得改用管理员 `other_uid` 兜底。

当前 SDK 版本不会仅凭应用 deploy UID 推导 API 用户上下文。POC 调用 SDK 的 `WithRealUID(tenant_uid)`，将启动时冻结的租户 UID 放入 `X-Hc-User-Id` 元数据；该值不来自浏览器，也不通过 `QueryApplication.other_uid` 传递。

## 7. 应用实例发现

### 7.1 查询规则

每个用户实例只执行当前用户查询：

```text
QueryApplication(
  deploy_ids = [],
  other_uid = unset,
  only_owner = true,
  ignore_pending_pkg = true
)
```

严禁：

- 列出盒子全部用户。
- 遍历 UID 并逐个查询。
- 由管理员传入 `other_uid`。
- 在控制库中创建其他用户的 owner 记录。

### 7.2 目标实例唯一键

当前用户的多实例目标使用：

```text
tenant_uid + appid + source_deploy_id
```

`source_deploy_id` 是平台返回的目标应用实例 ID。每次同步时保存：

- `tenant_uid`。
- `appid`。
- 应用名称和版本快照。
- `source_deploy_id`。
- `owner_uid`。
- `multi_instance`。
- 运行状态。
- 是否内置。
- 最近同步时间。

数据库约束要求 `owner_uid == tenant_uid`。

### 7.3 分类

同步结果分为：

- `OWNED_MULTI_INSTANCE`：当前用户拥有的多实例，可以进入能力检测。
- `SHARED_INSTANCE_UNSUPPORTED`：单实例，共享 appvar，不允许备份。
- `OWNER_MISMATCH`：owner 与当前租户不一致，拒绝保存并产生安全告警。
- `SYSTEM_UNSUPPORTED`：系统应用或特殊对象。
- `SELF_EXCLUDED`：备份应用自身，防止递归备份。

### 7.4 增量同步

- 监听应用安装、卸载和实例变化事件。
- 事件只触发重新查询，不直接作为最终事实。
- 定期执行当前用户全量对账。
- 每次计划触发前重新查询当前用户实例。
- 目标实例消失时停止新任务，历史快照保留在当前用户网盘。

## 8. appvar 访问与租户边界

### 8.1 `appvar.other.read`

该权限只赋予读取能力。正式代码必须通过平台适配器解析源目录，不接受前端绝对路径，也不拼接宿主机路径。

### 8.2 SourceResolver 输入

SourceResolver 只接收后端目录中已经验证的对象：

```text
tenant_uid
appid
source_deploy_id
owner_uid
multi_instance
```

解析前必须满足：

```text
owner_uid == tenant_uid
multi_instance == true
source_deploy_id 在当前用户最新 QueryApplication 结果中存在
```

上面是 V1 SourceResolver 的正式约束。POC 在 `multi_instance == false` 时保留租户、路径和只读校验，返回共享数据告警并允许一次只读快照；该例外不进入 V1 能力声明。

### 8.3 SourceResolver 输出

- 只读源根目录或平台文件句柄。
- 对应 `source_deploy_id`。
- 投影方式和适配器版本。
- 是否只读。
- 根目录设备和 inode 标识。
- 最近验证时间。

### 8.4 发布门槛

必须使用两个普通用户 A、B 验证跨用户边界：

1. 用户 A 的备份容器只能解析用户 A 拥有的目标 `deploy_id`。
2. 用户 B 的目标 `deploy_id` 传给用户 A 的 SourceResolver 时必须失败。
3. 用户 A 无法通过目录遍历列出用户 B 的 appvar 根。
4. 用户 A 无法 `stat`、打开或读取用户 B 的源文件。
5. 用户 A 的源目录只读，无法创建、修改和删除。

如果 `appvar.other.read` 在多实例容器中暴露全局可枚举 appvar，且平台没有提供用户级强制过滤或实例句柄，V1 不发布用户版。仅靠前端隐藏或 Go 业务过滤不足以宣称系统级用户隔离。

### 8.5 路径安全

- 使用相对路径遍历。
- 不跟随越过源根的符号链接。
- 跳过 Socket、命名管道、块设备和字符设备。
- 不读取 `/proc`、`/sys`、`/dev` 或宿主机目录。
- 不把 `/data/appvar` 当作公开 API。
- 执行前重新解析源根并比对 deploy ID。

## 9. 当前用户网盘存储

### 9.1 固定存储 UID

存储 UID 固定为：

```text
storage_uid = tenant_uid = LAZYCAT_APP_DEPLOY_UID
```

前端不提供 UID 选择器。后端 API 不接受 `storage_uid` 参数。

### 9.2 应用文稿可见范围

备份应用使用多实例模式并声明 `document.private`。当前容器只允许使用当前实例所属用户的应用文稿目录：

```text
/lzcapp/documents/<tenant_uid>
```

启动时执行：

1. 读取 `tenant_uid`。
2. 构造固定用户根目录。
3. 检查 `/lzcapp/documents` 下只出现当前用户允许的 UID 视图。
4. 如果发现其他 UID 子目录，进入安全阻断状态并停止调度器。
5. 在当前用户目录下创建产品根目录。

### 9.3 根目录

```text
/lzcapp/documents/<tenant_uid>/LazycatAppBackup/
```

`LazycatAppBackup` 使用稳定英文目录名，界面按语言显示“懒猫应用备份”或“Lazycat App Backup”。

### 9.4 物理目录树

每个用户拥有独立根目录，因此物理树无需增加 owner 层级：

```text
LazycatAppBackup/
├── <scheduled_at>/
│   ├── batch.json
│   └── <source_deploy_id>/
│       └── <application_slug>/
│           ├── manifest.json
│           ├── file-index.jsonl.zst
│           ├── files-000001.tar.zst
│           ├── files-000002.tar.zst
│           ├── sqlite/
│           │   └── <encoded_relative_path>.sqlite
│           ├── checksums.sha256
│           ├── warnings.json
│           └── COMPLETED
├── _partial/
├── _restore_exports/
├── _trash/
└── _system/
```

目录层级满足：

```text
备份时间点 → deploy_id → 应用名称
```

### 9.5 命名规则

- `scheduled_at` 使用 UTC，格式 `yyyyMMddTHHmmss.SSSZ`。
- `source_deploy_id` 经过路径安全编码。
- `application_slug` 使用安全化应用名称加稳定 appid 后缀。
- 应用改名不搬迁旧快照。
- 同一毫秒发生冲突时追加批次短 ID。
- 路径移除分隔符、控制字符、尾部空格和保留名称。

### 9.6 Manifest 用户字段

每个 `manifest.json` 必须保存：

```text
tenant_uid
source_owner_uid
backup_app_deploy_id
source_deploy_id
appid
应用名称快照
应用版本
scheduled_at
started_at
captured_at
finished_at
任务和批次 ID
备份模式
SQLite 列表
文件统计
校验和
```

提交前断言：

```text
tenant_uid == source_owner_uid
```

### 9.7 临时提交

任务先写入：

```text
_partial/<batch_id>/<job_id>/
```

提交步骤：

1. 完成普通文件归档和 SQLite 副本。
2. 关闭全部文件。
3. flush 和 fsync。
4. 写入文件索引、warnings 和 checksums。
5. 写入最终 manifest。
6. 在同一用户网盘根内移动到最终目录。
7. 最后创建 `COMPLETED`。
8. 控制数据库提交快照状态。

任何失败只影响当前用户当前任务，不触碰其他用户目录。

## 10. 控制数据库

### 10.1 位置

```text
/lzcapp/var/control/control.db
```

多实例容器天然拥有各自的 `/lzcapp/var`，不同用户不会共享控制数据库。

### 10.2 数据域

控制库保存：

- 当前租户元数据。
- 当前用户拥有的目标应用实例。
- 能力检测结果。
- 备份计划。
- 备份批次。
- 实例任务和 attempt。
- 快照摘要。
- 保留策略。
- 告警和通知记录。
- 调度器租约。
- 当前用户设置。

不保存：

- 盒子全部用户目录。
- 其他用户应用实例。
- 管理员统一配置。
- 文件正文。
- 完整文件索引。
- 完整归档载荷。

### 10.3 租户字段

即使控制库已经物理隔离，核心表仍保存 `tenant_uid`，并在唯一索引中使用它。目的包括：

- 防止导入错误控制库后误读。
- 对账 manifest。
- 日志审计。
- 未来迁移时保持明确边界。

启动时如果数据库 tenant 与环境 tenant 不一致，后端进入 `TENANT_DATABASE_MISMATCH` 阻断状态。

## 11. 调度与大规模任务

### 11.1 每用户独立调度

每个用户实例只加载该用户的计划。不存在跨用户总调度器，也不在管理员容器中创建其他用户任务。

### 11.2 批次展开

计划触发时：

1. 读取当前 `tenant_uid`。
2. 重新同步当前用户拥有的多实例应用。
3. 计算匹配目标。
4. 排除共享实例、无数据和不支持数据库。
5. 在一个事务中创建批次。
6. 分块插入实例任务。
7. 所有任务共享 `scheduled_at`。
8. 由有界工作池领取任务。

容量目标：

- 单个用户控制库支持至少 10,000 条应用实例记录。
- 单个用户计划可匹配至少 5,000 个目标实例。
- 5,000 个任务记录在基准设备上 10 秒内完成展开和持久化，不包含文件扫描和网盘写入。
- 不为每个目标创建常驻 goroutine。

### 11.3 工作池

内部工作池至少区分：

- 元数据探测池。
- 小型普通文件池。
- 大型普通文件池。
- SQLite 在线快照池。
- 校验池。
- 清理池。

调度同时受以下预算控制：

- CPU。
- 内存。
- 源磁盘读取吞吐。
- 当前用户网盘写入吞吐。
- 文件描述符。
- `/lzcapp/cache` 临时空间。
- `_partial` 空间。
- 单文件大小和任务估算大小。

### 11.4 同实例互斥

锁键：

```text
tenant_uid + source_deploy_id
```

同一个用户的同一个目标实例同一时间只运行一个备份、校验或导出任务。

### 11.5 多用户设备压力

不同用户拥有不同备份容器，V1 不建立跨用户协调服务。为避免多个家庭成员同时启动大量任务：

- 每个容器使用保守默认并发。
- 每个容器设置 CPU、内存和 I/O 预算。
- 计划支持备份窗口。
- 可对同一逻辑时间使用基于 `tenant_uid` 的确定性微小抖动，目录中的 `scheduled_at` 保持原计划时间。
- 页面展示实际 `started_at` 和 `captured_at`。

## 12. 单任务执行

1. 从任务记录读取 `tenant_uid` 和目标实例。
2. 校验任务 tenant 等于进程 tenant。
3. 重新调用当前用户 `QueryApplication`。
4. 确认目标仍存在、为多实例且 owner 等于 tenant。
5. 通过 SourceResolver 获取只读 appvar 根。
6. 检查当前用户网盘根和剩余空间。
7. 创建 `_partial` 任务目录。
8. 完整扫描文件类型和数据库特征。
9. 遇到已知不支持数据库时终止。
10. 为 SQLite 创建一致性副本。
11. 普通文件流式写入 tar + zstd 分片。
12. 写入文件索引和 SHA-256。
13. 复核不稳定文件。
14. 写入 manifest。
15. 创建 `COMPLETED`。
16. 更新控制库和 SSE。
17. 执行当前用户保留策略。
18. 清理当前任务临时资源。

任一步发现 owner 变化或 tenant 不一致，任务立即失败并产生安全告警。

## 13. 文件扫描

### 13.1 支持条目

- 普通文件。
- 目录。
- 未越出源根的安全符号链接，可按配置保留链接本身。
- 标准 SQLite 主数据库。

### 13.2 跳过条目

- Unix Socket。
- 命名管道。
- 字符设备和块设备。
- PID、Lock 和明确的运行时临时文件。
- SQLite `-wal`、`-shm`、`-journal`，由 SQLite 专用流程处理。

### 13.3 文件稳定性

普通文件复制前后比较：

- 大小。
- 修改时间。
- inode 或平台可用的文件标识。

发生变化时有限重试。严格模式下持续变化会使任务失败；容错模式下任务可以完成但标记警告。SQLite 不使用该降级方式。

### 13.4 数据库阻断

预检识别：

- PostgreSQL：`PG_VERSION`、`base/`、`global/`、`pg_wal/`。
- MySQL/MariaDB：`ibdata1`、`mysql/`、`performance_schema/`。
- MongoDB：`WiredTiger`、`collection-*.wt`。
- Redis：`dump.rdb`、AOF 和 `appendonlydir/`。
- 其他已知文件数据库签名。

命中后状态为 `UNSUPPORTED_DATABASE`，整个实例不产生成功快照。

## 14. SQLite 在线备份

### 14.1 识别

通过 SQLite 文件头识别，扩展名仅作为辅助。识别到 SQLCipher 或未知加密格式时阻断。

### 14.2 执行

1. 以只读方式打开源数据库。
2. 目标文件创建在当前用户 `_partial/.../sqlite/`。
3. 使用 SQLite Online Backup API 分页复制。
4. 设置 busy timeout 和有限重试。
5. 不使用忽略 WAL 实时状态的 immutable 假设。
6. 关闭备份句柄。
7. 对目标执行 `PRAGMA quick_check`。
8. 计算 SHA-256。
9. 归档或保留为独立 SQLite 文件。
10. 提交成功后删除任务级临时状态。

### 14.3 失败处理

出现以下情况时任务失败：

- 源投影无法满足 SQLite 锁和 WAL 读取语义。
- `SQLITE_BUSY` 超出重试。
- quick check 失败。
- 目标网盘不支持所需随机写、fsync 或 rename 语义。

不得回退成 `cp` 活动 `.db` 文件。

## 15. API 与前端隔离

### 15.1 API 原则

所有接口隐式绑定当前 `tenant_uid`。URL 和请求体不出现可切换租户的字段。

接口类别：

- 当前会话和运行环境。
- 当前用户应用实例。
- 当前用户能力检测。
- 当前用户计划。
- 当前用户批次和任务。
- 当前用户快照。
- 当前用户存储状态。
- 当前用户告警和设置。
- 当前用户 SSE。

### 15.2 禁止字段

前端不得提交：

```text
owner_uid
storage_uid
other_uid
tenant_uid
source_absolute_path
```

`source_deploy_id` 可以作为资源 ID 传入，但后端必须在当前用户目录中重新解析。

### 15.3 列表行为

- 应用列表只展示当前用户可见的应用。
- 多实例且 owner 匹配的应用可以备份。
- 单实例应用展示“共享实例不支持”。
- 不展示其他家庭成员昵称、UID、任务和快照。
- 页面无需 owner 筛选器和用户切换器。

### 15.4 SSE

SSE 连接建立时绑定请求 tenant。事件总线按 tenant 分区，发送前再次确认事件 tenant 等于连接 tenant。

## 16. 国际化

### 16.1 前端

Next.js 使用 `next-intl`：

```text
zh-CN
en-US
```

覆盖菜单、状态、错误、时间、容量、通知和空状态。

### 16.2 后端

后端返回稳定错误码和参数：

```json
{
  "code": "SHARED_INSTANCE_UNSUPPORTED",
  "messageParams": {
    "appid": "cloud.lazycat.app.example"
  },
  "traceId": "..."
}
```

后端不向 API 返回硬编码展示句子。系统通知根据当前用户保存的语言生成。

## 17. 代码目录结构

目录名固定，具体文件名、类型名和函数名由执行模型根据实现需要确定。

```text
/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── session/
│   │   │   ├── overview/
│   │   │   ├── applications/
│   │   │   ├── capabilities/
│   │   │   ├── plans/
│   │   │   ├── tasks/
│   │   │   ├── snapshots/
│   │   │   ├── storage/
│   │   │   ├── alerts/
│   │   │   ├── settings/
│   │   │   └── diagnostics/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── i18n/
│   │   ├── styles/
│   │   ├── public/
│   │   └── tests/
│   └── server/
│       ├── cmd/
│       ├── internal/
│       │   ├── tenant/
│       │   ├── auth/
│       │   ├── api/
│       │   ├── platform/
│       │   │   └── lazycat/
│       │   ├── catalog/
│       │   ├── capability/
│       │   ├── source/
│       │   ├── scheduler/
│       │   ├── queue/
│       │   ├── worker/
│       │   ├── backup/
│       │   │   ├── scanner/
│       │   │   ├── database_detection/
│       │   │   ├── sqlite/
│       │   │   ├── archive/
│       │   │   ├── checksum/
│       │   │   └── manifest/
│       │   ├── storage/
│       │   │   └── documents/
│       │   ├── snapshots/
│       │   ├── retention/
│       │   ├── alerts/
│       │   ├── notifications/
│       │   ├── realtime/
│       │   ├── persistence/
│       │   ├── migrations/
│       │   ├── localization/
│       │   ├── telemetry/
│       │   └── diagnostics/
│       ├── assets/
│       └── tests/
├── contracts/
│   ├── openapi/
│   ├── events/
│   └── schemas/
├── deploy/
│   ├── lpk/
│   ├── docker/
│   └── environments/
├── tests/
│   ├── integration/
│   ├── e2e/
│   ├── isolation/
│   ├── recovery/
│   ├── load/
│   └── fixtures/
├── scripts/
├── docs/
└── tools/
```

### 17.1 前端目录职责

- `app/`：路由、布局、页面边界和静态导出入口。
- `components/`：通用 UI 组件。
- `features/session/`：当前用户与容器租户状态，只读展示。
- `features/applications/`：当前用户应用目录和实例列表。
- `features/capabilities/`：可备份性、共享实例和数据库阻断状态。
- `features/plans/`：计划列表和向导。
- `features/tasks/`：队列、批次和任务详情。
- `features/snapshots/`：当前用户快照库。
- `features/storage/`：当前用户网盘容量和目录健康，不提供 UID 选择。
- `features/alerts/`：当前用户告警。
- `features/settings/`：当前用户设置。
- `i18n/`：语言路由、词条和格式化配置。

### 17.2 后端目录职责

- `tenant/`：从环境冻结租户，提供不可变 TenantContext。
- `auth/`：校验 `X-HC-User-ID` 与 tenant。
- `platform/lazycat/`：Lzc SDK、当前用户 QueryApplication、环境变量和通知适配。
- `catalog/`：当前用户应用目录同步。
- `capability/`：多实例校验、共享实例阻断和数据类型能力。
- `source/`：用户级 SourceResolver 和只读路径验证。
- `scheduler/`：当前用户计划、Cron、补跑和批次展开。
- `queue/`：持久化队列、租约、重试和优先级。
- `worker/`：有界工作池和资源预算。
- `backup/`：扫描、数据库检测、SQLite、归档、校验和 manifest。
- `storage/documents/`：只允许当前用户 `/lzcapp/documents/<tenant_uid>`。
- `persistence/`：控制数据库和 tenant 约束。
- `realtime/`：按 tenant 发布 SSE。
- `diagnostics/`：不包含文件正文和其他用户信息的诊断包。

## 18. 错误码

用户隔离相关错误至少包括：

```text
MULTI_INSTANCE_REQUIRED
TENANT_UID_MISSING
TENANT_DEPLOY_ID_MISSING
REQUEST_USER_MISSING
REQUEST_USER_MISMATCH
TENANT_DATABASE_MISMATCH
INSTANCE_OWNER_MISMATCH
SHARED_INSTANCE_UNSUPPORTED
CROSS_USER_SOURCE_DENIED
CROSS_USER_DOCUMENT_VIEW_DETECTED
CURRENT_USER_CONTEXT_UNAVAILABLE
APPVAR_PROJECTION_NOT_USER_SCOPED
SOURCE_NOT_READ_ONLY
```

备份相关错误沿用：

```text
NO_DATA
UNSUPPORTED_DATABASE
UNKNOWN_DATABASE
SQLITE_ONLINE_BACKUP_UNAVAILABLE
SQLITE_INTEGRITY_CHECK_FAILED
FILE_CHANGED_DURING_BACKUP
DOCUMENT_STORAGE_UNAVAILABLE
DOCUMENT_STORAGE_FULL
SNAPSHOT_COMMIT_FAILED
```

## 19. 日志与审计

每条结构化日志包含：

- `tenant_uid_hash`。
- `backup_app_deploy_id`。
- `source_deploy_id_hash`。
- `appid`。
- `batch_id`。
- `job_id`。
- `trace_id`。
- 阶段和错误码。

不记录：

- 原始文件正文。
- Cookie。
- API Auth Token。
- 其他用户 UID。
- 可反推出其他用户网盘位置的路径。
- SQLite 内容。

出现 owner mismatch、请求用户 mismatch 或跨用户路径时记录安全告警，并停止相关队列领取，等待重新诊断。

## 20. 故障恢复

### 20.1 当前用户实例重启

1. 校验环境 tenant。
2. 打开当前用户控制库。
3. 校验控制库 tenant。
4. 校验当前用户网盘根。
5. 回收过期租约。
6. 扫描当前用户 `_partial`。
7. 对账当前用户 `COMPLETED`。
8. 重新加载当前用户计划。
9. 按补跑窗口创建漏跑任务。
10. 恢复当前用户 SSE 状态。

### 20.2 用户退出或实例删除

- 不删除当前用户网盘中的历史快照。
- 备份应用实例被卸载并清理 appvar 后，控制库可能丢失，但应用文稿默认保留。
- 重新安装后可扫描当前用户网盘 manifest 重建快照索引。
- 不扫描或导入其他用户目录。

### 20.3 源应用卸载

- 停止该 deploy ID 的新任务。
- 保留当前用户已有快照。
- 计划标记目标缺失。
- 应用重新安装产生新 deploy ID 时视为新实例，不自动覆盖旧实例历史。

## 21. 测试方案

### 21.1 双用户隔离测试

准备用户 A 和 B：

1. 两人分别打开备份应用，确认备份应用 `deploy_id` 不同。
2. 两人的 `/lzcapp/var/control` 数据互不可见。
3. 用户 A 的应用 API 不返回用户 B 的实例。
4. 用户 A 猜测用户 B 的 source deploy ID 时返回 404 或 403。
5. 用户 A 的 SourceResolver 无法解析用户 B appvar。
6. 用户 A 的 `/lzcapp/documents` 只出现 A 允许的 UID 目录。
7. 用户 A 快照只出现在 A 的懒猫网盘。
8. 用户 B 无法通过 URL、API、SSE 或文件路径查看 A 快照。
9. 管理员登录自己的实例也无法看到 A、B 的备份数据。
10. 用户 A、B 同时执行任务时，各自控制库和目录保持独立。

### 21.2 目标应用类型

- 当前用户拥有的多实例普通文件应用。
- 当前用户拥有的多实例 SQLite 应用。
- 单实例共享应用。
- owner 不匹配实例。
- MySQL、PostgreSQL、MongoDB、Redis 应用。
- 空 appvar 应用。
- 系统应用和 LightOS。

### 21.3 调度测试

- 多实例应用启动后的后台常驻。
- 微服重启后的自启动能力。
- 自启动不可用时补跑。
- 5,000 任务批次展开。
- 备份窗口截止。
- Worker 崩溃和租约回收。
- 网盘变慢、空间不足和断开。

### 21.4 SQLite 测试

- WAL 模式持续写入。
- 长事务。
- busy 重试。
- quick check 失败。
- 网盘随机写和 rename。
- 源投影锁语义不兼容。

## 22. 真机 POC 发布门槛

以下项目全部通过后，V1 才进入正式开发完成阶段：

1. 多实例备份应用能获得非空 `LAZYCAT_APP_DEPLOY_UID`，并能通过包路由访问自己的服务。
2. 普通用户可以访问自己的备份应用实例，不依赖管理员页面。
3. `X-HC-User-ID` 与 deploy UID 一致。
4. Go 后台 Lzc SDK 查询默认绑定当前 deploy UID。
5. `QueryApplication` 不传 `other_uid` 时只返回当前用户数据。
6. `only_owner=true` 能稳定过滤当前用户拥有的实例。
7. 用户 A 无法解析或读取用户 B 的 appvar。
8. appvar 投影存在稳定 deploy ID 映射。
9. appvar 投影保持只读。
10. 多实例 `document.private` 只暴露当前用户 UID 子目录。
11. 备份结果出现在当前用户自己的懒猫网盘。
12. 管理员网盘不会收到其他用户快照。
13. 单实例目标被稳定识别并阻断。
14. SQLite Online Backup API 在只读投影下可用。
15. 当前用户网盘支持 SQLite 目标随机写、fsync、close 和 rename。
16. 多实例备份应用的自启动或补跑行为经过重启验证。

任一跨用户隔离测试失败时停止发布，不使用管理员集中模式或宿主机权限兜底。

## 23. V1 技术验收标准

1. 备份应用以多实例运行。
2. 普通用户和管理员都只访问自己的备份应用实例。
3. 每个实例拥有独立控制库、计划、队列、告警和设置。
4. 所有 HTTP 请求要求 `X-HC-User-ID == LAZYCAT_APP_DEPLOY_UID`。
5. 后端从不使用 `QueryApplication.other_uid`。
6. 应用目录只保存当前用户拥有的目标实例。
7. 单实例共享应用被阻断。
8. 用户 A 无法列出、读取、计划或查看用户 B 的任何数据。
9. 源 appvar 只读。
10. 普通文件可以流式写入当前用户网盘。
11. SQLite 在应用运行时生成通过 quick check 的一致性副本。
12. MySQL、PostgreSQL、MongoDB、Redis 和其他已知数据库被阻断。
13. 网盘根固定为 `/lzcapp/documents/<tenant_uid>/LazycatAppBackup`。
14. 页面和 API 不存在 storage UID、owner UID 和用户切换功能。
15. 目录按 `scheduled_at → source_deploy_id → application_slug` 组织。
16. 只有包含 `COMPLETED` 的目录进入快照库。
17. 5,000 个当前用户目标可形成持久化批次，Worker 数量保持有界。
18. 后端重启后能回收租约、对账 partial 并补跑。
19. 中文和英文功能一致。
20. amd64 与 arm64 真机通过隔离、备份、校验和重启测试。

## 24. 后续能力

后续版本可以增加：

- 目标应用提供的用户级备份协议。
- 在具备用户级导出 API 时支持单实例应用。
- MySQL、PostgreSQL、MongoDB、Redis 官方备份适配器。
- 当前用户快照恢复组件，独立申请写权限。
- 当前用户自选网盘子目录。
- 当前用户 S3、WebDAV、SFTP 和 NAS 目标。
- 加密、去重、增量和异地灾备。

跨用户集中管理必须作为独立产品能力设计，要求明确授权、审计和平台级隔离，不进入当前 V1。

## 25. 参考资料

- 懒猫 `package.yml` 权限规范：<https://developer.lazycat.cloud/spec/package.html>
- 懒猫 `lzc-manifest.yml` 规范：<https://developer.lazycat.cloud/spec/manifest.html>
- 懒猫多实例：<https://developer.lazycat.cloud/advanced-multi-instance.html>
- 懒猫文件访问：<https://developer.lazycat.cloud/advanced-file.html>
- 懒猫环境变量：<https://developer.lazycat.cloud/advanced-envs.html>
- 懒猫 HTTP Headers：<https://developer.lazycat.cloud/http-request-headers.html>
- 懒猫后台常驻文档：<https://github.com/lazycatapps/lzc-developer-doc/blob/lazycat-main/docs/advanced-background.md>
- 懒猫 SDK：<https://developer.lazycat.cloud/introduction.html>
- PackageManager Proto：<https://github.com/lib-x/lzc-sdk-rs/blob/main/proto/cloud/lazycat/apis/sys/package_manager.proto>
- SQLite Online Backup API：<https://sqlite.org/backup.html>
- SQLite WAL：<https://sqlite.org/wal.html>
- Next.js App Router：<https://nextjs.org/docs/app>

## 26. 变更记录

| 日期 | 文档版本 | 变更 |
| --- | --- | --- |
| 2026-08-24 | V1 | 按 Go + Next.js、普通文件与 SQLite、懒猫网盘存储、多实例和大规模调度架构重写 |
| 2026-08-25 | V1 | 重构为每用户独立多实例模型；移除管理员集中发现与集中存储；快照固定写入当前用户网盘；阻断单实例共享应用和所有跨用户访问 |
