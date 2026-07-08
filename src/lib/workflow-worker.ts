import { logger } from "@/lib/logger";
import { processDueWorkflowJobs } from "@/lib/workflow-runtime";

const globalForWorker = globalThis as unknown as { workflowWorkerTimer?: NodeJS.Timeout };

/**
 * Production flow execution worker: processes due workflow jobs (delays,
 * approval timeouts) every 30 seconds. Started once from instrumentation.
 */
export function startWorkflowWorker() {
  if (globalForWorker.workflowWorkerTimer) return;
  globalForWorker.workflowWorkerTimer = setInterval(async () => {
    try {
      const result = await processDueWorkflowJobs(20);
      const processed = (result as { processed?: number })?.processed;
      if (processed) {
        logger.info(`Workflow worker processed ${processed} due job(s).`);
      }
    } catch (error) {
      logger.error("Workflow worker failed:", error);
    }
  }, 30 * 1000);
  logger.info("Workflow job worker started.");
}
