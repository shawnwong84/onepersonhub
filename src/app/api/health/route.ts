import { NextResponse } from "next/server";

const startTime = Date.now();

/**
 * Liveness: is this process itself running and responsive? Deliberately
 * checks no downstream dependency (DB, Redis, S3) — a container
 * orchestrator restarting this process would not fix a database outage, it
 * would just add churn on top of it. See /api/health/ready for the
 * dependency-aware readiness check.
 */
export async function GET() {
  const uptimeMs = Date.now() - startTime;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;

  const mem = process.memoryUsage();

  return NextResponse.json({
    status: "ok",
    version: process.env.npm_package_version || "0.1.1",
    environment: process.env.NODE_ENV || "development",
    uptime: `${hours}h ${minutes}m ${seconds}s`,
    memory: {
      rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
      heap: `${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
    },
  });
}
