import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockProcessDueWorkflowJobs = vi.fn();
const mockAcquireWorkerTickLock = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/workflow-runtime", () => ({
  processDueWorkflowJobs: mockProcessDueWorkflowJobs,
}));
vi.mock("@/lib/worker-lock", () => ({
  acquireWorkerTickLock: mockAcquireWorkerTickLock,
}));

describe("workflow worker start/stop", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mockProcessDueWorkflowJobs.mockReset();
    mockAcquireWorkerTickLock.mockReset().mockResolvedValue(true);
    (globalThis as unknown as { workflowWorkerTimer?: unknown }).workflowWorkerTimer = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a tick on the configured interval", async () => {
    mockProcessDueWorkflowJobs.mockResolvedValue({ processed: 0 });
    const { startWorkflowWorker, stopWorkflowWorker } = await import("@/lib/workflow-worker");

    startWorkflowWorker();
    expect(mockProcessDueWorkflowJobs).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(mockProcessDueWorkflowJobs).toHaveBeenCalledTimes(1);

    await stopWorkflowWorker();
  });

  it("stops scheduling new ticks after stopWorkflowWorker", async () => {
    mockProcessDueWorkflowJobs.mockResolvedValue({ processed: 0 });
    const { startWorkflowWorker, stopWorkflowWorker } = await import("@/lib/workflow-worker");

    startWorkflowWorker();
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(mockProcessDueWorkflowJobs).toHaveBeenCalledTimes(1);

    await stopWorkflowWorker();
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(mockProcessDueWorkflowJobs).toHaveBeenCalledTimes(1);
  });

  it("does not call processDueWorkflowJobs when the tick lock is not acquired", async () => {
    mockAcquireWorkerTickLock.mockResolvedValue(false);
    const { startWorkflowWorker, stopWorkflowWorker } = await import("@/lib/workflow-worker");

    startWorkflowWorker();
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(mockProcessDueWorkflowJobs).not.toHaveBeenCalled();

    await stopWorkflowWorker();
  });

  it("stopWorkflowWorker awaits a tick already in progress", async () => {
    let resolveTick: () => void = () => {};
    mockProcessDueWorkflowJobs.mockImplementation(
      () => new Promise((resolve) => { resolveTick = () => resolve({ processed: 1 }); })
    );
    const { startWorkflowWorker, stopWorkflowWorker } = await import("@/lib/workflow-worker");

    startWorkflowWorker();
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(mockProcessDueWorkflowJobs).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopPromise = stopWorkflowWorker().then(() => { stopped = true; });

    // The in-flight tick has not resolved yet, so stop must still be pending.
    await Promise.resolve();
    expect(stopped).toBe(false);

    resolveTick();
    await stopPromise;
    expect(stopped).toBe(true);
  });
});
