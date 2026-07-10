export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateStartupEnv } = await import("@/lib/env-validation");
    const { logger } = await import("@/lib/logger");
    try {
      await validateStartupEnv();
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    const { registerShutdownHandlers } = await import("@/lib/shutdown");
    registerShutdownHandlers();

    const { startReporterHeartbeat } = await import("@/lib/reporter-heartbeat");
    startReporterHeartbeat();

    const { startWorkflowWorker } = await import("@/lib/workflow-worker");
    startWorkflowWorker();

    const { startWebsiteRecrawlWorker } = await import("@/lib/website-crawler");
    startWebsiteRecrawlWorker();

    const { startAllEmailAccountListeners } = await import("@/lib/channels/email-accounts");
    startAllEmailAccountListeners().catch((error) =>
      logger.error("Failed to start email account listeners:", error)
    );
  }
}
