# DEC-20260826-001 — `appvar.other.read` POC is a release gate

**Status:** Verified by passed POC on 2026-08-27
**Related requirement:** REQ-20260826-001

## Decision

Use the PDD's per-user, multi-instance model. The POC may read only a target that the current tenant owns, is multi-instance, and is still present in the current tenant's platform query. It must never use `other_uid`, host paths, `compose.override`, or `appvar.other.write`.

## Rationale and alternatives

- Recommended: platform-provided `appvar.other.read` projection plus server-side ownership checks. It preserves the V1 tenant boundary.
- Rejected: an administrator's global scanner or a host-directory mount. Either changes the approved product model and weakens isolation.
- Rejected: frontend-only filtering. It cannot protect a guessed deploy ID or filesystem path.

## Gate and rollback

The POC passed this gate. If a later platform, permission, projection, or resolver change lets either user enumerate, open, or read the other user's source, or makes the source projection writable, stop the affected V1 path. Do not introduce a privileged workaround.

## Read-only evidence policy

The POC does not issue create, modify, or delete requests against a target appvar, including disposable fixtures. Read-only evidence is the source mount's read-only flag, the absence of write endpoints and target-write code, and the two-user platform logs. A writable mount fails this gate without attempting a compensating write test.
