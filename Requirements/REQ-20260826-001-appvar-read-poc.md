# REQ-20260826-001 — Cross-app `appvar` read POC

**Status:** Completed — POC validation passed on 2026-08-27

## Confirmed objective

Create a minimal multi-instance LPK V2 application that declares only `appvar.other.read`, `document.write`, and optional `user.notify`; package it; then validate that a user can select an owned target application, inspect its appvar data/database classification, and create one manual read snapshot in the current user's public Lazycat Drive without exposing another user's data or writing to the target. The POC may continue for a single-instance target after showing a shared-data warning; V1 support remains multi-instance-only.

## Scope and exclusions

- In scope: package metadata, multi-instance runtime, an application-selection POC, recursive appvar/data and database probing, one manual read snapshot into `/lzcapp/document`, identity diagnostics, and the PDD two-user acceptance matrix.
- Out of scope: the V1 scheduler, persistent control database, SQLite Online Backup consistency, restore, target-app write access, cross-user administration, and a host-mount workaround.

## Impact and safety boundary

The POC touches platform permissions, multi-instance identity, and another application’s data. Source identity is server-side only: the browser never submits an absolute path, owner UID, or storage UID. The UI presents the resulting tenant, permission, source-projection, directory and hash states. The probe emits names, sizes, and hashes only; it never returns file bodies and never attempts a target write.

## Acceptance matrix

| Scenario | Expected result | Evidence status |
| --- | --- | --- |
| Package declares `appvar.other.read` and is multi-instance | Manifest/package inspection passes | Passed locally: LPK V2 manifest and package metadata inspected; `lzc-cli lpk lint` passed |
| User A lists only A-owned multi-instance targets | Platform query is owner-filtered | Passed |
| A reads an A-owned disposable target fixture | Probe reports a read-only source and SHA-256 of known file | Passed |
| User selects an owned application | API returns the tenant-owned catalog and recursive data metadata; a single-instance target is warning-only in this POC; with the LZCOS v1.6 compatibility projection the row reaches `BACKUPABLE`, otherwise it reports `RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE` | Passed |
| User runs one manual snapshot | Archive and manifest are written under `/lzcapp/document/LazycatAppBackup/poc`; response contains archive SHA-256 and no file body | Passed |
| A supplies B's deploy ID | Resolver rejects it (403/404) | Passed |
| A enumerates or reads B's appvar | Operation is denied | Passed |
| Source is writable | POC fails the gate; no backup development continues | Passed — source access remained read-only throughout validation |
| Package/image build | `lzc-cli project build` completes and output is inspected | Passed locally: `lazycat-app-backup-poc-0.1.0.lpk`, 15.61 MiB (16,364,032 bytes), SHA-256 `5a70f9e7f7007a22f21b162ac085bf4915033c410f22a622d96b778870f3dc84`; `lzc-cli lpk info` reports LPK V2 with no embedded images and `lzc-cli lpk lint` reports no warnings |

## Completion rule

The required two-user device rows have passed. The POC result authorizes V1 development on the verified data path; it does not loosen the tenant-isolation, no-target-write, or no-host-mount boundaries.
