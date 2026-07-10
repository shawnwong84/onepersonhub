import { Prisma } from "@/generated/prisma/client";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/channels/email";
import { emitNewMessage } from "@/lib/realtime";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";
import { getInstalledModule } from "@/lib/modules";
import {
  finishWorkflowRun,
  recordWorkflowRunStep,
  startWorkflowRun,
} from "@/lib/workflow-run-logger";
import type { CanvasFlowEdge, CanvasFlowNode } from "@/lib/flow-builder";
import { assertSafeExternalUrl } from "@/lib/url-safety";

interface WorkflowRuntimeInput {
  channel: string;
  triggerEvent: string;
  conversationId: string;
  customerId?: string | null;
  agentId?: string | null;
  channelAccountId?: string | null;
  message: string;
  saveInputMessage?: boolean;
}

export interface WorkflowRuntimeResult {
  handled: boolean;
  replies: string[];
  flowId?: string;
  flowName?: string;
  pendingApproval?: boolean;
  pendingDelay?: boolean;
  reason?: string;
  checkedFlows?: number;
}

type WorkflowNodeData = NonNullable<CanvasFlowNode["data"]>;

interface WorkflowExecutionState {
  previousOutput: string;
  outputs: Record<string, string>;
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalize(value: string | undefined | null) {
  return (value || "").trim().toLowerCase();
}

function filterTerms(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((term) => normalize(term))
    .filter(Boolean);
}

function distanceWithinOne(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;

  let edits = 0;
  let left = 0;
  let right = 0;

  while (left < a.length && right < b.length) {
    if (a[left] === b[right]) {
      left += 1;
      right += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;

    if (a.length > b.length) {
      left += 1;
    } else if (b.length > a.length) {
      right += 1;
    } else {
      left += 1;
      right += 1;
    }
  }

  if (left < a.length || right < b.length) edits += 1;
  return edits <= 1;
}

function containsTerm(text: string, term: string) {
  const normalizedText = normalize(text);
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return true;
  if (normalizedText.includes(normalizedTerm)) return true;

  if (normalizedTerm.length < 5 || normalizedTerm.includes(" ")) {
    return false;
  }

  return normalizedText
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= normalizedTerm.length - 1)
    .some((word) => distanceWithinOne(word, normalizedTerm));
}

function containsAnyTerm(text: string, value: string | undefined) {
  const terms = filterTerms(value);
  if (terms.length === 0) return true;
  return terms.some((term) => containsTerm(text, term));
}

function truncate(value: string, max = 4000) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function isEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function triggerMatches(triggerEvent: string | undefined, incomingEvent: string) {
  const trigger = normalize(triggerEvent);
  const incoming = normalize(incomingEvent);
  if (!trigger || !incoming) return false;
  if (trigger === incoming) return true;

  const aliases: Record<string, string[]> = {
    email_message: ["email_received", "new_email_received"],
    email_received: ["email_message", "new_email_message"],
    whatsapp_message: ["whatsapp_received", "whatsapp_message_received"],
    whatsapp_received: ["whatsapp_message", "whatsapp_message_received"],
    message_received: [
      "email_message",
      "email_received",
      "whatsapp_message",
      "whatsapp_received",
      "sms_message",
      "sms_received",
      "telegram_message",
      "telegram_received",
    ],
  };

  if (aliases[trigger]?.includes(incoming)) return true;
  if (aliases[incoming]?.includes(trigger)) return true;

  return (
    trigger === "message_received" &&
    (incoming.endsWith("_message") || incoming.endsWith("_received"))
  );
}

async function filtersMatch(
  data: WorkflowNodeData,
  input: WorkflowRuntimeInput
): Promise<{ matches: boolean; reason?: string }> {
  const filters = data.filters || {};

  if (filters.message && !containsAnyTerm(input.message, filters.message)) {
    return {
      matches: false,
      reason: `message did not contain any of: ${filterTerms(filters.message).join(", ")}`,
    };
  }

  if (filters.value && !containsAnyTerm(input.message, filters.value)) {
    return {
      matches: false,
      reason: `message did not contain any of: ${filterTerms(filters.value).join(", ")}`,
    };
  }

  if (filters.tag) {
    if (!input.customerId) {
      return {
        matches: false,
        reason: `customer tag "${filters.tag}" required but no customer was linked`,
      };
    }
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { tags: true },
    });
    const tags = (customer?.tags || "")
      .split(",")
      .map((tag) => normalize(tag))
      .filter(Boolean);
    if (!tags.includes(normalize(filters.tag))) {
      return {
        matches: false,
        reason: `customer tag "${filters.tag}" did not match`,
      };
    }
  }

  return { matches: true };
}

function conditionMatches(data: WorkflowNodeData, input: WorkflowRuntimeInput) {
  const field = data.conditionField || "message";
  const operator = data.conditionOperator || "contains";
  const expected = normalize(data.conditionValue);
  const actual = field === "channel" ? normalize(input.channel) : normalize(input.message);

  if (!expected) return true;

  switch (operator) {
    case "equals":
      return actual === expected;
    case "starts_with":
      return actual.startsWith(expected);
    case "ends_with":
      return actual.endsWith(expected);
    case "contains":
    default:
      return containsTerm(actual, expected);
  }
}

function findHandledEdgeTargetIndex(
  nodeId: string,
  handle: "true" | "false",
  edges: CanvasFlowEdge[],
  executionNodes: CanvasFlowNode[]
) {
  const edge = edges.find((item) => item.source === nodeId && item.sourceHandle === handle);
  if (!edge) return null;
  const targetIndex = executionNodes.findIndex((node) => node.id === edge.target);
  return targetIndex >= 0 ? targetIndex : null;
}

async function saveCustomerMessage(conversationId: string, content: string) {
  const saved = await prisma.message.create({
    data: {
      conversationId,
      role: "customer",
      content,
      toolCalls: { source: "workflow" },
    },
  });

  emitNewMessage(conversationId, {
    id: saved.id,
    role: saved.role,
    content: saved.content,
  });
}

async function saveWorkflowReply(
  conversationId: string,
  content: string,
  flowId: string,
  flowName: string,
  stepId: string,
  metadata: Record<string, unknown> = {}
) {
  // Stamp the acting agent so conversation badges can show who replied.
  if (metadata.agentId && !metadata.agentName) {
    const agent = await prisma.agent.findUnique({
      where: { id: String(metadata.agentId) },
      select: { name: true },
    });
    if (agent) metadata.agentName = agent.name;
  }

  const saved = await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content,
      toolCalls: {
        source: "workflow",
        flowId,
        flowName,
        stepId,
        ...metadata,
      },
    },
  });

  emitNewMessage(conversationId, {
    id: saved.id,
    role: saved.role,
    content: saved.content,
  });
}

function getActionPreview(node: CanvasFlowNode | undefined) {
  const data = node?.data;
  if (!node || !data) return null;

  if (data.actionType === "reply_customer") {
    return {
      type: "reply_customer",
      label: data.label || "Reply Customer",
      payload: data.replyText || "",
    };
  }

  if (data.actionType === "call_api") {
    return {
      type: "call_api",
      label: data.label || "Call API",
      payload: `${data.apiMethod || "POST"} ${data.apiUrl || ""}`.trim(),
    };
  }

  return {
    type: data.actionType || data.nodeType || "step",
    label: data.label || "Workflow step",
    payload: data.actionValue || data.replyText || "",
  };
}

function renderWorkflowTemplate(
  template: string | undefined,
  input: WorkflowRuntimeInput,
  flowName: string,
  state?: WorkflowExecutionState
) {
  const variables: Record<string, string> = {
    message: input.message,
    channel: input.channel,
    triggerEvent: input.triggerEvent,
    conversationId: input.conversationId,
    customerId: input.customerId || "",
    flowName,
    "flow.name": flowName,
    "customer.id": input.customerId || "",
    "previous.output": state?.previousOutput || "",
  };

  for (const [nodeId, output] of Object.entries(state?.outputs || {})) {
    variables[`steps.${nodeId}.output`] = output;
  }

  return (template || "").replace(/\{\{([\w.:-]+)\}\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

function parseJsonObject(value: string, fieldName: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function stringifyHeaderValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function buildWorkflowApiRequest(
  data: WorkflowNodeData,
  input: WorkflowRuntimeInput,
  flowName: string,
  state?: WorkflowExecutionState
) {
  if (!data.apiUrl) throw new Error("API URL is required");

  const method = (data.apiMethod || "POST").toUpperCase();
  const renderedUrl = renderWorkflowTemplate(data.apiUrl, input, flowName, state).trim();
  const url = new URL(renderedUrl);
  const queryParams = parseJsonObject(
    renderWorkflowTemplate(data.apiQueryParams || "{}", input, flowName, state),
    "Query parameters"
  );

  for (const [key, value] of Object.entries(queryParams)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, String(item)));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const configuredHeaders = parseJsonObject(
    renderWorkflowTemplate(data.apiHeaders || "{}", input, flowName, state),
    "Headers"
  );
  const headers = new Headers();
  for (const [key, value] of Object.entries(configuredHeaders)) {
    const headerValue = stringifyHeaderValue(value);
    if (key.trim() && headerValue) headers.set(key, headerValue);
  }

  let body: string | undefined;
  const bodyMode = data.apiBodyMode || "json";
  if (!["GET", "HEAD"].includes(method) && bodyMode !== "none") {
    const renderedBody = renderWorkflowTemplate(data.apiBody || "{}", input, flowName, state);
    if (bodyMode === "json") {
      const parsedBody = JSON.parse(renderedBody || "{}") as unknown;
      body = JSON.stringify(parsedBody);
      if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    } else {
      body = renderedBody;
    }
  }

  return {
    method,
    url: url.toString(),
    headers,
    body,
    queryParams,
    bodyMode,
  };
}

function getDelayMs(data: WorkflowNodeData) {
  const amount = Math.max(1, Number(data.delayAmount || 1));
  switch (data.delayUnit) {
    case "hours":
      return amount * 60 * 60 * 1000;
    case "days":
      return amount * 24 * 60 * 60 * 1000;
    case "seconds":
      return amount * 1000;
    case "minutes":
    default:
      return amount * 60 * 1000;
  }
}

async function scheduleWorkflowContinuation(
  input: WorkflowRuntimeInput,
  flowId: string,
  flowName: string,
  delayNode: CanvasFlowNode,
  nextNode: CanvasFlowNode | undefined,
  runId?: string | null
) {
  const data = delayNode.data || {};
  const dueAt = new Date(Date.now() + getDelayMs(data));
  const job = await prisma.workflowJob.create({
    data: {
      flowId,
      flowName,
      conversationId: input.conversationId,
      triggerEvent: input.triggerEvent,
      channel: input.channel,
      customerId: input.customerId || null,
      message: input.message,
      nextNodeId: nextNode?.id || "",
      runId: runId || null,
      dueAt,
      metadata: {
        delayNodeId: delayNode.id,
        delayAmount: data.delayAmount || 1,
        delayUnit: data.delayUnit || "minutes",
      } as Prisma.InputJsonValue,
    },
  });

  await recordWorkflowRunStep(runId, {
    nodeId: delayNode.id,
    nodeLabel: data.label || "Wait",
    nodeType: "delay",
    actionType: data.actionType || "wait",
    status: "waiting_delay",
    message: `Workflow paused until ${dueAt.toISOString()}`,
    metadata: {
      jobId: job.id,
      nextNodeId: nextNode?.id || "",
      dueAt: dueAt.toISOString(),
      delayAmount: data.delayAmount || 1,
      delayUnit: data.delayUnit || "minutes",
    },
  });

  await logActivity({
    action: "workflow.delayed",
    entity: ACTIVITY_ENTITIES.WORKFLOW,
    entityId: flowId,
    description: `${flowName} paused until ${dueAt.toISOString()}.`,
    metadata: {
      flowId,
      flowName,
      runId: runId || null,
      conversationId: input.conversationId,
      jobId: job.id,
      nextNodeId: nextNode?.id || "",
      dueAt: dueAt.toISOString(),
      delayAmount: data.delayAmount || 1,
      delayUnit: data.delayUnit || "minutes",
    },
  });

  return job;
}

async function markTimedOutWorkflowApprovals() {
  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
    select: { workflowApprovalStaleMinutes: true },
  });
  const staleMinutes = Math.max(1, settings?.workflowApprovalStaleMinutes || 30);
  const staleBefore = Date.now() - staleMinutes * 60 * 1000;

  const conversations = await prisma.conversation.findMany({
    where: {
      metadata: {
        path: ["pendingWorkflowApproval", "status"],
        equals: "pending",
      },
    },
    select: {
      id: true,
      metadata: true,
      customerName: true,
    },
    take: 50,
  });

  let timedOut = 0;

  for (const conversation of conversations) {
    const metadata = asMetadata(conversation.metadata);
    const approval = asMetadata(metadata.pendingWorkflowApproval);
    const requestedAt = typeof approval.requestedAt === "string"
      ? new Date(approval.requestedAt).getTime()
      : Date.now();

    if (requestedAt > staleBefore) continue;

    const updatedApproval = {
      ...approval,
      status: "timed_out",
      timedOutAt: new Date().toISOString(),
      timeoutMinutes: staleMinutes,
    };

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        metadata: {
          ...metadata,
          pendingWorkflowApproval: updatedApproval,
        } as Prisma.InputJsonValue,
      },
    });

    if (typeof approval.runId === "string") {
      await recordWorkflowRunStep(approval.runId, {
        nodeId: String(approval.approvalNodeId || ""),
        nodeLabel: String(approval.title || "Workflow approval"),
        nodeType: "approval",
        actionType: "approval_timeout",
        status: "failed",
        message: `Approval timed out after ${staleMinutes} minutes`,
        metadata: { approvalId: approval.id || "" },
      });
      await finishWorkflowRun(
        approval.runId,
        "failed",
        `Approval timed out after ${staleMinutes} minutes`
      );
    }

    await createNotification({
      type: "workflow_approval_timeout",
      title: "Workflow approval timed out",
      message: `${approval.flowName || "Workflow"} for ${conversation.customerName} waited more than ${staleMinutes} minutes.`,
      priority: "high",
      href: `/conversations?conversationId=${conversation.id}`,
      conversationId: conversation.id,
      metadata: {
        approvalId: approval.id || "",
        timeoutMinutes: staleMinutes,
      },
    });

    timedOut += 1;
  }

  return timedOut;
}

async function findInternalEmailRecipient(target: string) {
  const normalizedTarget = normalize(target);
  if (isEmailAddress(target)) return target.trim();
  if (!normalizedTarget) return "";

  const member = await prisma.teamMember.findFirst({
    where: {
      OR: [
        { name: { contains: normalizedTarget, mode: "insensitive" } },
        { email: { contains: normalizedTarget, mode: "insensitive" } },
        { department: { name: { contains: normalizedTarget, mode: "insensitive" } } },
      ],
      isAvailable: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return member?.email || "";
}

async function sendWorkflowEmailReply(
  input: WorkflowRuntimeInput,
  replyText: string,
  flowName: string
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: {
      channel: true,
      customerContact: true,
      customerName: true,
      channelAccountId: true,
    },
  });

  if (conversation?.channel !== "email") {
    return {
      attempted: false,
      sent: false,
      reason: "Conversation channel is not email",
    };
  }

  const to = conversation.customerContact;
  if (!isEmailAddress(to)) {
    return {
      attempted: false,
      sent: false,
      reason: "Conversation does not have a valid customer email address",
    };
  }

  const sent = await sendEmail(
    to,
    `Re: ${flowName}`,
    replyText,
    conversation.channelAccountId
  );

  return {
    attempted: true,
    sent,
    to,
    reason: sent ? "Email sent" : "SMTP/IMAP email channel is not configured",
  };
}

async function generateWorkflowAiReply(
  input: WorkflowRuntimeInput,
  instruction: string | undefined,
  includeKnowledgeBase: boolean
) {
  const settings = await prisma.settings.findFirst();
  if (!settings?.aiApiKey) {
    return {
      ok: false,
      reason: "AI is not configured. Add an API key in Settings.",
      reply: "",
      knowledgeBaseCount: 0,
      knowledgeBaseTitles: [] as string[],
    };
  }

  const [conversation, knowledgeEntries] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id: input.conversationId },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 20 },
      },
    }),
    includeKnowledgeBase
      ? prisma.knowledgeEntry.findMany({
          where: { isActive: true },
          include: { category: true },
          orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
          take: 8,
        })
      : Promise.resolve([]),
  ]);

  if (!conversation) {
    return {
      ok: false,
      reason: "Conversation was not found",
      reply: "",
      knowledgeBaseCount: 0,
      knowledgeBaseTitles: [] as string[],
    };
  }

  const knowledgeText = knowledgeEntries.length
    ? knowledgeEntries
        .map((entry) => `[${entry.category.name}] ${entry.title}\n${entry.content}`)
        .join("\n\n---\n\n")
    : "No knowledge base entries were included.";

  const openai = new OpenAI({ apiKey: settings.aiApiKey });
  const completion = await openai.chat.completions.create({
    model: settings.aiModel || "gpt-4o-mini",
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    messages: [
      {
        role: "system",
        content: `You are Cosstigo's workflow assistant. Generate one concise customer-service reply for the active conversation. Use only the provided context and do not call tools.\n\nBusiness: ${settings.businessName}\nTone: ${settings.tone}\nLanguage: ${settings.language}\n\nWorkflow instruction: ${instruction || "Reply helpfully to the latest customer message."}\n\nKnowledge base:\n${knowledgeText}`,
      },
      ...conversation.messages.map((message) => ({
        role: message.role === "assistant" ? "assistant" as const : "user" as const,
        content: message.content,
      })),
      {
        role: "user" as const,
        content: input.message,
      },
    ],
  });

  return {
    ok: true,
    reason: "AI reply generated",
    reply: completion.choices[0]?.message.content || "",
    knowledgeBaseCount: knowledgeEntries.length,
    knowledgeBaseTitles: knowledgeEntries.slice(0, 5).map((entry) => entry.title),
  };
}

async function generateWorkflowLlmOutput(
  input: WorkflowRuntimeInput,
  flowName: string,
  instruction: string | undefined,
  prompt: string | undefined,
  outputMode: string | undefined,
  state?: WorkflowExecutionState
) {
  const settings = await prisma.settings.findFirst();
  if (!settings?.aiApiKey) {
    return {
      ok: false,
      reason: "AI is not configured. Add an API key in Settings.",
      output: "",
    };
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 12 },
    },
  });

  if (!conversation) {
    return {
      ok: false,
      reason: "Conversation was not found",
      output: "",
    };
  }

  const renderedInstruction = renderWorkflowTemplate(instruction, input, flowName, state).trim();
  const renderedPrompt = renderWorkflowTemplate(prompt, input, flowName, state).trim();
  const formatInstruction =
    outputMode === "json"
      ? "Return valid JSON only. Do not wrap it in markdown."
      : outputMode === "customer_reply"
        ? "Return a customer-safe reply draft only."
        : "Return concise plain text only.";

  const openai = new OpenAI({ apiKey: settings.aiApiKey });
  const completion = await openai.chat.completions.create({
    model: settings.aiModel || "gpt-4o-mini",
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    messages: [
      {
        role: "system",
        content: [
          "You are Cosstigo's workflow LLM step.",
          "Generate output for the next workflow node. Do not send a customer reply yourself.",
          formatInstruction,
          "",
          `Business: ${settings.businessName}`,
          `Tone: ${settings.tone}`,
          `Language: ${settings.language}`,
          "",
          `Instruction: ${renderedInstruction || "Produce the requested workflow output."}`,
        ].join("\n"),
      },
      ...conversation.messages.map((message) => ({
        role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: message.content,
      })),
      {
        role: "user" as const,
        content:
          renderedPrompt ||
          [
            `Workflow: ${flowName}`,
            `Channel: ${input.channel}`,
            `Customer message: ${input.message}`,
            `Previous node output: ${state?.previousOutput || ""}`,
          ].join("\n"),
      },
    ],
  });

  return {
    ok: true,
    reason: "LLM output generated",
    output: completion.choices[0]?.message.content || "",
  };
}

async function findAssignmentTarget(target: string) {
  const normalizedTarget = normalize(target);
  const members = await prisma.teamMember.findMany({
    where: { isAvailable: true },
    include: {
      department: true,
      _count: { select: { tickets: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (members.length === 0) return null;

  if (normalizedTarget) {
    const directMember = members.find((member) => {
      return (
        normalize(member.id) === normalizedTarget ||
        normalize(member.name).includes(normalizedTarget) ||
        normalize(member.email).includes(normalizedTarget)
      );
    });
    if (directMember) return directMember;

    const departmentMember = members.find((member) =>
      normalize(member.department.name).includes(normalizedTarget)
    );
    if (departmentMember) return departmentMember;

    const expertiseMember = members.find((member) =>
      normalize(member.expertise).includes(normalizedTarget)
    );
    if (expertiseMember) return expertiseMember;
  }

  return members.reduce((leastBusy, member) =>
    member._count.tickets < leastBusy._count.tickets ? member : leastBusy
  );
}

async function createPendingApproval(
  input: WorkflowRuntimeInput,
  flowId: string,
  flowName: string,
  approvalNode: CanvasFlowNode,
  nextNode: CanvasFlowNode | undefined,
  runId?: string | null
) {
  const proposedAction = getActionPreview(nextNode);
  const approval = {
    id: `approval-${Date.now()}`,
    status: "pending",
    flowId,
    flowName,
    approvalNodeId: approvalNode.id,
    nextNodeId: nextNode?.id || null,
    runId: runId || null,
    title: approvalNode.data?.approvalTitle || "Approve next workflow step",
    instructions:
      approvalNode.data?.approvalInstructions ||
      "Review the proposed workflow step before it runs.",
    proposedAction,
    requestedAt: new Date().toISOString(),
  };

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { metadata: true },
  });
  const metadata = asMetadata(conversation?.metadata);

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: {
      metadata: {
        ...metadata,
        pendingWorkflowApproval: approval,
      },
      updatedAt: new Date(),
    },
  });

  const saved = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      role: "system",
      content: `Workflow approval required: ${approval.title}`,
      toolCalls: {
        source: "workflow_approval",
        flowId,
        flowName,
        approvalId: approval.id,
      },
    },
  });

  emitNewMessage(input.conversationId, {
    id: saved.id,
    role: saved.role,
    content: saved.content,
  });

  logger.info("[Workflow] Waiting for customer service approval", {
    flowId,
    flowName,
    conversationId: input.conversationId,
    approvalId: approval.id,
  });

  await recordWorkflowRunStep(runId, {
    nodeId: approvalNode.id,
    nodeLabel: approvalNode.data?.label || "Approval Required",
    nodeType: "approval",
    actionType: approvalNode.data?.actionType || "approval_required",
    status: "waiting_approval",
    message: approval.title,
    metadata: {
      approvalId: approval.id,
      nextNodeId: approval.nextNodeId,
      proposedAction,
    },
  });

  await createNotification({
    type: "workflow_approval_required",
    title: "Workflow approval required",
    message: `${flowName}: ${approval.title}`,
    priority: "high",
    href: `/conversations?conversationId=${input.conversationId}`,
    conversationId: input.conversationId,
    metadata: {
      flowId,
      flowName,
      approvalId: approval.id,
      approvalNodeId: approval.approvalNodeId,
      nextNodeId: approval.nextNodeId,
      proposedAction,
    },
  });

  await logActivity({
    action: "workflow.approval_requested",
    entity: ACTIVITY_ENTITIES.APPROVAL,
    entityId: approval.id,
    description: `${flowName}: approval requested for ${approval.title}.`,
    metadata: {
      flowId,
      flowName,
      conversationId: input.conversationId,
      approvalId: approval.id,
      runId: runId || null,
      nextNodeId: approval.nextNodeId,
      proposedAction,
    },
  });
}

async function executeAction(
  node: CanvasFlowNode,
  input: WorkflowRuntimeInput,
  flowId: string,
  flowName: string,
  replies: string[],
  runId?: string | null,
  state?: WorkflowExecutionState
): Promise<string | void> {
  const data = node.data;
  if (!data) return;

  if (data.actionType === "reply_customer" && data.replyText) {
    const replyText = renderWorkflowTemplate(data.replyText, input, flowName, state);
    const emailDelivery = await sendWorkflowEmailReply(input, replyText, flowName);
    if (emailDelivery.attempted && !emailDelivery.sent) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Reply Customer",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "failed",
        message: emailDelivery.reason,
        metadata: {
          replyText,
          channel: input.channel,
          delivery: emailDelivery,
        },
      });
      return "";
    }

    replies.push(replyText);
    await saveWorkflowReply(input.conversationId, replyText, flowId, flowName, node.id, {
      agentId: input.agentId || undefined,
      delivery: emailDelivery.attempted
        ? { channel: "email", to: emailDelivery.to, status: "sent" }
        : { channel: input.channel, status: "saved" },
    });
    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Reply Customer",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: "completed",
      message: emailDelivery.attempted ? "Sent email workflow reply" : "Saved workflow reply",
      metadata: { replyText, delivery: emailDelivery },
    });
    return replyText;
  }

  if (data.actionType === "send_notification") {
    const message = renderWorkflowTemplate(data.actionValue, input, flowName, state).trim() ||
      `${flowName} handled a ${input.channel} event.`;

    await createNotification({
      type: "workflow_notification",
      title: data.label || "Workflow notification",
      message,
      priority: "normal",
      href: `/conversations?conversationId=${input.conversationId}`,
      conversationId: input.conversationId,
      metadata: {
        flowId,
        flowName,
        stepId: node.id,
      },
    });

    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Send Notification",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: "completed",
      message: "Created internal notification",
      metadata: { notificationMessage: message },
    });
    return message;
  }

  if (data.actionType === "send_email") {
    const target = renderWorkflowTemplate(data.actionValue, input, flowName, state).trim();
    const to = await findInternalEmailRecipient(target);
    const subject = `Workflow notification: ${flowName}`;
    const body = [
      `Workflow: ${flowName}`,
      `Channel: ${input.channel}`,
      `Conversation: ${input.conversationId}`,
      "",
      `Customer message:`,
      input.message,
    ].join("\n");

    if (!to) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Send Email",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: target
          ? `No internal email recipient matched "${target}"`
          : "No email recipient was configured",
        metadata: { target },
      });
      return "";
    }

    const sent = await sendEmail(to, subject, body);
    await createNotification({
      type: sent ? "workflow_email_sent" : "workflow_email_failed",
      title: sent ? "Workflow email sent" : "Workflow email not sent",
      message: sent
        ? `${flowName} sent an internal email to ${to}.`
        : `${flowName} could not send email to ${to}. Check SMTP settings.`,
      priority: sent ? "normal" : "high",
      href: `/conversations?conversationId=${input.conversationId}`,
      conversationId: input.conversationId,
      metadata: { flowId, flowName, stepId: node.id, to },
    });

    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Send Email",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: sent ? "completed" : "failed",
      message: sent ? `Sent internal email to ${to}` : "SMTP/IMAP email channel is not configured",
      metadata: { to, subject, bodyPreview: truncate(body, 1000) },
    });
    return body;
  }

  if (data.actionType === "add_tag" && data.actionValue && input.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { tags: true },
    });
    const tags = new Set(
      (customer?.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    );
    tags.add(data.actionValue.trim());
    await prisma.customer.update({
      where: { id: input.customerId },
      data: { tags: Array.from(tags).join(",") },
    });
    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Add Tag",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: "completed",
      message: `Added customer tag "${data.actionValue.trim()}"`,
      metadata: { tag: data.actionValue.trim(), customerId: input.customerId },
    });
    return data.actionValue.trim();
  }

  if (data.actionType === "create_ticket") {
    const priority = ["low", "medium", "high", "urgent"].includes(data.ticketPriority || "")
      ? data.ticketPriority!
      : "medium";
    const title =
      renderWorkflowTemplate(data.ticketTitle, input, flowName, state).trim() ||
      `Workflow follow-up: ${input.message.slice(0, 80)}`;
    const description =
      renderWorkflowTemplate(data.ticketDescription, input, flowName, state).trim() ||
      `Created by workflow "${flowName}" from ${input.channel} message:\n\n${input.message}`;

    const ticket = await prisma.ticket.create({
      data: {
        conversationId: input.conversationId,
        title,
        description,
        priority,
        status: "open",
      },
    });

    const systemMessage = await prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: "system",
        content: `Workflow created ticket: ${ticket.title}`,
        toolCalls: {
          source: "workflow_ticket",
          flowId,
          flowName,
          stepId: node.id,
          ticketId: ticket.id,
          ticketTitle: ticket.title,
          ticketPriority: ticket.priority,
        },
      },
    });

    emitNewMessage(input.conversationId, {
      id: systemMessage.id,
      role: systemMessage.role,
      content: systemMessage.content,
    });

    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Create Ticket",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: "completed",
      message: `Created ticket "${ticket.title}"`,
      metadata: {
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        priority: ticket.priority,
      },
    });
    return `${ticket.title}\n${ticket.description}`;
  }

  if (data.actionType === "create_module_record") {
    const moduleSlug = data.moduleSlug || "";
    const installed = moduleSlug ? await getInstalledModule(moduleSlug) : null;
    if (!installed) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Create Module Record",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: moduleSlug ? `Module "${moduleSlug}" is not installed` : "No module selected",
        metadata: { moduleSlug },
      });
      return "";
    }

    const recordType = data.moduleRecordType || "record";
    const title =
      renderWorkflowTemplate(data.moduleRecordTitle, input, flowName, state).trim() ||
      `${installed.catalog.name}: ${input.message.slice(0, 80)}`;
    const recordData = parseJsonObject(
      renderWorkflowTemplate(data.moduleRecordData || "{}", input, flowName, state),
      "Module record data"
    );

    const record = await prisma.moduleRecord.create({
      data: {
        moduleId: installed.module.id,
        recordType,
        title,
        status: data.moduleRecordStatus || "open",
        priority: data.moduleRecordPriority || "normal",
        sourceChannel: input.channel,
        sourceMessage: input.message,
        conversationId: input.conversationId,
        customerId: input.customerId || null,
        data: recordData as Prisma.InputJsonObject,
        createdBy: "Workflow",
        updatedBy: "Workflow",
        events: {
          create: {
            action: "workflow_created",
            description: `${flowName} created this record.`,
            createdBy: "Workflow",
            metadata: { flowId, flowName, stepId: node.id } as Prisma.InputJsonObject,
          },
        },
      },
    });

    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Create Module Record",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: "completed",
      message: `Created ${installed.catalog.name} ${record.recordType} record "${record.title}"`,
      metadata: {
        moduleSlug,
        moduleId: installed.module.id,
        moduleRecordId: record.id,
        recordType: record.recordType,
      },
    });

    const moduleMessage = await prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: "system",
        content: `Workflow created ${installed.catalog.name} record: ${record.title}`,
        toolCalls: {
          source: "workflow_module_record",
          flowId,
          flowName,
          stepId: node.id,
          moduleSlug,
          moduleId: installed.module.id,
          moduleRecordId: record.id,
          recordType: record.recordType,
        },
      },
    });
    emitNewMessage(input.conversationId, {
      id: moduleMessage.id,
      role: moduleMessage.role,
      content: moduleMessage.content,
    });

    await logActivity({
      action: "module_record.workflow_created",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: record.id,
      description: `${flowName} created ${installed.catalog.name} record: ${record.title}.`,
      metadata: {
        flowId,
        flowName,
        stepId: node.id,
        moduleSlug,
        moduleId: installed.module.id,
        conversationId: input.conversationId,
      },
    });

    if (!input.triggerEvent.startsWith("module_") && !input.triggerEvent.startsWith("reporter_")) {
      await runChannelWorkflows({
        channel: "module",
        triggerEvent: "module_record_created",
        conversationId: input.conversationId,
        customerId: input.customerId || null,
        message: `${installed.catalog.name} ${record.recordType} created: ${record.title}`,
        saveInputMessage: false,
      });
    }

    return JSON.stringify({
      moduleSlug,
      moduleRecordId: record.id,
      recordType: record.recordType,
      title: record.title,
      status: record.status,
    });
  }

  if (data.actionType === "create_module_signal") {
    const moduleSlug = data.moduleSlug || "";
    const installed = moduleSlug ? await getInstalledModule(moduleSlug) : null;
    if (!installed) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Create Module Signal",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: moduleSlug ? `Module "${moduleSlug}" is not installed` : "No module selected",
        metadata: { moduleSlug },
      });
      return "";
    }

    const signalTitle =
      renderWorkflowTemplate(data.moduleSignalTitle, input, flowName, state).trim() ||
      `${installed.catalog.name} requires attention`;
    const signalDescription = renderWorkflowTemplate(
      data.moduleSignalDescription,
      input,
      flowName,
      state
    ).trim();
    const signalData = parseJsonObject(
      renderWorkflowTemplate(data.moduleSignalData || "{}", input, flowName, state),
      "Module signal data"
    );

    const signal = await prisma.moduleSignal.create({
      data: {
        moduleId: installed.module.id,
        signalType: data.moduleSignalType || "attention_required",
        severity: data.moduleSignalSeverity || "medium",
        title: signalTitle,
        description: signalDescription,
        status: "open",
        metadata: {
          ...signalData,
          flowId,
          flowName,
          stepId: node.id,
          conversationId: input.conversationId,
        },
        createdBy: "Workflow",
      },
    });

    await createNotification({
      type: "module_signal_created",
      title: `Reporter signal: ${signal.title}`,
      message: `${installed.catalog.name}: ${signal.description || signal.signalType}`,
      priority: signal.severity === "urgent" || signal.severity === "high" ? "high" : "normal",
      href: "/marketplace",
      conversationId: input.conversationId,
      metadata: {
        signalId: signal.id,
        moduleSlug,
        moduleId: installed.module.id,
        signalType: signal.signalType,
        severity: signal.severity,
      },
    });

    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Create Module Signal",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: "completed",
      message: `Created Reporter Agent signal "${signal.title}"`,
      metadata: {
        moduleSlug,
        moduleId: installed.module.id,
        signalId: signal.id,
        signalType: signal.signalType,
        severity: signal.severity,
      },
    });

    const signalMessage = await prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: "system",
        content: `Workflow created Reporter Agent signal: ${signal.title}`,
        toolCalls: {
          source: "workflow_module_signal",
          flowId,
          flowName,
          stepId: node.id,
          moduleSlug,
          moduleId: installed.module.id,
          signalId: signal.id,
          signalType: signal.signalType,
          severity: signal.severity,
        },
      },
    });
    emitNewMessage(input.conversationId, {
      id: signalMessage.id,
      role: signalMessage.role,
      content: signalMessage.content,
    });

    await logActivity({
      action: "module_signal.workflow_created",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: signal.id,
      description: `${flowName} created Reporter Agent signal: ${signal.title}.`,
      metadata: {
        flowId,
        flowName,
        stepId: node.id,
        moduleSlug,
        moduleId: installed.module.id,
        conversationId: input.conversationId,
        severity: signal.severity,
      },
    });

    if (!input.triggerEvent.startsWith("module_") && !input.triggerEvent.startsWith("reporter_")) {
      await runChannelWorkflows({
        channel: "module",
        triggerEvent: moduleSlug === "reporter-agent" ? "reporter_signal_created" : "module_signal_created",
        conversationId: input.conversationId,
        customerId: input.customerId || null,
        message: `${installed.catalog.name} signal created: ${signal.title} (${signal.severity})`,
        saveInputMessage: false,
      });
    }

    return JSON.stringify({
      moduleSlug,
      signalId: signal.id,
      signalType: signal.signalType,
      severity: signal.severity,
      title: signal.title,
    });
  }

  if (data.actionType === "find_module_record") {
    const moduleSlug = data.moduleSlug || "";
    const installed = moduleSlug ? await getInstalledModule(moduleSlug) : null;
    const search = renderWorkflowTemplate(data.moduleRecordSearch || data.moduleRecordTitle || "", input, flowName, state).trim();
    if (!installed || !search) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Find Module Record",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: !installed ? "Module is not installed" : "No search value was configured",
        metadata: { moduleSlug, search },
      });
      return "";
    }

    const record = await prisma.moduleRecord.findFirst({
      where: {
        moduleId: installed.module.id,
        OR: [
          { id: search },
          { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { sourceMessage: { contains: search, mode: Prisma.QueryMode.insensitive } },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });

    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Find Module Record",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: record ? "completed" : "skipped",
      message: record ? `Found ${installed.catalog.name} record "${record.title}"` : "No module record matched",
      metadata: { moduleSlug, search, moduleRecordId: record?.id || null },
    });

    return record
      ? JSON.stringify({
          moduleSlug,
          moduleRecordId: record.id,
          recordType: record.recordType,
          title: record.title,
          status: record.status,
          priority: record.priority,
          data: record.data,
        })
      : "";
  }

  if (data.actionType === "update_module_record") {
    const moduleSlug = data.moduleSlug || "";
    const installed = moduleSlug ? await getInstalledModule(moduleSlug) : null;
    const renderedId = renderWorkflowTemplate(data.moduleRecordId || "", input, flowName, state).trim();
    const fallbackSearch = renderWorkflowTemplate(data.moduleRecordSearch || "", input, flowName, state).trim();
    if (!installed) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Update Module Record",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: "Module is not installed",
        metadata: { moduleSlug },
      });
      return "";
    }

    const existing = renderedId
      ? await prisma.moduleRecord.findFirst({ where: { id: renderedId, moduleId: installed.module.id } })
      : fallbackSearch
        ? await prisma.moduleRecord.findFirst({
            where: {
              moduleId: installed.module.id,
              OR: [
                { title: { contains: fallbackSearch, mode: Prisma.QueryMode.insensitive } },
                { sourceMessage: { contains: fallbackSearch, mode: Prisma.QueryMode.insensitive } },
              ],
            },
            orderBy: { updatedAt: "desc" },
          })
        : null;

    if (!existing) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Update Module Record",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: "No module record matched",
        metadata: { moduleSlug, renderedId, fallbackSearch },
      });
      return "";
    }

    const patchData = parseJsonObject(
      renderWorkflowTemplate(data.moduleRecordUpdateData || data.moduleRecordData || "{}", input, flowName, state),
      "Module record update data"
    );
    const record = await prisma.moduleRecord.update({
      where: { id: existing.id },
      data: {
        ...(data.moduleRecordStatus && { status: data.moduleRecordStatus }),
        ...(data.moduleRecordPriority && { priority: data.moduleRecordPriority }),
        data: {
          ...(existing.data && typeof existing.data === "object" && !Array.isArray(existing.data) ? existing.data : {}),
          ...patchData,
        } as Prisma.InputJsonObject,
        updatedBy: "Workflow",
        events: {
          create: {
            action: "workflow_updated",
            description: `${flowName} updated this record.`,
            createdBy: "Workflow",
            metadata: { flowId, flowName, stepId: node.id, patchData } as Prisma.InputJsonObject,
          },
        },
      },
    });

    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Update Module Record",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: "completed",
      message: `Updated ${installed.catalog.name} record "${record.title}"`,
      metadata: { moduleSlug, moduleRecordId: record.id, patchData },
    });

    const moduleMessage = await prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: "system",
        content: `Workflow updated ${installed.catalog.name} record: ${record.title}`,
        toolCalls: {
          source: "workflow_module_record",
          flowId,
          flowName,
          stepId: node.id,
          moduleSlug,
          moduleId: installed.module.id,
          moduleRecordId: record.id,
          recordType: record.recordType,
        },
      },
    });
    emitNewMessage(input.conversationId, {
      id: moduleMessage.id,
      role: moduleMessage.role,
      content: moduleMessage.content,
    });

    await logActivity({
      action: "module_record.workflow_updated",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: record.id,
      description: `${flowName} updated ${installed.catalog.name} record: ${record.title}.`,
      metadata: { flowId, flowName, stepId: node.id, moduleSlug, moduleId: installed.module.id },
    });

    if (!input.triggerEvent.startsWith("module_") && !input.triggerEvent.startsWith("reporter_")) {
      await runChannelWorkflows({
        channel: "module",
        triggerEvent: "module_record_updated",
        conversationId: input.conversationId,
        customerId: input.customerId || null,
        message: `${installed.catalog.name} ${record.recordType} updated: ${record.title}`,
        saveInputMessage: false,
      });
    }

    return JSON.stringify({
      moduleSlug,
      moduleRecordId: record.id,
      title: record.title,
      status: record.status,
      priority: record.priority,
      data: record.data,
    });
  }

  if (data.actionType === "resolve_module_signal") {
    const moduleSlug = data.moduleSlug || "";
    const installed = moduleSlug ? await getInstalledModule(moduleSlug) : null;
    const signalId = renderWorkflowTemplate(data.moduleSignalId || "", input, flowName, state).trim();
    if (!installed || !signalId) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Resolve Module Signal",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: !installed ? "Module is not installed" : "No signal ID was configured",
        metadata: { moduleSlug, signalId },
      });
      return "";
    }

    const signal = await prisma.moduleSignal.findFirst({
      where: { id: signalId, moduleId: installed.module.id },
    });
    if (!signal) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Resolve Module Signal",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: "No signal matched",
        metadata: { moduleSlug, signalId },
      });
      return "";
    }

    const resolved = await prisma.moduleSignal.update({
      where: { id: signal.id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        resolvedBy: "Workflow",
      },
    });

    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Resolve Module Signal",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: "completed",
      message: `Resolved Reporter Agent signal "${resolved.title}"`,
      metadata: { moduleSlug, signalId: resolved.id },
    });

    await logActivity({
      action: "module_signal.workflow_resolved",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: resolved.moduleRecordId || resolved.id,
      description: `${flowName} resolved Reporter Agent signal: ${resolved.title}.`,
      metadata: { flowId, flowName, stepId: node.id, moduleSlug, moduleId: installed.module.id },
    });

    return JSON.stringify({ moduleSlug, signalId: resolved.id, status: resolved.status });
  }

  if (data.actionType === "update_customer") {
    if (!input.customerId) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Update Customer Field",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: "No linked customer was available to update",
        metadata: { actionValue: data.actionValue || "" },
      });
      return "";
    }

    const [rawField, ...rawValueParts] = (data.actionValue || "").split("=");
    const field = rawField?.trim();
    const value = rawValueParts.join("=").trim();
    const allowedFields = ["name", "email", "phone", "whatsapp", "tags"] as const;

    if (!allowedFields.includes(field as (typeof allowedFields)[number]) || !value) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Update Customer Field",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: "Expected value format: name=value, email=value, phone=value, whatsapp=value, or tags=value",
        metadata: { actionValue: data.actionValue || "" },
      });
      return "";
    }

    await prisma.customer.update({
      where: { id: input.customerId },
      data: { [field]: value },
    });

    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Update Customer Field",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: "completed",
      message: `Updated customer ${field}`,
      metadata: {
        customerId: input.customerId,
        field,
        value,
      },
    });
    return `${field}=${value}`;
  }

  if (data.actionType === "assign_agent") {
    const target = renderWorkflowTemplate(data.actionValue, input, flowName, state).trim();
    const member = await findAssignmentTarget(target);

    if (!member) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Assign to Agent",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: target
          ? `No available agent matched "${target}"`
          : "No available agent was found",
        metadata: { target },
      });
      return "";
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: { metadata: true },
    });
    const metadata = asMetadata(conversation?.metadata);

    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        status: "escalated",
        metadata: {
          ...metadata,
          assignedToId: member.id,
          assignedToName: member.name,
          assignedDepartmentId: member.departmentId,
          assignedDepartmentName: member.department.name,
          assignedAt: new Date().toISOString(),
          assignedBy: "workflow",
        } as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    const updatedTickets = await prisma.ticket.updateMany({
      where: {
        conversationId: input.conversationId,
        status: { in: ["open", "in_progress"] },
      },
      data: {
        assignedToId: member.id,
        departmentId: member.departmentId,
        status: "in_progress",
      },
    });

    const systemMessage = await prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: "system",
        content: `Workflow assigned conversation to ${member.name} (${member.department.name})`,
        toolCalls: {
          source: "workflow_assignment",
          flowId,
          flowName,
          stepId: node.id,
          assignedToId: member.id,
          assignedToName: member.name,
          departmentId: member.departmentId,
          departmentName: member.department.name,
          ticketCount: updatedTickets.count,
        },
      },
    });

    emitNewMessage(input.conversationId, {
      id: systemMessage.id,
      role: systemMessage.role,
      content: systemMessage.content,
    });

    await createNotification({
      type: "conversation_assigned",
      title: "Conversation assigned by workflow",
      message: `${flowName} assigned a conversation to ${member.name}.`,
      priority: "normal",
      href: `/conversations?conversationId=${input.conversationId}`,
      conversationId: input.conversationId,
      metadata: {
        flowId,
        flowName,
        assignedToId: member.id,
        assignedToName: member.name,
        departmentId: member.departmentId,
        departmentName: member.department.name,
        ticketCount: updatedTickets.count,
      },
    });

    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Assign to Agent",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: "completed",
      message: `Assigned to ${member.name} (${member.department.name})`,
      metadata: {
        target,
        assignedToId: member.id,
        assignedToName: member.name,
        departmentId: member.departmentId,
        departmentName: member.department.name,
        ticketCount: updatedTickets.count,
      },
    });
    return `${member.name} (${member.department.name})`;
  }

  if (data.actionType === "call_api" && data.apiUrl) {
    let responseText = "";
    let request: ReturnType<typeof buildWorkflowApiRequest> | null = null;
    try {
      request = buildWorkflowApiRequest(data, input, flowName, state);
      await assertSafeExternalUrl(request.url);
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      responseText = await response.text();
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Call API",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: response.ok ? "completed" : "failed",
        message: `${request.method} ${request.url} returned ${response.status}`,
        metadata: {
          apiUrl: request.url,
          apiMethod: request.method,
          apiQueryParams: request.queryParams,
          apiHeaders: Object.fromEntries(request.headers.entries()),
          apiBodyMode: request.bodyMode,
          requestBody: request.body ? truncate(request.body) : "",
          status: response.status,
          responseBody: truncate(responseText),
        },
      });
      if (!response.ok) {
        await logActivity({
          action: "workflow.action_failed",
          entity: ACTIVITY_ENTITIES.WORKFLOW,
          entityId: flowId,
          description: `${flowName}: API action failed with HTTP ${response.status}.`,
          metadata: {
            flowId,
            flowName,
            runId: runId || null,
            conversationId: input.conversationId,
            stepId: node.id,
            actionType: data.actionType,
            apiUrl: request.url,
            apiMethod: request.method,
            status: response.status,
          },
        });
      }
    } catch (error) {
      logger.error("[Workflow] API action failed", { flowId, stepId: node.id, error });
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Call API",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        metadata: {
          apiUrl: request?.url || data.apiUrl,
          apiMethod: request?.method || data.apiMethod || "POST",
          apiQueryParams: request?.queryParams || data.apiQueryParams || "",
          apiHeaders: request ? Object.fromEntries(request.headers.entries()) : data.apiHeaders || "",
          apiBodyMode: request?.bodyMode || data.apiBodyMode || "json",
          requestBody: request?.body ? truncate(request.body) : "",
        },
      });
      await logActivity({
        action: "workflow.action_failed",
        entity: ACTIVITY_ENTITIES.WORKFLOW,
        entityId: flowId,
        description: `${flowName}: API action failed.`,
        metadata: {
          flowId,
          flowName,
          runId: runId || null,
          conversationId: input.conversationId,
          stepId: node.id,
          actionType: data.actionType,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
    return responseText;
  }

  if (data.actionType === "call_mcp_tool") {
    const toolName = data.mcpTool || "";
    const serverRef = data.mcpServer || "";
    const serverUrl = serverRef.startsWith("http") ? serverRef : "";
    if (!toolName || !serverUrl) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Call MCP Tool",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "skipped",
        message: !toolName
          ? "No MCP tool name configured"
          : `MCP server "${serverRef}" is not a URL. Set the step's server to the MCP endpoint URL.`,
        metadata: { mcpServer: serverRef, mcpTool: toolName },
      });
      return "";
    }

    try {
      await assertSafeExternalUrl(serverUrl);

      let args: Record<string, unknown> = {};
      const renderedInput = renderWorkflowTemplate(data.mcpInput || "{}", input, flowName, state);
      try {
        args = JSON.parse(renderedInput) as Record<string, unknown>;
      } catch {
        args = { input: renderedInput };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: node.id,
          method: "tools/call",
          params: { name: toolName, arguments: args },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const body = (await response.json().catch(() => ({}))) as {
        result?: { content?: Array<{ type?: string; text?: string }> };
        error?: { message?: string };
      };
      if (!response.ok || body.error) {
        throw new Error(body.error?.message || `MCP server responded ${response.status}`);
      }

      const output = Array.isArray(body.result?.content)
        ? body.result.content.map((item) => item.text || "").filter(Boolean).join("\n")
        : JSON.stringify(body.result ?? {});

      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Call MCP Tool",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "completed",
        message: `Called MCP tool ${toolName}`,
        metadata: { mcpServer: serverUrl, mcpTool: toolName, outputPreview: truncate(output, 1000) },
      });
      return output;
    } catch (error) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Call MCP Tool",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        metadata: { mcpServer: serverUrl, mcpTool: toolName },
      });
      await logActivity({
        action: "workflow.action_failed",
        entity: ACTIVITY_ENTITIES.WORKFLOW,
        entityId: flowId,
        description: `${flowName}: MCP tool call failed.`,
        metadata: {
          flowId,
          flowName,
          runId: runId || null,
          conversationId: input.conversationId,
          stepId: node.id,
          actionType: data.actionType,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return "";
    }
  }

  if (data.actionType === "run_skill") {
    try {
      const generated = await generateWorkflowLlmOutput(
        input,
        flowName,
        data.skillPrompt || `Run the "${data.skillName || "unnamed"}" skill on the customer message.`,
        "{{message}}",
        "text",
        state
      );
      if (!generated.ok || !generated.output.trim()) {
        await recordWorkflowRunStep(runId, {
          nodeId: node.id,
          nodeLabel: data.label || "Run Skill",
          nodeType: data.nodeType,
          actionType: data.actionType,
          status: "skipped",
          message: generated.reason || "Skill produced no output",
          metadata: { skillName: data.skillName || "" },
        });
        return "";
      }

      const output = generated.output.trim();
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Run Skill",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "completed",
        message: `Ran skill ${data.skillName || ""}`.trim(),
        metadata: { skillName: data.skillName || "", outputPreview: truncate(output, 1000) },
      });
      return output;
    } catch (error) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Run Skill",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        metadata: { skillName: data.skillName || "" },
      });
      return "";
    }
  }

  if (data.actionType === "llm" || data.nodeType === "llm") {
    try {
      const generated = await generateWorkflowLlmOutput(
        input,
        flowName,
        data.llmInstruction || data.actionValue,
        data.llmPrompt,
        data.llmOutputMode,
        state
      );

      if (!generated.ok || !generated.output.trim()) {
        await recordWorkflowRunStep(runId, {
          nodeId: node.id,
          nodeLabel: data.label || "LLM",
          nodeType: data.nodeType,
          actionType: data.actionType || "llm",
          status: "skipped",
          message: generated.reason,
          metadata: {
            outputMode: data.llmOutputMode || "text",
            prompt: data.llmPrompt || "",
          },
        });
        return "";
      }

      const output = generated.output.trim();
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "LLM",
        nodeType: data.nodeType,
        actionType: data.actionType || "llm",
        status: "completed",
        message: "Generated LLM output for next workflow step",
        metadata: {
          outputMode: data.llmOutputMode || "text",
          instruction: data.llmInstruction || "",
          prompt: truncate(data.llmPrompt || "", 1000),
          outputPreview: truncate(output, 1000),
        },
      });
      return output;
    } catch (error) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "LLM",
        nodeType: data.nodeType,
        actionType: data.actionType || "llm",
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        metadata: {
          outputMode: data.llmOutputMode || "text",
          instruction: data.llmInstruction || "",
          prompt: data.llmPrompt || "",
        },
      });
      await logActivity({
        action: "workflow.action_failed",
        entity: ACTIVITY_ENTITIES.WORKFLOW,
        entityId: flowId,
        description: `${flowName}: LLM workflow node failed.`,
        metadata: {
          flowId,
          flowName,
          runId: runId || null,
          conversationId: input.conversationId,
          stepId: node.id,
          actionType: data.actionType || "llm",
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return "";
    }
  }

  if (data.actionType === "ai_reply") {
    try {
      const generated = await generateWorkflowAiReply(
        input,
        data.actionValue,
        true
      );

      if (!generated.ok || !generated.reply.trim()) {
        await recordWorkflowRunStep(runId, {
          nodeId: node.id,
          nodeLabel: data.label || "Generate AI Reply",
          nodeType: data.nodeType,
          actionType: data.actionType,
          status: "skipped",
          message: generated.reason,
          metadata: {
            knowledgeBaseCount: generated.knowledgeBaseCount,
            knowledgeBaseTitles: generated.knowledgeBaseTitles,
          },
        });
        return "";
      }

      replies.push(generated.reply);
      await saveWorkflowReply(input.conversationId, generated.reply, flowId, flowName, node.id, {
        source: generated.knowledgeBaseCount > 0 ? "workflow_ai_kb" : "workflow_ai",
        agentId: input.agentId || undefined,
        knowledgeBaseCount: generated.knowledgeBaseCount,
        knowledgeBaseTitles: generated.knowledgeBaseTitles,
      });
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Generate AI Reply",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "completed",
        message: "Generated workflow AI reply",
        metadata: {
          replyPreview: truncate(generated.reply, 1000),
          knowledgeBaseCount: generated.knowledgeBaseCount,
          knowledgeBaseTitles: generated.knowledgeBaseTitles,
        },
      });
      await logActivity({
        action: "ai.reply_generated",
        entity: ACTIVITY_ENTITIES.MESSAGE,
        entityId: input.conversationId,
        description: `${flowName}: generated AI reply from workflow.`,
        metadata: {
          flowId,
          flowName,
          runId: runId || null,
          conversationId: input.conversationId,
          stepId: node.id,
          knowledgeBaseCount: generated.knowledgeBaseCount,
          knowledgeBaseTitles: generated.knowledgeBaseTitles,
          usedKnowledgeBase: generated.knowledgeBaseCount > 0,
        },
      });
      return generated.reply;
    } catch (error) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Generate AI Reply",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        metadata: { instruction: data.actionValue || "" },
      });
      await logActivity({
        action: "workflow.action_failed",
        entity: ACTIVITY_ENTITIES.WORKFLOW,
        entityId: flowId,
        description: `${flowName}: AI reply action failed.`,
        metadata: {
          flowId,
          flowName,
          runId: runId || null,
          conversationId: input.conversationId,
          stepId: node.id,
          actionType: data.actionType,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
    return "";
  }

  if (data.actionType === "call_mcp_tool") {
    const gatewayUrl = process.env.MCP_TOOL_GATEWAY_URL;
    if (gatewayUrl) {
      try {
        const response = await fetch(gatewayUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            server: data.mcpServer || "default",
            tool: data.mcpTool || "",
            input: data.mcpInput ? JSON.parse(renderWorkflowTemplate(data.mcpInput, input, flowName, state)) : {},
            context: {
              flowId,
              flowName,
              conversationId: input.conversationId,
              customerId: input.customerId,
              channel: input.channel,
              message: input.message,
            },
          }),
        });
        const responseBody = await response.text();
        await recordWorkflowRunStep(runId, {
          nodeId: node.id,
          nodeLabel: data.label || "Call MCP Tool",
          nodeType: data.nodeType,
          actionType: data.actionType,
          status: response.ok ? "completed" : "failed",
          message: response.ok
            ? `MCP tool ${data.mcpTool || ""} completed`
            : `MCP gateway returned ${response.status}`,
          metadata: {
            gatewayUrl,
            mcpServer: data.mcpServer || "",
            mcpTool: data.mcpTool || "",
            responseBody: truncate(responseBody),
          },
        });
        return responseBody;
      } catch (error) {
        await recordWorkflowRunStep(runId, {
          nodeId: node.id,
          nodeLabel: data.label || "Call MCP Tool",
          nodeType: data.nodeType,
          actionType: data.actionType,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
          metadata: {
            gatewayUrl,
            mcpServer: data.mcpServer || "",
            mcpTool: data.mcpTool || "",
          },
        });
      }
      return "";
    }

    await recordWorkflowRunStep(runId, {
      nodeId: node.id,
      nodeLabel: data.label || "Call MCP Tool",
      nodeType: data.nodeType,
      actionType: data.actionType,
      status: "skipped",
      message: "MCP tool execution is not configured in the app runtime",
      metadata: {
        mcpServer: data.mcpServer || "",
        mcpTool: data.mcpTool || "",
        mcpInput: data.mcpInput || "",
      },
    });
    return "";
  }

  if (data.actionType === "run_skill") {
    try {
      const generated = await generateWorkflowAiReply(
        input,
        renderWorkflowTemplate(
          `${data.skillName || "workflow-skill"}: ${data.skillPrompt || data.actionValue || "Analyze this conversation and recommend the next action."}`,
          input,
          flowName,
          state
        ),
        false
      );

      if (!generated.ok || !generated.reply.trim()) {
        await recordWorkflowRunStep(runId, {
          nodeId: node.id,
          nodeLabel: data.label || "Run Skill",
          nodeType: data.nodeType,
          actionType: data.actionType,
          status: "skipped",
          message: generated.reason,
          metadata: {
            skillName: data.skillName || "",
            skillPrompt: data.skillPrompt || "",
          },
        });
        return "";
      }

      const systemMessage = await prisma.message.create({
        data: {
          conversationId: input.conversationId,
          role: "system",
          content: `Workflow skill result (${data.skillName || "skill"}): ${generated.reply}`,
          toolCalls: {
            source: "workflow_skill",
            flowId,
            flowName,
            stepId: node.id,
            skillName: data.skillName || "",
          },
        },
      });

      emitNewMessage(input.conversationId, {
        id: systemMessage.id,
        role: systemMessage.role,
        content: systemMessage.content,
      });

      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Run Skill",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "completed",
        message: `Skill ${data.skillName || "workflow-skill"} completed`,
        metadata: {
          skillName: data.skillName || "",
          skillPrompt: data.skillPrompt || "",
          resultPreview: truncate(generated.reply, 1000),
        },
      });
      return generated.reply;
    } catch (error) {
      await recordWorkflowRunStep(runId, {
        nodeId: node.id,
        nodeLabel: data.label || "Run Skill",
        nodeType: data.nodeType,
        actionType: data.actionType,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        metadata: {
          skillName: data.skillName || "",
          skillPrompt: data.skillPrompt || "",
        },
      });
    }
    return "";
  }

  await recordWorkflowRunStep(runId, {
    nodeId: node.id,
    nodeLabel: data.label || "Workflow action",
    nodeType: data.nodeType || "action",
    actionType: data.actionType || "",
    status: "skipped",
    message: "Action adapter is not implemented yet",
    metadata: { actionValue: data.actionValue || "" },
  });
}

export async function runChannelWorkflows(
  input: WorkflowRuntimeInput
): Promise<WorkflowRuntimeResult> {
  const assignedFlowIds = input.agentId
    ? (
        await prisma.agentWorkflow.findMany({
          where: {
            agentId: input.agentId,
            isActive: true,
            flow: { isActive: true },
          },
          orderBy: { priority: "asc" },
          select: { flowId: true },
        })
      ).map((item) => item.flowId)
    : [];

  const unsortedFlows = await prisma.flow.findMany({
    where: {
      isActive: true,
      ...(input.agentId ? { id: { in: assignedFlowIds } } : {}),
    },
    // Flow.priority (ascending: lower runs first) is the deterministic tie
    // breaker when several active flows match the same trigger; createdAt
    // is the final tie breaker when priorities are equal.
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  // Prisma's `id: { in: [...] }` does not preserve the input array's order,
  // so for agent-scoped runs, re-sort by the AgentWorkflow-specific priority
  // order already computed above rather than discarding it.
  const flows = input.agentId
    ? [...unsortedFlows].sort(
        (a, b) => assignedFlowIds.indexOf(a.id) - assignedFlowIds.indexOf(b.id)
      )
    : unsortedFlows;

  if (flows.length === 0) {
    return {
      handled: false,
      replies: [],
      reason: input.agentId
        ? "No active workflows assigned to this agent"
        : "No active workflows",
      checkedFlows: 0,
    };
  }

  const skipReasons: string[] = [];

  for (const flow of flows) {
    const nodes = Array.isArray(flow.nodes) ? (flow.nodes as unknown as CanvasFlowNode[]) : [];
    const edges = Array.isArray(flow.edges) ? (flow.edges as unknown as CanvasFlowEdge[]) : [];
    const trigger = nodes.find((node) => node.data?.nodeType === "trigger");
    const run = await startWorkflowRun({
      flowId: flow.id,
      flowName: flow.name,
      conversationId: input.conversationId,
      triggerEvent: input.triggerEvent,
      channel: input.channel,
      message: input.message,
      metadata: {
        checkedFlows: flows.length,
        agentId: input.agentId || null,
      },
    });

    if (!triggerMatches(trigger?.data?.triggerEvent, input.triggerEvent)) {
      const reason = `${flow.name}: trigger ${trigger?.data?.triggerEvent || "not configured"} did not match ${input.triggerEvent}`;
      skipReasons.push(reason);
      await recordWorkflowRunStep(run?.id, {
        nodeId: trigger?.id,
        nodeLabel: trigger?.data?.label || "Workflow Trigger",
        nodeType: "trigger",
        status: "skipped",
        message: reason,
        metadata: {
          expected: trigger?.data?.triggerEvent || null,
          received: input.triggerEvent,
        },
      });
      await finishWorkflowRun(run?.id, "skipped", reason);
      await logActivity({
        action: "workflow.skipped",
        entity: ACTIVITY_ENTITIES.WORKFLOW,
        entityId: flow.id,
        description: reason,
        metadata: {
          flowId: flow.id,
          flowName: flow.name,
          runId: run?.id || null,
          conversationId: input.conversationId,
          channel: input.channel,
          triggerEvent: input.triggerEvent,
          expected: trigger?.data?.triggerEvent || null,
        },
      });
      continue;
    }
    if (trigger?.data?.channel && trigger.data.channel !== "any" && trigger.data.channel !== input.channel) {
      const reason = `${flow.name}: channel ${trigger.data.channel} did not match ${input.channel}`;
      skipReasons.push(reason);
      await recordWorkflowRunStep(run?.id, {
        nodeId: trigger.id,
        nodeLabel: trigger.data.label || "Workflow Trigger",
        nodeType: "trigger",
        status: "skipped",
        message: reason,
        metadata: { expected: trigger.data.channel, received: input.channel },
      });
      await finishWorkflowRun(run?.id, "skipped", reason);
      await logActivity({
        action: "workflow.skipped",
        entity: ACTIVITY_ENTITIES.WORKFLOW,
        entityId: flow.id,
        description: reason,
        metadata: {
          flowId: flow.id,
          flowName: flow.name,
          runId: run?.id || null,
          conversationId: input.conversationId,
          channel: input.channel,
          triggerEvent: input.triggerEvent,
          expectedChannel: trigger.data.channel,
        },
      });
      continue;
    }
    if (
      trigger?.data?.channelAccountId &&
      input.channelAccountId &&
      trigger.data.channelAccountId !== input.channelAccountId
    ) {
      const reason = `${flow.name}: channel account did not match`;
      skipReasons.push(reason);
      await recordWorkflowRunStep(run?.id, {
        nodeId: trigger.id,
        nodeLabel: trigger.data.label || "Workflow Trigger",
        nodeType: "trigger",
        status: "skipped",
        message: reason,
        metadata: {
          expectedChannelAccountId: trigger.data.channelAccountId,
          receivedChannelAccountId: input.channelAccountId,
        },
      });
      await finishWorkflowRun(run?.id, "skipped", reason);
      continue;
    }
    if (trigger?.data) {
      const filterResult = await filtersMatch(trigger.data, input);
      if (!filterResult.matches) {
        const reason = `${flow.name}: ${filterResult.reason || "filters did not match"}`;
        skipReasons.push(reason);
        await recordWorkflowRunStep(run?.id, {
          nodeId: trigger.id,
          nodeLabel: trigger.data.label || "Workflow Trigger",
          nodeType: "trigger",
          status: "skipped",
          message: reason,
          metadata: { filters: trigger.data.filters || {} },
        });
        await finishWorkflowRun(run?.id, "skipped", reason);
        await logActivity({
          action: "workflow.skipped",
          entity: ACTIVITY_ENTITIES.WORKFLOW,
          entityId: flow.id,
          description: reason,
          metadata: {
            flowId: flow.id,
            flowName: flow.name,
            runId: run?.id || null,
            conversationId: input.conversationId,
            channel: input.channel,
            triggerEvent: input.triggerEvent,
            filters: trigger.data.filters || {},
          },
        });
        continue;
      }
    }

    await recordWorkflowRunStep(run?.id, {
      nodeId: trigger?.id,
      nodeLabel: trigger?.data?.label || "Workflow Trigger",
      nodeType: "trigger",
      status: "matched",
      message: "Trigger and filters matched",
      metadata: {
        triggerEvent: trigger?.data?.triggerEvent || "",
        channel: trigger?.data?.channel || "any",
        filters: trigger?.data?.filters || {},
      },
    });

    await logActivity({
      action: "workflow.matched",
      entity: ACTIVITY_ENTITIES.WORKFLOW,
      entityId: flow.id,
      description: `${flow.name} matched ${input.channel} ${input.triggerEvent}.`,
      metadata: {
        flowId: flow.id,
        flowName: flow.name,
        runId: run?.id || null,
        conversationId: input.conversationId,
        channel: input.channel,
        triggerEvent: input.triggerEvent,
      },
    });

    const executionNodes = nodes.filter((node) => node.data?.nodeType !== "trigger");
    const replies: string[] = [];
    const executionState: WorkflowExecutionState = {
      previousOutput: "",
      outputs: {},
    };

    if (input.saveInputMessage !== false) {
      await saveCustomerMessage(input.conversationId, input.message);
      await recordWorkflowRunStep(run?.id, {
        nodeId: "customer-message",
        nodeLabel: "Customer Message",
        nodeType: "input",
        status: "completed",
        message: "Saved incoming customer message",
        metadata: { messagePreview: input.message.slice(0, 240) },
      });
    } else {
      await recordWorkflowRunStep(run?.id, {
        nodeId: "workflow-event",
        nodeLabel: "Workflow Event",
        nodeType: "input",
        status: "completed",
        message: "Processed internal workflow event",
        metadata: { messagePreview: input.message.slice(0, 240) },
      });
    }

    for (let index = 0; index < executionNodes.length; index += 1) {
      const node = executionNodes[index];
      const data = node.data;
      if (!data) continue;

      if (data.nodeType === "condition") {
        const matched = conditionMatches(data, input);
        const targetIndex = findHandledEdgeTargetIndex(
          node.id,
          matched ? "true" : "false",
          edges,
          executionNodes
        );
        await recordWorkflowRunStep(run?.id, {
          nodeId: node.id,
          nodeLabel: data.label || "Condition",
          nodeType: "condition",
          actionType: data.actionType || "",
          status: matched ? "matched" : targetIndex === null ? "skipped" : "matched",
          message: matched
            ? "Condition matched"
            : targetIndex === null
              ? "Condition did not match and no false branch exists"
              : "Condition did not match; following false branch",
          metadata: {
            field: data.conditionField,
            operator: data.conditionOperator,
            value: data.conditionValue,
            branch: matched ? "true" : "false",
            targetNodeId: targetIndex === null ? "" : executionNodes[targetIndex]?.id || "",
          },
        });
        if (targetIndex === null) {
          if (!matched) break;
        } else if (targetIndex !== index + 1) {
          index = targetIndex - 1;
        }
        continue;
      }

      if (data.nodeType === "delay" || data.actionType === "wait") {
        await scheduleWorkflowContinuation(
          input,
          flow.id,
          flow.name,
          node,
          executionNodes[index + 1],
          run?.id
        );

        await prisma.flow.update({
          where: { id: flow.id },
          data: { triggerCount: { increment: 1 } },
        });
        await finishWorkflowRun(run?.id, "waiting_delay", "Workflow is waiting for a scheduled continuation");

        return {
          handled: true,
          replies,
          flowId: flow.id,
          flowName: flow.name,
          pendingDelay: true,
        };
      }

      if (data.nodeType === "approval" || data.actionType === "approval_required") {
        await createPendingApproval(
          input,
          flow.id,
          flow.name,
          node,
          executionNodes[index + 1],
          run?.id
        );

        await prisma.flow.update({
          where: { id: flow.id },
          data: { triggerCount: { increment: 1 } },
        });
        await finishWorkflowRun(run?.id, "waiting_approval", "Workflow is waiting for customer service approval");

        return {
          handled: true,
          replies,
          flowId: flow.id,
          flowName: flow.name,
          pendingApproval: true,
        };
      }

      if (data.nodeType === "action" || data.nodeType === "llm") {
        const output = await executeAction(node, input, flow.id, flow.name, replies, run?.id, executionState);
        if (typeof output === "string" && output.length > 0) {
          executionState.previousOutput = output;
          executionState.outputs[node.id] = output;
        }
      }
    }

    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });

    await prisma.flow.update({
      where: { id: flow.id },
      data: { triggerCount: { increment: 1 } },
    });
    await finishWorkflowRun(run?.id, "completed", `Workflow completed with ${replies.length} reply action(s)`, {
      replies: replies.length,
    });

    await logActivity({
      action: "workflow.completed",
      entity: ACTIVITY_ENTITIES.WORKFLOW,
      entityId: flow.id,
      description: `${flow.name} completed with ${replies.length} reply action(s).`,
      metadata: {
        flowId: flow.id,
        flowName: flow.name,
        runId: run?.id || null,
        conversationId: input.conversationId,
        replies: replies.length,
      },
    });

    logger.debug("[Workflow] Channel workflow handled message", {
      flowId: flow.id,
      flowName: flow.name,
      conversationId: input.conversationId,
      replies: replies.length,
    });

    return {
      handled: true,
      replies,
      flowId: flow.id,
      flowName: flow.name,
    };
  }

  return {
    handled: false,
    replies: [],
    reason:
      skipReasons[0] ||
      "No active workflow matched this channel event and filters",
    checkedFlows: flows.length,
  };
}

export async function processDueWorkflowJobs(limit = 10) {
  const timedOutApprovals = await markTimedOutWorkflowApprovals();
  const jobs = await prisma.workflowJob.findMany({
    where: {
      status: "pending",
      dueAt: { lte: new Date() },
    },
    orderBy: { dueAt: "asc" },
    take: limit,
  });

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const locked = await prisma.workflowJob.updateMany({
      where: { id: job.id, status: "pending" },
      data: { status: "running", lockedAt: new Date(), lastError: "" },
    });
    if (locked.count === 0) continue;

    const run = await startWorkflowRun({
      flowId: job.flowId,
      flowName: job.flowName,
      conversationId: job.conversationId,
      triggerEvent: "workflow_delay_due",
      channel: job.channel,
      message: job.message,
      metadata: {
        source: "workflow_job",
        jobId: job.id,
        originalTriggerEvent: job.triggerEvent,
        nextNodeId: job.nextNodeId,
      },
    });

    try {
      await logActivity({
        action: "workflow.resumed_after_delay",
        entity: ACTIVITY_ENTITIES.WORKFLOW,
        entityId: job.flowId,
        description: `${job.flowName} resumed after a scheduled delay.`,
        metadata: {
          flowId: job.flowId,
          flowName: job.flowName,
          runId: run?.id || null,
          jobId: job.id,
          conversationId: job.conversationId,
          triggerEvent: job.triggerEvent,
          nextNodeId: job.nextNodeId,
        },
      });

      const flow = await prisma.flow.findUnique({ where: { id: job.flowId } });
      if (!flow) throw new Error("Flow was not found");

      const nodes = Array.isArray(flow.nodes) ? (flow.nodes as unknown as CanvasFlowNode[]) : [];
      const edges = Array.isArray(flow.edges) ? (flow.edges as unknown as CanvasFlowEdge[]) : [];
      const executionNodes = nodes.filter((node) => node.data?.nodeType !== "trigger");
      const startIndex = job.nextNodeId
        ? executionNodes.findIndex((node) => node.id === job.nextNodeId)
        : executionNodes.length;

      if (startIndex < 0 || startIndex >= executionNodes.length) {
        await recordWorkflowRunStep(run?.id, {
          nodeId: job.nextNodeId,
          nodeLabel: "Workflow continuation",
          nodeType: "delay",
          status: "skipped",
          message: "No next workflow step was available after the delay",
          metadata: { jobId: job.id },
        });
        await finishWorkflowRun(run?.id, "completed", "Delayed workflow had no remaining steps");
        await prisma.workflowJob.update({
          where: { id: job.id },
          data: { status: "completed", completedAt: new Date() },
        });
        processed += 1;
        continue;
      }

      const input: WorkflowRuntimeInput = {
        channel: job.channel,
        triggerEvent: job.triggerEvent,
        conversationId: job.conversationId,
        customerId: job.customerId,
        message: job.message,
        saveInputMessage: false,
      };
      const replies: string[] = [];
      const executionState: WorkflowExecutionState = {
        previousOutput: "",
        outputs: {},
      };
      let paused = false;

      for (let index = startIndex; index < executionNodes.length; index += 1) {
        const node = executionNodes[index];
        const data = node.data;
        if (!data) continue;

        if (data.nodeType === "condition") {
          const matched = conditionMatches(data, input);
          const targetIndex = findHandledEdgeTargetIndex(
            node.id,
            matched ? "true" : "false",
            edges,
            executionNodes
          );
          await recordWorkflowRunStep(run?.id, {
            nodeId: node.id,
            nodeLabel: data.label || "Condition",
            nodeType: "condition",
            actionType: data.actionType || "",
            status: matched ? "matched" : targetIndex === null ? "skipped" : "matched",
            message: matched
              ? "Condition matched"
              : targetIndex === null
                ? "Condition did not match and no false branch exists"
                : "Condition did not match; following false branch",
            metadata: {
              field: data.conditionField,
              operator: data.conditionOperator,
              value: data.conditionValue,
              branch: matched ? "true" : "false",
              targetNodeId: targetIndex === null ? "" : executionNodes[targetIndex]?.id || "",
              jobId: job.id,
            },
          });
          if (targetIndex === null) {
            if (!matched) break;
          } else if (targetIndex !== index + 1) {
            index = targetIndex - 1;
          }
          continue;
        }

        if (data.nodeType === "delay" || data.actionType === "wait") {
          await scheduleWorkflowContinuation(
            input,
            flow.id,
            flow.name,
            node,
            executionNodes[index + 1],
            run?.id
          );
          await finishWorkflowRun(run?.id, "waiting_delay", "Workflow is waiting for another scheduled continuation");
          await prisma.workflowJob.update({
            where: { id: job.id },
            data: { status: "completed", completedAt: new Date() },
          });
          processed += 1;
          paused = true;
          break;
        }

        if (data.nodeType === "approval" || data.actionType === "approval_required") {
          await createPendingApproval(
            input,
            flow.id,
            flow.name,
            node,
            executionNodes[index + 1],
            run?.id
          );
          await finishWorkflowRun(run?.id, "waiting_approval", "Delayed workflow is waiting for customer service approval");
          await prisma.workflowJob.update({
            where: { id: job.id },
            data: { status: "completed", completedAt: new Date() },
          });
          processed += 1;
          paused = true;
          break;
        }

        if (data.nodeType === "action" || data.nodeType === "llm") {
          const output = await executeAction(node, input, flow.id, flow.name, replies, run?.id, executionState);
          if (typeof output === "string" && output.length > 0) {
            executionState.previousOutput = output;
            executionState.outputs[node.id] = output;
          }
        }
      }

      if (paused) continue;

      await prisma.conversation.update({
        where: { id: job.conversationId },
        data: { updatedAt: new Date() },
      });
      await prisma.workflowJob.update({
        where: { id: job.id },
        data: { status: "completed", completedAt: new Date() },
      });
      await finishWorkflowRun(run?.id, "completed", `Delayed workflow completed with ${replies.length} reply action(s)`, {
        jobId: job.id,
        replies: replies.length,
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[Workflow] Delayed job failed", { jobId: job.id, error });
      await logActivity({
        action: "workflow.action_failed",
        entity: ACTIVITY_ENTITIES.WORKFLOW,
        entityId: job.flowId,
        description: `${job.flowName} delayed job failed: ${message}`,
        metadata: {
          flowId: job.flowId,
          flowName: job.flowName,
          runId: run?.id || null,
          jobId: job.id,
          conversationId: job.conversationId,
          triggerEvent: job.triggerEvent,
        },
      });
      await prisma.workflowJob.update({
        where: { id: job.id },
        data: { status: "failed", lastError: message },
      });
      await finishWorkflowRun(run?.id, "failed", message, { jobId: job.id });
    }
  }

  return { processed, failed, checked: jobs.length, timedOutApprovals };
}
