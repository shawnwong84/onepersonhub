import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import type { Prisma } from "@/generated/prisma/client";

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

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "channel-accounts:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip, take } = parsePagination(searchParams);
    const channel = searchParams.get("channel");
    const where = channel ? { channel } : {};

    const [accounts, total] = await Promise.all([
      prisma.channelAccount.findMany({
        where,
        include,
        orderBy: [{ channel: "asc" }, { name: "asc" }],
        skip,
        take,
      }),
      prisma.channelAccount.count({ where }),
    ]);

    // Only admin can create/update channel accounts, so only admin needs
    // decrypted credentials back (for the edit-form prefill); other roles
    // that merely have channel-accounts:read must not receive secrets.
    const sanitized =
      auth.role === "admin"
        ? accounts
        : accounts.map((account) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { credentials, ...rest } = account;
            return rest;
          });

    return NextResponse.json(paginatedResponse(sanitized, total, page, limit));
  } catch (error) {
    logger.error("Failed to fetch channel accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch channel accounts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "channel-accounts:create");
  if (!isAuthenticated(auth)) return auth;

  try {
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

    const account = await prisma.channelAccount.create({
      data: {
        companyId: auth.companyId,
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

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    logger.error("Failed to create channel account:", error);
    return NextResponse.json(
      { error: "Failed to create channel account" },
      { status: 500 }
    );
  }
}
