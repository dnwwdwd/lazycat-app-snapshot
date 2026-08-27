# Progress — cross-app appvar read POC

**Requirement:** REQ-20260826-001
**Status:** Completed — POC validation passed; V1 development may begin
**Last updated:** 2026-08-27

## Basis from PRD/PDD

PRD defines `appvar.other.read` as a required permission and explicitly excludes write-back and host-mount bypasses. PDD fixes the backup application to one instance per user, requires `only_owner=true` without `other_uid`, and carries single-instance targets into V1 with a shared-data risk warning and user confirmation.

## Stages

| Stage | Deliverable / DoD | Status | Evidence / next action |
| --- | --- | --- | --- |
| 0. Governance | Map documents; create linked requirement, decision, and progress records | Complete | `DOCUMENT_MAP.md`, REQ/DEC/PROG records created. |
| 1. POC package and core probe | LPK V2 metadata, multi-instance manifest, application selection, recursive data/database probe, manual read snapshot, read-only diagnostic server, package build files | Complete for local POC; LZCOS runtime provider implemented | Go service exposes tenant-filtered applications, recursive appvar metadata/database classification, SHA-256 probes, and a manual tar.gz + manifest snapshot under the current user's public Lazycat Drive root `/lzcapp/document`. The frontend selects an application, probes it, hashes a relative file, and starts the manual snapshot. The runtime provider consumes the fixed `/lzcapp/run/data/app/var` projection created by `PERM_OTHER_APP_DATA_ADMIN`, maps `appid`, rejects traversal and owner mismatch, and reports `service-enforced` read-only semantics. The documented-mount provider remains available for a future formal contract. Single-instance targets continue with a warning in the POC; V1 remains multi-instance-only. The runtime adapter carries the frozen tenant UID through SDK real-UID metadata, calls `QueryApplication` with `only_owner=true` and no `other_uid`; two-user evidence remains a device gate. |
| 2. LPK build | Registry-backed LPK V2 package and `.lpk` created by `lzc-cli project build` | Complete for local packaging | `lzc-cli project build -o lazycat-app-backup-poc-0.1.0.lpk` passed. Current output is 15.61 MiB (16,364,032 bytes) with SHA-256 `5a70f9e7f7007a22f21b162ac085bf4915033c410f22a622d96b778870f3dc84`; `lzc-cli lpk info` reports LPK V2 with no embedded images and `lzc-cli lpk lint` reports no warnings. |
| 3. Two-user device POC | A/B ownership, denied cross-user read, read-only projection, appvar mapping | Complete | Passed; the runbook is retained for regression validation after platform, permission, or source-projection changes. |
| 4. Gate decision | Mark POC pass/fail and allow or stop V1 engine work | Complete | Passed; the verified POC data path is now the V1 implementation baseline. |
| 5. V1 development | Catalog, capability scan, storage, queue, backup, UI, and load/recovery tests | Started | Tracked by `REQ-20260827-002` and `Progress/PROG-REQ-20260827-002-v1-core-delivery.md`. |

## Completed evidence and retained boundaries

- The repository is a Git checkout with the original prototype split preserved; the package work replaces the old embedded-image path with a registry-backed LPK V2 build.
- The original dashboard files remain in the repository as reference material, but the packaged frontend entry renders only the live application/data probe. It uses the Go application catalog and snapshot APIs instead of `INITIAL_*` data.
- Frontend verification on 2026-08-27: `npm test --prefix apps/web -- --run` (5 tests) and `npm run build --prefix apps/web` passed (1,808 transformed modules); the packaged entry now opens only the application/data probe, with no visible dashboard mock data. The POC selects an application, shows recursive metadata/database findings, displays runtime read-only mode, computes a file SHA-256, and starts a manual snapshot through the Go API. The old dashboard files remain retained but are not loaded by the package entry.
- Backend verification on 2026-08-27: `go test ./...` and `go vet ./...` passed. Tests cover owner filtering, SQLite/service-database classification, path/header isolation, documented-mount mapping and read-only enforcement, runtime appid mapping and fixed-root rejection, ambiguous deploy mapping, SDK unsupported errors, source-capability redaction, manual archive creation, manifest output, rejection of unknown snapshot fields, and the PDD §8 SourceResolver boundary. Snapshot responses contain archive metadata and SHA-256 only; source file bodies stay inside the archive.
- Frontend verification on 2026-08-26: the POC page loads the tenant application catalog, displays provider capability, selects an owned application, renders recursive entries and database findings, computes a file hash, and invokes `POST /api/poc/snapshots` with only the selected deploy ID. Vitest and the Vite production build pass.
- Packaged-binary smoke on 2026-08-26: `lzc-dist/bin/backup-poc` returned health 200, rejected a missing identity header with 403, reported a single-instance fixture as `BACKUPABLE` plus `sourceWarning`, and created a manual snapshot containing archive metadata only in the response.
- Official package documentation confirms that `appvar.other.read` permits reading other application instances' `appvar`; the current public `lzc-sdk` and `lzc-sdk-rs` protos still contain no appvar source-resolution method. Device evidence shows that LZCOS v1.6 creates `/lzcapp/run/data/app/var` for applications declaring `PERM_OTHER_APP_DATA_ADMIN`; the runtime now consumes that fixed in-container projection and never opens `/lzcsys/data/appvar`. See `Decisions/DEC-20260826-006-appvar-source-projection-blocked.md`.
- Device smoke on `root@192.168.18.133:2222` confirmed that the installed package can query the current-user catalog (70 owner-matching applications). The final POC validation passed after the runtime projection compatibility path and two-user matrix were verified.
- 设备 v1.6.0 上的历史 backup 容器没有声明 `PERM_OTHER_APP_DATA_ADMIN`，因此只有本应用的 `/lzcsys/data/appvar/cloud.lazycat.app.backup -> /lzcapp/var`；启用兼容声明后，运行时预期提供全局 appvar 投影。设备内部 `ResolveCallerLzcAppPath` 仍只能在宿主侧解析 `host_path`，业务容器不可见，不能作为 source resolver 接入。
- The runtime `source_resolver.go` layer makes scan/snapshot code consume only a deploy-bound `resolvedSource` and exposes projection, adapter version, read-only mode, device/inode, and verification time in reports. The POC result does not authorize a host-path fallback, `other_uid`, `appvar.other.write`, or a cross-user backup flow.

## Next action

Start V1 implementation from the verified data path. Re-run `docs/APPVAR_READ_POC_RUNBOOK.md` before relying on the POC result after a Lazycat platform upgrade, a permission declaration change, a source-projection change, or a resolver change.
