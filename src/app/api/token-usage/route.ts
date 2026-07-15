import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "analytics:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType") || "";
    const entityId = searchParams.get("entityId") || "";
    const feature = searchParams.get("feature") || "";
    const operation = searchParams.get("operation") || "";
    const start = searchParams.get("start") || "";
    const end = searchParams.get("end") || "";
    const limit = Math.min(Number(searchParams.get("limit") || 100) || 100, 500);

    const createdAt: Prisma.DateTimeFilter = {};
    if (start) {
      const startDate = new Date(start);
      if (!Number.isNaN(startDate.getTime())) createdAt.gte = startDate;
    }
    if (end) {
      const endDate = new Date(end);
      if (!Number.isNaN(endDate.getTime())) {
        endDate.setHours(23, 59, 59, 999);
        createdAt.lte = endDate;
      }
    }

    const where: Prisma.TokenUsageWhereInput = {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(feature ? { feature } : {}),
      ...(operation ? { operation } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [rows, aggregate, settings, monthlyAggregate] = await Promise.all([
      prisma.tokenUsage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.tokenUsage.aggregate({
        where,
        _sum: {
          promptTokens: true,
          completionTokens: true,
          embeddingTokens: true,
          totalTokens: true,
          estimatedCostUsd: true,
        },
      }),
      prisma.settings.findUnique({
        where: { companyId: auth.companyId },
        select: {
          monthlyTokenBudget: true,
          tokenBudgetWarningPercent: true,
        },
      }),
      prisma.tokenUsage.aggregate({
        where: { createdAt: { gte: startOfMonth } },
        _sum: { totalTokens: true },
      }),
    ]);

    const monthlyUsed = monthlyAggregate._sum.totalTokens || 0;
    const monthlyBudget = settings?.monthlyTokenBudget || 0;
    const warningPercent = settings?.tokenBudgetWarningPercent || 80;
    const summarize = <T extends string>(
      key: T
    ) => {
      const bucket = new Map<string, {
        key: string;
        promptTokens: number;
        completionTokens: number;
        embeddingTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
        count: number;
      }>();

      for (const row of rows) {
        const value = String(row[key as keyof typeof row] || "unknown");
        const current = bucket.get(value) || {
          key: value,
          promptTokens: 0,
          completionTokens: 0,
          embeddingTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          count: 0,
        };
        current.promptTokens += row.promptTokens;
        current.completionTokens += row.completionTokens;
        current.embeddingTokens += row.embeddingTokens;
        current.totalTokens += row.totalTokens;
        current.estimatedCostUsd += row.estimatedCostUsd;
        current.count += 1;
        bucket.set(value, current);
      }

      return Array.from(bucket.values()).sort((a, b) => b.totalTokens - a.totalTokens);
    };

    const daily = new Map<string, {
      date: string;
      totalTokens: number;
      estimatedCostUsd: number;
      count: number;
    }>();

    for (const row of rows) {
      const date = row.createdAt.toISOString().slice(0, 10);
      const current = daily.get(date) || {
        date,
        totalTokens: 0,
        estimatedCostUsd: 0,
        count: 0,
      };
      current.totalTokens += row.totalTokens;
      current.estimatedCostUsd += row.estimatedCostUsd;
      current.count += 1;
      daily.set(date, current);
    }

    return NextResponse.json({
      data: rows,
      totals: aggregate._sum,
      breakdowns: {
        byFeature: summarize("feature"),
        byOperation: summarize("operation"),
        byEntityType: summarize("entityType"),
        byModel: summarize("model"),
        daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
      },
      budget: {
        monthlyUsed,
        monthlyBudget,
        warningPercent,
        warning:
          monthlyBudget > 0 &&
          monthlyUsed >= Math.floor((monthlyBudget * warningPercent) / 100),
      },
    });
  } catch (error) {
    logger.error("Failed to fetch token usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch token usage" },
      { status: 500 }
    );
  }
}
