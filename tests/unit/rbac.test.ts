import { describe, it, expect } from "vitest";
import { hasPermission, isRoleUnscoped, getPermissionsForRole } from "@/lib/rbac";
import { TEST_COMPANY_ID } from "../setup";

describe("RBAC System", () => {
  describe("hasPermission", () => {
    it("admin should have all permissions", async () => {
      expect(await hasPermission(TEST_COMPANY_ID, "admin", "settings:read")).toBe(true);
      expect(await hasPermission(TEST_COMPANY_ID, "admin", "settings:update")).toBe(true);
      expect(await hasPermission(TEST_COMPANY_ID, "admin", "admin:delete")).toBe(true);
      expect(await hasPermission(TEST_COMPANY_ID, "admin", "conversations:read")).toBe(true);
    });

    it("viewer should only have read permissions", async () => {
      expect(await hasPermission(TEST_COMPANY_ID, "viewer", "conversations:read")).toBe(true);
      expect(await hasPermission(TEST_COMPANY_ID, "viewer", "conversations:create")).toBe(false);
      expect(await hasPermission(TEST_COMPANY_ID, "viewer", "settings:read")).toBe(false);
    });

    it("agent should have create/update but not delete on most resources", async () => {
      expect(await hasPermission(TEST_COMPANY_ID, "agent", "conversations:create")).toBe(true);
      expect(await hasPermission(TEST_COMPANY_ID, "agent", "conversations:update")).toBe(true);
      expect(await hasPermission(TEST_COMPANY_ID, "agent", "conversations:delete")).toBe(false);
      expect(await hasPermission(TEST_COMPANY_ID, "agent", "tickets:create")).toBe(true);
      expect(await hasPermission(TEST_COMPANY_ID, "agent", "knowledge:create")).toBe(false);
    });

    it("supervisor can manage conversations/tickets but not admin-level config", async () => {
      // Default policy: only admin touches admin-level configuration:
      // non-admin roles (including supervisor) default to
      // conversations/tickets/reporter only, editable per-role afterward.
      expect(await hasPermission(TEST_COMPANY_ID, "supervisor", "conversations:delete")).toBe(true);
      expect(await hasPermission(TEST_COMPANY_ID, "supervisor", "tickets:delete")).toBe(true);
      expect(await hasPermission(TEST_COMPANY_ID, "supervisor", "knowledge:create")).toBe(false);
      expect(await hasPermission(TEST_COMPANY_ID, "supervisor", "webhooks:read")).toBe(false);
      expect(await hasPermission(TEST_COMPANY_ID, "supervisor", "admin:create")).toBe(false);
      expect(await hasPermission(TEST_COMPANY_ID, "supervisor", "settings:update")).toBe(false);
    });

    it("should return false for invalid role", async () => {
      expect(await hasPermission(TEST_COMPANY_ID, "hacker", "conversations:read")).toBe(false);
    });

    it("should return false for invalid permission", async () => {
      expect(await hasPermission(TEST_COMPANY_ID, "admin", "nonexistent:read" as never)).toBe(false);
    });
  });

  describe("isRoleUnscoped", () => {
    it("supervisor and admin are unscoped", async () => {
      expect(await isRoleUnscoped(TEST_COMPANY_ID, "supervisor")).toBe(true);
      expect(await isRoleUnscoped(TEST_COMPANY_ID, "admin")).toBe(true);
    });

    it("viewer and agent are scoped", async () => {
      expect(await isRoleUnscoped(TEST_COMPANY_ID, "viewer")).toBe(false);
      expect(await isRoleUnscoped(TEST_COMPANY_ID, "agent")).toBe(false);
    });

    it("unknown role is scoped by default", async () => {
      expect(await isRoleUnscoped(TEST_COMPANY_ID, "unknown")).toBe(false);
    });
  });

  describe("getPermissionsForRole", () => {
    it("should return permissions array for a role", async () => {
      const adminPerms = await getPermissionsForRole(TEST_COMPANY_ID, "admin");
      expect(adminPerms.length).toBeGreaterThan(20);
      expect(adminPerms).toContain("settings:update");
    });

    it("viewer should have fewer permissions than admin", async () => {
      const viewerPerms = await getPermissionsForRole(TEST_COMPANY_ID, "viewer");
      const adminPerms = await getPermissionsForRole(TEST_COMPANY_ID, "admin");
      expect(viewerPerms.length).toBeLessThan(adminPerms.length);
    });
  });
});
