import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

const MAX_EXPORT_LIMIT = 50000;
const DEFAULT_EXPORT_LIMIT = 10000;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "export:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const format = request.nextUrl.searchParams.get("format") || "json";
    const type = request.nextUrl.searchParams.get("type") || "conversations";
    const limit = Math.min(
      MAX_EXPORT_LIMIT,
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || String(DEFAULT_EXPORT_LIMIT), 10) || DEFAULT_EXPORT_LIMIT)
    );
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const dateWhere = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    if (type === "conversations") {
      const conversations = await prisma.conversation.findMany({
        where: dateWhere,
        include: {
          messages: true,
          tickets: true,
          tags: { include: { tag: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      if (format === "csv") {
        return csvResponse(conversationsToCSV(conversations), "conversations");
      }
      return NextResponse.json({ data: conversations, total: conversations.length });
    }

    if (type === "tickets") {
      const tickets = await prisma.ticket.findMany({
        where: dateWhere,
        include: {
          department: true,
          assignedTo: true,
          conversation: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      if (format === "csv") {
        return csvResponse(ticketsToCSV(tickets), "tickets");
      }
      return NextResponse.json({ data: tickets, total: tickets.length });
    }

    if (type === "customers") {
      const customers = await prisma.customer.findMany({
        where: dateWhere,
        orderBy: { lastContact: "desc" },
        take: limit,
      });

      if (format === "csv") {
        return csvResponse(customersToCSV(customers), "customers");
      }
      return NextResponse.json({ data: customers, total: customers.length });
    }

    if (type === "knowledge") {
      const entries = await prisma.knowledgeEntry.findMany({
        include: { category: { select: { name: true } } },
        orderBy: { priority: "desc" },
        take: limit,
      });

      if (format === "csv") {
        return csvResponse(knowledgeToCSV(entries), "knowledge");
      }
      return NextResponse.json({ data: entries, total: entries.length });
    }

    if (type === "workflow_runs") {
      const runs = await prisma.workflowRun.findMany({
        where: dateWhere,
        include: { steps: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      if (format === "csv") {
        return csvResponse(workflowRunsToCSV(runs), "workflow-runs");
      }
      return NextResponse.json({ data: runs, total: runs.length });
    }

    if (type === "approval_audit") {
      const decisions = await prisma.message.findMany({
        where: {
          ...dateWhere,
          role: "system",
          toolCalls: {
            path: ["source"],
            equals: "workflow_approval_decision",
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      if (format === "csv") {
        return csvResponse(approvalAuditToCSV(decisions), "approval-audit");
      }
      return NextResponse.json({ data: decisions, total: decisions.length });
    }

    return NextResponse.json({ error: "Invalid type. Supported: conversations, tickets, customers, knowledge, workflow_runs, approval_audit" }, { status: 400 });
  } catch (error) {
    logger.error("Failed to export data:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}

function csvResponse(csv: string, name: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function conversationsToCSV(conversations: Array<{
  id: string; channel: string; customerName: string; customerContact: string;
  status: string; messages: unknown[]; createdAt: Date; updatedAt: Date;
}>): string {
  const headers = ["ID", "Channel", "Customer Name", "Customer Contact", "Status", "Messages", "Created At", "Updated At"];
  const rows = conversations.map((c) => [
    c.id, c.channel, c.customerName, c.customerContact, c.status,
    c.messages.length.toString(), c.createdAt.toISOString(), c.updatedAt.toISOString(),
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCSV).join(",")).join("\n");
}

function ticketsToCSV(tickets: Array<{
  id: string; title: string; status: string; priority: string;
  department: { name: string } | null; assignedTo: { name: string } | null; createdAt: Date;
}>): string {
  const headers = ["ID", "Title", "Status", "Priority", "Department", "Assigned To", "Created At"];
  const rows = tickets.map((t) => [
    t.id, t.title, t.status, t.priority, t.department?.name || "", t.assignedTo?.name || "", t.createdAt.toISOString(),
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCSV).join(",")).join("\n");
}

function customersToCSV(customers: Array<{
  id: string; name: string; email: string; phone: string; whatsapp: string;
  tags: string; isBlocked: boolean; firstContact: Date; lastContact: Date;
}>): string {
  const headers = ["ID", "Name", "Email", "Phone", "WhatsApp", "Tags", "Blocked", "First Contact", "Last Contact"];
  const rows = customers.map((c) => [
    c.id, c.name, c.email, c.phone, c.whatsapp, c.tags, c.isBlocked ? "Yes" : "No",
    c.firstContact.toISOString(), c.lastContact.toISOString(),
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCSV).join(",")).join("\n");
}

function knowledgeToCSV(entries: Array<{
  id: string; title: string; content: string; priority: number;
  isActive: boolean; category: { name: string };
}>): string {
  const headers = ["ID", "Category", "Title", "Content", "Priority", "Active"];
  const rows = entries.map((e) => [
    e.id, e.category.name, e.title, e.content.substring(0, 500), e.priority.toString(), e.isActive ? "Yes" : "No",
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCSV).join(",")).join("\n");
}

function workflowRunsToCSV(runs: Array<{
  id: string; flowId: string | null; flowName: string; conversationId: string | null;
  triggerEvent: string; channel: string; status: string; reason: string;
  messagePreview: string; createdAt: Date; completedAt: Date | null;
  steps: Array<{ nodeLabel: string; actionType: string; status: string; message: string }>;
}>): string {
  const headers = [
    "ID",
    "Flow ID",
    "Flow Name",
    "Conversation ID",
    "Trigger",
    "Channel",
    "Status",
    "Reason",
    "Message Preview",
    "Step Count",
    "Failed Steps",
    "Created At",
    "Completed At",
  ];
  const rows = runs.map((run) => [
    run.id,
    run.flowId || "",
    run.flowName,
    run.conversationId || "",
    run.triggerEvent,
    run.channel,
    run.status,
    run.reason,
    run.messagePreview,
    String(run.steps.length),
    String(run.steps.filter((step) => step.status === "failed").length),
    run.createdAt.toISOString(),
    run.completedAt?.toISOString() || "",
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCSV).join(",")).join("\n");
}

function approvalAuditToCSV(messages: Array<{
  id: string; conversationId: string; content: string; toolCalls: unknown; createdAt: Date;
}>): string {
  const headers = ["ID", "Conversation ID", "Decision", "Approval ID", "Approver", "Comment", "Created At"];
  const rows = messages.map((message) => {
    const metadata =
      message.toolCalls && typeof message.toolCalls === "object" && !Array.isArray(message.toolCalls)
        ? (message.toolCalls as Record<string, unknown>)
        : {};
    return [
      message.id,
      message.conversationId,
      String(metadata.decision || ""),
      String(metadata.approvalId || ""),
      String(metadata.approvedByName || metadata.actorName || ""),
      String(metadata.comment || message.content || ""),
      message.createdAt.toISOString(),
    ];
  });
  return [headers, ...rows].map((row) => row.map(escapeCSV).join(",")).join("\n");
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
