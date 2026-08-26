# DEC-20260826-006 — Formal `appvar.other.read` source projection is required

**Status:** Blocked pending a Lazycat platform contract
**Related requirement:** REQ-20260826-001

## Decision

The POC must not infer an appvar source from a host path, a deploy ID, a
storage UID, or an undocumented runtime symlink. The scanner and snapshot
writer may run only after a platform adapter returns a source bound to the
already-validated tenant, application, and deploy ID.

## Evidence

- The public [package specification](https://developer.lazycat.cloud/spec/package.html)
  defines `appvar.other.read` as a read permission, but does not define a
  source-directory, file-handle, or file-stream API. The [file-access guide](https://developer.lazycat.cloud/advanced-file.html)
  documents only the current app's `/lzcapp/var` and user document mounts.
- The current public `lzc-sdk` and `lzc-sdk-rs` protos expose
  `PackageManager.QueryApplication` and a generic `FileHandler`; neither has an
  appvar source-resolution method or a deploy-ID-to-file-handle contract.
- On the available v1.6.0 device, the POC can query the current-user catalog,
  but the observed `.otherAppVar` link points at a missing
  `/lzcapp/run/data/app/var` projection. That is evidence of an unavailable
  source, not permission to use a host-side path.

## Required platform contract

Lazycat must provide a documented, versioned interface that accepts the
server-side `tenant_uid`, `appid`, `source_deploy_id`, `owner_uid`, and
`multi_instance` identity established by `QueryApplication`, and returns one
of:

- a read-only directory or platform file handle that is scoped to that deploy
  ID; or
- a read-only streaming API with list/stat/read/tar semantics scoped to that
  deploy ID.

The contract must specify authorization and cross-user rejection, read-only
semantics, lifetime/refresh rules, device/inode or equivalent source identity,
and the minimum Lazycat OS/SDK versions.

## Consequence

Until that contract is supplied and passes the A/B device matrix, the service
continues to expose the catalog but reports `SOURCE_NOT_READY`; existing
`scanSource` and `writeSnapshot` logic remains disabled for platform rows. The
POC now routes both through a deploy-bound `resolvedSource`; local fixtures use
the same resolver interface for coverage. No privileged fallback is allowed.
