import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "activity:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const entity = searchParams.get("entity");
    const action = searchParams.get("action");
    const source = searchParams.get("source");
    const actor = searchParams.get("actor");
    const search = searchParams.get("search");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const insensitive = Prisma.QueryMode.insensitive;
    const where: Prisma.ActivityLogWhereInput = {};

    if (entity && entity !== "all") {
      where.entity = entity;
    }

    if (action && action !== "all") {
      where.action = { contains: action, mode: insensitive };
    }

    if (source && source !== "all") {
      if (source === "workflow") {
        where.OR = [
          { action: { startsWith: "workflow", mode: insensitive } },
          { entity: "workflow" },
          { entity: "approval" },
        ];
      } else if (source === "ai") {
        where.action = { startsWith: "ai", mode: insensitive };
      } else if (source === "channel") {
        where.entity = "channel";
      } else if (source === "module") {
        where.entity = { in: ["module", "module_record", "marketplace"] };
      } else if (source === "admin") {
        where.userName = { not: "System" };
      } else if (source === "system") {
        where.userName = "System";
      }
    }

    if (actor && actor.trim()) {
      where.userName = { contains: actor.trim(), mode: insensitive };
    }

    if (search && search.trim()) {
      const searchTerm = search.trim();
      const currentOr = Array.isArray(where.OR) ? where.OR : [];
      where.OR = [
        ...currentOr,
        { description: { contains: searchTerm, mode: insensitive } },
        { action: { contains: searchTerm, mode: insensitive } },
        { entity: { contains: searchTerm, mode: insensitive } },
        { userName: { contains: searchTerm, mode: insensitive } },
      ];
    }

    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) createdAt.lte = new Date(to);
      where.createdAt = createdAt;
    }

    const failureWhere = {
      ...where,
      OR: [
        { action: { contains: "failed", mode: insensitive } },
        { action: { contains: "error", mode: insensitive } },
      ],
    };
    const approvalWhere = {
      ...where,
      entity: "approval",
    };
    const channelWhere = {
      ...where,
      entity: "channel",
    };

    const [activities, total, failedEvents, approvalEvents, channelEvents] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.activityLog.count({ where }),
      prisma.activityLog.count({ where: failureWhere }),
      prisma.activityLog.count({ where: approvalWhere }),
      prisma.activityLog.count({ where: channelWhere }),
    ]);

    return NextResponse.json({
      ...paginatedResponse(activities, total, page, limit),
      summary: {
        total,
        failedEvents,
        approvalEvents,
        channelEvents,
      },
    });
  } catch (error) {
    logger.error("Failed to fetch activity logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity logs" },
      { status: 500 }
    );
  }
}
