import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";

// GET /api/nav-counts - small badge counts for the sidebar (pending
// approvals, escalated conversations, open tickets). No specific
// permission required, same as /api/auth's own permission-listing
// endpoint - a bare count isn't a meaningful information leak beyond what
// each linked page already shows, and the sidebar only renders a badge for
// items the user's permissions already make visible.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  try {
    const [approvals, escalatedConversations, openTickets] = await Promise.all([
      prisma.conversation.count({
        where: {
          metadata: {
            path: ["pendingWorkflowApproval", "status"],
            equals: "pending",
          },
        },
      }),
      prisma.conversation.count({ where: { status: "escalated" } }),
      prisma.ticket.count({ where: { status: "open" } }),
    ]);

    return NextResponse.json({ approvals, escalatedConversations, openTickets });
  } catch (error) {
    logger.error("Failed to fetch nav counts:", error);
    return NextResponse.json(
      { error: "Failed to fetch nav counts" },
      { status: 500 }
    );
  }
}
