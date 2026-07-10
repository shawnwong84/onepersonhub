import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseJsonResponse } from "../helpers/request";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("always returns ok, independent of any downstream dependency", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.uptime).toBeDefined();
    expect(data.memory).toBeDefined();
    expect(data.environment).toBeDefined();
    expect(data.services).toBeUndefined();
  });
});
