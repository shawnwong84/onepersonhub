import { logger } from "@/lib/logger";
import { runChannelWorkflows } from "@/lib/workflow-runtime";

interface ModuleWorkflowEventInput {
  event: "module_record_created" | "module_record_updated" | "module_signal_created" | "reporter_signal_created" | "reporter_report_generated";
  moduleSlug: string;
  moduleName: string;
  conversationId?: string | null;
  customerId?: string | null;
  message: string;
}

export async function dispatchModuleWorkflowEvent(input: ModuleWorkflowEventInput) {
  if (!input.conversationId) return;

  try {
    await runChannelWorkflows({
      channel: "module",
      triggerEvent: input.event,
      conversationId: input.conversationId,
      customerId: input.customerId || null,
      message: input.message,
      saveInputMessage: false,
    });
  } catch (error) {
    logger.error("[Module] Failed to dispatch module workflow event", {
      event: input.event,
      moduleSlug: input.moduleSlug,
      conversationId: input.conversationId,
      error,
    });
  }
}
