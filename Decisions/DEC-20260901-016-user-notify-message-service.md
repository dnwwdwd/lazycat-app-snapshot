# DEC-20260901-016 — 任务结果使用懒猫平台消息和浏览器通知

**状态：** 本地实现完成；`user.notify`、真实设备消息展示和浏览器权限待验证
**关联缺陷：** `BUG-20260901-006`
**关联需求：** `REQ-20260901-012`

## 背景

设置页保存 `notifyFirstFailure` 和 `notifySuccess`，`package.yml` 声明可选的 `user.notify`。任务终态需要可靠保留懒猫平台消息；用户还需要在页面保持打开时看到浏览器级横幅，且浏览器权限必须由用户显式授予。

## 决定

使用 `gitee.com/linakesi/lzc-sdk` 的 `common.MessageService.NewMessage` 发送任务结果：

- `receiver` 使用当前任务所属的当前租户 UID。
- 请求上下文通过 `gohelper.WithRealUID` 绑定该 UID，再连接 `/lzcapp/run/sys/lzc-apis.socket` 对应的 API Gateway。
- 消息类型使用 `MsgType_NORMAL`，标题和正文使用固定的安全文本，`meta` 只放任务、批次、应用实例等标识符。
- `SUCCEEDED` 与 `SUCCEEDED_WITH_WARNINGS` 受 `notifySuccess` 控制；`FAILED` 与 `TIMED_OUT` 受 `notifyFirstFailure` 控制。
- 平台权限缺失、API Gateway 不可用或消息服务失败只记录服务端日志，不改变已经提交的备份任务状态，也不回滚快照。

浏览器通知使用 Web Notification API：

- 设置页只在用户点击“授权浏览器通知”后调用 `Notification.requestPermission()`；授权状态由浏览器按当前站点保存，不写入服务端设置或控制库。
- 已授权页面接收 `task.updated` 的 `SUCCEEDED`、`SUCCEEDED_WITH_WARNINGS`、`FAILED` 或 `TIMED_OUT` 事件时，按同一成功/失败开关显示原生浏览器通知。
- SSE 无游标的新连接从当前租户事件头部开始，并先发送 `stream.ready`；首次页面加载不把历史任务重放为浏览器通知。后续连接带最近事件游标，补齐页面运行期间断线遗漏的事件。
- 浏览器通知只在应用页面打开且浏览器仍在运行时可达。本版不接入 Service Worker、浏览器 Push 或外部推送服务。

## 边界

通知发送不接受浏览器传入的 UID、源路径、Token 或 Cookie，不使用宿主机路径、跨用户回退、`other_uid` 或额外写权限。`user.notify` 和浏览器授权都可缺失；任一通道不可用时主备份流程和站内告警保持可用。

## 验证

本地只执行 Go 编译、Vite 构建和差异检查。真实懒猫设备需要确认开启设置并授权浏览器后，手动和定时备份在成功及失败终态分别产生平台消息与浏览器通知；还需确认首次打开页面不显示历史弹窗，缺少任一可选授权时任务仍能正常完成。
