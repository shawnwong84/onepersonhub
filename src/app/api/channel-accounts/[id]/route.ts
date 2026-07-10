import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import type { Prisma } from "@/generated/prisma/client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const CHANNEL_TYPES = ["whatsapp", "email", "phone", "sms", "telegram"];

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function asJsonObject(value: unknown): Prisma.InputJsonValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.InputJsonValue)
    : {};
}

const include = {
  defaultAgent: {
    select: { id: true, name: true, status: true },
  },
  agents: {
    include: {
      agent: {
        select: { id: true, name: true, status: true, automationMode: true },
      },
    },
    orderBy: { priority: "asc" as const },
  },
  _count: {
    select: { conversations: true, agents: true },
  },
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request, "channel-accounts:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await context.params;
    const account = await prisma.channelAccount.findUnique({
      where: { id },
      include,
    });

    if (!account) {
      return NextResponse.json(
        { error: "Channel account not found" },
        { status: 404 }
      );
    }

    // Only admin can create/update channel accounts, so only admin needs
    // decrypted credentials back (for the edit-form prefill); other roles
    // that merely have channel-accounts:read must not receive secrets.
    if (auth.role !== "admin") {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { credentials, ...rest } = account;
      return NextResponse.json(rest);
    }

    return NextResponse.json(account);
  } catch (error) {
    logger.error("Failed to fetch channel account:", error);
    return NextResponse.json(
      { error: "Failed to fetch channel account" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request, "channel-accounts:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const channel = asString(body.channel).toLowerCase();
    const name = asString(body.name);
    const identifier = asString(body.identifier);

    if (!CHANNEL_TYPES.includes(channel)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    if (!name || !identifier) {
      return NextResponse.json(
        { error: "Channel account name and identifier are required" },
        { status: 400 }
      );
    }

    const account = await prisma.channelAccount.update({
      where: { id },
      data: {
        channel,
        name,
        identifier,
        status: asString(body.status, "disconnected") || "disconnected",
        isActive: asBoolean(body.isActive, true),
        credentials: asJsonObject(body.credentials),
        settings: asJsonObject(body.settings),
        automationMode:
          asString(body.automationMode, "workflow_first") || "workflow_first",
        defaultAgentId: asString(body.defaultAgentId) || null,
        metadata: asJsonObject(body.metadata),
      },
      include,
    });

    return NextResponse.json(account);
  } catch (error) {
    logger.error("Failed to update channel account:", error);
    return NextResponse.json(
      { error: "Failed to update channel account" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request, "channel-accounts:delete");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { id } = await context.params;
    await prisma.channelAccount.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete channel account:", error);
    return NextResponse.json(
      { error: "Failed to delete channel account" },
      { status: 500 }
    );
  }
}
