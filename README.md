# 咪咪应用备份

This repository currently contains the V1 PRD/PDD, the translated V1 React frontend prototype, and a gated POC for selecting an owned application, probing its `appvar`, and creating one manual read snapshot in the current user's Lazycat Drive.

Read [DOCUMENT_MAP.md](DOCUMENT_MAP.md) first. The POC package and two-user device matrix have passed; V1 implementation now proceeds on that verified data path. [docs/APPVAR_READ_POC_RUNBOOK.md](docs/APPVAR_READ_POC_RUNBOOK.md) remains the required regression check after a platform, permission, projection, or resolver change.

## Build the formal V1 service

```text
sh lzc/build-package.sh
lzc-cli project build -o mimi-app-backup-0.1.0.lpk
```

`sh lzc/build-package.sh` prepares the formal static Vite frontend and Linux amd64 `backup-server` binary under `lzc-dist/`. The LPK runtime starts `/lzcapp/pkg/content/bin/backup-server` through `lzc/run.sh`. `sh lzc/build-poc-package.sh` keeps the POC binary in a separate `lzc-dist-poc/` diagnostic artifact; package it with `lzc-build.poc.yml` when the two-user POC runbook needs to run again.

## Build the diagnostic POC

```text
sh lzc/build-poc-package.sh
lzc-cli project build -c lzc-build.poc.yml -o mimi-app-backup-poc-0.1.0.lpk
```

本地 `.lpk` 构建不需要连接设备。后续安装或部署前，目标微服仍需信任此工作站的 `lzc-cli` 公钥。POC 使用服务端应用目录和源解析器契约；在懒猫容器内，目录通过官方 Lzc SDK 以 `only_owner=true` 查询，不传 `other_uid`。本地测试可以使用 [`lzc/poc-applications.example.json`](lzc/poc-applications.example.json) 作为 fixture。LZCOS v1.6 通过 `lzc-manifest.yml` 中的兼容声明 `PERM_OTHER_APP_DATA_ADMIN` 把 `/lzcsys/data/appvar/` 投影到业务容器的 `/lzcapp/run/data/app/var`。服务只读取这个容器内固定路径，不推测宿主机路径。

## POC usage

The Vite frontend defaults to the “应用资产柜” page. The formal Go server protects business pages with OIDC, stores only server-side session metadata in the current tenant's control database, synchronizes the current-user application catalog through the verified SDK boundary, and exposes session/application APIs described in `api/openapi/openapi.yaml`. The application list, detail drawer, user menu, logout and refresh controls use these same-origin APIs. ZIP backup, plans and tasks remain unavailable in this delivery and are not simulated as successful operations. The POC diagnostics page and API remain development assets; the POC command still supports the passed read-only probe and `tar.gz` snapshot regression flow.

The Go service accepts these server-side fixture variables for local tests:

- `BACKUP_POC_APPLICATIONS_FILE`: JSON catalog; each item has `appid`, `name`, `version`, `deploy_id`, `owner_uid`, `multi_instance`, and a server-only `source_root`.
- `BACKUP_DOCUMENT_ROOT`: optional test output root. Runtime defaults to `/lzcapp/document`, the current user's public Lazycat Drive document root.
- The existing single-fixture variables (`BACKUP_POC_SOURCE_ROOT`, `BACKUP_POC_SOURCE_OWNER_UID`, `BACKUP_POC_SOURCE_DEPLOY_ID`, `BACKUP_POC_SOURCE_MULTI_INSTANCE`) remain supported.

The packaged runtime is preconfigured for the LZCOS v1.6 compatibility
projection:

```text
BACKUP_POC_APPVAR_ROOT=/lzcapp/run/data/app/var
BACKUP_POC_APPVAR_MODE=runtime-appvar
BACKUP_POC_APPVAR_LAYOUT=appid
BACKUP_POC_PROVIDER_VERSION=lzcos-runtime-appvar-v1
```

The runtime provider maps the catalog-validated `appid` to one directory
under that projection and rejects traversal or owner mismatches. It opens the
source only for reads (`ReadOnlyMode=service-enforced`); the compatibility
mount is writable at the kernel level on the observed device, so this is an
application-layer guarantee rather than a claim of a read-only mount. The
older `documented-mount` provider and its server-side layouts remain available
for an explicitly documented future contract. If the compatibility permission
is not granted or the projection is absent, the UI reports
`RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE` instead of guessing a host path.

When the package runs on Lazycat, the frozen tenant UID is attached as the SDK real-UID metadata (`X-Hc-User-Id`) before calling `QueryApplication` over the runtime API socket or `LZCAPP_API_GATEWAY_ADDRESS`. The request uses an empty `deploy_ids` list, `only_owner=true`, and `ignore_pending_pkg=true`; `other_uid` remains unset. The service filters the response again by the frozen tenant UID. If the compatibility projection is absent, the selected application reports `RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE`; this is a permission/instance-recreation issue, not a reason to add a host mount.

The snapshot is intentionally a raw-read POC. It does not provide SQLite Online Backup consistency, scheduling, restore, or cross-user administration. Unsupported service-database signatures block snapshot creation.

Runtime boundaries:

- `appvar.other.read` remains the user-facing data permission. `PERM_OTHER_APP_DATA_ADMIN` is an LZCOS v1.6 compatibility declaration required to create the in-container projection; `appvar.other.write` is never requested.
- The runtime provider exposes `ReadOnlyMode=service-enforced`: this process uses `os.Open` and read-only traversal only. The passed A/B validation established the POC isolation boundary; future platform or resolver changes require a rerun of the device matrix.
- The POC can enumerate only catalog entries whose `owner_uid` equals the frozen tenant. Multi-instance targets are the normal path. The formal first package also shows a current-user single-instance target with a shared-data warning; backup actions remain unavailable until the later ZIP engine stage.
- The browser receives source names, sizes, read-only status and SHA-256 results, never file bodies.
- Manual POC snapshots write only to `/lzcapp/document`, the current user's public Lazycat Drive document root; the source appvar is never modified.
- The package does not implement a scheduler, restore path, or V1 database-consistent backup engine.
- The internal service route is `web.mimi-app-backup.lzcapp:8080`; the formal app uses the `mimi-app-backup` subdomain and the diagnostic POC uses `mimi-app-backup-poc`.
- The two-user device matrix is retained in `docs/APPVAR_READ_POC_RUNBOOK.md` for regression validation.
