# Decision ledger

| ID | Status | Decision | Related requirement |
| --- | --- | --- | --- |
| DEC-20260826-001 | Confirmed by existing PDD; validation pending | `appvar.other.read` is a hard release gate with no privileged fallback | REQ-20260826-001 |
| DEC-20260826-003 | Implemented for local fixture POC; device validation pending | POC closes the select → probe → manual read-snapshot loop without target writes | REQ-20260826-001 |
| DEC-20260826-002 | Confirmed for POC packaging | LPK V2 uses a registry Debian runtime with package-contained static Go/frontend artifacts; no embedded image or host path fallback | REQ-20260826-001 |
| DEC-20260826-004 | Accepted; device validation pending | Use official runtime SDK `QueryApplication` for current-user catalog; do not guess appvar source paths | REQ-20260826-001 |
| DEC-20260826-005 | Accepted; V1 remains gated | POC allows single-instance read/snapshot with a shared-data warning; V1 still rejects it | REQ-20260826-001 |
| DEC-20260826-006 | Compatibility path implemented; A/B validation pending | LZCOS v1.6 `PERM_OTHER_APP_DATA_ADMIN` creates the fixed `/lzcapp/run/data/app/var` projection; the POC maps catalog-validated `appid` entries and enforces application-layer read-only access without host mounts or `appvar.other.write` | REQ-20260826-001 |
