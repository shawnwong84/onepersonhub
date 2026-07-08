import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { runReporterAgentScan } from "@/lib/reporter-agent";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "module:write");
  if (!isAuthenticated(auth)) return auth;

  try {
    const result = await runReporterAgentScan(auth.name || auth.username || "Reporter Agent");
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    logger.error("Failed to run Reporter Agent scan:", error);
    return NextResponse.json({ error: "Failed to run Reporter Agent scan" }, { status: 500 });
  }
}
