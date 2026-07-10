import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLogContext, setLogContext, runWithLogContext } from "@/lib/log-context";
import { logger } from "@/lib/logger";

describe("log-context", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined outside any context", () => {
    expect(getLogContext()).toBeUndefined();
  });

  it("runWithLogContext scopes the context to the callback's async chain", async () => {
    let seenInside: unknown;
    await runWithLogContext({ requestId: "req-1" }, async () => {
      seenInside = getLogContext();
    });
    expect(seenInside).toEqual({ requestId: "req-1" });
    expect(getLogContext()).toBeUndefined();
  });

  it("setLogContext applies for the remainder of the current async chain without a wrapper", async () => {
    async function simulateRestOfHandler() {
      return getLogContext();
    }

    async function simulateRequireAuth() {
      setLogContext({ requestId: "req-2" });
    }

    let seen: unknown;
    await runWithLogContext({}, async () => {
      await simulateRequireAuth();
      seen = await simulateRestOfHandler();
    });
    expect(seen).toEqual({ requestId: "req-2" });
  });

  it("logger includes the active requestId in every log line's context", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await runWithLogContext({ requestId: "req-3" }, async () => {
      logger.info("hello");
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"requestId":"req-3"'));
  });

  it("logger merges the active context with any explicit context passed to the call", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await runWithLogContext({ workerRunId: "run-1" }, async () => {
      logger.info("tick done", { processed: 3 });
    });
    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain('"workerRunId":"run-1"');
    expect(line).toContain('"processed":3');
  });
});
