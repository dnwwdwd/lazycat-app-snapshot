# Progress — 懒猫主动通知接入

**关联需求：** `REQ-20260901-012`
**关联决定：** `DEC-20260901-016`
**状态：** 本地实现完成；真实懒猫和浏览器验证待执行
**最后更新：** 2026-09-01

## 交付定义

- 成功通知开关开启后，成功完成的手动或定时备份调用懒猫 MessageService；用户已授权且页面打开时，浏览器显示同一结果的原生通知。
- 首次失败开关开启后，失败或超时的终态任务调用同一消息服务；用户已授权且页面打开时，浏览器显示同一结果的原生通知。
- 通知目标固定为当前任务租户，消息元数据只包含安全标识符。
- `user.notify` 不可用时不影响备份、快照、站内告警或审计结果。

## 本地实现

- 新增 `platform.SDKNotifier`，通过 `gohelper.NewAPIGateway` 和 `common.MessageService.NewMessage` 发送消息。
- `operations.Service.TaskUpdated` 在任务终态读取当前租户设置，根据两个开关决定是否发送消息。
- 成功消息覆盖 `SUCCEEDED`、`SUCCEEDED_WITH_WARNINGS`；失败消息覆盖 `FAILED`、`TIMED_OUT`。
- `ForTenant` 保留通知器实例，设置读取和消息接收者继续跟随当前租户。
- SQLite 快照失败会在任务完成全部重试后进入 `FAILED` 终态；该终态和成功终态都经过同一个通知回调，不把单次可重试的锁竞争提前通知为失败。
- 设置页新增“授权浏览器通知”操作，只在用户点击时申请 Web Notification 权限。授权状态由浏览器管理，不写入服务端。
- SSE 新连接没有事件游标时从当前事件头部开始并发送 `stream.ready`；前端以该标记跳过历史任务通知，重连使用最近事件游标补齐页面运行期间遗漏的结果。

## 本地验证

- 2026-09-01：`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`npx vite build`（`apps/web/`）和 `git diff --check`：通过。
- `gofmt`：通过。
- `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`：通过。
- 未运行测试套件，遵守项目验证规则。
- `npm run api:generate --prefix apps/web`、`(cd apps/web && npx vite build)`、`go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`、`lzc-cli project build -o cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`、`lzc-cli lpk info cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk` 和 `lzc-cli lpk lint cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk` 均通过；本次包版本固定为 `0.1.0`，产物大小为 19.03 MiB（19,958,272 bytes），SHA-256 为 `093163e5f34171d1b3dee212e33dde66d9fa7796eb42c20f5e9dd7a03d8dfc19`，未部署或发布。
- 真实平台与浏览器展示仍待设备确认，包含自定义范围 SQLite 任务的成功、最终失败、自动重试中间态不通知、首次页面加载不弹历史通知，以及缺少 `user.notify` 或浏览器权限时的降级行为。
