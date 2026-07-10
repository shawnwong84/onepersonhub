import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";
import { createRequest, parseJsonResponse } from "../helpers/request";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const mockRequireAuth = vi.mocked(requireAuth);

const account = {
  id: "acct-1",
  channel: "email",
  name: "Support Inbox",
  identifier: "support@example.com",
  status: "connected",
  isActive: true,
  credentials: { smtpUser: "support@example.com", smtpPass: "super-secret-password" },
  settings: {},
  automationMode: "workflow_first",
  defaultAgentId: null,
  metadata: {},
  defaultAgent: null,
  agents: [],
  _count: { conversations: 0, agents: 0 },
};

describe("GET /api/channel-accounts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("strips credentials for a viewer role", async () => {
    mockRequireAuth.mockResolvedValueOnce({
      userId: "viewer-1",
      role: "viewer",
      username: "viewer1",
      name: "Viewer One",
      authMethod: "cookie",
    } as never);
    mockPrisma.channelAccount.findMany.mockResolvedValue([account]);
    mockPrisma.channelAccount.count.mockResolvedValue(1);

    const { GET } = await import("@/app/api/channel-accounts/route");
    const response = await GET(createRequest("/api/channel-accounts"));
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.data[0].credentials).toBeUndefined();
    expect(data.data[0].name).toBe("Support Inbox");
  });

  it("returns credentials for an admin role", async () => {
    mockPrisma.channelAccount.findMany.mockResolvedValue([account]);
    mockPrisma.channelAccount.count.mockResolvedValue(1);

    const { GET } = await import("@/app/api/channel-accounts/route");
    const response = await GET(createRequest("/api/channel-accounts"));
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.data[0].credentials).toEqual(account.credentials);
  });
});

describe("GET /api/channel-accounts/[id]", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("strips credentials for an agent role", async () => {
    mockRequireAuth.mockResolvedValueOnce({
      userId: "agent-1",
      role: "agent",
      username: "agent1",
      name: "Agent One",
      authMethod: "cookie",
    } as never);
    mockPrisma.channelAccount.findUnique.mockResolvedValue(account);

    const { GET } = await import("@/app/api/channel-accounts/[id]/route");
    const response = await GET(createRequest("/api/channel-accounts/acct-1"), {
      params: Promise.resolve({ id: "acct-1" }),
    });
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.credentials).toBeUndefined();
  });

  it("returns credentials for an admin role", async () => {
    mockPrisma.channelAccount.findUnique.mockResolvedValue(account);

    const { GET } = await import("@/app/api/channel-accounts/[id]/route");
    const response = await GET(createRequest("/api/channel-accounts/acct-1"), {
      params: Promise.resolve({ id: "acct-1" }),
    });
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.credentials).toEqual(account.credentials);
  });
});
