# Progress — 概览图表与列表列宽优化

**Requirement:** REQ-20260901-013
**Status:** 本地实现完成；真实平台验证待执行
**Last updated:** 2026-09-01

## 本次实现

- 保护概览使用 `GET /api/overview` 的状态计数生成 SVG 环形图；扇区和图例支持悬停、点击、键盘聚焦/选择，并显示当前状态数量。
- 选中图表扇区时，右侧对应图例文字和数字切换为更大的字号、加深颜色和字重；图表中心保持原有字号，并移除额外悬停提示文案。
- 应用页和备份库页移除独立部署实例列，保留 `deployId` 在详情、筛选和服务端关联中；空状态列数同步调整。
- 数据库特征标签设置为 grid 内自适应内容宽度，短标签不再拉伸为整列宽度。
- 按固定版本 `0.1.0` 重新生成 LPK，未部署或发布。

## 验证记录

- `go build -o /tmp/mimi-app-backup-server ./apps/server/cmd/server`：通过。
- `npm run api:generate --prefix apps/web`：通过（随 LPK 构建执行）。
- `npx vite build`（`apps/web/`）：通过。
- `npm run build --prefix apps/web` 的 `api:check` 因工作区已有 OpenAPI 与生成类型漂移停止；随后独立 Vite 生产构建通过。
- `git diff --check`：通过。
- `lzc-cli project build -o cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`：通过。
- `lzc-cli lpk info cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`：通过，版本 `0.1.0`，大小 19.05 MiB（19,974,144 bytes）。
- `lzc-cli lpk lint cloud.lazycat.app.mimi-app-backup-v0.1.0.lpk`：通过，无警告。
- LPK SHA-256：`99269e2dddc1133861e3c5d5d65db685384978f19bbec28a4a7e3ae8d310a7c4`。
- 未运行测试套件，未部署、发布或推送。

## 待补证据

- 真实懒猫页面需确认 overview 数据变化后图表刷新，以及鼠标/键盘交互在窄屏下的可用性。
