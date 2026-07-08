import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  setAuthCookie,
  clearAuthCookie,
  getCurrentUser,
  isSetupComplete,
} from "@/lib/auth";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";

// POST /api/auth - Login or Setup
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, username, password, name } = body;

  if (action === "setup") {
    const setupDone = await isSetupComplete();
    if (setupDone) {
      return NextResponse.json(
        { error: "Setup already completed" },
        { status: 400 }
      );
    }

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const hashed = await hashPassword(password);
    const admin = await prisma.admin.create({
      data: {
        username,
        password: hashed,
        name: name || "Admin",
        role: "admin",
      },
    });

    // Ensure default settings exist
    await prisma.settings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    });

    // Ensure channels exist
    for (const type of ["whatsapp", "email", "phone"]) {
      await prisma.channel.upsert({
        where: { type },
        update: {},
        create: { type, isActive: false, status: "disconnected" },
      });
    }

    const token = generateToken(admin.id, admin.role);
    const cookie = setAuthCookie(token);

    const response = NextResponse.json({
      success: true,
      user: { id: admin.id, username: admin.username, name: admin.name },
    });
    response.cookies.set(cookie);
    return response;
  }

  if (action === "login") {
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const admin = await prisma.admin.findUnique({
      where: { username },
      omit: { password: false },
    });
    if (admin) {
      const valid = await verifyPassword(password, admin.password);
      if (!valid) {
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 }
        );
      }

      const token = generateToken(admin.id, admin.role, "owner");
      const response = NextResponse.json({
        success: true,
        user: { id: admin.id, username: admin.username, name: admin.name, role: admin.role, userType: "owner" },
      });
      response.cookies.set(setAuthCookie(token));
      return response;
    }

    // Team member login
    const member = await prisma.teamMember.findUnique({
      where: { username },
      omit: { password: false },
    });
    if (!member || !member.password || !member.isActive) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const memberValid = await verifyPassword(password, member.password);
    if (!memberValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    await prisma.teamMember.update({
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

    const token = generateToken(member.id, member.rbacRole, "member");
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
  const setupDone = await isSetupComplete();
  if (!setupDone) {
    return NextResponse.json({ authenticated: false, setupRequired: true });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, setupRequired: false });
  }

  return NextResponse.json({
    authenticated: true,
    setupRequired: false,
    user,
  });
}
