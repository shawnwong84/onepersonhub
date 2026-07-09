# Cosstigo UI/UX Design Review — July 2026

Scope: live review of the running product at desktop (1600×950) and phone (375×812) widths, covering login, dashboard (light + dark), conversations, tickets, module workspaces (orders, sales kanban), marketplace, reporter, team + permission matrix, channels + accounts, flow editor, knowledge base, settings, and analytics.

## Overall assessment

The product is functionally rich and the newest surfaces (flow editor, module workspaces, permission matrix, mobile tab bar) are genuinely good. But the app was built page-by-page across several eras and it shows: there are at least three table styles, three badge/pill systems, two stat-card designs, and one whole page (Agents) on a different color palette than the rest. Dark mode is 80% there with light-mode artifacts bleeding through. Data-quality fallbacks ("Unknown" customers, "--" cells, "0%" rates) leak into first impressions. None of this is structural — a shared component layer plus a color/status token system would resolve most of it.

## Top 10 issues (by impact)

1. **No shared component system — visible inconsistency everywhere.**
   Pages: all. Tickets, module records, and team render three different table designs; buttons mix `rounded-lg`/`rounded-md` and different padding scales; there are at least four modal implementations with different headers and close affordances; dashboard and module stat cards differ in shape and typography.
   Fix: extract `Button`, `Badge`, `StatCard`, `DataTable`, `Modal`, `EmptyState` primitives into `src/components/ui/` and migrate pages incrementally.

2. **The Agents page is on the wrong palette.**
   Page: /agents. It uses raw `slate-*` classes (white cards, slate text) instead of the `owly-*` theme tokens used everywhere else — visibly a different product, and it will not respond to dark mode.
   Fix: re-skin to `owly-*` tokens; this page also has the newest features (test console, analytics strip) so it deserves the polish.

3. **Dark mode is incomplete.**
   Pages: dashboard (verified), badges globally. Status pills keep light-mode pastel backgrounds (`bg-green-100 text-green-700` style) which look washed and low-contrast on dark surfaces; chart colors and the Agents page are not theme-aware.
   Fix: badge/status colors via CSS variables with dark variants; audit every `bg-*-50/100` against dark mode.

4. **Cold-load shows an unbranded blank page with a bare spinner.**
   Page: /login (and initial app load). First paint is a white void with a small spinner — looks broken for 1–3 seconds.
   Fix: branded splash (logo + product name) in the auth-check loading state; skeletons instead of spinners on dashboard first load.

5. **No status/color design language.**
   Pages: analytics, tickets, modules, channels. Analytics bars use ad-hoc colors (a brown "High" priority bar; red/orange with no scale logic); the channel donut's colors don't match channel colors used elsewhere; "open" is yellow in tickets but gray/blue in modules.
   Fix: one semantic color map (status, priority, severity, channel) exported from a single module and used by badges *and* charts.

6. **"Unknown" customers dominate the inbox.**
   Pages: dashboard, conversations. Most WhatsApp rows read "Unknown" because the pushname is missing — the phone number exists but isn't used as the display fallback.
   Fix: fall back to the customer contact (formatted number/email) before "Unknown"; reserve "Unknown" for truly empty records.

7. **Tables are low-signal at scale.**
   Page: /tickets especially. Twenty rows of identical yellow "open" pills, "--" departments, "Unassigned" repeated — no bulk actions, no visible pagination, no row grouping.
   Fix: de-emphasize repeated defaults (muted text instead of pills for the dominant status), add bulk select + assign, surface pagination.

8. **Settings layout breaks down.**
   Page: /settings. The horizontal tab bar overflows and truncates ("What…" = WhatsApp) with no scroll affordance; form fields stretch to ~900 px line lengths; the Save button floats half-clipped at the bottom edge.
   Fix: wrap or scroll-with-fade the tabs; cap form width (~560 px); sticky footer save bar.

9. **Notification and widget noise.**
   Pages: all. The bell shows a permanent red "9+" (unread never clears), and the Reporter chat bubble occupies the same bottom-right corner as toasts (channels page) and overlaps content on short viewports.
   Fix: mark-all-read + read-on-open semantics; move toasts top-center or above the bubble; auto-hide bubble when a toast fires.

10. **Empty/demo states undermine trust.**
    Pages: dashboard ("Resolution Rate 0%" in bold), analytics ("Satisfaction Score --"), knowledge base (six module-installed categories with 0 entries and identical truncated descriptions).
    Fix: hide or soft-state zero metrics ("No resolutions yet"); group module-installed KB scopes under a collapsed section; friendlier first-run dashboard.

## Quick wins (<1 hour each)

- Branded loading state on login/boot (issue 4).
- Customer display-name fallback to contact (issue 6).
- Cap + clear notification badge; mark-read on open (issue 9).
- Max-width on settings forms; tab bar `overflow-x-auto` with fade (issue 8).
- Hide "Resolution Rate" style zero-metrics until data exists (issue 10).
- Collapse module-installed KB categories with 0 entries (issue 10).
- Fix dark-mode status pill variants for the ~6 most common badges (issue 3, partial).

## Deeper redesign opportunities

- **Component library extraction** (issue 1) — the multiplier for everything else; do it before further feature work.
- **Semantic color system** for status/priority/severity/channel shared by badges and charts (issues 3, 5).
- **Agents page re-skin** onto the shared system (issue 2).
- **Inbox redesign**: the conversations list is the most-used screen and its rows (avatar-less, "Unknown", timestamp right) are the furthest from Intercom/Crisp-class polish — richer rows (identicon avatar, channel glyph, unread weight, assignee chip) would move perceived quality the most.
- **Sidebar information architecture**: 20+ items across 7 sections; merge Insights into System, make sections collapsible, and consider pinning Modules above the fold.

## What is already good

Flow editor (guided empty state, three-pane layout), module workspaces (pipeline tabs, structured forms), permission matrix, mobile bottom-tab bar and More sheet, marketplace card grid, and the Reporter chat surface are all solid foundations — the overhaul should bring the rest of the app up to their level, not rebuild them.
