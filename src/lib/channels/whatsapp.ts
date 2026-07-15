import { Client, LocalAuth, Message } from "whatsapp-web.js";
import * as qrcode from "qrcode";
import { prisma } from "@/lib/prisma";
import { currentCompanyId, setCurrentCompany } from "@/lib/tenant-context";
import { chat, createNewConversation } from "@/lib/ai/engine";
import { logger } from "@/lib/logger";
import { resolveCustomer, normalizePhone } from "@/lib/customer-resolver";
import { runChannelWorkflows, type WorkflowRuntimeResult } from "@/lib/workflow-runtime";
import { emitNewMessage } from "@/lib/realtime";
import { getChannelAutomationSettings } from "@/lib/channel-automation";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";

type WhatsAppConnectionStatus =
  | "disconnected"
  | "qr_ready"
  | "connecting"
  | "connected"
  | "error";

interface WhatsAppState {
  client: Client | null;
  initPromise: Promise<void> | null;
  currentQR: string | null;
  connectionStatus: WhatsAppConnectionStatus;
  statusMessage: string;
  processedMessageIds: Set<string>;
  messageHandlerVersion?: number;
  messageHandlerClient?: Client | null;
}

const globalForWhatsApp = globalThis as unknown as {
  owlyWhatsApp?: WhatsAppState;
};

const whatsappState =
  globalForWhatsApp.owlyWhatsApp ??
  (globalForWhatsApp.owlyWhatsApp = {
    client: null,
    initPromise: null,
    currentQR: null,
    connectionStatus: "disconnected",
    statusMessage: "",
    processedMessageIds: new Set<string>(),
    messageHandlerVersion: 0,
    messageHandlerClient: null,
  });

if (!whatsappState.processedMessageIds) {
  whatsappState.processedMessageIds = new Set<string>();
}

const MESSAGE_HANDLER_VERSION = 8;

async function updateWhatsAppChannel(isActive: boolean, status: string) {
  try {
    const companyId = currentCompanyId();
    await prisma.channel.upsert({
      where: { companyId_type: { companyId, type: "whatsapp" } },
      update: { isActive, status },
      create: { companyId, type: "whatsapp", isActive, status },
    });
  } catch (error) {
    logger.error("[WhatsApp] Failed to update channel status:", error);
  }
}

function getWhatsAppErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("The browser is already running")) {
    return "WhatsApp browser profile is already in use. Stop the existing browser process or restart the dev server.";
  }

  return message || "Failed to initialize WhatsApp";
}

export function getWhatsAppStatus() {
  return {
    status: whatsappState.connectionStatus,
    qr: whatsappState.currentQR,
    message: whatsappState.statusMessage,
  };
}

export async function initWhatsApp(companyId: string): Promise<void> {
  setCurrentCompany(companyId);
  if (whatsappState.initPromise) {
    logger.info("[WhatsApp] Client initialization already in progress");
    return whatsappState.initPromise;
  }

  if (whatsappState.client) {
    attachWhatsAppMessageHandlers(whatsappState.client);
    logger.info("[WhatsApp] Client already exists");
    return;
  }

  whatsappState.initPromise = initializeWhatsAppClient().finally(() => {
    whatsappState.initPromise = null;
  });

  return whatsappState.initPromise;
}

function getMessageId(message: Message): string {
  return (
    message.id?._serialized ||
    // Deliberately no Date.now() here: this fallback must produce the same
    // key for the same logical message every time it's called, and a
    // wall-clock read would differ between two near-simultaneous listener
    // invocations for what's actually one message, defeating dedup below.
    `${message.from}:${message.timestamp || 0}:${message.body || ""}`
  );
}

function markMessageProcessing(message: Message): boolean {
  const id = getMessageId(message);
  if (whatsappState.processedMessageIds.has(id)) {
    return false;
  }

  whatsappState.processedMessageIds.add(id);

  if (whatsappState.processedMessageIds.size > 500) {
    const oldest = whatsappState.processedMessageIds.values().next().value;
    if (oldest) whatsappState.processedMessageIds.delete(oldest);
  }

  return true;
}

export interface WhatsAppAccountContext {
  id: string;
  identifier: string;
}

export async function processIncomingMessage(
  message: Message,
  account?: WhatsAppAccountContext
): Promise<void> {
  if (message.fromMe) return;
  if (!markMessageProcessing(message)) return;

  logger.debug("[WhatsApp] Incoming message received", {
    from: message.from,
    hasMedia: message.hasMedia,
    account: account?.identifier,
  });

  const contact = await message.getContact();
  const customerContact = message.from;
  // Most WhatsApp senders don't set a pushname; a raw phone number is a far
  // more useful inbox label than a generic "Unknown" for every such row.
  const customerName = contact.pushname || contact.name || normalizePhone(customerContact) || "Unknown";

  // Resolve customer identity across channels
  const customerId = await resolveCustomer("whatsapp", customerContact, customerName);

  // Find or create conversation. Multi-account: prefer the same account's
  // conversation so parallel numbers keep separate threads per account.
  let conversation = await prisma.conversation.findFirst({
    where: {
      channel: "whatsapp",
      status: { in: ["active", "escalated"] },
      OR: [{ customerId }, { customerContact }],
      ...(account ? { channelAccountId: account.id } : {}),
    },
  });
  if (!conversation && account) {
    conversation = await prisma.conversation.findFirst({
      where: {
        channel: "whatsapp",
        status: { in: ["active", "escalated"] },
        channelAccountId: null,
        OR: [{ customerId }, { customerContact }],
      },
    });
  }

  if (!conversation) {
    conversation = await createNewConversation(
      "whatsapp",
      customerName,
      customerContact,
      customerId
    );
    await logActivity({
      action: "conversation.created_from_whatsapp",
      entity: ACTIVITY_ENTITIES.CONVERSATION,
      entityId: conversation.id,
      description: `Created WhatsApp conversation for ${customerName}.`,
      metadata: {
        channel: "whatsapp",
        customerId,
        customerName,
        customerContact,
      },
    });
    logger.info("[WhatsApp] Created conversation for incoming message", {
      conversationId: conversation.id,
      customerId,
    });
  }

  if (account && conversation.channelAccountId !== account.id) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { channelAccountId: account.id },
    });
  }
  if (account) {
    prisma.channelAccount
      .update({ where: { id: account.id }, data: { lastInboundAt: new Date() } })
      .catch(() => {});
  }

  let messageContent = message.body;

  // Handle media messages
  if (message.hasMedia) {
    const media = await message.downloadMedia();
    if (media) {
      const mediaType = media.mimetype.split("/")[0];
      messageContent = `[${mediaType} attachment: ${media.filename || "media"}] ${message.body || ""}`;

      if (mediaType === "audio") {
        messageContent = `[Voice message received] ${message.body || ""}`;
      }
    }
  }

  if (isHumanTakeover(conversation.metadata)) {
    logger.debug("[WhatsApp] Human takeover active; skipping workflow and AI reply", {
      conversationId: conversation.id,
    });
    await saveIncomingMessageOnly(conversation.id, messageContent);
    await logActivity({
      action: "message.customer_received",
      entity: ACTIVITY_ENTITIES.MESSAGE,
      entityId: conversation.id,
      description: `Received WhatsApp message from ${customerName}; automation skipped because human takeover is active.`,
      metadata: {
        conversationId: conversation.id,
        channel: "whatsapp",
        customerId,
        automationSkipped: true,
        reason: "human_takeover",
      },
    });
    return;
  }

  const automation = await getChannelAutomationSettings("whatsapp");

  if (!automation.isActive || automation.mode === "manual_only") {
    logger.debug("[WhatsApp] Channel automation disabled; saving message only", {
      conversationId: conversation.id,
      mode: automation.mode,
    });
    await saveIncomingMessageOnly(
      conversation.id,
      messageContent,
      !automation.isActive
        ? "WhatsApp channel is disabled"
        : "WhatsApp channel is manual-only"
    );
    await logActivity({
      action: "message.customer_received",
      entity: ACTIVITY_ENTITIES.MESSAGE,
      entityId: conversation.id,
      description: `Received WhatsApp message from ${customerName}; automation skipped.`,
      metadata: {
        conversationId: conversation.id,
        channel: "whatsapp",
        customerId,
        automationSkipped: true,
        mode: automation.mode,
        isActive: automation.isActive,
      },
    });
    return;
  }

  let workflowResult: WorkflowRuntimeResult = {
    handled: false,
    replies: [] as string[],
    reason: "Workflow skipped by channel automation mode",
    checkedFlows: 0,
  };

  if (automation.mode === "workflow_first" || automation.mode === "approval_required") {
    workflowResult = await runChannelWorkflows({
      channel: "whatsapp",
      triggerEvent: "whatsapp_message",
      conversationId: conversation.id,
      customerId,
      agentId: conversation.agentId,
      channelAccountId: conversation.channelAccountId,
      message: messageContent,
    });

    if (workflowResult.handled) {
      for (const reply of workflowResult.replies) {
        await message.reply(reply);
      }
      await logActivity({
        action: "message.customer_received",
        entity: ACTIVITY_ENTITIES.MESSAGE,
        entityId: conversation.id,
        description: `Received WhatsApp message from ${customerName}; workflow handled it.`,
        metadata: {
          conversationId: conversation.id,
          channel: "whatsapp",
          customerId,
          workflowHandled: true,
          flowId: workflowResult.flowId || null,
          flowName: workflowResult.flowName || null,
          pendingApproval: workflowResult.pendingApproval || false,
          pendingDelay: workflowResult.pendingDelay || false,
        },
      });
      return;
    }
  }

  if (automation.fallback === "no_reply") {
    await saveIncomingMessageOnly(
      conversation.id,
      messageContent,
      "Channel fallback is no reply"
    );
    await logActivity({
      action: "message.customer_received",
      entity: ACTIVITY_ENTITIES.MESSAGE,
      entityId: conversation.id,
      description: `Received WhatsApp message from ${customerName}; no reply fallback was used.`,
      metadata: {
        conversationId: conversation.id,
        channel: "whatsapp",
        customerId,
        automationSkipped: true,
        reason: "no_reply_fallback",
      },
    });
    return;
  }

  // Get AI response. chat() also persists customer and assistant messages.
  const aiResponse = await chat(conversation.id, messageContent, {
    workflowChecked: true,
    workflowMatch: false,
    workflowReason: workflowResult.reason || "No workflow matched",
    workflowCheckedFlows: workflowResult.checkedFlows || 0,
  });

  // Send response back via WhatsApp
  await message.reply(aiResponse);
  await logActivity({
    action: "message.customer_received",
    entity: ACTIVITY_ENTITIES.MESSAGE,
    entityId: conversation.id,
    description: `Received WhatsApp message from ${customerName}.`,
    metadata: {
      conversationId: conversation.id,
      channel: "whatsapp",
      customerId,
      workflowHandled: workflowResult.handled,
      fallback: automation.fallback,
    },
  });
}

function attachWhatsAppMessageHandlers(client: Client) {
  if (
    whatsappState.messageHandlerVersion === MESSAGE_HANDLER_VERSION &&
    whatsappState.messageHandlerClient === client
  ) {
    return;
  }

  client.removeAllListeners("message");
  client.removeAllListeners("message_create");

  // "message" alone is the correct, purpose-built event for incoming
  // messages. "message_create" fires for every message in a chat -
  // incoming AND outgoing - so wiring it to the same pipeline double-fired
  // the whole conversation-creation + AI-reply flow for every real incoming
  // message (confirmed: one customer message produced multiple duplicate
  // conversations and replies). Do not re-add it.
  client.on("message", async (message: Message) => {
    try {
      await processIncomingMessage(message);
    } catch (error) {
      logger.error("[WhatsApp] Failed to process message:", error);
    }
  });

  whatsappState.messageHandlerVersion = MESSAGE_HANDLER_VERSION;
  whatsappState.messageHandlerClient = client;
}

function isHumanTakeover(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  const data = metadata as Record<string, unknown>;
  return data.humanTakeover === true || data.automationPaused === true;
}

async function saveIncomingMessageOnly(
  conversationId: string,
  content: string,
  reason = "Human takeover is active"
) {
  const saved = await prisma.message.create({
    data: {
      companyId: currentCompanyId(),
      conversationId,
      role: "customer",
      content,
      toolCalls: {
        source: "customer",
        automationSkipped: true,
        reason,
      },
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  emitNewMessage(conversationId, {
    id: saved.id,
    role: saved.role,
    content: saved.content,
    source: "customer",
    createdAt: saved.createdAt.toISOString(),
  });
}

async function initializeWhatsAppClient(): Promise<void> {
  whatsappState.connectionStatus = "connecting";
  whatsappState.statusMessage = "Initializing WhatsApp client...";

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });

  client.on("qr", async (qr: string) => {
    try {
      logger.info("[WhatsApp] QR code received");
      whatsappState.currentQR = await qrcode.toDataURL(qr);
      whatsappState.connectionStatus = "qr_ready";
      whatsappState.statusMessage = "Scan the QR code with WhatsApp on your phone";
    } catch (error) {
      logger.error("[WhatsApp] Failed to generate QR code:", error);
      whatsappState.connectionStatus = "error";
      whatsappState.statusMessage = "Failed to generate WhatsApp QR code";
    }
  });

  client.on("ready", async () => {
    logger.info("[WhatsApp] Client is ready");
    whatsappState.currentQR = null;
    whatsappState.connectionStatus = "connected";
    whatsappState.statusMessage = "Connected to WhatsApp";

    await updateWhatsAppChannel(true, "connected");
    await logActivity({
      action: "channel.whatsapp_connected",
      entity: ACTIVITY_ENTITIES.CHANNEL,
      description: "WhatsApp Web connected.",
      metadata: {
        channel: "whatsapp",
        status: "connected",
      },
    });
  });

  client.on("authenticated", () => {
    logger.info("[WhatsApp] Authenticated");
    whatsappState.connectionStatus = "connecting";
    whatsappState.statusMessage = "Authenticated, loading chats...";
  });

  client.on("auth_failure", (message: string) => {
    logger.error(`[WhatsApp] Auth failure: ${message}`);
    whatsappState.connectionStatus = "error";
    whatsappState.statusMessage = `Authentication failed: ${message}`;
    void updateWhatsAppChannel(false, "auth_failure");
  });

  client.on("disconnected", async (reason: string) => {
    logger.info(`[WhatsApp] Disconnected: ${reason}`);
    whatsappState.connectionStatus = "disconnected";
    whatsappState.statusMessage = `Disconnected: ${reason}`;
    whatsappState.currentQR = null;

    if (whatsappState.client === client) {
      whatsappState.client = null;
      whatsappState.messageHandlerClient = null;
    }

    await updateWhatsAppChannel(false, "disconnected");
  });

  attachWhatsAppMessageHandlers(client);

  whatsappState.client = client;

  try {
    await client.initialize();
  } catch (error) {
    if (whatsappState.client === client) {
      whatsappState.client = null;
    }

    whatsappState.connectionStatus = "error";
    whatsappState.statusMessage = getWhatsAppErrorMessage(error);

    try {
      await client.destroy();
    } catch (destroyError) {
      logger.error("[WhatsApp] Failed to clean up after initialization error:", destroyError);
    }

    throw error;
  }
}

export async function disconnectWhatsApp(): Promise<void> {
  const client = whatsappState.client;

  whatsappState.client = null;
  whatsappState.messageHandlerClient = null;
  whatsappState.currentQR = null;
  whatsappState.connectionStatus = "disconnected";
  whatsappState.statusMessage = "Disconnected";

  if (client) {
    try {
      await client.destroy();
    } catch (error) {
      logger.error("[WhatsApp] Failed to destroy client:", error);
    }
  }

  await updateWhatsAppChannel(false, "disconnected");
}

/**
 * Destroys the default client's underlying puppeteer session without the DB
 * write disconnectWhatsApp does — used on process shutdown (a restart, not a
 * deliberate disconnect) so the session closes cleanly without lingering
 * chromium child processes or a mid-write LocalAuth session file.
 */
export async function destroyDefaultWhatsAppClient(): Promise<void> {
  const client = whatsappState.client;
  whatsappState.client = null;
  whatsappState.messageHandlerClient = null;

  if (client) {
    try {
      await client.destroy();
    } catch (error) {
      logger.error("[WhatsApp] Failed to destroy client during shutdown:", error);
    }
  }
}

export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<boolean> {
  if (!whatsappState.client) {
    return false;
  }

  if (whatsappState.connectionStatus !== "connected") {
    try {
      const state = await whatsappState.client.getState();
      if (String(state).toUpperCase() !== "CONNECTED") {
        return false;
      }

      whatsappState.connectionStatus = "connected";
      whatsappState.statusMessage = "Connected to WhatsApp";
      await updateWhatsAppChannel(true, "connected");
    } catch (error) {
      logger.error("[WhatsApp] Failed to verify client state before sending:", error);
      return false;
    }
  }

  const chatId = to.includes("@") ? to : `${to}@c.us`;
  const sentMessage = await whatsappState.client.sendMessage(chatId, message);
  return Boolean(sentMessage);
}
