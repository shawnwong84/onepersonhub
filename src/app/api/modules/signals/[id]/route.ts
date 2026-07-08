import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "module:write");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const existing = await prisma.moduleSignal.findUnique({
      where: { id },
      include: { module: true },
    });
    if (!existing) return NextResponse.json({ error: "Signal not found" }, { status: 404 });

    const body = await request.json();
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Prisma.InputJsonObject)
        : undefined;
    const nextStatus = typeof body.status === "string" ? body.status : undefined;
    const resolving = nextStatus === "resolved" && existing.status !== "resolved";
    const reopening = nextStatus && nextStatus !== "resolved" && existing.status === "resolved";

    const signal = await prisma.moduleSignal.update({
      where: { id },
      data: {
        ...(typeof body.signalType === "string" && { signalType: body.signalType }),
        ...(typeof body.severity === "string" && { severity: body.severity }),
        ...(typeof body.title === "string" && { title: body.title.trim() }),
        ...(typeof body.description === "string" && { description: body.description }),
        ...(nextStatus && { status: nextStatus }),
        ...(metadata && { metadata }),
        ...(resolving && {
          resolvedAt: new Date(),
          resolvedBy: auth.name || auth.username,
        }),
        ...(reopening && {
          resolvedAt: null,
          resolvedBy: null,
        }),
      },
      include: {
        module: { select: { id: true, slug: true, name: true, category: true } },
        moduleRecord: { select: { id: true, title: true, recordType: true, status: true } },
      },
    });

    await logActivity({
      action: resolving ? "module_signal.resolved" : "module_signal.updated",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: signal.moduleRecordId || signal.id,
      description: `${signal.module.name}: Reporter signal ${resolving ? "resolved" : "updated"} - ${signal.title}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        signalId: signal.id,
        moduleSlug: signal.module.slug,
        moduleId: signal.module.id,
        moduleRecordId: signal.moduleRecordId,
        status: signal.status,
        severity: signal.severity,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(signal);
  } catch (error) {
    logger.error("Failed to update module signal:", error);
    return NextResponse.json({ error: "Failed to update module signal" }, { status: 500 });
  }
}
