-- ERP connectors are integration credentials, same policy bucket as
-- channels/webhooks/team/settings: admin-only by default.

INSERT INTO "RolePermission" ("id", "roleId", "permission", "createdAt")
SELECT gen_random_uuid(), id, perm, NOW()
FROM "Role"
CROSS JOIN (VALUES
  ('connectors:read'),
  ('connectors:create'),
  ('connectors:update'),
  ('connectors:delete')
) AS perms(perm)
WHERE name = 'admin';
