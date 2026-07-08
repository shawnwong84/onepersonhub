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
- [ ] Add persisted workflow run logs for every trigger, skipped filter, action, approval, and error.
- [ ] Add a workflow run timeline panel inside each conversation.
- [ ] Add channel assignment controls so a workflow can target WhatsApp, email, web chat, webhook, or all channels.
- [ ] Add per-channel automation settings: workflow-first, AI-first, approval-required, or manual-only.
- [ ] Add customer service queue views: unassigned, waiting for approval, human takeover, escalated, SLA risk.
- [ ] Add workflow templates for common support flows.
- [ ] Add execution adapters for email, MCP tools, skills, AI generation, ticket creation, assignment, and notifications.
- [x] Add ticket lifecycle automation: when support closes a ticket, auto-reply to the customer on the original channel.
- [ ] Add scheduled delay execution with a background worker.
- [ ] Add branch rendering for true/false condition paths.
- [ ] Add production channel health checks and reconnect controls.

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
