import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { applyRoleFixture } from "../setup";
import { requireAuth } from "@/lib/route-auth";
import { createRequest } from "../helpers/request";
import { fixtures } from "../helpers/fixtures";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const mockRequireAuth = vi.mocked(requireAuth);

describe("PUT /api/tickets/[id]", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    applyRoleFixture();
  });

  it("rejects an update from a scoped agent when the ticket is assigned to someone else", async () => {
    mockRequireAuth.mockResolvedValueOnce({
      userId: "agent-1",
      role: "agent",
      username: "agent1",
      name: "Agent One",
      authMethod: "cookie",
    } as never);

    mockPrisma.ticket.findUnique.mockResolvedValue({
      ...fixtures.ticket,
      assignedToId: "agent-2",
    });

    const { PUT } = await import("@/app/api/tickets/[id]/route");
    const request = createRequest("/api/tickets/ticket-1", {
      method: "PUT",
      body: { status: "closed" },
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ticket-1" }) });

    expect(response.status).toBe(403);
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it("allows a scoped agent to update a ticket assigned to them", async () => {
    mockRequireAuth.mockResolvedValueOnce({
      userId: "agent-1",
      role: "agent",
      username: "agent1",
      name: "Agent One",
      authMethod: "cookie",
    } as never);

    mockPrisma.ticket.findUnique.mockResolvedValue({
      ...fixtures.ticket,
      assignedToId: "agent-1",
    });
    mockPrisma.ticket.update.mockResolvedValue({
      ...fixtures.ticket,
      assignedToId: "agent-1",
      status: "resolved",
      conversation: null,
      department: { id: "dept-1", name: "Support" },
      assignedTo: { id: "agent-1", name: "Agent One", email: "agent1@example.com" },
    });

    const { PUT } = await import("@/app/api/tickets/[id]/route");
    const request = createRequest("/api/tickets/ticket-1", {
      method: "PUT",
      body: { status: "resolved" },
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ticket-1" }) });

    expect(response.status).toBe(200);
    expect(mockPrisma.ticket.update).toHaveBeenCalled();
  });

  it("allows an unscoped admin to update any ticket", async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue({
      ...fixtures.ticket,
      assignedToId: "agent-2",
    });
    mockPrisma.ticket.update.mockResolvedValue({
      ...fixtures.ticket,
      assignedToId: "agent-2",
      status: "resolved",
      conversation: null,
      department: { id: "dept-1", name: "Support" },
      assignedTo: { id: "agent-2", name: "Agent Two", email: "agent2@example.com" },
    });

    const { PUT } = await import("@/app/api/tickets/[id]/route");
    const request = createRequest("/api/tickets/ticket-1", {
      method: "PUT",
      body: { status: "resolved" },
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ticket-1" }) });

    expect(response.status).toBe(200);
  });
});
