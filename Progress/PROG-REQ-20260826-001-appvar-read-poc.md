# Progress — cross-app appvar read POC

**Requirement:** REQ-20260826-001  
**Status:** In progress — local POC package verified; real appvar source projection and two-user verification pending
**Last updated:** 2026-08-26

## Basis from PRD/PDD

PRD defines `appvar.other.read` as a required permission and explicitly excludes write-back and host-mount bypasses. PDD narrows V1 to one backup instance per user, requires `only_owner=true` without `other_uid`, excludes shared single-instance targets, and makes two-user isolation a release gate.

## Stages

| Stage | Deliverable / DoD | Status | Evidence / next action |
| --- | --- | --- | --- |
| 0. Governance | Map documents; create linked requirement, decision, and progress records | Complete | `DOCUMENT_MAP.md`, REQ/DEC/PROG records created. |
| 1. POC package and core probe | LPK V2 metadata, multi-instance manifest, application selection, recursive data/database probe, manual read snapshot, read-only diagnostic server, package build files | Complete for local POC; platform catalog adapter implemented | Go service exposes tenant-filtered applications, recursive appvar metadata/database classification, and a manual tar.gz + manifest snapshot under the configured private document root. `go test ./...` and `npm run build --prefix apps/web` pass. Single-instance targets now continue with a warning in the POC; V1 remains multi-instance-only. The runtime adapter carries the frozen tenant UID through the SDK real-UID metadata, calls `QueryApplication` with `only_owner=true` and no `other_uid`; the source-projection mapping remains a device blocker. |
| 2. LPK build | Registry-backed LPK V2 package and `.lpk` created by `lzc-cli project build` | Complete for local packaging | `lzc-cli project build -o lazycat-app-backup-poc-0.1.0.lpk` passed. Output is 13.26 MiB with SHA-256 `c4ad7912798c04b993061b2f5a1d3437d662010fdcc39cec14442fdf9193606a`; `lzc-cli lpk info` reports LPK V2 with no embedded images and `lzc-cli lpk lint` reports no warnings. |
| 3. Two-user device POC | A/B ownership, denied cross-user read, read-only projection, appvar mapping | Not started | Execute `docs/APPVAR_READ_POC_RUNBOOK.md`; attach command output and screenshots/logs. |
| 4. Gate decision | Mark POC pass/fail and allow or stop V1 engine work | Not started | Requires all stage 3 rows to pass. |
| 5. V1 development | Catalog, capability scan, storage, queue, backup, UI, and load/recovery tests | Locked | Begins only after stage 4 passes. |

## Known facts and blockers

- The repository is a Git checkout with the original prototype split preserved; the package work replaces the old embedded-image path with a registry-backed LPK V2 build.
- The original dashboard files remain in the repository as reference material, but the packaged frontend entry renders only the live application/data probe. It uses the Go application catalog and snapshot APIs instead of `INITIAL_*` data.
- Frontend verification on 2026-08-26: `npm run build --prefix apps/web` passed (1,807 transformed modules); the packaged entry now opens only the application/data probe, with no visible dashboard mock data. The POC selects an application, shows recursive metadata/database findings, computes a file SHA-256, and starts a manual snapshot through the Go API. The old dashboard files remain retained but are not loaded by the package entry.
- Backend verification on 2026-08-26: Go tests cover owner filtering, SQLite/service-database classification, path/header isolation, platform UID fallback without deploy ID, manual archive creation, manifest output, rejection of unknown snapshot fields, and the PDD §8 SourceResolver boundary. Local smoke confirms `/api/health`, catalog, SHA-256 probe, and manual snapshot. Snapshot responses contain archive metadata and SHA-256 only; source file bodies stay inside the archive.
- Packaged-binary smoke on 2026-08-26: `lzc-dist/bin/backup-poc` returned health 200, rejected a missing identity header with 403, reported a single-instance fixture as `BACKUPABLE` plus `sourceWarning`, and created a manual snapshot containing archive metadata only in the response.
- Official package documentation confirms that `appvar.other.read` permits reading other application instances' `appvar`; it does not provide a stable public source-path API. The current public `lzc-sdk` and `lzc-sdk-rs` protos likewise contain no appvar source-resolution method. The runtime now uses the official Lzc SDK for the current-user application catalog. The PDD's platform `SourceResolver` mapping must still be established on-device and cannot be inferred locally; see `Decisions/DEC-20260826-006-appvar-source-projection-blocked.md`.
- Device smoke on `root@192.168.18.133:2222` confirmed that the installed package can query the current-user catalog (70 owner-matching applications). The installed binary predates the single-instance-warning change, so its `SHARED_INSTANCE_UNSUPPORTED` responses are not evidence against the current workspace code. The device catalog rows still have no approved source projection and therefore report `SOURCE_NOT_READY` in the new code path.
- No target test applications or device user sessions are available in this workspace. Local fixture-catalog packaging and snapshot tests pass without installing the package; the runtime `QueryApplication` adapter, private-document mount, two-user isolation matrix, and runtime source projection remain unvalidated. The new `source_resolver.go` layer now makes scan/snapshot code consume only a deploy-bound `resolvedSource` and exposes projection, adapter version, read-only, device/inode, and verification time in reports. The platform adapter remains blocked until Lazycat supplies a documented, versioned deploy-scoped directory/handle/stream contract.

## Next action

Obtain the formal Lazycat source-projection/API contract, implement it as the PDD §8 `SourceResolver`, then install the generated POC on a non-production box only after explicit approval and execute `docs/APPVAR_READ_POC_RUNBOOK.md`. Do not call the real appvar POC passed, and do not start the backup engine, until the source projection and every two-user isolation row have evidence.
