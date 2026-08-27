# `appvar.other.read` 两用户 POC 验证记录与回归手册

**状态：** 已于 2026-08-27 通过。此文档保留 POC 验证步骤；Lazycat 平台、权限声明、运行时投影或源解析器发生变化后，必须重新执行完整矩阵。

## Preconditions

Use a non-production Lazycat box, two ordinary users (A and B), and one disposable multi-instance fixture app per user. Put an identifiable text file in each fixture app's `appvar`. Do not use real customer data. Build the POC with a Docker-enabled environment:

```text
lzc-cli project build
lzc-cli app install <generated-lpk>
```

## Execute

1. Install/open the backup POC separately as A and B; record both backup `deploy_id` values and the environment identity response.
2. Confirm the POC application received `appvar.other.read`, is multi-instance, and
   that the LZCOS v1.6 compatibility permission `PERM_OTHER_APP_DATA_ADMIN` is
   present. If the app was upgraded in place, recreate the instance so the
   `/lzcapp/run/data/app/var` projection is mounted.
3. In A's POC, have the platform adapter query applications with an empty deploy list, `only_owner=true`, and no `other_uid`. Verify only A-owned targets are available.
4. In A's POC page, select A's fixture application. Confirm the recursive entry list, SQLite/service-database classification, owner/multi-instance fields, and `runtime-appvar` / `service-enforced` read-only state. A single-instance fixture is allowed for this POC, but the page must show a shared-data warning; it is not a V1 support result.
5. Run one manual snapshot. Confirm `/lzcapp/document` is present as the platform-provided current-user Drive mount; the service creates `LazycatAppBackup/poc` below it when needed. Confirm a `tar.gz` and `manifest.json` appear in A's public Lazycat Drive under that directory, the response includes archive SHA-256, and the source appvar is unchanged. If the mount is absent, the service must reject the snapshot and must not create `/lzcapp/document` in the container layer.
6. Give A the B fixture deploy ID. Confirm that resolving, listing, `stat`, manual snapshot, and reading all fail; capture the error code and logs.
7. In A's container, attempt only the platform-approved resolver route; do not browse host directories or add mounts. Verify B's appvar cannot be enumerated.
8. Confirm B's POC cannot access A's fixture by repeating steps 3–7 with roles reversed.

## 通过条件

PDD 对应检查项须全部成立：自己的合格测试应用可读，其他用户的源不可解析或读取，源保持只读，不能枚举其他用户数据，且 `deploy_id` 映射稳定。本轮 POC 已满足这些条件。后续回归若出现隔离失败，必须暂停受影响的 V1 备份路径。

If the application catalog is returned but every selected application reports
`RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE`, verify the compatibility permission and
recreate the instance. Do not substitute `/lzcsys/data/appvar`, a host mount, or
a browser-supplied absolute path.

## Evidence to attach

- LPK build name and SHA-256.
- A/B backup deploy IDs (redact all but a stable suffix if shared outside the test team).
- Package permission screenshot or manifest inspection.
- API/log results for own-source success and cross-user denial.
- Source mount read-only evidence and test date / box OS version.
