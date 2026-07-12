import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { isUnscoped } from "@/lib/rbac-scope";
import { CORE_MODULE_SLUGS, MARKETPLACE_MODULES } from "@/lib/marketplace/catalog";
import { ALL_PERMISSIONS } from "@/lib/rbac";

// GET /api/team/permissions - the full member x module assignment matrix,
// plus the role x permission matrix (now DB-backed and editable via
// /api/team/permissions/roles). "team:read" alone (granted to every role by
// default) is too broad a gate for this specific endpoint - it exposes the
// entire staff roster (names, roles, departments) and the full permission
// matrix, not just the caller's own info, so it's restricted to unscoped
// (supervisor/admin) roles regardless of who else holds "team:read".
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "team:read");
  if (!isAuthenticated(auth)) return auth;

  if (!(await isUnscoped(auth))) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Only supervisors and admins can view the team roster and permission matrix.",
        },
      },
      { status: 403 }
    );
  }

  try {
    const [members, assignments, installedModules, roles] = await Promise.all([
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
      prisma.role.findMany({
        orderBy: { createdAt: "asc" },
        include: { permissions: { select: { permission: true } } },
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
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        label: role.label,
        isBuiltIn: role.isBuiltIn,
        isUnscoped: role.isUnscoped,
        permissions: role.permissions.map((p) => p.permission),
      })),
      allPermissions: ALL_PERMISSIONS,
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
