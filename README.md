# 懒猫应用备份

This repository currently contains the V1 PRD/PDD, a reference UI prototype, and the first gated implementation: a tenant-isolation POC for `appvar.other.read`. The packaged entry point is a dedicated read-only diagnostics page, not the V1 backup UI.

Read [DOCUMENT_MAP.md](DOCUMENT_MAP.md) first. The backup engine is intentionally not started until the POC package builds and passes the two-user device matrix in [docs/APPVAR_READ_POC_RUNBOOK.md](docs/APPVAR_READ_POC_RUNBOOK.md).

## Build the POC

```text
lzc-cli project build
```

The configured Microserver must first trust this workstation's `lzc-cli` public key. The POC uses an embedded Go image and is not a full backup implementation.

The image runs Go tests, Vitest API-client tests, and the Vite production build before packaging. On a real box, the ingress supplies the browser identity headers and the manifest renders `BACKUP_APP_DEPLOY_ID` / `BACKUP_APP_DEPLOY_UID` from deployment parameters. Source mapping remains a platform POC: do not add a host path, a cross-user fallback, or target-write test.
