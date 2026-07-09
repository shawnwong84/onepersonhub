# Workflow Automation Module

## Goal

Add a visual workflow automation builder for support workflows. The builder should model how a channel event becomes an execution path: trigger, optional filters, decision points, waits, customer replies, internal routing, external API calls, MCP tool calls, and reusable skills.

## Checklist

- [x] Define workflow node types for support automation.
- [x] Store canvas nodes and edges on the `Flow` model.
- [x] Add flow create, update, delete, and validation API support.
- [x] Add a dashboard navigation entry for Flows.
- [x] Add a workflow list view before the builder.
- [x] Show trigger, channel, active status, step count, and filter summary in the list.
- [x] Build an execution-rail editor that mirrors the target workflow UX.
- [x] Add a step catalog grouped by customer, logic, data, routing, external, and AI actions.
- [x] Add channel trigger filters for email, WhatsApp/messages, webhooks, and generic events.
- [x] Add a step configuration inspector.
- [x] Support customer replies, API calls, MCP tool calls, and skill execution configuration.
- [x] Support condition and wait step configuration.
- [x] Add save, validate, activate, and delete controls.
- [x] Add empty and loading states.
- [x] Persist generated execution edges from the ordered workflow steps.
- [x] Route WhatsApp inbound messages through active workflows before AI fallback.
- [x] Add human-in-the-loop workflow approval steps.
- [x] Allow customer service to approve, edit, skip, or reject the next workflow step.
- [x] Pause workflow execution while a step is waiting for approval.
- [x] Show pending workflow approvals in the conversation thread.
- [x] Create notification alerts when workflow approval is required.
- [x] Show workflow approval notifications in the dashboard notification list.
- [x] Send approved workflow reply steps to WhatsApp.
- [x] Store approval decisions and approver identity in workflow run logs.
- [x] Add persisted run logs.
- [x] Add scheduled delay execution. (Delay nodes create `WorkflowJob` rows; `processDueWorkflowJobs` resumes them; the in-process worker below executes them automatically.)
- [x] Add branch rendering for true/false condition paths. (Condition steps show true/false badges; "If false" selector jumps to a later step or stops; persisted as sourceHandle:"false" edges the runtime already executes.)
- [x] Add execution adapters for email and AI reply steps (`send_email`, `ai_reply`, `llm`, `call_api` in `workflow-runtime.ts`). MCP tool calls and skill calls remain open:
  - [ ] MCP tool call adapter.
  - [ ] Skill call adapter.
- [x] Add ticket status change triggers. (Ticket PATCH runs channel workflows on status change.)
- [x] Auto-reply to the customer when a linked support ticket is closed.
- [x] Add email and generic message workflow runtime hooks (email/WhatsApp channels, module events, reporter agent all call `runChannelWorkflows`). Webhook hook remains open:
  - [ ] Inbound webhook workflow runtime hook.
- [x] Add a production flow execution worker. (`src/lib/workflow-worker.ts`, started from `instrumentation.ts`, processes due jobs every 30s.)

## Node Types

- `trigger`: Starts a flow from an event such as message received, ticket created, or customer updated.
- `condition`: Branches based on message, channel, customer tag, or priority.
- `action`: Performs work such as sending a reply, assigning a department, adding a tag, creating a ticket, or sending a webhook.
- `approval`: Pauses execution until customer service approves, edits, skips, or rejects the next step.
- `delay`: Waits for a configured duration before continuing.
- `end`: Stops the flow.

## Validation Rules

- A flow must have one start node.
- Every edge source and target must reference an existing node.
- Every non-end node should have at least one outgoing edge.
- Every node except the start node should be reachable from the start node.
- Required configuration fields must be present for each node type.
- Approval nodes must define what is being approved and the allowed actions.

## First Release Boundary

The first release is a visual builder and validator. It persists graph state and activation status. Runtime execution should be added after the execution adapters and run log format are defined.

## UX Plan

1. The `/flows` route opens to a list view, not the builder.
2. The list explains each workflow by channel trigger, active state, step count, and real filter values.
3. Blank filters mean the workflow matches every event for that trigger.
4. The builder is used only for create/edit.
5. Runtime order is workflow first, AI fallback second.
6. Future run logs should show whether a reply came from workflow or AI.

## Human-In-The-Loop Plan

Goal: workflows can prepare the next action, but customer service keeps control before sensitive steps run.

### Builder UX

- Add a workflow step named `Approval Required`.
- Configuration fields:
  - Approval title.
  - What needs approval: reply message, API call, MCP tool call, skill output, tag update, assignment, or ticket creation.
  - Allowed decisions: approve, edit and approve, skip, reject.
  - Optional approver team or role.
  - Optional timeout action: do nothing, escalate, or continue.
- In the canvas, approval steps should be visually distinct from automatic actions.

### Runtime Behavior

- When execution reaches an approval step, create a pending workflow approval record.
- Pause the workflow run.
- Do not send customer replies or call external tools until approval is resolved.
- If approved, continue to the next step.
- If edited and approved, execute the edited payload.
- If skipped, move to the configured next step.
- If rejected, stop the workflow or follow a reject branch.

### Conversation UI

- Show a pending approval card inside the conversation thread.
- The card should show:
  - Workflow name.
  - Step name.
  - Proposed action.
  - Proposed message or payload.
  - Approve, Edit, Skip, Reject buttons.
- Approved workflow replies should display source as `Workflow + Approved`.
- Rejected/skipped decisions should appear as internal system events.

### Audit Trail

- Store approver ID and name.
- Store original proposed payload.
- Store edited payload if changed.
- Store decision, decision reason, and timestamp.
- Include the approval event in workflow run logs.
