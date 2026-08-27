# 懒猫应用备份 appvar 读取 POC 技术实现文档

> 文档用途：基于 `dnwwdwd/lazycat-app-snapshot` 当前代码，验证懒猫是否向第三方 LPK 提供可用的跨应用 appvar 读取契约，并在契约存在时跑通一次只读手动快照  
> 代码仓库：<https://github.com/dnwwdwd/lazycat-app-snapshot>  
> 输出目录：`/lzcapp/document/LazycatAppBackup/poc`（当前用户懒猫网盘公共文稿根目录）  
> 最后更新：2026-08-27

## 1. POC 结论标准

本 POC 需要得到一个明确结果：

```text
PASS_API
```

懒猫 SDK 或系统 API 提供了按 `deploy_id` 授权的 list/stat/read/stream 能力，当前用户只能读取自己的目标实例。

```text
PASS_MOUNT
```

懒猫官方文档或官方答复提供了按实例隔离的只读挂载，当前用户只能读取自己的目标实例。

```text
BLOCKED_NO_CONTRACT
```

`appvar.other.read` 已声明，但当前 SDK、系统 API 和正式文档都没有给出可使用的数据入口。

```text
FAIL_ISOLATION
```

数据入口存在，但用户 A 可以枚举或读取用户 B 的 appvar，用户版方案停止。

POC 不安装、不调用、不依赖 Duplicati。任何其他应用中的路径都不能直接写入本项目代码。

## 2. 当前仓库状态

当前代码已经完成：

- `QueryApplication` 当前用户应用目录查询。
- owner 二次过滤。
- fixture 目录扫描。
- 普通文件和数据库特征识别。
- SHA-256 探针。
- `tar.gz + manifest.json` 手动快照。
- 当前用户懒猫网盘公共文稿目录写入（`/lzcapp/document`）。
- SourceResolver 接口和本地 fixture 测试。

当前设备适配：

LZCOS v1.6 的应用清单需要通过 `ext_config.permissions` 声明
`PERM_OTHER_APP_DATA_ADMIN`。授权后，运行时会把全局 appvar 投影到业务容器的
固定路径 `/lzcapp/run/data/app/var`。`runtimeAppvarResolver` 按目录名
`appid` 绑定已通过 owner 校验的应用，扫描、哈希探针和快照都从这个容器内路径读
取；不会猜宿主路径，也不会添加宿主挂载。若权限未授予、应用实例未重建或投影不存
在，状态为 `RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE`。该兼容投影在设备上是可写
mount，因此代码返回 `ReadOnlyMode=service-enforced`，只承诺本服务不会写源；两用户
隔离仍需真机验收。本轮只处理平台数据入口和一次只读快照，不开发调度器、SQLite
Online Backup、恢复和完整产品页面。

## 3. 实现原则

平台数据源只接受：

1. 当前 Lzc SDK 或系统 API 中公开的 deploy-scoped appvar 读取方法。
2. 懒猫开发者文档明确规定的只读挂载。
3. 懒猫官方给出的书面契约。

禁止：

- 从 Duplicati 或其他应用推导路径。
- 使用 `/data/appvar`、`/lzcsys/data/appvar` 等宿主机路径。
- 使用 `compose.override` 强行挂载。
- 让浏览器传入源绝对路径。
- 通过管理员 `other_uid` 读取其他用户数据。

## 4. 本轮代码改动

### 4.1 保留现有应用目录查询

继续使用当前 `loadPlatformApplications`：

```text
QueryApplication
only_owner = true
other_uid = unset
ignore_pending_pkg = true
```

继续执行：

```text
AppInfo.owner == tenant_uid
```

应用目录查询与 appvar 读取分开处理。应用出现在列表中，不代表源数据已经可读。

### 4.2 重构平台 SourceResolver

保留当前 `sourceResolver` 和 `resolvedSource` 边界，把平台实现改成 Provider 组合：

```text
SDK provider
Documented mount provider
Fixture provider
Unavailable provider
```

选择顺序：

1. SDK provider 已编译且运行时能力可用时使用。
2. LZCOS v1.6 `runtime-appvar` 投影可见时使用固定容器路径 provider。
3. 官方挂载契约已配置并验证时使用 documented mount provider。
4. 本地测试使用 fixture provider。
5. 没有入口时返回平台投影未就绪错误。

不得给 Provider 设置来自 Duplicati 的默认路径。

### 4.3 SDK provider

检查当前依赖版本中的公开服务和 Proto：

- PackageManager。
- FileHandler。
- FileTransfer。
- 其他与 appvar、application data、deploy source 相关的服务。

只有方法同时满足以下条件才接入：

```text
输入可以绑定 appid 或 deploy_id
平台执行权限校验
输出提供 list/stat/read/stream 中至少一组能力
能够拒绝其他用户 deploy_id
```

`QueryApplication` 只用于元数据，不当作文件读取接口。

当前 SDK 没有符合条件的方法时，SDK provider 返回 `SOURCE_CONTRACT_UNSUPPORTED`，不要编造方法名或请求结构。

### 4.4 runtime appvar provider

当前包默认启用 LZCOS v1.6 兼容入口：

```text
BACKUP_POC_APPVAR_ROOT=/lzcapp/run/data/app/var
BACKUP_POC_APPVAR_MODE=runtime-appvar
BACKUP_POC_APPVAR_LAYOUT=appid
BACKUP_POC_PROVIDER_VERSION=lzcos-runtime-appvar-v1
```

根路径是业务容器内固定位置，不是宿主目录。provider 只使用经过 catalog
owner 校验的 `appid` 作为单级目录名，拒绝 `..`、斜杠、符号链接越界和不完整的
deploy 映射。读取代码不执行写入，能力响应和快照 manifest 都记录
`read_only_mode=service-enforced`。

### 4.5 documented mount provider

只有拿到官方文档或官方答复后才配置。配置通过服务端环境变量注入，例如：

```text
BACKUP_POC_APPVAR_ROOT
BACKUP_POC_APPVAR_LAYOUT
BACKUP_POC_PROVIDER_VERSION
```

这些变量由 LPK 配置或真机测试环境设置，不来自浏览器。当前包已经固定配置
`runtime-appvar` 入口；只有在接入另一份正式 mount 契约时，才改用这些变量。

Provider 需要验证：

- 根目录存在。
- 根目录属于运行时挂载。
- `deploy_id` 可以唯一映射。
- 目标目录只读。
- 解析结果没有越过根目录。
- 当前用户无法枚举其他用户实例。

LZCOS v1.6 的兼容入口不使用宿主路径，固定根目录为
`/lzcapp/run/data/app/var`；如果该目录不可见，先检查
`PERM_OTHER_APP_DATA_ADMIN` 授权和应用实例是否需要重建。

### 4.6 fixture provider

保留现有 `source_root` fixture，只用于：

- 单元测试。
- 本地 UI 联调。
- 扫描与快照代码回归。

fixture 通过不代表平台 POC 通过。

## 5. 诊断接口

增加：

```text
GET /api/poc/source-capability
```

返回：

```json
{
  "catalogReady": true,
  "permissionDeclared": true,
  "providerStatus": "READY",
  "providerKind": "runtime-appvar",
  "providerVersion": "lzcos-runtime-appvar-v1",
  "sdkMethod": "",
  "mountConfigured": true,
  "isolationVerified": false,
  "readOnlyMode": "service-enforced",
  "blockingReason": ""
}
```

接口只返回能力状态，不返回：

- 文件正文。
- 宿主机路径。
- 未脱敏 UID。
- 其他用户应用信息。

现有接口保持：

```text
GET  /api/poc/identity
GET  /api/poc/applications
GET  /api/poc/applications/<deploy_id>
GET  /api/poc/read
POST /api/poc/snapshots
```

当平台目录已就绪但兼容投影不可见时，应用列表可以返回，详情状态和读取/快照错误码
返回 `RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE`。没有目录或请求信息不完整时，才使用
通用的 `SOURCE_NOT_READY`。

## 6. LPK 配置

`package.yml` 保留：

```yaml
permissions:
  required:
    - appvar.other.read
    - document.write
```

`lzc-manifest.yml` 另有一项 LZCOS v1.6 兼容声明（不是用户可写权限）：

```yaml
ext_config:
  permissions:
    - PERM_OTHER_APP_DATA_ADMIN
```

服务环境固定为 `/lzcapp/run/data/app/var`、`appid` layout 和
`lzcos-runtime-appvar-v1`；备份目标固定为 `/lzcapp/document`。不要加入 `appvar.other.write`，不要把
`/lzcsys/data/appvar` 写入 manifest 或环境变量。升级后若旧实例没有出现该投影，
需要在懒猫管理界面重新授权或重建应用实例。

本轮不把后端从 `services.web` 移到 `application`：设备证据表明兼容投影会注入业务
service，当前结构已经可以消费该路径。

如果官方挂载契约明确限定到 `application` 或某类 service，再按契约调整 `lzc-manifest.yml`。容器迁移必须由证据驱动。

安装后需要确认：

- 新权限是否出现在安装确认或应用权限页面。
- 权限是否已实际授权。
- 旧版本升级是否需要卸载重装。
- 当前 LzcOS、lzc-cli 和 SDK 版本。

## 7. POC 执行流程

### 7.1 第一步：确认应用目录

在真机打开 POC：

1. `/api/poc/identity` 返回当前 `tenant_uid`。
2. `/api/poc/applications` 能返回当前用户应用实例。
3. 请求不传 `other_uid`。
4. 返回记录全部满足 `owner == tenant_uid`。
5. 备份应用自身被排除。

失败时先修复 SDK 身份和应用目录，不进入 appvar 测试。

### 7.2 第二步：检查 SDK/API

在当前依赖版本中记录：

```bash
go list -m all | grep -E 'lzc-sdk|lazycat'
rg -n -i 'appvar|other.*var|deploy.*read|read.*deploy|application.*data' \
  "$(go env GOPATH)/pkg/mod" apps/server
```

查看生成 Proto 和客户端方法，记录完整版本与结果。

通过条件：找到官方公开方法，输入可绑定目标实例，输出可读取文件数据，并且权限与用户边界有定义。

没有找到时记录 SDK 不支持实例级读取的证据；当前 POC 继续使用已经验证的
LZCOS v1.6 兼容投影，而不是编造 SDK 方法。

### 7.3 第三步：检查正式挂载契约

先查开发者文档、SDK 仓库、系统变更日志和官方答复。当前包已按设备证据启用
LZCOS v1.6 兼容投影；真机仍需确认该投影只返回预期 appid 且不能跨用户读取。

真机检查只查看 `/lzcapp` 运行时范围：

```bash
findmnt -R /lzcapp 2>/dev/null || true
grep '/lzcapp' /proc/self/mountinfo
find /lzcapp/run -maxdepth 3 -type d -o -type l 2>/dev/null | head -300
```

这些输出用于发现和核对。生产代码只接受固定的业务容器路径，不读取
`/lzcsys/data/appvar` 等宿主路径。

### 7.4 第四步：接入 Provider

#### API 路线

- 使用官方客户端调用实例级 list/stat/read/stream。
- SourceResolver 保存平台句柄或流式访问器。
- 每次读取前重新校验 owner 与 `deploy_id`。
- 句柄过期时刷新，不回退到文件路径。

#### 运行时投影路线

- 使用 `/lzcapp/run/data/app/var` 下的 `appid` 目录。
- `deploy_id` 仍由 catalog 绑定并在每次请求前校验 owner；它不直接拼接宿主路径。
- 代码只执行目录遍历、`os.Stat` 和 `os.Open`，能力标记为 `service-enforced`。

#### documented 挂载路线

- 根目录由官方契约配置。
- 只使用相对路径。
- `deploy_id` 按官方布局解析。
- 路径归一化后仍位于根目录内。
- 只读检查通过。

### 7.5 第五步：当前用户读取闭环

准备一个无敏感数据的多实例测试应用，在自己的 appvar 中写入：

```text
poc/marker.txt
```

执行：

1. POC 应用列表选中测试实例。
2. 详情状态从 `RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE` 变为 `BACKUPABLE`。
3. 扫描返回目录项、文件数和大小。
4. `/api/poc/read` 对 `poc/marker.txt` 返回读取字节数和 SHA-256，不返回正文。
5. 执行一次手动快照。
6. 当前用户网盘出现：

```text
/lzcapp/document/LazycatAppBackup/poc/<时间>/<appid>/<deploy_id>/
```

7. 目录包含 `snapshot.tar.gz` 和 `manifest.json`。
8. 源文件未被修改。

本轮快照仍使用当前 raw-read POC，不声明 SQLite 一致性。

### 7.6 第六步：双用户隔离

准备用户 A、B，各自拥有一个测试应用实例。

用户 A 必须满足：

- 应用列表不出现 B 的实例。
- B 的 `deploy_id` 无法通过详情接口。
- B 的 `deploy_id` 无法通过 SourceResolver。
- 无法 list、stat、read 或 snapshot B 的源。
- 无法枚举 B 的源目录或句柄。
- 快照只写入 A 的网盘。

用户 B 反向执行同样测试。

只要出现跨用户可见或可读，结果记为 `FAIL_ISOLATION`，停止用户版开发。

## 8. 单元测试

保留现有测试，增加：

- 未启用任何 Provider 时仍返回 `PLATFORM_RESOLVER_FOUND_BUT_NO_CALLER_VISIBLE_PROJECTION`（兼容模式缺失时返回 `RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE`），并保留 `SOURCE_NOT_READY` 作为目录或请求信息缺失的通用错误码。
- SDK provider 不支持时返回稳定错误码。
- mount provider 未配置时不尝试默认路径。
- mount 根目录越界时拒绝。
- `deploy_id` 映射不唯一时拒绝。
- owner 不匹配时 Provider 不执行。
- Provider 根路径和句柄不进入 JSON 响应。
- 浏览器不能提交源绝对路径。
- fixture provider 继续跑通扫描与快照。
- runtime provider 的 appid 映射、固定根目录、owner 校验和 `service-enforced` 只读标记。

执行：

```bash
gofmt -w apps/server/cmd/poc/*.go
go test ./...
npm run build --prefix apps/web
sh lzc/build-package.sh
lzc-cli project build -o lazycat-app-backup-poc-0.1.0.lpk
```

## 9. POC 通过标准

### PASS_API

- 官方 SDK/API 提供实例级文件读取。
- 当前用户目标实例可读。
- 其他用户实例在平台层被拒绝。
- 源只读。
- 手动快照写入当前用户网盘。

### PASS_MOUNT

- 官方文档或答复给出挂载和目录布局。
- 当前用户目标实例可唯一映射。
- 其他用户实例不可枚举和读取。
- 源只读。
- 手动快照写入当前用户网盘。

### BLOCKED_NO_CONTRACT

- 应用目录可查询。
- 权限已声明或已授权。
- 当前 SDK 没有实例级读取 API。
- 官方文档没有正式挂载契约。
- 仅在兼容投影和正式 API 都不可用时使用；当前包的预期故障码是
  `RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE`。

### FAIL_ISOLATION

- 当前用户可以看到或读取其他用户源。
- 用户版方案停止。
- 不使用 Go 列表过滤掩盖平台隔离缺失。

## 10. 本轮交付

Codex 本轮交付：

- Provider 组合与 `UnavailableProvider`。
- SDK/API 能力调查记录。
- `source-capability` 诊断接口。
- Provider 单元测试。
- LZCOS v1.6 兼容权限、运行时投影配置、SDK/API 能力调查和真机证据。
- `runtime-appvar` provider 的读取、扫描、哈希和手动快照闭环。
- 本地 `PASS_MOUNT` 等价路径验证；A/B 隔离未完成前不宣称最终 POC PASS。

本轮不增加：

- 调度器。
- 完整任务队列。
- SQLite Online Backup。
- 增量和保留策略。
- 恢复功能。
- 完整产品页面。

## 11. 需要向懒猫官方确认的问题

```text
1. appvar.other.read 获批后，应通过哪个 SDK/API 或运行时挂载读取数据？
2. 如果使用 API，如何传入 appid 和 deploy_id，支持哪些 list/stat/read/stream 操作？
3. 如果使用挂载，正式路径和目录布局是什么？
4. 该能力支持哪些 LzcOS 和 SDK 版本？
5. 会注入 application、services，还是指定容器？
6. 多实例应用中，平台是否只暴露当前 owner 的目标实例？
7. 是否支持 SQLite WAL、共享内存和文件锁读取？
8. 新增权限后是否需要重新授权或重新创建应用实例？
```

## 12. 参考资料

- 懒猫 `package.yml` 权限规范：<https://developer.lazycat.cloud/spec/package.html>
- 懒猫 `lzc-manifest.yml` 规范：<https://developer.lazycat.cloud/spec/manifest.html>
- 懒猫 Lzc SDK：<https://developer.lazycat.cloud/introduction.html>
- Go SDK：<https://gitee.com/linakesi/lzc-sdk>
- 当前仓库：<https://github.com/dnwwdwd/lazycat-app-snapshot>
