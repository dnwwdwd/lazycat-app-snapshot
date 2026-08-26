# REQ-20260826-001 — Cross-app `appvar` read POC

## Confirmed objective

Create a minimal multi-instance LPK V2 application that declares only `appvar.other.read`, `document.private`, and optional `user.notify`; package it; then validate on a real Lazycat device that it can read a current user's eligible target-app `appvar` without exposing another user's data or writing to the target.

## Scope and exclusions

- In scope: package metadata, multi-instance runtime, a dedicated interactive POC diagnostics page, identity diagnostics, a read-only source probe, and the PDD two-user acceptance matrix.
- Out of scope: a backup engine, scheduler, control database, visual redesign or new frontend behavior, restore, write access, cross-user administration, and a host-mount workaround.

## Impact and safety boundary

The POC touches platform permissions, multi-instance identity, and another application’s data. Source identity is server-side only: the browser never submits an absolute path, owner UID, or storage UID. The UI presents the resulting tenant, permission, source-projection, directory and hash states. The probe emits names, sizes, and hashes only; it never returns file bodies and never attempts a target write.

The fixture adapter is intentionally not a platform SourceResolver: it accepts only a server-provided disposable fixture mapping and rejects all other deploy IDs. Its local results are implementation evidence only; real-device ownership and isolation rows remain mandatory.

## Acceptance matrix

| Scenario | Expected result | Evidence status |
| --- | --- | --- |
| Package declares `appvar.other.read` and is multi-instance | Manifest/package inspection passes | Pending build |
| User A lists only A-owned multi-instance targets | Platform query is owner-filtered | Pending real device |
| A reads an A-owned disposable target fixture | Probe reports a read-only source and SHA-256 of known file | Pending real device |
| A supplies B's deploy ID | Resolver rejects it (403/404) | Pending real device |
| A enumerates or reads B's appvar | Operation is denied | Pending real device |
| Source is writable | POC fails the gate; no backup development continues | Pending real device |
| Package/image build | `lzc-cli project build` completes and output is inspected | Blocked: the configured dev box has not trusted this CLI public key |

## Completion rule

This requirement is complete only when every real-device row above has evidence recorded. A local build, static inspection, or simulated directory does not satisfy the user-isolation rows.
