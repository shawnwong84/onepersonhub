"use client";

import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Bell,
  Bot,
  Braces,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Code2,
  CornerDownRight,
  Edit3,
  GitBranch,
  Globe2,
  Hash,
  HelpCircle,
  Loader2,
  Mail,
  MessageSquareReply,
  ShieldCheck,
  Play,
  Plus,
  Route,
  Save,
  Search,
  Sparkles,
  Tag,
  Trash2,
  UserPlus,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { unwrapListResponse } from "@/lib/api-response";
import { cn, formatRelativeTime } from "@/lib/utils";

type WorkflowNodeType = "trigger" | "condition" | "action" | "approval" | "delay" | "llm" | "end";

interface WorkflowNodeData {
  label: string;
  nodeType: WorkflowNodeType;
  triggerEvent?: string;
  channel?: string;
  filters?: Record<string, string>;
  conditionField?: string;
  conditionOperator?: string;
  conditionValue?: string;
  /** Node id executed when the condition is false; unset means the flow stops. */
  falseTargetId?: string;
  actionType?: string;
  actionValue?: string;
  replyText?: string;
  apiUrl?: string;
  apiMethod?: string;
  apiQueryParams?: string;
  apiHeaders?: string;
  apiBodyMode?: string;
  apiBody?: string;
  ticketTitle?: string;
  ticketDescription?: string;
  ticketPriority?: string;
  moduleSlug?: string;
  moduleRecordType?: string;
  moduleRecordTitle?: string;
  moduleRecordStatus?: string;
  moduleRecordPriority?: string;
  moduleRecordData?: string;
  moduleRecordId?: string;
  moduleRecordSearch?: string;
  moduleRecordUpdateData?: string;
  moduleSignalType?: string;
  moduleSignalSeverity?: string;
  moduleSignalTitle?: string;
  moduleSignalDescription?: string;
  moduleSignalData?: string;
  moduleSignalId?: string;
  mcpServer?: string;
  mcpTool?: string;
  mcpInput?: string;
  skillName?: string;
  skillPrompt?: string;
  llmInstruction?: string;
  llmPrompt?: string;
  llmOutputMode?: string;
  stepCategory?: string;
  approvalTitle?: string;
  approvalInstructions?: string;
  approvalTarget?: string;
  delayAmount?: number;
  delayUnit?: string;
}

interface WorkflowNode {
  id: string;
  type: "workflow";
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  type?: string;
}

interface FlowData {
  id: string;
  name: string;
  description: string;
  startNodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isActive: boolean;
  priority: number;
  triggerCount: number;
  runs?: WorkflowRunSummary[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowRunSummary {
  id: string;
  status: string;
  reason: string;
  createdAt: string;
  completedAt?: string | null;
}

interface FlowTemplateData {
  id: string;
  name: string;
  description: string;
  recommendedChannel: string;
  stepCount: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface ReferenceOption {
  value: string;
  label: string;
  description?: string;
}

interface FlowReferenceData {
  teamMembers: ReferenceOption[];
  tags: ReferenceOption[];
  categories: ReferenceOption[];
  cannedResponses: ReferenceOption[];
  agents: ReferenceOption[];
}

interface StepDefinition {
  actionType: string;
  label: string;
  description: string;
  nodeType: Exclude<WorkflowNodeType, "trigger" | "end">;
  category: "Customer" | "Logic" | "Data" | "Routing" | "External" | "AI";
  icon: React.ElementType;
  defaults: Partial<WorkflowNodeData>;
}

const triggerOptions = [
  { value: "", label: "Select trigger..." },
  { value: "message_received", label: "New Message Received", channel: "any" },
  { value: "email_received", label: "New Email Received", channel: "email" },
  { value: "whatsapp_message", label: "WhatsApp Message Received", channel: "whatsapp" },
  { value: "ticket_created", label: "Ticket Created", channel: "ticket" },
  { value: "ticket_status_changed", label: "Ticket Status Changed", channel: "ticket" },
  { value: "customer_created", label: "Customer Created", channel: "customer" },
  { value: "customer_updated", label: "Customer Updated", channel: "customer" },
  { value: "tag_added", label: "Tag Added", channel: "customer" },
  { value: "webhook_received", label: "Webhook Received", channel: "api" },
  { value: "scheduled", label: "Scheduled / Recurring", channel: "system" },
];

const stepCatalog: StepDefinition[] = [
  {
    actionType: "reply_customer",
    label: "Reply Customer",
    description: "Send a message back on the same channel",
    nodeType: "action",
    category: "Customer",
    icon: MessageSquareReply,
    defaults: { replyText: "Thanks for contacting us. We are checking this now." },
  },
  {
    actionType: "send_email",
    label: "Send Email",
    description: "Compose and send an email",
    nodeType: "action",
    category: "Customer",
    icon: Mail,
    defaults: { actionValue: "support@example.com" },
  },
  {
    actionType: "send_notification",
    label: "Send Notification",
    description: "Alert a team member or channel",
    nodeType: "action",
    category: "Customer",
    icon: Bell,
    defaults: { actionValue: "New workflow notification" },
  },
  {
    actionType: "condition",
    label: "Condition",
    description: "Branch based on message, channel, tag, or priority",
    nodeType: "condition",
    category: "Logic",
    icon: GitBranch,
    defaults: {
      conditionField: "message",
      conditionOperator: "contains",
      conditionValue: "urgent",
    },
  },
  {
    actionType: "wait",
    label: "Wait",
    description: "Pause execution before the next step",
    nodeType: "delay",
    category: "Logic",
    icon: CornerDownRight,
    defaults: { delayAmount: 15, delayUnit: "minutes" },
  },
  {
    actionType: "approval_required",
    label: "Approval Required",
    description: "Pause until customer service approves the next step",
    nodeType: "approval",
    category: "Logic",
    icon: ShieldCheck,
    defaults: {
      approvalTitle: "Approve next workflow step",
      approvalInstructions: "Review the proposed next action before it runs.",
      approvalTarget: "next_step",
    },
  },
  {
    actionType: "add_tag",
    label: "Add Tag",
    description: "Attach a tag to the customer",
    nodeType: "action",
    category: "Data",
    icon: Tag,
    defaults: { actionValue: "needs-review" },
  },
  {
    actionType: "update_customer",
    label: "Update Customer Field",
    description: "Change a customer profile field",
    nodeType: "action",
    category: "Data",
    icon: Hash,
    defaults: { actionValue: "field=value" },
  },
  {
    actionType: "create_module_record",
    label: "Create Module Record",
    description: "Store structured data in an installed module",
    nodeType: "action",
    category: "Data",
    icon: Code2,
    defaults: {
      moduleSlug: "orders",
      moduleRecordType: "order",
      moduleRecordTitle: "{{message}}",
      moduleRecordStatus: "open",
      moduleRecordPriority: "normal",
      moduleRecordData: "{\n  \"message\": \"{{message}}\",\n  \"channel\": \"{{channel}}\",\n  \"previousOutput\": \"{{previous.output}}\"\n}",
    },
  },
  {
    actionType: "create_module_signal",
    label: "Create Module Signal",
    description: "Alert Reporter Agent about an attention item",
    nodeType: "action",
    category: "Data",
    icon: Bell,
    defaults: {
      moduleSlug: "reporter-agent",
      moduleSignalType: "attention_required",
      moduleSignalSeverity: "medium",
      moduleSignalTitle: "{{message}}",
      moduleSignalDescription: "Reporter Agent should review this workflow output: {{previous.output}}",
      moduleSignalData: "{\n  \"message\": \"{{message}}\",\n  \"channel\": \"{{channel}}\",\n  \"conversationId\": \"{{conversationId}}\"\n}",
    },
  },
  {
    actionType: "find_module_record",
    label: "Find Module Record",
    description: "Find a module record and pass it to the next step",
    nodeType: "action",
    category: "Data",
    icon: Search,
    defaults: {
      moduleSlug: "orders",
      moduleRecordSearch: "{{message}}",
    },
  },
  {
    actionType: "update_module_record",
    label: "Update Module Record",
    description: "Update an existing module record",
    nodeType: "action",
    category: "Data",
    icon: Hash,
    defaults: {
      moduleSlug: "orders",
      moduleRecordId: "{{previous.output}}",
      moduleRecordStatus: "in_progress",
      moduleRecordUpdateData: "{\n  \"workflowUpdate\": \"{{message}}\"\n}",
    },
  },
  {
    actionType: "resolve_module_signal",
    label: "Resolve Module Signal",
    description: "Close a Reporter Agent signal",
    nodeType: "action",
    category: "Data",
    icon: CheckCircle2,
    defaults: {
      moduleSlug: "reporter-agent",
      moduleSignalId: "{{previous.output}}",
    },
  },
  {
    actionType: "assign_agent",
    label: "Assign to Agent",
    description: "Route to a team member",
    nodeType: "action",
    category: "Routing",
    icon: UserPlus,
    defaults: { actionValue: "Support" },
  },
  {
    actionType: "create_ticket",
    label: "Create Ticket",
    description: "Open an internal ticket",
    nodeType: "action",
    category: "Routing",
    icon: Route,
    defaults: {
      ticketTitle: "Workflow follow-up: {{message}}",
      ticketDescription: "Created by workflow from {{channel}} message:\n\n{{message}}",
      ticketPriority: "medium",
    },
  },
  {
    actionType: "call_api",
    label: "Call API",
    description: "Send data to an external HTTP API",
    nodeType: "action",
    category: "External",
    icon: Webhook,
    defaults: {
      apiMethod: "POST",
      apiUrl: "https://example.com/webhook",
      apiQueryParams: "{}",
      apiHeaders: "{\"Authorization\":\"Bearer {{secret.apiToken}}\"}",
      apiBodyMode: "json",
      apiBody: "{\n  \"conversationId\": \"{{conversationId}}\",\n  \"channel\": \"{{channel}}\",\n  \"message\": \"{{message}}\",\n  \"previousOutput\": \"{{previous.output}}\"\n}",
    },
  },
  {
    actionType: "call_mcp_tool",
    label: "Call MCP Tool",
    description: "Invoke a configured MCP tool",
    nodeType: "action",
    category: "External",
    icon: Braces,
    defaults: { mcpServer: "default", mcpTool: "tool_name", mcpInput: "{}" },
  },
  {
    actionType: "run_skill",
    label: "Run Skill",
    description: "Use a reusable skill prompt",
    nodeType: "action",
    category: "AI",
    icon: Sparkles,
    defaults: { skillName: "support-triage", skillPrompt: "Classify and propose next action." },
  },
  {
    actionType: "llm",
    label: "LLM",
    description: "Generate structured output for the next step",
    nodeType: "llm",
    category: "AI",
    icon: Bot,
    defaults: {
      llmInstruction: "You are a workflow step. Return only the requested output for the next node.",
      llmPrompt: "Use the customer message and previous workflow context to produce the next-step output.\n\nCustomer message:\n{{message}}\n\nPrevious output:\n{{previous.output}}",
      llmOutputMode: "text",
    },
  },
  {
    actionType: "ai_reply",
    label: "Generate AI Reply",
    description: "Draft a response from knowledge base context",
    nodeType: "action",
    category: "AI",
    icon: Bot,
    defaults: { actionValue: "Use conversation context and active knowledge entries." },
  },
];

const categoryOrder: StepDefinition["category"][] = [
  "Customer",
  "Logic",
  "Data",
  "Routing",
  "External",
  "AI",
];

const emptyReferenceData: FlowReferenceData = {
  teamMembers: [],
  tags: [],
  categories: [],
  cannedResponses: [],
  agents: [],
};

const CHANNEL_REFERENCE_OPTIONS: ReferenceOption[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "sms", label: "SMS" },
  { value: "telegram", label: "Telegram" },
];

const PRIORITY_OPTIONS: ReferenceOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const CUSTOMER_FIELD_OPTIONS: ReferenceOption[] = [
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "tags", label: "Tags" },
];

const VALUE_REFERENCE_OPTIONS: ReferenceOption[] = [
  { value: "{{customer.name}}", label: "Customer name" },
  { value: "{{customer.email}}", label: "Customer email" },
  { value: "{{customer.phone}}", label: "Customer phone" },
  { value: "{{customer.whatsapp}}", label: "Customer WhatsApp" },
  { value: "{{message}}", label: "Incoming message" },
  { value: "{{previous.output}}", label: "Previous node output" },
  { value: "{{channel}}", label: "Channel" },
  { value: "{{flow.name}}", label: "Workflow name" },
];

const AI_REPLY_INSTRUCTION_OPTIONS: ReferenceOption[] = [
  { value: "Use conversation context and active knowledge entries.", label: "Use KB and conversation context" },
  { value: "Draft a concise acknowledgement and escalate if confidence is low.", label: "Acknowledge and escalate if unsure" },
  { value: "Summarize the customer's issue and ask one clarifying question.", label: "Ask clarifying question" },
];

const LLM_OUTPUT_MODE_OPTIONS: ReferenceOption[] = [
  { value: "text", label: "Text" },
  { value: "json", label: "JSON" },
  { value: "customer_reply", label: "Customer reply draft" },
];

const SKILL_OPTIONS: ReferenceOption[] = [
  { value: "support-triage", label: "Support triage" },
  { value: "refund-review", label: "Refund review" },
  { value: "billing-classifier", label: "Billing classifier" },
  { value: "sales-qualification", label: "Sales qualification" },
];

const MCP_SERVER_OPTIONS: ReferenceOption[] = [
  { value: "default", label: "Default MCP server" },
  { value: "github", label: "GitHub" },
  { value: "slack", label: "Slack" },
  { value: "notion", label: "Notion" },
];

const MCP_TOOL_OPTIONS: Record<string, ReferenceOption[]> = {
  default: [{ value: "call_tool", label: "Call configured tool" }],
  github: [
    { value: "create_issue", label: "Create issue" },
    { value: "search_issues", label: "Search issues" },
  ],
  slack: [
    { value: "send_message", label: "Send message" },
    { value: "lookup_user", label: "Lookup user" },
  ],
  notion: [
    { value: "create_page", label: "Create page" },
    { value: "search_pages", label: "Search pages" },
  ],
};

const MCP_INPUT_TEMPLATE_OPTIONS: ReferenceOption[] = [
  { value: "{}", label: "Empty JSON" },
  { value: "{\"message\":\"{{message}}\",\"channel\":\"{{channel}}\"}", label: "Message and channel" },
  { value: "{\"customerId\":\"{{customer.id}}\",\"message\":\"{{message}}\"}", label: "Customer and message" },
];

const API_QUERY_EXAMPLES: ReferenceOption[] = [
  { value: "{}", label: "No query parameters" },
  { value: "{\n  \"conversationId\": \"{{conversationId}}\",\n  \"channel\": \"{{channel}}\"\n}", label: "Conversation and channel" },
  { value: "{\n  \"customerId\": \"{{customer.id}}\"\n}", label: "Customer id" },
];

const API_HEADER_EXAMPLES: ReferenceOption[] = [
  { value: "{}", label: "No custom headers" },
  { value: "{\n  \"Authorization\": \"Bearer {{secret.apiToken}}\"\n}", label: "Bearer token" },
  { value: "{\n  \"X-Conversation-Id\": \"{{conversationId}}\",\n  \"X-Channel\": \"{{channel}}\"\n}", label: "Conversation headers" },
];

const API_BODY_EXAMPLES: ReferenceOption[] = [
  { value: "{}", label: "Empty JSON" },
  {
    value:
      "{\n  \"message\": \"{{message}}\",\n  \"channel\": \"{{channel}}\",\n  \"conversationId\": \"{{conversationId}}\"\n}",
    label: "Message payload",
  },
  {
    value:
      "{\n  \"customerId\": \"{{customer.id}}\",\n  \"customerName\": \"{{customer.name}}\",\n  \"previousOutput\": \"{{previous.output}}\"\n}",
    label: "Customer and previous output",
  },
  {
    value:
      "{\n  \"event\": \"workflow.step\",\n  \"flow\": \"{{flow.name}}\",\n  \"data\": {\n    \"message\": \"{{message}}\",\n    \"result\": \"{{previous.output}}\"\n  }\n}",
    label: "Nested event payload",
  },
];

const MODULE_OPTIONS: ReferenceOption[] = [
  { value: "customer-care", label: "Customer Care" },
  { value: "orders", label: "Orders" },
  { value: "products", label: "Products" },
  { value: "inventory-warehouse", label: "Inventory and Warehouse" },
  { value: "supplier-management", label: "Supplier Management" },
  { value: "finance-billing", label: "Finance and Billing" },
  { value: "sales-crm", label: "Sales CRM" },
  { value: "procurement", label: "Procurement" },
  { value: "hr-recruitment", label: "HR and Recruitment" },
  { value: "field-service", label: "Field Service" },
  { value: "reporter-agent", label: "Reporter Agent" },
];

const MODULE_RECORD_TYPE_OPTIONS: ReferenceOption[] = [
  { value: "order", label: "Order" },
  { value: "product", label: "Product" },
  { value: "stock_alert", label: "Stock alert" },
  { value: "supplier_update", label: "Supplier update" },
  { value: "invoice_case", label: "Invoice case" },
  { value: "lead", label: "Lead" },
  { value: "purchase_request", label: "Purchase request" },
  { value: "service_job", label: "Service job" },
  { value: "attention_report", label: "Attention report" },
];

const MODULE_SIGNAL_TYPE_OPTIONS: ReferenceOption[] = [
  { value: "attention_required", label: "Attention required" },
  { value: "low_stock", label: "Low stock" },
  { value: "order_blocked", label: "Order blocked" },
  { value: "supplier_delay", label: "Supplier delay" },
  { value: "approval_overdue", label: "Approval overdue" },
  { value: "delivery_failed", label: "Delivery failed" },
  { value: "sla_risk", label: "SLA risk" },
];

const TICKET_TITLE_TEMPLATE_OPTIONS: ReferenceOption[] = [
  { value: "Workflow follow-up: {{message}}", label: "Workflow follow-up with message" },
  { value: "{{channel}} customer needs support", label: "Channel customer needs support" },
  { value: "Urgent issue from {{customer.name}}", label: "Urgent customer issue" },
];

const TICKET_DESCRIPTION_TEMPLATE_OPTIONS: ReferenceOption[] = [
  { value: "Created by workflow from {{channel}} message:\n\n{{message}}", label: "Channel and message" },
  { value: "Customer: {{customer.name}}\nChannel: {{channel}}\nMessage: {{message}}", label: "Customer, channel, and message" },
  { value: "Workflow {{flow.name}} created this ticket for human follow-up.", label: "Human follow-up summary" },
];

const emptyWorkflow = {
  name: "Untitled Workflow",
  description: "",
  triggerEvent: "",
  filters: {},
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function makeTriggerNode(triggerEvent: string): WorkflowNode {
  const trigger = triggerOptions.find((option) => option.value === triggerEvent);
  return {
    id: makeId("trigger"),
    type: "workflow",
    position: { x: 0, y: 0 },
    data: {
      label: trigger?.label || "Workflow Trigger",
      nodeType: "trigger",
      triggerEvent,
      channel: trigger?.channel || "any",
      filters: {},
    },
  };
}

function makeStepNode(step: StepDefinition, index: number): WorkflowNode {
  return {
    id: makeId("step"),
    type: "workflow",
    position: { x: 0, y: 160 + index * 140 },
    data: {
      label: step.label,
      nodeType: step.nodeType,
      actionType: step.actionType,
      stepCategory: step.category,
      ...step.defaults,
    },
  };
}

function buildEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
  const edges: WorkflowEdge[] = nodes.slice(0, -1).map((node, index) => ({
    id: `${node.id}-${nodes[index + 1].id}`,
    source: node.id,
    target: nodes[index + 1].id,
    sourceHandle: node.data.nodeType === "condition" ? "true" : null,
    type: "execution",
  }));

  // Condition false branches: only forward jumps, so a flow cannot loop.
  for (const [index, node] of nodes.entries()) {
    const falseTargetId = node.data.falseTargetId;
    if (node.data.nodeType !== "condition" || !falseTargetId) continue;
    const targetIndex = nodes.findIndex((candidate) => candidate.id === falseTargetId);
    if (targetIndex <= index) continue;
    edges.push({
      id: `${node.id}-false-${falseTargetId}`,
      source: node.id,
      target: falseTargetId,
      sourceHandle: "false",
      type: "execution",
    });
  }

  return edges;
}

export function FlowsPageClient({ initialFlowId }: { initialFlowId?: string }) {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowData[]>([]);
  const [templates, setTemplates] = useState<FlowTemplateData[]>([]);
  const [installingTemplateId, setInstallingTemplateId] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<FlowData | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "editor">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft">("all");
  const [name, setName] = useState(emptyWorkflow.name);
  const [description, setDescription] = useState(emptyWorkflow.description);
  const [triggerEvent, setTriggerEvent] = useState(emptyWorkflow.triggerEvent);
  const [triggerFilters, setTriggerFilters] = useState<Record<string, string>>({});
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [referenceData, setReferenceData] = useState<FlowReferenceData>(emptyReferenceData);

  const triggerNode = nodes.find((node) => node.data.nodeType === "trigger") || null;
  const executionNodes = nodes.filter((node) => node.data.nodeType !== "trigger");
  const selectedStep = executionNodes.find((node) => node.id === selectedStepId) || null;
  const selectedTrigger = triggerOptions.find((option) => option.value === triggerEvent);

  const groupedSteps = useMemo(
    () =>
      categoryOrder.map((category) => ({
        category,
        items: stepCatalog.filter((step) => step.category === category),
      })),
    []
  );

  const filteredFlows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return flows.filter((flow) => {
      const trigger = getFlowTrigger(flow);
      const matchesSearch =
        !query ||
        flow.name.toLowerCase().includes(query) ||
        flow.description.toLowerCase().includes(query) ||
        trigger.label.toLowerCase().includes(query) ||
        trigger.channel.toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && flow.isActive) ||
        (statusFilter === "draft" && !flow.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [flows, searchQuery, statusFilter]);

  const loadFlows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/flows?limit=100");
      if (!res.ok) return;
      const payload = await res.json();
      const list = unwrapListResponse<FlowData>(payload);
      setFlows(list);
    } finally {
      setLoading(false);
    }
  }, []);

  // Flows are always fetched priority-ascending, so adjacent list positions
  // are adjacent priorities — moving a flow just swaps its priority value
  // with its neighbor's. The swap plan is computed from `flows` up front and
  // the fetch calls happen outside the setFlows updater — an updater with
  // side effects gets invoked twice by React Strict Mode in development
  // (by design, to catch exactly this), which would double-fire the PUTs.
  const reorderFlow = useCallback(
    (flowId: string, direction: "up" | "down") => {
      const index = flows.findIndex((f) => f.id === flowId);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= flows.length) return;

      const a = flows[index];
      const b = flows[targetIndex];

      setFlows((current) =>
        current
          .map((f) => {
            if (f.id === a.id) return { ...f, priority: b.priority };
            if (f.id === b.id) return { ...f, priority: a.priority };
            return f;
          })
          .sort((x, y) => x.priority - y.priority)
      );

      Promise.all([
        fetch(`/api/flows/${a.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: b.priority }),
        }),
        fetch(`/api/flows/${b.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: a.priority }),
        }),
      ]).catch(() => loadFlows());
    },
    [flows, loadFlows]
  );

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/flow-templates");
    if (!res.ok) return;
    const payload = await res.json();
    setTemplates(Array.isArray(payload.items) ? payload.items : []);
  }, []);

  const loadReferenceData = useCallback(async () => {
    try {
      const [membersRes, tagsRes, categoriesRes, cannedRes, agentsRes] = await Promise.all([
        fetch("/api/team/members?limit=100"),
        fetch("/api/tags?limit=100"),
        fetch("/api/knowledge/categories?limit=100"),
        fetch("/api/canned-responses?limit=100"),
        fetch("/api/agents?limit=100"),
      ]);

      const [membersPayload, tagsPayload, categoriesPayload, cannedPayload, agentsPayload] =
        await Promise.all([
          membersRes.ok ? membersRes.json() : null,
          tagsRes.ok ? tagsRes.json() : null,
          categoriesRes.ok ? categoriesRes.json() : null,
          cannedRes.ok ? cannedRes.json() : null,
          agentsRes.ok ? agentsRes.json() : null,
        ]);

      const members = unwrapListResponse<{
        id: string;
        name: string;
        email: string;
        department?: { name: string };
      }>(membersPayload);
      const tags = unwrapListResponse<{ id: string; name: string }>(tagsPayload);
      const categories = unwrapListResponse<{ id: string; name: string; description: string }>(categoriesPayload);
      const canned = unwrapListResponse<{ id: string; title: string; content: string; category: string }>(cannedPayload);
      const agents = unwrapListResponse<{ id: string; name: string; status: string; metadata?: { channel?: string } }>(agentsPayload);

      setReferenceData({
        teamMembers: members.map((member) => ({
          value: member.email || member.name,
          label: member.name,
          description: [member.email, member.department?.name].filter(Boolean).join(" - "),
        })),
        tags: tags.map((tag) => ({ value: tag.name, label: tag.name })),
        categories: categories.map((category) => ({
          value: category.name,
          label: category.name,
          description: category.description,
        })),
        cannedResponses: canned.map((response) => ({
          value: response.content,
          label: response.title,
          description: response.category,
        })),
        agents: agents.map((agent) => ({
          value: agent.name,
          label: agent.name,
          description: [agent.status, agent.metadata?.channel].filter(Boolean).join(" - "),
        })),
      });
    } catch {
      setReferenceData(emptyReferenceData);
    }
  }, []);

  useEffect(() => {
    loadFlows();
    loadTemplates();
    loadReferenceData();
  }, [loadFlows, loadTemplates, loadReferenceData]);

  const selectFlow = useCallback((flow: FlowData, options: { updateUrl?: boolean } = {}) => {
    const updateUrl = options.updateUrl ?? true;
    const falseEdges = (Array.isArray(flow.edges) ? flow.edges : []).filter(
      (edge) => edge.sourceHandle === "false"
    );
    const loadedNodes = (Array.isArray(flow.nodes) ? flow.nodes : []).map((node) => {
      const falseEdge = falseEdges.find((edge) => edge.source === node.id);
      return falseEdge
        ? { ...node, data: { ...node.data, falseTargetId: falseEdge.target } }
        : node;
    });
    const loadedTrigger = loadedNodes.find((node) => node.data.nodeType === "trigger");
    setSelectedFlow(flow);
    setName(flow.name);
    setDescription(flow.description);
    setTriggerEvent(loadedTrigger?.data.triggerEvent || "");
    setTriggerFilters(loadedTrigger?.data.filters || {});
    setNodes(loadedNodes);
    setSelectedStepId(null);
    setIsActive(flow.isActive);
    setValidation(null);
    setViewMode("editor");
    if (updateUrl) {
      router.push(`/flows/${flow.id}`);
    }
  }, [router]);

  const createWorkflow = useCallback((options: { updateUrl?: boolean } = {}) => {
    const updateUrl = options.updateUrl ?? true;
    setSelectedFlow(null);
    setName(emptyWorkflow.name);
    setDescription(emptyWorkflow.description);
    setTriggerEvent("");
    setTriggerFilters({});
    setNodes([]);
    setSelectedStepId(null);
    setIsActive(false);
    setValidation(null);
    setViewMode("editor");
    if (updateUrl) {
      router.push("/flows/new");
    }
  }, [router]);

  async function installTemplate(templateId: string) {
    setInstallingTemplateId(templateId);
    try {
      const res = await fetch(`/api/flow-templates/${templateId}/install`, {
        method: "POST",
      });
      if (!res.ok) return;
      const flow = await res.json();
      await loadFlows();
      selectFlow(flow);
    } finally {
      setInstallingTemplateId(null);
    }
  }

  function updateTrigger(nextTrigger: string) {
    setTriggerEvent(nextTrigger);
    setValidation(null);
    if (!nextTrigger) {
      setNodes((current) => current.filter((node) => node.data.nodeType !== "trigger"));
      return;
    }

    setNodes((current) => {
      const existingTrigger = current.find((node) => node.data.nodeType === "trigger");
      const trigger = triggerOptions.find((option) => option.value === nextTrigger);
      if (!existingTrigger) {
        return [makeTriggerNode(nextTrigger), ...current];
      }
      return current.map((node) =>
        node.id === existingTrigger.id
          ? {
              ...node,
              data: {
                ...node.data,
                label: trigger?.label || "Workflow Trigger",
                triggerEvent: nextTrigger,
                channel: trigger?.channel || "any",
                filters: triggerFilters,
              },
            }
          : node
      );
    });
  }

  function updateTriggerFilter(key: string, value: string) {
    setTriggerFilters((current) => ({ ...current, [key]: value }));
    setNodes((current) =>
      current.map((node) =>
        node.data.nodeType === "trigger"
          ? { ...node, data: { ...node.data, filters: { ...node.data.filters, [key]: value } } }
          : node
      )
    );
  }

  function clearTriggerFilters() {
    setTriggerFilters({});
    setNodes((current) =>
      current.map((node) =>
        node.data.nodeType === "trigger"
          ? { ...node, data: { ...node.data, filters: {} } }
          : node
      )
    );
    setValidation(null);
  }

  function addStep(step: StepDefinition) {
    const next = makeStepNode(step, executionNodes.length);
    setNodes((current) => [...current, next]);
    setSelectedStepId(next.id);
    setValidation(null);
  }

  function updateStep(data: Partial<WorkflowNodeData>) {
    if (!selectedStepId) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedStepId ? { ...node, data: { ...node.data, ...data } } : node
      )
    );
  }

  function removeStep(id: string) {
    setNodes((current) => current.filter((node) => node.id !== id));
    if (selectedStepId === id) setSelectedStepId(null);
    setValidation(null);
  }

  async function saveFlow(nextActive = isActive): Promise<FlowData | null> {
    setSaving(true);
    try {
      const orderedNodes = nodes.map((node, index) => ({
        ...node,
        position: { x: 0, y: index * 160 },
      }));
      const payload = {
        name: name.trim() || "Untitled Workflow",
        description,
        startNodeId: triggerNode?.id || "",
        nodes: orderedNodes,
        edges: buildEdges(orderedNodes),
        isActive: nextActive,
      };
      const res = await fetch(selectedFlow ? `/api/flows/${selectedFlow.id}` : "/api/flows", {
        method: selectedFlow ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return null;
      const saved = await res.json();
      setSelectedFlow(saved);
      setIsActive(saved.isActive);
      setNodes(saved.nodes || []);
      await loadFlows();
      if (!selectedFlow) {
        router.replace(`/flows/${saved.id}`);
      }
      return saved;
    } finally {
      setSaving(false);
    }
  }

  async function validateFlow() {
    const flow = selectedFlow || (await saveFlow(false));
    if (!flow) return;
    const res = await fetch(`/api/flows/${flow.id}/validate`, { method: "POST" });
    if (res.ok) {
      setValidation(await res.json());
    }
  }

  async function deleteFlow() {
    if (!selectedFlow) return;
    const res = await fetch(`/api/flows/${selectedFlow.id}`, { method: "DELETE" });
    if (!res.ok) return;
    createWorkflow({ updateUrl: false });
    setViewMode("list");
    router.push("/flows");
    await loadFlows();
  }

  function closeEditor() {
    setSelectedStepId(null);
    setValidation(null);
    setViewMode("list");
    router.push("/flows");
  }

  useEffect(() => {
    if (!initialFlowId || loading) return;

    if (initialFlowId === "new") {
      createWorkflow({ updateUrl: false });
      return;
    }

    if (selectedFlow?.id === initialFlowId) return;

    const flow = flows.find((item) => item.id === initialFlowId);
    if (flow) {
      selectFlow(flow, { updateUrl: false });
      return;
    }

    let canceled = false;
    fetch(`/api/flows/${initialFlowId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((flow: FlowData | null) => {
        if (!canceled && flow) {
          selectFlow(flow, { updateUrl: false });
        }
      })
      .catch(() => {
        if (!canceled) setViewMode("list");
      });

    return () => {
      canceled = true;
    };
  }, [initialFlowId, loading, flows, selectedFlow?.id, createWorkflow, selectFlow]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-owly-bg text-owly-text">
      {viewMode === "list" ? (
        <WorkflowListView
          flows={filteredFlows}
          loading={loading}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onCreate={createWorkflow}
          onOpen={selectFlow}
          templates={templates}
          installingTemplateId={installingTemplateId}
          onInstallTemplate={installTemplate}
          onReorder={reorderFlow}
          canReorder={statusFilter === "all" && !searchQuery.trim()}
        />
      ) : (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-[320px] flex-shrink-0 overflow-y-auto border-r border-owly-border bg-owly-surface">
          <div className="border-b border-owly-border px-5 py-4">
            <div className="flex items-center gap-2 text-sm text-owly-text-light">
              <button
                onClick={closeEditor}
                className="rounded-md p-1 text-owly-text-light hover:bg-owly-primary-50 hover:text-owly-text"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span>Workflows</span>
              <span>/</span>
              <span className="font-semibold text-owly-text">{name || "Untitled Workflow"}</span>
              <Edit3 className="h-3.5 w-3.5" />
            </div>
          </div>

          <div className="space-y-6 p-5">
            <section className="space-y-3">
              <PanelTitle icon={Edit3} label="Details" />
              <Label text="Name" required />
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g., Auto-Reply to Support"
                className="w-full rounded-lg border border-owly-border bg-owly-bg px-3 py-2.5 text-sm font-semibold text-owly-text outline-none focus:border-owly-primary"
              />
              <Label text="Description" />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What does this workflow do?"
                rows={3}
                className="w-full rounded-lg border border-owly-border bg-owly-bg px-3 py-2.5 text-sm text-owly-text outline-none focus:border-owly-primary"
              />
            </section>

            <section className="space-y-3 border-t border-owly-border pt-5">
              <PanelTitle icon={Zap} label="Trigger" />
              <Label text="When this happens" required />
              <select
                value={triggerEvent}
                onChange={(event) => updateTrigger(event.target.value)}
                className="w-full rounded-lg border border-owly-border bg-owly-bg px-3 py-2.5 text-sm font-semibold text-owly-text outline-none focus:border-owly-primary"
              >
                {triggerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              {triggerEvent && (
                <div className="rounded-lg border border-owly-border bg-owly-bg p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-owly-text">
                    <Globe2 className="h-4 w-4 text-owly-primary" />
                    Channel Filters
                  </div>
                  <p className="mb-3 text-xs leading-5 text-owly-text-light">
                    Leave filters blank to match every event for this trigger.
                  </p>
                  <div className="mb-3 rounded-md border border-owly-border bg-owly-surface px-3 py-2 text-xs text-owly-text">
                    {getTriggerMatchSummary(triggerEvent, triggerFilters)}
                  </div>
                  <TriggerFilterFields
                    triggerEvent={triggerEvent}
                    filters={triggerFilters}
                    onChange={updateTriggerFilter}
                  />
                  {hasActiveFilters(triggerFilters) && (
                    <button
                      onClick={clearTriggerFilters}
                      className="mt-3 text-xs font-semibold text-owly-primary hover:text-owly-primary-dark"
                    >
                      Clear filters and match all {selectedTrigger?.channel || "channel"} events
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="space-y-2 border-t border-owly-border pt-5">
              <PanelTitle icon={Workflow} label="Saved Workflows" />
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-owly-text-light">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading
                </div>
              ) : flows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-owly-border p-3 text-sm text-owly-text-light">
                  No saved workflows.
                </div>
              ) : (
                flows.map((flow, index) => (
                  <div
                    key={flow.id}
                    className={cn(
                      "flex w-full items-stretch gap-1 rounded-lg border p-1 text-sm",
                      selectedFlow?.id === flow.id
                        ? "border-owly-primary bg-owly-primary-50"
                        : "border-owly-border bg-owly-bg hover:border-owly-primary/50"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => selectFlow(flow)}
                      className="min-w-0 flex-1 rounded-md p-2 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-owly-text">{flow.name}</span>
                        {flow.isActive && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-owly-success" />}
                      </div>
                      <div className="mt-1 text-xs text-owly-text-light">
                        {Array.isArray(flow.nodes) ? Math.max(flow.nodes.length - 1, 0) : 0} steps - priority {flow.priority}
                      </div>
                    </button>
                    <div className="flex flex-col justify-center gap-0.5">
                      <button
                        type="button"
                        title="Run before the previous workflow"
                        disabled={index === 0}
                        onClick={() => reorderFlow(flow.id, "up")}
                        className="rounded p-1 text-owly-text-light hover:bg-owly-border/50 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Run after the next workflow"
                        disabled={index === flows.length - 1}
                        onClick={() => reorderFlow(flow.id, "down")}
                        className="rounded p-1 text-owly-text-light hover:bg-owly-border/50 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 overflow-auto bg-owly-bg">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-owly-border bg-owly-surface px-6 py-3 text-owly-text">
            <div className="flex items-center gap-3">
              <StatusPill icon={Zap} label={selectedTrigger?.label || "No trigger"} active={!!triggerEvent} />
              <StatusPill icon={CornerDownRight} label={`${executionNodes.length} steps`} active={executionNodes.length > 0} />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={validateFlow}
                className="inline-flex items-center gap-2 rounded-md border border-owly-border bg-owly-bg px-3 py-2 text-sm font-semibold text-owly-text hover:border-owly-primary"
              >
                <GitBranch className="h-4 w-4" />
                Validate
              </button>
              <button
                onClick={() => saveFlow(false)}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md border border-owly-border bg-owly-bg px-3 py-2 text-sm font-semibold text-owly-text hover:border-owly-primary disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Draft
              </button>
              <button
                onClick={() => saveFlow(!isActive)}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-owly-primary px-4 py-2 text-sm font-semibold text-white hover:bg-owly-primary-dark disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {isActive ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={deleteFlow}
                disabled={!selectedFlow}
                className="inline-flex items-center gap-2 rounded-md border border-red-500/30 bg-owly-bg px-3 py-2 text-sm font-semibold text-red-600 hover:border-red-400 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-full bg-[radial-gradient(var(--owly-border)_1px,transparent_1px)] bg-[length:20px_20px] px-10 py-10">
            <div className="mx-auto flex max-w-3xl flex-col items-center">
              <TriggerCard trigger={selectedTrigger?.label || ""} channel={selectedTrigger?.channel || ""} />
              <Connector />

              {executionNodes.length === 0 ? (
                <EmptyActionCard onTemplate={() => addStep(stepCatalog[0])} />
              ) : (
                <div className="flex w-full flex-col items-center">
                  {executionNodes.map((node, index) => (
                    <div key={node.id} className="flex w-full flex-col items-center">
                      <ExecutionStepCard
                        node={node}
                        nodes={executionNodes}
                        index={index}
                        selected={selectedStepId === node.id}
                        onSelect={() => setSelectedStepId(node.id)}
                        onRemove={() => removeStep(node.id)}
                      />
                      <Connector />
                    </div>
                  ))}
                  <button
                    onClick={() => addStep(stepCatalog[0])}
                    className="mb-3 inline-flex items-center gap-2 rounded-full border border-owly-primary bg-owly-surface px-4 py-2 text-sm font-semibold text-owly-primary shadow-sm hover:bg-owly-primary-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add next step
                  </button>
                </div>
              )}

              <div className="flex flex-col items-center gap-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-owly-border bg-owly-bg text-owly-text shadow-sm">
                  <Workflow className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide text-owly-text-light">End</span>
              </div>
            </div>
          </div>

          {validation && (
            <div
              className={cn(
                "absolute bottom-5 left-1/2 z-20 max-w-2xl -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-lg",
                validation.valid
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              )}
            >
              {validation.valid ? "Workflow is valid." : validation.errors.join(" ")}
            </div>
          )}
        </main>

        <aside className="w-[320px] flex-shrink-0 overflow-y-auto border-l border-owly-border bg-owly-surface">
          <div className="border-b border-owly-border p-5">
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-owly-border bg-owly-bg px-3 py-2 text-owly-text-light">
              <Search className="h-4 w-4" />
              <span className="text-sm">Search steps</span>
            </div>
            <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-owly-border bg-owly-primary-50 px-3 py-2 text-sm font-semibold text-owly-primary">
              <HelpCircle className="h-4 w-4" />
              How Workflows Work
            </button>
          </div>

          <div className="space-y-5 p-5">
            {groupedSteps.map((group) => (
              <section key={group.category}>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-owly-success">
                  <span className="h-2 w-2 rounded-sm bg-owly-success" />
                  {group.category}
                </div>
                <div className="space-y-2">
                  {group.items.map((step) => {
                    const Icon = step.icon;
                    return (
                      <button
                        key={step.actionType}
                        onClick={() => addStep(step)}
                        className="group flex w-full gap-3 rounded-lg border border-transparent p-3 text-left hover:border-owly-border hover:bg-owly-primary-50"
                      >
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-owly-success">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-owly-text">
                            {step.label}
                          </span>
                          <span className="mt-0.5 block text-xs text-owly-text-light">
                            {step.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </aside>
      </div>
      )}

      {viewMode === "editor" && selectedStep && (
        <StepInspector
          step={selectedStep}
          nodes={executionNodes}
          referenceData={referenceData}
          onClose={() => setSelectedStepId(null)}
          onChange={updateStep}
        />
      )}
    </div>
  );
}

export default function FlowsPage() {
  return <FlowsPageClient />;
}

function WorkflowListView({
  flows,
  loading,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchQueryChange,
  onCreate,
  onOpen,
  templates,
  installingTemplateId,
  onInstallTemplate,
  onReorder,
  canReorder,
}: {
  flows: FlowData[];
  loading: boolean;
  statusFilter: "all" | "active" | "draft";
  onStatusFilterChange: (status: "all" | "active" | "draft") => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onCreate: () => void;
  onOpen: (flow: FlowData) => void;
  templates: FlowTemplateData[];
  installingTemplateId: string | null;
  onInstallTemplate: (templateId: string) => void;
  onReorder: (flowId: string, direction: "up" | "down") => void;
  canReorder: boolean;
}) {
  const activeCount = flows.filter((flow) => flow.isActive).length;
  const [templatesOpen, setTemplatesOpen] = useState(false);

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-owly-bg p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <WorkflowMetric label="Total workflows" value={String(flows.length)} />
          <WorkflowMetric label="Active workflows" value={String(activeCount)} />
          <WorkflowMetric
            label="Draft workflows"
            value={String(Math.max(flows.length - activeCount, 0))}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border border-owly-border bg-owly-surface p-4">
          <div>
            <h2 className="text-base font-bold text-owly-text">Workflow List</h2>
            <p className="mt-1 text-sm text-owly-text-light">
              Review where each workflow runs before opening the builder.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[240px] items-center gap-2 rounded-lg border border-owly-border bg-owly-bg px-3 py-2 text-owly-text-light">
              <Search className="h-4 w-4" />
              <input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search workflows"
                className="w-full bg-transparent text-sm text-owly-text outline-none placeholder:text-owly-text-light"
              />
            </div>
            {(["all", "active", "draft"] as const).map((status) => (
              <button
                key={status}
                onClick={() => onStatusFilterChange(status)}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-semibold capitalize",
                  statusFilter === status
                    ? "border-owly-primary bg-owly-primary-50 text-owly-primary"
                    : "border-owly-border bg-owly-bg text-owly-text-light hover:text-owly-text"
                )}
              >
                {status}
              </button>
            ))}
            <button
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-md bg-owly-primary px-4 py-2 text-sm font-semibold text-white hover:bg-owly-primary-dark"
            >
              <Plus className="h-4 w-4" />
              New Workflow
            </button>
          </div>
        </div>

        {templates.length > 0 && (
          <section className="border border-owly-border bg-owly-surface p-4">
            <button
              type="button"
              onClick={() => setTemplatesOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 text-left"
              aria-expanded={templatesOpen}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-owly-text">Template Library</h2>
                  {templatesOpen ? (
                    <ChevronDown className="h-4 w-4 text-owly-text-light" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-owly-text-light" />
                  )}
                </div>
                <p className="mt-1 text-sm text-owly-text-light">
                  Install a reviewed draft, then adjust filters, approvals, and replies before activation.
                </p>
              </div>
              <span className="rounded-full bg-owly-primary-50 px-3 py-1 text-xs font-semibold text-owly-primary">
                {templates.length} templates
              </span>
            </button>
            {templatesOpen && (
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {templates.map((template) => (
                  <div key={template.id} className="rounded-lg border border-owly-border bg-owly-bg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-owly-text">{template.name}</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-owly-text-light">
                          {template.description}
                        </p>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-owly-primary-50 px-2 py-0.5 text-[11px] font-semibold text-owly-text">
                        {template.recommendedChannel}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-owly-text-light">{template.stepCount} steps</span>
                      <button
                        onClick={() => onInstallTemplate(template.id)}
                        disabled={installingTemplateId === template.id}
                        className="inline-flex items-center gap-2 rounded-md bg-owly-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-owly-primary-dark disabled:opacity-60"
                      >
                        {installingTemplateId === template.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        Install draft
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {loading ? (
          <div className="flex items-center gap-2 border border-owly-border bg-owly-surface p-5 text-sm text-owly-text-light">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading workflows
          </div>
        ) : flows.length === 0 ? (
          <div className="border border-dashed border-owly-border bg-owly-surface p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-owly-primary-50 text-owly-primary">
              <Workflow className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-owly-text">No workflows found</h3>
            <p className="mt-2 text-sm text-owly-text-light">
              Create one workflow, choose a channel trigger, then add execution steps.
            </p>
            <button
              onClick={onCreate}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-owly-primary px-4 py-2 text-sm font-semibold text-white hover:bg-owly-primary-dark"
            >
              <Plus className="h-4 w-4" />
              New Workflow
            </button>
          </div>
        ) : (
          <div className="overflow-hidden border border-owly-border bg-owly-surface">
            <div className="grid grid-cols-[56px_minmax(240px,1.3fr)_200px_1fr_100px_180px_110px] border-b border-owly-border bg-owly-bg px-4 py-3 text-xs font-bold uppercase tracking-wide text-owly-text-light">
              <div title={canReorder ? "Run order" : "Clear search/filters to reorder"}>Order</div>
              <div>Name</div>
              <div>Trigger</div>
              <div>Filters</div>
              <div>Steps</div>
              <div>Last run</div>
              <div>Status</div>
            </div>
            {flows.map((flow, index) => {
              const trigger = getFlowTrigger(flow);
              const filterSummary = getFlowFilterSummary(flow);
              const steps = getFlowExecutionNodes(flow);
              const latestRun = flow.runs?.[0];

              return (
                <div
                  key={flow.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(flow)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onOpen(flow);
                  }}
                  className="grid w-full cursor-pointer grid-cols-[56px_minmax(240px,1.3fr)_200px_1fr_100px_180px_110px] items-center gap-4 border-b border-owly-border px-4 py-4 text-left last:border-b-0 hover:bg-owly-primary-50"
                >
                  <div className="flex flex-col gap-0.5" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      title="Run before the previous workflow"
                      disabled={!canReorder || index === 0}
                      onClick={() => onReorder(flow.id, "up")}
                      className="rounded p-0.5 text-owly-text-light hover:bg-owly-border/50 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Run after the next workflow"
                      disabled={!canReorder || index === flows.length - 1}
                      onClick={() => onReorder(flow.id, "down")}
                      className="rounded p-0.5 text-owly-text-light hover:bg-owly-border/50 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-owly-text">{flow.name}</div>
                    <div className="mt-1 truncate text-xs text-owly-text-light">
                      {flow.description || "No description"}
                    </div>
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-owly-primary-50 px-3 py-1 text-xs font-semibold text-owly-primary">
                      <Zap className="h-3.5 w-3.5" />
                      {trigger.channel}
                    </div>
                    <div className="mt-1 text-xs text-owly-text-light">{trigger.label}</div>
                  </div>
                  <div className="text-sm text-owly-text">{filterSummary}</div>
                  <div className="text-sm font-semibold text-owly-text">{steps.length}</div>
                  <div className="min-w-0">
                    {latestRun ? (
                      <>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-bold",
                            latestRun.status === "completed"
                              ? "bg-emerald-500/10 text-owly-success"
                              : latestRun.status === "waiting_approval"
                                ? "bg-violet-500/10 text-owly-primary"
                                : latestRun.status === "failed"
                                  ? "bg-red-500/10 text-red-600"
                                  : "bg-owly-text-light/10 text-owly-text"
                          )}
                        >
                          {latestRun.status.replace("_", " ")}
                        </span>
                        <div className="mt-1 truncate text-xs text-owly-text-light">
                          {formatRelativeTime(latestRun.createdAt)}
                          {latestRun.reason ? ` - ${latestRun.reason}` : ""}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-owly-text-light">No runs yet</span>
                    )}
                  </div>
                  <div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold",
                        flow.isActive
                          ? "bg-emerald-500/10 text-owly-success"
                          : "bg-owly-text-light/10 text-owly-text-light"
                      )}
                    >
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          flow.isActive ? "bg-owly-success" : "bg-owly-text-light"
                        )}
                      />
                      {flow.isActive ? "Active" : "Draft"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function WorkflowMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-owly-border bg-owly-surface p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-owly-text-light">{label}</div>
      <div className="mt-2 text-2xl font-bold text-owly-text">{value}</div>
    </div>
  );
}

function getFlowTrigger(flow: FlowData) {
  const triggerNode = Array.isArray(flow.nodes)
    ? flow.nodes.find((node) => node.data?.nodeType === "trigger")
    : null;
  const option = triggerOptions.find((item) => item.value === triggerNode?.data?.triggerEvent);

  return {
    label: option?.label || triggerNode?.data?.label || "No trigger",
    channel: option?.channel || triggerNode?.data?.channel || "none",
    filters: triggerNode?.data?.filters || {},
  };
}

function getFlowExecutionNodes(flow: FlowData) {
  return Array.isArray(flow.nodes)
    ? flow.nodes.filter((node) => node.data?.nodeType !== "trigger")
    : [];
}

function getFlowFilterSummary(flow: FlowData) {
  const filters = getFlowTrigger(flow).filters;
  const activeFilters = Object.entries(filters).filter(([, value]) => value.trim().length > 0);

  if (activeFilters.length === 0) {
    return "No filters; matches every event for this trigger";
  }

  return activeFilters
    .map(([key, value]) => {
      if (key === "message" || key === "value") {
        return `${key} contains any of: ${splitFilterTerms(value).join(", ")}`;
      }
      return `${key}: ${value}`;
    })
    .join(", ");
}

function hasActiveFilters(filters: Record<string, string>) {
  return Object.values(filters).some((value) => value.trim().length > 0);
}

function splitFilterTerms(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}

function getTriggerMatchSummary(triggerEvent: string, filters: Record<string, string>) {
  const trigger = triggerOptions.find((option) => option.value === triggerEvent);
  const channel = trigger?.channel || "selected channel";

  if (!hasActiveFilters(filters)) {
    return `Runs for every ${channel} event for this trigger.`;
  }

  const parts: string[] = [];
  if (filters.message) {
    const terms = splitFilterTerms(filters.message);
    parts.push(`message contains any of: ${terms.join(", ")}`);
  }
  if (filters.subject) parts.push(`subject contains: ${filters.subject}`);
  if (filters.from) parts.push(`from contains: ${filters.from}`);
  if (filters.tag) parts.push(`customer tag is: ${filters.tag}`);
  if (filters.event) parts.push(`webhook event is: ${filters.event}`);
  if (filters.value) {
    const terms = splitFilterTerms(filters.value);
    parts.push(`text contains any of: ${terms.join(", ")}`);
  }

  return `Runs only when ${parts.join(" and ")}.`;
}

function PanelTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-owly-text-light">
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function Label({ text, required = false }: { text: string; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-owly-text-light">
      {text} {required && <span className="text-red-400">*</span>}
    </label>
  );
}

function StatusPill({
  icon: Icon,
  label,
  active,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold",
        active ? "bg-owly-primary-50 text-owly-primary" : "bg-owly-bg text-owly-text-light"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </span>
  );
}

function TriggerFilterFields({
  triggerEvent,
  filters,
  onChange,
}: {
  triggerEvent: string;
  filters: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (triggerEvent === "email_received") {
    return (
      <div className="space-y-3">
        <DarkInput
          label="From contains"
          value={filters.from || ""}
          placeholder="Example: @example.com"
          onChange={(value) => onChange("from", value)}
        />
        <DarkInput
          label="Subject contains"
          value={filters.subject || ""}
          placeholder="Example: support"
          onChange={(value) => onChange("subject", value)}
        />
      </div>
    );
  }

  if (triggerEvent === "whatsapp_message" || triggerEvent === "message_received") {
    return (
      <div className="space-y-3">
        <DarkInput
          label="Message contains"
          value={filters.message || ""}
          placeholder="Example: urgent, escalate, system down"
          onChange={(value) => onChange("message", value)}
        />
        <DarkInput
          label="Customer tag is"
          value={filters.tag || ""}
          placeholder="Example: VIP"
          onChange={(value) => onChange("tag", value)}
        />
      </div>
    );
  }

  if (triggerEvent === "webhook_received") {
    return (
      <DarkInput
        label="Webhook event"
        value={filters.event || ""}
        placeholder="Example: ticket.created"
        onChange={(value) => onChange("event", value)}
      />
    );
  }

  return (
    <DarkInput
      label="Filter value"
      value={filters.value || ""}
      placeholder="Optional match text"
      onChange={(value) => onChange("value", value)}
    />
  );
}

function DarkInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-owly-text-light">
      {label}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-owly-border bg-owly-surface px-3 py-2 text-sm text-owly-text outline-none placeholder:text-owly-text-light focus:border-owly-primary"
      />
    </label>
  );
}

function TriggerCard({ trigger, channel }: { trigger: string; channel: string }) {
  return (
    <div className="w-full max-w-xl overflow-hidden rounded-xl border-2 border-owly-border bg-owly-surface shadow-lg">
      <div className="flex items-center gap-2 bg-owly-primary px-4 py-2 text-sm font-bold uppercase tracking-wide text-white">
        <span className="h-3 w-3 rounded-full bg-owly-surface" />
        Trigger
      </div>
      <div className="flex items-center gap-4 px-6 py-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-owly-border text-owly-primary">
          <Mail className="h-5 w-5" />
        </span>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-owly-primary">When</div>
          <div className="text-lg font-bold text-owly-text">{trigger || "Start with a trigger"}</div>
          {channel && <div className="mt-1 text-xs text-owly-text-light">Channel: {channel}</div>}
        </div>
      </div>
    </div>
  );
}

function EmptyActionCard({ onTemplate }: { onTemplate: () => void }) {
  return (
    <div className="w-full max-w-xl rounded-xl border-2 border-dashed border-owly-border bg-owly-surface px-8 py-10 text-center text-owly-text shadow-lg">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-owly-primary-50 text-owly-primary">
        <Plus className="h-8 w-8" />
      </div>
      <h3 className="mt-5 text-lg font-bold">What should happen next?</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-owly-text-light">
        Choose an action from the right panel, such as replying to a customer,
        calling an API, invoking an MCP tool, or running a skill.
      </p>
      <button
        onClick={onTemplate}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-owly-primary px-5 py-2 text-sm font-bold text-white hover:bg-owly-primary-dark"
      >
        <Sparkles className="h-4 w-4" />
        Start with Reply
      </button>
    </div>
  );
}

function ExecutionStepCard({
  node,
  nodes,
  index,
  selected,
  onSelect,
  onRemove,
}: {
  node: WorkflowNode;
  nodes: WorkflowNode[];
  index: number;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const falseTargetIndex = node.data.falseTargetId
    ? nodes.findIndex((candidate) => candidate.id === node.data.falseTargetId)
    : -1;
  const falseTarget = falseTargetIndex >= 0 ? nodes[falseTargetIndex] : null;
  const step = stepCatalog.find((item) => item.actionType === node.data.actionType);
  const Icon = step?.icon || Code2;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group relative w-full max-w-xl rounded-xl border-2 bg-owly-surface p-5 text-left shadow-sm transition",
        selected ? "border-owly-primary" : "border-owly-border hover:border-owly-primary/60"
      )}
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-owly-primary-50 text-owly-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-owly-primary-50 px-2 py-0.5 text-xs font-bold text-owly-text-light">
              Step {index + 1}
            </span>
            <span className="text-xs font-semibold text-owly-text-light">{step?.category}</span>
          </div>
          <h3 className="mt-2 text-base font-bold text-owly-text">{node.data.label}</h3>
          <p className="mt-1 text-sm text-owly-text-light">{getStepSummary(node)}</p>
          {node.data.nodeType === "condition" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                true: continue to step {index + 2}
              </span>
              {falseTarget ? (
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                  false: jump to step {falseTargetIndex + 1} ({falseTarget.data.label})
                </span>
              ) : (
                <span className="rounded-full bg-owly-primary-50 px-2 py-0.5 text-xs font-semibold text-owly-text-light">
                  false: stop the flow
                </span>
              )}
            </div>
          )}
        </div>
        <span
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="rounded-md p-1 text-owly-text-light opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
          role="button"
          tabIndex={0}
        >
          <Trash2 className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
}

function getStepSummary(node: WorkflowNode) {
  if (node.data.nodeType === "condition") {
    return `${node.data.conditionField || "field"} ${node.data.conditionOperator || "matches"} ${
      node.data.conditionValue || "value"
    }`;
  }

  if (node.data.nodeType === "delay") {
    return `Wait ${node.data.delayAmount || 1} ${node.data.delayUnit || "minutes"}`;
  }

  if (node.data.nodeType === "llm") {
    return node.data.llmOutputMode === "json"
      ? "LLM output as JSON for next step"
      : node.data.llmPrompt || "Prompt not configured";
  }

  if (node.data.nodeType === "approval") {
    return node.data.approvalTitle || "Pause for customer service approval";
  }

  switch (node.data.actionType) {
    case "reply_customer":
      return node.data.replyText || "Reply text not configured";
    case "call_api":
      return `${node.data.apiMethod || "POST"} ${node.data.apiUrl || "API URL not configured"}`;
    case "call_mcp_tool":
      return `${node.data.mcpServer || "default"} / ${node.data.mcpTool || "tool not configured"}`;
    case "run_skill":
      return node.data.skillName || "Skill not configured";
    case "create_ticket":
      return `${node.data.ticketPriority || "medium"} priority - ${
        node.data.ticketTitle || "Ticket title not configured"
      }`;
    case "create_module_record":
      return `${node.data.moduleSlug || "module"} / ${
        node.data.moduleRecordType || "record"
      } - ${node.data.moduleRecordTitle || "Record title not configured"}`;
    case "create_module_signal":
      return `${node.data.moduleSignalSeverity || "medium"} - ${
        node.data.moduleSignalTitle || "Signal title not configured"
      }`;
    case "find_module_record":
      return `${node.data.moduleSlug || "module"} search: ${node.data.moduleRecordSearch || "not configured"}`;
    case "update_module_record":
      return `${node.data.moduleSlug || "module"} update: ${
        node.data.moduleRecordId || node.data.moduleRecordSearch || "record not configured"
      }`;
    case "resolve_module_signal":
      return `${node.data.moduleSlug || "module"} signal: ${node.data.moduleSignalId || "not configured"}`;
    default:
      return node.data.actionValue || "Configuration required";
  }
}

function Connector() {
  return <div className="h-12 border-l-2 border-dashed border-owly-border" />;
}

function StepInspector({
  step,
  nodes,
  referenceData,
  onClose,
  onChange,
}: {
  step: WorkflowNode;
  nodes: WorkflowNode[];
  referenceData: FlowReferenceData;
  onClose: () => void;
  onChange: (data: Partial<WorkflowNodeData>) => void;
}) {
  const tagOptions = withFallback(referenceData.tags, [
    { value: "VIP", label: "VIP" },
    { value: "urgent", label: "Urgent" },
    { value: "needs-review", label: "Needs review" },
    { value: "billing", label: "Billing" },
  ]);
  const teamMemberOptions = withFallback(referenceData.teamMembers, [
    { value: "Support", label: "Support team" },
  ]);
  const agentOptions = withFallback(referenceData.agents, [
    { value: "Customer Support Agent", label: "Customer Support Agent" },
  ]);
  const cannedResponseOptions = withFallback(referenceData.cannedResponses, [
    { value: "Thanks for contacting us. We are checking this now.", label: "Default acknowledgement" },
  ]);
  const categoryOptions = withFallback(referenceData.categories, [
    { value: "FAQ", label: "FAQ" },
    { value: "Policies", label: "Policies" },
  ]);
  const updateCustomerValue = parseCustomerFieldUpdate(step.data.actionValue);
  const mcpServer = step.data.mcpServer || "default";

  const conditionValueOptions = getConditionValueOptions(
    step.data.conditionField || "message",
    tagOptions,
    categoryOptions
  );

  return (
    <div className="fixed bottom-6 right-[344px] z-30 w-[420px] rounded-xl border border-owly-border bg-owly-surface p-5 text-owly-text shadow-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-owly-success">Configure Step</div>
          <div className="text-lg font-bold">{step.data.label}</div>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-owly-text-light hover:bg-owly-primary-50">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <DarkInput
          label="Step name"
          value={step.data.label}
          placeholder="Step name"
          onChange={(value) => onChange({ label: value })}
        />

        {step.data.nodeType === "condition" && (
          <>
            <DarkSelect
              label="Field"
              value={step.data.conditionField || "message"}
              options={["message", "channel", "customer_tag", "priority", "subject"]}
              onChange={(value) =>
                onChange({
                  conditionField: value,
                  conditionValue: getConditionValueOptions(value, tagOptions, categoryOptions)[0]?.value || "",
                })
              }
            />
            <DarkSelect
              label="Operator"
              value={step.data.conditionOperator || "contains"}
              options={["contains", "equals", "starts_with", "ends_with"]}
              onChange={(value) => onChange({ conditionOperator: value })}
            />
            <DarkOptionSelect
              label="Value"
              value={step.data.conditionValue || ""}
              options={conditionValueOptions}
              onChange={(value) => onChange({ conditionValue: value })}
            />
            <DarkOptionSelect
              label="If false"
              value={step.data.falseTargetId || ""}
              options={[
                { value: "", label: "Stop the flow" },
                ...nodes
                  .map((node, index) => ({ node, index }))
                  .filter(
                    ({ node, index }) =>
                      index > nodes.findIndex((candidate) => candidate.id === step.id) &&
                      node.data.nodeType !== "trigger"
                  )
                  .map(({ node, index }) => ({
                    value: node.id,
                    label: `Jump to step ${index + 1}: ${node.data.label}`,
                  })),
              ]}
              onChange={(value) => onChange({ falseTargetId: value || undefined })}
            />
          </>
        )}

        {step.data.nodeType === "delay" && (
          <>
            <DarkInput
              label="Amount"
              value={String(step.data.delayAmount || "")}
              placeholder="15"
              onChange={(value) => onChange({ delayAmount: Number(value) || 0 })}
            />
            <DarkSelect
              label="Unit"
              value={step.data.delayUnit || "minutes"}
              options={["minutes", "hours", "days"]}
              onChange={(value) => onChange({ delayUnit: value })}
            />
          </>
        )}

        {step.data.nodeType === "approval" && (
          <>
            <DarkInput
              label="Approval title"
              value={step.data.approvalTitle || ""}
              placeholder="Approve next workflow step"
              onChange={(value) => onChange({ approvalTitle: value })}
            />
            <DarkTextarea
              label="Instructions"
              value={step.data.approvalInstructions || ""}
              placeholder="Tell customer service what to review before approving"
              onChange={(value) => onChange({ approvalInstructions: value })}
            />
            <DarkSelect
              label="Approval target"
              value={step.data.approvalTarget || "next_step"}
              options={["next_step"]}
              onChange={(value) => onChange({ approvalTarget: value })}
            />
          </>
        )}

        {step.data.actionType === "llm" && (
          <>
            <DarkTextarea
              label="Instruction"
              value={step.data.llmInstruction || ""}
              placeholder="Tell the model how to behave for this workflow step"
              onChange={(value) => onChange({ llmInstruction: value })}
            />
            <DarkTextarea
              label="Prompt"
              value={step.data.llmPrompt || ""}
              placeholder="Write the prompt. You can use {{message}}, {{previous.output}}, {{channel}}, and {{flow.name}}."
              onChange={(value) => onChange({ llmPrompt: value })}
            />
            <DarkOptionSelect
              label="Output"
              value={step.data.llmOutputMode || "text"}
              options={LLM_OUTPUT_MODE_OPTIONS}
              onChange={(value) => onChange({ llmOutputMode: value })}
            />
            <div className="rounded-lg border border-owly-border bg-black/20 p-3 text-xs text-owly-text-light">
              Use <span className="font-mono text-owly-text">{"{{previous.output}}"}</span> in the next node to pass this LLM result forward.
            </div>
          </>
        )}

        {step.data.actionType === "reply_customer" && (
          <DarkOptionSelect
            label="Reply message"
            value={step.data.replyText || ""}
            options={cannedResponseOptions}
            onChange={(value) => onChange({ replyText: value })}
          />
        )}

        {step.data.actionType === "call_api" && (
          <>
            <DarkSelect
              label="Method"
              value={step.data.apiMethod || "POST"}
              options={["GET", "POST", "PUT", "PATCH", "DELETE"]}
              onChange={(value) => onChange({ apiMethod: value })}
            />
            <DarkInput
              label="URL"
              value={step.data.apiUrl || ""}
              placeholder="https://api.company.com/tickets"
              onChange={(value) => onChange({ apiUrl: value })}
            />
            <JsonBuilderField
              label="Query parameters"
              value={step.data.apiQueryParams || "{}"}
              placeholder={'{\n  "conversationId": "{{conversationId}}"\n}'}
              examples={API_QUERY_EXAMPLES}
              onChange={(value) => onChange({ apiQueryParams: value })}
            />
            <JsonBuilderField
              label="Headers"
              value={step.data.apiHeaders || "{}"}
              placeholder={'{\n  "Authorization": "Bearer {{secret.apiToken}}"\n}'}
              examples={API_HEADER_EXAMPLES}
              onChange={(value) => onChange({ apiHeaders: value })}
            />
            {!["GET", "HEAD"].includes((step.data.apiMethod || "POST").toUpperCase()) && (
              <>
                <DarkSelect
                  label="Body type"
                  value={step.data.apiBodyMode || "json"}
                  options={["json", "raw", "none"]}
                  onChange={(value) => onChange({ apiBodyMode: value })}
                />
                {(step.data.apiBodyMode || "json") !== "none" && (
                  <JsonBuilderField
                    label={(step.data.apiBodyMode || "json") === "json" ? "JSON body" : "Raw body"}
                    value={step.data.apiBody || "{}"}
                    placeholder={'{\n  "message": "{{message}}",\n  "previousOutput": "{{previous.output}}"\n}'}
                    examples={API_BODY_EXAMPLES}
                    onChange={(value) => onChange({ apiBody: value })}
                  />
                )}
              </>
            )}
            <div className="rounded-lg border border-owly-border bg-black/20 p-3 text-xs text-owly-text-light">
              Available references: <span className="font-mono text-owly-text">{"{{message}}"}</span>,{" "}
              <span className="font-mono text-owly-text">{"{{previous.output}}"}</span>,{" "}
              <span className="font-mono text-owly-text">{"{{conversationId}}"}</span>,{" "}
              <span className="font-mono text-owly-text">{"{{channel}}"}</span>.
            </div>
          </>
        )}

        {step.data.actionType === "create_ticket" && (
          <>
            <DarkOptionSelect
              label="Ticket title"
              value={step.data.ticketTitle || ""}
              options={TICKET_TITLE_TEMPLATE_OPTIONS}
              onChange={(value) => onChange({ ticketTitle: value })}
            />
            <DarkOptionSelect
              label="Ticket description"
              value={step.data.ticketDescription || ""}
              options={TICKET_DESCRIPTION_TEMPLATE_OPTIONS}
              onChange={(value) => onChange({ ticketDescription: value })}
            />
            <DarkSelect
              label="Priority"
              value={step.data.ticketPriority || "medium"}
              options={["low", "medium", "high", "urgent"]}
              onChange={(value) => onChange({ ticketPriority: value })}
            />
          </>
        )}

        {step.data.actionType === "create_module_record" && (
          <>
            <DarkOptionSelect
              label="Module"
              value={step.data.moduleSlug || "orders"}
              options={MODULE_OPTIONS}
              onChange={(value) => onChange({ moduleSlug: value })}
            />
            <DarkOptionSelect
              label="Record type"
              value={step.data.moduleRecordType || "order"}
              options={MODULE_RECORD_TYPE_OPTIONS}
              onChange={(value) => onChange({ moduleRecordType: value })}
            />
            <DarkInput
              label="Title"
              value={step.data.moduleRecordTitle || ""}
              placeholder="{{message}}"
              onChange={(value) => onChange({ moduleRecordTitle: value })}
            />
            <DarkSelect
              label="Status"
              value={step.data.moduleRecordStatus || "open"}
              options={["open", "draft", "pending", "in_progress", "completed", "closed"]}
              onChange={(value) => onChange({ moduleRecordStatus: value })}
            />
            <DarkSelect
              label="Priority"
              value={step.data.moduleRecordPriority || "normal"}
              options={["low", "normal", "medium", "high", "urgent"]}
              onChange={(value) => onChange({ moduleRecordPriority: value })}
            />
            <JsonBuilderField
              label="Record data"
              value={step.data.moduleRecordData || "{}"}
              placeholder={'{\n  "message": "{{message}}",\n  "previousOutput": "{{previous.output}}"\n}'}
              examples={API_BODY_EXAMPLES}
              onChange={(value) => onChange({ moduleRecordData: value })}
            />
          </>
        )}

        {step.data.actionType === "create_module_signal" && (
          <>
            <DarkOptionSelect
              label="Module"
              value={step.data.moduleSlug || "reporter-agent"}
              options={MODULE_OPTIONS}
              onChange={(value) => onChange({ moduleSlug: value })}
            />
            <DarkOptionSelect
              label="Signal type"
              value={step.data.moduleSignalType || "attention_required"}
              options={MODULE_SIGNAL_TYPE_OPTIONS}
              onChange={(value) => onChange({ moduleSignalType: value })}
            />
            <DarkSelect
              label="Severity"
              value={step.data.moduleSignalSeverity || "medium"}
              options={["low", "medium", "high", "urgent"]}
              onChange={(value) => onChange({ moduleSignalSeverity: value })}
            />
            <DarkInput
              label="Title"
              value={step.data.moduleSignalTitle || ""}
              placeholder="{{message}}"
              onChange={(value) => onChange({ moduleSignalTitle: value })}
            />
            <DarkTextarea
              label="Description"
              value={step.data.moduleSignalDescription || ""}
              placeholder="Explain what requires attention"
              onChange={(value) => onChange({ moduleSignalDescription: value })}
            />
            <JsonBuilderField
              label="Signal data"
              value={step.data.moduleSignalData || "{}"}
              placeholder={'{\n  "conversationId": "{{conversationId}}",\n  "message": "{{message}}"\n}'}
              examples={API_BODY_EXAMPLES}
              onChange={(value) => onChange({ moduleSignalData: value })}
            />
          </>
        )}

        {step.data.actionType === "find_module_record" && (
          <>
            <DarkOptionSelect
              label="Module"
              value={step.data.moduleSlug || "orders"}
              options={MODULE_OPTIONS}
              onChange={(value) => onChange({ moduleSlug: value })}
            />
            <DarkOptionSelect
              label="Search value"
              value={step.data.moduleRecordSearch || ""}
              options={VALUE_REFERENCE_OPTIONS}
              onChange={(value) => onChange({ moduleRecordSearch: value })}
            />
          </>
        )}

        {step.data.actionType === "update_module_record" && (
          <>
            <DarkOptionSelect
              label="Module"
              value={step.data.moduleSlug || "orders"}
              options={MODULE_OPTIONS}
              onChange={(value) => onChange({ moduleSlug: value })}
            />
            <DarkOptionSelect
              label="Record ID"
              value={step.data.moduleRecordId || ""}
              options={VALUE_REFERENCE_OPTIONS}
              onChange={(value) => onChange({ moduleRecordId: value })}
            />
            <DarkOptionSelect
              label="Fallback search"
              value={step.data.moduleRecordSearch || ""}
              options={VALUE_REFERENCE_OPTIONS}
              onChange={(value) => onChange({ moduleRecordSearch: value })}
            />
            <DarkSelect
              label="Status"
              value={step.data.moduleRecordStatus || "in_progress"}
              options={["open", "draft", "pending", "pending_approval", "in_progress", "confirmed", "fulfilled", "completed", "cancelled", "closed"]}
              onChange={(value) => onChange({ moduleRecordStatus: value })}
            />
            <JsonBuilderField
              label="Update data"
              value={step.data.moduleRecordUpdateData || "{}"}
              placeholder={'{\n  "workflowUpdate": "{{message}}"\n}'}
              examples={API_BODY_EXAMPLES}
              onChange={(value) => onChange({ moduleRecordUpdateData: value })}
            />
          </>
        )}

        {step.data.actionType === "resolve_module_signal" && (
          <>
            <DarkOptionSelect
              label="Module"
              value={step.data.moduleSlug || "reporter-agent"}
              options={MODULE_OPTIONS}
              onChange={(value) => onChange({ moduleSlug: value })}
            />
            <DarkOptionSelect
              label="Signal ID"
              value={step.data.moduleSignalId || ""}
              options={VALUE_REFERENCE_OPTIONS}
              onChange={(value) => onChange({ moduleSignalId: value })}
            />
          </>
        )}

        {step.data.actionType === "call_mcp_tool" && (
          <>
            <DarkOptionSelect
              label="MCP server"
              value={step.data.mcpServer || ""}
              options={MCP_SERVER_OPTIONS}
              onChange={(value) =>
                onChange({
                  mcpServer: value,
                  mcpTool: MCP_TOOL_OPTIONS[value]?.[0]?.value || "",
                })
              }
            />
            <DarkOptionSelect
              label="Tool name"
              value={step.data.mcpTool || ""}
              options={MCP_TOOL_OPTIONS[mcpServer] || MCP_TOOL_OPTIONS.default}
              onChange={(value) => onChange({ mcpTool: value })}
            />
            <DarkOptionSelect
              label="Tool input"
              value={step.data.mcpInput || ""}
              options={MCP_INPUT_TEMPLATE_OPTIONS}
              onChange={(value) => onChange({ mcpInput: value })}
            />
          </>
        )}

        {step.data.actionType === "run_skill" && (
          <>
            <DarkOptionSelect
              label="Skill name"
              value={step.data.skillName || ""}
              options={SKILL_OPTIONS}
              onChange={(value) => onChange({ skillName: value })}
            />
            <DarkOptionSelect
              label="Skill prompt"
              value={step.data.skillPrompt || ""}
              options={[
                { value: "Classify and propose next action.", label: "Classify and propose next action" },
                { value: "Review whether this should be escalated.", label: "Review escalation need" },
                { value: "Extract customer intent and urgency.", label: "Extract intent and urgency" },
              ]}
              onChange={(value) => onChange({ skillPrompt: value })}
            />
          </>
        )}

        {step.data.actionType === "send_email" && (
          <DarkOptionSelect
            label="Recipient"
            value={step.data.actionValue || ""}
            options={teamMemberOptions}
            onChange={(value) => onChange({ actionValue: value })}
          />
        )}

        {step.data.actionType === "send_notification" && (
          <DarkOptionSelect
            label="Notification message"
            value={step.data.actionValue || ""}
            options={[
              { value: "New workflow notification", label: "Default workflow notification" },
              { value: "{{flow.name}} handled a {{channel}} message.", label: "Flow handled channel message" },
              { value: "Customer needs human follow-up: {{message}}", label: "Human follow-up needed" },
            ]}
            onChange={(value) => onChange({ actionValue: value })}
          />
        )}

        {step.data.actionType === "add_tag" && (
          <DarkOptionSelect
            label="Tag"
            value={step.data.actionValue || ""}
            options={tagOptions}
            onChange={(value) => onChange({ actionValue: value })}
          />
        )}

        {step.data.actionType === "update_customer" && (
          <>
            <DarkOptionSelect
              label="Customer field"
              value={updateCustomerValue.field}
              options={CUSTOMER_FIELD_OPTIONS}
              onChange={(field) =>
                onChange({ actionValue: `${field}=${updateCustomerValue.value || VALUE_REFERENCE_OPTIONS[0].value}` })
              }
            />
            <DarkOptionSelect
              label="Value reference"
              value={updateCustomerValue.value}
              options={VALUE_REFERENCE_OPTIONS}
              onChange={(value) =>
                onChange({ actionValue: `${updateCustomerValue.field || CUSTOMER_FIELD_OPTIONS[0].value}=${value}` })
              }
            />
          </>
        )}

        {step.data.actionType === "assign_agent" && (
          <DarkOptionSelect
            label="Assignee"
            value={step.data.actionValue || ""}
            options={[...teamMemberOptions, ...agentOptions]}
            onChange={(value) => onChange({ actionValue: value })}
          />
        )}

        {step.data.actionType === "ai_reply" && (
          <DarkOptionSelect
            label="AI instruction"
            value={step.data.actionValue || ""}
            options={AI_REPLY_INSTRUCTION_OPTIONS}
            onChange={(value) => onChange({ actionValue: value })}
          />
        )}
      </div>
    </div>
  );
}

function withFallback(options: ReferenceOption[], fallback: ReferenceOption[]) {
  return options.length > 0 ? options : fallback;
}

function parseCustomerFieldUpdate(value: string | undefined) {
  const [rawField, ...rawValueParts] = (value || "").split("=");
  return {
    field: rawField || CUSTOMER_FIELD_OPTIONS[0].value,
    value: rawValueParts.join("=") || VALUE_REFERENCE_OPTIONS[0].value,
  };
}

function getConditionValueOptions(
  field: string,
  tagOptions: ReferenceOption[],
  categoryOptions: ReferenceOption[]
): ReferenceOption[] {
  if (field === "channel") return CHANNEL_REFERENCE_OPTIONS;
  if (field === "customer_tag") return tagOptions;
  if (field === "priority") return PRIORITY_OPTIONS;
  if (field === "subject") {
    return [
      { value: "support", label: "Support" },
      { value: "billing", label: "Billing" },
      { value: "refund", label: "Refund" },
    ];
  }
  return [
    { value: "urgent", label: "Urgent" },
    { value: "refund", label: "Refund" },
    { value: "password reset", label: "Password reset" },
    { value: "system down", label: "System down" },
    ...categoryOptions.map((option) => ({
      value: option.value,
      label: `KB category: ${option.label}`,
      description: option.description,
    })),
  ];
}

function DarkTextarea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-owly-text-light">
      {label}
      <textarea
        value={value}
        placeholder={placeholder}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-owly-border bg-owly-bg px-3 py-2 text-sm text-owly-text outline-none placeholder:text-owly-text-light focus:border-owly-primary"
      />
    </label>
  );
}

function JsonBuilderField({
  label,
  value,
  placeholder,
  examples,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  examples: ReferenceOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <DarkTextarea
        label={label}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
      />
      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <button
            key={`${label}-${example.label}`}
            type="button"
            onClick={() => onChange(example.value)}
            className="rounded-full border border-owly-border bg-owly-bg px-2.5 py-1 text-xs font-semibold text-owly-text-light hover:border-owly-primary hover:text-owly-primary"
          >
            {example.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DarkOptionSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReferenceOption[];
  onChange: (value: string) => void;
}) {
  const normalizedOptions =
    options.length > 0
      ? options
      : [{ value: "", label: "No options available" }];
  const selectedValue = normalizedOptions.some((option) => option.value === value)
    ? value
    : normalizedOptions[0].value;

  useEffect(() => {
    if (selectedValue !== value) {
      onChange(selectedValue);
    }
  }, [onChange, selectedValue, value]);

  return (
    <label className="block text-sm font-semibold text-owly-text-light">
      {label}
      <select
        value={selectedValue}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-owly-border bg-owly-bg px-3 py-2 text-sm text-owly-text outline-none focus:border-owly-primary"
      >
        {normalizedOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.description ? `${option.label} - ${option.description}` : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DarkSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-owly-text-light">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-owly-border bg-owly-bg px-3 py-2 text-sm text-owly-text outline-none focus:border-owly-primary"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
