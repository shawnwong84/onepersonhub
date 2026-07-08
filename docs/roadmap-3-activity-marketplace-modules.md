# Roadmap 3: Activity Log and SME Module Marketplace

## Objective

Build Cosstigo into a modular SME automation platform while keeping the product centered on its core objective:

> Automate work from inbound Email and WhatsApp messages by turning unstructured customer, supplier, and operational input into structured records, workflows, approvals, and replies.

This roadmap has two major tracks:

1. Make `/activity` useful as a complete audit trail.
2. Add a Marketplace where users can install business modules such as Orders, Products, Inventory, Supplier Management, Finance, Sales CRM, HR, Procurement, Service Jobs, and Reporter Agent.

## Product Principle

Every module must answer these questions:

- What inbound Email or WhatsApp messages does it understand?
- What structured business records does it create or update?
- What workflow does it run?
- When does it need approval?
- What reply does it send back to the customer, supplier, or internal user?
- What activity log entries prove what happened?
- What conditions require attention from the Reporter Agent?

If a module does not improve inbound-message automation, it should not be added yet.

## Phase 1: Make Activity Log Work

Goal: `/activity` should show meaningful system, AI, workflow, channel, and admin events.

- [x] Expand `logActivity()` to accept a full payload:
  - [x] `action`
  - [x] `entity`
  - [x] `entityId`
  - [x] `description`
  - [x] `userId`
  - [x] `userName`
  - [x] `metadata`
  - [x] `requestId`
  - [x] `ipAddress`
  - [x] `userAgent`
- [x] Add typed activity action constants.
- [x] Add activity entity constants:
  - [x] `conversation`
  - [x] `message`
  - [x] `ticket`
  - [x] `workflow`
  - [x] `approval`
  - [x] `agent`
  - [x] `channel`
  - [x] `knowledge`
  - [x] `settings`
  - [x] `module`
  - [x] `module_record`
- [x] Ensure activity logging never blocks primary user actions.
- [x] Add activity helper for request context extraction.
- [x] Add activity entries for conversation events:
  - [x] Conversation created from Email.
  - [x] Conversation created from WhatsApp.
  - [x] Customer message received.
  - [x] Manual admin reply sent.
  - [x] Conversation status changed.
  - [x] Human takeover started.
  - [x] Automation resumed.
- [x] Add activity entries for AI events:
  - [x] AI reply generated.
  - [x] AI reply skipped by cooldown.
  - [x] AI fallback used because no workflow matched.
  - [x] AI reply used knowledge base citations.
- [x] Add activity entries for workflow events:
  - [x] Workflow matched.
  - [x] Workflow skipped.
  - [x] Workflow completed.
  - [x] Workflow action failed.
  - [x] Workflow approval requested.
  - [x] Workflow approval approved.
  - [x] Workflow approval rejected.
  - [x] Workflow approval skipped.
  - [x] Workflow delayed.
  - [x] Workflow resumed after delay.
- [x] Add activity entries for ticket events:
  - [x] Ticket created.
  - [x] Ticket assigned.
  - [x] Ticket priority changed.
  - [x] Ticket status changed.
  - [x] Ticket closed.
  - [x] Ticket close auto-reply sent.
  - [x] Ticket close auto-reply failed.
- [x] Add activity entries for agent events:
  - [x] Agent created.
  - [x] Agent updated.
  - [x] Agent deleted.
  - [x] Agent assigned to channel.
  - [x] Agent assigned to workflow.
  - [x] Agent assigned to KB scope.
- [x] Add activity entries for channel events:
  - [x] WhatsApp connected.
  - [x] WhatsApp disconnected.
  - [x] WhatsApp QR requested.
  - [x] Email settings tested.
  - [x] Email listener started.
  - [x] Channel automation mode changed.
- [x] Add activity entries for knowledge events:
  - [x] Knowledge entry created.
  - [x] Knowledge entry updated.
  - [x] Document uploaded.
  - [x] Document indexed.
  - [x] Document ingestion failed.
  - [x] Website crawled.
  - [x] Website crawl failed.
- [x] Add activity entries for settings and system changes:
  - [x] Settings updated.
  - [x] Token budget changed.
  - [x] API key created.
  - [x] API key deleted.
  - [x] Team member created.
  - [x] Team member updated.

Acceptance criteria:

- [x] Receiving a WhatsApp message creates an activity entry.
- [x] Receiving an Email message creates an activity entry.
- [x] AI and workflow replies clearly show source in activity.
- [x] Approval decisions appear in activity with actor and decision.
- [x] Ticket status changes appear with old and new status.
- [x] Activity logging failures do not break the original action.

## Phase 2: Improve Activity Log UI

Goal: make `/activity` useful for operations and debugging.

- [x] Add filters:
  - [x] Entity.
  - [x] Action.
  - [x] Actor.
  - [x] Source: `system`, `admin`, `ai`, `workflow`, `channel`, `module`.
  - [x] Date range.
- [x] Add searchable text filter.
- [x] Add activity detail drawer.
- [x] Show metadata in readable JSON.
- [x] Add source link buttons:
  - [x] Open conversation.
  - [x] Open ticket.
  - [x] Open workflow run.
  - [x] Open agent.
  - [x] Open module record.
- [x] Add export to CSV.
- [x] Add activity summary cards:
  - [x] Total events.
  - [x] Failed automation events.
  - [x] Approval events.
  - [x] Channel events.

Acceptance criteria:

- [x] Customer service can trace why a customer received a reply.
- [x] Admin can filter to failed workflow/API/channel events.
- [x] Activity entries link to the correct operational record.

## Phase 3: Marketplace Foundation

Goal: add a marketplace page where users can install business modules.

- [x] Add sidebar navigation item: `Marketplace`.
- [x] Add `/marketplace` page.
- [x] Add static module catalog for v1.
- [x] Add module categories:
  - [x] Customer operations.
  - [x] Sales.
  - [x] Orders.
  - [x] Inventory.
  - [x] Finance.
  - [x] Supplier.
  - [x] HR.
  - [x] Procurement.
  - [x] Field service.
  - [x] Productivity.
  - [x] Monitoring and reporting.
- [x] Add module cards with:
  - [x] Name.
  - [x] Category.
  - [x] Description.
  - [x] Installed status.
  - [x] Input channels.
  - [x] Included workflows.
  - [x] Included records.
  - [x] Approval requirements.
  - [x] Reporter Agent signals.
- [x] Add marketplace search.
- [x] Add category filter.
- [x] Add installed-only filter.
- [x] Add module detail page or drawer.
- [x] Add install, configure, disable, and uninstall actions.
- [x] Add activity log entry when module is installed, disabled, or uninstalled.

Acceptance criteria:

- [x] Admin can browse available modules.
- [x] Admin can see exactly what a module adds before installing.
- [x] Installed modules show installed state and configuration entry point.

## Phase 4: Module Data Model

Goal: support modules without creating too many rigid tables too early.

- [x] Add `BusinessModule` model:
  - [x] `id`
  - [x] `slug`
  - [x] `name`
  - [x] `category`
  - [x] `description`
  - [x] `version`
  - [x] `isInstalled`
  - [x] `isEnabled`
  - [x] `config`
  - [x] `installedAt`
  - [x] `installedBy`
- [x] Add `ModuleRecord` model:
  - [x] `id`
  - [x] `moduleId`
  - [x] `recordType`
  - [x] `title`
  - [x] `status`
  - [x] `customerId`
  - [x] `conversationId`
  - [x] `sourceMessageId`
  - [x] `data`
  - [x] `createdAt`
  - [x] `updatedAt`
- [x] Add `ModuleRecordEvent` model:
  - [x] `id`
  - [x] `moduleRecordId`
  - [x] `action`
  - [x] `description`
  - [x] `metadata`
  - [x] `createdAt`
- [x] Add `ModuleSignal` model:
  - [x] `id`
  - [x] `moduleId`
  - [x] `moduleRecordId`
  - [x] `signalType`
  - [x] `severity`
  - [x] `title`
  - [x] `description`
  - [x] `status`
  - [x] `metadata`
  - [x] `createdAt`
  - [x] `resolvedAt`
- [x] Add indexes:
  - [x] `BusinessModule.slug`
  - [x] `ModuleRecord.moduleId`
  - [x] `ModuleRecord.recordType`
  - [x] `ModuleRecord.status`
  - [x] `ModuleRecord.conversationId`
  - [x] `ModuleRecord.customerId`
  - [x] `ModuleSignal.moduleId`
  - [x] `ModuleSignal.signalType`
  - [x] `ModuleSignal.severity`
  - [x] `ModuleSignal.status`

Acceptance criteria:

- [x] Modules can store business records without bespoke tables.
- [x] Module records link back to conversations and source messages.
- [x] Modules can publish attention signals for the Reporter Agent.
- [x] Activity log can reference module records.

## Phase 5: Marketplace APIs

Goal: expose install/configure/read/write operations.

- [x] Add `GET /api/marketplace/modules`.
- [x] Add `GET /api/marketplace/modules/[slug]`.
- [x] Add `POST /api/marketplace/modules/[slug]` action endpoint:
  - [x] `install`
  - [x] `disable`
  - [x] `enable`
  - [x] `uninstall`
  - [x] `configure`
- [x] Add `GET /api/modules/[slug]/records`.
- [x] Add `POST /api/modules/[slug]/records`.
- [x] Add `GET /api/modules/[slug]/records/[id]`.
- [x] Add `PATCH /api/modules/[slug]/records/[id]`.
- [x] Add `POST /api/modules/[slug]/records/[id]/events`.
- [x] Add `GET /api/modules/signals`.
- [x] Add `POST /api/modules/signals`.
- [x] Add `PATCH /api/modules/signals/[id]`.
- [x] Add validation for module config and record data.
- [x] Add RBAC permissions:
  - [x] `marketplace:read`
  - [x] `marketplace:install`
  - [x] `module:read`
  - [x] `module:write`

Acceptance criteria:

- [x] Marketplace UI can install and configure modules through APIs.
- [x] Module records can be created by workflow actions.
- [x] Module records can be edited manually by admins.
- [x] Module signals can be created, filtered, and resolved through APIs.

## Phase 6: Module Workflow Integration

Goal: installed modules should provide usable automation.

- [x] Add module installer that can create:
  - [x] Workflows.
  - [x] Agents.
  - [x] KB categories.
  - [x] Canned responses.
  - [x] Tags.
  - [x] Approval rules.
  - [x] Dashboard widgets.
- [x] Add workflow action: `Create Module Record`.
- [x] Add workflow action: `Update Module Record`.
- [x] Add workflow action: `Find Module Record`.
- [x] Add workflow action: `Create Module Signal`.
- [x] Add workflow action: `Resolve Module Signal`.
- [x] Add workflow trigger: `Module Record Created`.
- [x] Add workflow trigger: `Module Record Updated`.
- [x] Add workflow trigger: `Module Signal Created`.
- [x] Add LLM extraction prompt templates per module.
- [x] Add module-specific source badges in conversations.
- [x] Add module activity logs for all workflow-created records.

Acceptance criteria:

- [x] Installing a module creates ready-to-use workflows.
- [x] An inbound Email/WhatsApp message can create a module record.
- [x] Workflow replies can reference module record fields.

## Phase 7: First Real Module - Orders

Goal: build the first end-to-end module around a common SME workflow.

Inputs:

- Customer sends order request by WhatsApp.
- Customer sends purchase order by Email.
- Customer asks to change or cancel an order.

Records:

- Order.
- Order line item.
- Order event.

Checklist:

- [x] Add Orders marketplace catalog entry.
- [x] Add Orders module install behavior.
- [x] Add `/modules/orders` list page.
- [x] Add `/modules/orders/[id]` detail page.
- [x] Add order statuses:
  - [x] `draft`
  - [x] `pending_approval`
  - [x] `confirmed`
  - [x] `fulfilled`
  - [x] `cancelled`
- [x] Add order fields:
  - [x] Customer.
  - [x] Source channel.
  - [x] Source conversation.
  - [x] Requested delivery date.
  - [x] Items.
  - [x] Quantity.
  - [x] Notes.
  - [x] Confidence score.
- [x] Add LLM extraction node template:
  - [x] Extract customer order intent.
  - [x] Extract product names.
  - [x] Extract quantities.
  - [x] Extract delivery notes.
  - [x] Return JSON.
- [x] Add workflow: `New Order From WhatsApp`.
- [x] Add workflow: `New Order From Email`.
- [x] Add approval step before confirmation.
- [x] Add customer confirmation reply template.
- [x] Add activity logs:
  - [x] Order extracted.
  - [x] Order approval requested.
  - [x] Order approved.
  - [x] Order confirmed to customer.
  - [x] Order cancelled.

Acceptance criteria:

- [x] Customer can send an order over WhatsApp and Cosstigo creates a draft order.
- [x] Customer can send a purchase order over Email and Cosstigo creates a draft order.
- [x] Support can approve before the system confirms the order.
- [x] Conversation shows the order source badge and linked record.

## Phase 8: Additional Marketplace Modules

Goal: provide broad SME coverage after Orders is proven.

### Customer Support

- [x] Ticket intake from Email and WhatsApp.
- [x] Refund approval.
- [x] Password reset escalation.
- [x] Complaint workflow.
- [x] Customer satisfaction follow-up.

### Sales CRM

- [x] Lead capture from Email and WhatsApp.
- [x] Product/pricing inquiry workflow.
- [x] Demo request workflow.
- [x] Quote request workflow.
- [x] Sales handoff to agent.

### Products

- [x] Product inquiry matching.
- [x] Product FAQ KB scope.
- [x] Product price request.
- [x] Catalog update from document/email.
- [x] Product availability reply.

### Inventory and Warehousing

- [x] Stock update intake.
- [x] Inbound shipment notice.
- [x] Low stock alert.
- [x] Warehouse task creation.
- [x] Inventory movement record.

### Supplier Management

- [x] Supplier quote intake.
- [x] Supplier delivery delay workflow.
- [x] Supplier issue ticket.
- [x] Quotation comparison.
- [x] Supplier reply approval.

### Finance and Billing

- [x] Invoice intake.
- [x] Payment proof review.
- [x] Billing dispute workflow.
- [x] Finance approval.
- [x] Payment reminder reply.

### HR and Recruitment

- [x] Resume intake.
- [x] Candidate summary.
- [x] Interview request workflow.
- [x] Leave request workflow.
- [x] HR approval.

### Procurement

- [x] Purchase request intake.
- [x] Supplier quote capture.
- [x] Manager approval.
- [x] Purchase order record.
- [x] Supplier order confirmation.

### Service Jobs and Field Work

- [x] Repair request intake.
- [x] Appointment request.
- [x] Technician assignment.
- [x] Job status update.
- [x] Customer service completion reply.

### Reporter Agent

- [x] Cross-module attention monitoring.
- [x] Low stock and pending order matching.
- [x] Overdue approval detection.
- [x] Unanswered customer conversation detection.
- [x] Supplier delay impact detection.
- [x] Finance/payment risk detection.
- [x] Daily management summary.
- [x] Weekly operations summary.
- [x] LLM-generated recommended action list.

Acceptance criteria:

- [x] Every module includes at least one Email workflow.
- [x] Every module includes at least one WhatsApp workflow.
- [x] Every module creates structured records.
- [x] Every module has activity logging.
- [x] Every risky module action can require approval.
- [x] Every installed module can expose signals to Reporter Agent.

## Phase 8A: Reporter Agent Cross-Module Monitoring

Goal: add an LLM-powered monitoring agent that checks all installed modules for conditions needing attention.

Reporter Agent should not replace module workflows. It watches module records, signals, conversations, tickets, approvals, and channel state, then reports what needs human attention.

Examples:

- Stock level is low and a new order is requesting that product.
- Supplier delivery is delayed and there are open customer orders depending on it.
- Finance invoice is overdue and the customer has an active order.
- A workflow approval is stale and the customer is waiting.
- A WhatsApp conversation has human takeover active but no admin reply.
- A product inquiry mentions an item with no KB/product match.

Checklist:

- [x] Add Reporter Agent marketplace catalog entry.
- [x] Add Reporter Agent install behavior.
- [x] Add Reporter Agent as a system agent type.
- [x] Add `/reporter` page or `/modules/reporter-agent` page.
- [x] Add Reporter Agent configuration:
  - [x] Enabled modules to monitor.
  - [x] Signal severity threshold.
  - [x] Report frequency.
  - [x] Notification recipients.
  - [x] Channels to notify: in-app, email, WhatsApp.
  - [x] Require approval before sending external notifications.
- [x] Add signal collectors:
  - [x] Inventory low-stock collector.
  - [x] Orders pending product collector.
  - [x] Supplier delay collector.
  - [x] Stale workflow approval collector.
  - [x] Unanswered conversation collector.
  - [x] Failed workflow/API action collector.
  - [x] Finance overdue collector.
- [x] Add LLM analysis step:
  - [x] Read active module signals.
  - [x] Join related module records.
  - [x] Rank urgency.
  - [x] Explain business impact.
  - [x] Recommend next action.
  - [x] Produce concise report.
- [x] Add report output types:
  - [x] Immediate critical alert.
  - [x] Daily digest.
  - [x] Weekly summary.
  - [x] Module-specific report.
- [x] Add Reporter Agent records:
  - [x] `report`
  - [x] `alert`
  - [x] `recommendation`
  - [x] `resolved_signal`
- [x] Add Reporter Agent activity logs:
  - [x] Signal detected.
  - [x] Signal correlated across modules.
  - [x] Report generated.
  - [x] Alert sent.
  - [x] Recommendation dismissed.
  - [x] Signal resolved.
- [x] Add Reporter Agent source badges in conversations when it sends internal or external alerts.
- [x] Add notification integration for high-severity reports.
- [x] Add workflow trigger: `Reporter Signal Created`.
- [x] Add workflow trigger: `Reporter Report Generated`.

Acceptance criteria:

- [x] Reporter Agent can detect low stock that affects open orders.
- [x] Reporter Agent can explain why a module needs attention.
- [x] Reporter Agent links every alert to the source module records.
- [x] Reporter Agent can notify admins without replying to customers by default.
- [x] External notifications require explicit configuration or approval.
- [x] Reporter Agent activity is visible in `/activity`.

## Phase 9: Module Pages and Navigation

Goal: installed modules should feel like real product areas.

- [x] Add Modules navigation entry for installed module workspaces. (Delivered in Phase 11: dynamic per-module sidebar navigation.)
- [x] Add `/modules` landing page.
- [x] Add `/modules/[slug]` generic record list page.
- [x] Add `/modules/[slug]/records/[id]` generic detail page.
- [x] Add module-specific page overrides for high-value modules. (Title/field-label overrides only, for 6 of 12 modules: orders, inventory-warehouse, finance-billing, supplier-management, sales-crm, reporter-agent. All modules still render through the shared generic page. See Phase 12.)
- [x] Add module record search.
- [x] Add module record filters.
- [x] Add module record export.
- [x] Add module dashboard widgets.
- [x] Add module record links in conversations.

Acceptance criteria:

- [x] Installed modules are visible in navigation.
- [x] Users can manage module records without leaving Cosstigo.
- [x] Conversation-created records are easy to find.

## Phase 10: Reporting and Governance

Goal: help owners understand module automation value and risk.

- [x] Add marketplace/module analytics:
  - [x] Records created by module.
  - [x] Automation success rate by module.
  - [x] Approval volume by module.
  - [x] AI extraction confidence by module.
  - [x] Manual correction rate by module.
  - [x] Reporter Agent signal volume by module.
  - [x] Reporter Agent alert resolution time.
  - [x] Reporter Agent false-positive dismissal rate.
- [x] Add module audit export.
- [x] Add Reporter Agent report export.
- [x] Add module permission controls.
- [x] Add module disable safeguards.
- [x] Add dependency checks before uninstall.
- [x] Add module versioning.
- [x] Add upgrade path for module templates and workflows.

Acceptance criteria:

- [x] Admin can see which modules are saving work.
- [x] Admin can audit module-created records.
- [x] Admin can audit Reporter Agent alerts and recommendations.
- [x] Admin can safely disable or uninstall a module.

## Phase 11: Dynamic Module Navigation

Goal: installing a module should add its own menu entry, so each module feels like a first-class product area.

- [x] Add a "Modules" sidebar section listing installed and enabled modules, one nav item per module.
- [x] Use each module's catalog icon for its nav item (shared icon map with the Marketplace page).
- [x] Hide the section entirely when no modules are installed.
- [x] Hide disabled modules from the sidebar (installed + enabled only).
- [x] Remove the static "Modules" sidebar link; keep "Marketplace".
- [x] Keep the `/modules` hub page reachable through in-page links (module workspace header) for its analytics overview.
- [x] Refresh the sidebar module list on route change so install, uninstall, enable, and disable are picked up on the next navigation.

Acceptance criteria:

- [x] Installing a module from Marketplace adds its nav entry after the next navigation.
- [x] Disabling or uninstalling a module removes its nav entry after the next navigation.
- [x] With zero installed modules, the sidebar shows no Modules section.
- [x] Collapsed sidebar mode shows module icons with tooltips.

## Phase 12: Comprehensive Module Workspaces

Goal: replace the shared generic record-table page with per-module comprehensive workspaces, driven by a workspace config (`src/lib/marketplace/workspace-config.ts`) that defines each module's field schemas, statuses, and record types.

- [x] Add per-module workspace config for all 12 modules: title, description, record types, statuses, field schemas, list columns, and status-transition actions.
- [x] Build Orders as the reference workspace:
  - [x] Order table with customer, requested delivery date, and quantity columns.
  - [x] Order statuses: draft, pending approval, confirmed, fulfilled, cancelled.
  - [x] Status pipeline tabs with live counts (All / Draft / Pending approval / Confirmed / Fulfilled / Cancelled).
  - [x] Structured order form instead of the raw JSON textarea.
  - [x] One-click order lifecycle actions: submit for approval, approve, reject, mark fulfilled, cancel — each logged to the record timeline.
  - [x] Line items table on the order detail page (parses extracted item arrays and multiline text).
  - [x] Customer confirmation reply action on confirmed/fulfilled orders that sends an admin message through the source conversation and logs a timeline event.
- [x] Inventory workspace: stock level, reorder point, warehouse, movement type fields; process/complete actions; low-stock row highlighting and low-stock count stat (stock level at or below reorder point).
- [x] Sales CRM workspace: lead stage select (new to won/lost), company, contact, budget, next step fields; qualify/close-deal actions; kanban board view grouped by stage with move-stage controls.
- [x] Finance workspace: invoice number, amount, due date, payment status fields; review/settle actions; overdue row highlighting and overdue count stat (due date passed and not paid).
- [x] Supplier workspace: quote amount, ETA, delay reason, contact fields; follow-up/resolve actions.
- [x] Replace generic JSON record creation with per-module structured forms (all modules).
- [x] Record detail page edits module fields as structured inputs; extraction output and unknown keys stay editable in a collapsible "Additional data" JSON section.
- [x] Per-module table columns and pipeline tabs on every module record list.
- [x] Extend structured workspaces and actions to the remaining modules (customer-care, products, procurement, hr-recruitment, field-service, office-productivity, reporter-agent).
- [x] Align reporter-agent catalog record types with the records the Reporter Agent actually creates (report, alert, recommendation, resolved signal).
- [x] Bespoke layouts per module beyond the shared structure: Sales CRM kanban board (table/board toggle), Inventory low-stock view, Finance overdue tracking.

Acceptance criteria:

- [x] Installing a module yields a workspace with its own name, description, fields, statuses, and pipeline, not a generic record table.
- [x] Users never need to hand-edit JSON to create or update a module record.
- [x] Each workspace surfaces the module's own statuses, fields, and one-click actions.
- [x] High-value modules add module-specific actions (order approval flow verified end-to-end).

## Recommended Build Order

1. Make `/activity` log real events.
2. Improve `/activity` filters and detail view.
3. Add `/marketplace` static catalog.
4. Add module install state.
5. Add generic module data models.
6. Add module APIs.
7. Add workflow action to create module records.
8. Build Orders as the first full module.
9. Add module signals.
10. Build Reporter Agent cross-module monitoring.
11. Add installed module navigation and record pages.
12. Add Sales CRM, Finance, Inventory, and Supplier modules.
13. Add module analytics and governance.

## Definition of Done

- [x] Activity Log is populated by real system activity.
- [x] Marketplace can show installable modules.
- [x] Installing a module creates workflows and configuration.
- [x] At least one full module can convert Email/WhatsApp input into a structured record.
- [x] Reporter Agent can monitor installed modules and report attention items.
- [x] Module-created records are visible from both the module page and the source conversation.
- [x] Every automated module action is traceable through Activity Log.
- [x] Installing a module adds its own navigation entry.
- [x] Each installed module provides a comprehensive workspace, not a generic record table.
