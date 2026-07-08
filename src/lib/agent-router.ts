import { prisma } from "@/lib/prisma";

interface AgentRouteInput {
  channel: string;
  channelAccountIdentifier?: string | null;
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

  return {
    channelAccountId: account.id,
    agentId: assignedAgent?.id || null,
    agent: assignedAgent,
    channelAccount: account,
  };
}
