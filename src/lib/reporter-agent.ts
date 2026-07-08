import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { findMarketplaceModule } from "@/lib/marketplace/catalog";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";
import { createNotification } from "@/lib/notifications";
import { runChannelWorkflows } from "@/lib/workflow-runtime";

type ReporterOutputType = "immediate_alert" | "daily_digest" | "weekly_summary" | "module_report";

interface AttentionItem {
  type: string;
  title: string;
  description: string;
  severity: string;
  moduleSlug?: string;
  moduleName?: string;
  moduleRecordId?: string | null;
  signalId?: string | null;
  conversationId?: string | null;
  sourceId?: string | null;
}

interface ReporterConfig {
  enabledModules: string[];
  severityThreshold: string;
  reportFrequency: "manual" | "hourly" | "daily" | "weekly";
  notificationRecipients: string[];
  notificationChannels: Array<"in_app" | "email" | "whatsapp">;
  requireApprovalBeforeExternalNotifications: boolean;
  staleApprovalMinutes: number;
  unansweredConversationMinutes: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function severityRank(severity: string) {
  return { critical: 5, urgent: 4, high: 3, medium: 2, low: 1 }[severity] || 1;
}

function normalizeConfig(value: unknown): ReporterConfig {
  const config = asRecord(value);
  return {
    enabledModules: Array.isArray(config.enabledModules)
      ? config.enabledModules.map(String).filter(Boolean)
      : [],
    severityThreshold: typeof config.severityThreshold === "string" ? config.severityThreshold : "low",
    reportFrequency:
      config.reportFrequency === "hourly" ||
      config.reportFrequency === "daily" ||
      config.reportFrequency === "weekly"
        ? config.reportFrequency
        : "manual",
    notificationRecipients: Array.isArray(config.notificationRecipients)
      ? config.notificationRecipients.map(String).filter(Boolean)
      : [],
    notificationChannels: Array.isArray(config.notificationChannels)
      ? config.notificationChannels
          .map(String)
          .filter((item): item is "in_app" | "email" | "whatsapp" =>
            ["in_app", "email", "whatsapp"].includes(item)
          )
      : ["in_app"],
    requireApprovalBeforeExternalNotifications:
      config.requireApprovalBeforeExternalNotifications !== false,
    staleApprovalMinutes: Number.isFinite(config.staleApprovalMinutes)
      ? Math.max(5, Number(config.staleApprovalMinutes))
      : 60,
    unansweredConversationMinutes: Number.isFinite(config.unansweredConversationMinutes)
      ? Math.max(5, Number(config.unansweredConversationMinutes))
      : 30,
  };
}

function enabledModuleWhere(config: ReporterConfig): Prisma.BusinessModuleWhereInput {
  return {
    isEnabled: true,
    isInstalled: true,
    slug: {
      not: "reporter-agent",
      ...(config.enabledModules.length > 0 ? { in: config.enabledModules } : {}),
    },
  };
}

function summarizeSignal(signal: {
  id: string;
  title: string;
  severity: string;
  description: string;
  module: { name: string; slug: string };
  moduleRecord: { id: string; title: string; status: string; conversationId: string | null } | null;
}): AttentionItem {
  const recordText = signal.moduleRecord
    ? ` Linked record: ${signal.moduleRecord.title} (${signal.moduleRecord.status}).`
    : "";
  return {
    type: "module_signal",
    title: signal.title,
    description: `${signal.description || ""}${recordText}`.trim(),
    severity: signal.severity,
    moduleSlug: signal.module.slug,
    moduleName: signal.module.name,
    moduleRecordId: signal.moduleRecord?.id || null,
    signalId: signal.id,
    conversationId: signal.moduleRecord?.conversationId || null,
  };
}

function stringifyItem(item: AttentionItem) {
  const modulePrefix = item.moduleName ? `${item.moduleName}: ` : "";
  return `${modulePrefix}${item.title} [${item.severity}]. ${item.description}`.trim();
}

function textList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function numericValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

async function collectInventoryAndOrderRisks(config: ReporterConfig): Promise<AttentionItem[]> {
  const [inventoryRecords, orderRecords] = await Promise.all([
    prisma.moduleRecord.findMany({
      where: {
        module: { ...enabledModuleWhere(config), slug: "inventory-warehouse" },
        status: { notIn: ["closed", "resolved", "cancelled", "completed"] },
      },
      include: { module: { select: { slug: true, name: true } } },
      take: 100,
    }),
    prisma.moduleRecord.findMany({
      where: {
        module: { ...enabledModuleWhere(config), slug: "orders" },
        status: { in: ["open", "pending", "pending_approval", "draft"] },
      },
      include: { module: { select: { slug: true, name: true } } },
      take: 100,
    }),
  ]);

  const lowStock = inventoryRecords.filter((record) => {
    const data = asRecord(record.data);
    const stock = numericValue(data.stockLevel ?? data.stock ?? data.quantity ?? data.available);
    const reorder = numericValue(data.reorderPoint ?? data.minStock ?? data.minimumStock);
    return (
      record.reporterState === "attention" ||
      record.priority === "high" ||
      record.priority === "urgent" ||
      (stock !== null && reorder !== null && stock <= reorder)
    );
  });

  const items: AttentionItem[] = lowStock.map((record) => ({
    type: "inventory_low_stock",
    title: `Low stock: ${record.title}`,
    description: "Inventory record is low or marked for Reporter attention.",
    severity: record.priority === "urgent" ? "urgent" : "high",
    moduleSlug: record.module.slug,
    moduleName: record.module.name,
    moduleRecordId: record.id,
    conversationId: record.conversationId,
  }));

  for (const stockRecord of lowStock) {
    const stockData = asRecord(stockRecord.data);
    const products = new Set([
      stockRecord.title.toLowerCase(),
      ...textList(stockData.product),
      ...textList(stockData.productName),
      ...textList(stockData.sku),
    ]);

    for (const order of orderRecords) {
      const orderData = asRecord(order.data);
      const orderProducts = [
        order.title,
        ...textList(orderData.product),
        ...textList(orderData.productName),
        ...textList(orderData.items),
      ].map((item) => item.toLowerCase());

      if (orderProducts.some((product) => [...products].some((stockProduct) => product.includes(stockProduct) || stockProduct.includes(product)))) {
        items.push({
          type: "low_stock_pending_order_match",
          title: `Low stock may affect order: ${order.title}`,
          description: `${stockRecord.title} is low and appears in an open order.`,
          severity: "critical",
          moduleSlug: "orders",
          moduleName: "Orders",
          moduleRecordId: order.id,
          conversationId: order.conversationId,
          sourceId: stockRecord.id,
        });
      }
    }
  }

  return items;
}

async function collectModuleRisks(config: ReporterConfig): Promise<AttentionItem[]> {
  const [supplierDelays, financeOverdue] = await Promise.all([
    prisma.moduleRecord.findMany({
      where: {
        module: { ...enabledModuleWhere(config), slug: { in: ["supplier-management", "procurement"] } },
        OR: [
          { status: { contains: "delay", mode: Prisma.QueryMode.insensitive } },
          { reporterState: "attention" },
          { priority: { in: ["high", "urgent"] } },
        ],
      },
      include: { module: { select: { slug: true, name: true } } },
      take: 50,
    }),
    prisma.moduleRecord.findMany({
      where: {
        module: { ...enabledModuleWhere(config), slug: "finance-billing" },
        status: { in: ["open", "overdue", "pending"] },
      },
      include: { module: { select: { slug: true, name: true } } },
      take: 50,
    }),
  ]);

  const now = Date.now();
  return [
    ...supplierDelays.map((record) => ({
      type: "supplier_delay",
      title: `Supplier issue: ${record.title}`,
      description: "Supplier/procurement record is delayed or marked high priority.",
      severity: record.priority === "urgent" ? "urgent" : "high",
      moduleSlug: record.module.slug,
      moduleName: record.module.name,
      moduleRecordId: record.id,
      conversationId: record.conversationId,
    })),
    ...financeOverdue
      .filter((record) => {
        const data = asRecord(record.data);
        const dueDate = typeof data.dueDate === "string" ? Date.parse(data.dueDate) : null;
        return record.status === "overdue" || (dueDate !== null && dueDate < now);
      })
      .map((record) => ({
        type: "finance_overdue",
        title: `Finance risk: ${record.title}`,
        description: "Finance record is overdue or past due date.",
        severity: "high",
        moduleSlug: record.module.slug,
        moduleName: record.module.name,
        moduleRecordId: record.id,
        conversationId: record.conversationId,
      })),
  ];
}

async function collectOperationalRisks(config: ReporterConfig): Promise<AttentionItem[]> {
  const staleApprovalBefore = new Date(Date.now() - config.staleApprovalMinutes * 60 * 1000);
  const unansweredBefore = new Date(Date.now() - config.unansweredConversationMinutes * 60 * 1000);

  const [stalledApprovals, failedRuns, unansweredConversations] = await Promise.all([
    prisma.workflowRun.findMany({
      where: {
        status: "waiting_approval",
        updatedAt: { lt: staleApprovalBefore },
      },
      orderBy: { updatedAt: "asc" },
      take: 50,
      select: { id: true, flowName: true, flowId: true, conversationId: true, updatedAt: true, reason: true },
    }),
    prisma.workflowRun.findMany({
      where: {
        status: "failed",
        updatedAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, flowName: true, flowId: true, conversationId: true, updatedAt: true, reason: true },
    }),
    prisma.conversation.findMany({
      where: {
        status: { in: ["active", "escalated"] },
        updatedAt: { lt: unansweredBefore },
      },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      take: 50,
    }),
  ]);

  return [
    ...stalledApprovals.map((run) => ({
      type: "stale_workflow_approval",
      title: `Approval waiting: ${run.flowName || "Workflow"}`,
      description: `Workflow has waited for approval since ${run.updatedAt.toISOString()}.`,
      severity: "high",
      conversationId: run.conversationId,
      sourceId: run.id,
    })),
    ...failedRuns.map((run) => ({
      type: "failed_workflow",
      title: `Failed workflow: ${run.flowName || "Workflow"}`,
      description: run.reason || `Workflow failed at ${run.updatedAt.toISOString()}.`,
      severity: "high",
      conversationId: run.conversationId,
      sourceId: run.id,
    })),
    ...unansweredConversations
      .filter((conversation) => conversation.messages[0]?.role === "customer")
      .map((conversation) => ({
        type: "unanswered_conversation",
        title: `Unanswered conversation: ${conversation.customerName}`,
        description: `${conversation.channel} conversation has a latest customer message and no recent reply.`,
        severity: conversation.status === "escalated" ? "high" : "medium",
        conversationId: conversation.id,
        sourceId: conversation.id,
      })),
  ];
}

function outputTypeFor(config: ReporterConfig, items: AttentionItem[]): ReporterOutputType {
  if (items.some((item) => severityRank(item.severity) >= severityRank("critical"))) {
    return "immediate_alert";
  }
  if (config.reportFrequency === "weekly") return "weekly_summary";
  if (config.reportFrequency === "daily") return "daily_digest";
  return "module_report";
}

async function createReporterRecord(
  reporterModuleId: string,
  recordType: "report" | "alert" | "recommendation" | "resolved_signal",
  title: string,
  status: string,
  priority: string,
  data: Prisma.InputJsonObject,
  actorName: string
) {
  return prisma.moduleRecord.create({
    data: {
      moduleId: reporterModuleId,
      recordType,
      title,
      status,
      priority,
      sourceChannel: "internal",
      sourceMessage: "Scheduled or manual Reporter Agent scan",
      data,
      reporterState: status === "resolved" ? "resolved" : "attention",
      reporterNotes: recordType === "resolved_signal"
        ? "Signal was already resolved before this scan."
        : "Review the recommended actions and resolve linked module signals when addressed.",
      createdBy: actorName,
      updatedBy: actorName,
      events: {
        create: {
          action: `${recordType}_generated`,
          description: `Reporter Agent generated ${recordType}.`,
          createdBy: actorName,
          metadata: data,
        },
      },
    },
  });
}

export async function runReporterAgentScan(actorName = "Reporter Agent") {
  const reporterCatalog = findMarketplaceModule("reporter-agent");
  const reporter = await prisma.businessModule.upsert({
    where: { slug: "reporter-agent" },
    create: {
      slug: "reporter-agent",
      name: reporterCatalog?.name || "Reporter Agent",
      category: reporterCatalog?.category || "Monitoring and reporting",
      description: reporterCatalog?.description || "Cross-module monitoring agent.",
      version: reporterCatalog?.version || "0.1.0",
      isInstalled: true,
      isEnabled: true,
      installedAt: new Date(),
      installedBy: actorName,
      config: {
        severityThreshold: "low",
        reportFrequency: "manual",
        notificationChannels: ["in_app"],
        requireApprovalBeforeExternalNotifications: true,
      },
      metadata: { systemAgent: true },
    },
    update: {
      isInstalled: true,
      isEnabled: true,
      disabledAt: null,
      metadata: {
        systemAgent: true,
      },
    },
  });
  const config = normalizeConfig(reporter.config);
  const minSeverity = severityRank(config.severityThreshold);

  const [signals, agingRecords, inventoryOrderRisks, moduleRisks, operationalRisks, resolvedSignals] =
    await Promise.all([
      prisma.moduleSignal.findMany({
        where: {
          status: { not: "resolved" },
          module: enabledModuleWhere(config),
        },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 50,
        include: {
          module: { select: { id: true, slug: true, name: true } },
          moduleRecord: { select: { id: true, title: true, status: true, conversationId: true } },
        },
      }),
      prisma.moduleRecord.findMany({
        where: {
          status: { in: ["open", "pending", "pending_approval", "draft"] },
          module: enabledModuleWhere(config),
          updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { updatedAt: "asc" },
        take: 50,
        include: { module: { select: { slug: true, name: true } } },
      }),
      collectInventoryAndOrderRisks(config),
      collectModuleRisks(config),
      collectOperationalRisks(config),
      prisma.moduleSignal.findMany({
        where: {
          status: "resolved",
          resolvedAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          module: enabledModuleWhere(config),
        },
        include: { module: { select: { slug: true, name: true } } },
        take: 25,
      }),
    ]);

  const signalItems = signals.map(summarizeSignal);
  const agingItems: AttentionItem[] = agingRecords.map((record) => ({
    type: "aging_module_record",
    title: `Aging record: ${record.title}`,
    description: `${record.module.name} record has been ${record.status} since ${record.updatedAt.toISOString()}.`,
    severity: record.priority === "urgent" ? "urgent" : record.priority === "high" ? "high" : "medium",
    moduleSlug: record.module.slug,
    moduleName: record.module.name,
    moduleRecordId: record.id,
    conversationId: record.conversationId,
  }));

  const items = [
    ...signalItems,
    ...agingItems,
    ...inventoryOrderRisks,
    ...moduleRisks,
    ...operationalRisks,
  ]
    .filter((item) => severityRank(item.severity) >= minSeverity)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  // Persist detected risks as module signals so workspaces, the heartbeat,
  // and the chatbot all see them. Items sourced from existing signals are skipped.
  const detectedItems = items.filter((item) => !item.signalId);
  if (detectedItems.length > 0) {
    const slugs = Array.from(new Set(detectedItems.map((item) => item.moduleSlug).filter(Boolean)));
    const moduleRows = await prisma.businessModule.findMany({
      where: { slug: { in: slugs as string[] } },
      select: { id: true, slug: true },
    });
    const idBySlug = new Map(moduleRows.map((row) => [row.slug, row.id]));

    for (const item of detectedItems) {
      const moduleId = item.moduleSlug ? idBySlug.get(item.moduleSlug) : undefined;
      if (!moduleId) continue;
      const existing = await prisma.moduleSignal.findFirst({
        where: {
          moduleId,
          signalType: item.type,
          status: { not: "resolved" },
          ...(item.moduleRecordId ? { moduleRecordId: item.moduleRecordId } : { title: item.title }),
        },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.moduleSignal.create({
        data: {
          moduleId,
          moduleRecordId: item.moduleRecordId || null,
          signalType: item.type,
          severity: item.severity,
          title: item.title,
          description: item.description || "",
          status: "open",
          metadata: { detectedBy: "reporter_scan" },
        },
      });
    }
  }
  const criticalCount = items.filter((item) => severityRank(item.severity) >= severityRank("high")).length;
  const outputType = outputTypeFor(config, items);
  const itemSummaries = items.map(stringifyItem);
  const recommendedActions = items.slice(0, 10).map((item) => ({
    type: item.type,
    title: item.title,
    recommendation:
      item.type === "low_stock_pending_order_match"
        ? "Review stock availability before confirming the related order."
        : item.type === "stale_workflow_approval"
          ? "Approve, reject, or reassign the pending workflow approval."
          : item.type === "unanswered_conversation"
            ? "Open the conversation and send a manual reply or resume automation."
            : `Review ${item.title}.`,
    sourceId: item.moduleRecordId || item.signalId || item.sourceId || null,
    conversationId: item.conversationId || null,
  }));

  const report = await createReporterRecord(
    reporter.id,
    "report",
    items.length
      ? `Reporter Agent attention report: ${items.length} item${items.length === 1 ? "" : "s"}`
      : "Reporter Agent attention report: no open items",
    items.length ? "open" : "resolved",
    criticalCount > 0 ? "high" : items.length ? "normal" : "low",
    ({
      generatedAt: new Date().toISOString(),
      outputType,
      config,
      openSignalCount: signals.length,
      agingRecordCount: agingRecords.length,
      operationalRiskCount: operationalRisks.length,
      items,
      recommendedActions,
    } as unknown) as Prisma.InputJsonObject,
    actorName
  );

  let alert = null;
  let recommendation = null;
  let resolvedSignalRecord = null;

  if (items.some((item) => severityRank(item.severity) >= severityRank("high"))) {
    alert = await createReporterRecord(
      reporter.id,
      "alert",
      `Reporter Agent alert: ${criticalCount} high-priority item${criticalCount === 1 ? "" : "s"}`,
      "open",
      "high",
      ({
        reportId: report.id,
        outputType,
        items: items.filter((item) => severityRank(item.severity) >= severityRank("high")),
        externalNotificationRequiresApproval:
          config.requireApprovalBeforeExternalNotifications &&
          config.notificationChannels.some((channel) => channel !== "in_app"),
      } as unknown) as Prisma.InputJsonObject,
      actorName
    );
  }

  if (recommendedActions.length > 0) {
    recommendation = await createReporterRecord(
      reporter.id,
      "recommendation",
      `Reporter Agent recommended actions: ${recommendedActions.length}`,
      "open",
      criticalCount > 0 ? "high" : "normal",
      {
        reportId: report.id,
        recommendedActions,
      } as Prisma.InputJsonObject,
      actorName
    );
  }

  if (resolvedSignals.length > 0) {
    resolvedSignalRecord = await createReporterRecord(
      reporter.id,
      "resolved_signal",
      `Reporter Agent resolved signals: ${resolvedSignals.length}`,
      "resolved",
      "low",
      {
        resolvedSignals: resolvedSignals.map((signal) => ({
          id: signal.id,
          title: signal.title,
          moduleSlug: signal.module.slug,
          moduleName: signal.module.name,
          resolvedAt: signal.resolvedAt?.toISOString() || null,
        })),
      } as Prisma.InputJsonObject,
      actorName
    );
  }

  if (items.length > 0 && config.notificationChannels.includes("in_app")) {
    await createNotification({
      type: "reporter_agent_report",
      title: alert?.title || report.title,
      message: itemSummaries.slice(0, 3).join("\n"),
      priority: criticalCount > 0 ? "high" : "normal",
      href: `/modules/reporter-agent/records/${alert?.id || report.id}`,
      metadata: {
        moduleSlug: "reporter-agent",
        reportId: report.id,
        alertId: alert?.id || null,
        openSignalCount: signals.length,
        outputType,
        externalNotificationsHeldForApproval:
          config.requireApprovalBeforeExternalNotifications &&
          config.notificationChannels.some((channel) => channel !== "in_app"),
      },
    });

    await logActivity({
      action: "reporter.alert_sent",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: alert?.id || report.id,
      description: "Reporter Agent created an in-app alert.",
      userName: actorName,
      metadata: {
        reportId: report.id,
        alertId: alert?.id || null,
        outputType,
        notificationChannels: config.notificationChannels,
      } as Prisma.InputJsonObject,
    });
  }

  if (items.length > 0) {
    await logActivity({
      action: "reporter.signal_correlated",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: report.id,
      description: `Reporter Agent correlated ${items.length} attention item(s).`,
      userName: actorName,
      metadata: {
        reportId: report.id,
        itemTypes: Array.from(new Set(items.map((item) => item.type))),
        sourceIds: items.map((item) => item.moduleRecordId || item.signalId || item.sourceId).filter(Boolean),
      } as Prisma.InputJsonObject,
    });
  }

  if (resolvedSignalRecord) {
    await logActivity({
      action: "reporter.signal_resolved",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: resolvedSignalRecord.id,
      description: `Reporter Agent recorded ${resolvedSignals.length} resolved signal(s).`,
      userName: actorName,
      metadata: {
        recordId: resolvedSignalRecord.id,
        signalIds: resolvedSignals.map((signal) => signal.id),
      } as Prisma.InputJsonObject,
    });
  }

  await logActivity({
    action: "reporter.report_generated",
    entity: ACTIVITY_ENTITIES.MODULE_RECORD,
    entityId: report.id,
    description: `Reporter Agent generated report with ${items.length} attention item(s).`,
    userName: actorName,
    metadata: {
      moduleSlug: "reporter-agent",
      reportId: report.id,
      alertId: alert?.id || null,
      recommendationId: recommendation?.id || null,
      resolvedSignalRecordId: resolvedSignalRecord?.id || null,
      outputType,
      openSignalCount: signals.length,
      agingRecordCount: agingRecords.length,
      attentionItems: items.length,
    } as Prisma.InputJsonObject,
  });

  if (!reporter.config || Object.keys(asRecord(reporter.config)).length === 0) {
    await prisma.businessModule.update({
      where: { id: reporter.id },
      data: {
        config: config as unknown as Prisma.InputJsonObject,
      },
    });
  }

  const workflowConversationId = items.find((item) => item.conversationId)?.conversationId;
  if (workflowConversationId) {
    try {
      await runChannelWorkflows({
        channel: "module",
        triggerEvent: "reporter_report_generated",
        conversationId: workflowConversationId,
        message: report.title,
        saveInputMessage: false,
      });
    } catch {
      // Reporter workflow hooks are optional; failed dispatch should not block the report.
    }
  }

  return {
    report,
    alert,
    recommendation,
    resolvedSignalRecord,
    counts: {
      openSignals: signals.length,
      agingRecords: agingRecords.length,
      operationalRisks: operationalRisks.length,
      criticalSignals: criticalCount,
      attentionItems: items.length,
      resolvedSignals: resolvedSignals.length,
    },
    items: itemSummaries,
  };
}
