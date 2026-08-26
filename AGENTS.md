# Project instructions

## Start-of-task reading

Before changing code, read this file, [DOCUMENT_MAP.md](DOCUMENT_MAP.md), the mapped PRD/PDD, and the applicable requirement and progress record.

## Documentation

- `DOCUMENT_MAP.md` is the only navigation index for project facts.
- Non-bug work is recorded in `Requirements/`; substantial work also has a linked record in `Progress/`.
- Architecture, data, security, or platform-boundary decisions go in `Decisions/`. Do not treat a pending decision as implemented behavior.
- Keep the PRD/PDD as the product and technical sources of truth; do not duplicate them under `docs/`.

## Lazycat boundaries

- The V1 product is multi-instance and tenant-isolated. Never add `appvar.other.write`, host mounts, `compose.override`, or cross-user fallback behavior.
- A platform POC is required before implementing the backup engine. Local unit or package checks never prove `appvar.other.read` isolation.
- Do not publish, deploy, push, or create a PR without explicit user approval.

## GitLab repository operations

- Canonical repository: `notus` at `git@gitlab.burgercat.heiyu.space:hejiajun/notus.git`.
- Before updating a checkout, run `git status --short --branch`; preserve uncommitted user changes.
- Update with `git pull --ff-only origin main`. Do not reset or overwrite user work.
