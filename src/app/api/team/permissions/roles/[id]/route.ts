import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { ALL_PERMISSIONS, invalidateRoleCache } from "@/lib/rbac";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

const ALL_PERMISSIONS_SET = new Set<string>(ALL_PERMISSIONS);

// PUT /api/team/permissions/roles/[id] - edit a role's permissions/scoping.
// Built-in roles (viewer/agent/supervisor/admin) can have their permissions
// and isUnscoped flag edited too - "editable role x permission matrix" means
// editable for every role, not just custom ones - but name/isBuiltIn are
// immutable so nothing else in the app that reads TeamMember.rbacRole /
// Admin.role by name breaks.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "team:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { label, isUnscoped, permissions } = body as {
      label?: string;
      isUnscoped?: boolean;
      permissions?: string[];
    };

    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    if (permissions !== undefined) {
      const invalidPermissions = permissions.filter((p) => !ALL_PERMISSIONS_SET.has(p));
      if (invalidPermissions.length > 0) {
        return NextResponse.json(
          { error: `Unknown permissions: ${invalidPermissions.join(", ")}` },
          { status: 400 }
        );
      }
    }

    if (label !== undefined && !label.trim()) {
      return NextResponse.json({ error: "Role label cannot be empty" }, { status: 400 });
    }

    const role = await prisma.$transaction(async (tx) => {
      if (permissions !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: permissions.map((permission: string) => ({ roleId: id, permission })),
          });
        }
      }
      return tx.role.update({
        where: { id },
        data: {
          ...(label !== undefined && { label: label.trim() }),
          ...(typeof isUnscoped === "boolean" && { isUnscoped }),
        },
        include: { permissions: { select: { permission: true } } },
      });
    });
    invalidateRoleCache();

    await logActivity({
      action: "role.updated",
      entity: ACTIVITY_ENTITIES.SETTINGS,
      entityId: role.id,
      description: `Updated role "${role.label}".`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        name: role.name,
        isUnscoped: role.isUnscoped,
        permissions: role.permissions.map((p) => p.permission),
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({
      id: role.id,
      name: role.name,
      label: role.label,
      isBuiltIn: role.isBuiltIn,
      isUnscoped: role.isUnscoped,
      permissions: role.permissions.map((p) => p.permission),
    });
  } catch (error) {
    logger.error("Failed to update role:", error);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}

// DELETE /api/team/permissions/roles/[id] - delete a custom role. Built-in
// roles can't be deleted, and neither can a role currently assigned to any
// team member (would leave a dangling rbacRole string with no definition).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "team:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    if (role.isBuiltIn) {
      return NextResponse.json({ error: "Built-in roles cannot be deleted" }, { status: 400 });
    }

    const inUse = await prisma.teamMember.count({ where: { rbacRole: role.name } });
    if (inUse > 0) {
      return NextResponse.json(
        { error: `${inUse} team member(s) currently have this role - reassign them first` },
        { status: 400 }
      );
    }

    await prisma.role.delete({ where: { id } });
    invalidateRoleCache();

    await logActivity({
      action: "role.deleted",
      entity: ACTIVITY_ENTITIES.SETTINGS,
      entityId: id,
      description: `Deleted custom role "${role.label}".`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: { name: role.name },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete role:", error);
    return NextResponse.json({ error: "Failed to delete role" }, { status: 500 });
  }
}
