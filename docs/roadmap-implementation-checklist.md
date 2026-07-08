# Cosstigo Roadmap Implementation Checklist

## Phase 1: Workflow Observability

Goal: make every automation decision explainable before adding more execution power.

- [x] Add `WorkflowRun` model for each triggered workflow.
- [x] Add `WorkflowRunStep` model for each trigger, filter, condition, action, approval, skip, and error.
- [x] Record matched workflow ID, trigger event, channel, customer message, and conversation ID.
- [x] Record skipped workflow reasons, including trigger mismatch and filter mismatch.
- [x] Record approval requested, approved, edited, skipped, and rejected events.
- [x] Record action delivery state: pending, sent, skipped, failed.
- [x] Add `/api/workflow-runs` list endpoint.
- [x] Add `/api/conversations/[id]/workflow-runs` endpoint.
- [x] Add a workflow run timeline panel in the conversation thread.
- [x] Show run status on the workflow list: last run, last error, trigger count.

Acceptance criteria:

- An agent can open a conversation and see why workflow or AI replied.
- A failed WhatsApp send is visible as a failed workflow step.
- Approval decisions show approver name, decision, timestamp, and edited payload.

## Phase 2: Approval Queue

Goal: make pending human decisions easy for customer service to process.

- [x] Create notification when workflow approval is required.
- [x] Show approval notifications in the header notification list.
- [x] Add a dedicated `Waiting for approval` inbox filter.
- [x] Add `/approvals` page or queue tab for all pending workflow approvals.
- [x] Show customer, channel, workflow name, proposed action, and age.
- [x] Allow approve, edit and approve, skip, and reject from the queue.
- [x] Add optional approval reason/comment.
- [x] Add notification mark-read behavior when approval is resolved.
- [x] Add stale approval warning after configured time.

Acceptance criteria:

- Agents can clear approval work without hunting through conversations.
- Stale approvals are visible before customers wait too long.

## Phase 3: Channel Automation Controls

Goal: let the company decide how each channel behaves.

- [x] Add per-channel automation mode:
  - [x] `manual_only`
  - [x] `workflow_first`
  - [x] `ai_first`
  - [x] `approval_required`
- [x] Add channel-level default fallback: AI reply, no reply, assign to human, or create ticket.
- [x] Add channel workflow assignment list.
- [x] Add active workflow count per channel.
- [x] Add channel health status: connected, disconnected, auth required, error.
- [x] Add reconnect action for WhatsApp.
- [x] Add last inbound and outbound message timestamps.
- [x] Block automation when channel is disabled.

Acceptance criteria:

- Admins know which workflows can run on each channel.
- Disconnected channels do not silently drop approved replies.

## Phase 4: Workflow Execution Adapters

Goal: make the workflow actions actually perform useful company operations.

- [x] WhatsApp `reply_customer`.
- [x] Customer tag update.
- [x] HTTP API call.
- [x] Email `reply_customer`.
- [x] Send internal email notification.
- [x] Create ticket.
- [x] Trigger workflow when ticket status changes.
- [x] Auto-reply to customer when a support ticket is closed or resolved.
- [x] Configure ticket close reply template from settings.
- [x] Include ticket title, status, resolution summary, support agent, and customer name in reply variables.
- [x] Prevent duplicate close replies if the ticket is reopened and closed again without a new resolution.
- [x] Allow approval-required mode before sending ticket close replies.
- [x] Assign agent/team.
- [x] Update customer field.
- [x] Generate AI reply draft.
- [x] Generate AI reply with knowledge base context.
- [x] Call MCP tool.
- [x] Run skill.
- [x] Persist external call request and response data in run logs.

Acceptance criteria:

- Each action either executes or logs exactly why it did not execute.
- Sensitive actions can be placed behind `Approval Required`.
- Closing a ticket can automatically notify the customer through WhatsApp, email, or the original conversation channel.

## Phase 4A: Ticket Lifecycle Automation

Goal: connect support team ticket work back to the customer conversation.

- [x] Add ticket status change hook in ticket update API.
- [x] Detect transitions into `resolved` or `closed`.
- [x] Find the linked conversation and original channel.
- [x] Create a customer-facing message from a default template.
- [x] Send the message through the conversation channel adapter.
- [x] Save the outbound message with source `ticket_automation`.
- [x] Show conversation badge `Ticket Automation`.
- [x] Add settings toggle: auto-reply on ticket close enabled/disabled.
- [x] Add default template: `Your ticket "{{ticketTitle}}" has been {{ticketStatus}}. {{resolution}}`
- [x] Add template variables: `{{ticketTitle}}`, `{{ticketStatus}}`, `{{resolution}}`, `{{agentName}}`, `{{customerName}}`.
- [x] Add run log event for ticket close automation.
- [x] Add notification if delivery fails.

Acceptance criteria:

- When support closes a linked ticket, the customer is notified automatically.
- The reply is visible in the conversation with a clear source badge.
- Failed delivery does not hide the ticket close event.

## Phase 5: Branching and Delays

Goal: support real workflows beyond a single straight line.

- [x] Render true/false condition branches in the workflow builder.
- [x] Store branch handles in edges.
- [x] Execute condition branches using edge handles.
- [x] Add wait step persistence.
- [x] Add scheduled job table for delayed workflow continuation.
- [x] Add background worker for due workflow jobs.
- [x] Add timeout behavior for approvals.
- [x] Add cancel behavior when human takeover starts.

Acceptance criteria:

- A workflow can branch on message content or customer tag.
- Delays survive server restarts.

## Phase 6: Customer Service Inbox UX

Goal: make the inbox operationally useful for real support teams.

- [x] Source badges for AI, AI + KB, workflow, workflow approved, and admin replies.
- [x] Human takeover button.
- [x] Realtime message refresh.
- [x] Queue filters: unassigned, waiting approval, human takeover, escalated, SLA risk.
- [x] Agent assignment controls.
- [x] Internal notes in conversation.
- [x] Typing indicator for agents.
- [x] Agent collision indicator: who is viewing or replying.
- [x] Customer profile side panel.
- [x] Related tickets side panel.
- [x] Conversation run timeline side panel.

Acceptance criteria:

- Agents can quickly decide whether to reply, approve automation, assign, or escalate.
- No reply appears without a clear source and reason.

## Phase 7: Templates and Company Setup

Goal: reduce setup effort for common businesses.

- [x] Add workflow template library.
- [x] Template: urgent password reset.
- [x] Template: billing escalation.
- [x] Template: refund approval.
- [x] Template: order status reply.
- [x] Template: sales handoff.
- [x] Template: after-hours reply.
- [x] Add template preview before install.
- [x] Add template install into current workflow builder.
- [x] Add recommended channel settings during setup.

Acceptance criteria:

- A company can install a working WhatsApp support workflow in under five minutes.

## Phase 8: Reporting and Audit

Goal: give managers confidence in automation quality.

- [x] Workflow success rate dashboard.
- [x] AI fallback rate dashboard.
- [x] Approval volume and approval time dashboard.
- [x] Automation saved replies count.
- [x] Failed action report.
- [x] Export workflow run logs.
- [x] Export approval audit trail.
- [x] Knowledge base gap report from AI fallback and low-confidence answers.

Acceptance criteria:

- Managers can identify broken workflows, slow approvals, and missing knowledge base content.

## Phase 9: RAG Knowledge Base and Document Ingestion

Goal: let admins build a searchable knowledge base from uploaded documents, editable office files, OCR, websites, and crawled pages.

- [x] Add document library for knowledge uploads.
- [x] Support plain text, Markdown, PDF, DOCX, XLSX, CSV, HTML, and image uploads.
  - [x] Local ingestion for plain text, Markdown, HTML, CSV, DOCX, text PDFs, XLS/XLSX, and images.
  - [x] Scanned-PDF render-to-OCR fallback.
- [x] Add MinIO/S3-compatible object storage for original source uploads.
- [x] Add Redis service for distributed cache and RAG query/embedding cache.
- [x] Add document reader preview for uploaded source files.
- [x] Add document editor for text, Markdown, and DOCX-derived content.
- [ ] Add Excel-style table editor for CSV/XLSX-derived content.
  - [x] CSV/XLSX table preview.
  - [ ] Editable cell grid.
- [x] Add OCR ingestion for scanned PDFs and images.
  - [x] Image OCR.
  - [x] Scanned PDF OCR.
- [x] Add ingestion pipeline status: queued, extracting, OCR, chunking, embedding, indexed, failed.
- [x] Add chunking strategy with source references, page numbers, sheet names, row ranges, and section headings.
- [x] Add embeddings index for RAG retrieval.
- [x] Add hybrid search: keyword plus vector retrieval.
- [x] Add source citations in AI replies from retrieved knowledge chunks.
- [x] Add knowledge freshness and re-index controls.
- [x] Add duplicate document detection and document versioning.
- [x] Add token usage counter for document extraction, OCR, LLM cleanup, summarization, embeddings, and answer generation.
- [x] Show token usage by document, ingestion run, conversation, workflow, and date range.
  - [x] Token usage API filters by feature, entity type, and entity id.
  - [x] Knowledge document token totals in the RAG library.
  - [x] Dedicated token usage report UI with date ranges.
- [x] Add token budget settings and warning thresholds.
- [x] Add Firecrawl website ingestion integration.
- [ ] Support sitemap crawl, single URL scrape, include/exclude URL patterns, crawl depth, and scheduled recrawls.
  - [x] Single URL scrape.
  - [x] Firecrawl sitemap/depth crawl with include/exclude patterns.
  - [ ] Scheduled recrawl worker.
- [x] Store crawl source URL, crawl timestamp, canonical URL, title, and extracted content.
- [x] Add ingestion logs with recoverable errors and retry action.
- [x] Add admin notification when ingestion completes or fails.

Acceptance criteria:

- Admins can upload documents or crawl a website and make the content searchable by AI.
- Every AI answer can show which knowledge chunks were used.
- Token-consuming ingestion steps are visible before and after processing.
- Failed OCR, parsing, embedding, or Firecrawl jobs do not silently disappear.

## Recommended Next Build Order

1. Workflow run logs.
2. Conversation workflow timeline.
3. Waiting approval queue.
4. Channel automation controls.
5. Ticket and assignment action adapters.
6. Ticket close auto-reply.
7. Condition branches.
8. Delay worker.
9. Workflow templates.
10. RAG document ingestion.
11. Token usage accounting.
12. Firecrawl website ingestion.
