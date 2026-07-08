import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "module:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const moduleSlug = searchParams.get("module") || "all";
    const type = searchParams.get("type") || "records";

    const moduleWhere = moduleSlug !== "all" ? { slug: moduleSlug } : {};

    if (type === "signals") {
      const rows = await prisma.moduleSignal.findMany({
        where: { module: moduleWhere },
        orderBy: { createdAt: "desc" },
        take: 1000,
        include: { module: { select: { slug: true, name: true } } },
      });
      const headers = ["module", "signalId", "type", "severity", "status", "title", "description", "createdAt", "resolvedAt"];
      const csv = [
        headers.join(","),
        ...rows.map((row) =>
          [
            row.module.slug,
            row.id,
            row.signalType,
            row.severity,
            row.status,
            row.title,
            row.description,
            row.createdAt.toISOString(),
            row.resolvedAt?.toISOString() || "",
          ].map(csvCell).join(",")
        ),
      ].join("\n");

      await logActivity({
        action: "module.exported",
        entity: ACTIVITY_ENTITIES.MODULE,
        description: `${auth.name || auth.username} exported module signals.`,
        userId: auth.userId,
        userName: auth.name || auth.username,
        metadata: { moduleSlug, type, count: rows.length },
        ...getActivityRequestContext(request),
      });

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${moduleSlug}-signals.csv"`,
        },
      });
    }

    const rows = await prisma.moduleRecord.findMany({
      where: { module: moduleWhere },
      orderBy: { updatedAt: "desc" },
      take: 1000,
      include: { module: { select: { slug: true, name: true } } },
    });
    const headers = ["module", "recordId", "recordType", "title", "status", "priority", "sourceChannel", "reporterState", "createdAt", "updatedAt"];
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        [
          row.module.slug,
          row.id,
          row.recordType,
          row.title,
          row.status,
          row.priority,
          row.sourceChannel,
          row.reporterState,
          row.createdAt.toISOString(),
          row.updatedAt.toISOString(),
        ].map(csvCell).join(",")
      ),
    ].join("\n");

    await logActivity({
      action: "module.exported",
      entity: ACTIVITY_ENTITIES.MODULE,
      description: `${auth.name || auth.username} exported module records.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: { moduleSlug, type, count: rows.length },
      ...getActivityRequestContext(request),
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${moduleSlug}-records.csv"`,
      },
    });
  } catch (error) {
    logger.error("Failed to export module audit data:", error);
    return NextResponse.json({ error: "Failed to export module audit data" }, { status: 500 });
  }
}
