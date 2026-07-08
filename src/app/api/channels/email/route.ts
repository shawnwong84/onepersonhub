import { NextResponse } from "next/server";
import {
  startEmailListener,
  stopEmailListener,
  getEmailStatus,
  testEmailConnection,
} from "@/lib/channels/email";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";

export async function GET() {
  const status = getEmailStatus();
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  if (action === "connect") {
    await startEmailListener();
    const status = getEmailStatus();
    await logActivity({
      action: "channel.email_listener_started",
      entity: ACTIVITY_ENTITIES.CHANNEL,
      description: "Email listener started.",
      metadata: { status },
    });
    return NextResponse.json(status);
  }

  if (action === "disconnect") {
    await stopEmailListener();
    await logActivity({
      action: "channel.email_disconnected",
      entity: ACTIVITY_ENTITIES.CHANNEL,
      description: "Email listener stopped.",
      metadata: { channel: "email" },
    });
    return NextResponse.json({ status: "disconnected" });
  }

  if (action === "test") {
    const result = await testEmailConnection();
    if (!result.ok) {
      await prisma.channel.upsert({
        where: { type: "email" },
        update: { status: "disconnected" },
        create: {
          type: "email",
          isActive: false,
          config: {},
          status: "disconnected",
        },
      });
      await logActivity({
        action: "channel.email_test_failed",
        entity: ACTIVITY_ENTITIES.CHANNEL,
        description: `Email settings test failed: ${result.message}`,
        metadata: { result },
      });
      return NextResponse.json(result, { status: 400 });
    }

    try {
      await startEmailListener();
    } catch (error) {
      logger.error("Email test passed but listener failed to start:", error);
      await prisma.channel.upsert({
        where: { type: "email" },
        update: { status: "disconnected" },
        create: {
          type: "email",
          isActive: false,
          config: {},
          status: "disconnected",
        },
      });

      return NextResponse.json(
        {
          ...result,
          ok: false,
          message: `SMTP and IMAP test passed, but the email listener failed to start: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
        { status: 500 }
      );
    }

    const channel = await prisma.channel.upsert({
      where: { type: "email" },
      update: { isActive: true, status: "connected" },
      create: {
        type: "email",
        isActive: true,
        config: {},
        status: "connected",
      },
    });

    await logActivity({
      action: "channel.email_test_passed",
      entity: ACTIVITY_ENTITIES.CHANNEL,
      entityId: channel.id,
      description: "Email SMTP and IMAP connection tests passed.",
      metadata: { result },
    });

    return NextResponse.json({ ...channel, ...result });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { isActive, config, status } = body;
    const emailConfig = config && typeof config === "object" ? config : {};

    const nextStatus =
      typeof isActive === "boolean" && !isActive
        ? "disconnected"
        : status ?? undefined;

    const channel = await prisma.channel.upsert({
      where: { type: "email" },
      update: {
        isActive: typeof isActive === "boolean" ? isActive : undefined,
        config: emailConfig,
        status: nextStatus,
      },
      create: {
        type: "email",
        isActive: typeof isActive === "boolean" ? isActive : false,
        config: emailConfig,
        status: status ?? "disconnected",
      },
    });

    await prisma.settings.upsert({
      where: { id: "default" },
      update: {
        smtpHost: String(emailConfig.smtpHost ?? ""),
        smtpPort: parseInt(String(emailConfig.smtpPort ?? "587"), 10) || 587,
        smtpUser: String(emailConfig.smtpUser ?? ""),
        smtpPass: String(emailConfig.smtpPass ?? ""),
        smtpFrom: String(emailConfig.smtpFrom ?? ""),
        imapHost: String(emailConfig.imapHost ?? ""),
        imapPort: parseInt(String(emailConfig.imapPort ?? "993"), 10) || 993,
        imapUser: String(emailConfig.imapUser ?? ""),
        imapPass: String(emailConfig.imapPass ?? ""),
      },
      create: {
        id: "default",
        smtpHost: String(emailConfig.smtpHost ?? ""),
        smtpPort: parseInt(String(emailConfig.smtpPort ?? "587"), 10) || 587,
        smtpUser: String(emailConfig.smtpUser ?? ""),
        smtpPass: String(emailConfig.smtpPass ?? ""),
        smtpFrom: String(emailConfig.smtpFrom ?? ""),
        imapHost: String(emailConfig.imapHost ?? ""),
        imapPort: parseInt(String(emailConfig.imapPort ?? "993"), 10) || 993,
        imapUser: String(emailConfig.imapUser ?? ""),
        imapPass: String(emailConfig.imapPass ?? ""),
      },
    });

    if (isActive === true) {
      try {
        await startEmailListener();
        await prisma.channel.update({
          where: { type: "email" },
          data: { status: "connected" },
        });
        channel.status = "connected";
      } catch (error) {
        logger.error("Failed to start email listener after saving settings:", error);
        await prisma.channel.update({
          where: { type: "email" },
          data: { status: "disconnected" },
        });
        channel.status = "disconnected";
      }
    } else if (isActive === false) {
      await stopEmailListener();
    }

    await logActivity({
      action: "channel.email_settings_updated",
      entity: ACTIVITY_ENTITIES.CHANNEL,
      entityId: channel.id,
      description: "Email channel settings updated.",
      metadata: {
        isActive: channel.isActive,
        status: channel.status,
        smtpHost: String(emailConfig.smtpHost ?? ""),
        imapHost: String(emailConfig.imapHost ?? ""),
      },
    });

    return NextResponse.json(channel);
  } catch (error) {
    logger.error("Failed to update email channel:", error);
    return NextResponse.json(
      { error: "Failed to update email channel" },
      { status: 500 }
    );
  }
}
