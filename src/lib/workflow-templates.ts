import type { CanvasFlowEdge, CanvasFlowNode } from "@/lib/flow-builder";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  recommendedChannel: string;
  nodes: CanvasFlowNode[];
  edges: CanvasFlowEdge[];
}

function trigger(id: string, label: string, triggerEvent: string, channel: string, filters: Record<string, string> = {}): CanvasFlowNode {
  return {
    id,
    type: "workflow",
    position: { x: 0, y: 0 },
    data: { label, nodeType: "trigger", triggerEvent, channel, filters },
  };
}

function action(id: string, y: number, label: string, actionType: string, data: CanvasFlowNode["data"]): CanvasFlowNode {
  return {
    id,
    type: "workflow",
    position: { x: 0, y },
    data: { label, nodeType: "action", actionType, ...data },
  };
}

function approval(id: string, y: number, title: string): CanvasFlowNode {
  return {
    id,
    type: "workflow",
    position: { x: 0, y },
    data: {
      label: "Approval Required",
      nodeType: "approval",
      actionType: "approval_required",
      approvalTitle: title,
      approvalInstructions: "Review the proposed next action before it runs.",
      approvalTarget: "next_step",
    },
  };
}

function connect(nodes: CanvasFlowNode[]): CanvasFlowEdge[] {
  return nodes.slice(0, -1).map((node, index) => ({
    id: `${node.id}-${nodes[index + 1].id}`,
    source: node.id,
    target: nodes[index + 1].id,
    type: "execution",
  }));
}

function withEdges(template: Omit<WorkflowTemplate, "edges">): WorkflowTemplate {
  return { ...template, edges: connect(template.nodes) };
}

export const workflowTemplates: WorkflowTemplate[] = [
  withEdges({
    id: "urgent-password-reset",
    name: "Urgent password reset",
    description: "Catch urgent reset messages, create a high-priority ticket, and send a safe acknowledgement.",
    recommendedChannel: "whatsapp",
    nodes: [
      trigger("trigger", "WhatsApp Message Received", "whatsapp_message", "whatsapp", { message: "urgent,password,reset" }),
      action("ticket", 160, "Create Ticket", "create_ticket", {
        ticketTitle: "Urgent password reset: {{message}}",
        ticketDescription: "Customer requested urgent password help from {{channel}}.\n\n{{message}}",
        ticketPriority: "urgent",
      }),
      action("reply", 320, "Reply Customer", "reply_customer", {
        replyText: "We received your urgent password reset request. Our support team is checking it now.",
      }),
    ],
  }),
  withEdges({
    id: "billing-escalation",
    name: "Billing escalation",
    description: "Tag billing issues, assign to the billing team, and notify the customer.",
    recommendedChannel: "any",
    nodes: [
      trigger("trigger", "New Message Received", "message_received", "any", { message: "billing,invoice,payment,charge" }),
      action("tag", 160, "Add Tag", "add_tag", { actionValue: "billing" }),
      action("assign", 320, "Assign to Agent", "assign_agent", { actionValue: "billing" }),
      action("reply", 480, "Reply Customer", "reply_customer", {
        replyText: "Thanks for the billing details. We have routed this to our billing team.",
      }),
    ],
  }),
  withEdges({
    id: "refund-approval",
    name: "Refund approval",
    description: "Pause refund replies for human approval before sending.",
    recommendedChannel: "any",
    nodes: [
      trigger("trigger", "New Message Received", "message_received", "any", { message: "refund,cancel,return" }),
      approval("approval", 160, "Approve refund response"),
      action("reply", 320, "Reply Customer", "reply_customer", {
        replyText: "We are reviewing your refund request and will update you shortly.",
      }),
    ],
  }),
  withEdges({
    id: "order-status-reply",
    name: "Order status reply",
    description: "Call an external order API when customers ask where their order is.",
    recommendedChannel: "any",
    nodes: [
      trigger("trigger", "New Message Received", "message_received", "any", { message: "order,delivery,tracking,status" }),
      action("api", 160, "Call API", "call_api", {
        apiMethod: "POST",
        apiUrl: "https://example.com/order-status",
        apiBody: "{\"message\":\"{{message}}\",\"conversationId\":\"{{conversationId}}\"}",
      }),
      action("reply", 320, "Reply Customer", "reply_customer", {
        replyText: "We are checking your order status now and will update you here.",
      }),
    ],
  }),
  withEdges({
    id: "sales-handoff",
    name: "Sales handoff",
    description: "Identify sales intent and assign the conversation to the sales team.",
    recommendedChannel: "any",
    nodes: [
      trigger("trigger", "New Message Received", "message_received", "any", { message: "pricing,demo,quote,buy" }),
      action("tag", 160, "Add Tag", "add_tag", { actionValue: "sales-lead" }),
      action("assign", 320, "Assign to Agent", "assign_agent", { actionValue: "sales" }),
      action("reply", 480, "Reply Customer", "reply_customer", {
        replyText: "Thanks for your interest. A sales teammate will follow up with you shortly.",
      }),
    ],
  }),
  withEdges({
    id: "after-hours-reply",
    name: "After-hours reply",
    description: "Send a polite acknowledgement and create a ticket for next business day follow-up.",
    recommendedChannel: "any",
    nodes: [
      trigger("trigger", "New Message Received", "message_received", "any"),
      action("ticket", 160, "Create Ticket", "create_ticket", {
        ticketTitle: "After-hours follow-up: {{message}}",
        ticketDescription: "Follow up during business hours.\n\n{{message}}",
        ticketPriority: "medium",
      }),
      action("reply", 320, "Reply Customer", "reply_customer", {
        replyText: "We are currently outside support hours. We received your message and will follow up as soon as we are back.",
      }),
    ],
  }),
];

export function getWorkflowTemplate(id: string) {
  return workflowTemplates.find((template) => template.id === id);
}
