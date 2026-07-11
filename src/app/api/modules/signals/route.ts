import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { logger } from "@/lib/logger";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";
import { validateModuleSignalInput } from "@/lib/module-validation";
import { dispatchModuleWorkflowEvent } from "@/lib/module-workflow-events";
import { getAccessibleModuleSlugs, isUnscoped, requireModuleAccess } from "@/lib/rbac-scope";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "module:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const moduleSlug = searchParams.get("module");
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const signalType = searchParams.get("signalType");

    const where: Prisma.ModuleSignalWhereInput = {};
    if (!(await isUnscoped(auth))) {
      const accessible = await getAccessibleModuleSlugs(auth);
      where.module = { slug: { in: accessible } };
    }
    if (moduleSlug && moduleSlug !== "all") {
      const denied = await requireModuleAccess(auth, moduleSlug, "read");
      if (denied) return denied;
      where.module = { slug: moduleSlug };
    }
    if (status && status !== "all") where.status = status;
    if (severity && severity !== "all") where.severity = severity;
    if (signalType && signalType !== "all") where.signalType = signalType;

    const [signals, total] = await Promise.all([
      prisma.moduleSignal.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip,
        take,
        include: {
          module: { select: { id: true, slug: true, name: true, category: true } },
          moduleRecord: { select: { id: true, title: true, recordType: true, status: true } },
        },
      }),
      prisma.moduleSignal.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(signals, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch module signals:", error);
    return NextResponse.json({ error: "Failed to fetch module signals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "module:write");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const moduleSlug = typeof body.moduleSlug === "string" ? body.moduleSlug.trim() : "";
    const signalType = typeof body.signalType === "string" ? body.signalType.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";

    const deniedWrite = await requireModuleAccess(auth, moduleSlug, "write");
    if (deniedWrite) return deniedWrite;

    const moduleState = await prisma.businessModule.findUnique({ where: { slug: moduleSlug } });
    if (!moduleState?.isInstalled) {
      return NextResponse.json({ error: "Module not installed" }, { status: 404 });
    }

    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Prisma.InputJsonObject)
        : {};
    const validation = validateModuleSignalInput({
      moduleSlug,
      signalType,
      title,
      severity: typeof body.severity === "string" ? body.severity : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      metadata,
    });
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join("; ") }, { status: 400 });
    }

    const signal = await prisma.moduleSignal.create({
      data: {
        moduleId: moduleState.id,
        moduleRecordId: typeof body.moduleRecordId === "string" ? body.moduleRecordId : null,
        signalType,
        severity: typeof body.severity === "string" ? body.severity : "medium",
        title,
        description: typeof body.description === "string" ? body.description : "",
        status: typeof body.status === "string" ? body.status : "open",
        metadata,
        createdBy: auth.name || auth.username,
      },
      include: {
        module: { select: { id: true, slug: true, name: true, category: true } },
        moduleRecord: {
          select: {
            id: true,
            title: true,
            recordType: true,
            status: true,
            conversationId: true,
            customerId: true,
          },
        },
      },
    });

    const signalMetadata =
      signal.metadata && typeof signal.metadata === "object" && !Array.isArray(signal.metadata)
        ? (signal.metadata as Record<string, unknown>)
        : {};
    const signalConversationId =
      typeof signalMetadata.conversationId === "string"
        ? signalMetadata.conversationId
        : signal.moduleRecord?.conversationId || null;

    await logActivity({
      action: "module_signal.created",
      entity: ACTIVITY_ENTITIES.MODULE_RECORD,
      entityId: signal.moduleRecordId || signal.id,
      description: `${moduleState.name}: Reporter signal created - ${signal.title}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        signalId: signal.id,
        moduleSlug,
        moduleId: moduleState.id,
        moduleRecordId: signal.moduleRecordId,
        signalType,
        severity: signal.severity,
        status: signal.status,
      },
      ...getActivityRequestContext(request),
    });

    await dispatchModuleWorkflowEvent({
      event: moduleSlug === "reporter-agent" ? "reporter_signal_created" : "module_signal_created",
      moduleSlug,
      moduleName: moduleState.name,
      conversationId: signalConversationId,
      customerId: signal.moduleRecord?.customerId || null,
      message: `${moduleState.name} signal created: ${signal.title} (${signal.severity})`,
    });

    return NextResponse.json(signal, { status: 201 });
  } catch (error) {
    logger.error("Failed to create module signal:", error);
    return NextResponse.json({ error: "Failed to create module signal" }, { status: 500 });
  }
}
