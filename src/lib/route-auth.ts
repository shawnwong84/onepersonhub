import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { setLogContext } from "@/lib/log-context";

interface AuthContext {
  userId: string;
  role: string;
  username: string;
  name: string;
  userType: "owner" | "member";
  authMethod: "cookie" | "api_key";
}

/**
 * Authenticate via API key (X-API-Key header).
 */
async function authenticateApiKey(apiKey: string): Promise<AuthContext | null> {
  const key = await prisma.apiKey.findUnique({
    where: { key: apiKey },
  });

  if (!key || !key.isActive) return null;

  // Update lastUsed timestamp
  prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsed: new Date() },
  }).catch(() => { /* fire and forget */ });

  // API keys get admin-level access
  return {
    userId: "api-key:" + key.id,
    role: "admin",
    username: key.name,
    name: key.name,
    userType: "owner",
    authMethod: "api_key",
  };
}

/**
 * Authenticate and authorize an API request.
 * Supports both cookie (JWT) and API key (X-API-Key header) auth.
 * Returns the auth context or a 401/403 response.
 */
export async function requireAuth(
  request: NextRequest,
  permission?: Permission
): Promise<AuthContext | NextResponse> {
  // Correlate every log line the rest of this request's handling emits with
  // the id middleware.ts generated (or forwarded) for it — set for the
  // remainder of this async chain, not just requireAuth's own execution.
  const requestId = request.headers.get("x-request-id");
  if (requestId) setLogContext({ requestId });

  // Try API key auth first
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) {
    const context = await authenticateApiKey(apiKey);
    if (!context) {
      return NextResponse.json(
        { error: { code: "INVALID_API_KEY", message: "Invalid or inactive API key" } },
        { status: 401 }
      );
    }

    if (permission && !hasPermission(context.role, permission)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        { status: 403 }
      );
    }

    return context;
  }

  // Fall back to cookie auth
  const token = request.cookies.get("owly-token")?.value;

  if (!token) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required. Use cookie or X-API-Key header." } },
      { status: 401 }
    );
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } },
      { status: 401 }
    );
  }

  if (payload.userType === "member") {
    const member = await prisma.teamMember.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, name: true, rbacRole: true, isActive: true, tokenVersion: true },
    });

    // Deactivation must invalidate existing sessions immediately.
    if (!member || !member.isActive || !member.username) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Account is not active" } },
        { status: 401 }
      );
    }

    // A password reset bumps tokenVersion, invalidating every session that
    // was issued before it - even ones that haven't expired yet.
    if (member.tokenVersion !== payload.tokenVersion) {
      return NextResponse.json(
        { error: { code: "SESSION_INVALIDATED", message: "Your session has been invalidated. Please log in again." } },
        { status: 401 }
      );
    }

    // Check against the live role so role changes apply without re-login.
    if (permission && !hasPermission(member.rbacRole, permission)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        { status: 403 }
      );
    }

    return {
      userId: member.id,
      role: member.rbacRole,
      username: member.username,
      name: member.name,
      userType: "member",
      authMethod: "cookie",
    };
  }

  if (permission && !hasPermission(payload.role, permission)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
      { status: 403 }
    );
  }

  const admin = await prisma.admin.findUnique({
    where: { id: payload.userId },
    select: { id: true, username: true, name: true, role: true, tokenVersion: true },
  });

  if (!admin) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "User not found" } },
      { status: 401 }
    );
  }

  if (admin.tokenVersion !== payload.tokenVersion) {
    return NextResponse.json(
      { error: { code: "SESSION_INVALIDATED", message: "Your session has been invalidated. Please log in again." } },
      { status: 401 }
    );
  }

  return {
    userId: admin.id,
    role: admin.role,
    username: admin.username,
    name: admin.name,
    userType: "owner",
    authMethod: "cookie",
  };
}

/**
 * Type guard: check if result is an auth context (not an error response).
 */
export function isAuthenticated(
  result: AuthContext | NextResponse
): result is AuthContext {
  return !(result instanceof NextResponse);
}
