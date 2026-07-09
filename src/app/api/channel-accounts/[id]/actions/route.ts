import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import {
  connectWhatsAppAccount,
  disconnectWhatsAppAccount,
  getWhatsAppAccountStatus,
} from "@/lib/channels/whatsapp-accounts";

// POST /api/channel-accounts/[id]/actions - connect/disconnect/status per account.
// Currently implemented for WhatsApp accounts (each gets its own session).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "channel-accounts:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "status");

    const account = await prisma.channelAccount.findUnique({ where: { id } });
    if (!account) {
      return NextResponse.json({ error: "Channel account not found" }, { status: 404 });
    }
    if (account.channel !== "whatsapp") {
      return NextResponse.json(
        { error: `Per-account connect is only available for WhatsApp accounts (this is ${account.channel}).` },
        { status: 400 }
      );
    }

    if (action === "connect" || action === "reconnect") {
      if (action === "reconnect") {
        await disconnectWhatsAppAccount(id);
      }
      // Fire and forget: initialization takes time; the UI polls status.
      connectWhatsAppAccount(id).catch((error) =>
        logger.error("WhatsApp account connect failed:", error)
      );
      return NextResponse.json({ started: true, ...getWhatsAppAccountStatus(id) });
    }

    if (action === "disconnect") {
      await disconnectWhatsAppAccount(id);
      return NextResponse.json(getWhatsAppAccountStatus(id));
    }

    if (action === "status") {
      return NextResponse.json(getWhatsAppAccountStatus(id));
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    logger.error("Channel account action failed:", error);
    return NextResponse.json({ error: "Channel account action failed" }, { status: 500 });
  }
}
