import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";
import { prismaUnscoped } from "@/lib/prisma";
import { setLogContext } from "@/lib/log-context";
import { setCurrentCompany } from "@/lib/tenant-context";
import { getBillingAccount, isBillingLocked } from "@/lib/billing/status";

// requireAuth runs in the Node.js runtime (API route handlers), unlike
// middleware.ts (still the pre-"Proxy" Edge-runtime file convention, which
// cannot load Prisma) - so the app-wide billing gate lives here instead.
const BILLING_EXEMPT_API_PATHS = ["/api/billing", "/api/auth", "/api/health", "/api/register"];

async function checkBillingLock(request: NextRequest, companyId: string): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;
  if (BILLING_EXEMPT_API_PATHS.some((p) => pathname.startsWith(p))) return null;

  const account = await getBillingAccount(companyId);
  if (!isBillingLocked(account)) return null;

  return NextResponse.json(
    { error: { code: "BILLING_LOCKED", message: "A subscription is required to continue. Visit /billing." } },
    { status: 402 }
  );
}

interface AuthContext {
  userId: string;
  companyId: string;
  role: string;
  username: string;
  name: string;
  userType: "owner" | "member";
  authMethod: "cookie" | "api_key";
}

/**
 * Authenticate via API key (X-API-Key header). Not tenant-scoped - the key
 * itself is the only thing that tells us which company this is.
 */
async function authenticateApiKey(apiKey: string): Promise<AuthContext | null> {
  const key = await prismaUnscoped.apiKey.findUnique({
    where: { key: apiKey },
  });

  if (!key || !key.isActive) return null;

  // Update lastUsed timestamp
  prismaUnscoped.apiKey.update({
    where: { id: key.id },
    data: { lastUsed: new Date() },
  }).catch(() => { /* fire and forget */ });

  // API keys get admin-level access within their own company
  return {
    userId: "api-key:" + key.id,
    companyId: key.companyId,
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

    setCurrentCompany(context.companyId);

    const billingLock = await checkBillingLock(request, context.companyId);
    if (billingLock) return billingLock;

    if (permission && !(await hasPermission(context.companyId, context.role, permission))) {
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
    // Not tenant-scoped: this IS the lookup that resolves companyId.
    const member = await prismaUnscoped.teamMember.findUnique({
      where: { id: payload.userId },
      select: { id: true, companyId: true, username: true, name: true, rbacRole: true, isActive: true, tokenVersion: true },
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
    if (member.companyId !== payload.companyId) {
      return NextResponse.json(
        { error: { code: "SESSION_INVALIDATED", message: "Your session has been invalidated. Please log in again." } },
        { status: 401 }
      );
    }

    setCurrentCompany(member.companyId);

    const billingLock = await checkBillingLock(request, member.companyId);
    if (billingLock) return billingLock;

    // Check against the live role so role changes apply without re-login.
    if (permission && !(await hasPermission(member.companyId, member.rbacRole, permission))) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        { status: 403 }
      );
    }

    return {
      userId: member.id,
      companyId: member.companyId,
      role: member.rbacRole,
      username: member.username,
      name: member.name,
      userType: "member",
      authMethod: "cookie",
    };
  }

  // Not tenant-scoped: this IS the lookup that resolves companyId.
  const admin = await prismaUnscoped.admin.findUnique({
    where: { id: payload.userId },
    select: { id: true, companyId: true, username: true, name: true, role: true, tokenVersion: true },
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
  if (admin.companyId !== payload.companyId) {
    return NextResponse.json(
      { error: { code: "SESSION_INVALIDATED", message: "Your session has been invalidated. Please log in again." } },
      { status: 401 }
    );
  }

  setCurrentCompany(admin.companyId);

  const billingLock = await checkBillingLock(request, admin.companyId);
  if (billingLock) return billingLock;

  if (permission && !(await hasPermission(admin.companyId, admin.role, permission))) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
      { status: 403 }
    );
  }

  return {
    userId: admin.id,
    companyId: admin.companyId,
    role: admin.role,
    username: admin.username,
    name: admin.name,
    userType: "owner",
    authMethod: "cookie",
  };
}

/**
 * Type guard: check if result is an auth context (not an error response).
 *
 * Also re-affirms the tenant context here, in the caller's own execution
 * (not nested inside requireAuth's returned promise) - observed empirically
 * that a plain `enterWith()` call made inside requireAuth() does not always
 * survive the `await requireAuth(...)` boundary in this runtime, even though
 * requireAuth's own internal reads of the same context succeed right up to
 * its `return`. Every route already calls `isAuthenticated(auth)` immediately
 * after `requireAuth()`, so this needs no changes to any of the ~100 call sites.
 */
export function isAuthenticated(
  result: AuthContext | NextResponse
): result is AuthContext {
  const ok = !(result instanceof NextResponse);
  if (ok) setCurrentCompany((result as AuthContext).companyId);
  return ok;
}
