import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { ACTIVITY_ENTITIES, getActivityRequestContext, logActivity } from "@/lib/activity";

const CHANNEL_TYPES = ["whatsapp", "email", "phone", "sms", "telegram"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getFlowTrigger(flow: { nodes: unknown }) {
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  return nodes.find((node) => {
    const data = asRecord(asRecord(node).data);
    return data.nodeType === "trigger";
  });
}

function getAssignedChannels(flow: { nodes: unknown }) {
  const trigger = getFlowTrigger(flow);
  const data = asRecord(asRecord(trigger).data);
  const configuredChannel = String(data.channel || "");
  const triggerEvent = String(data.triggerEvent || "");

  if (configuredChannel && configuredChannel !== "any") {
    return [configuredChannel];
  }

  const eventChannel = CHANNEL_TYPES.find((type) =>
    triggerEvent.startsWith(`${type}_`)
  );
  if (eventChannel) return [eventChannel];

  if (triggerEvent === "message_received") {
    return ["whatsapp", "email", "sms", "telegram"];
  }

  return [];
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "channels:read");
  if (!isAuthenticated(auth)) return auth;

  try {
    const [channels, channelAccounts, flows] = await Promise.all([
      prisma.channel.findMany({
        orderBy: { type: "asc" },
      }),
      prisma.channelAccount.findMany({
        include: {
          defaultAgent: {
            select: { id: true, name: true, status: true },
          },
          agents: {
            include: {
              agent: {
                select: { id: true, name: true, status: true },
              },
            },
            orderBy: { priority: "asc" },
          },
        },
        orderBy: [{ channel: "asc" }, { name: "asc" }],
      }),
      prisma.flow.findMany({
        where: { isActive: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          triggerCount: true,
          updatedAt: true,
          nodes: true,
        },
      }),
    ]);

    const channelActivity = new Map<
      string,
      { lastInboundAt: Date | null; lastOutboundAt: Date | null }
    >();

    await Promise.all(
      CHANNEL_TYPES.map(async (type) => {
        const [lastInbound, lastOutbound] = await Promise.all([
          prisma.message.findFirst({
            where: {
              role: "customer",
              conversation: { channel: type },
            },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          }),
          prisma.message.findFirst({
            where: {
              role: { in: ["assistant", "admin"] },
              conversation: { channel: type },
            },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          }),
        ]);

        channelActivity.set(type, {
          lastInboundAt: lastInbound?.createdAt || null,
          lastOutboundAt: lastOutbound?.createdAt || null,
        });
      })
    );

    const workflowsByChannel = new Map<
      string,
      {
        id: string;
        name: string;
        triggerCount: number;
        updatedAt: Date;
      }[]
    >();

    for (const flow of flows) {
      const assignedChannels = getAssignedChannels(flow);
      for (const channelType of assignedChannels) {
        const current = workflowsByChannel.get(channelType) || [];
        current.push({
          id: flow.id,
          name: flow.name,
          triggerCount: flow.triggerCount,
          updatedAt: flow.updatedAt,
        });
        workflowsByChannel.set(channelType, current);
      }
    }

    const channelMap = new Map(channels.map((ch) => [ch.type, ch]));
    const accountsByChannel = new Map<
      string,
      typeof channelAccounts
    >();
    for (const account of channelAccounts) {
      const current = accountsByChannel.get(account.channel) || [];
      current.push(account);
      accountsByChannel.set(account.channel, current);
    }

    const result = CHANNEL_TYPES.map((type) => {
      const workflows = workflowsByChannel.get(type) || [];
      const accounts = accountsByChannel.get(type) || [];
      const activity = channelActivity.get(type) || {
        lastInboundAt: null,
        lastOutboundAt: null,
      };
      const existing = channelMap.get(type);
      const workflowSummary = {
        activeCount: workflows.length,
        workflows,
      };
      const accountSummary = {
        total: accounts.length,
        active: accounts.filter((account) => account.isActive).length,
        accounts,
      };
      if (existing) return { ...existing, workflowSummary, accountSummary, activity };
      return {
        id: null,
        type,
        isActive: false,
        config: {},
        status: "disconnected",
        workflowSummary,
        accountSummary,
        activity,
        createdAt: null,
        updatedAt: null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to fetch channels:", error);
    return NextResponse.json(
      { error: "Failed to fetch channels" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "channels:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const { type, isActive, config } = body;

    if (!type || !CHANNEL_TYPES.includes(type)) {
      return NextResponse.json(
        { error: "Invalid channel type. Must be one of: " + CHANNEL_TYPES.join(", ") },
        { status: 400 }
      );
    }

    const channel = await prisma.channel.upsert({
      where: { type },
      update: {
        isActive: typeof isActive === "boolean" ? isActive : undefined,
        config: config ?? undefined,
      },
      create: {
        type,
        isActive: typeof isActive === "boolean" ? isActive : false,
        config: config ?? {},
        status: "disconnected",
      },
    });

    await logActivity({
      action: "channel.updated",
      entity: ACTIVITY_ENTITIES.CHANNEL,
      entityId: channel.id,
      description: `${auth.name || auth.username} updated ${type} channel settings.`,
      userId: auth.userId,
      userName: auth.name || auth.username,
      metadata: { type, isActive: channel.isActive, status: channel.status },
      ...getActivityRequestContext(request),
    });

    return NextResponse.json(channel, { status: 200 });
  } catch (error) {
    logger.error("Failed to save channel:", error);
    return NextResponse.json(
      { error: "Failed to save channel" },
      { status: 500 }
    );
  }
}
