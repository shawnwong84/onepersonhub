import { logger } from "@/lib/logger";
import { processDueWorkflowJobs } from "@/lib/workflow-runtime";
import { acquireWorkerTickLock } from "@/lib/worker-lock";

const globalForWorker = globalThis as unknown as {
  workflowWorkerTimer?: NodeJS.Timeout;
  workflowWorkerInFlight?: Promise<void> | null;
};

async function tick() {
  if (!(await acquireWorkerTickLock("workflow-worker", 25 * 1000))) return;
  try {
    const result = await processDueWorkflowJobs(20);
    const processed = (result as { processed?: number })?.processed;
    if (processed) {
      logger.info(`Workflow worker processed ${processed} due job(s).`);
    }
  } catch (error) {
    logger.error("Workflow worker failed:", error);
  }
}

/**
 * Production flow execution worker: processes due workflow jobs (delays,
 * approval timeouts) every 30 seconds. Started once from instrumentation.
 *
 * Job claiming itself is already safe under multiple instances (an atomic
 * `status: "pending"` compare-and-set in processDueWorkflowJobs), so this
 * lock is purely to avoid redundant polling and duplicate approval-timeout
 * side effects (notifications), not to prevent double-execution of jobs.
 */
export function startWorkflowWorker() {
  if (globalForWorker.workflowWorkerTimer) return;
  globalForWorker.workflowWorkerTimer = setInterval(() => {
    globalForWorker.workflowWorkerInFlight = tick().finally(() => {
      globalForWorker.workflowWorkerInFlight = null;
    });
  }, 30 * 1000);
  logger.info("Workflow job worker started.");
}

/** Stops scheduling new ticks and awaits any tick already in progress. */
export async function stopWorkflowWorker(): Promise<void> {
  if (globalForWorker.workflowWorkerTimer) {
    clearInterval(globalForWorker.workflowWorkerTimer);
    globalForWorker.workflowWorkerTimer = undefined;
  }
  await globalForWorker.workflowWorkerInFlight;
}
