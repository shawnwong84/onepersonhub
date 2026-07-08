import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { answerReporterQuestion } from "@/lib/reporter-chat";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

// POST /api/reporter/chat - ask the Reporter Agent a question
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "module:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const threadId = typeof body.threadId === "string" ? body.threadId : null;

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: "message is too long (max 2000 characters)" }, { status: 400 });
    }

    const result = await answerReporterQuestion(auth, auth.name || auth.username, message, threadId);

    await logActivity({
      action: "reporter.chat_answered",
      entity: ACTIVITY_ENTITIES.AGENT,
      entityId: result.threadId,
      description: `Reporter Agent answered a question from ${auth.name || auth.username}.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: {
        refused: result.refused,
        citations: result.citations.length,
      },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Reporter chat failed:", error);
    return NextResponse.json({ error: "Reporter chat failed" }, { status: 500 });
  }
}
