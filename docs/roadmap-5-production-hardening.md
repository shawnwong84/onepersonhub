# Roadmap 5: Production Hardening and UX Overhaul

## Objective

Take Cosstigo from feature-complete to production-trustworthy: a security pass with encrypted secrets, reliable multi-instance operation, a deployable and observable runtime, an end-to-end test safety net — and a deliberate UI/UX overhaul driven by a design audit, because the product grew fast and it shows.

Roadmaps 1–4 delivered the features. This roadmap makes them safe to sell.

## Current State (verified against code)

- 327 unit/API tests pass; no end-to-end browser suite exists.
- CI (`ci.yml`) and a Docker publish workflow exist; a `Dockerfile` exists (currency unverified against the new workers/instrumentation).
- `/api/health` exists.
- Rate limiting is an in-memory `Map` (`src/lib/rate-limit.ts`) — resets on restart, incorrect across multiple instances despite Redis being available in compose.
- ~~Channel credentials (`ChannelAccount.credentials`), the AI API key (`Settings.aiApiKey`), and SMTP/Twilio secrets are stored **unencrypted** in Postgres.~~ **Resolved** — see Phase 1.
- Three in-process workers (workflow jobs, reporter heartbeat, website recrawl) start via `instrumentation.ts` — correct for one instance, duplicated beats/jobs if horizontally scaled.
- No error monitoring; logs are console-structured only.
- Open runtime items from roadmap audits: per-account inbound IMAP listeners; priority ordering when multiple workflows match.

## Phase 1: Security

- [ ] Run a full security review of the branch (`/security-review`) and fix every actionable finding.
- [x] Encrypt secrets at rest: application-level AES-256-GCM (key from `SECRETS_ENCRYPTION_KEY` env) wrapping `Settings` secret fields, `ChannelAccount.credentials`, and `Channel.config` (a third secret-bearing location found during implementation — the default WhatsApp/Email/Phone connection cards duplicate credentials here).
  - [x] Transparent encrypt/decrypt via a Prisma Client Extension (`src/lib/prisma.ts` + `src/lib/crypto.ts`) — every existing call site (`prisma.settings.*`, `prisma.channelAccount.*`, `prisma.channel.*`) keeps working unchanged; encryption/decryption is invisible to callers.
  - [x] Migration script (`scripts/reencrypt-secrets.ts`) to re-encrypt legacy plaintext rows; idempotent, safe to re-run.
  - [ ] Key-rotation procedure documented (decrypt-with-old/re-encrypt-with-new script; not yet written).
  - [ ] API key hash review: `ApiKey.key` is still looked up by plaintext equality (bearer-token pattern). Switching to a hash-and-compare scheme is a larger, user-visible change (existing keys would need reissuing) — deliberately deferred as its own reviewed step rather than bundled here.
  - Verified end-to-end: raw SQL confirms `enc:v1:`-prefixed ciphertext at rest in all three locations; the app decrypts back to the exact original value through normal API calls; 11 new unit tests for the crypto module (round-trip, random IV per encryption, legacy-plaintext passthrough, fail-closed on tamper/wrong key, prod-without-key throws, hex/base64 key formats).
- [x] Inbound webhook hardening (`POST /api/webhooks/inbound`):
  - [x] Per-caller rate limit (60 req/min, keyed by resolved auth identity, `RATE_LIMITS.webhookInbound`); 429 with `Retry-After` on exceed.
  - [x] Payload size cap (64KB): fast-path rejection via `Content-Length`, always-enforced check against the actual body.
  - [x] Optional HMAC-SHA256 signature verification (`X-Signature-256: sha256=<hex>`, signed with the caller's own API key over the raw body); timing-safe compare. Advisory by default, enforceable via `WEBHOOK_INBOUND_REQUIRE_SIGNATURE=true`. Applies only to API-key callers — cookie-session calls are already authenticated and skip it.
  - Verified: 8 unit tests plus 5 live checks against the running dev server with a real API key (plain request accepted, oversized body → 413, valid signature accepted, invalid signature → 401, 65 rapid requests → 429 with `Retry-After`).
- [x] Auth hardening: login attempt lockout/backoff (rate limit exists — add lockout), logout-all-sessions on password change (JWT version claim), configurable session lifetime.
  - [x] Per-username login lockout (`src/lib/login-lockout.ts`): 5 failed attempts locks that identifier for 15 minutes, independent of the existing IP-based rate limit in `middleware.ts` — stops credential-stuffing one account from many IPs, which an IP limit alone would not catch. Checked before any DB lookup in `POST /api/auth`; cleared on successful login.
  - [x] Session invalidation on password change: `tokenVersion Int @default(0)` added to `Admin` and `TeamMember`, embedded in every issued JWT, and compared against the current DB row on every request (`getCurrentUser`, `route-auth.ts`). Password reset (`PATCH /api/admin/users/[id]`, `POST /api/team/members/[id]/credentials`) increments it, instantly invalidating every previously issued session for that identity. Legacy tokens with no claim treat as version 0.
  - [x] Configurable session lifetime via `SESSION_LIFETIME_DAYS` env (default 7); drives both JWT `expiresIn` and the cookie `maxAge`.
  - Verified: 7 unit tests for lockout (threshold, per-identifier isolation, case-insensitivity, auto-unlock, clear-on-success), 4 unit tests for tokenVersion invalidation, 3 live-server tests added to `tests/api/auth.test.ts`. Live end-to-end: a real member session (real login, real cookie) is confirmed authenticated, then immediately unauthenticated after an admin resets that member's password via the API — with no re-login — and a fresh login with the new password works normally.
- [x] Security headers audit (CSP, HSTS behind TLS, X-Frame-Options) in middleware/proxy.
  - [x] `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` were already present on every response (`src/middleware.ts`).
  - [x] Added, production-only (`NODE_ENV === "production"`): `Content-Security-Policy` (`default-src 'self'`, restricting script/style/img/font/connect to same-origin plus data:/https: where the app genuinely needs it, `frame-ancestors 'none'`, `object-src 'none'`) and `Strict-Transport-Security` (`max-age=63072000; includeSubDomains; preload`).
  - Gated to production because the dev server needs `'unsafe-eval'` for React/webpack HMR and HSTS has no business pinning a plain-http local server to HTTPS.
  - `script-src`/`style-src` use `'unsafe-inline'` rather than nonces: Next's own docs (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`) confirm nonce-based CSP requires disabling static rendering app-wide (Next injects inline RSC-streaming `<script>` tags on every page) — a real tradeoff not worth it here, so we followed Next's documented "Without Nonces" fallback instead.
  - Verified: production build (`npm run build && NODE_ENV=production next start`), curl confirms both headers present; a full Playwright login + dashboard-load pass against the production server recorded zero CSP console violations.
- [ ] `npm audit` triage; pin or patch anything with a known exploit path.
- [ ] Secrets scan of the repo history before any public exposure.

Acceptance criteria:

- [x] A database dump alone does not yield usable channel or AI credentials (verified by direct SQL query against the running dev database).
- [ ] Security review reports no high-severity findings.

## Phase 2: Reliability and Multi-Instance Correctness

- [ ] Move rate limiting to Redis (fixed-window or sliding-window) with in-memory fallback when Redis is absent.
- [ ] Worker leadership: guard the three in-process workers with a Redis lock (or `WORKER_ROLE` env) so multiple app instances do not double-run heartbeats/jobs/recrawls.
- [ ] Workflow job claiming: row-level locking (`FOR UPDATE SKIP LOCKED` or `lockedAt` compare-and-set) so concurrent workers never double-execute a job.
- [ ] Graceful shutdown: drain in-flight jobs and close WhatsApp clients on SIGTERM (extend `shutdown.ts`).
- [ ] Startup env validation: fail fast with a clear message when `DATABASE_URL`/`JWT_SECRET`/`SECRETS_ENCRYPTION_KEY` are missing or defaulted in production.

## Phase 3: Deployment and Operations

- [ ] Verify/refresh the `Dockerfile` for Next 16 + instrumentation workers; add the app itself to `docker-compose.yml` for a one-command production stack.
- [ ] Readiness vs liveness: extend `/api/health` to check Postgres, Redis, and MinIO; separate `/api/health/ready`.
- [ ] Error monitoring: optional Sentry (or compatible) wiring via env; capture API route errors, worker errors, and client errors.
- [ ] Log hygiene: request IDs propagated into worker/agent logs; noisy logs demoted.
- [ ] Backup/restore: documented `pg_dump` + MinIO mirror scripts and a tested restore procedure.
- [ ] Migration discipline: `prisma migrate deploy` on boot (optional flag); resolve the current dev-database drift (`migrate resolve --applied` for the four hand-written migrations).
- [ ] Update CI: typecheck + lint + tests + build gate; publish image on tags.

## Phase 4: Test Safety Net

- [ ] Playwright end-to-end suite (headless, CI-runnable) covering the money paths:
  - [ ] Login (owner + member) and member scoping (agent sees only assigned module/conversation).
  - [ ] Conversation reply flow with source badges.
  - [ ] Order lifecycle: create → approve → fulfill → customer confirmation.
  - [ ] Reporter chatbot ask + refusal.
  - [ ] Marketplace install/uninstall with core-module protection.
- [ ] Seed a deterministic e2e fixture database.
- [ ] Wire the e2e suite into CI (against the compose stack).

## Phase 5: Runtime Completeness (carried over)

- [ ] Per-account inbound IMAP listeners (registry mirroring the WhatsApp one; credentials already stored per account).
- [ ] Workflow priority: explicit priority field on flows; deterministic ordering when several match; UI to reorder.
- [ ] Unify default channels into "primary" channel accounts so every connection is account-based (removes the default-vs-account split on the Channels page).

## Phase 6: Performance

- [ ] Query audit on the hot paths (conversation list, module records, activity log) — verify indexes match filters added in roadmaps 3–4.
- [ ] Response pagination caps and cursor pagination where offset pagination will degrade (activity log, messages).
- [ ] Bundle audit: lazy-load the flow editor and kanban; confirm no server-only libs leak client-side.
- [ ] Light load test (k6 or autocannon) against the compose stack; record baseline numbers.

## Phase 7: UI/UX Overhaul (design-audit driven)

> A live design audit of the running product (desktop 1600px and mobile 375px, all major pages) was performed in July 2026 — full report with per-page findings in [`design-review-2026-07.md`](design-review-2026-07.md). This phase converts its top issues into work, in the review's recommended order.

Foundation (do first — multiplies everything after):

- [ ] Extract shared UI primitives into `src/components/ui/`: `Button`, `Badge`, `StatCard`, `DataTable`, `Modal`, `EmptyState` — one visual language for the whole app.
- [ ] Semantic color system: a single status/priority/severity/channel color map consumed by both badges and charts (kills the brown "High" bar and the three competing "open" colors).
- [ ] Dark-mode completion: theme-aware badge variants, chart palettes, and an audit of every light-only `bg-*-50/100` usage.

Page work:

- [ ] Re-skin the Agents page from raw `slate-*` classes onto the `owly-*` theme tokens (currently a visibly different product and dark-mode broken).
- [ ] Inbox (conversations list) redesign: identicon avatars, channel glyphs, unread weight, assignee chips — this is the most-used screen and furthest from Intercom/Crisp-class polish.
- [ ] Tickets table: de-emphasize repeated defaults, bulk select + assign, visible pagination.
- [ ] Settings: cap form width (~560px), scrollable tab bar with fade affordance, sticky save bar.
- [ ] Sidebar IA: merge Insights into System, collapsible sections, Modules pinned higher.

Quick wins (each under an hour — batch early):

- [ ] Branded splash on login/boot instead of the bare spinner on a blank page.
- [ ] Customer display-name falls back to contact (number/email) before "Unknown".
- [ ] Notification badge: mark-read on open, mark-all-read, honest count.
- [ ] Toasts move out of the Reporter bubble's corner; bubble yields to toasts.
- [ ] Zero-metric soft states ("No resolutions yet" instead of "0%"; hide "--" satisfaction).
- [ ] Collapse module-installed KB categories with zero entries.

Acceptance criteria:

- [ ] The ten issues in the design review are resolved and re-verified with fresh screenshots at both widths.
- [ ] Dark mode has no light-mode artifacts on any main page.
- [ ] A new page built only from `src/components/ui/` primitives is indistinguishable in style from existing pages.

## Recommended Build Order

1. Phase 1 security (everything else ships on top of it).
2. Phase 2 reliability (Redis rate limits + worker locks are small and high-value).
3. Phase 4 e2e tests (protects all later refactors, including the UX overhaul).
4. Phase 3 deployment/ops.
5. Phase 7 UX overhaul (with e2e protection in place).
6. Phase 5 runtime completeness.
7. Phase 6 performance.

## Definition of Done

- [ ] Secrets are encrypted at rest; security review is clean of high-severity findings.
- [ ] Two app instances against one database behave correctly (no duplicate beats, jobs, or rate-limit bypass).
- [ ] `docker compose up` yields a working production stack with health checks and backups documented.
- [ ] CI runs typecheck, lint, unit, and e2e suites on every push.
- [ ] The UX audit's top-ten issues are resolved and re-reviewed.
