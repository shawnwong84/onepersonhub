import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "conversations:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 10), 50);

    const runs = await prisma.workflowRun.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        steps: { orderBy: { createdAt: "asc" } },
        flow: { select: { id: true, name: true, isActive: true } },
      },
    });

    return NextResponse.json({ items: runs });
  } catch (error) {
    logger.error("Failed to fetch conversation workflow runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversation workflow runs" },
      { status: 500 }
    );
  }
}
