import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import {
  connectWhatsAppAccount,
  disconnectWhatsAppAccount,
  getWhatsAppAccountStatus,
} from "@/lib/channels/whatsapp-accounts";
import {
  connectEmailAccount,
  disconnectEmailAccount,
  getEmailAccountStatus,
} from "@/lib/channels/email-accounts";

// POST /api/channel-accounts/[id]/actions - connect/disconnect/status per account.
// Implemented for WhatsApp (own browser session) and email (own IMAP listener).
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
    if (account.channel !== "whatsapp" && account.channel !== "email") {
      return NextResponse.json(
        { error: `Per-account connect is only available for WhatsApp and email accounts (this is ${account.channel}).` },
        { status: 400 }
      );
    }
    if (account.identifier === "default") {
      return NextResponse.json(
        {
          error:
            "This is the primary connection's bookkeeping record. Connect or disconnect it from the Primary card on the Channels page instead.",
        },
        { status: 400 }
      );
    }

    const isEmail = account.channel === "email";
    const connectAccount = isEmail ? connectEmailAccount : connectWhatsAppAccount;
    const disconnectAccount = isEmail ? disconnectEmailAccount : disconnectWhatsAppAccount;
    const getStatus = isEmail ? getEmailAccountStatus : getWhatsAppAccountStatus;

    if (action === "connect" || action === "reconnect") {
      if (action === "reconnect") {
        await disconnectAccount(id);
      }
      // Fire and forget: initialization takes time; the UI polls status.
      connectAccount(id).catch((error) =>
        logger.error(`${isEmail ? "Email" : "WhatsApp"} account connect failed:`, error)
      );
      return NextResponse.json({ started: true, ...getStatus(id) });
    }

    if (action === "disconnect") {
      await disconnectAccount(id);
      return NextResponse.json(getStatus(id));
    }

    if (action === "status") {
      return NextResponse.json(getStatus(id));
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    logger.error("Channel account action failed:", error);
    return NextResponse.json({ error: "Channel account action failed" }, { status: 500 });
  }
}
