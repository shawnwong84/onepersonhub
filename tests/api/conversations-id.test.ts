import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { applyRoleFixture } from "../setup";
import { requireAuth } from "@/lib/route-auth";
import { createRequest } from "../helpers/request";
import { fixtures } from "../helpers/fixtures";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const mockRequireAuth = vi.mocked(requireAuth);

describe("PUT /api/conversations/[id]", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    applyRoleFixture();
  });

  it("rejects an update from a scoped agent when the conversation is assigned to someone else", async () => {
    mockRequireAuth.mockResolvedValueOnce({
      userId: "agent-1",
      role: "agent",
      username: "agent1",
      name: "Agent One",
      authMethod: "cookie",
    } as never);

    mockPrisma.conversation.findUnique.mockResolvedValue({
      ...fixtures.conversation,
      assignedToId: "agent-2",
    });

    const { PUT } = await import("@/app/api/conversations/[id]/route");
    const request = createRequest("/api/conversations/conv-1", {
      method: "PUT",
      body: { status: "closed" },
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "conv-1" }) });

    expect(response.status).toBe(403);
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });

  it("allows a scoped agent to update a conversation assigned to them", async () => {
    mockRequireAuth.mockResolvedValueOnce({
      userId: "agent-1",
      role: "agent",
      username: "agent1",
      name: "Agent One",
      authMethod: "cookie",
    } as never);

    mockPrisma.conversation.findUnique.mockResolvedValue({
      ...fixtures.conversation,
      assignedToId: "agent-1",
    });
    mockPrisma.conversation.update.mockResolvedValue({
      ...fixtures.conversation,
      assignedToId: "agent-1",
      status: "closed",
      messages: [],
      tags: [],
      _count: { messages: 0 },
    });

    const { PUT } = await import("@/app/api/conversations/[id]/route");
    const request = createRequest("/api/conversations/conv-1", {
      method: "PUT",
      body: { status: "closed" },
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "conv-1" }) });

    expect(response.status).toBe(200);
    expect(mockPrisma.conversation.update).toHaveBeenCalled();
  });

  it("allows an unscoped admin to update any conversation", async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      ...fixtures.conversation,
      assignedToId: "agent-2",
    });
    mockPrisma.conversation.update.mockResolvedValue({
      ...fixtures.conversation,
      assignedToId: "agent-2",
      status: "closed",
      messages: [],
      tags: [],
      _count: { messages: 0 },
    });

    const { PUT } = await import("@/app/api/conversations/[id]/route");
    const request = createRequest("/api/conversations/conv-1", {
      method: "PUT",
      body: { status: "closed" },
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "conv-1" }) });

    expect(response.status).toBe(200);
  });
});
