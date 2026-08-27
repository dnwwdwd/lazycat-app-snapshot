# DEC-20260826-004 — Use the runtime SDK for the tenant application catalog

## Decision

The POC obtains the application catalog from the official Lzc SDK `PackageManager.QueryApplication` when it runs inside Lazycat. The frozen server-side `tenant_uid` is carried in the SDK's `X-Hc-User-Id` real-UID metadata because the API gateway does not infer a user from the app deploy UID. Every request uses an empty `deploy_ids` list, `only_owner=true`, and `ignore_pending_pkg=true`; `other_uid` is never set. The Go service filters the response again by the frozen `tenant_uid` before exposing any row to the browser.

The adapter maps only application identity and instance metadata (`appid`, title, version, deploy ID, owner, and multi-instance state). It does not invent a host source path. On LZCOS v1.6, the selected application is resolved through the fixed business-container projection enabled by `PERM_OTHER_APP_DATA_ADMIN`; if that projection is absent, it reports `RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE` until the app instance is re-authorized or recreated.

## Rationale

The previous fixture-only loader returned `APPLICATION_CATALOG_NOT_READY` in a real container even though the platform already exposed the current-user application API. The SDK is the supported route and carries the app certificate/runtime context. Passing `other_uid`, reading host appvar directories, or trusting a browser-supplied UID would weaken the tenant boundary and is not an acceptable fallback.

## Validation boundary

Local tests validate owner filtering and the existing recursive probe/snapshot contract. A real box must still prove that the SDK call resolves the current user, that only the user's applications are returned, and that each returned deploy ID maps to a read-only appvar projection. This decision does not claim that the source resolver is complete.
