import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  canAccessModule,
  conversationScope,
  getAccessibleModuleSlugs,
  isUnscoped,
  ticketScope,
} from "@/lib/rbac-scope";
import { CORE_MODULE_SLUGS, MARKETPLACE_MODULES } from "@/lib/marketplace/catalog";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

const owner = { userId: "owner-1", role: "admin", userType: "owner" as const };
const supervisor = { userId: "sup-1", role: "supervisor", userType: "member" as const };
const agent = { userId: "agent-1", role: "agent", userType: "member" as const };
const viewer = { userId: "viewer-1", role: "viewer", userType: "member" as const };

describe("rbac-scope", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("isUnscoped", () => {
    it("owner, supervisor, and admin members are unscoped", () => {
      expect(isUnscoped(owner)).toBe(true);
      expect(isUnscoped(supervisor)).toBe(true);
      expect(isUnscoped({ ...agent, role: "admin" })).toBe(true);
    });

    it("agents and viewers are scoped", () => {
      expect(isUnscoped(agent)).toBe(false);
      expect(isUnscoped(viewer)).toBe(false);
    });
  });

  describe("getAccessibleModuleSlugs", () => {
    it("returns every module for unscoped users", async () => {
      const slugs = await getAccessibleModuleSlugs(owner);
      expect(slugs).toHaveLength(MARKETPLACE_MODULES.length);
    });

    it("returns assigned plus core modules for agents", async () => {
      mockPrisma.moduleAssignment.findMany.mockResolvedValue([{ moduleSlug: "orders" }]);
      const slugs = await getAccessibleModuleSlugs(agent);
      expect(slugs).toContain("orders");
      for (const core of CORE_MODULE_SLUGS) {
        expect(slugs).toContain(core);
      }
      expect(slugs).not.toContain("finance-billing");
    });
  });

  describe("canAccessModule", () => {
    it("unscoped users can read and write everything", async () => {
      expect(await canAccessModule(owner, "finance-billing", "write")).toBe(true);
      expect(await canAccessModule(supervisor, "orders", "write")).toBe(true);
    });

    it("agents can read assigned modules", async () => {
      mockPrisma.moduleAssignment.findUnique.mockResolvedValue({ access: "read" });
      expect(await canAccessModule(agent, "orders", "read")).toBe(true);
    });

    it("read assignment does not grant write", async () => {
      mockPrisma.moduleAssignment.findUnique.mockResolvedValue({ access: "read" });
      expect(await canAccessModule(agent, "orders", "write")).toBe(false);
    });

    it("write assignment grants write", async () => {
      mockPrisma.moduleAssignment.findUnique.mockResolvedValue({ access: "write" });
      expect(await canAccessModule(agent, "orders", "write")).toBe(true);
    });

    it("unassigned non-core modules are not readable", async () => {
      mockPrisma.moduleAssignment.findUnique.mockResolvedValue(null);
      expect(await canAccessModule(agent, "finance-billing", "read")).toBe(false);
    });

    it("core modules are readable without an assignment but not writable", async () => {
      mockPrisma.moduleAssignment.findUnique.mockResolvedValue(null);
      expect(await canAccessModule(agent, CORE_MODULE_SLUGS[0], "read")).toBe(true);
      expect(await canAccessModule(agent, CORE_MODULE_SLUGS[0], "write")).toBe(false);
    });
  });

  describe("conversation and ticket scope", () => {
    it("returns empty filter for unscoped users", () => {
      expect(conversationScope(owner)).toEqual({});
      expect(ticketScope(supervisor)).toEqual({});
    });

    it("filters by assignedToId for scoped users", () => {
      expect(conversationScope(agent)).toEqual({ assignedToId: "agent-1" });
      expect(ticketScope(viewer)).toEqual({ assignedToId: "viewer-1" });
    });
  });
});
