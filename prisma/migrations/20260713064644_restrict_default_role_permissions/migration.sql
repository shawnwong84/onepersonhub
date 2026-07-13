-- Restrict default permissions for viewer/agent/supervisor to
-- conversations/tickets/reporter (module:read/write) only - admin is
-- unchanged. Per explicit request 2026-07-13: only admin configures
-- admin-level settings; non-admin roles default to the actual support
-- work (conversations, tickets, reporter/chatbot) and nothing else.
-- Still editable per-role via /team/permissions afterward.

DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT id FROM "Role" WHERE name IN ('viewer', 'agent', 'supervisor'));

INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'conversations:read', NOW() FROM "Role" WHERE name = 'viewer';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'messages:read', NOW() FROM "Role" WHERE name = 'viewer';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'tickets:read', NOW() FROM "Role" WHERE name = 'viewer';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'module:read', NOW() FROM "Role" WHERE name = 'viewer';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'conversations:read', NOW() FROM "Role" WHERE name = 'agent';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'conversations:create', NOW() FROM "Role" WHERE name = 'agent';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'conversations:update', NOW() FROM "Role" WHERE name = 'agent';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'conversations:transfer', NOW() FROM "Role" WHERE name = 'agent';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'messages:read', NOW() FROM "Role" WHERE name = 'agent';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'messages:create', NOW() FROM "Role" WHERE name = 'agent';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'tickets:read', NOW() FROM "Role" WHERE name = 'agent';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'tickets:create', NOW() FROM "Role" WHERE name = 'agent';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'tickets:update', NOW() FROM "Role" WHERE name = 'agent';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'module:read', NOW() FROM "Role" WHERE name = 'agent';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'module:write', NOW() FROM "Role" WHERE name = 'agent';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'conversations:read', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'conversations:create', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'conversations:update', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'conversations:delete', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'conversations:assign', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'conversations:transfer', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'messages:read', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'messages:create', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'tickets:read', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'tickets:create', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'tickets:update', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'tickets:delete', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'module:read', NOW() FROM "Role" WHERE name = 'supervisor';
INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt") SELECT gen_random_uuid(), id, 'module:write', NOW() FROM "Role" WHERE name = 'supervisor';
