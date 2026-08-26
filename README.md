# 懒猫应用备份

This repository currently contains the V1 PRD/PDD, a reference UI prototype, and a gated POC for selecting an owned application, probing its `appvar`, and creating one manual read snapshot under the current user's private documents.

Read [DOCUMENT_MAP.md](DOCUMENT_MAP.md) first. The backup engine is intentionally not started until the POC package builds and passes the two-user device matrix in [docs/APPVAR_READ_POC_RUNBOOK.md](docs/APPVAR_READ_POC_RUNBOOK.md).

## Build the POC

```text
sh lzc/build-package.sh
lzc-cli project build -o lazycat-app-backup-poc-0.1.0.lpk
```

`sh lzc/build-package.sh` prepares a static Vite frontend and a Linux amd64 Go binary under `lzc-dist/`. The LPK runtime uses the validated Lazycat Debian base image and starts `/lzcapp/pkg/content/bin/backup-poc` through `lzc/run.sh`.

The configured Microserver must trust this workstation's `lzc-cli` public key before the final `.lpk` build can complete. The POC uses a server-side application catalog and source resolver contract. In a Lazycat container the catalog is queried through the official Lzc SDK with `only_owner=true`; no `other_uid` is sent. A fixture catalog can follow [`lzc/poc-applications.example.json`](lzc/poc-applications.example.json) for local tests. The SDK catalog supplies identity and instance metadata; the appvar source projection still has to be provided by the platform resolver and is never guessed from a host path.

## POC usage

The package opens the “应用与数据库全量探测” flow directly. The visible page is only this POC flow; the retained dashboard prototype is not loaded. Select an application owned by the current tenant to recursively inspect its appvar entry names, sizes, SQLite/service-database signatures, skipped special files, and read-only status. A single-instance target shows a shared-data warning and remains usable in this POC. The page never displays file bodies. “执行手动快照” creates a `tar.gz` read snapshot plus `manifest.json` under the current user's private document root and returns the archive SHA-256.

The Go service accepts these server-side fixture variables for local tests:

- `BACKUP_POC_APPLICATIONS_FILE`: JSON catalog; each item has `appid`, `name`, `version`, `deploy_id`, `owner_uid`, `multi_instance`, and a server-only `source_root`.
- `BACKUP_DOCUMENT_ROOT`: optional test output root. Runtime defaults to `/lzcapp/documents/<tenant UID>`.
- The existing single-fixture variables (`BACKUP_POC_SOURCE_ROOT`, `BACKUP_POC_SOURCE_OWNER_UID`, `BACKUP_POC_SOURCE_DEPLOY_ID`, `BACKUP_POC_SOURCE_MULTI_INSTANCE`) remain supported.

When the package runs on Lazycat, the frozen tenant UID is attached as the SDK real-UID metadata (`X-Hc-User-Id`) before calling `QueryApplication` over the runtime API socket or `LZCAPP_API_GATEWAY_ADDRESS`. The request uses an empty `deploy_ids` list, `only_owner=true`, and `ignore_pending_pkg=true`; `other_uid` remains unset. The service filters the response again by the frozen tenant UID. If the catalog is available but no approved appvar source projection is present, the selected application is shown with `SOURCE_NOT_READY`; this is a platform integration blocker, not a mock fallback.

The snapshot is intentionally a raw-read POC. It does not provide SQLite Online Backup consistency, scheduling, restore, or cross-user administration. Unsupported service-database signatures block snapshot creation.

Runtime boundaries:

- `appvar.other.read` is declared for the platform POC; the source projection is read-only.
- The POC can enumerate only catalog entries whose `owner_uid` equals the frozen tenant. Multi-instance targets are the normal path; a single-instance target is allowed only for this POC read/snapshot check and is marked with a shared-data warning. V1 continues to reject it.
- The browser receives source names, sizes, read-only status and SHA-256 results, never file bodies.
- Manual POC snapshots write only to the current user's private document root; the source appvar is never modified.
- The package does not implement a scheduler, restore path, or V1 database-consistent backup engine.
- The internal service route is `web.cloud.lazycat.app.backup.lzcapp:8080`; `app-backup-poc` is the public subdomain.
- Install, deploy and the two-user device matrix remain separate validation steps in `docs/APPVAR_READ_POC_RUNBOOK.md`.
