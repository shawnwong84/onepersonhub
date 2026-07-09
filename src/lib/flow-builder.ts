/**
 * Chatbot Flow Builder
 * Define conversation flows as a decision tree.
 * Visual builder on the frontend, this is the runtime engine.
 */

export type NodeType = "message" | "question" | "condition" | "action" | "ai_response" | "transfer" | "end";

export interface FlowNode {
  id: string;
  type: NodeType;
  content: string;
  options?: FlowOption[];      // For question nodes
  condition?: FlowCondition;   // For condition nodes
  action?: FlowAction;         // For action nodes
  nextNodeId?: string;         // Default next node
}

export interface FlowOption {
  label: string;
  nextNodeId: string;
}

export interface FlowCondition {
  field: string;     // message_content, channel, customer_tag, etc.
  operator: string;  // contains, equals, starts_with
  value: string;
  trueNodeId: string;
  falseNodeId: string;
}

export interface FlowAction {
  type: string;  // create_ticket, assign, tag, send_email, webhook
  params: Record<string, string>;
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  startNodeId: string;
  nodes: FlowNode[];
  isActive: boolean;
}

export interface CanvasFlow {
  id: string;
  name: string;
  description: string;
  startNodeId: string;
  nodes: CanvasFlowNode[];
  edges: CanvasFlowEdge[];
  isActive: boolean;
}

export interface CanvasFlowNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: {
    label?: string;
    nodeType?: "trigger" | "condition" | "action" | "approval" | "delay" | "llm" | "end";
    triggerEvent?: string;
    channelAccountId?: string;
    conditionField?: string;
    conditionOperator?: string;
    conditionValue?: string;
    actionType?: string;
    actionValue?: string;
    channel?: string;
    filters?: Record<string, string>;
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
    moduleSignalType?: string;
    moduleSignalSeverity?: string;
    moduleSignalTitle?: string;
    moduleSignalDescription?: string;
    moduleSignalData?: string;
    moduleRecordId?: string;
    moduleRecordSearch?: string;
    moduleRecordUpdateData?: string;
    moduleSignalId?: string;
    mcpServer?: string;
    mcpTool?: string;
    mcpInput?: string;
    skillName?: string;
    skillPrompt?: string;
    llmInstruction?: string;
    llmPrompt?: string;
    llmOutputMode?: string;
    replyText?: string;
    stepCategory?: string;
    approvalTitle?: string;
    approvalInstructions?: string;
    approvalTarget?: string;
    delayAmount?: number;
    delayUnit?: string;
  };
}

export interface CanvasFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

interface FlowContext {
  conversationId: string;
  customerMessage: string;
  channel: string;
  customerName: string;
  variables: Record<string, string>;
}

/**
 * Execute a flow from a given node.
 * Returns the responses to send and the next state.
 */
export function executeFlowNode(
  flow: Flow,
  nodeId: string,
  context: FlowContext
): { responses: string[]; nextNodeId: string | null; actions: FlowAction[] } {
  const node = flow.nodes.find((n) => n.id === nodeId);
  if (!node) return { responses: [], nextNodeId: null, actions: [] };

  const responses: string[] = [];
  const actions: FlowAction[] = [];
  let nextNodeId: string | null = null;

  switch (node.type) {
    case "message":
      responses.push(interpolate(node.content, context.variables));
      nextNodeId = node.nextNodeId || null;
      break;

    case "question":
      responses.push(interpolate(node.content, context.variables));
      // Wait for user response - next node determined by option selection
      if (node.options) {
        const userMsg = context.customerMessage.toLowerCase();
        const matched = node.options.find((opt) =>
          userMsg.includes(opt.label.toLowerCase())
        );
        nextNodeId = matched?.nextNodeId || node.nextNodeId || null;
      }
      break;

    case "condition":
      if (node.condition) {
        const matches = evaluateCondition(node.condition, context);
        nextNodeId = matches ? node.condition.trueNodeId : node.condition.falseNodeId;
      }
      break;

    case "action":
      if (node.action) {
        actions.push(node.action);
      }
      nextNodeId = node.nextNodeId || null;
      break;

    case "ai_response":
      // Signal that AI should generate a response
      responses.push("__AI_RESPONSE__");
      nextNodeId = node.nextNodeId || null;
      break;

    case "transfer":
      responses.push(node.content || "Let me connect you with a team member.");
      actions.push({ type: "transfer", params: { department: node.content } });
      nextNodeId = null;
      break;

    case "end":
      if (node.content) responses.push(node.content);
      nextNodeId = null;
      break;
  }

  return { responses, nextNodeId, actions };
}

function evaluateCondition(condition: FlowCondition, context: FlowContext): boolean {
  let fieldValue = "";

  switch (condition.field) {
    case "message_content":
      fieldValue = context.customerMessage;
      break;
    case "channel":
      fieldValue = context.channel;
      break;
    case "customer_name":
      fieldValue = context.customerName;
      break;
    default:
      fieldValue = context.variables[condition.field] || "";
  }

  const lower = fieldValue.toLowerCase();
  const target = condition.value.toLowerCase();

  switch (condition.operator) {
    case "contains": return lower.includes(target);
    case "equals": return lower === target;
    case "starts_with": return lower.startsWith(target);
    case "not_contains": return !lower.includes(target);
    default: return false;
  }
}

function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

/**
 * Validate a flow definition.
 */
export function validateFlow(flow: Flow | CanvasFlow): { valid: boolean; errors: string[] } {
  if ("edges" in flow && Array.isArray(flow.edges)) {
    return validateCanvasFlow(flow);
  }

  const errors: string[] = [];
  const nodes = flow.nodes as FlowNode[];
  const nodeIds = new Set(nodes.map((n) => n.id));

  if (!flow.startNodeId) {
    errors.push("Flow must have a start node");
  } else if (!nodeIds.has(flow.startNodeId)) {
    errors.push("Start node ID does not exist");
  }

  for (const node of nodes) {
    if (node.nextNodeId && !nodeIds.has(node.nextNodeId)) {
      errors.push(`Node ${node.id}: nextNodeId "${node.nextNodeId}" does not exist`);
    }
    if (node.options) {
      for (const opt of node.options) {
        if (!nodeIds.has(opt.nextNodeId)) {
          errors.push(`Node ${node.id}: option "${opt.label}" points to non-existent node`);
        }
      }
    }
    if (node.condition) {
      if (!nodeIds.has(node.condition.trueNodeId)) {
        errors.push(`Node ${node.id}: condition trueNodeId does not exist`);
      }
      if (!nodeIds.has(node.condition.falseNodeId)) {
        errors.push(`Node ${node.id}: condition falseNodeId does not exist`);
      }
    }
  }

  // Check for unreachable nodes
  const reachable = new Set<string>();
  const queue = [flow.startNodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const node = nodes.find((n) => n.id === id);
    if (!node) continue;
    if (node.nextNodeId) queue.push(node.nextNodeId);
    if (node.options) node.options.forEach((o) => queue.push(o.nextNodeId));
    if (node.condition) {
      queue.push(node.condition.trueNodeId);
      queue.push(node.condition.falseNodeId);
    }
  }

  const unreachable = nodes.filter((n) => !reachable.has(n.id));
  if (unreachable.length > 0) {
    errors.push(`Unreachable nodes: ${unreachable.map((n) => n.id).join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

function validateCanvasFlow(flow: CanvasFlow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  const edges = Array.isArray(flow.edges) ? flow.edges : [];
  const nodeIds = new Set(nodes.map((node) => node.id));

  if (nodes.length === 0) {
    errors.push("Flow must contain at least one node");
  }

  if (!flow.startNodeId) {
    errors.push("Flow must have a start node");
  } else if (!nodeIds.has(flow.startNodeId)) {
    errors.push("Start node ID does not exist");
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge ${edge.id}: source node does not exist`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge ${edge.id}: target node does not exist`);
    }
  }

  const outgoing = new Map<string, CanvasFlowEdge[]>();
  const incoming = new Map<string, CanvasFlowEdge[]>();

  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge]);
    incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge]);
  }

  for (const node of nodes) {
    const nodeType = node.data?.nodeType;

    if (!nodeType) {
      errors.push(`Node ${node.id}: node type is required`);
      continue;
    }

    if (node.id !== flow.startNodeId && (incoming.get(node.id) || []).length === 0) {
      errors.push(`Node ${node.id}: node is not connected from another node`);
    }

    if (nodeType !== "end" && (outgoing.get(node.id) || []).length === 0) {
      errors.push(`Node ${node.id}: non-end node needs an outgoing edge`);
    }

    if (nodeType === "trigger" && !node.data?.triggerEvent) {
      errors.push(`Node ${node.id}: trigger event is required`);
    }

    if (nodeType === "condition") {
      if (!node.data?.conditionField) errors.push(`Node ${node.id}: condition field is required`);
      if (!node.data?.conditionOperator) errors.push(`Node ${node.id}: condition operator is required`);
      if (!node.data?.conditionValue) errors.push(`Node ${node.id}: condition value is required`);
    }

    if (nodeType === "llm") {
      if (!node.data?.llmPrompt) {
        errors.push(`Node ${node.id}: LLM prompt is required`);
      }
    }

    if (nodeType === "action") {
      if (!node.data?.actionType) errors.push(`Node ${node.id}: action type is required`);
      if (node.data?.actionType === "reply_customer" && !node.data?.replyText) {
        errors.push(`Node ${node.id}: reply text is required`);
      }
      if (node.data?.actionType === "call_api" && !node.data?.apiUrl) {
        errors.push(`Node ${node.id}: API URL is required`);
      }
      if (node.data?.actionType === "call_mcp_tool" && !node.data?.mcpTool) {
        errors.push(`Node ${node.id}: MCP tool name is required`);
      }
      if (node.data?.actionType === "run_skill" && !node.data?.skillName) {
        errors.push(`Node ${node.id}: skill name is required`);
      }
      if (
        !["reply_customer", "call_api", "call_mcp_tool", "run_skill", "ai_reply"].includes(
          node.data?.actionType || ""
        ) &&
        !node.data?.actionValue
      ) {
        errors.push(`Node ${node.id}: action value is required`);
      }
    }

    if (nodeType === "approval") {
      if (!node.data?.approvalTitle) errors.push(`Node ${node.id}: approval title is required`);
    }

    if (nodeType === "delay") {
      if (!node.data?.delayAmount || node.data.delayAmount < 1) {
        errors.push(`Node ${node.id}: delay amount must be greater than zero`);
      }
      if (!node.data?.delayUnit) errors.push(`Node ${node.id}: delay unit is required`);
    }
  }

  if (flow.startNodeId && nodeIds.has(flow.startNodeId)) {
    const reachable = new Set<string>();
    const queue = [flow.startNodeId];

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const edge of outgoing.get(id) || []) {
        queue.push(edge.target);
      }
    }

    const unreachable = nodes.filter((node) => !reachable.has(node.id));
    if (unreachable.length > 0) {
      errors.push(`Unreachable nodes: ${unreachable.map((node) => node.id).join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
