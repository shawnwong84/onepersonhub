import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import {
  verifyPassword,
  generateToken,
  setAuthCookie,
  clearAuthCookie,
  getCurrentUser,
} from "@/lib/auth";
import { setCurrentCompany } from "@/lib/tenant-context";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";
import { isLockedOut, recordFailedLogin, clearLoginAttempts } from "@/lib/login-lockout";
import { getPermissionsForRole } from "@/lib/rbac";
import { isUnscoped } from "@/lib/rbac-scope";

// POST /api/auth - Login or Logout. Registration lives at POST /api/register
// (creates a new Company + its first Admin together) - there is no more
// single-tenant "setup" concept once any company can self-register.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, username, password } = body;

  if (action === "login") {
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const lockout = isLockedOut(username);
    if (lockout.locked) {
      const response = NextResponse.json(
        { error: "Too many failed login attempts. Please try again later." },
        { status: 429 }
      );
      response.headers.set("Retry-After", String(lockout.retryAfterSeconds));
      return response;
    }

    // Not tenant-scoped: username is globally unique across all companies
    // by design (see prisma/schema.prisma's Admin/TeamMember comments) -
    // this lookup is exactly how the company is resolved without needing
    // subdomain routing.
    const admin = await prismaUnscoped.admin.findUnique({
      where: { username },
      omit: { password: false },
    });
    if (admin) {
      const valid = await verifyPassword(password, admin.password);
      if (!valid) {
        recordFailedLogin(username);
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 }
        );
      }

      clearLoginAttempts(username);
      const token = generateToken(admin.id, admin.companyId, admin.role, "owner", admin.tokenVersion);
      const response = NextResponse.json({
        success: true,
        user: { id: admin.id, username: admin.username, name: admin.name, role: admin.role, userType: "owner" },
      });
      response.cookies.set(setAuthCookie(token));
      return response;
    }

    // Team member login
    const member = await prismaUnscoped.teamMember.findUnique({
      where: { username },
      omit: { password: false },
    });
    if (!member || !member.password || !member.isActive) {
      recordFailedLogin(username);
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const memberValid = await verifyPassword(password, member.password);
    if (!memberValid) {
      recordFailedLogin(username);
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    clearLoginAttempts(username);
    setCurrentCompany(member.companyId);
    await prismaUnscoped.teamMember.update({
      where: { id: member.id },
      data: { lastLoginAt: new Date() },
    });
    await logActivity({
      action: "team.member_login",
      entity: ACTIVITY_ENTITIES.SETTINGS,
      entityId: member.id,
      description: `Team member ${member.name} logged in.`,
      userId: member.id,
      userName: member.name,
    });

    const token = generateToken(member.id, member.companyId, member.rbacRole, "member", member.tokenVersion);
    const response = NextResponse.json({
      success: true,
      user: { id: member.id, username: member.username, name: member.name, role: member.rbacRole, userType: "member" },
    });
    response.cookies.set(setAuthCookie(token));
    return response;
  }

  if (action === "logout") {
    const cookie = clearAuthCookie();
    const response = NextResponse.json({ success: true });
    response.cookies.set(cookie);
    return response;
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// GET /api/auth - Check auth status
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }

  setCurrentCompany(user.companyId);

  // Sidebar/nav filtering needs to know what this specific user can access -
  // computed from the live (editable) role/permission tables, not a
  // hardcoded assumption, so it stays correct after an admin edits a role.
  const [permissions, unscoped] = await Promise.all([
    getPermissionsForRole(user.companyId, user.role),
    isUnscoped({ userId: user.id, companyId: user.companyId, role: user.role, userType: user.userType }),
  ]);

  return NextResponse.json({
    authenticated: true,
    user,
    permissions,
    isUnscoped: unscoped,
  });
}
