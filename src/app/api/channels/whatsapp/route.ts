import { NextResponse } from "next/server";
import {
  getWhatsAppStatus,
  initWhatsApp,
  disconnectWhatsApp,
} from "@/lib/channels/whatsapp";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";

export async function GET() {
  const status = getWhatsAppStatus();
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  if (action === "connect") {
    try {
      await initWhatsApp();
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
      await initWhatsApp();
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

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { isActive, config, status } = body;
    const whatsappConfig = config && typeof config === "object" ? config : {};

    const channel = await prisma.channel.upsert({
      where: { type: "whatsapp" },
      update: {
        isActive: typeof isActive === "boolean" ? isActive : undefined,
        config: whatsappConfig,
        status: status ?? undefined,
      },
      create: {
        type: "whatsapp",
        isActive: typeof isActive === "boolean" ? isActive : false,
        config: whatsappConfig,
        status: status ?? "disconnected",
      },
    });

    await prisma.settings.upsert({
      where: { id: "default" },
      update: {
        whatsappMode: String(whatsappConfig.mode ?? "web"),
        whatsappApiKey: String(whatsappConfig.apiKey ?? ""),
        whatsappPhone: String(whatsappConfig.phoneNumber ?? ""),
      },
      create: {
        id: "default",
        whatsappMode: String(whatsappConfig.mode ?? "web"),
        whatsappApiKey: String(whatsappConfig.apiKey ?? ""),
        whatsappPhone: String(whatsappConfig.phoneNumber ?? ""),
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
