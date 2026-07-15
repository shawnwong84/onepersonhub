# Paperhuman

**The watcher for one-person teams and small businesses.**

Multi-tenant: each company gets its own isolated workspace on shared infrastructure, enforced at the data-access layer (every query is automatically scoped to the caller's company) and backed by a real foreign-key constraint at the database level, not just an application-level filter. See the in-app Security page for details.

Paperhuman connects to your channels (WhatsApp, email, phone) and systems (ERP connectors), watches for what needs attention, drafts the next step, and escalates to a real human for action, logging every decision in an auditable trail. If stock runs low on something an order needs, the Reporter Agent messages you about it on its next heartbeat, before your customer ever notices.

> Originally derived from the Owly project; substantially extended into a modular SME automation platform.

---

## What it does

**A customer sends a WhatsApp message.** Paperhuman routes it to the right AI agent, checks your workflows first (maybe this is an order — extract it, create a draft order record, ask a human to approve), falls back to a knowledge-base-grounded AI reply, and logs every decision in an auditable trail. If stock runs low on something that order needs, the Reporter Agent messages you about it on its next heartbeat.

## Features

### Channels
- **WhatsApp** (WhatsApp Web), **Email** (IMAP/SMTP), **Phone** (Twilio + ElevenLabs voice)
- **Multiple accounts per channel** — extra WhatsApp numbers and inboxes, each with its own agent, automation mode, QR connect, and SMTP credentials
- Per-channel automation modes: workflow-first, AI-first, approval-required, manual-only
- Inbound webhook endpoint for external systems to trigger workflows

### AI agents
- Multiple named agents with their own system prompt, tone, knowledge scope (categories, documents, or single entries), workflow set, and escalation department
- Automatic routing: channel account → default agent → prioritized assignments
- **Test console** — dry-run any agent against a sample message and see the reply, matched KB entries, and candidate workflows
- Per-agent analytics: AI fallback rate, workflow success rate, human handoff rate

### Workflows
- Visual step editor: triggers, conditions with **true/false branching**, delays, approvals, replies, tickets, tags, API calls, **MCP tool calls**, **skill prompts**, AI replies, module records and signals
- Human-in-the-loop: approval steps pause execution; agents approve, edit, skip, or reject from the conversation thread
- Background job worker executes scheduled delays and approval timeouts
- Full run logs: every trigger, skip reason, action, and error per conversation

### Module marketplace
- 12 installable business modules: Orders, Products, Inventory, Suppliers, Finance, Sales CRM, Procurement, HR, Field Service, Productivity — plus **Customer Care** and **Reporter Agent** as always-on core modules
- Installing a module adds its own navigation entry and a comprehensive workspace: status pipelines, structured record forms (no raw JSON), one-click lifecycle actions (approve order, dispatch technician…), order line items, a **Sales CRM kanban board**, low-stock and overdue-invoice alerts
- Confirmed orders can send a customer confirmation back through the source channel

### Reporter Agent
- **Chatbot** available on every page: ask "which orders are waiting for approval?" and get a grounded answer citing the exact records — scoped to only the modules *you* can access
- **Heartbeat**: scheduled scans detect low stock, overdue invoices, stale approvals, and unanswered conversations, then deliver proactive chat messages, notifications, and (critical-only) email to the right people

### Team & security
- Team member logins with roles: **viewer → agent → supervisor → admin**
- Assignment-scoped access: agents see only their assigned modules, conversations, and tickets — enforced server-side, visualized in a **permission matrix** page
- Deactivating a member kills their session on the next request; password hashes can never leave the API
- API keys for machine access; full activity log with per-actor auditing

### Knowledge base (RAG)
- Entries, uploaded documents (PDF/DOCX/CSV/XLSX/images with OCR), and crawled websites (sitemap-aware, include/exclude patterns, scheduled recrawls)
- Semantic search with embeddings, chunking, and citation metadata on every AI reply
- Excel-style table editor for CSV/spreadsheet-derived documents

### Interface
- Responsive dashboard with dark mode; on phones the sidebar becomes a bottom tab bar — fully usable at 375px
- Real-time updates via server-sent events; notification center; CSV exports throughout

## Tech stack

Next.js 16 (App Router) · TypeScript · Prisma 7 + PostgreSQL · Redis (cache/rate limits) · MinIO (document storage) · OpenAI-compatible LLM API · whatsapp-web.js · Nodemailer/IMAP · Twilio · Tailwind CSS · Vitest (327 tests)

## Quick start

```bash
# 1. Infrastructure (PostgreSQL, Redis, MinIO)
docker compose up -d

# 2. Configure
cp .env.example .env        # set DATABASE_URL, JWT_SECRET, REDIS_URL

# 3. Install, migrate, seed
npm install
npx prisma migrate deploy   # or: npm run db:push for a dev database
npm run db:seed

# 4. Run
npm run dev                 # http://localhost:3000
```

Log in with the seeded admin: **admin / admin123** (change it immediately).

Set your AI provider API key in **Settings** to enable AI replies, the Reporter chatbot, and workflow LLM steps. Optional: `FIRECRAWL_API_KEY` in `.env` for high-quality website crawling.

Three background workers start automatically with the server: the workflow job worker (delays/timeouts, 30s), the Reporter heartbeat (configurable, default 15 min), and the website recrawl worker (10 min checks).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Run the test suite |
| `npm run db:migrate` / `db:push` / `db:seed` / `db:studio` | Database workflows |
| `npm run lint` / `format` | ESLint / Prettier |

## Documentation

Design and progress live in [`docs/`](docs/) — including the completed roadmaps for the module marketplace ([roadmap 3](docs/roadmap-3-activity-marketplace-modules.md)), the Reporter chatbot / RBAC / mobile work ([roadmap 4](docs/roadmap-4-reporter-chatbot-rbac-mobile.md)), and the agent & channel capability plan ([agent roadmap](docs/agent-capability-channel-roadmap.md)). Interactive API docs are served in-app at **/api-docs** (OpenAPI at `/api/openapi.json`).

## Known limits

- Additional email inboxes send through their own SMTP credentials, but inbound listening still uses the default Email channel (per-account IMAP listeners are planned).
- Extra phone numbers share the channel-level Twilio settings.
- Secrets and channel credentials (SMTP/IMAP passwords, provider API keys, OAuth tokens) are encrypted at rest with AES-256-GCM; non-secret config fields (host, port, username) stay plaintext for inspectability.

## License

MIT
