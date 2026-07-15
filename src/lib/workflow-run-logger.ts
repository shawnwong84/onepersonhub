import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { currentCompanyId } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";

type RunStatus =
  | "started"
  | "skipped"
  | "matched"
  | "completed"
  | "waiting_approval"
  | "waiting_delay"
  | "failed";

type StepStatus =
  | "started"
  | "matched"
  | "skipped"
  | "completed"
  | "waiting_approval"
  | "waiting_delay"
  | "failed";

interface StartRunInput {
  flowId?: string | null;
  flowName?: string;
  conversationId?: string | null;
  triggerEvent: string;
  channel: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

interface RecordStepInput {
  nodeId?: string;
  nodeLabel?: string;
  nodeType?: string;
  actionType?: string;
  status: StepStatus;
  message?: string;
  metadata?: Record<string, unknown>;
}

function preview(value: string | undefined) {
  return (value || "").slice(0, 240);
}

export async function startWorkflowRun(input: StartRunInput) {
  try {
    return await prisma.workflowRun.create({
      data: {
        companyId: currentCompanyId(),
        flowId: input.flowId || undefined,
        flowName: input.flowName || "",
        conversationId: input.conversationId || undefined,
        triggerEvent: input.triggerEvent,
        channel: input.channel,
        status: "started",
        messagePreview: preview(input.message),
        metadata: (input.metadata || {}) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    logger.error("Failed to start workflow run:", error);
    return null;
  }
}

export async function recordWorkflowRunStep(
  runId: string | undefined | null,
  input: RecordStepInput
) {
  if (!runId) return null;

  try {
    return await prisma.workflowRunStep.create({
      data: {
        companyId: currentCompanyId(),
        runId,
        nodeId: input.nodeId || "",
        nodeLabel: input.nodeLabel || "",
        nodeType: input.nodeType || "",
        actionType: input.actionType || "",
        status: input.status,
        message: input.message || "",
        metadata: (input.metadata || {}) as Prisma.InputJsonValue,
        endedAt: input.status === "started" ? undefined : new Date(),
      },
    });
  } catch (error) {
    logger.error("Failed to record workflow run step:", error);
    return null;
  }
}

export async function finishWorkflowRun(
  runId: string | undefined | null,
  status: RunStatus,
  reason = "",
  metadata: Record<string, unknown> = {}
) {
  if (!runId) return null;

  try {
    return await prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status,
        reason,
        metadata: metadata as Prisma.InputJsonValue,
        completedAt: ["waiting_approval", "waiting_delay"].includes(status) ? undefined : new Date(),
      },
    });
  } catch (error) {
    logger.error("Failed to finish workflow run:", error);
    return null;
  }
}
