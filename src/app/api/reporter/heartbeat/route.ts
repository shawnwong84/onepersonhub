import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { runReporterHeartbeat } from "@/lib/reporter-heartbeat";

// POST /api/reporter/heartbeat - trigger a heartbeat immediately (admin)
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "marketplace:manage");
  if (!isAuthenticated(auth)) return auth;

  try {
    const result = await runReporterHeartbeat(true);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Manual heartbeat failed:", error);
    return NextResponse.json({ error: "Heartbeat failed" }, { status: 500 });
  }
}
