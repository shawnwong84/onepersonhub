import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaUnscoped } from "@/lib/prisma";
import { createRequest, parseJsonResponse } from "../helpers/request";
import { fixtures } from "../helpers/fixtures";
import { _getStoreForTesting as getLockoutStore } from "@/lib/login-lockout";

const mockPrisma = prismaUnscoped as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

// Mock auth functions
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getCurrentUser: vi.fn(),
  };
});

describe("POST /api/auth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getLockoutStore().clear();
  });

  describe("login action", () => {
    it("should login with valid credentials", async () => {
      const { hashPassword } = await import("@/lib/auth");
      const hashedPassword = await hashPassword("admin123");

      mockPrisma.admin.findUnique.mockResolvedValue({
        ...fixtures.admin,
        password: hashedPassword,
      });

      const { POST } = await import("@/app/api/auth/route");
      const request = createRequest("/api/auth", {
        method: "POST",
        body: { action: "login", username: "admin", password: "admin123" },
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.user.username).toBe("admin");
    });

    it("should reject invalid password", async () => {
      const { hashPassword } = await import("@/lib/auth");
      const hashedPassword = await hashPassword("correctpass");

      mockPrisma.admin.findUnique.mockResolvedValue({
        ...fixtures.admin,
        password: hashedPassword,
      });

      const { POST } = await import("@/app/api/auth/route");
      const request = createRequest("/api/auth", {
        method: "POST",
        body: { action: "login", username: "admin", password: "wrongpass" },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("should reject nonexistent user", async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null);

      const { POST } = await import("@/app/api/auth/route");
      const request = createRequest("/api/auth", {
        method: "POST",
        body: { action: "login", username: "noone", password: "pass" },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("should lock out after 5 failed attempts for the same username", async () => {
      const { hashPassword } = await import("@/lib/auth");
      const hashedPassword = await hashPassword("correctpass");
      mockPrisma.admin.findUnique.mockResolvedValue({
        ...fixtures.admin,
        password: hashedPassword,
      });

      const { POST } = await import("@/app/api/auth/route");
      const attempt = () =>
        POST(
          createRequest("/api/auth", {
            method: "POST",
            body: { action: "login", username: "admin", password: "wrongpass" },
          })
        );

      for (let i = 0; i < 5; i++) {
        const response = await attempt();
        expect(response.status).toBe(401);
      }

      // 6th attempt is locked out even though it never reaches password verification.
      const locked = await attempt();
      expect(locked.status).toBe(429);
      expect(locked.headers.get("Retry-After")).toBeTruthy();
    });

    it("locking out one username does not affect another", async () => {
      const { hashPassword } = await import("@/lib/auth");
      const hashedPassword = await hashPassword("correctpass");
      mockPrisma.admin.findUnique.mockResolvedValue({
        ...fixtures.admin,
        password: hashedPassword,
      });

      const { POST } = await import("@/app/api/auth/route");
      for (let i = 0; i < 6; i++) {
        await POST(
          createRequest("/api/auth", {
            method: "POST",
            body: { action: "login", username: "admin", password: "wrongpass" },
          })
        );
      }

      const response = await POST(
        createRequest("/api/auth", {
          method: "POST",
          body: { action: "login", username: "someone-else", password: "wrongpass" },
        })
      );
      expect(response.status).toBe(401); // rejected on credentials, not locked out
    });

    it("a successful login clears prior failed attempts", async () => {
      const { hashPassword } = await import("@/lib/auth");
      const hashedPassword = await hashPassword("correctpass");
      mockPrisma.admin.findUnique.mockResolvedValue({
        ...fixtures.admin,
        password: hashedPassword,
      });

      const { POST } = await import("@/app/api/auth/route");
      for (let i = 0; i < 4; i++) {
        await POST(
          createRequest("/api/auth", {
            method: "POST",
            body: { action: "login", username: "admin", password: "wrongpass" },
          })
        );
      }

      const success = await POST(
        createRequest("/api/auth", {
          method: "POST",
          body: { action: "login", username: "admin", password: "correctpass" },
        })
      );
      expect(success.status).toBe(200);

      // Attempts reset: a further wrong password is just a normal 401, not locked.
      const afterSuccess = await POST(
        createRequest("/api/auth", {
          method: "POST",
          body: { action: "login", username: "admin", password: "wrongpass" },
        })
      );
      expect(afterSuccess.status).toBe(401);
    });

    it("should reject missing credentials", async () => {
      const { POST } = await import("@/app/api/auth/route");
      const request = createRequest("/api/auth", {
        method: "POST",
        body: { action: "login", username: "", password: "" },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe("team member login", () => {
    const memberBase = {
      id: "member-1",
      name: "Jane Agent",
      email: "jane@example.com",
      username: "jane",
      rbacRole: "agent",
      isActive: true,
      lastLoginAt: null,
    };

    it("should login an active member with valid credentials", async () => {
      const { hashPassword } = await import("@/lib/auth");
      const hashedPassword = await hashPassword("memberpass1");

      mockPrisma.admin.findUnique.mockResolvedValue(null);
      mockPrisma.teamMember.findUnique.mockResolvedValue({
        ...memberBase,
        password: hashedPassword,
      });
      mockPrisma.teamMember.update.mockResolvedValue(memberBase);

      const { POST } = await import("@/app/api/auth/route");
      const request = createRequest("/api/auth", {
        method: "POST",
        body: { action: "login", username: "jane", password: "memberpass1" },
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.user.userType).toBe("member");
      expect(data.user.role).toBe("agent");
      expect(mockPrisma.teamMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "member-1" },
          data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
        })
      );
    });

    it("should reject a member with a wrong password", async () => {
      const { hashPassword } = await import("@/lib/auth");
      const hashedPassword = await hashPassword("memberpass1");

      mockPrisma.admin.findUnique.mockResolvedValue(null);
      mockPrisma.teamMember.findUnique.mockResolvedValue({
        ...memberBase,
        password: hashedPassword,
      });

      const { POST } = await import("@/app/api/auth/route");
      const request = createRequest("/api/auth", {
        method: "POST",
        body: { action: "login", username: "jane", password: "wrong" },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("should reject a deactivated member even with the right password", async () => {
      const { hashPassword } = await import("@/lib/auth");
      const hashedPassword = await hashPassword("memberpass1");

      mockPrisma.admin.findUnique.mockResolvedValue(null);
      mockPrisma.teamMember.findUnique.mockResolvedValue({
        ...memberBase,
        isActive: false,
        password: hashedPassword,
      });

      const { POST } = await import("@/app/api/auth/route");
      const request = createRequest("/api/auth", {
        method: "POST",
        body: { action: "login", username: "jane", password: "memberpass1" },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("should reject a member with no credentials issued", async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null);
      mockPrisma.teamMember.findUnique.mockResolvedValue({
        ...memberBase,
        password: null,
      });

      const { POST } = await import("@/app/api/auth/route");
      const request = createRequest("/api/auth", {
        method: "POST",
        body: { action: "login", username: "jane", password: "whatever" },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });

  describe("logout action", () => {
    it("should clear auth cookie", async () => {
      const { POST } = await import("@/app/api/auth/route");
      const request = createRequest("/api/auth", {
        method: "POST",
        body: { action: "logout" },
      });

      const response = await POST(request);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe("invalid action", () => {
    it("should reject unknown action", async () => {
      const { POST } = await import("@/app/api/auth/route");
      const request = createRequest("/api/auth", {
        method: "POST",
        body: { action: "invalid" },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });
});

describe("GET /api/auth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return unauthenticated when no session exists", async () => {
    const { getCurrentUser } = await import("@/lib/auth");
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { GET } = await import("@/app/api/auth/route");
    const response = await GET();
    const data = await parseJsonResponse(response);

    expect(data.authenticated).toBe(false);
  });

  it("should return authenticated user", async () => {
    const { getCurrentUser } = await import("@/lib/auth");
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "admin-1",
      companyId: "test-company-id",
      username: "admin",
      name: "Admin",
      role: "admin",
      userType: "owner",
    });

    const { GET } = await import("@/app/api/auth/route");
    const response = await GET();
    const data = await parseJsonResponse(response);

    expect(data.authenticated).toBe(true);
    expect(data.user.username).toBe("admin");
  });
});
