import { prisma } from "@/lib/prisma";

export type ChannelAutomationMode =
  | "manual_only"
  | "workflow_first"
  | "ai_first"
  | "approval_required";

export interface ChannelAutomationSettings {
  isActive: boolean;
  mode: ChannelAutomationMode;
  fallback: "ai_reply" | "no_reply" | "human_takeover";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function getChannelAutomationSettings(
  channelType: string
): Promise<ChannelAutomationSettings> {
  const channel = await prisma.channel.findUnique({
    where: { type: channelType },
    select: { isActive: true, config: true },
  });

  const config = asRecord(channel?.config);
  const mode = String(config.automationMode || "workflow_first");
  const fallback = String(config.automationFallback || "ai_reply");

  return {
    isActive: channel?.isActive ?? true,
    mode: ["manual_only", "workflow_first", "ai_first", "approval_required"].includes(mode)
      ? (mode as ChannelAutomationMode)
      : "workflow_first",
    fallback: ["ai_reply", "no_reply", "human_takeover"].includes(fallback)
      ? (fallback as ChannelAutomationSettings["fallback"])
      : "ai_reply",
  };
}
