import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { CORE_MODULE_SLUGS, MARKETPLACE_MODULES } from "@/lib/marketplace/catalog";
import { PERMISSIONS, ROLES } from "@/lib/rbac";

// GET /api/team/permissions - the full member x module assignment matrix
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "team:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const [members, assignments, installedModules] = await Promise.all([
      prisma.teamMember.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          username: true,
          rbacRole: true,
          isActive: true,
          department: { select: { name: true } },
        },
      }),
      prisma.moduleAssignment.findMany(),
      prisma.businessModule.findMany({
        where: { isInstalled: true },
        select: { slug: true },
      }),
    ]);

    const installedSlugs = new Set(installedModules.map((m) => m.slug));
    const modules = MARKETPLACE_MODULES.filter(
      (m) => installedSlugs.has(m.slug) || CORE_MODULE_SLUGS.includes(m.slug)
    ).map((m) => ({
      slug: m.slug,
      name: m.name,
      isCore: CORE_MODULE_SLUGS.includes(m.slug),
    }));

    return NextResponse.json({
      members,
      modules,
      assignments: assignments.map((a) => ({
        teamMemberId: a.teamMemberId,
        moduleSlug: a.moduleSlug,
        access: a.access,
      })),
      roles: ROLES,
      rolePermissions: PERMISSIONS,
      coreModules: CORE_MODULE_SLUGS,
    });
  } catch (error) {
    logger.error("Failed to fetch permission matrix:", error);
    return NextResponse.json(
      { error: "Failed to fetch permission matrix" },
      { status: 500 }
    );
  }
}
