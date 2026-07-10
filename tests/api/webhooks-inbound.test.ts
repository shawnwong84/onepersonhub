import crypto from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/route-auth";
import { _getStoreForTesting } from "@/lib/rate-limit";
import { createRequest, parseJsonResponse } from "../helpers/request";

const mockPrisma = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const mockRequireAuth = vi.mocked(requireAuth);

const CONVERSATION = {
  id: "conv-1",
  customerId: null,
  agentId: null,
  channelAccountId: null,
};

function apiKeyAuth(overrides: Partial<Parameters<typeof mockRequireAuth.mockResolvedValue>[0]> = {}) {
  return {
    userId: "api-key:key-1",
    role: "admin",
    username: "Integration Key",
    name: "Integration Key",
    authMethod: "api_key" as const,
    ...overrides,
  };
}

describe("POST /api/webhooks/inbound", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _getStoreForTesting().clear();
    delete process.env.WEBHOOK_INBOUND_REQUIRE_SIGNATURE;

    mockRequireAuth.mockResolvedValue(apiKeyAuth());
    mockPrisma.conversation.create.mockResolvedValue(CONVERSATION);
    mockPrisma.conversation.findUnique.mockResolvedValue(CONVERSATION);
    mockPrisma.message.create.mockResolvedValue({ id: "msg-1" });
    mockPrisma.activityLog.create.mockResolvedValue({});
    mockPrisma.flow.findMany.mockResolvedValue([]);
    mockPrisma.agentWorkflow.findMany.mockResolvedValue([]);
  });

  it("accepts a plain request with no signature when signing is not required", async () => {
    const { POST } = await import("@/app/api/webhooks/inbound/route");
    const request = createRequest("/api/webhooks/inbound", {
      method: "POST",
      headers: { "x-api-key": "test-key" },
      body: { message: "hello from an external system" },
    });

    const response = await POST(request);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.conversationId).toBe(CONVERSATION.id);
  });

  it("rejects a request over the body size cap", async () => {
    const { POST } = await import("@/app/api/webhooks/inbound/route");
    const request = createRequest("/api/webhooks/inbound", {
      method: "POST",
      headers: { "x-api-key": "test-key" },
      body: { message: "x".repeat(70_000) },
    });

    const response = await POST(request);
    expect(response.status).toBe(413);
  });

  it("rejects missing message", async () => {
    const { POST } = await import("@/app/api/webhooks/inbound/route");
    const request = createRequest("/api/webhooks/inbound", {
      method: "POST",
      headers: { "x-api-key": "test-key" },
      body: {},
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("enforces the per-caller rate limit", async () => {
    const { POST } = await import("@/app/api/webhooks/inbound/route");

    let lastResponse;
    for (let i = 0; i < 61; i++) {
      const request = createRequest("/api/webhooks/inbound", {
        method: "POST",
        headers: { "x-api-key": "test-key" },
        body: { message: "ping " + i },
      });
      lastResponse = await POST(request);
    }

    expect(lastResponse!.status).toBe(429);
    expect(lastResponse!.headers.get("Retry-After")).toBeTruthy();
  });

  describe("optional HMAC signature verification", () => {
    it("accepts a request with a valid signature", async () => {
      const rawBody = JSON.stringify({ message: "signed message" });
      const signature = "sha256=" + crypto.createHmac("sha256", "test-key").update(rawBody).digest("hex");

      const { POST } = await import("@/app/api/webhooks/inbound/route");
      const request = createRequest("/api/webhooks/inbound", {
        method: "POST",
        headers: { "x-api-key": "test-key", "x-signature-256": signature },
        body: { message: "signed message" },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it("rejects an invalid signature", async () => {
      const { POST } = await import("@/app/api/webhooks/inbound/route");
      const request = createRequest("/api/webhooks/inbound", {
        method: "POST",
        headers: { "x-api-key": "test-key", "x-signature-256": "sha256=deadbeef" },
        body: { message: "tampered or unsigned" },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("requires a signature when WEBHOOK_INBOUND_REQUIRE_SIGNATURE=true", async () => {
      process.env.WEBHOOK_INBOUND_REQUIRE_SIGNATURE = "true";

      const { POST } = await import("@/app/api/webhooks/inbound/route");
      const request = createRequest("/api/webhooks/inbound", {
        method: "POST",
        headers: { "x-api-key": "test-key" },
        body: { message: "no signature attached" },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it("does not require a signature for cookie-authenticated callers even when enforced", async () => {
      process.env.WEBHOOK_INBOUND_REQUIRE_SIGNATURE = "true";
      mockRequireAuth.mockResolvedValue({
        userId: "admin-1",
        role: "admin",
        username: "admin",
        name: "Admin",
        authMethod: "cookie" as const,
      });

      const { POST } = await import("@/app/api/webhooks/inbound/route");
      const request = createRequest("/api/webhooks/inbound", {
        method: "POST",
        body: { message: "from the dashboard, not an integration" },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });
  });
});
