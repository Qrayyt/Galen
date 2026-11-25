# Galen Next Release Progress

## Checkpoint policy

Update this file after every stage and before every risky action. Each checkpoint records
the branch, baseline, current code SHA, task status, files, decisions, commands and results,
known errors, server changes without secrets, and the next concrete step.

Allowed task states: **not started**, **in progress**, **implemented**, **verified**, **blocked**.

## Current checkpoint

- Date: 2026-11-25 15:52 MSK (UTC+03:00).
- Stage: unified navigation, scoped Work creation, project editing and search advanced; new acceptance checks pending.
- Branch: `feat/galen-next-release`.
- Baseline branch: `v1.0.0`.
- Baseline SHA: `e222545822e19ad867e52e0dd13b945a02326d49`.
- Current committed SHA before this product checkpoint:
  `d3bddcc`.
- Latest code checkpoint: project-detachment behavior and regression tests, in addition to the preceding frontend changes.

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
| 1 | Multi-session ordinary chats | implemented | New ordinary conversations create distinct durable sessions; opening/restoring, deletion, voice-first creation, and event isolation have focused tests; desktop scenario remains before verified |
| 2 | Unified history sidebar | in progress | Chat and Work rows, search, recent chats, and project groups render in one sidebar; running-desktop scenarios remain |
| 3 | Chat lifecycle and durable history | in progress | Create, metadata update, delete, automatic title, and persistence verified at store/API level; UI remains |
| 4 | Chat search | in progress | Title/body search wired to sidebar across Chat and Work; voice archive and runtime verification remain |
| 5 | Isolated chat context and global memory | in progress | Existing per-thread message isolation preserved; project context injection still remains |
| 6 | Restart restore and lossless migration | in progress | Draft/state persistence and repeated migrations verified in both chat stores; active-chat UI restoration remains |
| 7 | Rename IDE to Work | in progress | Primary navigation and mode labels say Work in six main locales; secondary and nested locale copy remains to audit |
| 8 | Remove separate Chat/IDE tabs | implemented | The top Chat/IDE surface switch is removed while compatibility routes remain; desktop smoke remains before verified |
| 9 | Per-chat mode selection and persistence | in progress | New-conversation Chat/Work selector is in the history column and session metadata persists; existing-chat dialog/state restoration remains |
| 10 | Unified Chat/Work history | in progress | Ordinary and Work sessions are merged and ordered in the Chat sidebar without removing the mature Work project tree |
| 11 | Project lifecycle | in progress | Create, rename, collapse, and safe delete/ungroup controls are rendered; user-scenario and desktop checks remain |
| 12 | Project names, icons, collapsible groups | in progress | Name/icon editing and collapse controls implemented; desktop and new tests pending |
| 13 | Chat and Work creation in projects | in progress | Chat and Work can be created directly in selected project; voice-first scope and runtime verification remain |
| 14 | Move chats between project scopes | in progress | Agent-backed Chat and Work rows can move between project groups or back to recent/ungrouped; voice rows remain unassignable |
| 15 | Project instructions, context, and files | in progress | Instructions and context-file references persist; scoped prompt/file injection remains |
| 16 | Future project-agent relationship | implemented | Optional inert `agent_id` metadata is present and round-trip tested; no agent system added |
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

Summary: 0 verified, 3 implemented, 13 in progress, 14 not started, 0 blocked.

## Files changed in this checkpoint

- `dodaios/state/chat_store.py` — additive thread metadata migrations, project store,
  search, safe metadata updates, and persisted application state.
- `dodaios/ui/web/chats_routes.py` — mode/project-aware chat routes, search, project CRUD,
  chat metadata patching, and restart-state routes.
- `tests/unit/state/test_chat_store_persistence.py` — legacy migration, search, project,
  app-state, and deletion-disposition coverage.
- `tests/unit/state/test_chats_routes.py` — end-to-end route coverage for lifecycle, search,
  modes, projects, moves, state restoration, and safe project deletion.
- `docs/next-release/PROGRESS.md` — this resumable implementation checkpoint.
- `dodaios/ui/web/frontend/src/components/layout/UnifiedChatSidebar.tsx` — merged Chat/Work history,
  search, mode creation control, project groups, moves, rename, collapse, and safe delete controls.
- `dodaios/ui/web/frontend/src/components/layout/Sidebar.tsx` and `src/App.tsx` — host the full-width
  unified history column and its resizer while preserving the established Work project tree.
- `dodaios/ui/web/frontend/src/components/layout/TopBar.tsx` — remove the separate top Chat/IDE switch.
- `dodaios/ui/web/frontend/src/lib/chatsApi.ts` and `src/store/events.ts` — typed project, state,
  and chat metadata clients used by the compatibility-preserving frontend bridge.
- Main locale files — expose Work in primary navigation/mode labels without changing internal route ids.
- Shell/sidebar/i18n tests — update assertions to the intended unified navigation behavior.
- `dodaios/agent_chat/lead.py`, `service.py`, and `voice_mirror.py` — retain a last-active
  default pointer while creating isolated ordinary sessions, including a voice-first blank chat.
- `dodaios/ui/web/agent_chat_routes.py` — create and delete separate ordinary sessions and accept
  project metadata at creation without rewriting existing histories.
- Lead and voice-mirror tests — verify separate IDs and events, restart restoration, safe deletion,
  project metadata, and one new conversation for a voice call started on a blank page.

No release marker, workflow, website, external server, or secret has been changed.

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
| `python -m py_compile dodaios/state/chat_store.py dodaios/ui/web/chats_routes.py` | Passed |
| First focused `pytest` run | Environment setup failed before collection because `tomlkit` was absent; no test failure |
| `python -m pytest tests/unit/state/test_chat_store_persistence.py tests/unit/state/test_chats_routes.py -q` | 36 passed, 1 third-party deprecation warning, 1.44 seconds |
| `git diff --check` | Passed |
| `npm ci` in the frontend | 850 packages installed; audit reports 0 vulnerabilities |
| First agent-chat test attempts | Environment setup exposed missing `aiosqlite`, `python-multipart`, and `rich`; no product assertion failed |
| `python -m pytest tests/unit/agent_chat/test_agent_chat_surface_parity.py tests/unit/agent_chat/test_agent_chat_service.py -q` | 37 passed, 1 third-party deprecation warning, 3.20 seconds |
| `npm run build` in the frontend | Passed; 8,738 modules transformed; existing chunk-size, Tailwind ambiguity, and third-party annotation warnings only |
| `npm test -- --run src/components/layout/Sidebar.test.tsx src/App.shell.test.tsx src/components/layout/AppSurfaceSwitch.test.tsx src/__tests__/i18n.test.ts` | 4 files passed, 87 tests passed, 4.02 seconds |
| `git diff --check` after unified frontend changes | Passed |
| `python -m py_compile dodaios/agent_chat/lead.py dodaios/agent_chat/service.py dodaios/agent_chat/voice_mirror.py dodaios/ui/web/agent_chat_routes.py` | Passed |
| `python -m pytest tests/unit/agent_chat/test_lead_thread.py tests/unit/agent_chat/test_voice_mirror.py tests/unit/agent_chat/test_agent_chat_service.py tests/unit/agent_chat/test_agent_chat_surface_parity.py -q` | 72 passed, 1 third-party deprecation warning, 4.56 seconds |

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
- Focused tests emit upstream `pytest-asyncio` and Starlette/httpx deprecation warnings. They do
  not affect the result, but dependency/configuration cleanup remains for the full regression stage.

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

## Additive data-model and API checkpoint

- Result: the migration and API block is implemented and its focused test suite passes.
- Compatibility: old text messages remain byte-for-byte readable; opening the store twice is
  idempotent; legacy chat behavior defaults to `chat`, no project, empty draft, and empty state.
- Safety: deleting a project ungroups its chats by default. Deleting associated chats requires the
  explicit `delete_chats=true` route parameter.
- Scope boundary: the existing Work library and external CLI resume handles were not modified.

## Current agent-chat metadata bridge checkpoint

- Result: the active typed-chat and Work session store now carries optional project id, unsent
  draft, and native JSON state alongside its existing immutable execution surface.
- Migration: three additive columns are idempotently added to existing `agent_chat_sessions`; old
  sessions default to no project, an empty draft, and empty state.
- API: the existing agent-chat PATCH route accepts these metadata fields without changing provider,
  model, CLI resume id, or the session's immutable `jarvis`/`agent` execution surface.
- Verification: persistence through close/reopen, safe ungrouping, route round-trip, and the broader
  agent-chat service suite pass.

## Risk checkpoint before unified frontend work

- Planned action: replace separate top-level Chat/IDE navigation with a unified history sidebar and
  per-conversation Chat/Work mode controls while retaining all existing Work panes and routes.
- Risk: navigation regressions could hide mature Work tools or make an existing chat appear lost.
- Safeguards: keep legacy route identifiers as compatibility aliases; render from the additive API;
  never delete histories during UI selection; persist active chat/draft state; run component tests,
  a production web build, and a packaged desktop smoke check before calling the UI verified.

## Unified frontend checkpoint

- Result: the Chat surface now owns a full-width ChatGPT-style history column that merges ordinary
  and Work sessions, sorts them by activity, searches them locally, and groups agent-backed sessions
  under persistent projects.
- Compatibility: selecting Work still opens the existing `agentic-ide` section, project tree, files,
  terminals, git, tools, approvals, and resume logic. Internal route and surface identifiers were not
  renamed, so saved links and persisted sessions continue to resolve.
- Safety: deleting a project uses the API's safe default and ungroups its chats. It does not request
  destructive `delete_chats=true`. Existing chat deletion behavior remains scoped to eligible rows.
- Verification: the production frontend bundle succeeds and focused shell/sidebar/i18n tests pass.
  The desktop application has not yet been launched against this bundle, so tasks are not marked verified.
- Remaining in this stage: assign a newly created Chat/Work conversation directly to the selected
  project, persist and restore the selected conversation/draft, add icon editing, finish secondary
  Work copy, and exercise rename/move/delete/restart scenarios in the running desktop.

## Risk checkpoint before unified frontend push

- Planned action: commit and push the unified frontend and this journal update as one reviewable block.
- Risk: medium; navigation changes can hide existing surfaces even though no histories are rewritten.
- Safeguards: production build and 87 focused tests pass; legacy route ids and the mature Work tree are
  retained; no release marker, workflow, tag, server, secret, or stored history is changed.

## Risk checkpoint before ordinary-chat multi-session semantics

- Date: 2026-11-25 15:48 MSK (UTC+03:00).
- Current committed SHA: `b31acae`.
- Planned action: change a new `jarvis` conversation from reusing the historical singleton lead
  session to creating a distinct durable session, while retaining the lead pointer as the last
  active/default conversation for voice, proactive work, and restart restoration.
- Risk: high; the singleton assumption is referenced by typed chat creation, voice mirroring,
  background notices, deletion protection, and startup restoration.
- Safeguards: do not rewrite or delete existing sessions; keep the lead table and compatibility
  endpoints; make opening a chat update the default pointer; keep an explicit blank/new state for
  voice; add focused route, restart, deletion, isolation, and voice-call tests before pushing.
- Rollback boundary: this block changes behavior and tests only. The additive database schema remains
  compatible with existing installations, and no existing history row is migrated or removed.

## Ordinary-chat multi-session checkpoint

- Result: each new typed ordinary chat now creates a distinct `jarvis` session instead of changing
  the model on the historical singleton. Existing sessions remain untouched and independently openable.
- Restoration: the existing lead-session table is retained as a last-active/default pointer. Creating
  or opening a chat updates it, so the selected chat survives a process restart without a new schema.
- Voice: binding a blank page records an explicit fresh state. Its first voice turn creates one new
  conversation and binds later turns/calls to it; opening an existing row binds voice to that row.
- Deletion: the current/default conversation is no longer artificially undeletable. After deletion,
  the existing fallback selects the newest remaining ordinary chat or creates one on demand.
- Isolation evidence: focused tests put different turns into two sessions and assert neither event
  stream contains the other's text. A route test asserts distinct IDs and project metadata.
- Compatibility: `/lead`, the `lead` response marker, saved model selection, background defaulting,
  and all internal `jarvis` identifiers remain available. No stored event or session is rewritten.

## Next concrete step

Commit and push the unified frontend checkpoint. Then finish Work copy, selected-project creation,
active-chat/draft restoration, project icon editing, and running-desktop chat/project scenarios before
starting the scoped project-context injection block.

## Continuation checkpoint — direct GitHub editing

- Base: `8199085`; branch: `feat/galen-next-release`.
- Product commits: `4e9adf6`, `21a6b8a`, `79ae60c`.
- Removed the frontend singleton lead reopening path on newChat; added per-send-lane project metadata to avoid cross-chat leakage during asynchronous creation.
- Added project-aware ordinary chat navigation and a new chat button in project groups.
- Tasks 1 and 13: frontend implementation advanced, NOT verified; Work project creation, voice-first project scope, and desktop regression checks remain.
- No external server or release changes. No build or tests run in this environment. Next: inspect Work thread initialization, project editing, and add targeted tests before marking complete.


## Continuation checkpoint — project wire contract and upcoming UI changes

- Date: 2026-11-25, continuation on `feat/galen-next-release`.
- Code: `b7f1f01` fixes the project REST contract (server emits `id` and nanosecond timestamps; client had read `project_id` and milliseconds without decoding); `3258a52` adds focused list/create/patch and invalid-ID tests.
- Test execution: not run; direct GitHub editing has no checked-out dependency environment. No task is promoted to verified.
- Next risky action: bridge Work draft project metadata without treating the unified project ID as a filesystem/workspace ID, and make project edit/delete explicit. Keep the original Work folder tree and CLI resume behavior; do not change release markers or server state.

## Continuation checkpoint — Work/project navigation and full-history search

- Date: 2026-11-25. Branch: `feat/galen-next-release`.
- `931bbf3`: distinct unified project scope for new Work drafts and send lanes; do not use the unified project id as a filesystem/workspace id. Project-group new-chat action honors Chat/Work mode. Added focused draft and thread tests.
- `b5efd4e`: debounced full-message search across ordinary and Work agent sessions; stale-request cancellation, snippets, older hits, and project-group expansion while searching. Voice archive search and pagination beyond the per-mode result cap remain.
- `c597a34`: edit project name/icon, confirm project deletion and chat moves/deletes; project deletion uses the non-destructive default. Added localized confirmation copy and error feedback.
- `7f6d758`: unified history remains visible in Work thread layout; mature Work project tree is retained in a collapsible section.
- `6aac84b`: focused frontend tests for project-scoped Chat/Work creation, message search, icon editing and confirmations.
- `b7aa75b`: fix application-state PUT envelope and add regression test.
- Tasks 2–4, 6, 9–14 advanced; desktop acceptance and execution of newly added tests remain outstanding. No verified status is assigned. Project deletion originally did not clear agent-store references; see following checkpoint. Project instructions/files are not yet injected; voice-first scoping, full restart/draft restore, mode changes of existing chats, and full-text voice archive search remain.
- No build, dependency installation or test execution was performed during this direct connector session. No release marker, tag, deployment, server, or existing conversation data was changed. A large multi-locale write failed at transport level; smaller commits succeeded. Keep the release unverified.
- Next: reconcile project deletion across both stores; implement scoped project context and restart/draft restore; then continue generative UI and GLNT marketplace blocks (17–30) and final acceptance matrix.

## Project detachment checkpoint

- `d3bddcc`: project deletion now detaches associated agent-backed Chat and Work sessions in addition to legacy text threads; retains sessions, drafts, timestamps and CLI resume handles. Added focused store test. Agent sessions are deliberately retained even if the legacy text deletion flag is set. The two database operations are not atomic; detach precedes metadata deletion to preserve access on failure.
- Test execution and route-level acceptance still pending. No existing data mutated by this commit; changes affect application behavior only.
