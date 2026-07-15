-- Billing configuration is admin-only, same policy bucket as
-- settings/team/channels/connectors.

INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt")
SELECT gen_random_uuid(), id, perm, NOW()
FROM "Role"
CROSS JOIN (VALUES
  ('billing:read'),
  ('billing:update')
) AS perms(perm)
WHERE name = 'admin';
