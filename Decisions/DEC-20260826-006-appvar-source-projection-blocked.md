# DEC-20260826-006 — Formal `appvar.other.read` source projection is required

**Status:** Compatibility path implemented; A/B isolation verification pending
**Related requirement:** REQ-20260826-001

## Decision

The POC must not infer an appvar source from a host path, a deploy ID, a
storage UID, or an undocumented host-side symlink. On LZCOS v1.6, the
documented-in-device compatibility permission `PERM_OTHER_APP_DATA_ADMIN`
creates the business-container projection `/lzcapp/run/data/app/var`. The
scanner and snapshot writer now consume only this fixed in-container root,
bound to the already-validated tenant, application, and deploy ID.

## Evidence

- The public [package specification](https://developer.lazycat.cloud/spec/package.html)
  defines `appvar.other.read` as a read permission, but does not define a
  source-directory, file-handle, or file-stream API. The [file-access guide](https://developer.lazycat.cloud/advanced-file.html)
  documents only the current app's `/lzcapp/var` and user document mounts.
- The current public `lzc-sdk` and `lzc-sdk-rs` protos expose
  `PackageManager.QueryApplication` and a generic `FileHandler`; neither has an
  appvar source-resolution method or a deploy-ID-to-file-handle contract.
- On the available v1.6.0 device, high-privilege applications declaring
  `PERM_OTHER_APP_DATA_ADMIN` receive a bind-mounted
  `/lzcapp/run/data/app/var` projection of `/lzcsys/data/appvar/`. The backup
  package now declares that compatibility permission and uses the fixed
  container path; it never opens the host source.
- The device's internal `PkgmService/ResolveCallerLzcAppPath` can resolve a
  host path when called from the host, but the business container has no
  supported visibility into that socket or path. This internal resolver is
  therefore diagnostic evidence only, not an application API.

## Runtime compatibility contract

The package pins:

```text
BACKUP_POC_APPVAR_ROOT=/lzcapp/run/data/app/var
BACKUP_POC_APPVAR_MODE=runtime-appvar
BACKUP_POC_APPVAR_LAYOUT=appid
BACKUP_POC_PROVIDER_VERSION=lzcos-runtime-appvar-v1
```

The provider maps one catalog-validated `appid` directory, verifies the
tenant/owner pair and keeps all file operations read-only at the application
layer. The observed compatibility mount is `rw` at the kernel level, so the
provider reports `service-enforced`; a future kernel-read-only mount can use
the documented provider with `ReadOnlyMode=filesystem`.

## Required platform contract for future API/mount variants

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

With the compatibility permission and projection present, platform rows can
reach `BACKUPABLE`, and scan/read/snapshot use the runtime provider. If the
permission is not granted or an old instance has not been recreated, the
service reports `RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE`; it never falls back
to `/lzcsys/data/appvar` or a browser-supplied path. The two-user isolation
matrix is still a release gate: until it passes, this is a device-validation
POC rather than a final PASS.
