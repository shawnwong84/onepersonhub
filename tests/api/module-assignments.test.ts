import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createRequest, parseJsonResponse } from "../helpers/request";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/team/members/[id]/modules", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("assigns a known module to a member", async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue({ id: "m1", name: "Jane" });
    mockPrisma.moduleAssignment.upsert.mockResolvedValue({
      id: "a1",
      teamMemberId: "m1",
      moduleSlug: "orders",
      access: "write",
    });
    mockPrisma.activityLog.create.mockResolvedValue({});

    const { POST } = await import("@/app/api/team/members/[id]/modules/route");
    const request = createRequest("/api/team/members/m1/modules", {
      method: "POST",
      body: { moduleSlug: "orders", access: "write" },
    });

    const response = await POST(request, params("m1"));
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(201);
    expect(data.moduleSlug).toBe("orders");
    expect(mockPrisma.moduleAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamMemberId_moduleSlug: { teamMemberId: "m1", moduleSlug: "orders" } },
      })
    );
  });

  it("rejects an unknown module slug", async () => {
    const { POST } = await import("@/app/api/team/members/[id]/modules/route");
    const request = createRequest("/api/team/members/m1/modules", {
      method: "POST",
      body: { moduleSlug: "not-a-module" },
    });

    const response = await POST(request, params("m1"));
    expect(response.status).toBe(400);
  });

  it("defaults invalid access to read", async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue({ id: "m1", name: "Jane" });
    mockPrisma.moduleAssignment.upsert.mockResolvedValue({
      id: "a1",
      teamMemberId: "m1",
      moduleSlug: "orders",
      access: "read",
    });
    mockPrisma.activityLog.create.mockResolvedValue({});

    const { POST } = await import("@/app/api/team/members/[id]/modules/route");
    const request = createRequest("/api/team/members/m1/modules", {
      method: "POST",
      body: { moduleSlug: "orders", access: "superuser" },
    });

    const response = await POST(request, params("m1"));
    expect(response.status).toBe(201);
    expect(mockPrisma.moduleAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ access: "read" }) })
    );
  });

  it("returns 404 when the member does not exist", async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue(null);

    const { POST } = await import("@/app/api/team/members/[id]/modules/route");
    const request = createRequest("/api/team/members/nope/modules", {
      method: "POST",
      body: { moduleSlug: "orders" },
    });

    const response = await POST(request, params("nope"));
    expect(response.status).toBe(404);
  });

  it("revokes an assignment", async () => {
    mockPrisma.teamMember.findUnique.mockResolvedValue({ id: "m1", name: "Jane" });
    mockPrisma.moduleAssignment.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.activityLog.create.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/team/members/[id]/modules/route");
    const request = createRequest("/api/team/members/m1/modules?moduleSlug=orders", {
      method: "DELETE",
    });

    const response = await DELETE(request, params("m1"));
    expect(response.status).toBe(200);
    expect(mockPrisma.moduleAssignment.deleteMany).toHaveBeenCalledWith({
      where: { teamMemberId: "m1", moduleSlug: "orders" },
    });
  });

  it("lists a member's assignments", async () => {
    mockPrisma.moduleAssignment.findMany.mockResolvedValue([
      { id: "a1", teamMemberId: "m1", moduleSlug: "orders", access: "write" },
    ]);

    const { GET } = await import("@/app/api/team/members/[id]/modules/route");
    const request = createRequest("/api/team/members/m1/modules");

    const response = await GET(request, params("m1"));
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.assignments).toHaveLength(1);
  });
});
