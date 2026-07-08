import { NextRequest, NextResponse } from "next/server";
import { MARKETPLACE_CATEGORIES, MARKETPLACE_MODULES } from "@/lib/marketplace/catalog";
import { getAccessibleModuleSlugs, isUnscoped } from "@/lib/rbac-scope";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "marketplace:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "all";
    const installed = searchParams.get("installed") === "true";
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    const installedRows = await prisma.businessModule.findMany({
      where: {
        slug: { in: MARKETPLACE_MODULES.map((module) => module.slug) },
      },
    });
    const stateBySlug = new Map(installedRows.map((row) => [row.slug, row]));
    const accessibleSlugs = isUnscoped(auth) ? null : new Set(await getAccessibleModuleSlugs(auth));

    const modules = MARKETPLACE_MODULES.filter(
      (module) => !accessibleSlugs || accessibleSlugs.has(module.slug)
    ).map((module) => {
      const state = stateBySlug.get(module.slug);
      return {
        ...module,
        isInstalled: state?.isInstalled ?? module.isInstalled,
        isEnabled: state?.isEnabled ?? module.isEnabled,
        installedAt: state?.installedAt?.toISOString() || null,
        installedBy: state?.installedBy || null,
        config: state?.config || {},
      };
    }).filter((module) => {
      if (category !== "all" && module.category !== category) return false;
      if (installed && !module.isInstalled) return false;
      if (!search) return true;

      const searchable = [
        module.name,
        module.category,
        module.description,
        module.longDescription,
        ...module.channels,
        ...module.workflows,
        ...module.records,
        ...module.reporterSignals,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(search);
    });

    return NextResponse.json({
      modules,
      categories: MARKETPLACE_CATEGORIES,
      total: modules.length,
    });
  } catch (error) {
    logger.error("Failed to fetch marketplace modules:", error);
    return NextResponse.json(
      { error: "Failed to fetch marketplace modules" },
      { status: 500 }
    );
  }
}
