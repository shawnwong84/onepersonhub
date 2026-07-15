import type { Prisma, BusinessModule } from "@/generated/prisma/client";
import type { CanvasFlowNode } from "@/lib/flow-builder";
import type { MarketplaceModule } from "@/lib/marketplace/catalog";
import { prisma } from "@/lib/prisma";
import { currentCompanyId } from "@/lib/tenant-context";

function moduleRecordType(module: MarketplaceModule) {
  return (module.records[0] || "Record").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "record";
}

function triggerNode(channel: "email" | "whatsapp"): CanvasFlowNode {
  const isEmail = channel === "email";
  return {
    id: "trigger",
    type: "workflow",
    position: { x: 0, y: 0 },
    data: {
      label: isEmail ? "New Email Received" : "WhatsApp Message Received",
      nodeType: "trigger",
      triggerEvent: isEmail ? "email_received" : "whatsapp_message",
      channel,
      filters: {},
    },
  };
}

function moduleExtractionTemplate(module: MarketplaceModule) {
  if (module.slug === "orders") {
    return {
      instruction: "Extract order intent from the inbound customer message. Return JSON only.",
      prompt: [
        "Message: {{message}}",
        "Return JSON with: intent, customerName, requestedDeliveryDate, items, quantities, notes, confidence.",
      ].join("\n"),
      outputMode: "json",
    };
  }

  return {
    instruction: `Extract the structured ${module.records[0] || "record"} fields for the ${module.name} module. Return JSON only.`,
    prompt: [
      "Channel: {{channel}}",
      "Message: {{message}}",
      "Return JSON with: summary, intent, entities, priority, confidence, needsReview.",
    ].join("\n"),
    outputMode: "json",
  };
}

function llmExtractionNode(module: MarketplaceModule, y: number): CanvasFlowNode {
  const template = moduleExtractionTemplate(module);
  return {
    id: "extract",
    type: "workflow",
    position: { x: 0, y },
    data: {
      label: `Extract ${module.records[0] || "Record"}`,
      nodeType: "llm",
      actionType: "llm",
      llmInstruction: template.instruction,
      llmPrompt: template.prompt,
      llmOutputMode: template.outputMode,
    },
  };
}

function moduleRecordNode(module: MarketplaceModule, y: number): CanvasFlowNode {
  const recordType = moduleRecordType(module);
  return {
    id: "create-record",
    type: "workflow",
    position: { x: 0, y },
    data: {
      label: `Create ${module.records[0] || "Module Record"}`,
      nodeType: "action",
      actionType: "create_module_record",
      moduleSlug: module.slug,
      moduleRecordType: recordType,
      moduleRecordStatus: module.slug === "orders" ? "draft" : "open",
      moduleRecordPriority: "normal",
      moduleRecordTitle: `${module.name}: {{message}}`,
      moduleRecordData: JSON.stringify(
        {
          extractedFrom: "{{channel}}",
          message: "{{message}}",
          llmExtraction: "{{previous.output}}",
          conversationId: "{{conversationId}}",
          confidence: 0.5,
          needsReview: true,
        },
        null,
        2
      ),
    },
  };
}

function approvalNode(y: number): CanvasFlowNode {
  return {
    id: "approval",
    type: "workflow",
    position: { x: 0, y },
    data: {
      label: "Approval Required",
      nodeType: "approval",
      actionType: "approval_required",
      approvalTitle: "Approve module workflow action",
      approvalInstructions: "Review the created record and proposed customer-facing action before continuing.",
      approvalTarget: "next_step",
    },
  };
}

function reporterSignalNode(module: MarketplaceModule, y: number): CanvasFlowNode {
  return {
    id: "signal",
    type: "workflow",
    position: { x: 0, y },
    data: {
      label: "Create Reporter Signal",
      nodeType: "action",
      actionType: "create_module_signal",
      moduleSlug: module.slug,
      moduleSignalType: "review_required",
      moduleSignalSeverity: "medium",
      moduleSignalTitle: `${module.name} record needs review`,
      moduleSignalDescription: "A module record was created from inbound message automation and should be reviewed.",
      moduleSignalData: JSON.stringify({ source: "module_install_template" }, null, 2),
    },
  };
}

function replyNode(module: MarketplaceModule, y: number): CanvasFlowNode {
  return {
    id: "reply",
    type: "workflow",
    position: { x: 0, y },
    data: {
      label: "Reply Customer",
      nodeType: "action",
      actionType: "reply_customer",
      replyText: `Thanks for your message. We created a ${module.records[0] || "record"} and will review it before confirming next steps.`,
    },
  };
}

function connect(nodes: CanvasFlowNode[]) {
  return nodes.slice(0, -1).map((node, index) => ({
    id: `${node.id}-${nodes[index + 1].id}`,
    source: node.id,
    target: nodes[index + 1].id,
    type: "execution",
  }));
}

function buildWorkflow(module: MarketplaceModule, channel: "email" | "whatsapp") {
  const nodes = [
    triggerNode(channel),
    llmExtractionNode(module, 180),
    moduleRecordNode(module, 360),
    ...(module.approvals.length ? [approvalNode(540), replyNode(module, 720)] : [reporterSignalNode(module, 540)]),
  ];
  return {
    name: `${module.name} ${channel === "email" ? "Email" : "WhatsApp"} intake`,
    description: `Starter ${module.name} workflow created by the module installer.`,
    startNodeId: "trigger",
    nodes,
    edges: connect(nodes),
    isActive: true,
  };
}

export async function ensureModuleScaffold(module: MarketplaceModule, moduleState: BusinessModule) {
  const created: {
    flows: string[];
    agentId?: string;
    categoryId?: string;
    cannedResponseId?: string;
    tagIds?: string[];
  } = {
    flows: [],
  };

  const companyId = currentCompanyId();
  const category = await prisma.category.findFirst({
    where: { name: `${module.name} KB` },
  }) || await prisma.category.create({
    data: {
      companyId,
      name: `${module.name} KB`,
      description: `Knowledge scope installed by the ${module.name} module.`,
      icon: "module",
      color: "#F97316",
    },
  });
  created.categoryId = category.id;

  const canned = await prisma.cannedResponse.findFirst({
    where: { title: `${module.name} acknowledgement` },
  }) || await prisma.cannedResponse.create({
    data: {
      companyId,
      title: `${module.name} acknowledgement`,
      category: module.name,
      shortcut: `/${module.slug.replace(/[^a-z0-9]+/g, "-")}`,
      content: `Thanks for contacting us. We created a ${module.records[0] || "record"} and will review the next step.`,
    },
  });
  created.cannedResponseId = canned.id;

  const tagIds: string[] = [];
  for (const tagName of [`module:${module.slug}`, ...module.records.map((record) => `${module.slug}:${record.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)]) {
    const tag = await prisma.tag.upsert({
      where: { companyId_name: { companyId, name: tagName } },
      create: { companyId, name: tagName, color: "#F97316" },
      update: {},
    });
    tagIds.push(tag.id);
  }
  created.tagIds = tagIds;

  const agent = await prisma.agent.findFirst({
    where: {
      metadata: {
        path: ["moduleSlug"],
        equals: module.slug,
      },
    },
  }) || await prisma.agent.create({
    data: {
      companyId,
      name: `${module.name} Agent`,
      description: `Handles ${module.name} automation for ${module.channels.join(", ")}.`,
      status: "active",
      automationMode: "workflow_first",
      fallbackMode: "ai_reply",
      requireApproval: module.approvals.length > 0,
      systemPrompt: [
        `You are the ${module.name} Agent for Paperhuman.`,
        "Use module-scoped knowledge and workflows first.",
        "Never perform risky customer-facing action without configured approval.",
      ].join("\n"),
      metadata: {
        moduleSlug: module.slug,
        moduleId: moduleState.id,
        installedByModule: true,
      } as Prisma.InputJsonObject,
      knowledgeScopes: {
        create: [{ companyId, categoryId: category.id, scopeType: "include" }],
      },
    },
  });
  created.agentId = agent.id;

  const channels = module.channels
    .map((channel) => channel.toLowerCase())
    .filter((channel): channel is "email" | "whatsapp" => channel === "email" || channel === "whatsapp");

  for (const channel of channels) {
    const template = buildWorkflow(module, channel);
    const existing = await prisma.flow.findFirst({
      where: {
        name: template.name,
      },
    });
    const flow = existing || await prisma.flow.create({
      data: {
        companyId,
        ...template,
        nodes: template.nodes as unknown as Prisma.InputJsonValue,
        edges: template.edges as unknown as Prisma.InputJsonValue,
      },
    });
    created.flows.push(flow.id);

    await prisma.agentWorkflow.upsert({
      where: { agentId_flowId: { agentId: agent.id, flowId: flow.id } },
      create: { companyId, agentId: agent.id, flowId: flow.id, priority: channel === "email" ? 10 : 20 },
      update: { isActive: true },
    });
  }

  await prisma.businessModule.update({
    where: { id: moduleState.id },
    data: {
      config: {
        ...(moduleState.config && typeof moduleState.config === "object" && !Array.isArray(moduleState.config)
          ? moduleState.config
          : {}),
        approvalRules: module.approvals.map((approval) => ({
          name: approval,
          required: true,
          appliesTo: module.records,
        })),
        dashboardWidgets: [
          { key: "records_created", label: "Records created", type: "stat" },
          { key: "open_records", label: "Open records", type: "stat" },
          { key: "reporter_signals", label: "Reporter signals", type: "stat" },
        ],
        extractionTemplate: moduleExtractionTemplate(module),
      } as Prisma.InputJsonObject,
      metadata: {
        channels: module.channels,
        workflows: module.workflows,
        records: module.records,
        approvals: module.approvals,
        reporterSignals: module.reporterSignals,
        tags: tagIds,
        approvalRules: module.approvals.map((approval) => ({
          name: approval,
          required: true,
          appliesTo: module.records,
        })),
        dashboardWidgets: [
          { key: "records_created", label: "Records created", type: "stat" },
          { key: "open_records", label: "Open records", type: "stat" },
          { key: "reporter_signals", label: "Reporter signals", type: "stat" },
        ],
        extractionTemplate: moduleExtractionTemplate(module),
        scaffold: created,
      } as Prisma.InputJsonObject,
    },
  });

  return created;
}
