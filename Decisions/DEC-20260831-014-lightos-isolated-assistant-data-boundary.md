# DEC-20260831-014 — appvar 投影能力与 LightOS 隔离数据边界

**状态：** 已采纳；官方按实例只读数据接口证据待补
**关联需求：** `REQ-20260831-011`

## 决定

目录同步不根据 `appid`、`deploy_id`、应用名称或商店标签推断 LightOS 类型。它对每个目录项使用同一条能力链：确认已授权 appvar 投影根存在；确认 `<appid>` 候选目录存在、为目录且未以符号链接逃逸；再遍历目录。根、候选目录或遍历路径不可用时，服务持久化 `SYSTEM_UNSUPPORTED` 和稳定原因码 `SOURCE_PROJECTION_UNAVAILABLE`；权限拒绝使用 `SOURCE_PERMISSION_DENIED`，全局投影不可见使用 `RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE`。扫描达到 100,000 个目录项的受限上限时使用 `SOURCE_ENTRY_LIMIT_EXCEEDED`。只有超时和未分类的探测异常使用 `PROBE_FAILED`。

Totoro 是触发本次修复的实例。它和任何其他无法从授权 appvar 投影读取数据、或超过受限扫描上限的应用走相同规则，页面显示“系统或权限受限”，不显示“需要重新检测”或 `PROBE_FAILED`。

## 依据

- [LightOS 开发文档](https://developer.lazycat.cloud/advanced-lightos.html)描述的能力不包含供第三方 LPK 读取其他 LightOS 实例文件系统的按实例数据接口。
- [小龙猫应用说明](https://lazycat.cloud/appstore/detail/cloud.lazycat.totoro)明确每个助手运行在独立隔离的 LightOS 文件系统中。
- 本应用已验证的数据入口只覆盖当前 tenant 的 `/lzcapp/run/data/app/var` appvar 投影。现有 `appvar.other.read`、Lzc SDK 和本地 `lzc-cli` 不提供对该隔离文件系统的读取契约。

## 后果与约束

- 不申请 `lightos.manage`、`appvar.other.write` 或额外挂载；不使用宿主机路径、`other_uid`、`compose.override` 或跨用户回退。
- `PROBE_FAILED` 继续代表未分类的真实探测异常，不能用于掩盖平台数据源不可用或读取被拒绝的情况。
- 未来若 Lazycat 提供按 `tenant_uid`、`appid`、`deploy_id` 授权的只读 LightOS 数据接口，必须先完成平台 POC，验证单实例和多实例授权、只读语义及两用户隔离，才能增加备份支持。

## 验证边界

本地 Go/Vite/LPK 检查只能证明分类、API 契约和界面文案已打包。真实懒猫设备仍要确认 Totoro 目录同步后的终态，以及一个普通 appvar 应用未被这项通用分类影响。
