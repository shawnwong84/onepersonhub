import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";

// GET /api/reporter/threads - list the caller's chat threads
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "module:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const threads = await prisma.reporterChatThread.findMany({
      where: { userId: auth.userId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
    });
    return NextResponse.json({ threads });
  } catch (error) {
    logger.error("Failed to fetch reporter threads:", error);
    return NextResponse.json({ error: "Failed to fetch reporter threads" }, { status: 500 });
  }
}
