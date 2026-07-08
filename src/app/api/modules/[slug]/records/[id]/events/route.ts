import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { requireModuleAccess } from "@/lib/rbac-scope";
import { getInstalledModule } from "@/lib/modules";
import { logger } from "@/lib/logger";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const auth = await requireAuth(request, "module:write");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { slug, id } = await params;
    const installed = await getInstalledModule(slug);
    const denied = await requireModuleAccess(auth, slug, "write");
    if (denied) return denied;
    if (!installed) return NextResponse.json({ error: "Module not installed" }, { status: 404 });

    const record = await prisma.moduleRecord.findFirst({
      where: { id, moduleId: installed.module.id },
    });
    if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    const body = await request.json();
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!action || !description) {
      return NextResponse.json({ error: "action and description are required" }, { status: 400 });
    }

    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Prisma.InputJsonObject)
        : {};

    const event = await prisma.moduleRecordEvent.create({
      data: {
        moduleRecordId: record.id,
        action,
        description,
        metadata,
        createdBy: auth.name || auth.username,
      },
    });

    await logActivity({
      action: "module_record.event_created",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: record.id,
      description: `${installed.catalog.name}: ${description}`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        moduleSlug: slug,
        moduleId: installed.module.id,
        eventId: event.id,
        eventAction: action,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    logger.error("Failed to create module record event:", error);
    return NextResponse.json({ error: "Failed to create module record event" }, { status: 500 });
  }
}
