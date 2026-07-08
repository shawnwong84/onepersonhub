import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

// GET /api/reporter/threads/[id]/messages - messages of one of the caller's threads
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "module:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const thread = await prisma.reporterChatThread.findFirst({
      where: { id, userId: auth.userId },
    });
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const messages = await prisma.reporterChatMessage.findMany({
      where: { threadId: id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return NextResponse.json({ thread, messages });
  } catch (error) {
    logger.error("Failed to fetch reporter messages:", error);
    return NextResponse.json({ error: "Failed to fetch reporter messages" }, { status: 500 });
  }
}
