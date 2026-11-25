# Galen Next Release Progress

## Checkpoint policy

Update this file after every stage and before every risky action. Each checkpoint records
the branch, baseline, current code SHA, task status, files, decisions, commands and results,
known errors, server changes without secrets, and the next concrete step.

Allowed task states: **not started**, **in progress**, **implemented**, **verified**, **blocked**.

## Current checkpoint

- Date: 2026-11-25 15:52 MSK (UTC+03:00).
- Stage: project context, restore, native UI and GLNT catalog/client implementation; focused acceptance checks pending.
- Branch: `feat/galen-next-release`.
- Baseline branch: `v1.0.0`.
- Baseline SHA: `e222545822e19ad867e52e0dd13b945a02326d49`.
- Current committed SHA before this product checkpoint:
  `912720f`.
- Latest code checkpoint: GLNT desktop panel, verified staging client and non-release CI.

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
| 5 | Isolated chat context and global memory | in progress | Project-scoped runtime instructions/snapshots wired into brain/API/CLI; voice and global-memory boundary checks pending |
| 6 | Restart restore and lossless migration | in progress | Last ordinary session and scoped text drafts restore; blank draft, full UI state and desktop checks pending |
| 7 | Rename IDE to Work | in progress | Primary navigation and mode labels say Work in six main locales; secondary and nested locale copy remains to audit |
| 8 | Remove separate Chat/IDE tabs | implemented | The top Chat/IDE surface switch is removed while compatibility routes remain; desktop smoke remains before verified |
| 9 | Per-chat mode selection and persistence | in progress | New-conversation Chat/Work selector is in the history column and session metadata persists; existing-chat dialog/state restoration remains |
| 10 | Unified Chat/Work history | in progress | Ordinary and Work sessions are merged and ordered in the Chat sidebar without removing the mature Work project tree |
| 11 | Project lifecycle | in progress | Create, rename, collapse, and safe delete/ungroup controls are rendered; user-scenario and desktop checks remain |
| 12 | Project names, icons, collapsible groups | in progress | Name/icon editing and collapse controls implemented; desktop and new tests pending |
| 13 | Chat and Work creation in projects | in progress | Chat and Work can be created directly in selected project; voice-first scope and runtime verification remain |
| 14 | Move chats between project scopes | in progress | Agent-backed Chat and Work rows can move between project groups or back to recent/ungrouped; voice rows remain unassignable |
| 15 | Project instructions, context, and files | in progress | Project instructions and bounded text snapshots implemented; rich formats and voice scope pending |
| 16 | Future project-agent relationship | implemented | Optional inert `agent_id` metadata is present and round-trip tested; no agent system added |
| 17 | Native visual component library | implemented | Native cards/tables/charts/diagrams/checklists/progress/calculators/input; focused schema fixtures, runtime acceptance pending |
| 18 | Structured response schema | implemented | Versioned galen-ui envelope and bounded allow-list parser with fixtures |
| 19 | Safe renderer and Markdown fallback | in progress | Native renderer and text fallback; model chat HTML scripts disabled; end-to-end safety tests pending |
| 20 | Provider/model instructions and examples | in progress | Provider-independent guidance added; representative provider response fixtures pending |
| 21 | Safe interactions and state | in progress | Local selection/copy/calculation only; message-scoped persisted UI state pending |
| 22 | Streaming validation and recovery | in progress | Partial fence handling and invalid fallback; incremental/streaming acceptance pending |
| 23 | Metadata-only marketplace catalog | implemented | Metadata-only SQLite catalog service and focused API tests; deployment pending |
| 24 | Catalog API and Galen client | in progress | Versioned API, client pagination, cached offline browsing and frontend panel; integration checks pending |
| 25 | GitHub metadata and icons | in progress | GitHub metadata, pinned source and icon URL extraction; bounded icon rendering pending |
| 26 | Direct GitHub installation | in progress | Direct download and digest validation, local staged receipt; active plugin/skill registration pending |
| 27 | Direct updates and local removal | in progress | Atomic verified staged updates/removal with rollback tests; active extension lifecycle pending |
| 28 | Publish by repository link | in progress | GitHub URL submission through catalog API and signed-in desktop panel; real auth/deployment test pending |
| 29 | Unified extension manifest | implemented | Strict versioned manifest and archive parser for declarative plugins and skills; fixtures added |
| 30 | Moderation and safe installation | in progress | Moderation, archive checks, permission display and explicit staged-download consent; activation approval pending |

Summary: 0 verified, 7 implemented, 23 in progress, 0 not started, 0 blocked.

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

## Scoped project context checkpoint

- `c813de1`: additive project text snapshots, explicit size/name validation, runtime-only project briefing passed to brain/API/CLI runners; no automatic filesystem reads from legacy references. Instructions and snapshots are not inserted into stored user messages. Focused isolation and limit tests added.
- Following frontend commit exposes project instructions and explicit local text-file snapshots. Deleting a snapshot removes it from future prompt construction; no original file is touched. Existing CLI provider history and prior answers may retain previously supplied content; movement does not erase vendor history. Voice context, rich document formats, UI integration tests and full acceptance remain pending.
- No tests executed yet; no release or server changes. Next: draft restore and safe native UI contract. 

## Restart and native UI checkpoint

- `cb0678d`: explicit restoration of the last selected ordinary session, without reusing the singleton on New Chat; session-scoped local text drafts and Work draft text survive WebView restart. Blank ordinary drafts and selected mode restoration still need end-to-end checks. Added focused tests; no runtime test execution yet.
- Native UI v1: reused existing chart renderer and added bounded native cards, tables, progress, checklist, sequential diagram, calculator and input. Strict flat JSON schema, safe fallback, pending streaming state, and provider-independent guidance. Disabled opt-in script execution in chat HTML previews only. Added schema tests and contract docs. Native controls do not execute tools; persistent component state, streaming provider fixtures and desktop acceptance remain pending.
- Next: native UI interaction tests, marketplace audit and implementation, release verification. No release or server changes.

## Marketplace pre-change audit / risk checkpoint

- Baseline for marketplace work: `ea611ff` (native UI commit). Read-only Moscow inventory confirmed nginx, Galen website mirror and Galenite central API are active; no GLNT catalog service appears in systemd or enabled nginx sites. Existing deployment is production infrastructure; do not change it before tests and an explicit deployment configuration.
- Existing client: community_source.py consumes a GitHub Pages index with embedded plugin manifests; marketplace_routes.py converts manifests and the skill install path downloads SKILL.md; publish.py defaults to the old Dodaios registry issue flow. Keep installed extensions intact and introduce the new GLNT metadata contract separately until migration is verified.
- Planned work: strict versioned manifest, GitHub commit-pinned source, bounded declarative ZIP validation, metadata-only catalog service, explicit moderation, local staged installation and UI. No credentials or binaries in catalog records. Reject arbitrary executable payloads in v1; native activation is a separate reviewed integration, never automatic.

## GLNT implementation and verification checkpoint

- `8cc74e6`: strict manifest, pinned GitHub archive and integrity verification; declarative packages only; parser tests and manifest documentation.
- `327786c`: independent metadata-only catalog service, authenticated repository submissions, moderation, audit and API fixtures. No package proxy or remote deployment.
- `8dc3255`: desktop REST client with trusted Galenite HTTPS endpoint, bounded catalog cache, fresh approval recheck, direct GitHub archive retrieval, compatibility and integrity verification, atomic local staging/removal. Packages are staged, not activated; legacy marketplace remains untouched.
- `245de70`: GLNT panel in existing marketplace: browse, filters, paging, offline/error state, permissions/source/commit, explicit download consent, local staged packages, GitHub repository submission. Russian UI copy; full locale coverage pending.
- `912720f`: focused client tests and a non-release branch CI workflow (syntax, isolated GLNT tests, focused frontend tests and build). Workflow must run successfully before any verified claim. No test result is asserted here.
- Server changes: none; inventory read-only. glnt_catalog_url defaults to empty until service URL and publisher authorization are verified. Existing publisher GitHub app may require updated scopes. No release marker, tags, or deployment altered.
- Remaining: actual native extension activation/update/removal, icon retrieval/render, voice project scoping, complete mode/state restoration, message-scoped UI interaction persistence, broader backend/frontend tests and installed Windows smoke. Do not publish yet.

## CI repair checkpoint

- Run 45627405167: 9 focused frontend tests passed; TypeScript failed because split-pane stores did not implement the new restoration method. Python compileall passed, GLNT test collection failed because uvicorn was missing from the CI dependencies. Added scoped no-op restoration in split panes and missing dependency; expanded focused tests. No release changes.

## Continued implementation — native state, marketplace registration, voice isolation

- `02bc09b`: repaired split-pane TypeScript contract and CI dependencies. Focused backend and frontend test steps now pass on subsequent runs; prior full builds were canceled by new pushes, not verified.
- `b1dfe6c`: bounded message/block-scoped native UI state, checklist/selection/calculator persistence and completed truncated response fallback.
- `87f5cee`: consent-based GLNT installation into the native plugin catalog (disconnected) or skill registry (draft), source and version checks, integrity and moderation recheck, staged update and rollback on rename failure. Live registration integration and update/uninstall acceptance still need testing.
- `cf08e29`: fresh voice chat cannot seed prior lead history; voice-first project association preserved by the bind API and mirror. Actual voice runtime project briefing remains outstanding.
- This checkpoint adds reviewed commit-pinned raster icons with size/dimension limits and PNG normalization, client validation fixtures, and stops CI from canceling in-progress builds on each push. Native state fixtures are now included in CI. No deployment or release changes.

## CI green and workspace-mode checkpoint

- Run [45628884438](https://github.com/Qrayyt/Galen/actions/runs/45628884438) succeeded on `cf08e29`: 26 backend tests, 12 frontend tests, Python syntax compilation and production frontend build (1m43s). These are focused checks, not the full regression or installed Windows acceptance.
- `64b1f30` adds safe catalog raster icons and expanded checks; `0319439` restores Chat/Work workspace on launch without overriding explicit deep links.
- Mode change uses the same durable session and event log, with explicit confirmation and ask-first permissions, idle API-only runners, no active calls/goals/approvals/queued work, no owned threads or vendor resume handles. Work requires a connected folder; unsent drafts/attachments must be handled before the switch. CLI-bound conversations remain in their original mode pending provider-specific safe conversion. Added store fixtures and integrated frontend launch-mode tests. Full route and desktop acceptance remain pending.
