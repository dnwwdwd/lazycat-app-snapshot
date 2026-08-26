# Progress — cross-app appvar read POC

**Requirement:** REQ-20260826-001  
**Status:** In progress — implementation changes prepared locally; Docker/package and real-device verification pending
**Last updated:** 2026-08-26

## Basis from PRD/PDD

PRD defines `appvar.other.read` as a required permission and explicitly excludes write-back and host-mount bypasses. PDD narrows V1 to one backup instance per user, requires `only_owner=true` without `other_uid`, excludes shared single-instance targets, and makes two-user isolation a release gate.

## Stages

| Stage | Deliverable / DoD | Status | Evidence / next action |
| --- | --- | --- | --- |
| 0. Governance | Map documents; create linked requirement, decision, and progress records | Complete | `DOCUMENT_MAP.md`, REQ/DEC/PROG records created. |
| 1. POC package and core probe | LPK V2 metadata, multi-instance manifest, dedicated read-only diagnostics UI, source probe, Docker build files | In progress — Docker verification pending | Default entry is now a same-origin POC diagnostics page; it checks ingress identity, reports declared permissions and fixture state, lists only server-configured fixture metadata, and hashes up to 64 KiB without returning bodies. Docker now runs Go tests plus Vitest/Vite before creating the runtime image. |
| 2. LPK build | Embedded image and `.lpk` created by `lzc-cli project build` | Blocked by dev-box authorization | CLI accepted the project configuration but stopped because the configured Microserver has not trusted this CLI public key. |
| 3. Two-user device POC | A/B ownership, denied cross-user read, read-only projection, appvar mapping | Not started | Execute `docs/APPVAR_READ_POC_RUNBOOK.md`; attach command output and screenshots/logs. |
| 4. Gate decision | Mark POC pass/fail and allow or stop V1 engine work | Not started | Requires all stage 3 rows to pass. |
| 5. V1 development | Catalog, capability scan, storage, queue, backup, UI, and load/recovery tests | Locked | Begins only after stage 4 passes. |

## Known facts and blockers

- The repository is a local Git checkout. The pre-existing prototype source remains retained, but the packaged default entry is now a dedicated POC diagnostics page rather than simulated V1 backup behavior.
- The Go POC rejects missing ingress identity and tenant mismatches, accepts only server-configured fixture deploy IDs, and never exposes source roots or file bodies. It reports SHA-256 scope as complete or prefix and has no target-write route.
- Frontend verification on 2026-08-26: `npm test` passed (2 API-client tests), and `npm run build` passed (1,806 transformed modules). The build bundle contains the POC entry rather than the mock backup controller.
- Backend unit tests and the full Docker image build are pending because this workstation has neither a Go executable nor Docker. The Dockerfile executes both during a Docker-enabled build; they have not been claimed as passed locally.
- Official package documentation confirms that `appvar.other.read` permits reading other application instances' `appvar`; it does not provide a stable public source-path API. Therefore the PDD's platform `SourceResolver` mapping must be established on-device and cannot be inferred locally.
- No target test applications or device user sessions are available in this workspace. The LPK CLI is configured to use Microserver `burgercat`, but its developer-tools trust list has not yet accepted this workstation's CLI public key. This is an environmental constraint, not a passed capability check.

## Next action

Use a Docker-enabled development environment to build the image (which runs Go tests, Vitest, and the Vite build). Then authorize this workstation's `lzc-cli` public key in the configured Microserver developer tools, run `lzc-cli project build`, install the POC, establish the platform-approved source mapping, and run the two-user matrix. Do not start the backup engine until the matrix passes.
