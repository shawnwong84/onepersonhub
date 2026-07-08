# Roadmap 4: Reporter Chatbot, RBAC Matrix, Core Modules, and Mobile

## Objective

Turn the Reporter Agent into a permission-aware chatbot with a proactive heartbeat, make Customer Care a core (always-on) module, enforce a full RBAC matrix where members only reach their assigned modules, conversations, and tickets, and make the whole product usable on a phone.

> Anyone in the team can ask the Reporter Agent a question about the modules they are assigned to, and the Reporter Agent tells them — unprompted — when something in those modules needs attention.

## Design Decisions (locked)

- **Identity**: `TeamMember` becomes the login identity (username/password + RBAC role). The `Admin` model remains only for the initial owner account.
- **Chatbot placement**: floating chat widget on every dashboard page, plus a dedicated `/reporter` chat page with history and the heartbeat report feed.
- **Heartbeat delivery**: proactive chatbot messages to users with access to the affected module, in-app notifications for high severity, email for critical severity only.
- **Mobile**: responsive retrofit of the existing pages with a bottom tab bar on small screens (Home, Inbox, Modules, Reporter, More). One codebase, no separate mobile routes.
- **Core modules**: `customer-care` and `reporter-agent` are core — seeded as installed, cannot be uninstalled or disabled. (Reporter Agent is core because the chatbot and heartbeat are platform capabilities.)

## Current State (verified against code)

- Two identity systems exist: `Admin` (login, `role` string) and `TeamMember` (directory only, no credentials). RBAC (`src/lib/rbac.ts`) is role-based (`viewer < agent < supervisor < admin`) with no per-resource assignment scoping.
- `Ticket.assignedTo` → TeamMember exists; conversation assignment endpoint exists (`/api/conversations/[id]/assignment`).
- Reporter Agent scan logic exists (`src/lib/reporter-agent.ts`) with signal collectors and LLM analysis, triggered manually via `POST /api/modules/reporter-agent/scan`.
- Module workspaces, marketplace, workspace config, and module APIs are complete (Roadmap 3).
- AI engine (`src/lib/ai/engine.ts`) has provider config, token usage logging, and budget settings to reuse for the chatbot.
- Background job machinery exists (`WorkflowJob` model + `/api/workflow-jobs/process`).
- Sidebar is desktop-only (`w-60`/`w-16` fixed); no responsive layout below `lg`.

## Phase 1: Unified Identity and Member Login

Goal: team members can log in, and every session knows exactly who the user is and what role they hold.

- [x] Extend `TeamMember` model:
  - [x] `username` (unique, nullable until credentials issued)
  - [x] `password` (bcrypt hash, nullable)
  - [x] `rbacRole` (`viewer | agent | supervisor | admin`)
  - [x] `isActive`
  - [x] `lastLoginAt`
- [x] Migration for the new columns (`20260708090000_add_team_member_login`).
- [x] Login route accepts both Admin (owner) and TeamMember credentials; JWT carries `userId`, `userType` (`owner | member`), and `role`.
- [x] `requireAuth` / session helpers expose the resolved identity to every route; member permission checks use the live role, so role changes apply without re-login.
- [x] Team page: issue/reset member credentials (key icon per row), set RBAC role, deactivate member.
- [x] Deactivated members cannot log in; existing sessions are rejected on the next request.
- [x] Activity log entries: member credential issued/updated, member login, member deactivated.
- [x] Password hashes are stripped from every API response via a global Prisma omit (login opts back in explicitly).

Acceptance criteria:

- [x] A member can log in with their own username and password. (Verified in browser: agent member logged in, `userType: member`.)
- [x] The owner account continues to work unchanged.
- [x] Deactivating a member locks them out immediately. (Verified: live session got 401 right after deactivation.)

## Phase 2: Assignment Data Model

Goal: record which modules, conversations, and tickets each member is responsible for.

- [x] Add `ModuleAssignment` model:
  - [x] `id`, `teamMemberId`, `moduleSlug`, `access` (`read | write`), `assignedBy`, `createdAt`
  - [x] Unique on (`teamMemberId`, `moduleSlug`); indexes on both columns.
- [x] Add `Conversation.assignedToId` → TeamMember, with backfill from the metadata JSON the assignment endpoint used to write; the endpoint now writes both.
- [x] Reuse existing `Ticket.assignedTo`.
- [x] Assignment APIs:
  - [x] `GET/POST/DELETE /api/team/members/[id]/modules` (admin `team:update`; validates slug against the catalog; invalid access levels fall back to read).
  - [x] Conversation assignment enforces `conversations:assign`; ticket assignment continues under `tickets:update`.
- [x] Activity log entries for every assignment change (who assigned what to whom).

Acceptance criteria:

- [x] Admin can assign and revoke module access per member.
- [x] Assignments survive module disable/re-enable and are removed on uninstall (marketplace uninstall deletes the module's assignments).

## Phase 3: RBAC Permission Matrix and Enforcement

Goal: members see and touch only what they are assigned; the matrix is explicit and auditable.

Scoping rule: `admin` and `supervisor` see everything. `agent` and `viewer` see only assigned modules, assigned conversations, and assigned tickets. Core modules (Phase 4) are visible to everyone with module read permission.

- [x] Add scoping helpers in `src/lib/rbac-scope.ts` (separate from the pure `rbac.ts`):
  - [x] `getAccessibleModuleSlugs(user)` — all slugs for owner/supervisor+, assigned slugs (plus core) for agent/viewer.
  - [x] `canAccessModule(user, slug, "read" | "write")` — write requires a write assignment; core modules are read-only without one.
  - [x] `conversationScope(user)` / `ticketScope(user)` — inject `assignedToId` filters for agent/viewer.
  - [x] `module:write` role permission extended to agents; the assignment layer limits which module.
- [x] Enforce in APIs:
  - [x] `/api/modules/[slug]/records*` and `/api/modules/signals*` — 403 outside accessible modules; write requires `write` access.
  - [x] `/api/conversations*` list and detail — scoped for agent/viewer (detail returns 403 when not assigned).
  - [x] `/api/tickets*` list and detail — scoped for agent/viewer.
  - [x] `/api/marketplace/modules` list filtered to accessible modules for scoped users; `[slug]` detail guarded; install stays admin.
  - [x] `/api/modules/export` respects the same scope.
- [x] Enforce in UI:
  - [x] Sidebar Modules section lists only accessible modules (server-filtered marketplace API).
  - [x] Module workspace shows a friendly no-access state on direct URL access.
  - [x] Conversations and tickets lists show only scoped rows for agent/viewer.
- [x] Permission matrix admin page (`/team/permissions`, linked from the Team page):
  - [x] Grid: members × installed modules, click to cycle none → read → write; core modules marked.
  - [x] Full-access member list (supervisors/admins).
  - [x] Role summary table showing what each RBAC role can do (live from `PERMISSIONS`).
- [x] The matrix page shows the live role × permission table (in-app instead of duplicated in this file).
- [x] Activity log entries for denied module access attempts (throttled to once per user/module/level per hour).

Acceptance criteria:

- [x] An agent assigned only to Orders cannot list, read, or write Inventory/Finance records via UI or API. (Verified: finance read 403, orders read 200; orders write 403 with read assignment, 201 after write upgrade.)
- [x] An agent sees only conversations and tickets assigned to them. (Verified: list returned 1 assigned conversation; unassigned detail 403.)
- [x] Supervisor and admin behavior is unchanged.
- [x] The matrix page shows the live truth of who can reach what.

## Phase 4: Core Modules

Goal: Customer Care and Reporter Agent are part of the product, not optional installs.

- [x] `CORE_MODULE_SLUGS` in the marketplace catalog (`customer-care`, `reporter-agent`); APIs expose `isCore` per module.
- [x] Core modules always report installed+enabled in the marketplace APIs; `getInstalledModule` auto-creates them on first access and heals legacy rows that say uninstalled.
- [x] Marketplace UI: core modules show a "Core" badge; uninstall and disable actions are hidden.
- [x] Marketplace API: reject `uninstall`/`disable` for core modules with a clear error.
- [x] Core modules are visible to every logged-in user regardless of assignments (read); write still needs assignment or supervisor+ (delivered in Phase 3 scoping).
- [x] Dependency checks: uninstalling any module keeps core module data intact (uninstall only touches the target module's rows).

Acceptance criteria:

- [x] Fresh setup lands with Customer Care and Reporter Agent ready to use.
- [x] No user, including admin, can uninstall or disable a core module. (Verified: API returns 400 "core module", UI hides the buttons.)

## Phase 5: Reporter Agent Chatbot

Goal: anyone can ask the Reporter Agent questions about their modules, in natural language.

Data model:

- [ ] `ReporterChatThread`: `id`, `teamMemberId` (or owner), `title`, `createdAt`, `updatedAt`.
- [ ] `ReporterChatMessage`: `id`, `threadId`, `role` (`user | reporter`), `content`, `metadata` (referenced records/signals), `createdAt`.

API:

- [ ] `GET /api/reporter/threads` and `GET /api/reporter/threads/[id]/messages` — own threads only.
- [ ] `POST /api/reporter/chat` — question in, grounded answer out:
  - [ ] Resolve the user's accessible modules via `getAccessibleModuleSlugs`.
  - [ ] Retrieval tools the LLM can use, all filtered to accessible modules: query module records, open signals, module analytics, scoped tickets/conversations counts.
  - [ ] Questions about unassigned modules get a polite refusal naming the modules the user *can* ask about.
  - [ ] Reuse the AI engine provider config, token usage logging, and budget guard.
  - [ ] Every answer cites the records/signals it used (ids in `metadata`, links in UI).

UI:

- [ ] Floating chat widget (bottom-right) on all dashboard pages: last thread, quick ask, unread badge for heartbeat messages.
- [ ] `/reporter` page: full chat history, thread list, heartbeat report feed, and the existing scan/records workspace linked from it.
- [ ] Answers render record/signal links that deep-link to module workspaces.
- [ ] Loading/streaming state; errors surface in-thread.

Permissions:

- [ ] Chat available to every authenticated user (core module read).
- [ ] Retrieval layer is the enforcement point — the model never sees data outside the user's scope (not just a prompt instruction).
- [ ] Activity log entry per chat exchange (user, modules touched, token usage).

Acceptance criteria:

- [ ] An agent assigned to Orders can ask "which orders are waiting for approval?" and get a grounded, linked answer.
- [ ] The same agent asking about Inventory is refused and told which modules they can ask about.
- [ ] Chat answers cite the module records they are based on.
- [ ] Token usage from chat appears in the token usage page.

## Phase 6: Heartbeat

Goal: the Reporter Agent notices issues on its own and tells the right people.

- [ ] Heartbeat scheduler:
  - [ ] Interval-based background execution reusing the existing job machinery (`WorkflowJob` runner) — configurable frequency (default 15 min).
  - [ ] Each beat runs the signal collectors (`runReporterAgentScan`) in delta mode: only signals new or escalated since the last beat are reported.
  - [ ] Beat results stored as reporter records (existing `report`/`alert` record types).
- [ ] Delivery routing per finding, based on the affected module's assignees:
  - [ ] Proactive chatbot message in each affected user's thread (all severities).
  - [ ] In-app notification (existing notification center) for high and urgent severity.
  - [ ] Email to configured recipients for critical severity only (reuse email channel settings).
  - [ ] Supervisors and admins receive everything.
- [ ] Dedupe: an unresolved signal is reported once, re-reported only on severity escalation.
- [ ] Heartbeat configuration UI (on `/reporter` or module config):
  - [ ] Frequency, severity thresholds per delivery channel, quiet hours, enable/disable.
- [ ] Activity log entries: heartbeat ran, findings delivered, delivery failures.

Acceptance criteria:

- [ ] A low-stock signal created while nobody is looking produces a chatbot message for Inventory assignees within one beat.
- [ ] A critical finding sends an email; a medium finding does not.
- [ ] The same unresolved finding does not spam every beat.
- [ ] Disabling heartbeat stops all proactive delivery.

## Phase 7: Mobile View

Goal: the product works on a phone — responsive layout with bottom tab navigation.

- [ ] Global layout:
  - [ ] Sidebar hidden below `lg`; replaced by a bottom tab bar: Home, Inbox (conversations), Modules, Reporter, More.
  - [ ] "More" opens a sheet with the remaining nav (team, settings, marketplace, etc.) filtered by permissions.
  - [ ] Header compresses: title + notifications + avatar.
- [ ] Page retrofits (in priority order):
  - [ ] Conversations: list/detail become stacked views with back navigation; reply bar sized for touch.
  - [ ] Tickets: table becomes cards on small screens.
  - [ ] Module workspaces: stats wrap 2-up, record table becomes cards, kanban scrolls horizontally, detail forms stack single-column.
  - [ ] Dashboard: stat grid wraps, charts resize.
  - [ ] Marketplace and modules hub: card grids collapse to one column.
- [ ] Reporter chat widget becomes a full-screen sheet on mobile.
- [ ] Touch targets minimum 44px; no horizontal page scroll at 375px width.
- [ ] Verify at 375px (phone) and 768px (tablet) on the priority pages.

Acceptance criteria:

- [ ] Every priority page is usable at 375px with no horizontal scrolling.
- [ ] A member can log in, read an assigned conversation, reply, check an assigned module, and ask the Reporter chatbot — all from a phone.
- [ ] Bottom tabs reflect the user's permissions.

## Recommended Build Order

1. Phase 1 — member login (everything else keys off identity).
2. Phase 2 — assignment model.
3. Phase 3 — RBAC enforcement (APIs first, then UI, then matrix page).
4. Phase 4 — core modules (small; unblocks chatbot-for-everyone).
5. Phase 5 — chatbot (retrieval layer built on Phase 3 scoping).
6. Phase 6 — heartbeat (builds on chatbot delivery).
7. Phase 7 — mobile (touches every page; do last so retrofits cover final UI).

## Definition of Done

- [ ] Team members log in with their own accounts and see only their assigned modules, conversations, and tickets.
- [ ] Customer Care and Reporter Agent are always installed and cannot be removed.
- [ ] Any user can chat with the Reporter Agent about exactly the modules they can access — nothing more.
- [ ] The heartbeat reports new issues to affected users without being asked, via chat, notifications, and (critical only) email.
- [ ] An explicit permission matrix page shows who can reach what.
- [ ] The product is usable end-to-end on a 375px phone screen.
