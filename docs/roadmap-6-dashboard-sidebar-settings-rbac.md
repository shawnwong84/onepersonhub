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

- [ ] Persist the whole-sidebar icon-only `collapsed` state to `localStorage` (mirrors the per-section collapse persistence added last session; currently resets on every reload).
- [ ] Add a responsive fallback below the `lg` breakpoint — sidebar is currently `hidden lg:flex` with no drawer/hamburger, so tablet-width users (768–1024px) have no sidebar navigation at all. Add a slide-over drawer triggered from the header, reusing `MobileNav`'s pattern where sensible.
- [ ] Keyboard accessibility: `aria-expanded`/`aria-controls` on section toggle buttons and the whole-sidebar collapse button, visible focus rings, and confirm items are reachable via Tab.
- [ ] Hover flyout tooltips in icon-only mode (proper positioned tooltip, not just the native `title` attribute's slow browser tooltip).

## Phase 3: Settings — navigation redesign

- [ ] Replace the horizontal, overflow-scrolling tab bar with a vertical sidebar-style section nav (matches Slack/Linear/Notion settings patterns) — same 7 sections (General, AI, Voice, Phone, Email, WhatsApp, Automation), same field content, no functional changes to what's saved.
- [ ] Keep the 560px form-width cap and sticky save bar from the last pass; adapt the sticky save bar's positioning to the new layout.
- [ ] Responsive behavior: vertical nav collapses to a dropdown or top tab strip below a chosen breakpoint (settings page needs to stay usable at 375px).
- [ ] No content/tab additions in this pass — purely the navigation pattern, as scoped.

## Phase 4: RBAC — editable roles and permissions

- [ ] Design a `Role` + `RolePermission` (or equivalent) schema so role→permission mapping moves from the hardcoded `PERMISSIONS` const in `src/lib/rbac.ts` into the database, with the 4 existing roles (viewer/agent/supervisor/admin) seeded as the default set.
- [ ] Add custom role creation (name + permission set) on top of the 4 built-ins; built-ins likely stay non-deletable to avoid breaking `hasMinRole`'s hierarchy assumptions — needs a design decision during implementation on how custom roles interact with the existing role-hierarchy checks.
- [ ] Make the role×permission table on `/team/permissions` editable (currently read-only display) — checkbox grid, save per role.
- [ ] Add department-scoped access as a new scoping dimension alongside the existing per-module assignment: an option to grant "see my department's conversations/tickets" rather than only individually-assigned ones.
- [ ] Migration path: existing `TeamMember.role` string values must keep working unchanged; this is additive, not a breaking change to current role assignment.

## Verification approach (carried over from roadmap 5)

Every item: `npx tsc --noEmit` clean, `npm run lint -- --max-warnings 0` clean, full test suite passing, and live verification against the running dev server (Playwright screenshots at 1600px and 375px, light and dark) before being checked off and committed. Roadmap doc updated with a written verification note per item, matching the roadmap 5 convention.

## Open design questions to resolve during implementation

- Phase 4: exact schema for storing custom roles/permissions (new tables vs. JSON column on a `Role` table) — will be decided when that phase starts, with the tradeoffs documented in the roadmap at that point rather than guessed now.
- Phase 4: whether custom roles need their own position in the `hasMinRole` hierarchy or use a permission-set-only model instead of hierarchy — affects several existing `hasMinRole` call sites across the API.
- Phase 2: whether the tablet drawer reuses `MobileNav` or is a new component — will be decided by prototyping against the actual `MobileNav` implementation.
