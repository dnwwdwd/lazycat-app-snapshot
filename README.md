# 懒猫应用备份

This repository currently contains the V1 PRD/PDD, a reference UI prototype, and the first gated implementation: a tenant-isolation POC for `appvar.other.read`.

Read [DOCUMENT_MAP.md](DOCUMENT_MAP.md) first. The backup engine is intentionally not started until the POC package builds and passes the two-user device matrix in [docs/APPVAR_READ_POC_RUNBOOK.md](docs/APPVAR_READ_POC_RUNBOOK.md).

## Build the POC

```text
lzc-cli project build
```

The configured Microserver must first trust this workstation's `lzc-cli` public key. The POC uses an embedded Go image and is not a full backup implementation.
