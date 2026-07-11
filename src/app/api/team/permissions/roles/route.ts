import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { ALL_PERMISSIONS, invalidateRoleCache, type Permission } from "@/lib/rbac";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

const ALL_PERMISSIONS_SET = new Set<string>(ALL_PERMISSIONS);

// POST /api/team/permissions/roles - create a custom role
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "team:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { name, label, isUnscoped, permissions } = body as {
      name?: string;
      label?: string;
      isUnscoped?: boolean;
      permissions?: string[];
    };

    const trimmedName = (name || "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmedName || !/^[a-z0-9-]+$/.test(trimmedName)) {
      return NextResponse.json(
        { error: "Role name is required and may only contain lowercase letters, numbers, and hyphens" },
        { status: 400 }
      );
    }

    const trimmedLabel = (label || "").trim();
    if (!trimmedLabel) {
      return NextResponse.json({ error: "Role label is required" }, { status: 400 });
    }

    const invalidPermissions = (permissions || []).filter((p) => !ALL_PERMISSIONS_SET.has(p));
    if (invalidPermissions.length > 0) {
      return NextResponse.json(
        { error: `Unknown permissions: ${invalidPermissions.join(", ")}` },
        { status: 400 }
      );
    }

    const existing = await prisma.role.findUnique({ where: { name: trimmedName } });
    if (existing) {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 400 });
    }

    const role = await prisma.role.create({
      data: {
        name: trimmedName,
        label: trimmedLabel,
        isBuiltIn: false,
        isUnscoped: Boolean(isUnscoped),
        permissions: {
          create: (permissions || []).map((permission: string) => ({ permission })),
        },
      },
      include: { permissions: { select: { permission: true } } },
    });
    invalidateRoleCache();

    await logActivity({
      action: "role.created",
      entity: ACTIVITY_ENTITIES.SETTINGS,
      entityId: role.id,
      description: `Created custom role "${role.label}".`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: { name: role.name, isUnscoped: role.isUnscoped, permissions: permissions || [] },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(
      {
        id: role.id,
        name: role.name,
        label: role.label,
        isBuiltIn: role.isBuiltIn,
        isUnscoped: role.isUnscoped,
        permissions: role.permissions.map((p: { permission: string }) => p.permission as Permission),
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Failed to create role:", error);
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
}
