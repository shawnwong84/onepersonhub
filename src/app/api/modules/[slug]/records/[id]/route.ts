import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { getInstalledModule } from "@/lib/modules";
import { logger } from "@/lib/logger";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";
import { validateModuleRecordInput } from "@/lib/module-validation";
import { dispatchModuleWorkflowEvent } from "@/lib/module-workflow-events";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const auth = await requireAuth(request, "module:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { slug, id } = await params;
    const installed = await getInstalledModule(slug);
    if (!installed) return NextResponse.json({ error: "Module not installed" }, { status: 404 });

    const record = await prisma.moduleRecord.findFirst({
      where: { id, moduleId: installed.module.id },
      include: {
        events: { orderBy: { createdAt: "desc" } },
        signals: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    return NextResponse.json(record);
  } catch (error) {
    logger.error("Failed to fetch module record:", error);
    return NextResponse.json({ error: "Failed to fetch module record" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const auth = await requireAuth(request, "module:write");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { slug, id } = await params;
    const installed = await getInstalledModule(slug);
    if (!installed) return NextResponse.json({ error: "Module not installed" }, { status: 404 });

    const existing = await prisma.moduleRecord.findFirst({
      where: { id, moduleId: installed.module.id },
    });
    if (!existing) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    const body = await request.json();
    const data =
      body.data && typeof body.data === "object" && !Array.isArray(body.data)
        ? (body.data as Prisma.InputJsonObject)
        : undefined;

    const changes: Record<string, { from: string | null; to: string | null }> = {};
    const nextStatus = typeof body.status === "string" ? body.status : undefined;
    const nextPriority = typeof body.priority === "string" ? body.priority : undefined;
    const nextReporterState =
      typeof body.reporterState === "string" ? body.reporterState : undefined;
    const validation = validateModuleRecordInput(installed.catalog, {
      recordType: typeof body.recordType === "string" ? body.recordType : existing.recordType,
      title: typeof body.title === "string" ? body.title : existing.title,
      status: nextStatus,
      priority: nextPriority,
      reporterState: nextReporterState,
      data: data || existing.data,
    });
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join("; ") }, { status: 400 });
    }

    if (nextStatus && nextStatus !== existing.status) {
      changes.status = { from: existing.status, to: nextStatus };
    }
    if (nextPriority && nextPriority !== existing.priority) {
      changes.priority = { from: existing.priority, to: nextPriority };
    }
    if (nextReporterState && nextReporterState !== existing.reporterState) {
      changes.reporterState = { from: existing.reporterState, to: nextReporterState };
    }

    const record = await prisma.moduleRecord.update({
      where: { id },
      data: {
        ...(typeof body.title === "string" && { title: body.title.trim() }),
        ...(typeof body.recordType === "string" && { recordType: body.recordType.trim() }),
        ...(nextStatus && { status: nextStatus }),
        ...(nextPriority && { priority: nextPriority }),
        ...(typeof body.sourceChannel === "string" && { sourceChannel: body.sourceChannel }),
        ...(typeof body.sourceMessage === "string" && { sourceMessage: body.sourceMessage }),
        ...(body.sourceMessageId !== undefined && {
          sourceMessageId: typeof body.sourceMessageId === "string" ? body.sourceMessageId : null,
        }),
        ...(body.conversationId !== undefined && {
          conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
        }),
        ...(body.customerId !== undefined && {
          customerId: typeof body.customerId === "string" ? body.customerId : null,
        }),
        ...(data && { data }),
        ...(nextReporterState && { reporterState: nextReporterState }),
        ...(typeof body.reporterNotes === "string" && { reporterNotes: body.reporterNotes }),
        updatedBy: auth.name || auth.username,
        events: {
          create: {
            action: "updated",
            description: `Updated ${existing.recordType}: ${existing.title}`,
            createdBy: auth.name || auth.username,
            metadata: { changes },
          },
        },
      },
      include: {
        events: { orderBy: { createdAt: "desc" } },
        signals: { orderBy: { createdAt: "desc" } },
      },
    });

    await logActivity({
      action: "module_record.updated",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: record.id,
      description: `${installed.catalog.name}: updated ${record.recordType} record "${record.title}".`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        moduleSlug: slug,
        moduleId: installed.module.id,
        changes,
        status: record.status,
        priority: record.priority,
        reporterState: record.reporterState,
      },
      ...getActivityRequestContext(request),
    });

    if (
      slug === "reporter-agent" &&
      record.recordType === "recommendation" &&
      nextReporterState === "dismissed" &&
      nextReporterState !== existing.reporterState
    ) {
      await logActivity({
        action: "reporter.recommendation_dismissed",
        entity: ACTIVITY_ENTITIES.MODULE_RECORD,
        entityId: record.id,
        description: `Reporter Agent recommendation dismissed: ${record.title}.`,
        userId: auth.userId,
        userName: auth.name || auth.username,
        metadata: {
          moduleSlug: slug,
          moduleId: installed.module.id,
          recommendationId: record.id,
          previousReporterState: existing.reporterState,
          reporterState: record.reporterState,
        },
        ...getActivityRequestContext(request),
      });
    }

    await dispatchModuleWorkflowEvent({
      event: "module_record_updated",
      moduleSlug: slug,
      moduleName: installed.catalog.name,
      conversationId: record.conversationId,
      customerId: record.customerId,
      message: `${installed.catalog.name} ${record.recordType} updated: ${record.title}`,
    });

    return NextResponse.json(record);
  } catch (error) {
    logger.error("Failed to update module record:", error);
    return NextResponse.json({ error: "Failed to update module record" }, { status: 500 });
  }
}
