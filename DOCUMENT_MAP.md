# Document map

This index is navigation only; the linked documents remain the sources of truth.

| Responsibility | Actual path | Notes |
| --- | --- | --- |
| Project rules | `AGENTS.md` | Read before work. |
| Product requirements (PRD) | `懒猫应用备份需求文档PRD.md` | V1 product scope, UX, acceptance; current product name is 咪咪应用备份. |
| Technical design (PDD) | `懒猫应用备份技术实现文档PDD.md` | V1 architecture, security boundaries, POC gates; package ID is `cloud.lazycat.app.mimi-app-backup`. |
| Vibe Coding workflow | `VIBE_CODING_WORKFLOW.md` | Required delivery loop, evidence rules, and `main`-only collaboration process. |
| Requirements ledger | `Requirements/LEDGER.md` | Links to active non-bug requirements. |
| Bug tracker | `docs/BUG_TRACKER.md` | Defect symptoms, impact, root cause, repair, verification and regression notes. |
| Completed POC requirement | `Requirements/REQ-20260826-001-appvar-read-poc.md` | Verified cross-app `appvar` read gate; retained as POC evidence. |
| Active V1 delivery requirement | `Requirements/REQ-20260827-002-v1-core-delivery.md` | V1 implementation scope and delivery gates. |
| Decision ledger | `Decisions/LEDGER.md` | Architecture and security decisions. |
| POC decisions | `Decisions/DEC-20260826-001-appvar-read-gate.md`, `Decisions/DEC-20260826-003-poc-selection-and-snapshot.md`, `Decisions/DEC-20260826-004-platform-application-catalog.md`, `Decisions/DEC-20260826-005-poc-single-instance-warning.md`, `Decisions/DEC-20260826-006-appvar-source-projection-blocked.md` | Records the verified no-bypass gate, select/probe/manual-snapshot loop, runtime SDK catalog boundary, shared-instance warning, and runtime source-projection boundary. |
| Formal service decisions | `Decisions/DEC-20260827-007-formal-auth-control-api.md`, `Decisions/DEC-20260827-008-manual-zip-snapshot-boundary.md`, `Decisions/DEC-20260827-009-scheduled-queue-library-boundary.md`, `Decisions/DEC-20260827-010-operations-i18n-events-boundary.md`, `Decisions/DEC-20260828-011-storage-directory-name.md`, `Decisions/DEC-20260831-014-lightos-isolated-assistant-data-boundary.md`, `Decisions/DEC-20260831-015-shared-installed-application-catalog.md`, `Decisions/DEC-20260901-016-user-notify-message-service.md` | OIDC/session, per-user control database, API/POC separation, ZIP snapshots, queue/storage boundaries, shared full installed-app catalog, tenant-scoped operations, product-owned backup-directory naming, LightOS-isolated assistant-data boundary, and MessageService-based result notifications. |
| Feature-progress ledger | `Progress/LEDGER.md` | Links to feature progress records. |
| Project total progress | `Progress/PROJECT_PROGRESS.md` | Current milestone, completed POC, V1 roadmap, and release gates. |
| Completed POC progress | `Progress/PROG-REQ-20260826-001-appvar-read-poc.md` | POC stage and evidence summary. |
| Active V1 delivery progress | `Progress/PROG-REQ-20260827-002-v1-core-delivery.md` | V1 work stages, current action, and verification plan. |
| Formal UI source | `designs/web.tsx` | User-owned visual and page-structure source; retained unchanged. |
| Formal split frontend | `apps/web/src/ui/` | Production composition root, live data control layer, shared components, eight pages and dialogs; Vite entry remains `apps/web/src/main.tsx`. |
| V1 prototype UI | `designs/index.html` | Application-first interactive high-fidelity prototype aligned to PRD; shared `Dropdown`, borderless notices, single-modal plan form validation, and brand asset in `designs/assets/lzc-icon.png`. |
| Selective-scope V2 prototype | `designs/backup-scope-plan/index.html` | Interactive four-step plan wizard: protection type, app selection, per-app scope, then schedule confirmation. |
| OIDC login design | `designs/OIDC 登录页.html` | High-fidelity login state aligned with the production explicit-click OIDC flow and the existing V1 visual language. |
| Frontend split requirement | `Requirements/REQ-20260827-004-frontend-prototype-split.md` | Frontend translation and componentization scope, boundaries, and acceptance. |
| Frontend split progress | `Progress/PROG-REQ-20260827-004-frontend-prototype-split.md` | Build/test evidence and remaining browser-runtime verification. |
| Runtime stability and UI refinement | `Requirements/REQ-20260828-005-runtime-stability-and-ui-refinement.md`, `Progress/PROG-REQ-20260828-005-runtime-stability-and-ui-refinement.md` | SSE refresh control, backup interaction, navigation, time-zone storage and settings-page refinement. |
| Backup-library detail and table polish | `Requirements/REQ-20260828-006-backup-library-detail-and-table-polish.md`, `Progress/PROG-REQ-20260828-006-backup-library-detail-and-table-polish.md` | Unified centered detail modal with task/snapshot switching, deleted cloud-directory state, catch-up switch and readable table headers. |
| Selective backup scope | `Requirements/REQ-20260829-007-selective-backup-scope.md`, `Progress/PROG-REQ-20260829-007-selective-backup-scope.md`, `Decisions/DEC-20260829-012-selective-scope-and-plan-pause.md` | Per-target complete/core/custom range, pre-run validation, plan pause and V2 scope-plan prototype. |
| Formal UI migration and pagination | `Requirements/REQ-20260830-008-web-ui-api-pagination.md`, `Progress/PROG-REQ-20260830-008-web-ui-api-pagination.md`, `Decisions/DEC-20260830-013-cursor-pagination-and-ui-source.md` | `web.tsx` visual migration, API data control, `deployId` associations and cursor paging. |
| Scope tree and application metadata display | `Requirements/REQ-20260831-009-scope-tree-and-app-metadata.md`, `Progress/PROG-REQ-20260831-009-scope-tree-and-app-metadata.md` | Selective-scope file tree, recursive directory selection, plan detail scope labels, and deployId-based application icon/name enrichment. |
| Plan action confirmation and schedule display polish | `Requirements/REQ-20260831-010-plan-actions-and-schedule-polish.md`, `Progress/PROG-REQ-20260831-010-plan-actions-and-schedule-polish.md` | Confirmed plan execution/pause actions, global result messages, readable schedule labels, table tooltips, and collapsed plan-detail trees. |
| Page identifier cleanup and application re-probe feedback | `Requirements/REQ-20260831-011-page-identifier-and-reprobe-feedback.md`, `Progress/PROG-REQ-20260831-011-page-identifier-and-reprobe-feedback.md`, `Decisions/DEC-20260831-014-lightos-isolated-assistant-data-boundary.md`, `docs/BUG_TRACKER.md` | Removes the repeated page identifier, makes application re-probe submission and refresh state visible, and classifies inaccessible appvar data sources as restricted. |
| Active task-result notifications | `Requirements/REQ-20260901-012-active-notification.md`, `Progress/PROG-REQ-20260901-012-active-notification.md`, `Decisions/DEC-20260901-016-user-notify-message-service.md`, `docs/BUG_TRACKER.md` | Connects task terminal results to Lazycat `MessageService.NewMessage` and, with explicit browser permission, the Web Notification API while preserving backup failure isolation. |
| Overview chart and table polish | `Requirements/REQ-20260901-013-overview-chart-and-table-polish.md`, `Progress/PROG-REQ-20260901-013-overview-chart-and-table-polish.md` | Uses real overview counts in an interactive protection chart, removes standalone deployment columns from applications and backup library, and keeps database tags content-sized. |
| Formal V1 server | `apps/server/cmd/server/` | Go entry point for OIDC, control database, application synchronization, API and static Vite hosting. |
| Formal server modules | `apps/server/internal/` | Auth, tenant identity, persistence, SDK catalog, fixed source resolver, probe, synchronization, backup, queue, storage, operations and HTTP API modules. |
| OIDC login renderer | `apps/server/internal/httpapi/auth_page.go` | Production login page and explicit-click OIDC entry; it follows the V1 visual language and returns verified callbacks to the home page. |
| Manual snapshot engine | `apps/server/internal/backup/`, `apps/server/internal/storage/` | Bounded manual backup worker, SQLite Online Backup, ZIP/manifest generation, verification and document-root confinement. |
| Scheduled queue and library | `apps/server/internal/plans/`, `apps/server/internal/scheduler/`, `apps/server/internal/queue/`, `apps/server/internal/snapshots/` | Current-tenant plan CRUD, Cron/catch-up, persistent task leases/retries and backup-library maintenance. |
| OpenAPI contract | `api/openapi/openapi.yaml` | OpenAPI 3.1 source for all formal V1 APIs; Vite generates `apps/web/src/api/schema.d.ts` from it. |
| Frontend application shell | `apps/web/src/ui/App.tsx` | Composition root for the eight formal routes, unified detail modal, live API data and SSE-triggered refresh. |
| Frontend UI modules | `apps/web/src/ui/components.tsx`, `apps/web/src/ui/pages.tsx`, `apps/web/src/ui/dialogs.tsx`, `apps/web/src/ui/live.ts` | Shared controls, visual pages, real-data dialogs, navigation totals and the single data control layer. |
| LPK configuration | `package.yml`, `lzc-manifest.yml`, `lzc-build.yml` | Formal V1 LPK V2 build inputs. |
| POC runbook | `docs/APPVAR_READ_POC_RUNBOOK.md` | Completed two-user validation record; reuse after platform or permission changes. |
