import { prismaUnscoped } from "@/lib/prisma";

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
//
// Default policy (2026-07-13, per explicit request): only admin can touch
// admin-level configuration (settings, team, automation, knowledge base,
// channels, webhooks, marketplace, analytics, etc). Non-admin roles
// (viewer/agent/supervisor) default to conversations, tickets, and the
// reporter/chatbot (module:read/write - the reporter agent is a core
// module, always accessible) only. viewer stays read-only on those three,
// matching its name; agent/supervisor get full CRUD since they're the
// roles actually doing support work. supervisor additionally gets
// assign/delete within that same conversations/tickets scope (routing
// work to agents, closing out tickets) - it does not regain access to
// anything outside conversations/tickets/reporter. This is all still
// editable per-role via /team/permissions; these are just the defaults
// new/existing built-in roles start with.
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

  // Customers - admin only by default now; grant per-role if a team
  // needs agents looking customers up (previously granted to everyone).
  "customers:read": ["admin"],
  "customers:create": ["admin"],
  "customers:update": ["admin"],
  "customers:delete": ["admin"],
  "customers:export": ["admin"],

  // Knowledge Base - admin only by default now.
  "knowledge:read": ["admin"],
  "knowledge:create": ["admin"],
  "knowledge:update": ["admin"],
  "knowledge:delete": ["admin"],

  // Team Management - admin only by default now (was viewer/agent/
  // supervisor:read; already restricted further at the API layer in
  // /api/team/permissions and /api/team/members, this brings the
  // permission grant itself in line with that).
  "team:read": ["admin"],
  "team:create": ["admin"],
  "team:update": ["admin"],
  "team:delete": ["admin"],

  // Automation - admin only by default now.
  "automation:read": ["admin"],
  "automation:create": ["admin"],
  "automation:update": ["admin"],
  "automation:delete": ["admin"],

  // AI Agents (agent *configuration*, not the human "agent" role) - admin
  // only by default now.
  "agents:read": ["admin"],
  "agents:create": ["admin"],
  "agents:update": ["admin"],
  "agents:delete": ["admin"],

  // Webhooks
  "webhooks:read": ["admin"],
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

  // Analytics - admin only by default now.
  "analytics:read": ["admin"],
  "analytics:export": ["admin"],

  // Activity Log
  "activity:read": ["admin"],

  // Marketplace - installing/uninstalling/configuring modules org-wide is
  // admin only, but marketplace:read (list what's installed) stays broad:
  // GET /api/marketplace/modules is what the sidebar's dynamic "Modules"
  // section uses to know which modules to link to (including the Reporter
  // Agent core module the reporter/chatbot lives in) - restricting it to
  // admin would silently break Reporter access for every non-admin role,
  // contradicting "user can do conversations/tickets/reporter". The route
  // itself already narrows the returned list to core modules plus whatever
  // the caller has an explicit ModuleAssignment for (getAccessibleModuleSlugs
  // in rbac-scope.ts) - marketplace:read only gates whether they can ask at
  // all, not what they see back.
  "marketplace:read": ["viewer", "agent", "supervisor", "admin"],
  "marketplace:install": ["admin"],
  "marketplace:manage": ["admin"],
  "module:read": ["viewer", "agent", "supervisor", "admin"],
  "module:write": ["agent", "supervisor", "admin"],

  // Channels - admin only by default now.
  "channels:read": ["admin"],
  "channels:update": ["admin"],
  "channel-accounts:read": ["admin"],
  "channel-accounts:create": ["admin"],
  "channel-accounts:update": ["admin"],
  "channel-accounts:delete": ["admin"],

  // SLA - admin only by default now.
  "sla:read": ["admin"],
  "sla:create": ["admin"],
  "sla:update": ["admin"],
  "sla:delete": ["admin"],

  // Business Hours - admin only by default now.
  "business-hours:read": ["admin"],
  "business-hours:update": ["admin"],

  // Canned Responses - admin only by default now.
  "canned:read": ["admin"],
  "canned:create": ["admin"],
  "canned:update": ["admin"],
  "canned:delete": ["admin"],

  // Export
  "export:read": ["admin"],

  // ERP Connectors (SAP, Oracle, Microsoft 365, Dynamics 365 Business
  // Central, Odoo) - integration credentials, same policy bucket as
  // channels/webhooks/team/settings: admin only by default.
  "connectors:read": ["admin"],
  "connectors:create": ["admin"],
  "connectors:update": ["admin"],
  "connectors:delete": ["admin"],

  // Billing (Stripe subscription, module quota) - admin only.
  "billing:read": ["admin"],
  "billing:update": ["admin"],
} as const;

export type Permission = keyof typeof DEFAULT_ROLE_PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(DEFAULT_ROLE_PERMISSIONS) as Permission[];

interface CachedRole {
  isUnscoped: boolean;
  permissions: Set<string>;
}

// Roles are per-company (each company gets its own independently-editable
// copies of the built-in roles, seeded at registration - see
// src/app/api/register/route.ts) so the cache is keyed by companyId, not
// just role name. Two companies can each have their own "agent" role with
// completely different permissions.
const roleCacheByCompany = new Map<string, Map<string, CachedRole>>();
const roleCacheLoading = new Map<string, Promise<Map<string, CachedRole>>>();

async function loadRoleCache(companyId: string): Promise<Map<string, CachedRole>> {
  const roles = await prismaUnscoped.role.findMany({
    where: { companyId },
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

async function getRoleCache(companyId: string): Promise<Map<string, CachedRole>> {
  const cached = roleCacheByCompany.get(companyId);
  if (cached) return cached;

  let loading = roleCacheLoading.get(companyId);
  if (!loading) {
    loading = loadRoleCache(companyId).then((cache) => {
      roleCacheByCompany.set(companyId, cache);
      roleCacheLoading.delete(companyId);
      return cache;
    });
    roleCacheLoading.set(companyId, loading);
  }
  return loading;
}

/**
 * Call after any write to Role/RolePermission so the next check re-reads
 * the DB. Clears the whole cache rather than just one company's entry -
 * role edits are infrequent, and a full clear is simple and always correct
 * versus getting per-company invalidation subtly wrong.
 */
export function invalidateRoleCache(): void {
  roleCacheByCompany.clear();
  roleCacheLoading.clear();
}

/**
 * Check if a role has a specific permission, within a given company.
 */
export async function hasPermission(companyId: string, role: string, permission: Permission): Promise<boolean> {
  const cache = await getRoleCache(companyId);
  return cache.get(role)?.permissions.has(permission) ?? false;
}

/**
 * Whether this role sees all data (supervisor/admin today) or only its own
 * assignments (viewer/agent today) - see rbac-scope.ts's isUnscoped, which
 * also always treats userType "owner" as unscoped regardless of role.
 */
export async function isRoleUnscoped(companyId: string, role: string): Promise<boolean> {
  const cache = await getRoleCache(companyId);
  return cache.get(role)?.isUnscoped ?? false;
}

/**
 * Get all permissions for a role, within a given company.
 */
export async function getPermissionsForRole(companyId: string, role: string): Promise<Permission[]> {
  const cache = await getRoleCache(companyId);
  return Array.from(cache.get(role)?.permissions ?? []) as Permission[];
}
