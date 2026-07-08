import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  try {
    const [settings, knowledgeCount, activeChannelCount, teamMemberCount] =
      await Promise.all([
        prisma.settings.findUnique({
          where: { id: "default" },
          select: {
            businessName: true,
            aiApiKey: true,
          },
        }),
        prisma.knowledgeEntry.count(),
        prisma.channel.count({ where: { isActive: true } }),
        prisma.teamMember.count(),
      ]);

    return NextResponse.json({
      authenticated: true,
      businessConfigured:
        !!settings?.businessName && settings.businessName !== "My Business",
      aiConfigured: !!settings?.aiApiKey,
      knowledgeEntries: knowledgeCount,
      activeChannels: activeChannelCount,
      teamMembers: teamMemberCount,
    });
  } catch (error) {
    logger.error("Failed to fetch onboarding status:", error);
    return NextResponse.json(
      { error: "Failed to fetch onboarding status" },
      { status: 500 }
    );
  }
}
