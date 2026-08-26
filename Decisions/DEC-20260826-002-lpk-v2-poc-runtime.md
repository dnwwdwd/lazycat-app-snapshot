# DEC-20260826-002 — LPK V2 POC uses packaged static artifacts

**Status:** Confirmed for POC packaging
**Related requirement:** REQ-20260826-001

## Decision

The POC uses the validated Lazycat Debian base image:

```text
registry.lazycat.cloud/u30387910/library/debian:cb352a5223b8abc9
```

The build script compiles the Go diagnostic server for Linux amd64 and builds the Vite frontend before copying both into the LPK content directory. The runtime command only starts the packaged binary.

The manifest does not use `embed:` images, custom image build blocks, host mounts, `compose.override`, or a hard-coded appvar host path. The source resolver remains an environment-driven test fixture until the real Lazycat projection is verified on-device.

The service route uses `web.cloud.lazycat.app.backup.lzcapp:8080`, derived from service name plus package ID; the public subdomain is `app-backup-poc`. The POC does not reference `LAZYCAT_APP_DEPLOY_ID` because the target development box does not inject that variable reliably.

## Rationale

This follows the LPK V2 split between package metadata, runtime manifest, and package content. It keeps dependencies out of startup, lets the package update code through normal LPK upgrades, and preserves the existing `appvar.other.read` isolation gate.

## Validation boundary

Local frontend, Go, package-content and LPK checks prove packaging behavior only. They do not prove cross-user appvar isolation, platform `QueryApplication` ownership filtering, or runtime source read-only semantics. Those checks remain in the two-user device runbook.
