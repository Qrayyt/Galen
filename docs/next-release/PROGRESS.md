# Galen Next Release Progress

## Checkpoint policy

Update this file after every stage and before every risky action. Each checkpoint records
the branch, baseline, current code SHA, task status, files, decisions, commands and results,
known errors, server changes without secrets, and the next concrete step.

Allowed task states: **not started**, **in progress**, **implemented**, **verified**, **blocked**.

## Current checkpoint

- Date: 2026-11-25 15:17 MSK (UTC+03:00).
- Stage: repository audit and recovery-plan bootstrap.
- Branch: `feat/galen-next-release`.
- Baseline branch: `v1.0.0`.
- Baseline SHA: `e222545822e19ad867e52e0dd13b945a02326d49`.
- Current code SHA before this documentation-only checkpoint:
  `e222545822e19ad867e52e0dd13b945a02326d49`.
- Working tree before documents: clean.

## Repository audit

- GitHub default branch is `main`, but it is the released 0.8 code line at `8673e76`.
- `v1.0.0` is the active release line and is 97 commits ahead of `main`; it is therefore the
  selected base so current Preview 5 work is not discarded.
- Remote branches observed: `main`, `backup/galen-0.8-before-dodaios`,
  `feat/galen-1.0-dodaios`, `galen-installer-preview`, and `v1.0.0`.
- Latest published release: `v1.0.0-preview.5`, published 2026-11-25, targeting
  `a4a3d68153569fc87f1596417ced013e80aa9a43`.
- Latest branch head: `e222545822e19ad867e52e0dd13b945a02326d49`, 24 commits after Preview 5.
- GitHub Actions at the audited head: `Galen macOS Preview 5` completed successfully.
- Latest Windows Preview 5 workflow completed successfully at the published Preview 5 tag.
- CI is path/branch selective. Existing smoke workflows still name
  `feat/galen-1.0-dodaios`; the next-release branch will require focused local checks and,
  if appropriate, a pull request to exercise pull-request checks.
- Source foundation is the Python/React Dodaios-derived Galen 1.0 application, not the older
  Tauri application present on `main`.

## Task status

| # | Task | Status | Evidence / note |
| ---: | --- | --- | --- |
| 1 | Multi-session ordinary chats | not started | Audit pending |
| 2 | Unified history sidebar | not started | Audit pending |
| 3 | Chat lifecycle and durable history | not started | Audit pending |
| 4 | Chat search | not started | Audit pending |
| 5 | Isolated chat context and global memory | not started | Audit pending |
| 6 | Restart restore and lossless migration | not started | Audit pending |
| 7 | Rename IDE to Work | not started | Audit pending |
| 8 | Remove separate Chat/IDE tabs | not started | Audit pending |
| 9 | Per-chat mode selection and persistence | not started | Audit pending |
| 10 | Unified Chat/Work history | not started | Audit pending |
| 11 | Project lifecycle | not started | Audit pending |
| 12 | Project names, icons, collapsible groups | not started | Audit pending |
| 13 | Chat and Work creation in projects | not started | Audit pending |
| 14 | Move chats between project scopes | not started | Audit pending |
| 15 | Project instructions, context, and files | not started | Audit pending |
| 16 | Future project-agent relationship | not started | Schema design pending; no agent system in scope |
| 17 | Native visual component library | not started | Existing chart/report support must be audited first |
| 18 | Structured response schema | not started | Audit pending |
| 19 | Safe renderer and Markdown fallback | not started | Audit pending |
| 20 | Provider/model instructions and examples | not started | Prior library selection will not be invented |
| 21 | Safe interactions and state | not started | Audit pending |
| 22 | Streaming validation and recovery | not started | Audit pending |
| 23 | Metadata-only marketplace catalog | not started | Server infrastructure/access audit required |
| 24 | Catalog API and Galen client | not started | Audit pending |
| 25 | GitHub metadata and icons | not started | Audit pending |
| 26 | Direct GitHub installation | not started | Audit pending |
| 27 | Direct updates and local removal | not started | Audit pending |
| 28 | Publish by repository link | not started | Existing partial flow must be identified |
| 29 | Unified extension manifest | not started | Existing plugin/skill formats must be audited |
| 30 | Moderation and safe installation | not started | Audit pending |

Summary: 0 verified, 0 implemented, 0 in progress, 30 not started, 0 blocked.

## Files changed in this checkpoint

- `docs/next-release/PLAN.md` — authoritative 30-task plan and acceptance criteria.
- `docs/next-release/PROGRESS.md` — resumable execution journal.

No product source, configuration, release marker, website, or server file has been changed.

## Architecture decisions

1. Base the work on `v1.0.0`, not `main`, because `v1.0.0` contains the current shipped
   Preview 5 foundation and 97 commits absent from `main`.
2. Use one durable chat entity with a per-chat mode rather than parallel Chat and IDE stores.
3. Add schema versions and idempotent migrations before changing stored user data.
4. Preserve legacy identifiers where needed for compatibility while presenting Work in the UI.
5. Scope project context by project identifier and make the future agent relationship optional and inert.
6. Render generative UI only through allow-listed native components and a versioned schema.
7. Never execute model-supplied JavaScript or arbitrary HTML.
8. Keep marketplace package bytes on GitHub; the catalog server stores metadata only.
9. Require manifest validation, safe extraction, declared permissions, and explicit consent before
   third-party code can execute.

## Commands and results

| Command / check | Result |
| --- | --- |
| `git ls-remote --symref ... HEAD` | Default remote branch is `main`; head `8673e76` |
| `git ls-remote --heads ...` | Five remote branches enumerated |
| `git ls-remote --tags --refs ...` | Tags through `v1.0.0-preview.5` enumerated |
| `git rev-list --left-right --count origin/main...origin/v1.0.0` | `0 97`; release line is 97 commits ahead |
| GitHub releases API audit | Preview 5 is latest; published; prerelease |
| GitHub Actions API audit | Head macOS workflow succeeded; Preview 5 Windows workflow succeeded |
| `git status --short --branch` | Clean branch created from `origin/v1.0.0` |
| Test commands | Not run yet; no product code changed |

## Known errors and risks

- The default branch and current release branch have diverged operational roles. Opening a pull
  request against `main` now would mix the 1.0 transplant with next-release work; base selection
  must be reviewed again before any pull request.
- Existing workflows are tied to specific branches and release-marker files. No release marker will
  be changed and no release workflow will be triggered during feature development.
- The branch head has a successful macOS build, while the last successful Windows installer is at
  Preview 5. A fresh Windows build is required after implementation.
- The full existing chat/project/marketplace storage architecture is not yet mapped. Product changes
  must wait until that audit is recorded.

## Risk checkpoint before first push

- Planned action: push the new feature branch containing only the two planning documents.
- Risk: low and reversible; it creates a remote branch but does not alter release branches or tags.
- Safeguards: branch is based on the audited SHA; working tree contains documentation only;
  no force push, tag change, release marker, secret, server mutation, or product code change.

## Server changes

None. No server credentials were read or recorded. No deployment, database, catalog, or API was changed.

## Next concrete step

Commit these two documents as the first checkpoint, push `feat/galen-next-release`, verify the
remote commit, then map the existing chat persistence, routes, React state, Work/IDE surfaces,
project storage, generative UI support, and marketplace publication/install paths before editing them.
