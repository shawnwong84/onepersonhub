import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { isUnscoped } from "@/lib/rbac-scope";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "team:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const departmentId = searchParams.get("departmentId");

    const where = departmentId ? { departmentId } : {};
    // Scoped roles (viewer/agent) still need this list for assignment
    // pickers elsewhere (conversations, tickets, flows), but they don't
    // need the rest of a teammate's profile - email, phone, expertise,
    // exact role, active/login status, tokenVersion. Only supervisors/
    // admins (who actually manage the team) get the full record.
    const unscoped = await isUnscoped(auth);

    const [members, total] = await Promise.all([
      prisma.teamMember.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take,
        select: unscoped
          ? {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              expertise: true,
              departmentId: true,
              isAvailable: true,
              username: true,
              rbacRole: true,
              isActive: true,
              lastLoginAt: true,
              createdAt: true,
              updatedAt: true,
              department: { select: { id: true, name: true } },
            }
          : {
              id: true,
              name: true,
              isAvailable: true,
              department: { select: { id: true, name: true } },
            },
      }),
      prisma.teamMember.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(members, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "team:create");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { name, email, phone, role, expertise, departmentId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Member name is required" },
        { status: 400 }
      );
    }

    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: "Member email is required" },
        { status: 400 }
      );
    }

    if (!departmentId) {
      return NextResponse.json(
        { error: "Department is required" },
        { status: 400 }
      );
    }

    const member = await prisma.teamMember.create({
      data: {
        companyId: auth.companyId,
        name: name.trim(),
        email: email.trim(),
        phone: phone?.trim() || "",
        role: role?.trim() || "member",
        expertise: expertise?.trim() || "",
        departmentId,
      },

      include: {
        department: {
          select: { id: true, name: true },
        },
      },
    });

    await logActivity({
      action: "settings.team_member_created",
      entity: ACTIVITY_ENTITIES.SETTINGS,
      entityId: member.id,
      description: `Created team member: ${member.name}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        email: member.email,
        role: member.role,
        departmentId: member.departmentId,
        departmentName: member.department.name,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    logger.error("Failed to create member:", error);
    return NextResponse.json(
      { error: "Failed to create member" },
      { status: 500 }
    );
  }
}
