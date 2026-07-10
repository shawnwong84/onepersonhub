import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

let isShuttingDown = false;

export function isGracefulShutdown(): boolean {
  return isShuttingDown;
}

// Hard ceiling so a stuck worker or WhatsApp session can't hang shutdown
// forever — after this we disconnect Prisma and exit regardless.
const SHUTDOWN_TIMEOUT_MS = 15 * 1000;

function withTimeout(promise: Promise<unknown>, label: string): Promise<void> {
  return Promise.race([
    promise.then(() => undefined),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.warn(`Graceful shutdown: ${label} did not finish within the timeout, continuing anyway.`);
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);
    }),
  ]);
}

export function registerShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    // Stop scheduling new worker ticks and drain any tick already running,
    // then close every WhatsApp session (default channel + per-account)
    // cleanly so no chromium child process or LocalAuth session file is
    // left in a bad state. Each is individually time-boxed.
    const [{ stopWorkflowWorker }, { stopReporterHeartbeat }, { stopWebsiteRecrawlWorker }] = await Promise.all([
      import("@/lib/workflow-worker"),
      import("@/lib/reporter-heartbeat"),
      import("@/lib/website-crawler"),
    ]);
    const [{ destroyDefaultWhatsAppClient }, { destroyAllWhatsAppAccountClients }] = await Promise.all([
      import("@/lib/channels/whatsapp"),
      import("@/lib/channels/whatsapp-accounts"),
    ]);

    await Promise.all([
      withTimeout(stopWorkflowWorker(), "workflow worker drain"),
      withTimeout(stopReporterHeartbeat(), "reporter heartbeat drain"),
      withTimeout(stopWebsiteRecrawlWorker(), "website recrawl drain"),
    ]);
    logger.info("Workers stopped.");

    await Promise.all([
      withTimeout(destroyDefaultWhatsAppClient(), "default WhatsApp client shutdown"),
      withTimeout(destroyAllWhatsAppAccountClients(), "WhatsApp account clients shutdown"),
    ]);
    logger.info("WhatsApp sessions closed.");

    // Close database connection pool
    try {
      await prisma.$disconnect();
      logger.info("Database connections closed");
    } catch (error) {
      logger.error("Error closing database connections", error);
    }

    logger.info("Graceful shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
