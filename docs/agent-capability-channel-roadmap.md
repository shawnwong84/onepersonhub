# Agent Capability and Channel Assignment Roadmap

## Objective

Build configurable AI agents that can be assigned to specific channel accounts, knowledge scopes, workflows, tools, and escalation rules.

This lets Cosstigo run different automation behavior for different business functions.

Examples:

- Customer Support Agent handles WhatsApp support accounts, uses product/support KB, and runs support workflows.
- Finance Support Agent handles billing email accounts, uses finance KB, and runs billing workflows.
- Sales Agent handles sales WhatsApp/email accounts, uses pricing/product KB, and runs sales handoff workflows.

## Core Concepts

### Agent

An agent is an automation persona and execution configuration. It is separate from a human team member.

An agent controls:

- Name and description.
- Tone and language.
- System prompt.
- Fallback behavior.
- Approval rules.
- Escalation department/team.
- Allowed knowledge base scope.
- Allowed workflows.
- Allowed tools/skills.
- Assigned channel accounts.

### Channel Account

A channel account is one connected account under a channel.

Examples:

- WhatsApp `+60123456789`
- WhatsApp `+60987654321`
- Email `support@company.com`
- Email `billing@company.com`
- Telegram bot account
- Phone number

Each channel account can have a default agent.

### Agent Routing

When a message arrives, Cosstigo should:

1. Identify the channel account.
2. Resolve the assigned agent.
3. Load the agent's KB scope.
4. Load the agent's active workflows.
5. Run workflow-first or AI-first behavior based on configuration.
6. Store the selected agent and routing reason in message/conversation metadata.

## Data Model Plan

### `Agent`

Fields:

- `id`
- `name`
- `description`
- `status`: `active`, `inactive`
- `tone`
- `language`
- `systemPrompt`
- `fallbackMode`: `ai_reply`, `workflow_only`, `human_handoff`, `no_reply`
- `automationMode`: `manual_only`, `workflow_first`, `ai_first`, `approval_required`
- `requireApproval`
- `escalationDepartmentId`
- `metadata`
- `createdAt`
- `updatedAt`

### `ChannelAccount`

Fields:

- `id`
- `channel`: `whatsapp`, `email`, `phone`, `telegram`, `webchat`
- `name`
- `identifier`: phone number, email address, account id
- `status`: `connected`, `disconnected`, `auth_required`, `error`, `disabled`
- `credentials`
- `settings`
- `automationMode`
- `defaultAgentId`
- `lastInboundAt`
- `lastOutboundAt`
- `metadata`
- `createdAt`
- `updatedAt`

### `AgentChannelAccount`

Fields:

- `id`
- `agentId`
- `channelAccountId`
- `priority`
- `isPrimary`
- `isActive`

### `AgentKnowledgeScope`

Fields:

- `id`
- `agentId`
- `scopeType`: `category`, `document`, `entry`
- `categoryId`
- `knowledgeDocumentId`
- `knowledgeEntryId`
- `isActive`

### `AgentWorkflow`

Fields:

- `id`
- `agentId`
- `flowId`
- `priority`
- `isActive`

### `AgentTool`

Fields:

- `id`
- `agentId`
- `toolType`: `mcp`, `skill`, `http`, `internal`
- `name`
- `config`
- `isActive`

## Runtime Plan

### Agent Router

Create `src/lib/agent-router.ts`.

Responsibilities:

- Resolve channel account from inbound message.
- Resolve default agent from channel account.
- Apply optional routing rules.
- Return selected agent, channel account, KB scope, workflow scope, and routing reason.
- Write routing decision to logs/metadata.

### RAG Integration

Update knowledge search so it can accept:

- `agentId`
- `categoryIds`
- `documentIds`
- `entryIds`
- `channelAccountId`

Behavior:

- If an agent has KB scope, search only allowed categories/documents/entries.
- If no KB scope is configured, follow agent setting:
  - Search global KB.
  - Or use no KB.

### Workflow Integration

Update workflow matching so flows can be filtered by:

- Agent.
- Channel account.
- Channel.
- Trigger.
- Priority.
- Active status.

This prevents unrelated workflows from running on the wrong channel/account.

### Conversation Metadata

Store on assistant/workflow messages:

- `agentId`
- `agentName`
- `channelAccountId`
- `channelAccountName`
- `routingReason`
- `knowledgeBaseCount`
- `knowledgeCitations`
- `flowId`
- `flowName`

## UI Plan

### Agents List Page

Route:

`/agents`

Show:

- Agent name.
- Status.
- Assigned channel accounts.
- KB scopes.
- Workflows.
- Last used.
- Success rate.
- Human handoff rate.

Actions:

- New agent.
- Edit.
- Activate/deactivate.
- Test.

### Agent Detail Page

Route:

`/agents/[id]`

Sections:

- Details.
- Prompt and behavior.
- Channel accounts.
- Knowledge scope.
- Workflows.
- Tools and skills.
- Approval rules.
- Test console.
- Audit/routing history.

### Channels Page Update

Replace single channel configuration with channel accounts.

Show:

- Multiple WhatsApp accounts.
- Multiple email inboxes.
- Connection status.
- Assigned agent.
- Automation mode.
- Health.
- Last inbound/outbound.
- Reconnect/test buttons.

### Conversation UI Update

Show agent badges on replies:

- `Customer Support Agent + KB`
- `Finance Support Agent + Workflow`
- `Sales Agent + Human Approved`

Conversation header should show:

- Current assigned automation agent.
- Channel account.
- Human takeover status.

## Permissions Plan

Admin:

- Create/edit/delete agents.
- Assign channel accounts.
- Assign KB scopes.
- Assign workflows/tools.

Supervisor:

- View agents.
- Test agents.
- Approve agent replies.

Agent/human support:

- See which AI agent handled the conversation.
- Take over conversation.

## Implementation Checklist

### Phase 1: Schema and API Foundation

- [x] Add `Agent` model.
- [x] Add `ChannelAccount` model.
- [x] Add `AgentChannelAccount` model.
- [x] Add `AgentKnowledgeScope` model.
- [x] Add `AgentWorkflow` model.
- [x] Add `AgentTool` model.
- [x] Add Prisma migration.
- [ ] Add seed/demo agents.
- [x] Add `/api/agents` CRUD.
- [x] Add `/api/agents/[id]` CRUD.
- [x] Add `/api/channel-accounts` CRUD.
- [ ] Add validation schemas.
- [x] Add RBAC permissions for agent management.

### Phase 2: Agent UI

- [x] Add sidebar navigation item: `Agents`.
- [x] Add Agents list page.
- [x] Add Agent create/edit form.
- [x] Add Agent detail page (`/agents/[id]` opens the editor for that agent).
- [x] Add status toggle.
- [x] Add prompt/personality editor.
- [x] Add fallback and automation mode controls.
- [x] Add approval rule controls.
- [ ] Add escalation department selector.

### Phase 3: Channel Account UI

- [x] Update Channels page to show channel accounts (Channel accounts section: list with default agent, automation mode, activity, status).
- [x] Add create/edit channel account modal.
- [x] Add assign default agent control.
- [x] Add multiple WhatsApp account support UI (any number of accounts per channel; runtime is still single-client, see Phase 8).
- [x] Add multiple email account support UI (same caveat as above).
- [x] Add account health/status badges (status column: connected/disconnected/inactive).
- [ ] Add reconnect/test actions per account (needs the Phase 8 per-account runtime).

### Phase 4: Agent Assignment

- [x] Add agent-to-channel-account assignment UI.
- [ ] Add primary/priority assignment.
- [x] Add agent-to-KB category assignment.
- [ ] Add agent-to-document assignment.
- [ ] Add agent-to-entry assignment.
- [x] Add agent-to-workflow assignment.
- [x] Add agent-to-tool/skill assignment.

### Phase 5: Runtime Routing

- [x] Create `agent-router`.
- [x] Resolve channel account from inbound WhatsApp message.
- [x] Resolve channel account from inbound email.
- [x] Resolve channel account from phone/other channels.
- [x] Resolve default agent from channel account.
- [x] Apply routing priority.
- [x] Store routing decision in conversation metadata.
- [x] Store agent metadata on outbound messages.

### Phase 6: RAG Scope Filtering

- [x] Update semantic search to accept agent scope.
- [x] Filter KB by assigned categories.
- [x] Filter KB by assigned documents.
- [ ] Filter KB by assigned entries.
- [x] Add fallback behavior for no KB scope.
- [x] Store citation metadata with agent info.

### Phase 7: Workflow Scope Filtering

- [x] Add flow assignment to agents.
- [x] Filter workflow matching by selected agent (runtime limits candidate flows to the routed agent's assigned flows).
- [ ] Filter workflow matching by channel account.
- [ ] Add priority behavior for multiple matching workflows.
- [x] Log skipped workflows with agent mismatch reason (skipped runs record why, including agent-scoped no-match).

### Phase 8: Multi-Account Channel Runtime

- [ ] Refactor WhatsApp runtime from single client to client registry.
- [ ] Store separate WhatsApp auth/session path per channel account.
- [ ] Add connect/disconnect/reconnect per WhatsApp account.
- [ ] Route inbound WhatsApp messages to the matching channel account.
- [ ] Send outbound WhatsApp messages through the selected account.
- [ ] Refactor email runtime for multiple IMAP/SMTP accounts.
- [ ] Route inbound email to the matching channel account.
- [ ] Send outbound email through the selected account.

### Phase 9: Conversation Experience

- [x] Show agent badge on AI replies (badge label appends the agent name from message metadata).
- [x] Show agent badge on workflow replies (runtime now stamps agentId/agentName on workflow reply messages).
- [x] Show channel account in conversation header (account name with identifier tooltip).
- [x] Add conversation filter by agent (list API `agentId` param + filter select).
- [x] Add conversation filter by channel account (list API `channelAccountId` param + filter select).
- [x] Add manual agent reassignment on conversation (header select PUTs `agentId`; unknown agents rejected).
- [x] Keep human takeover behavior above agent automation (inbound handlers skip automation when `humanTakeover`/`automationPaused` is set).

### Phase 10: Testing and Observability

- [ ] Add agent test console.
- [ ] Test agent with selected channel account.
- [ ] Test agent with selected KB scope.
- [ ] Test agent with selected workflow.
- [ ] Add agent routing audit log.
- [ ] Add per-agent analytics.
- [ ] Add per-agent AI fallback rate.
- [ ] Add per-agent workflow success rate.
- [ ] Add per-agent handoff rate.

## Recommended Build Order

1. Schema and migrations.
2. Agent CRUD API.
3. Channel account CRUD API.
4. Agents list/detail UI.
5. Channel account UI and default agent assignment.
6. Agent router.
7. RAG scope filtering.
8. Workflow scope filtering.
9. Conversation badges and metadata.
10. Multi-WhatsApp account runtime.
11. Multi-email account runtime.
12. Agent test console.
13. Agent analytics and audit logs.

## Acceptance Criteria

- Admin can create multiple agents.
- Admin can assign agents to different WhatsApp/email accounts.
- Each agent can use a different KB scope.
- Each agent can use a different workflow set.
- Inbound messages resolve to the correct agent.
- Outbound replies show which agent replied.
- Finance workflows do not run on customer support channels unless assigned.
- Customer support KB is not used by Finance Agent unless assigned.
- Multiple WhatsApp accounts can connect independently.
- Multiple email inboxes can connect independently.
