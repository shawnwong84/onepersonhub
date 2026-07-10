import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createRequest, parseJsonResponse } from "../helpers/request";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

describe("GET /api/flows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("orders flows by priority ascending, then createdAt descending", async () => {
    mockPrisma.flow.findMany.mockResolvedValue([]);
    mockPrisma.flow.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/flows/route");
    await GET(createRequest("/api/flows"));

    expect(mockPrisma.flow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      })
    );
  });
});

describe("POST /api/flows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("assigns a new flow the next priority after the current lowest (runs last by default)", async () => {
    mockPrisma.flow.findFirst.mockResolvedValue({ priority: 4 });
    mockPrisma.flow.create.mockResolvedValue({ id: "flow-new", name: "New Flow", priority: 5 });

    const { POST } = await import("@/app/api/flows/route");
    const response = await POST(
      createRequest("/api/flows", { method: "POST", body: { name: "New Flow" } })
    );
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(201);
    expect(mockPrisma.flow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { priority: "desc" } })
    );
    expect(mockPrisma.flow.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority: 5 }) })
    );
    expect(data.priority).toBe(5);
  });

  it("assigns priority 0 to the very first flow when none exist yet", async () => {
    mockPrisma.flow.findFirst.mockResolvedValue(null);
    mockPrisma.flow.create.mockResolvedValue({ id: "flow-first", name: "First Flow", priority: 0 });

    const { POST } = await import("@/app/api/flows/route");
    await POST(createRequest("/api/flows", { method: "POST", body: { name: "First Flow" } }));

    expect(mockPrisma.flow.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority: 0 }) })
    );
  });
});

describe("PUT /api/flows/[id]", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updates priority when provided", async () => {
    mockPrisma.flow.findUnique.mockResolvedValue({ id: "flow-1", name: "Flow", priority: 2 });
    mockPrisma.flow.update.mockResolvedValue({ id: "flow-1", name: "Flow", priority: 7 });

    const { PUT } = await import("@/app/api/flows/[id]/route");
    const response = await PUT(
      createRequest("/api/flows/flow-1", { method: "PUT", body: { priority: 7 } }),
      { params: Promise.resolve({ id: "flow-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.flow.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority: 7 }) })
    );
  });

  it("rejects a non-numeric priority", async () => {
    const { PUT } = await import("@/app/api/flows/[id]/route");
    const response = await PUT(
      createRequest("/api/flows/flow-1", { method: "PUT", body: { priority: "high" } }),
      { params: Promise.resolve({ id: "flow-1" }) }
    );
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/priority/i);
  });
});
