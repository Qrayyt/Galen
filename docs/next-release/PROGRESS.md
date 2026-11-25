# Galen Next Release Progress

## Checkpoint policy

Update this file after every stage and before every risky action. Each checkpoint records
the branch, baseline, current code SHA, task status, files, decisions, commands and results,
known errors, server changes without secrets, and the next concrete step.

Allowed task states: **not started**, **in progress**, **implemented**, **verified**, **blocked**.

## Current checkpoint

- Date: 2026-11-25 15:21 MSK (UTC+03:00).
- Stage: architecture audit complete; unified chat data-model implementation next.
- Branch: `feat/galen-next-release`.
- Baseline branch: `v1.0.0`.
- Baseline SHA: `e222545822e19ad867e52e0dd13b945a02326d49`.
- Current code SHA before this journal-only checkpoint:
  `3b8982938f36ac38b9413511584a0daf4a4aee64`.
- Working tree before this journal update: clean.

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

## Architecture audit findings

### Chats

- `dodaios/state/chat_store.py` already provides durable SQLite text threads, automatic
  first-message titles, message isolation, deletion, and an idempotent column migration.
- `/api/chats` already unifies text and voice history, supports create/resume/delete, and
  seeds only the selected conversation into the brain.
- The current front page intentionally presents one endless lead conversation. An older
  `ChatsView` and the shared `useConversations` hook prove multi-chat navigation exists as
  a partial foundation, but the active `ChatsSurface` renders `HomeView` only.
- Missing from the ordinary chat store/API: rename, search, mode, project association,
  draft/restored selection metadata, and project-scoped context.

### Work and projects

- Work is currently exposed as the `agentic-ide` section with mature panes, terminals,
  files, git, agent runtimes, workspaces, approvals, and resume handles.
- `dodaios/agentic_ide/library.py` and `/api/chat-library` already implement a versioned,
  atomic project/chat metadata library for coding-agent conversations: project create,
  rename, color, pin, archive, reorder, delete; per-project Work chat create, rename,
  archive, delete, resume metadata; and a scratch project.
- The ordinary SQLite chat store and the Work JSON library are separate. The release must
  connect them without deleting either data source. The SQLite chat entity will gain mode
  and project metadata; Work library records remain the authoritative compatibility layer
  for existing coding CLI conversations during migration.
- Existing project rows are folder-oriented and do not yet carry shared instructions,
  context files, a custom icon, collapse state, or an inert future agent id.

### Generative UI

- A safe chart fence is already implemented with bounded JSON parsing, fixed native React
  components, accessible table fallback, progressive open-fence handling, and no HTML/JS.
- Recharts, React Flow, Excalidraw, and native UI primitives are already dependencies.
  This repository evidence recovers the existing chart choice; no additional library is assumed.
- Missing: a common versioned component envelope, cards/tables/checklists/progress/calculators/
  inputs/diagrams under one validator, persisted interaction state, and generalized partial recovery.

### Marketplace

- Galen already has a substantial local marketplace client, publication identity/studio,
  plugin/skill import paths, catalog views, installation tests, and security-oriented helpers.
- The current catalog is inherited from the Dodaios marketplace and supports community entries.
  Server ownership/access for a Galenite metadata catalog is not present in this repository and
  must not be invented or deployed without an audited endpoint and credentials.
- Existing local installation, manifest, archive, permission, and publication code will be reused
  and tightened rather than replaced wholesale.

## Known errors and risks

- The default branch and current release branch have diverged operational roles. Opening a pull
  request against `main` now would mix the 1.0 transplant with next-release work; base selection
  must be reviewed again before any pull request.
- Existing workflows are tied to specific branches and release-marker files. No release marker will
  be changed and no release workflow will be triggered during feature development.
- The branch head has a successful macOS build, while the last successful Windows installer is at
  Preview 5. A fresh Windows build is required after implementation.
- The active chat surface and the mature Work surface use different stores and interaction models.
  A destructive merge would risk both ordinary history and external CLI resume handles, so the
  first migration is additive and compatibility-preserving.

## Risk checkpoint before first push

- Planned action: push the new feature branch containing only the two planning documents.
- Risk: low and reversible; it creates a remote branch but does not alter release branches or tags.
- Safeguards: branch is based on the audited SHA; working tree contains documentation only;
  no force push, tag change, release marker, secret, server mutation, or product code change.

## Server changes

None. No server credentials were read or recorded. No deployment, database, catalog, or API was changed.

## Risk checkpoint before the first data-model change

- Planned action: add nullable/defaulted columns and new tables to the existing `chats.db` schema,
  plus non-destructive APIs for chat/project metadata.
- Risk: a faulty migration could prevent old chat databases from opening.
- Safeguards: only additive columns/tables; defaults preserve old behavior; migration remains
  idempotent; tests open a legacy schema, run migration twice, and verify messages are unchanged;
  no existing column/table/file is renamed or removed.

## Next concrete step

Commit and push this architecture-audit checkpoint. Then implement and test the additive SQLite
schema for per-chat mode/project/draft and project metadata, followed by rename/search/move/state
routes. Do not change the active UI until legacy migration tests and route tests pass.
