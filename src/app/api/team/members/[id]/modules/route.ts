import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { findMarketplaceModule } from "@/lib/marketplace/catalog";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

// GET /api/team/members/[id]/modules - list a member's module assignments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "team:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const assignments = await prisma.moduleAssignment.findMany({
      where: { teamMemberId: id },
      orderBy: { moduleSlug: "asc" },
    });
    return NextResponse.json({ assignments });
  } catch (error) {
    logger.error("Failed to fetch module assignments:", error);
    return NextResponse.json(
      { error: "Failed to fetch module assignments" },
      { status: 500 }
    );
  }
}

// POST /api/team/members/[id]/modules - assign (or update access for) a module
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "team:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const moduleSlug = typeof body.moduleSlug === "string" ? body.moduleSlug.trim() : "";
    const access = body.access === "write" ? "write" : "read";

    if (!moduleSlug || !findMarketplaceModule(moduleSlug)) {
      return NextResponse.json({ error: "Unknown module" }, { status: 400 });
    }

    const member = await prisma.teamMember.findUnique({ where: { id } });
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const assignment = await prisma.moduleAssignment.upsert({
      where: { teamMemberId_moduleSlug: { teamMemberId: id, moduleSlug } },
      update: { access, assignedBy: auth.name || auth.username },
      create: {
        companyId: auth.companyId,
        teamMemberId: id,
        moduleSlug,
        access,
        assignedBy: auth.name || auth.username,
      },
    });

    await logActivity({
      action: "team.module_assigned",
      entity: ACTIVITY_ENTITIES.MODULE,
      entityId: assignment.id,
      description: `Assigned module ${moduleSlug} (${access}) to ${member.name}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: { teamMemberId: id, memberName: member.name, moduleSlug, access },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    logger.error("Failed to assign module:", error);
    return NextResponse.json({ error: "Failed to assign module" }, { status: 500 });
  }
}

// DELETE /api/team/members/[id]/modules?moduleSlug=x - revoke a module assignment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "team:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const moduleSlug = (searchParams.get("moduleSlug") || "").trim();

    if (!moduleSlug) {
      return NextResponse.json({ error: "moduleSlug is required" }, { status: 400 });
    }

    const member = await prisma.teamMember.findUnique({ where: { id } });
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    await prisma.moduleAssignment.deleteMany({
      where: { teamMemberId: id, moduleSlug },
    });

    await logActivity({
      action: "team.module_unassigned",
      entity: ACTIVITY_ENTITIES.MODULE,
      entityId: id,
      description: `Revoked module ${moduleSlug} from ${member.name}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: { teamMemberId: id, memberName: member.name, moduleSlug },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to revoke module assignment:", error);
    return NextResponse.json(
      { error: "Failed to revoke module assignment" },
      { status: 500 }
    );
  }
}
