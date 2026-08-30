# 咪咪应用备份

This repository contains the product and technical documents, the React frontend, and the Go service for backing up application data to the current user's Lazycat Drive.

Read [DOCUMENT_MAP.md](DOCUMENT_MAP.md) first. The POC package and two-user device matrix have passed; V1 implementation now proceeds on that verified data path. [docs/APPVAR_READ_POC_RUNBOOK.md](docs/APPVAR_READ_POC_RUNBOOK.md) remains the required regression check after a platform, permission, projection, or resolver change.

## Build the formal V1 service

```text
sh lzc/build-package.sh
lzc-cli project build -o mimi-app-backup-0.1.0.lpk
```

`sh lzc/build-package.sh` prepares the static Vite frontend and Linux amd64 `backup-server` binary under `lzc-dist/`. The LPK runtime starts `/lzcapp/pkg/content/bin/backup-server` through `lzc/run.sh`.

本地 `.lpk` 构建不需要连接设备。OIDC 会话、当前用户应用目录、备份计划、任务队列、ZIP 快照、备份库、告警和设置由 Go 服务与 Vite 前端共同提供。POC 验证记录和回归手册保留在 `docs/APPVAR_READ_POC_RUNBOOK.md`，用于平台权限或运行时投影发生变化后的复核。
