import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { processDueWorkflowJobs } from "@/lib/workflow-runtime";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "automation:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(50, Math.max(1, Number(body.limit || 10)));
    const result = await processDueWorkflowJobs(limit);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to process workflow jobs:", error);
    return NextResponse.json(
      { error: "Failed to process workflow jobs" },
      { status: 500 }
    );
  }
}
