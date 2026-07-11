import { prisma } from "@/lib/prisma";

/**
 * Role-Based Access Control (RBAC) System
 *
 * Role -> permission mapping is database-backed (Role/RolePermission
 * models) so admins can edit it at runtime, but every authenticated API
 * request checks a permission - so the mapping is cached in-process (see
 * roleCache below) instead of querying on every request. The cache is
 * invalidated whenever a role is edited via the permissions API.
 */

export const BUILT_IN_ROLES = ["viewer", "agent", "supervisor", "admin"] as const;
export type BuiltInRole = (typeof BUILT_IN_ROLES)[number];

// The full catalog of permission strings this app understands. This stays a
// static compile-time list (routes call requireAuth(request, "x:y") with a
// literal checked against the Permission type) - only which ROLES hold each
// permission is now editable; the set of possible permissions is not.
export const DEFAULT_ROLE_PERMISSIONS = {
  // Conversations
  "conversations:read": ["viewer", "agent", "supervisor", "admin"],
  "conversations:create": ["agent", "supervisor", "admin"],
  "conversations:update": ["agent", "supervisor", "admin"],
  "conversations:delete": ["supervisor", "admin"],
  "conversations:assign": ["supervisor", "admin"],
  "conversations:transfer": ["agent", "supervisor", "admin"],

  // Messages
  "messages:read": ["viewer", "agent", "supervisor", "admin"],
  "messages:create": ["agent", "supervisor", "admin"],

  // Tickets
  "tickets:read": ["viewer", "agent", "supervisor", "admin"],
  "tickets:create": ["agent", "supervisor", "admin"],
  "tickets:update": ["agent", "supervisor", "admin"],
  "tickets:delete": ["supervisor", "admin"],

  // Customers
  "customers:read": ["viewer", "agent", "supervisor", "admin"],
  "customers:create": ["agent", "supervisor", "admin"],
  "customers:update": ["agent", "supervisor", "admin"],
  "customers:delete": ["admin"],
  "customers:export": ["supervisor", "admin"],

  // Knowledge Base
  "knowledge:read": ["viewer", "agent", "supervisor", "admin"],
  "knowledge:create": ["supervisor", "admin"],
  "knowledge:update": ["supervisor", "admin"],
  "knowledge:delete": ["admin"],

  // Team Management
  "team:read": ["viewer", "agent", "supervisor", "admin"],
  "team:create": ["admin"],
  "team:update": ["admin"],
  "team:delete": ["admin"],

  // Automation
  "automation:read": ["viewer", "agent", "supervisor", "admin"],
  "automation:create": ["supervisor", "admin"],
  "automation:update": ["supervisor", "admin"],
  "automation:delete": ["admin"],

  // AI Agents
  "agents:read": ["viewer", "agent", "supervisor", "admin"],
  "agents:create": ["supervisor", "admin"],
  "agents:update": ["supervisor", "admin"],
  "agents:delete": ["admin"],

  // Webhooks
  "webhooks:read": ["supervisor", "admin"],
  "webhooks:create": ["admin"],
  "webhooks:update": ["admin"],
  "webhooks:delete": ["admin"],

  // Settings
  "settings:read": ["admin"],
  "settings:update": ["admin"],

  // Admin (users, API keys)
  "admin:read": ["admin"],
  "admin:create": ["admin"],
  "admin:update": ["admin"],
  "admin:delete": ["admin"],

  // Analytics
  "analytics:read": ["viewer", "agent", "supervisor", "admin"],
  "analytics:export": ["supervisor", "admin"],

  // Activity Log
  "activity:read": ["supervisor", "admin"],

  // Marketplace
  "marketplace:read": ["viewer", "agent", "supervisor", "admin"],
  "marketplace:install": ["admin"],
  "marketplace:manage": ["admin"],
  "module:read": ["viewer", "agent", "supervisor", "admin"],
  // Agents can write, but only inside modules they hold a write assignment
  // for -- per-module enforcement lives in rbac-scope.ts.
  "module:write": ["agent", "supervisor", "admin"],

  // Channels
  "channels:read": ["supervisor", "admin"],
  "channels:update": ["admin"],
  "channel-accounts:read": ["viewer", "agent", "supervisor", "admin"],
  "channel-accounts:create": ["admin"],
  "channel-accounts:update": ["admin"],
  "channel-accounts:delete": ["admin"],

  // SLA
  "sla:read": ["viewer", "agent", "supervisor", "admin"],
  "sla:create": ["admin"],
  "sla:update": ["admin"],
  "sla:delete": ["admin"],

  // Business Hours
  "business-hours:read": ["viewer", "agent", "supervisor", "admin"],
  "business-hours:update": ["admin"],

  // Canned Responses
  "canned:read": ["agent", "supervisor", "admin"],
  "canned:create": ["supervisor", "admin"],
  "canned:update": ["supervisor", "admin"],
  "canned:delete": ["admin"],

  // Export
  "export:read": ["supervisor", "admin"],
} as const;

export type Permission = keyof typeof DEFAULT_ROLE_PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(DEFAULT_ROLE_PERMISSIONS) as Permission[];

interface CachedRole {
  isUnscoped: boolean;
  permissions: Set<string>;
}

let roleCache: Map<string, CachedRole> | null = null;
let roleCacheLoading: Promise<Map<string, CachedRole>> | null = null;

async function loadRoleCache(): Promise<Map<string, CachedRole>> {
  const roles = await prisma.role.findMany({
    include: { permissions: { select: { permission: true } } },
  });
  const next = new Map<string, CachedRole>();
  for (const role of roles) {
    next.set(role.name, {
      isUnscoped: role.isUnscoped,
      permissions: new Set(role.permissions.map((p) => p.permission)),
    });
  }
  return next;
}

async function getRoleCache(): Promise<Map<string, CachedRole>> {
  if (roleCache) return roleCache;
  if (!roleCacheLoading) {
    roleCacheLoading = loadRoleCache().then((cache) => {
      roleCache = cache;
      roleCacheLoading = null;
      return cache;
    });
  }
  return roleCacheLoading;
}

/** Call after any write to Role/RolePermission so the next check re-reads the DB. */
export function invalidateRoleCache(): void {
  roleCache = null;
  roleCacheLoading = null;
}

/**
 * Check if a role has a specific permission.
 */
export async function hasPermission(role: string, permission: Permission): Promise<boolean> {
  const cache = await getRoleCache();
  return cache.get(role)?.permissions.has(permission) ?? false;
}

/**
 * Whether this role sees all data (supervisor/admin today) or only its own
 * assignments (viewer/agent today) - see rbac-scope.ts's isUnscoped, which
 * also always treats userType "owner" as unscoped regardless of role.
 */
export async function isRoleUnscoped(role: string): Promise<boolean> {
  const cache = await getRoleCache();
  return cache.get(role)?.isUnscoped ?? false;
}

/**
 * Get all permissions for a role.
 */
export async function getPermissionsForRole(role: string): Promise<Permission[]> {
  const cache = await getRoleCache();
  return Array.from(cache.get(role)?.permissions ?? []) as Permission[];
}
