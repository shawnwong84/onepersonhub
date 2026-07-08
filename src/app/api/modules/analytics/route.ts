import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "module:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const moduleSlug = searchParams.get("module");
    const sinceDays = Number(searchParams.get("days") || "30");
    const since = new Date(Date.now() - Math.max(1, Math.min(sinceDays, 365)) * 24 * 60 * 60 * 1000);

    const moduleWhere: Prisma.BusinessModuleWhereInput = {
      isInstalled: true,
      ...(moduleSlug && moduleSlug !== "all" ? { slug: moduleSlug } : {}),
    };

    const modules = await prisma.businessModule.findMany({
      where: moduleWhere,
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            records: true,
            signals: true,
          },
        },
      },
    });

    const moduleIds = modules.map((module) => module.id);
    const [recentRecords, openSignals, resolvedSignals, workflowRuns, approvalRuns] = await Promise.all([
      prisma.moduleRecord.groupBy({
        by: ["moduleId"],
        where: { moduleId: { in: moduleIds }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.moduleSignal.groupBy({
        by: ["moduleId"],
        where: { moduleId: { in: moduleIds }, status: { not: "resolved" } },
        _count: { _all: true },
      }),
      prisma.moduleSignal.groupBy({
        by: ["moduleId"],
        where: { moduleId: { in: moduleIds }, status: "resolved", resolvedAt: { not: null } },
        _count: { _all: true },
      }),
      prisma.workflowRun.groupBy({
        by: ["flowId", "status"],
        where: { createdAt: { gte: since }, flowId: { not: null } },
        _count: { _all: true },
      }),
      prisma.workflowRun.count({
        where: { createdAt: { gte: since }, status: { contains: "approval", mode: Prisma.QueryMode.insensitive } },
      }),
    ]);

    const recentByModule = new Map(recentRecords.map((row) => [row.moduleId, row._count._all]));
    const openSignalsByModule = new Map(openSignals.map((row) => [row.moduleId, row._count._all]));
    const resolvedSignalsByModule = new Map(resolvedSignals.map((row) => [row.moduleId, row._count._all]));
    const totalRuns = workflowRuns.reduce((sum, row) => sum + row._count._all, 0);
    const successfulRuns = workflowRuns
      .filter((row) => ["completed", "waiting_approval", "waiting_delay"].includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);

    const moduleStats = modules.map((module) => ({
      id: module.id,
      slug: module.slug,
      name: module.name,
      category: module.category,
      isEnabled: module.isEnabled,
      totalRecords: module._count.records,
      recordsCreated: recentByModule.get(module.id) || 0,
      openSignals: openSignalsByModule.get(module.id) || 0,
      resolvedSignals: resolvedSignalsByModule.get(module.id) || 0,
    }));

    return NextResponse.json({
      since: since.toISOString(),
      days: Math.max(1, Math.min(sinceDays, 365)),
      summary: {
        installedModules: modules.length,
        enabledModules: modules.filter((module) => module.isEnabled).length,
        recordsCreated: moduleStats.reduce((sum, module) => sum + module.recordsCreated, 0),
        openSignals: moduleStats.reduce((sum, module) => sum + module.openSignals, 0),
        resolvedSignals: moduleStats.reduce((sum, module) => sum + module.resolvedSignals, 0),
        approvalVolume: approvalRuns,
        automationSuccessRate: totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0,
      },
      modules: moduleStats,
    });
  } catch (error) {
    logger.error("Failed to fetch module analytics:", error);
    return NextResponse.json({ error: "Failed to fetch module analytics" }, { status: 500 });
  }
}
