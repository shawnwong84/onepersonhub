import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCacheDistributed } from "@/lib/cache";

/**
 * Readiness: can this instance actually serve traffic right now? Checks
 * every dependency this app relies on. Unlike /api/health (liveness), a
 * "not_ready" result here should pull the instance out of a load
 * balancer's rotation, not restart the container.
 */
export async function GET() {
  const checks: Record<string, string> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "connected";
  } catch {
    checks.database = "error";
  }

  // Redis is optional (rate limiting/cache/worker locks fall back to
  // in-memory when absent), so "not_configured" doesn't fail readiness.
  if (process.env.REDIS_URL) {
    checks.redis = (await isCacheDistributed().catch(() => false)) ? "connected" : "error";
  } else {
    checks.redis = "not_configured";
  }

  // MinIO/S3 is required for RAG document/website source storage once
  // configured; a plain unauthenticated hit to its own health endpoint is
  // enough to confirm the service is reachable, no bucket access needed.
  const s3Endpoint = process.env.S3_ENDPOINT;
  if (s3Endpoint) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(new URL("/minio/health/live", s3Endpoint), {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      checks.objectStorage = res.ok ? "connected" : "error";
    } catch {
      checks.objectStorage = "unreachable";
    }
  } else {
    checks.objectStorage = "not_configured";
  }

  const ready = Object.values(checks).every((v) => v === "connected" || v === "not_configured");

  return NextResponse.json(
    { status: ready ? "ready" : "not_ready", services: checks },
    { status: ready ? 200 : 503 }
  );
}
