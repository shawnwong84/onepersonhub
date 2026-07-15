import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { requireModuleAccess } from "@/lib/rbac-scope";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { getInstalledModule } from "@/lib/modules";
import { logger } from "@/lib/logger";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";
import { validateModuleRecordInput } from "@/lib/module-validation";
import { dispatchModuleWorkflowEvent } from "@/lib/module-workflow-events";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuth(request, "module:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { slug } = await params;
    const installed = await getInstalledModule(slug);
    const denied = await requireModuleAccess(auth, slug, "read");
    if (denied) return denied;
    if (!installed) return NextResponse.json({ error: "Module not installed" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const recordType = searchParams.get("recordType");
    const status = searchParams.get("status");
    const reporterState = searchParams.get("reporterState");
    const search = searchParams.get("search");

    const where: Prisma.ModuleRecordWhereInput = {
      moduleId: installed.module.id,
    };
    if (recordType && recordType !== "all") where.recordType = recordType;
    if (status && status !== "all") where.status = status;
    if (reporterState && reporterState !== "all") where.reporterState = reporterState;
    if (search?.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: Prisma.QueryMode.insensitive } },
        { sourceMessage: { contains: search.trim(), mode: Prisma.QueryMode.insensitive } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.moduleRecord.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
        include: {
          events: { orderBy: { createdAt: "desc" }, take: 3 },
          signals: { where: { status: { not: "resolved" } }, orderBy: { createdAt: "desc" } },
        },
      }),
      prisma.moduleRecord.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(records, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch module records:", error);
    return NextResponse.json({ error: "Failed to fetch module records" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAuth(request, "module:write");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { slug } = await params;
    const installed = await getInstalledModule(slug);
    const denied = await requireModuleAccess(auth, slug, "write");
    if (denied) return denied;
    if (!installed) return NextResponse.json({ error: "Module not installed" }, { status: 404 });

    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const recordType = typeof body.recordType === "string" ? body.recordType.trim() : "";

    const data =
      body.data && typeof body.data === "object" && !Array.isArray(body.data)
        ? (body.data as Prisma.InputJsonObject)
        : {};
    const validation = validateModuleRecordInput(installed.catalog, {
      recordType,
      title,
      status: typeof body.status === "string" ? body.status : undefined,
      priority: typeof body.priority === "string" ? body.priority : undefined,
      reporterState: typeof body.reporterState === "string" ? body.reporterState : undefined,
      data,
    });
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join("; ") }, { status: 400 });
    }

    const record = await prisma.moduleRecord.create({
      data: {
        companyId: auth.companyId,
        moduleId: installed.module.id,
        recordType,
        title,
        status: typeof body.status === "string" ? body.status : "open",
        priority: typeof body.priority === "string" ? body.priority : "normal",
        sourceChannel: typeof body.sourceChannel === "string" ? body.sourceChannel : "",
        sourceMessage: typeof body.sourceMessage === "string" ? body.sourceMessage : "",
        sourceMessageId: typeof body.sourceMessageId === "string" ? body.sourceMessageId : null,
        conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
        customerId: typeof body.customerId === "string" ? body.customerId : null,
        data,
        reporterState: typeof body.reporterState === "string" ? body.reporterState : "normal",
        reporterNotes: typeof body.reporterNotes === "string" ? body.reporterNotes : "",
        createdBy: auth.name || auth.username,
        updatedBy: auth.name || auth.username,
        events: {
          create: {
            companyId: auth.companyId,
            action: "created",
            description: `Created ${recordType}: ${title}`,
            createdBy: auth.name || auth.username,
            metadata: { source: "api" },
          },
        },
      },
      include: {
        events: { orderBy: { createdAt: "desc" } },
        signals: true,
      },
    });

    await logActivity({
      action: "module_record.created",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: record.id,
      description: `${installed.catalog.name}: created ${record.recordType} record "${record.title}".`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        moduleSlug: slug,
        moduleId: installed.module.id,
        recordType: record.recordType,
        status: record.status,
        priority: record.priority,
        conversationId: record.conversationId,
      },
      ...getActivityRequestContext(request),
    });

    await dispatchModuleWorkflowEvent({
      event: "module_record_created",
      moduleSlug: slug,
      moduleName: installed.catalog.name,
      conversationId: record.conversationId,
      customerId: record.customerId,
      message: `${installed.catalog.name} ${record.recordType} created: ${record.title}`,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    logger.error("Failed to create module record:", error);
    return NextResponse.json({ error: "Failed to create module record" }, { status: 500 });
  }
}
