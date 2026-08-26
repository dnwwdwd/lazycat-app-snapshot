# Document map

This index is navigation only; the linked documents remain the sources of truth.

| Responsibility | Actual path | Notes |
| --- | --- | --- |
| Project rules | `AGENTS.md` | Read before work. |
| Product requirements (PRD) | `懒猫应用备份需求文档PRD.md` | V1 product scope, UX, acceptance. |
| Technical design (PDD) | `懒猫应用备份技术实现文档PDD.md` | V1 architecture, security boundaries, POC gates. |
| Requirements ledger | `Requirements/LEDGER.md` | Links to active non-bug requirements. |
| POC requirement | `Requirements/REQ-20260826-001-appvar-read-poc.md` | First gated implementation. |
| Decision ledger | `Decisions/LEDGER.md` | Architecture and security decisions. |
| POC decision | `Decisions/DEC-20260826-001-appvar-read-gate.md` | Records the no-bypass release gate. |
| Feature-progress ledger | `Progress/LEDGER.md` | Links to feature progress records. |
| Current progress | `Progress/PROG-REQ-20260826-001-appvar-read-poc.md` | Stage plan, evidence, and current blocker. |
| Prototype UI source | `lazycat_app_backup_backup.tsx` | Source prototype retained unchanged. |
| Split frontend | `apps/web/` | Mechanical split of the source prototype into Vite/React entry, data, and feature views. |
| POC diagnostics frontend | `apps/web/src/poc/` | Default read-only POC page and same-origin API client tests. |
| Frontend controller | `apps/web/src/hooks/useAppController.tsx` | Existing global state, routing, status badge, and backup-simulation behavior. |
| Frontend application shell | `apps/web/src/AppShell.tsx` | Composition root for the split header, navigation, workspace router, and global dialogs. |
| Shell layout components | `apps/web/src/components/layout/` | Mechanical extractions: `AppHeader`, `AppSidebar`, `MobileNavigation`, `WorkspaceRouter`, and `GlobalModals`. |
| POC server | `apps/server/cmd/poc/` | Read-only runtime diagnostic harness and its unit tests. |
| LPK configuration | `package.yml`, `lzc-manifest.yml`, `lzc-build.yml` | LPK V2 build inputs. |
| POC runbook | `docs/APPVAR_READ_POC_RUNBOOK.md` | Mandatory two-user device validation. |
