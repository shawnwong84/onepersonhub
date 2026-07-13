import { describe, it, expect } from "vitest";
import { hasPermission, isRoleUnscoped, getPermissionsForRole } from "@/lib/rbac";

describe("RBAC System", () => {
  describe("hasPermission", () => {
    it("admin should have all permissions", async () => {
      expect(await hasPermission("admin", "settings:read")).toBe(true);
      expect(await hasPermission("admin", "settings:update")).toBe(true);
      expect(await hasPermission("admin", "admin:delete")).toBe(true);
      expect(await hasPermission("admin", "conversations:read")).toBe(true);
    });

    it("viewer should only have read permissions", async () => {
      expect(await hasPermission("viewer", "conversations:read")).toBe(true);
      expect(await hasPermission("viewer", "conversations:create")).toBe(false);
      expect(await hasPermission("viewer", "settings:read")).toBe(false);
    });

    it("agent should have create/update but not delete on most resources", async () => {
      expect(await hasPermission("agent", "conversations:create")).toBe(true);
      expect(await hasPermission("agent", "conversations:update")).toBe(true);
      expect(await hasPermission("agent", "conversations:delete")).toBe(false);
      expect(await hasPermission("agent", "tickets:create")).toBe(true);
      expect(await hasPermission("agent", "knowledge:create")).toBe(false);
    });

    it("supervisor can manage conversations/tickets but not admin-level config", async () => {
      // Default policy: only admin touches admin-level configuration:
      // non-admin roles (including supervisor) default to
      // conversations/tickets/reporter only, editable per-role afterward.
      expect(await hasPermission("supervisor", "conversations:delete")).toBe(true);
      expect(await hasPermission("supervisor", "tickets:delete")).toBe(true);
      expect(await hasPermission("supervisor", "knowledge:create")).toBe(false);
      expect(await hasPermission("supervisor", "webhooks:read")).toBe(false);
      expect(await hasPermission("supervisor", "admin:create")).toBe(false);
      expect(await hasPermission("supervisor", "settings:update")).toBe(false);
    });

    it("should return false for invalid role", async () => {
      expect(await hasPermission("hacker", "conversations:read")).toBe(false);
    });

    it("should return false for invalid permission", async () => {
      expect(await hasPermission("admin", "nonexistent:read" as never)).toBe(false);
    });
  });

  describe("isRoleUnscoped", () => {
    it("supervisor and admin are unscoped", async () => {
      expect(await isRoleUnscoped("supervisor")).toBe(true);
      expect(await isRoleUnscoped("admin")).toBe(true);
    });

    it("viewer and agent are scoped", async () => {
      expect(await isRoleUnscoped("viewer")).toBe(false);
      expect(await isRoleUnscoped("agent")).toBe(false);
    });

    it("unknown role is scoped by default", async () => {
      expect(await isRoleUnscoped("unknown")).toBe(false);
    });
  });

  describe("getPermissionsForRole", () => {
    it("should return permissions array for a role", async () => {
      const adminPerms = await getPermissionsForRole("admin");
      expect(adminPerms.length).toBeGreaterThan(20);
      expect(adminPerms).toContain("settings:update");
    });

    it("viewer should have fewer permissions than admin", async () => {
      const viewerPerms = await getPermissionsForRole("viewer");
      const adminPerms = await getPermissionsForRole("admin");
      expect(viewerPerms.length).toBeLessThan(adminPerms.length);
    });
  });
});
