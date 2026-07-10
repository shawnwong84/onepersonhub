import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { parseJsonResponse } from "../helpers/request";

const mockPrisma = prisma as unknown as Record<string, ReturnType<typeof vi.fn>>;

vi.mock("@/lib/cache", () => ({
  isCacheDistributed: vi.fn(),
}));

describe("GET /api/health/ready", () => {
  const originalRedisUrl = process.env.REDIS_URL;
  const originalS3Endpoint = process.env.S3_ENDPOINT;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.REDIS_URL;
    delete process.env.S3_ENDPOINT;
  });

  afterEach(() => {
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
    if (originalS3Endpoint === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = originalS3Endpoint;
  });

  it("is ready when the database is connected and Redis/S3 are not configured", async () => {
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ "?column?": 1 }]);

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.services.database).toBe("connected");
    expect(data.services.redis).toBe("not_configured");
    expect(data.services.objectStorage).toBe("not_configured");
  });

  it("is not_ready (503) when the database is down", async () => {
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Connection refused"));

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(503);
    expect(data.status).toBe("not_ready");
    expect(data.services.database).toBe("error");
  });

  it("checks Redis when REDIS_URL is configured", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ "?column?": 1 }]);
    const { isCacheDistributed } = await import("@/lib/cache");
    vi.mocked(isCacheDistributed).mockResolvedValue(true);

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();
    const data = await parseJsonResponse(response);

    expect(data.services.redis).toBe("connected");
    expect(response.status).toBe(200);
  });

  it("is not_ready when Redis is configured but unreachable", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ "?column?": 1 }]);
    const { isCacheDistributed } = await import("@/lib/cache");
    vi.mocked(isCacheDistributed).mockResolvedValue(false);

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();
    const data = await parseJsonResponse(response);

    expect(data.services.redis).toBe("error");
    expect(response.status).toBe(503);
  });

  it("checks object storage when S3_ENDPOINT is configured", async () => {
    process.env.S3_ENDPOINT = "http://localhost:9000";
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ "?column?": 1 }]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();
    const data = await parseJsonResponse(response);

    expect(data.services.objectStorage).toBe("connected");
    expect(response.status).toBe(200);
  });

  it("is not_ready when object storage is configured but unreachable", async () => {
    process.env.S3_ENDPOINT = "http://localhost:9000";
    (mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ "?column?": 1 }]);
    global.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));

    const { GET } = await import("@/app/api/health/ready/route");
    const response = await GET();
    const data = await parseJsonResponse(response);

    expect(data.services.objectStorage).toBe("unreachable");
    expect(response.status).toBe(503);
  });
});
