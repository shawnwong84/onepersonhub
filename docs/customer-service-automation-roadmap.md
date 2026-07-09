# Customer Service Automation Roadmap

## Goal

Build Cosstigo into a reliable customer service workspace where channel messages arrive in real time, workflows can automate common execution paths, AI can answer with clear provenance, and agents can take control whenever judgment or approval is needed.

## Recommended Priorities

- [x] Show message source indicators in conversations: admin, workflow, workflow approved, AI, and AI with knowledge base.
- [x] Route WhatsApp inbound messages through workflow runtime before AI fallback.
- [x] Add realtime conversation refresh with server-sent events.
- [x] Let customer service take over a conversation and pause automation.
- [x] Add workflow approval steps for human-in-the-loop execution.
- [x] Let agents approve, edit, skip, or reject the next workflow action from the conversation thread.
- [x] Send notification alerts when a workflow is waiting for approval.
- [x] Add a notification list in the dashboard header.
- [x] Add persisted workflow run logs for every trigger, skipped filter, action, approval, and error. (`WorkflowRun`/`WorkflowRunStep` + `workflow-run-logger.ts`.)
- [x] Add a workflow run timeline panel inside each conversation. (Conversations page loads `/api/conversations/[id]/workflow-runs`.)
- [x] Add channel assignment controls so a workflow can target WhatsApp, email, or all channels (trigger `channel` filter in the runtime; skipped runs log the mismatch).
- [x] Add per-channel automation settings: workflow-first, AI-first, approval-required, or manual-only. (`channel-automation.ts`.)
- [x] Add customer service queue views: unassigned, waiting for approval, human takeover, SLA risk (conversation status filters).
- [x] Add workflow templates for common support flows. (`workflow-templates.ts` + `/api/flow-templates` install.)
- [x] Add execution adapters for email, AI generation, ticket creation, assignment, and notifications (`send_email`, `ai_reply`/`llm`, `create_ticket`, `assign_agent`, `send_notification`). MCP tools and skill adapters remain open:
  - [x] MCP tool call adapter (`call_mcp_tool`: JSON-RPC `tools/call` against the configured server URL, output feeds later steps).
  - [x] Skill call adapter (`run_skill`: runs the skill prompt through the LLM, output feeds later steps).
- [x] Add ticket lifecycle automation: when support closes a ticket, auto-reply to the customer on the original channel.
- [x] Add scheduled delay execution with a background worker. (`workflow-worker.ts` processes due `WorkflowJob`s every 30s from `instrumentation.ts`.)
- [x] Add branch rendering for true/false condition paths. (Condition steps show true/false badges; "If false" selector jumps to a later step or stops; persisted as sourceHandle:"false" edges the runtime already executes.)
- [x] Add channel health checks (status badges and health panel on the Channels page). Per-account reconnect controls tracked in the agent-capability roadmap.

## UI and UX Direction

The inbox should make ownership obvious. Every reply needs a visible source badge so an agent can immediately tell whether it came from AI, knowledge base grounded AI, workflow automation, approved workflow automation, or a human admin.

The workflow builder should stay execution-oriented:

- Left panel: workflow details, channel trigger, trigger filters, and saved workflows.
- Center canvas: vertical execution path from trigger to actions to end.
- Right panel: step catalog and selected-step configuration.
- Conversation thread: pending approval card appears where the agent already works.
- List view: every workflow shows active status, channel, trigger, filters, step count, and last run state.

## Workflow Model

Workflows should map a channel event into a controlled execution path:

1. Trigger: message received, email received, webhook received, ticket created, customer updated, scheduled event.
2. Match: channel, message terms, customer tag, customer fields, priority, status.
3. Execute: reply customer, create ticket, assign agent, add tag, call API, call MCP tool, run skill, generate AI reply.
4. Approval: pause before sensitive replies or external actions.
5. Ticket lifecycle: react to ticket status changes such as created, assigned, resolved, or closed.
6. Continue or stop: based on approval decision, branch condition, error, or manual takeover.

## Human-In-The-Loop Rules

- Human takeover pauses both workflow and AI for that conversation.
- Approval Required pauses only the workflow run at that step.
- Approve executes the proposed next action.
- Edit and approve executes the edited payload.
- Skip records the decision and avoids that action.
- Reject records the decision and stops the current approval path.
- All decisions should be logged with approver, timestamp, original payload, edited payload, and workflow step.

## Company-Useful Features

- Workflow run logs: essential for debugging why a customer received a reply.
- Approval queue: agents can process pending approvals without opening every conversation manually.
- Approval notifications: agents should receive a persistent alert when automation is paused for their decision.
- SLA-aware routing: urgent or delayed conversations should move to a human queue.
- Ticket close auto-reply: customers should receive a clear resolution update when support closes their ticket.
- Channel health dashboard: WhatsApp/email/webhook connection state, last message time, and reconnect actions.
- Template library: password reset, billing escalation, delivery status, refund review, sales handoff.
- Knowledge base improvement loop: mark AI replies as helpful, wrong, or missing article.
- Agent collision prevention: show who is viewing or typing in a conversation.
- Audit exports: workflow and AI decision history for compliance and internal review.
