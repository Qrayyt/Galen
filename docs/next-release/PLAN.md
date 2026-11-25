# Galen Next Release Plan

## Purpose

This release turns Galen into one coherent workspace where ordinary conversations,
Work conversations, projects, generative UI, and the GLNT marketplace share a safe,
migratable foundation. Existing settings, updater behavior, operating-system support,
and released features must remain intact.

## Baseline and delivery rules

- Development branch: `feat/galen-next-release`.
- Baseline branch: `v1.0.0`.
- Baseline commit: `e222545822e19ad867e52e0dd13b945a02326d49`.
- Delivery order: audit, chats, Work, projects, generative UI, marketplace,
  integration and migration tests, regression tests, Windows build.
- Work is delivered in small, meaningful commits and pushed after each completed block.
- `PROGRESS.md` is updated after every stage and before every risky action.
- A task can be marked **implemented** only when its code and focused tests exist.
- A task can be marked **verified** only after its acceptance criteria have been exercised.
- No unverified release will be published.

## Definition of done for the release

1. Every task below is implemented or explicitly documented as blocked with evidence.
2. Existing user data migrates without loss and rollback behavior is documented.
3. Chat and Work user journeys are exercised in the running desktop application.
4. Frontend tests, backend tests, integration tests, migration tests, and regressions pass.
5. A Windows installer is built and its critical installed-app flows are smoke-tested.
6. Security boundaries prevent model-supplied JavaScript or HTML execution and require
   informed consent before third-party extension code can run.

## 1. Unified chat system

### 1. Multi-session ordinary chats

**Acceptance criteria**

- Users can create and switch among multiple ordinary chats without entering Work mode.
- Concurrent chats keep distinct identifiers, messages, drafts, model selections, and run state.
- Switching chats never leaks messages or pending output between sessions.

### 2. Unified history sidebar

**Acceptance criteria**

- A single sidebar shows project groups and recent chats in Galen's existing visual language.
- Ordinary and Work chats appear in the same navigation hierarchy.
- The sidebar remains usable at supported desktop window sizes and with keyboard navigation.

### 3. Chat lifecycle and durable history

**Acceptance criteria**

- Users can create, automatically title, rename, and delete chats.
- Messages and relevant chat metadata survive application restart.
- Delete requires an intentional user action and removes or tombstones all chat-owned data safely.
- Automatic title failure falls back to a deterministic local title without losing the chat.

### 4. Chat search

**Acceptance criteria**

- Search matches chat titles and message text with predictable case-insensitive behavior.
- Results open the correct chat and identify useful matching context.
- Search remains responsive for a realistically large local history and has an empty state.

### 5. Isolated chat context with shared global memory

**Acceptance criteria**

- Model context for a turn contains only the selected chat's history plus explicitly shared memory.
- Global memory remains available across chats according to existing privacy controls.
- Tests prove that private content from one chat is not injected into another chat accidentally.

### 6. Restart restore and lossless migration

**Acceptance criteria**

- The last open chat, its mode, draft, sidebar state, and safe resumable state restore after restart.
- Existing Galen chat and IDE data migrates automatically to the new schema without loss.
- Migration is versioned, idempotent, covered by fixtures, and preserves an actionable recovery path.

## 2. Chat and Work convergence

### 7. Rename IDE to Work in the user interface

**Acceptance criteria**

- User-facing IDE labels are replaced by Work where they describe the mode.
- Internal compatibility identifiers may remain only where changing them would break stored data or APIs.
- Locales, accessibility labels, documentation surfaced in-app, and tests use the new name.

### 8. Remove separate top-level Chat and IDE tabs

**Acceptance criteria**

- The primary app shell no longer divides Chat and IDE into separate top navigation destinations.
- Existing IDE entry points redirect or migrate to the associated Work chat.
- No existing file, terminal, project, tool, or agentic capability becomes unreachable.

### 9. Select and persist mode inside each chat

**Acceptance criteria**

- Chat or Work mode is selected from within the active conversation.
- Mode belongs to the chat and persists across switching and application restart.
- Mode transitions clearly explain capability changes and do not discard conversation data.

### 10. One history for Chat and Work while preserving Work capabilities

**Acceptance criteria**

- Ordinary and Work chats use one history and lifecycle implementation.
- Work chats retain files, terminal, project workspace, approvals, tools, and existing IDE behavior.
- Regression tests cover resumed Work sessions and ordinary chats in the same installation.

## 3. Projects

### 11. Project lifecycle

**Acceptance criteria**

- Users can create, edit, and delete projects.
- Deleting a project offers an explicit safe disposition for its chats and files.
- Project metadata survives restart and is included in migrations and backups where applicable.

### 12. Project names, icons, and collapsible sidebar groups

**Acceptance criteria**

- Projects support validated names and icons with accessible fallbacks.
- Project groups expand and collapse independently, and that state persists.
- Long names, missing icons, and duplicate names render predictably.

### 13. Create Chat and Work conversations inside a project

**Acceptance criteria**

- New chats can be created directly inside a project in either mode.
- The created chat inherits only the intended project context and records its project association.
- Creation works from both the sidebar and the project's main view.

### 14. Move chats into, between, and out of projects

**Acceptance criteria**

- Existing chats can be moved to a project, between projects, or back to ungrouped history.
- Moving preserves messages, attachments, mode, and safe Work state.
- The user receives a clear warning when a move changes available project context or files.

### 15. Shared project instructions, context, and files with isolation

**Acceptance criteria**

- Each project can hold shared instructions, context, and files used by its chats.
- Project resources are never injected into chats outside that project.
- Permission, size, deletion, and missing-file behavior are explicit and tested.

### 16. Future project-agent relationship in the data model

**Acceptance criteria**

- The schema includes an optional, inert agent association or compatible extension point.
- No agent assignment UI or autonomous agent system is implemented in this release.
- Migration and serialization tolerate absent, unknown, or future agent identifiers.

## 4. Generative UI

### 17. Native Galen visual component library

**Acceptance criteria**

- Galen provides native cards, tables, charts, diagrams, checklists, progress displays,
  calculators, and input controls consistent with its existing design system.
- Components are accessible, responsive, theme-aware, and render useful empty/error states.
- Components share a documented, versioned data contract.

### 18. Structured response format and schema

**Acceptance criteria**

- A versioned schema can represent mixed Markdown and supported UI components.
- Schema limits depth, size, allowed properties, actions, and data types.
- Representative valid and invalid fixtures are covered by tests.

### 19. Safe renderer with Markdown fallback

**Acceptance criteria**

- The renderer accepts only allow-listed native components and sanitized content.
- Unknown, invalid, or unsupported payloads degrade to readable Markdown or an explicit error card.
- Model-supplied JavaScript, arbitrary HTML, event handlers, and remote executable content never run.

### 20. Provider- and model-agnostic instructions and examples

**Acceptance criteria**

- System guidance teaches supported providers/models when structured UI improves the answer.
- Guidance also teaches when plain Markdown is preferable and how to recover from schema failure.
- Compatibility tests cover representative streaming and non-streaming provider response shapes.
- Any earlier library choice is used only if it is recovered from repository evidence; none is invented.

### 21. Safe interaction and persisted component state

**Acceptance criteria**

- Components expose only predefined safe actions such as local selection, submit, copy, or approved tool intent.
- Actions validate payloads and pass through existing permission/approval boundaries.
- Component state persists only when necessary, is scoped to its message/chat, and restores safely.

### 22. Streaming, validation, and damaged-response recovery

**Acceptance criteria**

- Partial structured output renders progressively without executing incomplete actions.
- Incremental and final validation handle truncated, malformed, reordered, or oversized payloads.
- Recovery never loses already valid text and provides observable diagnostics without secrets.

## 5. GLNT Marketplace

### 23. Metadata-only centralized catalog

**Acceptance criteria**

- The Galenite server stores catalog metadata only: name, description, author, type,
  GitHub icon URL, repository URL, version, category, moderation status, and optional statistics.
- Extension packages and release files are not stored or proxied by the catalog server.
- Catalog records retain provenance and moderation/audit timestamps without secrets.

### 24. Catalog API and Galen client integration

**Acceptance criteria**

- Existing infrastructure and authorized access are audited before server changes.
- A versioned API supports listing, filtering, detail lookup, and publication submission.
- The Galen client handles pagination, offline/error states, caching, and incompatible API versions.

### 25. GitHub metadata and icon retrieval

**Acceptance criteria**

- Metadata and icons are derived from explicit GitHub repository/release sources.
- URLs, content types, sizes, redirects, and rate-limit failures are validated and handled safely.
- Stale or missing GitHub data does not corrupt the catalog and has a visible fallback.

### 26. Direct local installation from GitHub

**Acceptance criteria**

- Galen downloads an approved repository archive or release asset directly from GitHub.
- The catalog server never proxies package bytes.
- Download source, selected version, integrity evidence, and installation result are visible to the user.

### 27. Direct GitHub updates and local removal

**Acceptance criteria**

- Galen can detect and install compatible updates directly from GitHub.
- Users can remove an extension and its executable payload while preserving or explicitly deleting user data.
- Failed updates roll back to the last working version and do not leave partially active code.

### 28. Publish plugins and skills by repository link

**Acceptance criteria**

- Users can submit a GitHub repository URL for a plugin or skill through the existing publication flow.
- The flow extracts manifest metadata, reports validation errors, and records a moderation submission.
- Resubmission and ownership/update behavior are explicit and auditable.

### 29. Unified compatible extension manifest

**Acceptance criteria**

- One versioned manifest format covers plugins and skills with type-specific sections.
- It declares identity, version, compatibility, entry points, permissions, source, and integrity metadata.
- Parser tests cover supported versions, forward compatibility, malformed manifests, and path traversal attempts.

### 30. Moderation, compatibility, permissions, safe extraction, and consent

**Acceptance criteria**

- Publication validates repository structure, manifest, compatibility, declared permissions, and prohibited files.
- Archive extraction rejects traversal, links/redirects outside the destination, decompression bombs,
  unsafe filenames, and unexpected executable content.
- The user sees source, publisher, version, permissions, and risk before installation or update.
- Third-party code cannot execute until the user gives explicit informed consent.

## Verification matrix

| Area | Required evidence |
| --- | --- |
| Data | Versioned migration fixtures, idempotence, legacy data preservation, restart restore |
| Chat | Multi-chat isolation, lifecycle, search, titles, shared-memory boundary |
| Work | Mode persistence, files, terminal, projects, tools, approvals, session resume |
| Projects | CRUD, movement, isolation, project files/instructions, future agent field |
| Generative UI | Schema fixtures, sanitization, streaming recovery, interaction permissions, accessibility |
| Marketplace | API contract, GitHub direct download, manifest parser, safe extraction, rollback, consent |
| Regression | Settings, updater, released features, supported operating systems |
| Release candidate | Running desktop scenarios and verified Windows installer; no automatic publication |
