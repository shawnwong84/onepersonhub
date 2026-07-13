-- Correction to the previous migration: marketplace:read was made
-- admin-only along with the rest of the marketplace/* permissions, but it
-- also gates GET /api/marketplace/modules - the endpoint the sidebar uses
-- to list installed modules, including the Reporter Agent core module the
-- reporter/chatbot lives in. Restricting it broke Reporter access for
-- every non-admin role, contradicting the "user can do conversations/
-- tickets/reporter" policy. Restoring marketplace:read to viewer/agent/
-- supervisor; marketplace:install and marketplace:manage stay admin-only.

INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt")
SELECT gen_random_uuid(), id, 'marketplace:read', NOW()
FROM "Role"
WHERE name IN ('viewer', 'agent', 'supervisor');
