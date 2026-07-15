import { describe, it, expect, vi, beforeEach } from "vitest";
import { cookies } from "next/headers";
import { prismaUnscoped } from "@/lib/prisma";
import { TEST_COMPANY_ID } from "../setup";

const mockPrisma = prismaUnscoped as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const mockCookies = vi.mocked(cookies);

function mockAuthCookie(token: string | undefined) {
  mockCookies.mockResolvedValue({
    get: vi.fn().mockReturnValue(token ? { value: token } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  } as never);
}

describe("session invalidation via tokenVersion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a token whose version matches the current admin row", async () => {
    const { generateToken, getCurrentUser } = await import("@/lib/auth");
    const token = generateToken("admin-1", TEST_COMPANY_ID, "admin", "owner", 2);
    mockAuthCookie(token);
    mockPrisma.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      companyId: TEST_COMPANY_ID,
      username: "admin",
      name: "Admin",
      role: "admin",
      tokenVersion: 2,
    });

    const user = await getCurrentUser();
    expect(user).not.toBeNull();
    expect(user?.username).toBe("admin");
  });

  it("rejects a token issued before a password change bumped tokenVersion", async () => {
    const { generateToken, getCurrentUser } = await import("@/lib/auth");
    const token = generateToken("admin-1", TEST_COMPANY_ID, "admin", "owner", 1); // stale version
    mockAuthCookie(token);
    mockPrisma.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      companyId: TEST_COMPANY_ID,
      username: "admin",
      name: "Admin",
      role: "admin",
      tokenVersion: 2, // password was changed since this token was issued
    });

    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it("treats a pre-tokenVersion legacy token (no claim) as version 0", async () => {
    const jwt = await import("jsonwebtoken");
    // Simulate a token signed before tokenVersion existed in the payload.
    const legacyToken = jwt.sign(
      { userId: "admin-1", companyId: TEST_COMPANY_ID, role: "admin", userType: "owner" },
      process.env.JWT_SECRET || "test-only-fallback-secret"
    );
    mockAuthCookie(legacyToken);
    mockPrisma.admin.findUnique.mockResolvedValue({
      id: "admin-1",
      companyId: TEST_COMPANY_ID,
      username: "admin",
      name: "Admin",
      role: "admin",
      tokenVersion: 0,
    });

    const { getCurrentUser } = await import("@/lib/auth");
    const user = await getCurrentUser();
    expect(user).not.toBeNull();
  });

  it("rejects a member session invalidated by a credential reset", async () => {
    const { generateToken, getCurrentUser } = await import("@/lib/auth");
    const token = generateToken("member-1", TEST_COMPANY_ID, "agent", "member", 0);
    mockAuthCookie(token);
    mockPrisma.teamMember.findUnique.mockResolvedValue({
      id: "member-1",
      companyId: TEST_COMPANY_ID,
      username: "jane",
      name: "Jane",
      rbacRole: "agent",
      isActive: true,
      tokenVersion: 1, // credentials were reissued since this token was signed
    });

    const user = await getCurrentUser();
    expect(user).toBeNull();
  });
});
