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

- [x] Run a full security review of the branch (`/security-review`) and fix every actionable finding.
  - Ran a multi-agent review (one pass to find candidates, one independent verification agent per candidate) against the full branch diff vs `origin/main`. 5 findings confirmed with 8-9/10 confidence, all fixed:
    - [x] IDOR: `PUT /api/conversations/[id]` and `PUT /api/tickets/[id]` checked only the coarse role permission (`agent`/`supervisor`/`admin`), not per-record assignment — unlike their GET siblings. A scoped `agent` could update/close/reassign any conversation or ticket outside their assignment. Fixed by applying the same `isUnscoped(auth)`/`assignedToId` check PUT's GET counterpart already had.
    - [x] Broken access control: `GET /api/channel-accounts` and `GET /api/channel-accounts/[id]` returned the full row — including the now-decrypted `credentials` JSON — to any role with `channel-accounts:read` (`viewer`, `agent`, `supervisor`, `admin`), even though only `admin` can create/update accounts. Fixed by stripping `credentials` from the response for non-admin roles.
    - [x] SSRF: `src/lib/website-crawler.ts`'s plain-fetch fallback (used when `FIRECRAWL_API_KEY` is unset) fetched a caller-supplied URL with no host restriction, reachable via `POST /api/knowledge/websites` (supervisor+); a malicious URL could target cloud metadata endpoints or internal services, with the response persisted into a readable RAG knowledge document. Fixed with a new `src/lib/url-safety.ts` guard that resolves the hostname and rejects loopback/RFC1918/link-local/IPv6-ULA targets, and stopped following redirects blindly (re-validated instead).
    - [x] SSRF: `src/lib/workflow-runtime.ts`'s `call_api` and `call_mcp_tool` workflow steps fetched an author-controlled URL with no validation (`call_mcp_tool`'s only "check" was that the string starts with `http`); reachable by `supervisor`+, with response bodies persisted into run logs readable by any role with `automation:read` (viewer+). Fixed with the same `url-safety.ts` guard applied before both fetches.
  - Verified: `tsc --noEmit` clean, full test suite (378/378, up from 360 — added 18 new regression tests: `tests/api/conversations-id.test.ts`, `tests/api/tickets-id.test.ts`, `tests/api/channel-accounts.test.ts`, `tests/unit/url-safety.test.ts`). Live end-to-end against the running dev server: an unassigned agent gets 403 on both PUT endpoints; a viewer receives no `credentials` field from either channel-account route while admin still does; four internal-network URLs (cloud metadata, localhost, loopback, RFC1918) are all rejected by the website-crawler fetch while a real external URL still crawls and ingests successfully.
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
- [x] `npm audit` triage; pin or patch anything with a known exploit path. Went from 26 → 9 findings:
  - [x] `next` 16.2.2 → 16.2.10: fixes a batch of high-severity advisories including a **middleware/proxy bypass** — directly relevant since auth in this app is enforced in `middleware.ts`.
  - [x] `nodemailer` 8.0.4 → ^9.0.3: fixes several SMTP/CRLF-injection and SSRF advisories (major bump, but our usage is plain `createTransport`/`sendMail`; verified working).
  - [x] `esbuild` (transitive via `vite`/`tsx`, dev-only) pinned to ^0.28.1 via a package.json `overrides` entry: fixes a dev-server arbitrary-file-read-on-Windows advisory.
  - Verified: `tsc --noEmit` clean, full test suite (360/360) still passes, `npm run build` succeeds, and a live Playwright pass (login + navigate dashboard pages) shows zero page errors on the bumped versions.
  - Deliberately **not** fixed (accepted risk, documented rather than silently ignored):
    - `xlsx` (prototype pollution + ReDoS, used to parse **uploaded** files in `knowledge-ingestion.ts`) — SheetJS never published a patched version to the npm registry past 0.18.5; the fix only exists on their own CDN, which this environment could not reach to verify a specific safe version/URL. **Needs a human to pull the current patched tarball from sheetjs.com/xlsx directly** (e.g. `npm install https://cdn.sheetjs.com/xlsx-<version>/xlsx-<version>.tgz`) rather than guess a version here.
    - `@hono/node-server` (moderate, only reachable through `prisma`'s own bundled dev CLI/`prisma studio`, never in the shipped app) — the only fix path is downgrading `prisma` to 6.19.3, a major regression from the 7.x we depend on; deferred until Prisma ships a 7.x-compatible fix.
    - `postcss` <8.5.10 nested inside `next`'s own vendored build tooling (our top-level `postcss` is already 8.5.16, unaffected) — npm's suggested fix path (downgrade `next` to 9.3.3) is nonsensical; this is Next's own internal dependency choice, fixable only by a future Next release.
    - `imap`/`utf7`/`semver` (ReDoS in a nested `semver` used internally by the unmaintained `imap` package) — `imap` per-account listeners are not yet wired into any live code path per Phase 5; low real exposure today, revisit when that phase starts.
- [x] Secrets scan of the repo history before any public exposure.
  - No real `.env` file was ever committed (only `.env.example`); `.gitignore` covers `.env*`.
  - Scanned full history (`git log --all -p`) for high-confidence provider key formats (AWS `AKIA...`, PEM private key blocks, OpenAI `sk-...`, Slack `xox...`, GitHub `ghp_...`, Google `AIza...`) — zero matches.
  - Scanned for generic hardcoded `password`/`secret`/`token`/`apiKey` assignments — all 47 hits are `.env.example` placeholders (`"change-this-to-a-random-secret"`, `"sk-your-openai-api-key"`, etc.) or test fixtures (`"test-secret-key-for-testing-only"`); none are real.
  - One real finding: `src/lib/prisma.ts` and `prisma/seed.ts` hardcoded a personal local-dev Postgres credential (`n8forge:n8forge@localhost`) as the `DATABASE_URL` fallback, committed since the schema was first added. Low severity — localhost-only, not a production secret, not reachable remotely — but still a real weak-default-credential-in-source smell. Fixed: fallback now matches the documented, non-personal default already used by `.env.example`/`docker-compose.yml` (`postgres:postgres@localhost`). The string still exists in old commits; rewriting history (force-push) was judged not worth the disruption for a localhost-only dev credential, but flagging here in case the repo goes public and someone wants to scrub it anyway.

Acceptance criteria:

- [x] A database dump alone does not yield usable channel or AI credentials (verified by direct SQL query against the running dev database).
- [x] Security review reports no high-severity findings. (5 found, all fixed — see the security-review item above.)

## Phase 2: Reliability and Multi-Instance Correctness

- [x] Move rate limiting to Redis (fixed-window or sliding-window) with in-memory fallback when Redis is absent.
  - [x] `src/lib/rate-limit.ts`'s `checkRateLimit`/`resetRateLimit` are now async, backed by Redis (`INCR` + `PTTL` via `multi()`, arming `PEXPIRE` on the first hit in a window) when `REDIS_URL` is set and reachable, matching the existing lazy-connect pattern in `src/lib/cache.ts`. Falls back to the original in-memory `Map` on any Redis error, so a single-instance/no-Redis deployment behaves exactly as before.
  - [x] `POST /api/webhooks/inbound`'s per-caller rate limit is genuinely Redis-backed and verified cross-instance-correct: live-tested against the running dev server with the actual `owly-redis-1` docker container, confirmed a real `owly:ratelimit:webhook_inbound:api-key:<id>` key appears in Redis and the log reports "Rate limiter connected to Redis".
  - **Known limitation, verified not fixable at the application level**: the `src/middleware.ts` (Proxy) call sites (auth/api-read/api-write limits) cannot use Redis in this Next 16 + Turbopack setup — dynamically importing the `redis` package from code reachable by the Proxy bundle throws `Cannot find module 'node:crypto': Unsupported external type Url for commonjs reference` in both `next dev` and a production build (`next build && next start`), while the identical `redis` usage from a normal API route handler works fine. This is a reproducible Turbopack Proxy-bundling issue, not an application bug (confirmed by testing the same code path from a route handler, which succeeded). `serverExternalPackages` does not resolve it for Proxy files. These call sites keep their pre-existing in-memory-only behavior (no regression — this rate limiting was in-memory before this change too); revisit when Turbopack or Next fixes Proxy bundling of this dependency, or consider swapping to a client with a different import shape (e.g. `ioredis`).
  - Verified: `tsc --noEmit` clean, full test suite (378/378, unit tests updated to `await` the now-async API) with no `REDIS_URL` set in the test env (exercises the in-memory fallback, same as before).
- [x] Worker leadership: guard the three in-process workers with a Redis lock (or `WORKER_ROLE` env) so multiple app instances do not double-run heartbeats/jobs/recrawls.
  - New `src/lib/worker-lock.ts`: `acquireWorkerTickLock(name, ttlMs)` does a Redis `SET key value NX PX ttlMs` per tick — the instance that wins runs the work, the rest skip that tick. TTL is set just under each worker's own interval so the lock self-heals (a new leader is elected next tick) even if the winning instance crashes mid-run. Wired into all three: `reporter-heartbeat.ts` (60s tick, 50s TTL), `workflow-worker.ts` (30s tick, 25s TTL), `website-crawler.ts`'s recrawl worker (10min tick, 9min TTL).
  - With no `REDIS_URL` set (or Redis unreachable), always returns true — single-instance assumption, matching each worker's pre-existing unguarded behavior exactly.
  - Verified: 4 new unit tests (`tests/unit/worker-lock.test.ts`) mocking the redis client; live end-to-end against the real `owly-redis-1` container confirms two concurrent `SET NX` calls in the same window correctly elect one winner and block the other, and a third call after the TTL expires wins again (self-healing). Also confirmed live via the running dev server: `owly:worker-lock:workflow-worker` and `owly:worker-lock:reporter-heartbeat` keys genuinely appear in Redis as each worker's real tick fires.
- [x] Workflow job claiming: row-level locking (`FOR UPDATE SKIP LOCKED` or `lockedAt` compare-and-set) so concurrent workers never double-execute a job.
  - Already implemented from earlier work on `processDueWorkflowJobs` (`src/lib/workflow-runtime.ts`): each job is claimed via `prisma.workflowJob.updateMany({ where: { id, status: "pending" }, data: { status: "running", ... } })`, checking `locked.count === 0` to skip if another process already claimed it — an atomic compare-and-set, safe under concurrent workers without needing an explicit row lock. Discovered and verified while implementing worker leadership above; no code change needed, just confirming and checking off.
  - One related gap fixed as part of the worker-leadership lock above: `markTimedOutWorkflowApprovals` (also called from the same worker tick) did *not* have equivalent claiming — it read a conversation's pending-approval metadata and unconditionally wrote a notification + activity log, so two concurrent instances could send a duplicate "approval timed out" notification for the same conversation. The per-tick Redis lock above closes this by ensuring only one instance's tick runs the whole `processDueWorkflowJobs` call (including this function) at a time.
- [x] Graceful shutdown: drain in-flight jobs and close WhatsApp clients on SIGTERM (extend `shutdown.ts`).
  - Each of the three in-process workers (`workflow-worker.ts`, `reporter-heartbeat.ts`, `website-crawler.ts`'s recrawl worker) now tracks its in-flight tick promise and exports a `stopX()` that clears the interval (no new ticks) and awaits the in-flight one (drains the current tick to completion) instead of just being fire-and-forget.
  - Added `destroyDefaultWhatsAppClient()` (`channels/whatsapp.ts`) and `destroyAllWhatsAppAccountClients()` (`channels/whatsapp-accounts.ts`): destroy-only variants of the existing disconnect functions, skipping their DB/activity-log writes since a shutdown is a restart, not a deliberate user disconnect — but still closing every puppeteer/chromium session cleanly so none linger as orphaned processes or leave a LocalAuth session file mid-write.
  - `shutdown.ts` rewritten: on SIGTERM/SIGINT, stops+drains all three workers, then destroys all WhatsApp sessions (default + every account), then disconnects Prisma, replacing the previous blind 10-second sleep. Each step is individually wrapped in a 15-second timeout so one stuck worker or session can't hang the whole shutdown.
  - Verified: 4 new unit tests (`tests/unit/workflow-worker.test.ts`, fake timers) confirming a tick fires on schedule, stop halts further scheduling, a lock-miss skips the work, and stop correctly awaits an in-flight tick before resolving (the same pattern is used identically in the other two workers). Live-verified all three workers still start cleanly on the real dev server after the refactor.
  - **Known test gap**: could not live-verify actual OS-level `SIGTERM` delivery end-to-end in this Windows dev environment — Windows has no real POSIX signal delivery to Node processes, so `process.on("SIGTERM", ...)` can't be exercised the way it would be in the Linux containers this app actually deploys to (where Docker/Kubernetes send a real SIGTERM on container stop). Revisit this verification once Phase 3 (deployment) sets up the actual container stack.
- [x] Startup env validation: fail fast with a clear message when `DATABASE_URL`/`JWT_SECRET`/`SECRETS_ENCRYPTION_KEY` are missing or defaulted in production.
  - New `src/lib/env-validation.ts`: `validateStartupEnv()` checks, production-only, that `DATABASE_URL` is set and isn't the documented local-dev placeholder, `JWT_SECRET` is set, isn't a documented placeholder value, and is at least 32 characters, and `SECRETS_ENCRYPTION_KEY` is valid (delegates to `crypto.ts`'s existing `secretsEncryptionEnabled()` check). Aggregates every problem found into one `StartupEnvValidationError` rather than failing on the first, so a misconfigured deploy sees the whole list at once.
  - Called first thing in `instrumentation.ts`'s `register()`, before any worker starts; on failure, logs the full message and calls `process.exit(1)` explicitly rather than relying on how Next.js happens to handle a rejected `register()` promise.
  - Dev/test are unaffected: the placeholder/production-only checks are skipped outside `NODE_ENV=production`, matching the existing narrower fallback logic already in `auth.ts`/`crypto.ts`.
  - Verified: 9 new unit tests (`tests/unit/env-validation.test.ts`). Live end-to-end against a real production build (`npm run build && NODE_ENV=production next start`): booting with the placeholder `JWT_SECRET="change-me"` and the default `DATABASE_URL` exits immediately with code 1 and both problems listed in the error; booting with a real 32-byte secret and a real DB URL starts cleanly (200 on `/login`, all three workers start).
  - While implementing this, also caught and fixed a real, unrelated **pre-existing** test-suite flake: Vitest auto-loads the developer's `.env` file, so a local `REDIS_URL` (added this session for the Redis rate-limiting/worker-lock work) was leaking into test runs, and — combined with Windows-specific CPU contention during full-parallel test-file execution (40-70s transform/setup phases observed on this machine) — occasionally caused unrelated tests to blow past the 10s default timeout. Fixed by explicitly `delete`-ing `REDIS_URL` in `tests/setup.ts` (tests must be hermetic, not dependent on the developer's local `.env`) and raising `testTimeout` to 30s in `vitest.config.ts` for headroom under this machine's contention. Confirmed stable across 4 consecutive full-suite runs after the fix (previously failed roughly every other run).

## Phase 3: Deployment and Operations

- [x] Verify/refresh the `Dockerfile` for Next 16 + instrumentation workers; add the app itself to `docker-compose.yml` for a one-command production stack.
  - [x] `docker-compose.yml` already had an `app` service (build, depends_on db/redis/minio-init health, its own healthcheck, named volumes for `.wwebjs_auth`/`.rag_uploads`) — this half of the item was already done from earlier work; confirmed via `docker compose config`.
  - [x] `Dockerfile`: builder stage now sets `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` (matching the runner stage, which uses the system `chromium` package) so the builder doesn't waste time/bandwidth downloading a Chromium it will never use, and `npm ci` now runs with `--no-audit --no-fund` (they add nothing in a Docker build and are one less thing to fail on).
  - **Known environment limitation, not an application bug**: could not verify a full `docker compose build`/`up` end-to-end in this environment. `npm ci` inside the builder stage fails with `SSL certificate problem: unable to get local issuer certificate` reaching `registry.npmjs.org` — confirmed via a direct `curl -v` reproduction from a bare `node:22-slim` container, so this is TLS interception on this machine's network (corporate proxy/antivirus MITM inspection presenting a certificate the container's trust store doesn't have), not a Dockerfile or dependency problem. Verify the Docker build in CI (GitHub Actions runners don't sit behind this interception) or on a different host before relying on it.
- [x] Readiness vs liveness: extend `/api/health` to check Postgres, Redis, and MinIO; separate `/api/health/ready`.
  - `/api/health` (liveness) simplified to check nothing downstream — just confirms the process itself is running (status/uptime/memory/version). It previously checked Postgres and OpenAI reachability, which meant a database blip could make an orchestrator restart the container, churning on top of an outage it can't fix.
  - New `/api/health/ready` (readiness): checks Postgres (always), Redis and MinIO (only when `REDIS_URL`/`S3_ENDPOINT` are configured — both are optional in this app, so "not configured" doesn't fail readiness). Returns 503 with `{ status: "not_ready", services: {...} }` when anything required is down, 200 with `"ready"` otherwise. MinIO is checked via its own unauthenticated `/minio/health/live` endpoint (no bucket credentials needed), matching the pattern `docker-compose.yml`'s own `minio` service healthcheck already uses.
  - Verified: 7 new/updated unit tests (`tests/api/health.test.ts`, `tests/api/health-ready.test.ts`). Live end-to-end against the running dev server: `/api/health` returns clean liveness data; `/api/health/ready` returns 200/`ready` with `redis: "connected"` and `objectStorage: "not_configured"` against real infra, and correctly flips to 503/`not_ready` with `objectStorage: "unreachable"` when pointed at an unreachable `S3_ENDPOINT`.
- [ ] Error monitoring: optional Sentry (or compatible) wiring via env; capture API route errors, worker errors, and client errors.
- [ ] Log hygiene: request IDs propagated into worker/agent logs; noisy logs demoted.
- [ ] Backup/restore: documented `pg_dump` + MinIO mirror scripts and a tested restore procedure.
- [x] Migration discipline: `prisma migrate deploy` on boot (optional flag); resolve the current dev-database drift (`migrate resolve --applied` for the four hand-written migrations).
  - The `Dockerfile`'s `CMD` already runs `npx prisma migrate deploy && npm start` on boot (from earlier work) — no change needed there, but it would have failed against this dev database until the drift below was resolved.
  - Root-caused the drift precisely: `20260708090000_add_team_member_login` was recorded in `_prisma_migrations` but never marked finished, and `20260708100000_add_module_assignments`, `20260708110000_add_reporter_chat`, `20260710120000_add_token_version` weren't recorded at all — all four had their schema changes applied via `prisma db push` at various points instead of a tracked migration. Verified via direct SQL that every column/table those four migrations would create already exists (`TeamMember.username`, `TeamMember.tokenVersion`, `Admin.tokenVersion`, `ModuleAssignment`, `ReporterChatThread`, `ReporterChatMessage`), so marking them applied doesn't paper over an actual schema gap.
  - Ran `npx prisma migrate resolve --applied <name>` for each of the four. Verified: `npx prisma migrate status` now reports "Database schema is up to date!" and `npx prisma migrate deploy` reports "No pending migrations to apply" — both previously failed with `P3008`/`P3018` errors. Live-verified the app still logs in and functions normally against the same database afterward (this only touches migration bookkeeping, not the actual schema).
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
