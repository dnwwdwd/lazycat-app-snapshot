# Progress — cross-app appvar read POC

**Requirement:** REQ-20260826-001  
**Status:** In progress — implementation scaffolded; build and real-device verification pending  
**Last updated:** 2026-08-26

## Basis from PRD/PDD

PRD defines `appvar.other.read` as a required permission and explicitly excludes write-back and host-mount bypasses. PDD narrows V1 to one backup instance per user, requires `only_owner=true` without `other_uid`, excludes shared single-instance targets, and makes two-user isolation a release gate.

## Stages

| Stage | Deliverable / DoD | Status | Evidence / next action |
| --- | --- | --- | --- |
| 0. Governance | Map documents; create linked requirement, decision, and progress records | Complete | `DOCUMENT_MAP.md`, REQ/DEC/PROG records created. |
| 1. POC package and core probe | LPK V2 metadata, multi-instance manifest, prototype frontend split, read-only diagnostic server, Docker build files | In progress | All 9 prototype views, the controller, and all shell regions are split into dedicated modules. `AppShell` is now composition-only. Production build and browser navigation/action checks pass. Connecting mock data to the POC API remains intentionally deferred until platform access passes. |
| 2. LPK build | Embedded image and `.lpk` created by `lzc-cli project build` | Blocked by dev-box authorization | CLI accepted the project configuration but stopped because the configured Microserver has not trusted this CLI public key. |
| 3. Two-user device POC | A/B ownership, denied cross-user read, read-only projection, appvar mapping | Not started | Execute `docs/APPVAR_READ_POC_RUNBOOK.md`; attach command output and screenshots/logs. |
| 4. Gate decision | Mark POC pass/fail and allow or stop V1 engine work | Not started | Requires all stage 3 rows to pass. |
| 5. V1 development | Catalog, capability scan, storage, queue, backup, UI, and load/recovery tests | Locked | Begins only after stage 4 passes. |

## Known facts and blockers

- The repository is currently a document/UI snapshot, not a Git checkout; no existing implementation or build pipeline was overwritten.
- The UI prototype is retained unchanged. Its existing components and mock data have been mechanically split into `apps/web/`; no generated concept or new UI behavior/visual design was introduced. `AppShell` composes `AppHeader`, `AppSidebar`, `MobileNavigation`, `WorkspaceRouter`, and `GlobalModals`.
- Frontend verification on 2026-08-26: `npm run build` passed (1,821 transformed modules); all eight sidebar routes rendered their expected view; the setup view rendered; and the prototype's manual-backup action updated the running-job indicator.
- Official package documentation confirms that `appvar.other.read` permits reading other application instances' `appvar`; it does not provide a stable public source-path API. Therefore the PDD's platform `SourceResolver` mapping must be established on-device and cannot be inferred locally.
- No target test applications or device user sessions are available in this workspace. The LPK CLI is configured to use Microserver `burgercat`, but its developer-tools trust list has not yet accepted this workstation's CLI public key. This is an environmental constraint, not a passed capability check.

## Next action

Authorize this workstation's `lzc-cli` public key in the configured Microserver developer tools, rerun `lzc-cli project build`, then install the POC and run the two-user matrix. Do not start the backup engine until the matrix passes.
