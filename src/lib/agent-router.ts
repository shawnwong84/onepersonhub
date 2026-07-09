import { prisma } from "@/lib/prisma";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";

interface AgentRouteInput {
  channel: string;
  channelAccountIdentifier?: string | null;
}

// Routing decisions are logged once per route/hour so the audit trail shows
// which agent each channel resolves to without flooding on every message.
const routeLogAt = new Map<string, number>();
const ROUTE_LOG_INTERVAL_MS = 60 * 60 * 1000;

function auditRoute(
  channel: string,
  identifier: string | null | undefined,
  accountName: string | null,
  agentName: string | null
) {
  const key = `${channel}:${identifier || "default"}:${agentName || "none"}`;
  const last = routeLogAt.get(key) || 0;
  if (Date.now() - last < ROUTE_LOG_INTERVAL_MS) return;
  routeLogAt.set(key, Date.now());
  logActivity({
    action: "agent.route_resolved",
    entity: ACTIVITY_ENTITIES.AGENT,
    entityId: channel,
    description: `Inbound ${channel}${identifier ? ` (${identifier})` : ""} routes to ${agentName || "no agent"}${accountName ? ` via account ${accountName}` : ""}.`,
    metadata: { channel, identifier: identifier || null, accountName, agentName },
  }).catch(() => {
    // Audit logging never blocks routing.
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function findChannelAgent(channel: string) {
  const agents = await prisma.agent.findMany({
    where: { status: "active" },
    orderBy: { updatedAt: "desc" },
  });

  return agents.find((agent) => asRecord(agent.metadata).channel === channel) || null;
}

export async function resolveAgentRoute(input: AgentRouteInput) {
  const channel = input.channel.toLowerCase();
  const identifier = input.channelAccountIdentifier?.trim();

  const account =
    (identifier
      ? await prisma.channelAccount.findFirst({
          where: {
            channel,
            isActive: true,
            OR: [{ identifier }, { identifier: "default" }],
          },
          include: {
            defaultAgent: true,
            agents: {
              where: { agent: { status: "active" } },
              include: { agent: true },
              orderBy: [{ isPrimary: "desc" }, { priority: "asc" }],
            },
          },
        })
      : null) ||
    (await prisma.channelAccount.findFirst({
      where: { channel, isActive: true },
      include: {
        defaultAgent: true,
        agents: {
          where: { agent: { status: "active" } },
          include: { agent: true },
          orderBy: [{ isPrimary: "desc" }, { priority: "asc" }],
        },
      },
      orderBy: { createdAt: "asc" },
    }));

  if (!account) {
    const channelAgent = await findChannelAgent(channel);
    auditRoute(channel, identifier, null, channelAgent?.name || null);
    return {
      channelAccountId: null,
      agentId: channelAgent?.id || null,
      agent: channelAgent,
      channelAccount: null,
    };
  }

  const assignedAgent =
    account.defaultAgent?.status === "active"
      ? account.defaultAgent
      : account.agents[0]?.agent || await findChannelAgent(channel);

  auditRoute(channel, identifier, account.name, assignedAgent?.name || null);

  return {
    channelAccountId: account.id,
    agentId: assignedAgent?.id || null,
    agent: assignedAgent,
    channelAccount: account,
  };
}
