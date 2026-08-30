# Decision ledger

| ID | Status | Decision | Related requirement |
| --- | --- | --- | --- |
| DEC-20260826-001 | Verified by passed POC | `appvar.other.read` is a hard release gate with no privileged fallback | REQ-20260826-001 |
| DEC-20260826-003 | Verified by passed POC | POC closes the select → probe → manual read-snapshot loop without target writes | REQ-20260826-001 |
| DEC-20260826-002 | Confirmed for POC packaging | LPK V2 uses a registry Debian runtime with package-contained static Go/frontend artifacts; no embedded image or host path fallback | REQ-20260826-001 |
| DEC-20260826-004 | Verified by passed POC | Use official runtime SDK `QueryApplication` for current-user catalog; do not guess appvar source paths | REQ-20260826-001 |
| DEC-20260826-005 | Verified by passed POC; carried into V1 | Single-instance targets require a shared-data warning and user confirmation | REQ-20260826-001 |
| DEC-20260826-006 | Verified by passed POC | LZCOS v1.6 `PERM_OTHER_APP_DATA_ADMIN` creates the fixed `/lzcapp/run/data/app/var` projection; the POC maps catalog-validated `appid` entries and enforces application-layer read-only access without host mounts or `appvar.other.write` | REQ-20260826-001 |
| DEC-20260827-007 | Implemented locally; platform evidence pending | Formal V1 service uses OIDC session, per-user SQLite control database and same-origin application API | REQ-20260827-002 |
| DEC-20260827-008 | Implemented locally; platform evidence pending | Manual ZIP snapshots use a bounded per-instance worker, SQLite Online Backup and current-user document-root atomic commit | REQ-20260827-002 |
| DEC-20260827-009 | Implemented locally; platform evidence pending | Plans, the persistent queue and backup-library maintenance remain current-tenant only and use safe relative storage paths | REQ-20260827-002 |
| DEC-20260827-010 | Implementing locally; platform evidence pending | Operational UI state, alerts, settings, audit and SSE stay current-tenant only; REST remains authoritative after event gaps | REQ-20260827-002 |
| DEC-20260828-011 | Implemented locally; platform evidence pending | Backup document root uses product-owned `MimiAppBakcup` name without legacy-directory migration | REQ-20260828-005 |
| DEC-20260829-012 | Implemented locally; platform evidence pending | Per-target selective scope pauses the whole plan when a declared relative path fails validation | REQ-20260829-007 |
