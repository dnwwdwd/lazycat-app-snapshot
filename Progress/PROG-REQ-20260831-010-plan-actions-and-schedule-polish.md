# Progress — 计划操作确认与执行频率展示优化

**Requirement:** REQ-20260831-010
**Status:** 本地实现完成；真实平台验证待执行
**Last updated:** 2026-09-01

## 本次实现

- 计划卡片的立即执行、暂停和恢复操作改为统一确认弹窗；立即执行文案说明会创建一次批次，暂停文案说明不会影响正在运行的任务。
- 确认成功或失败后通过全局 toast 提示结果，失败仍保留现有 API 错误提示。
- 表格图标按钮统一写入 `title`、`data-tooltip` 和 `aria-label`，任务中心与备份库沿用同一组件。
- 新增共享执行频率格式化函数，计划列表、概览和详情不再直接呈现频率枚举。
- 计划详情 filetree 在目录超过 5 个时默认折叠，并在树与目标分隔线之间增加上下间距。

## 本轮错误提示改进

- 任务中心表格和任务详情统一将稳定错误码映射为中英文可读原因；未知的未来错误码也回退为通用失败说明，不回显内部错误码。
- 计划卡片在最近批次为失败时，按 `batch_id` 读取该批次任务并汇总失败原因。多目标计划保留多项原因；读取失败原因的请求暂不可用时，卡片提示用户到任务中心查看详情。
- 此改动复用现有任务查询 API，不修改任务、批次、计划的服务端数据结构、租户范围或队列行为。

## 本地验证

- 2026-09-01：`go build -o /tmp/mimi-app-backup-server-error-i18n ./cmd/server`（在 `apps/server/`）与 `cd apps/web && npx vite build`：通过。
- 2026-09-01：`git diff --check`：通过。
- 2026-09-01：`lzc-cli project build -o cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`、`lzc-cli lpk info` 与 `lzc-cli lpk lint`：通过，无警告。产物为 19.05 MiB（19,971,072 bytes），SHA-256 为 `9360acfd82746845f90640863e3a6829a4e2af91f2cbcdd08badec5924ad551c`；未部署或发布。
- `npm run api:generate --prefix apps/web`：通过。
- `cd apps/web && npx vite build`：通过。
- `go build -o /tmp/mimi-backup-server ./apps/server/cmd/server`：通过。
- `git diff --check`：通过。
- `sh lzc/build-package.sh`：通过。
- `lzc-cli project release --output cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`：通过。
- `lzc-cli lpk info cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`：通过，版本 `0.1.0`。
- `lzc-cli lpk lint cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`：通过，无警告。
- LPK SHA-256：`b867125a93fdcf6fde0a51b1d68b6870dd045b7d8f748e928a6d9e9db36c5097`。
- 未运行测试，未安装、部署、发布、推送或创建合并请求。

## 待补证据

- 在真实懒猫设备确认计划 API、实时刷新和移动端确认弹窗体验。
- 确认失败计划卡片展示的原因与任务中心、任务详情一致，且切换中英文后不显示稳定错误码。
