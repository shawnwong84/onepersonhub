import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const mockSet = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockOn = vi.fn();

vi.mock("redis", () => ({
  createClient: vi.fn(() => ({
    connect: mockConnect,
    set: mockSet,
    on: mockOn,
  })),
}));

describe("acquireWorkerTickLock", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    vi.resetModules();
    mockSet.mockReset();
    mockConnect.mockClear();
  });

  afterAll(() => {
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  });

  it("returns true (single-instance assumption) when REDIS_URL is unset", async () => {
    delete process.env.REDIS_URL;
    const { acquireWorkerTickLock } = await import("@/lib/worker-lock");
    expect(await acquireWorkerTickLock("test-worker", 1000)).toBe(true);
  });

  it("returns true when this call wins the lock (SET NX succeeds)", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    mockSet.mockResolvedValue("OK");
    const { acquireWorkerTickLock } = await import("@/lib/worker-lock");
    expect(await acquireWorkerTickLock("test-worker", 1000)).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(
      "owly:worker-lock:test-worker",
      expect.any(String),
      { NX: true, PX: 1000 }
    );
  });

  it("returns false when another instance already holds the lock (SET NX fails)", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    mockSet.mockResolvedValue(null);
    const { acquireWorkerTickLock } = await import("@/lib/worker-lock");
    expect(await acquireWorkerTickLock("test-worker", 1000)).toBe(false);
  });

  it("fails open (returns true) if the Redis SET call throws", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    mockSet.mockRejectedValue(new Error("connection lost"));
    const { acquireWorkerTickLock } = await import("@/lib/worker-lock");
    expect(await acquireWorkerTickLock("test-worker", 1000)).toBe(true);
  });
});
