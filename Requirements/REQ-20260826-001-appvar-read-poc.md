# REQ-20260826-001 — Cross-app `appvar` read POC

## Confirmed objective

Create a minimal multi-instance LPK V2 application that declares only `appvar.other.read`, `document.private`, and optional `user.notify`; package it; then validate that a user can select an owned target application, inspect its appvar data/database classification, and create one manual read snapshot without exposing another user's data or writing to the target. The POC may continue for a single-instance target after showing a shared-data warning; V1 support remains multi-instance-only.

## Scope and exclusions

- In scope: package metadata, multi-instance runtime, an application-selection POC, recursive appvar/data and database probing, one manual read snapshot into the current user's private documents, identity diagnostics, and the PDD two-user acceptance matrix.
- Out of scope: the V1 scheduler, persistent control database, SQLite Online Backup consistency, restore, target-app write access, cross-user administration, and a host-mount workaround.

## Impact and safety boundary

The POC touches platform permissions, multi-instance identity, and another application’s data. Source identity is server-side only: the browser never submits an absolute path, owner UID, or storage UID. The UI presents the resulting tenant, permission, source-projection, directory and hash states. The probe emits names, sizes, and hashes only; it never returns file bodies and never attempts a target write.

## Acceptance matrix

| Scenario | Expected result | Evidence status |
| --- | --- | --- |
| Package declares `appvar.other.read` and is multi-instance | Manifest/package inspection passes | Passed locally: LPK V2 manifest and package metadata inspected; `lzc-cli lpk lint` passed |
| User A lists only A-owned multi-instance targets | Platform query is owner-filtered | Pending real device |
| A reads an A-owned disposable target fixture | Probe reports a read-only source and SHA-256 of known file | Pending real device |
| User selects an owned application | API returns the tenant-owned catalog and recursive data metadata; a single-instance target is warning-only in this POC | SDK `QueryApplication` adapter implemented with owner filtering; real-device catalog and source-projection evidence pending |
| User runs one manual snapshot | Archive and manifest are written under the current user's private documents; response contains archive SHA-256 and no file body | Passed locally with fixture catalog; device storage pending |
| A supplies B's deploy ID | Resolver rejects it (403/404) | Pending real device |
| A enumerates or reads B's appvar | Operation is denied | Pending real device |
| Source is writable | POC fails the gate; no backup development continues | Pending real device |
| Package/image build | `lzc-cli project build` completes and output is inspected | Passed locally: `lazycat-app-backup-poc-0.1.0.lpk`, 13.26 MiB, SHA-256 `c4ad7912798c04b993061b2f5a1d3437d662010fdcc39cec14442fdf9193606a`; `lzc-cli lpk info` reports LPK V2 with no embedded images and `lzc-cli lpk lint` reports no warnings |

## Completion rule

This requirement is complete only when every real-device row above has evidence recorded. A local build, static inspection, or simulated directory does not satisfy the user-isolation rows.
