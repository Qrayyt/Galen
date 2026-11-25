# Galen Next Release Progress

## Checkpoint policy

Update this file after every stage and before every risky action. Each checkpoint records
the branch, baseline, current code SHA, task status, files, decisions, commands and results,
known errors, server changes without secrets, and the next concrete step.

Allowed task states: **not started**, **in progress**, **implemented**, **verified**, **blocked**.

## Current checkpoint

- Date: 2026-11-25 (latest continuation).
- Stage: integrated feature implementation and candidate verification; full regression and desktop acceptance pending.
- Branch: `feat/galen-next-release`.
- Baseline branch: `v1.0.0`.
- Baseline SHA: `e222545822e19ad867e52e0dd13b945a02326d49`.
- Current product-code SHA:
  `e57a65a4bb3a13efe32b5f7eec74f33be895c484`.
- Latest code checkpoint: durable private voice archive provenance; legacy Work migration, rich-document route and Responses API regression fixtures.

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
| 2 | Unified history sidebar | implemented | Unified sidebar and search; desktop acceptance outstanding |
| 3 | Chat lifecycle and durable history | implemented | Create, rename, delete, auto-title and durable history; desktop acceptance outstanding |
| 4 | Chat search | implemented | Chat/Work and archived voice search with focused fixtures; focused CI succeeded on 299daf8; large-history/desktop acceptance pending |
| 5 | Isolated chat context and global memory | in progress | Sticky private text/agent/voice provenance and automatic-learning guards implemented; exact candidate regression pending, including the new archived voice test |
| 6 | Restart restore and lossless migration | implemented | Existing focused persistence/restart suite passed on b37d1076; added Preview 5 Work database/resume fixture; exact-candidate and installed-app migration acceptance pending |
| 7 | Rename IDE to Work | implemented | Six locales and regression assertions updated; 08b1c6a candidate frontend job passed; desktop accessibility acceptance pending |
| 8 | Remove separate Chat/IDE tabs | implemented | The top Chat/IDE surface switch is removed while compatibility routes remain; desktop smoke remains before verified |
| 9 | Per-chat mode selection and persistence | implemented | New and idle API-backed existing chats support mode selection; CLI-bound chats cannot safely convert |
| 10 | Unified Chat/Work history | implemented | Unified history remains available in Work; desktop acceptance outstanding |
| 11 | Project lifecycle | implemented | Create, rename, collapse and non-destructive deletion/ungroup; desktop acceptance outstanding |
| 12 | Project names, icons, collapsible groups | implemented | Name/icon edit and persistent collapse; desktop acceptance outstanding |
| 13 | Chat and Work creation in projects | implemented | Scoped Chat/Work creation and voice-first realtime binding; desktop acceptance outstanding |
| 14 | Move chats between project scopes | implemented | Chat/Work and finished voice archive moves preserve their identities; focused CI succeeded on 6915398; dependency-backed and desktop acceptance pending |
| 15 | Project instructions, context, and files | implemented | Scoped context and local rich-document extraction passed dependency-backed checks on b37d1076; new PDF/XLSX explicit-save fixtures and installed-app acceptance pending |
| 16 | Future project-agent relationship | implemented | Optional inert `agent_id` metadata is present and round-trip tested; no agent system added |
| 17 | Native visual component library | implemented | Native cards/tables/charts/diagrams/checklists/progress/calculators/input; focused schema fixtures, runtime acceptance pending |
| 18 | Structured response schema | implemented | Versioned galen-ui envelope and bounded allow-list parser with fixtures |
| 19 | Safe renderer and Markdown fallback | implemented | Allow-listed renderer and fallback; scripts disabled in chat HTML previews; runtime safety acceptance outstanding |
| 20 | Provider/model instructions and examples | implemented | 18 real-adapter fake-transport scenarios passed on b37d1076; six additional Responses API fixtures pending exact CI; no live model accounts exercised |
| 21 | Safe interactions and state | implemented | Message-scoped local checklist, choice and calculator state; no tool execution |
| 22 | Streaming validation and recovery | implemented | Partial streaming fence and completed malformed/truncated fallback; provider streaming acceptance remains |
| 23 | Metadata-only marketplace catalog | implemented | Metadata-only SQLite catalog service and focused API tests; deployment pending |
| 24 | Catalog API and Galen client | implemented | Versioned API, paged client, offline cache and panel; deployment and end-to-end acceptance remain |
| 25 | GitHub metadata and icons | implemented | Commit-pinned icon metadata and bounded raster normalization; runtime acceptance remains |
| 26 | Direct GitHub installation | implemented | Direct GitHub download, verification and explicit native registration; real endpoint acceptance remains |
| 27 | Direct updates and local removal | implemented | Verified update and uninstall, ownership checks, quarantine and recovery; runtime acceptance remains |
| 28 | Publish by repository link | blocked | Submission API/UI and tests exist; real auth/HTTPS acceptance blocked by insufficient disk on both audited hosts |
| 29 | Unified extension manifest | implemented | Strict versioned manifest and archive parser for declarative plugins and skills; fixtures added |
| 30 | Moderation and safe installation | implemented | Moderation, declared file hash checks, bounded archive and explicit native install consent; real endpoint acceptance remains |

Summary: 0 verified, 28 implemented, 1 in progress, 0 not started, 1 blocked. Implementation coverage: 28/30 (93.3%). Full release acceptance remains pending.

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

## GLNT lifecycle safety checkpoint

- Skill staging and previous versions now live outside the recursively scanned skills directory; nested skill entry points are refused, updates recheck ownership and local file hashes before publishing. Previous versions are retained in `.glnt-recovery` for manual recovery.
- GLNT uninstall requires explicit consent, verifies source ownership, delegates plugin revocation to the existing native manager, and quarantines skill directories intact outside the scanner (including local edits). UI retains the archive receipt while an extension is installed. Added focused quarantine and endpoint fixtures. Live registry acceptance remains pending.

## Voice call project scope

- Captures history and project briefing together at realtime/live call startup; per-call instructions survive reconnects and are passed to delegated brain turns via a task-local parameter. Explicit resume seeds without proven project association receive no project briefing. A first-turn mirror uses its captured binding, not a different chat selected mid-call; a moved or deleted captured conversation is not redirected to an unrelated chat. Classic pipeline and complete voice integration regression remain outstanding.

## Candidate verification checkpoint

- Source commit `7019e59` passed the focused workflow [45630092334](https://github.com/Qrayyt/Galen/actions/runs/45630092334). Subsequent commits add safe uninstall and scoped voice runtime; their checks are pending.
- `971ad4f` validates declared file digests against GitHub's pinned blobs before catalog admission, bounds total package size, rejects nested skills at manifest admission, checks icon MIME, clears stale explicit voice history on new bindings and adds regression fixtures for captured voice scope and first-turn routing.
- Candidate workflow: changed-source frontend tests, focused backend checks, dependency-backed chat/voice/migration regression, then Windows packaging from the exact candidate SHA. The installer is uploaded as an Actions artifact only; no release, tag, updater marker or production deployment is changed. Running-desktop acceptance remains required.
- Remaining constraints: classic speech-pipeline project briefing and full voice archive search/assignment; CLI mode conversion without losing vendor handles; rich document support; all-provider/locale acceptance; live GLNT endpoint and publisher authorization; interactive desktop smoke. Do not mark the release verified until actual acceptance evidence exists.

- Blank ordinary-chat text and its selected project now persist across a WebView restart. An explicit New Chat clears the previous blank draft before choosing another scope; Work and ephemeral side-pane blank drafts remain isolated. Focused restoration fixture added. Candidate artifact workflow started on the preceding checkpoint; this later source revision requires its own checks.

### Regression evidence and candidate handoff

- Windows candidate preflight [45631328255](https://github.com/Qrayyt/Galen/actions/runs/45631328255), source `96683338`: backend succeeded with 44 isolated tests and 142 dependency-backed regression tests (chat, voice mirror, projects, mode switching, history and migration). Frontend changed-source regression and Windows packaging have not yet completed.
- Focused checks [45631328229](https://github.com/Qrayyt/Galen/actions/runs/45631328229), source `96683338`: backend and frontend jobs succeeded, including production frontend build.
- Latest blank-draft change `1535f94` has its own queued focused check. Candidate marker updated to exercise this exact revision too; do not treat an older installer as a build of the newer code.
- Rollback: keep the currently published Preview 5 unchanged. Before testing an installer, back up the entire local Galen data directory with the app stopped, including SQLite databases and their sidecars. If reverting the application, restore the backup made by the matching application version; do not assume an older binary can interpret every newer state field. GLNT prior skill versions and removed skills are retained outside the active skill directory. No production server modifications, release publication or user database changes occurred in this session.
- Open acceptance work remains in the status table; no completed desktop smoke or live GLNT deployment is asserted. CLI-bound mode changes intentionally refuse transitions that would discard provider conversation handles.

## Full frontend regression repair (2026-11-25)

- Audited branch head `13645a24`; focused checks [45632070471](https://github.com/Qrayyt/Galen/actions/runs/45632070471) succeeded. Windows candidate [45632070591](https://github.com/Qrayyt/Galen/actions/runs/45632070591) backend passed; frontend had 6,440 passing and four failing tests (604 files); Windows packaging was skipped.
- Corrected the marketplace back-button test to scope its query to the entry page rather than the separate GLNT catalog button; aligned caption and quick-switch assertions with the Work navigation, retaining legacy search aliases; isolated durable composer draft storage between independent test fixtures without changing application persistence.
- Candidate marker will be advanced to this repair and the exact new source will require CI evidence. No tests skipped and no acceptance status promoted; no release or server change.

## Work secondary labels checkpoint

- Updated mode-specific user-facing labels in six primary dictionaries and the audited nested custom CLI, computers, onboarding, self-build and society dictionaries. Kept compatibility keys and provider handles unchanged. Added a six-locale fixture for secondary labels.
- Task 7 remains in progress pending CI and accessibility acceptance. The candidate marker is advanced; the source of the resulting workflow is the actual pushed SHA. No release or server changes.

## Native UI stream safety and provider-text fixture checkpoint

- Native UI now proves closure of its own Markdown node before exposing controls, including nested quoted fences. Strict native charts reject undeclared nested properties; duplicate option labels are rejected to avoid ambiguous restored state. Added parser and rendered streaming fixtures, including message-specific state restoration and malformed source fallback. Updated the native UI contract to reflect actual persisted state.
- Fixtures represent normalized provider text chunk boundaries, not live provider API integrations. Tasks 20 and 22 still require representative provider/runtime acceptance; no status promoted without CI.

## Full regression follow-up

- Windows candidate [45637491642](https://github.com/Qrayyt/Galen/actions/runs/45637491642) on `7931080` succeeded (backend, frontend, Windows packaging). Latest focused checks [45638183943](https://github.com/Qrayyt/Galen/actions/runs/45638183943) on `a697614` succeeded. Full candidate [45638184039](https://github.com/Qrayyt/Galen/actions/runs/45638184039) passed backend but 12 frontend assertions in four files still expected old IDE labels (6,572 tests passed). Updated those assertions to the actual Work labels; no functional assertions removed or tests skipped. Windows packaging of the latest revision remains pending.

## Voice archive search implementation

- Added a local paginated voice search route over normalized archived transcripts and cached titles, including realtime captions; no new title generation, external model requests, or project changes. Sidebar now searches Chat, Work and voice archives with one abortable query and opens archived results using their original voice identity. Added backend and frontend focused fixtures. Task 4 pending CI and large-history performance acceptance.

## Voice archive project association checkpoint

- Risk: a voice archive association must not rewrite recordings, discard transcripts, or apply a different project's instructions to a running call. Safeguards: separate additive link table in chats.db with cascading unlink on project removal; only finished archives can move and active voice calls block movement. Runtime resolves an archive's project from its durable association per newly captured call, and discards stale explicit seeds upon rebinding. The sidebar exposes a confirmed move for archives, preserving voice identity; search and history include project metadata.
- Added route and scoped archive seed fixtures. Task 14 remains pending CI; classic pipeline and direct explicit-seed path still need acceptance. No release/server changes.

## Classic voice scoped context implementation

- Captured caller-owned history and project briefing for classic speech and push-to-talk. Streaming, nonstreaming, buffered completion and local spoken briefs use the call-owned scope; no fallback to shared history on a supported brain. Realtime-to-classic fallback reuses one pinned call seed rather than a newer selection. Scope is released on call teardown. Project-scoped brain turns also opt out of automatic global-memory curation to prevent private response data becoming shared memory.
- Added focused seed, stream and classic context fixtures and included them in candidate backend regression. This is not yet a verified hardware microphone / real provider scenario. Tasks 5 and 15 still require integration acceptance; rich binary document ingestion is not included in this change.

## GLNT deployment preflight and isolated packaging

- Authorized read-only Moscow inventory: no GLNT container, port 8768 unused, nginx configuration test passed, current Galen HTTPS returned 200, TLS valid until 2027-02-22. Docker available. Root filesystem 97% used (483 MiB free). Amsterdam root filesystem 93% used (1.1 GiB free). Both fail the conservative 2 GiB free-space prerequisite for a new image/build. No production service, credentials, DNS, website or nginx config changed; no cleanup or paid provisioning performed.
- Added a minimal isolated catalog image build, scratch container smoke, restricted nginx locations/rate limits and a deployment/rollback runbook. CI now verifies the standalone catalog image with no desktop dependencies. Repository verification has an overall deadline and a bounded concurrency gate. The default desktop catalog URL remains empty until live HTTPS acceptance.
- Deployment and real publisher authorization remain blocked by host capacity and live acceptance. Task 28 remains in progress; implementation and mocked tests are not a production deployment.

## Project rich document import

- Reused the local hardened document extractor for PDF, DOCX, XLSX, PPTX, OpenDocument, RTF and EPUB. Explicitly selected files are streamed to a bounded local preview route (8 MiB), parsed off the event loop, and never stored as binaries or sent to a model by extraction. The existing validated project-text snapshot limits and Save boundary remain unchanged. Unreadable or oversized documents are rejected, not silently truncated. The editor prevents switching project edits while extraction is pending.
- Added route tests for local parsing, rejection and no persistence, and a sidebar confirmation fixture. Task 15 remains pending candidate CI and actual desktop acceptance.

## Candidate installation and evidence checkpoint

- Focused runs [45655931490](https://github.com/Qrayyt/Galen/actions/runs/45655931490), [45656114203](https://github.com/Qrayyt/Galen/actions/runs/45656114203), and [45656786788](https://github.com/Qrayyt/Galen/actions/runs/45656786788) succeeded on 08b1c6a, 299daf8, and 6915398 respectively. Candidate [45655931560](https://github.com/Qrayyt/Galen/actions/runs/45655931560) backend and frontend jobs succeeded; Windows packaging was still in progress at inspection. Later source needs its own results.
- Added an installed-package gate on GitHub-hosted Windows: fresh silent install, installed executable presence and CLI version, same-version reinstall, uninstall, and synthetic profile sentinel preservation. Logs and result are saved independently of the candidate artifact. The test refuses non-hosted runners and pre-existing profiles. It is not an interactive desktop smoke or a previous-version migration test; neither is claimed complete.
- Remaining: latest candidate checks, provider/runtime and interactive desktop acceptance, safe CLI-bound conversion, legacy migration acceptance, and live GLNT deployment/publisher authorization after storage capacity is resolved. No release published.

## Installed candidate UI acceptance harness

- Added a separate Windows job downstream of the installer/reinstall/uninstall gate. It installs the actual candidate on a separate disposable runner, boots its frozen CLI server with an isolated scratch profile, creates separate Chat/Work sessions and project data, opens the packaged frontend in Chromium, toggles the project group, restarts, checks persistent draft/state/metadata and safe ungrouping. No live model calls or real accounts. Reports and screenshots upload even on failure.
- This is installed-package browser/UI smoke, not native WebView, microphone or vendor CLI acceptance. Requires successful results on exact candidate. No release or server changes.

## Native UI provider adapter regression

- Extended native UI model guidance with matching-fence rules, JSON/option constraints, a concrete checklist example and plain-Markdown preference. Added 18 deterministic adapter scenarios over actual OpenAI-compatible, Anthropic and Gemini code paths (single-character, mixed and whole-answer fragments, complete and truncated). Fake SDK events exercise the real normalization, not live accounts; tests assert exact text, prompt delivery and absence of tool calls. Added prompt-example contract tests and included both suites in dependency-backed candidate CI. Task 20 remains in progress until CI results are available.

## Private project automatic-learning safeguards

- Added sticky SQLite privacy flags for project-associated text and agent histories, retained after ungrouping. Automatic typed learning, self-building, proactive cues, archive backfill and global episode recording exclude these histories. Captured scoped voice calls are excluded from voice-event learning by call ID. Local history/checkpoints and explicit memory actions remain available.
- Added restart/detach and learning-loop regression tests and included the learning suite in candidate CI. Existing memories are not purged; previously ungrouped histories with no recorded association cannot be inferred retrospectively. Full candidate acceptance remains pending.

## Continuation audit and additional acceptance coverage

- Reconciled the previous handoff (`b37d1076`) with actual branch head `8b88b53f`. Focused CI [45659358541](https://github.com/Qrayyt/Galen/actions/runs/45659358541) succeeded (backend, frontend build, isolated catalog container). Candidate [45659138998](https://github.com/Qrayyt/Galen/actions/runs/45659138998) at `b37d1076` passed dependency-backed backend and frontend jobs; Windows packaging was in progress. Older candidate [45655931560](https://github.com/Qrayyt/Galen/actions/runs/45655931560) completed all three jobs successfully; it is not evidence for the latest SHA.
- Added a real Preview 5 SQLite schema fixture for legacy Work resume/identity/events, idempotence, existing migration marker and database integrity; added PDF/XLSX route tests for local preview, type mismatch, explicit save and isolated deletion; added six OpenAI Responses API event-parity fixtures including truncated and whole-answer output. These tests are awaiting exact-commit CI. No task marked verified or implemented solely on the basis of unexecuted tests.
- Candidate marker updated to exercise the complete regression and installed UI gates for the new commit. No publication, server changes or storage cleanup. Task 28 remains blocked by host storage capacity; do not attempt deployment until the user confirms space is available.

## Durable archived voice privacy

- Fixed a gap in the previous privacy checkpoint: removing a voice archive from a project (including deleting the project) removed the association, so a later call continued from the archive could enter global automatic learning. Added an additive, idempotent opaque-ID provenance table, backfilled currently linked archives, and captured private continuations at call start. This stores no old project identifier, transcript or recording. Unrelated calls remain eligible for normal learning. Added detach/delete/restart regression coverage. Historical archives detached before this migration cannot be identified retroactively.
- Exact candidate CI still pending. Task 5 remains in progress until the dependency-backed checks pass; task 28 unchanged. No servers or release markers touched (only the no-publication candidate marker).

## Reconciled implementation status and CI evidence

- Candidate [45659138998](https://github.com/Qrayyt/Galen/actions/runs/45659138998) on `b37d1076` passed 44 focused tests (1 warning) and 190 dependency-backed tests, including the existing migration, restart, project-context and three-provider native UI suites. Frontend tests and build succeeded. Marked tasks 6, 15 and 20 implemented (not verified); additional exact-candidate coverage remains pending.
- Latest code candidate `e57a65a4`: [focused checks 45662739684](https://github.com/Qrayyt/Galen/actions/runs/45662739684), [Windows candidate 45662739601](https://github.com/Qrayyt/Galen/actions/runs/45662739601), both pending at this checkpoint. The previous Windows run still occupied the concurrency slot; superseded pending run 45662518247 was cancelled by GitHub. Do not count a cancelled or older run as current acceptance.
- Next: inspect the exact-candidate backend/installer/UI results; resolve any failures; complete task 5 only with evidence; run actual native desktop/provider acceptance before publishing. Task 28 remains blocked and intentionally untouched by user request. No storage cleanup, production deployment, release or live API call. This documentation-only commit does not need a new candidate build.
