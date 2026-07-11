import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRoleUnscoped } from "@/lib/rbac";
import { CORE_MODULE_SLUGS, MARKETPLACE_MODULES } from "@/lib/marketplace/catalog";

export interface ScopedUser {
  userId: string;
  role: string;
  userType: "owner" | "member";
}

/**
 * The owner account and API keys (role "admin") see everything. Other roles
 * are unscoped based on their Role.isUnscoped flag (editable via the
 * permissions UI) - supervisor/admin default to true, viewer/agent to
 * false, matching the behavior of the old hardcoded hierarchy check.
 */
export async function isUnscoped(user: ScopedUser): Promise<boolean> {
  return user.userType === "owner" || (await isRoleUnscoped(user.role));
}

/**
 * Module slugs this user may read. Core modules are readable by everyone.
 */
export async function getAccessibleModuleSlugs(user: ScopedUser): Promise<string[]> {
  if (await isUnscoped(user)) {
    return MARKETPLACE_MODULES.map((module) => module.slug);
  }
  const assignments = await prisma.moduleAssignment.findMany({
    where: { teamMemberId: user.userId },
    select: { moduleSlug: true },
  });
  return Array.from(
    new Set([...CORE_MODULE_SLUGS, ...assignments.map((a) => a.moduleSlug)])
  );
}

/**
 * Whether the user may read or write a specific module.
 * Write requires a write assignment (core modules included) for scoped users.
 */
export async function canAccessModule(
  user: ScopedUser,
  moduleSlug: string,
  level: "read" | "write" = "read"
): Promise<boolean> {
  if (await isUnscoped(user)) return true;

  const assignment = await prisma.moduleAssignment.findUnique({
    where: { teamMemberId_moduleSlug: { teamMemberId: user.userId, moduleSlug } },
    select: { access: true },
  });

  if (level === "read") {
    return Boolean(assignment) || CORE_MODULE_SLUGS.includes(moduleSlug);
  }
  return assignment?.access === "write";
}

// Denied-access activity entries are throttled so a polling UI cannot flood the log.
const deniedLogAt = new Map<string, number>();
const DENIED_LOG_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Route guard: returns a 403 response when the user lacks module access, null otherwise.
 */
export async function requireModuleAccess(
  user: ScopedUser,
  moduleSlug: string,
  level: "read" | "write" = "read"
): Promise<NextResponse | null> {
  if (await canAccessModule(user, moduleSlug, level)) return null;

  const throttleKey = `${user.userId}:${moduleSlug}:${level}`;
  const last = deniedLogAt.get(throttleKey) || 0;
  if (Date.now() - last > DENIED_LOG_INTERVAL_MS) {
    deniedLogAt.set(throttleKey, Date.now());
    const { logActivity, ACTIVITY_ENTITIES } = await import("@/lib/activity");
    logActivity({
      action: "rbac.module_access_denied",
      entity: ACTIVITY_ENTITIES.MODULE,
      entityId: moduleSlug,
      description: `Denied ${level} access to module ${moduleSlug}.`,
      userId: user.userId,
      metadata: { moduleSlug, level, role: user.role },
    }).catch(() => {
      // Logging must never affect the response.
    });
  }

  return NextResponse.json(
    {
      error: {
        code: "MODULE_FORBIDDEN",
        message: `You do not have ${level} access to this module. Ask an admin for an assignment.`,
      },
    },
    { status: 403 }
  );
}

/**
 * Prisma where fragment limiting conversations to the user's own assignments.
 */
export async function conversationScope(user: ScopedUser): Promise<{ assignedToId?: string }> {
  return (await isUnscoped(user)) ? {} : { assignedToId: user.userId };
}

/**
 * Prisma where fragment limiting tickets to the user's own assignments.
 */
export async function ticketScope(user: ScopedUser): Promise<{ assignedToId?: string }> {
  return (await isUnscoped(user)) ? {} : { assignedToId: user.userId };
}
