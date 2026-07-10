import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { hashPassword } from "@/lib/auth";
import { ROLES } from "@/lib/rbac";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

// POST /api/team/members/[id]/credentials - issue or update login credentials
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "team:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { username, password, rbacRole, isActive } = body as {
      username?: string;
      password?: string;
      rbacRole?: string;
      isActive?: boolean;
    };

    const member = await prisma.teamMember.findUnique({ where: { id } });
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (rbacRole !== undefined && !ROLES.includes(rbacRole as (typeof ROLES)[number])) {
      return NextResponse.json(
        { error: `rbacRole must be one of: ${ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    if (password !== undefined && password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    if (username !== undefined) {
      const trimmed = username.trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Username cannot be empty" }, { status: 400 });
      }
      // Username must be unique across both login tables.
      const [adminClash, memberClash] = await Promise.all([
        prisma.admin.findUnique({ where: { username: trimmed } }),
        prisma.teamMember.findFirst({ where: { username: trimmed, NOT: { id } } }),
      ]);
      if (adminClash || memberClash) {
        return NextResponse.json({ error: "Username is already taken" }, { status: 400 });
      }
    }

    const hadCredentials = Boolean(member.username && member.password);
    const updated = await prisma.teamMember.update({
      where: { id },
      data: {
        ...(username !== undefined && { username: username.trim() }),
        ...(password !== undefined && {
          password: await hashPassword(password),
          // Invalidate every session issued before this reset.
          tokenVersion: { increment: 1 },
        }),
        ...(rbacRole !== undefined && { rbacRole }),
        ...(typeof isActive === "boolean" && { isActive }),
      },
      select: {
        id: true,
        name: true,
        username: true,
        rbacRole: true,
        isActive: true,
        lastLoginAt: true,
      },
    });

    const action =
      typeof isActive === "boolean" && !isActive
        ? "team.member_deactivated"
        : hadCredentials
        ? "team.member_credentials_updated"
        : "team.member_credentials_issued";

    await logActivity({
      action,
      entity: ACTIVITY_ENTITIES.SETTINGS,
      entityId: updated.id,
      description:
        action === "team.member_deactivated"
          ? `Deactivated login for team member ${updated.name}.`
          : action === "team.member_credentials_issued"
          ? `Issued login credentials for team member ${updated.name}.`
          : `Updated login credentials for team member ${updated.name}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        username: updated.username,
        rbacRole: updated.rbacRole,
        isActive: updated.isActive,
        passwordChanged: password !== undefined,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error("Failed to update member credentials:", error);
    return NextResponse.json(
      { error: "Failed to update member credentials" },
      { status: 500 }
    );
  }
}
