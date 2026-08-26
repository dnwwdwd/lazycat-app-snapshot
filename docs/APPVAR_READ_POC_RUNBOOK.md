# `appvar.other.read` two-user POC runbook

## Preconditions

Use a non-production Lazycat box, two ordinary users (A and B), and one disposable multi-instance fixture app per user. Put an identifiable text file in each fixture app's `appvar`. Do not use real customer data. Build the POC with a Docker-enabled environment:

```text
lzc-cli project build
lzc-cli app install <generated-lpk>
```

## Execute

1. Install/open the backup POC separately as A and B; record both backup `deploy_id` values and the environment identity response.
2. Confirm the POC application received `appvar.other.read` and is multi-instance.
3. In A's POC, have the platform adapter query applications with an empty deploy list, `only_owner=true`, and no `other_uid`. Verify only A-owned targets are available.
4. In A's POC page, select A's fixture application. Confirm the recursive entry list, SQLite/service-database classification, owner/multi-instance fields, and read-only state. A single-instance fixture is allowed for this POC, but the page must show a shared-data warning; it is not a V1 support result.
5. Run one manual snapshot. Confirm a `tar.gz` and `manifest.json` appear under A's private documents, the response includes archive SHA-256, and the source appvar is unchanged.
6. Give A the B fixture deploy ID. Confirm that resolving, listing, `stat`, manual snapshot, and reading all fail; capture the error code and logs.
7. In A's container, attempt only the platform-approved resolver route; do not browse host directories or add mounts. Verify B's appvar cannot be enumerated.
8. Confirm B's POC cannot access A's fixture by repeating steps 3–7 with roles reversed.

## Pass criteria

Pass only if the PDD §8.4 and §22 rows all hold: own eligible fixture readable, other-user source unresolvable/unreadable, source read-only, no cross-user enumeration, and stable deploy-ID mapping. A failed isolation check stops the V1 backup-engine workflow.

If the application catalog is returned but every selected application reports `SOURCE_NOT_READY` with `platform source resolver is not configured`, the catalog path is working and the platform has not exposed an approved appvar file projection. Record that as a platform integration blocker; do not substitute `/lzcsys/data/appvar`, a host mount, or a browser-supplied absolute path.

## Evidence to attach

- LPK build name and SHA-256.
- A/B backup deploy IDs (redact all but a stable suffix if shared outside the test team).
- Package permission screenshot or manifest inspection.
- API/log results for own-source success and cross-user denial.
- Source mount read-only evidence and test date / box OS version.
