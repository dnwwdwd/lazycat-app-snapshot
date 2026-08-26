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
3. Establish the platform-approved source mapping on-device. The POC's fixture adapter must receive it only from a server-side/platform-controlled mechanism; do not enter an absolute source path in the browser, use a host path, or add a mount. Confirm that the platform query uses an empty deploy list, `only_owner=true`, and no `other_uid`.
4. Resolve A's fixture by deploy ID server-side. Check the source mount's read-only flag and request the probe's metadata/hash for the known fixture file. Do not attempt to create, modify, or delete a target file.
5. Give A the B fixture deploy ID. Confirm that resolving, listing, `stat`, and reading all fail; capture the error code and logs.
6. In A's container, attempt only the platform-approved resolver route; do not browse host directories or add mounts. Verify B's appvar cannot be enumerated.
7. Confirm B's POC cannot access A's fixture by repeating steps 3–6 with roles reversed.

## Pass criteria

Pass only if the PDD §8.4 and §22 rows all hold: own eligible fixture readable, other-user source unresolvable/unreadable, source read-only, no cross-user enumeration, and stable deploy-ID mapping. A failed isolation check stops the V1 backup-engine workflow.

## Evidence to attach

- LPK build name and SHA-256.
- A/B backup deploy IDs (redact all but a stable suffix if shared outside the test team).
- Package permission screenshot or manifest inspection.
- API/log results for own-source success and cross-user denial.
- Source mount read-only evidence, confirmation that the POC exposes no target-write route, and test date / box OS version.
