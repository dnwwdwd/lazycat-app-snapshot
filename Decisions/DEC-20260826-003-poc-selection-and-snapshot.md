# DEC-20260826-003 — POC closes the select/probe/manual-snapshot loop

## Decision

The POC UI opens on an application-selection flow. The user selects a current-tenant, multi-instance application, the server recursively inspects its resolved appvar, and one manual read snapshot can be written to the current user's public Lazycat Drive document root (`/lzcapp/document`).

The browser submits only a validated `deploy_id` for selection/snapshot and a relative path for the SHA-256 probe. It never submits a source absolute path, owner UID, storage UID, or another-user selector. The Go service resolves the source from a server-side platform adapter or the explicit fixture catalog, rechecks ownership and multi-instance state, classifies SQLite/service-database signatures, and rejects unsupported database snapshots.

The snapshot is a POC `tar.gz` plus `manifest.json`. SQLite files are copied as raw reads and marked `raw-read-poc`; SQLite Online Backup, scheduling, recovery, and a persistent control database remain V1 work.

## Rationale

The previous setup screen stopped at a top-level source probe and left the user with a `SOURCE_NOT_READY` message. That did not exercise the requested POC workflow. The new flow proves the application-selection, data-observation, and one-shot snapshot mechanics while preserving tenant isolation and the `appvar.other.read`/no-target-write boundary.

## Validation boundary

Fixture catalog tests prove the API and archive contract locally. The passed two-user POC established that the real `QueryApplication` result maps to the runtime projection and that one user cannot resolve the other user's appvar. Re-run `docs/APPVAR_READ_POC_RUNBOOK.md` after a platform, permission, projection, or resolver change.
