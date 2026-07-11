# Roadmap 6 — Dashboard, Sidebar, Settings, RBAC

Scope agreed with the user 2026-07-11: role-aware dashboard with trends, sidebar collapse/expand polish, a settings navigation redesign, and an editable RBAC permission matrix. Two of the four areas already have substantial existing implementations (sidebar collapse, RBAC core) — this roadmap builds on them rather than rebuilding from scratch, per explicit confirmation.

## Phase 1: Dashboard — role-aware content + trends

- [x] Scope dashboard stats by role using the existing `rbac-scope.ts` helpers (`conversationScope`, `ticketScope`) instead of always querying org-wide totals. Agents/viewers see "my conversations" / "my tickets"; supervisors/admins keep the current org-wide view.

  `src/app/(dashboard)/page.tsx` now calls `getCurrentUser()` (the same server-side auth helper `requireAuth` uses in API routes, just invoked directly since this is a Server Component doing its own Prisma queries rather than going through an API route) and passes a `ScopedUser` into `getStats`. Every count/list query gets `conversationScope(user)`/`ticketScope(user)` merged into its `where` clause — including `totalMessages`, which needed a nested `conversation: scoped` filter since messages don't carry `assignedToId` directly. Unscoped roles (supervisor/admin/owner) see identical output to before this change.

  Card titles and the page description adapt when scoped: "Total Conversations" → "My Conversations", "Open Tickets" → "My Open Tickets", "Recent Conversations" → "My Recent Conversations", Quick Stats' "Total Messages"/"Total Tickets" → "My Messages"/"My Tickets", and the empty state copy changes from "Conversations will appear here once customers start reaching out" to "...once one is assigned to you". `Channel Overview` (WhatsApp/Email/Phone connection status) was deliberately left unscoped — it reflects org-wide integration health, not customer data, so every role sees it the same regardless of scope.

- [x] Add trend deltas to the 4 stat cards (Total Conversations, Active Now, Open Tickets, Resolution Rate) — e.g. "+12% vs last 7 days" — computed from a second, prior-period query.

  Added period-over-period deltas (current 7-day window vs the prior 7-day window) for 3 of the 4 cards: Total/My Conversations (new conversations created in-period), Open/My Tickets (new tickets created in-period), and Resolution Rate (resolved fraction of conversations created in-period, compared as a percentage-point delta — a rate going 10%→15% reads as "+5pp", not the more confusing "+50%" a naive percent-of-a-percent would show). Falls back to a plain "+N new" instead of a percentage when the prior period was zero (avoids "+∞%"), and to "No data yet"/"No change vs last week" when there's genuinely nothing to compare.

  "Active Now" deliberately has **no** trend: it's an instantaneous gauge (conversations currently `status: active`), not a period-accumulated count, and there's no snapshot history table to compare against a week-ago value without adding new infrastructure — showing a fabricated number there would violate the same "don't fake data" principle behind the existing "No data yet" zero-states. Documented here rather than silently omitted.

- [x] Update "Recent Conversations" and "Channel Overview" to respect the same scoping (an agent shouldn't see conversations they can't open).

  Recent Conversations is scoped (see above). Channel Overview is intentionally unscoped — see the reasoning above; revisit only if a future requirement makes channel-connection status itself sensitive.

- [x] Keep the existing empty-state handling ("No data yet") working correctly under scoped queries, where a low-volume agent view will legitimately hit zero more often than the org-wide view did.

  Verified live logged in as the e2e-agent fixture account (1 assigned conversation, 0 tickets): "My Open Tickets" correctly showed 0 with "No new tickets yet", Resolution Rate correctly showed "0%"/"No change vs last week" rather than crashing or showing misleading text, and the Recent Conversations empty-state copy path was exercised via a second scoped account with zero assignments.

  Verified live as both `admin` (unscoped, sees org-wide 80 conversations/29 tickets with real trend deltas) and the `e2e-agent` fixture (scoped, sees exactly their 1 assigned conversation and adapted labels) at 1600px and 375px, light and dark — zero console errors either account. `tsc`/lint clean, full suite (409/409) passing.

## Phase 2: Sidebar — collapse/expand polish

- [x] Persist the whole-sidebar icon-only `collapsed` state to `localStorage` (mirrors the per-section collapse persistence added last session; currently resets on every reload).

  Added a second `localStorage` key (`owly-sidebar-collapsed`) alongside the existing per-section one, read on mount and written on every toggle. Verified live: collapsed the sidebar to icon-only, reloaded the page, and it stayed collapsed (`<aside>` width measured 64px post-reload).

- [x] ~~Add a responsive fallback below the `lg` breakpoint~~ — **correction, not a real gap**: initial research for this roadmap claimed tablet-width users (768–1024px) had no navigation. Re-verified directly before building anything: `Sidebar` is `hidden lg:flex` and `MobileNav` is `lg:hidden` — these are exact complements of the same breakpoint, not a gap. Confirmed live at 900px width: the desktop sidebar is correctly absent and `MobileNav`'s bottom tab bar + "More" sheet (which already lists every `NAV_SECTIONS` item plus installed modules) is fully present and functional. No drawer was built; this item is struck through rather than silently dropped, since the roadmap explicitly called for it.

- [x] Keyboard accessibility: `aria-expanded`/`aria-controls` on section toggle buttons and the whole-sidebar collapse button, visible focus rings, and confirm items are reachable via Tab.

  Added `aria-expanded`/`aria-controls` (pointing at an `id` on the section's item list) to each section-collapse button, `aria-expanded`/`aria-label` to the whole-sidebar collapse button, and applied the app's existing `.focus-ring` utility class (already defined in `globals.css`, previously unused in the sidebar) to every interactive element so keyboard focus is visible against the dark sidebar background instead of relying on the browser's inconsistent default outline. Verified `aria-expanded` flips `true`/`false` correctly on click via a live DOM check.

- [x] Hover flyout tooltips in icon-only mode (proper positioned tooltip, not just the native `title` attribute's slow browser tooltip).

  First implementation used a CSS-only `group-hover` tooltip absolutely positioned off the icon — looked right in isolation, but a live check caught a real bug: the computed `opacity` was `1` and position was correct, yet the tooltip was invisible in an actual screenshot. Root cause: the `<nav>` has `overflow-y-auto` for scrolling, and per the CSS spec an element can't have `overflow-x: visible` paired with a non-visible `overflow-y` — the browser silently forces both axes non-visible, clipping the horizontally-overflowing absolutely-positioned tooltip even though its own styles were "correct." Fixed by portaling the tooltip to `document.body` (`createPortal`), computed from `getBoundingClientRect()` on hover/focus, entirely outside the scrolling container's clipping. Also wired to `onFocus`/`onBlur` (not just mouse hover) so it's reachable via keyboard, not just a pointer.

  Verified live, light and dark: hovering a collapsed-sidebar icon now shows a correctly positioned, unclipped tooltip immediately next to it.

Verified throughout: `tsc`/lint clean, full suite (409/409) passing, live checks at 1600px and 900px, light and dark, zero console errors.

## Phase 3: Settings — navigation redesign

- [x] Replace the horizontal, overflow-scrolling tab bar with a vertical sidebar-style section nav (matches Slack/Linear/Notion settings patterns) — same 7 sections (General, AI, Voice, Phone, Email, WhatsApp, Automation), same field content, no functional changes to what's saved.

  `src/app/(dashboard)/settings/page.tsx`'s layout is now a two-column `md:flex` row: a 224px (`w-56`) vertical nav on the left listing all 7 sections (no scrolling needed — they all fit, unlike the old horizontal bar which needed the fade-affordance workaround from the last pass), and the form content on the right. No changes to `sectionFields`, `sectionRenderers`, the API calls, or any field — purely the navigation chrome.

- [x] Keep the 560px form-width cap and sticky save bar from the last pass; adapt the sticky save bar's positioning to the new layout.

  Both preserved unchanged in behavior — the `max-w-[560px]` cap and `sticky bottom-0` save bar just moved from being direct children of the single centered column to children of the new right-hand content column, so they still cap/stick correctly within the two-column layout.

- [x] Responsive behavior: vertical nav collapses to a dropdown or top tab strip below a chosen breakpoint (settings page needs to stay usable at 375px).

  Chose a `<select>` dropdown over a top tab strip below `md`: a 7-item horizontal strip would have reintroduced the exact overflow/truncation problem fixed last pass, while a native select is a single compact, fully-accessible control that needs no scroll affordance at all. Bound to the same `activeTab` state as the desktop nav.

- [x] No content/tab additions in this pass — purely the navigation pattern, as scoped.

  Confirmed no field/tab content changed — diff is scoped to the nav/layout JSX only.

Verified live at 1600px (vertical nav, all 7 sections visible, no scrolling) and 375px (dropdown correctly switches sections, e.g. to Email), light and dark, zero console errors. `tsc`/lint clean, full suite (409/409) passing.

## Phase 4: RBAC — editable roles and permissions

Two decisions were confirmed with the user before touching this (security-critical, every-request-path) code: (1) cache roles/permissions in-process rather than querying the DB on every request, invalidated on edit; (2) replace the old `viewer < agent < supervisor < admin` hierarchy check with an explicit `isUnscoped` boolean per role, since custom roles don't have a natural position in a hierarchy.

- [x] Design a `Role` + `RolePermission` (or equivalent) schema so role→permission mapping moves from the hardcoded `PERMISSIONS` const in `src/lib/rbac.ts` into the database, with the 4 existing roles (viewer/agent/supervisor/admin) seeded as the default set.

  Added `Role` (`name`, `label`, `isBuiltIn`, `isUnscoped`) and `RolePermission` (`roleId`, `permission`, unique per pair) to `prisma/schema.prisma`. Migration `20260711034431_add_roles_permissions` creates both tables and seeds the 4 built-in roles with the *exact* 147 role-permission pairs the old hardcoded `PERMISSIONS` const held (generated programmatically from the const itself via a throwaway script, not hand-transcribed, and verified the count matched before writing the migration) — so authorization behavior is byte-identical immediately after migrating, before any admin touches the new UI.

  `src/lib/rbac.ts` was rewritten: `DEFAULT_ROLE_PERMISSIONS` is now seed-only reference data (and the source of the `Permission` TypeScript type, which stays a static compile-time catalog — routes still call `requireAuth(request, "conversations:read")` with a literal checked at compile time; only which *roles* hold each permission is now editable, not the set of possible permissions). `hasPermission`/`getPermissionsForRole`/the new `isRoleUnscoped` all read from an in-process `Map` cache (`getRoleCache()`), populated from `prisma.role.findMany` on first use and invalidated (`invalidateRoleCache()`) by the new role-management endpoints on every write — matching the confirmed performance decision.

  This made `hasPermission`/`isUnscoped`/`conversationScope`/`ticketScope` async where they were previously synchronous. Found and fixed all 14+ call sites across 7 files that needed an `await` added (`route-auth.ts`, `rbac-scope.ts` itself, `conversations/route.ts`, `conversations/[id]/route.ts`, `tickets/route.ts`, `tickets/[id]/route.ts`, `marketplace/modules/route.ts`, `modules/export/route.ts`, `modules/signals/route.ts`, and the dashboard page from Phase 1) — a missed `await` here would silently always evaluate a `Promise` object as truthy, which is a real security-bypass shape of bug, so every call site was grepped and checked individually rather than trusting the type checker alone (`Permission`-typed values would still typecheck against a stray un-awaited `Promise<boolean>` in a boolean position in some of these spots).

- [x] Add custom role creation (name + permission set) on top of the 4 built-ins; built-ins likely stay non-deletable to avoid breaking `hasMinRole`'s hierarchy assumptions — needs a design decision during implementation on how custom roles interact with the existing role-hierarchy checks.

  Resolved per the confirmed decision: `hasMinRole` (which had exactly one caller in the whole codebase — `isUnscoped`) is gone entirely, replaced by the `Role.isUnscoped` flag. `POST /api/team/permissions/roles` creates a custom role (name validated to lowercase-letters/numbers/hyphens, must be unique; starts with zero permissions, granted afterward from the matrix). `PUT /api/team/permissions/roles/[id]` edits label/isUnscoped/permissions for *any* role including built-ins (the review's "editable role × permission matrix" ask covers built-ins too - only `name` and `isBuiltIn` are immutable, since those are what other code paths key off of). `DELETE` blocks built-in roles and any custom role currently held by a `TeamMember` (would leave a dangling `rbacRole` string).

- [x] Make the role×permission table on `/team/permissions` editable (currently read-only display) — checkbox grid, save per role.

  Each permission cell is now a clickable toggle (✓/-) that PUTs the updated permission set immediately, matching the existing module-assignment matrix's click-to-cycle pattern on the same page. Added an "Unscoped" row (checkbox per role) and a "New role" modal. Delete (trash icon) shows only for custom roles. Fixed a latent bug found while wiring this up: "Full-access members" was hardcoded to `["supervisor", "admin"]` instead of reading `Role.isUnscoped` — a custom unscoped role's members wouldn't have shown up there.

- [ ] Add department-scoped access as a new scoping dimension alongside the existing per-module assignment: an option to grant "see my department's conversations/tickets" rather than only individually-assigned ones.

  Deliberately deferred, not attempted: this is a genuinely separate feature (a new scoping *dimension*, not part of making existing roles/permissions editable) layered on top of an already large, security-critical change to the authorization hot path. Given the async-conversion blast radius this phase already required, adding department scoping in the same pass risked under-testing both. Tracked here as explicit follow-up rather than silently dropped.

- [x] Migration path: existing `TeamMember.role` string values must keep working unchanged; this is additive, not a breaking change to current role assignment.

  `TeamMember.rbacRole` and `Admin.role` remain plain strings with no FK to `Role` (matching this app's existing loose-coupling convention for role fields) - no schema change needed on those models. The one place that validated `rbacRole` against a hardcoded role list (`team/members/[id]/credentials/route.ts`) now validates against the live `Role` table instead, so newly created custom roles are assignable immediately.

Verified live against the running dev server (the highest-risk verification this session has done, since this touches every authenticated request):
- Logged in as `admin` (unscoped) and the `e2e-agent` fixture (scoped) - conversations/tickets/permissions endpoints all returned correct data for both.
- **Live cache-invalidation test**: as admin, `PUT`'d the agent role's permissions to remove `conversations:read`; the already-logged-in agent's next `GET /api/conversations` immediately returned 403 with no server restart; restored the permission and confirmed 200 again on the next request. This is the core risk of the whole phase (stale in-process cache after an edit) and it worked correctly.
- Created a custom role via the API, confirmed a duplicate-name create correctly 400s, confirmed deleting a built-in role correctly 400s, then deleted the custom role (200, since unused) and confirmed the DB returned to exactly the 4 built-in roles with their original permission counts (147 total pairs, matching the pre-migration count).
- Live UI check at 1600px, light and dark: module-assignment matrix, full-access members list, roles-and-permissions grid, and the New Role modal all render correctly with zero console errors.

`tsc`/lint clean, full suite (408/408 - net -1 from Phase 1-3's 409 because the `hasMinRole` unit tests were removed along with the function itself, replaced by 3 `isRoleUnscoped` tests) passing. Also had to make the global Vitest Prisma mock (`tests/setup.ts`) return a role fixture matching the real migration's seed, since every scoped API route now depends on the role cache even in tests where auth itself is mocked - found and fixed a real interaction where several test files' own `vi.restoreAllMocks()` was wiping that fixture (documented in the test file itself).

## Verification approach (carried over from roadmap 5)

Every item: `npx tsc --noEmit` clean, `npm run lint -- --max-warnings 0` clean, full test suite passing, and live verification against the running dev server (Playwright screenshots at 1600px and 375px, light and dark) before being checked off and committed. Roadmap doc updated with a written verification note per item, matching the roadmap 5 convention.

## Open design questions to resolve during implementation

- Phase 4: exact schema for storing custom roles/permissions (new tables vs. JSON column on a `Role` table) — will be decided when that phase starts, with the tradeoffs documented in the roadmap at that point rather than guessed now.
- Phase 4: whether custom roles need their own position in the `hasMinRole` hierarchy or use a permission-set-only model instead of hierarchy — affects several existing `hasMinRole` call sites across the API.
- Phase 2: whether the tablet drawer reuses `MobileNav` or is a new component — will be decided by prototyping against the actual `MobileNav` implementation.
