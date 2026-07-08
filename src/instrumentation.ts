export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerShutdownHandlers } = await import("@/lib/shutdown");
    registerShutdownHandlers();

    const { startReporterHeartbeat } = await import("@/lib/reporter-heartbeat");
    startReporterHeartbeat();
  }
}
