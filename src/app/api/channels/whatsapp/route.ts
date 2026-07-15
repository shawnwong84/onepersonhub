import { NextRequest, NextResponse } from "next/server";
import {
  getWhatsAppStatus,
  initWhatsApp,
  disconnectWhatsApp,
} from "@/lib/channels/whatsapp";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "channels:read");
  if (!isAuthenticated(auth)) return auth;

  const status = getWhatsAppStatus();
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "channels:update");
  if (!isAuthenticated(auth)) return auth;

  const body = await request.json();
  const { action } = body;

  if (action === "connect") {
    try {
      await initWhatsApp(auth.companyId);
      // Wait a moment for QR to generate
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const status = getWhatsAppStatus();
      await logActivity({
        action: "channel.whatsapp_qr_requested",
        entity: ACTIVITY_ENTITIES.CHANNEL,
        description: "WhatsApp connection started and QR/status requested.",
        metadata: { status },
      });
      return NextResponse.json(status);
    } catch (error) {
      logger.error("[WhatsApp] Failed to connect:", error);
      const status = getWhatsAppStatus();
      await logActivity({
        action: "channel.whatsapp_connect_failed",
        entity: ACTIVITY_ENTITIES.CHANNEL,
        description: `WhatsApp connection failed: ${error instanceof Error ? error.message : String(error)}`,
        metadata: { status },
      });
      return NextResponse.json(status, { status: 409 });
    }
  }

  if (action === "disconnect") {
    try {
      await disconnectWhatsApp();
      await logActivity({
        action: "channel.whatsapp_disconnected",
        entity: ACTIVITY_ENTITIES.CHANNEL,
        description: "WhatsApp disconnected.",
        metadata: { channel: "whatsapp" },
      });
      return NextResponse.json({ status: "disconnected" });
    } catch (error) {
      logger.error("[WhatsApp] Failed to disconnect:", error);
      return NextResponse.json(getWhatsAppStatus(), { status: 500 });
    }
  }

  if (action === "reconnect") {
    try {
      await disconnectWhatsApp();
      await initWhatsApp(auth.companyId);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const status = getWhatsAppStatus();
      await logActivity({
        action: "channel.whatsapp_reconnected",
        entity: ACTIVITY_ENTITIES.CHANNEL,
        description: "WhatsApp reconnect requested.",
        metadata: { status },
      });
      return NextResponse.json(status);
    } catch (error) {
      logger.error("[WhatsApp] Failed to reconnect:", error);
      return NextResponse.json(getWhatsAppStatus(), { status: 409 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request, "channels:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { isActive, config, status } = body;
    const whatsappConfig = config && typeof config === "object" ? config : {};

    const channel = await prisma.channel.upsert({
      where: { companyId_type: { companyId: auth.companyId, type: "whatsapp" } },
      update: {
        isActive: typeof isActive === "boolean" ? isActive : undefined,
        config: whatsappConfig,
        status: status ?? undefined,
      },
      create: {
        companyId: auth.companyId,
        type: "whatsapp",
        isActive: typeof isActive === "boolean" ? isActive : false,
        config: whatsappConfig,
        status: status ?? "disconnected",
      },
    });

    await prisma.settings.upsert({
      where: { companyId: auth.companyId },
      update: {
        whatsappMode: String(whatsappConfig.mode ?? "web"),
        whatsappApiKey: String(whatsappConfig.apiKey ?? ""),
        whatsappPhone: String(whatsappConfig.phoneNumber ?? ""),
      },
      create: {
        companyId: auth.companyId,
        whatsappMode: String(whatsappConfig.mode ?? "web"),
        whatsappApiKey: String(whatsappConfig.apiKey ?? ""),
        whatsappPhone: String(whatsappConfig.phoneNumber ?? ""),
      },
    });

    // Keep a "default" ChannelAccount row in sync with the primary
    // connection so account-based routing (resolveAgentRoute's `identifier:
    // "default"` fallback) has a real row to match — every connection is
    // account-based, the primary one is just the account named "default".
    await prisma.channelAccount.upsert({
      where: { channel_identifier: { channel: "whatsapp", identifier: "default" } },
      update: {
        name: "Primary WhatsApp",
        isActive: channel.isActive,
        status: channel.status,
      },
      create: {
        companyId: auth.companyId,
        channel: "whatsapp",
        identifier: "default",
        name: "Primary WhatsApp",
        isActive: channel.isActive,
        status: channel.status,
      },
    });

    await logActivity({
      action: "channel.whatsapp_settings_updated",
      entity: ACTIVITY_ENTITIES.CHANNEL,
      entityId: channel.id,
      description: "WhatsApp channel settings updated.",
      metadata: {
        isActive: channel.isActive,
        status: channel.status,
        mode: String(whatsappConfig.mode ?? "web"),
      },
    });

    return NextResponse.json(channel);
  } catch (error) {
    logger.error("Failed to update WhatsApp channel:", error);
    return NextResponse.json(
      { error: "Failed to update WhatsApp channel" },
      { status: 500 }
    );
  }
}
