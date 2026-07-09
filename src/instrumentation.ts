export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerShutdownHandlers } = await import("@/lib/shutdown");
    registerShutdownHandlers();

    const { startReporterHeartbeat } = await import("@/lib/reporter-heartbeat");
    startReporterHeartbeat();

    const { startWorkflowWorker } = await import("@/lib/workflow-worker");
    startWorkflowWorker();

    const { startWebsiteRecrawlWorker } = await import("@/lib/website-crawler");
    startWebsiteRecrawlWorker();
  }
}
