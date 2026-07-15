import Imap from "imap";
import { simpleParser, ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { currentCompanyId, setCurrentCompany } from "@/lib/tenant-context";
import { chat, createNewConversation } from "@/lib/ai/engine";
import { escapeHtml, sanitizeEmailSubject } from "@/lib/security";
import { logger } from "@/lib/logger";
import { resolveCustomer } from "@/lib/customer-resolver";
import { emitNewMessage } from "@/lib/realtime";
import { getChannelAutomationSettings } from "@/lib/channel-automation";
import { runChannelWorkflows, type WorkflowRuntimeResult } from "@/lib/workflow-runtime";
import { resolveAgentRoute } from "@/lib/agent-router";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";

const EMAIL_REPLY_COOLDOWN_MS = 30 * 60 * 1000;

export interface EmailConfig {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
}

export interface EmailAccountContext {
  id: string;
  identifier: string;
  defaultAgentId?: string | null;
}

let imapConnection: Imap | null = null;
let isListening = false;
let listenerStartPromise: Promise<void> | null = null;

async function getEmailConfig(): Promise<EmailConfig | null> {
  const settings = await prisma.settings.findFirst();
  if (!settings?.imapHost || !settings?.smtpHost) return null;

  return {
    imapHost: settings.imapHost,
    imapPort: settings.imapPort,
    imapUser: settings.imapUser,
    imapPass: settings.imapPass,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpUser: settings.smtpUser,
    smtpPass: settings.smtpPass,
    smtpFrom: settings.smtpFrom || settings.smtpUser,
  };
}

function createImapConnection(config: EmailConfig): Imap {
  return new Imap({
    user: config.imapUser,
    password: config.imapPass,
    host: config.imapHost,
    port: config.imapPort,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  });
}

function getSmtpTransporter(config: EmailConfig) {
  const allowSelfSigned =
    process.env.NODE_ENV !== "production" ||
    process.env.EMAIL_ALLOW_SELF_SIGNED_CERTS === "true";

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
    tls: {
      rejectUnauthorized: !allowSelfSigned,
    },
  });
}

function getHeaderValue(parsed: ParsedMail, key: string) {
  const value = parsed.headers.get(key.toLowerCase());
  if (Array.isArray(value)) return value.join(" ");
  if (value instanceof Date) return value.toISOString();
  return value ? String(value) : "";
}

function isLikelyBulkEmail(parsed: ParsedMail) {
  const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase() || "";
  const subject = (parsed.subject || "").toLowerCase();
  const autoSubmitted = getHeaderValue(parsed, "auto-submitted").toLowerCase();
  const precedence = getHeaderValue(parsed, "precedence").toLowerCase();
  const listUnsubscribe = getHeaderValue(parsed, "list-unsubscribe");
  const listId = getHeaderValue(parsed, "list-id");
  const xSpamFlag = getHeaderValue(parsed, "x-spam-flag").toLowerCase();

  return Boolean(
    listUnsubscribe ||
      listId ||
      autoSubmitted.includes("auto") ||
      ["bulk", "list", "junk"].includes(precedence) ||
      xSpamFlag === "yes" ||
      fromAddress.includes("no-reply") ||
      fromAddress.includes("noreply") ||
      subject.includes("newsletter") ||
      subject.includes("unsubscribe")
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getEmailThreadId(parsed: ParsedMail) {
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : parsed.references
      ? [parsed.references]
      : [];

  return (
    references[0] ||
    parsed.inReplyTo ||
    parsed.messageId ||
    `${parsed.from?.value?.[0]?.address || "unknown"}:${parsed.subject || "no-subject"}`
  );
}

function shouldSuppressAutoReply(metadata: unknown, threadId: string) {
  const email = asRecord(asRecord(metadata).email);
  const lastAutoReplyAt =
    typeof email.lastAutoReplyAt === "string"
      ? new Date(email.lastAutoReplyAt).getTime()
      : 0;
  const lastThreadId =
    typeof email.lastAutoReplyThreadId === "string"
      ? email.lastAutoReplyThreadId
      : "";

  if (!lastAutoReplyAt) return false;

  const isSameThread = lastThreadId && lastThreadId === threadId;
  const isCooldownActive = Date.now() - lastAutoReplyAt < EMAIL_REPLY_COOLDOWN_MS;
  return isSameThread || isCooldownActive;
}

function getAssignedAgentChannel(agent: { metadata?: unknown } | null | undefined) {
  const channel = asRecord(agent?.metadata).channel;
  return typeof channel === "string" ? channel : "";
}

async function markEmailAutoReplied(
  conversationId: string,
  metadata: unknown,
  threadId: string,
  source: "workflow" | "ai"
) {
  const current = asRecord(metadata);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      metadata: {
        ...current,
        email: {
          ...asRecord(current.email),
          lastAutoReplyAt: new Date().toISOString(),
          lastAutoReplyThreadId: threadId,
          lastAutoReplySource: source,
        },
      },
    },
  });
}

async function saveIncomingEmailOnly(
  conversationId: string,
  content: string,
  reason: string
) {
  const saved = await prisma.message.create({
    data: {
      companyId: currentCompanyId(),
      conversationId,
      role: "customer",
      content,
      toolCalls: {
        source: "email",
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
    source: "email",
    createdAt: saved.createdAt.toISOString(),
  });
}

async function logIncomingEmailActivity(input: {
  conversationId: string;
  customerId?: string | null;
  fromAddress: string;
  fromName: string;
  reason?: string;
  workflowResult?: WorkflowRuntimeResult;
  handledBy: "workflow" | "ai" | "skipped";
}) {
  await logActivity({
    action: "message.customer_received",
    entity: ACTIVITY_ENTITIES.MESSAGE,
    entityId: input.conversationId,
    description:
      input.handledBy === "workflow"
        ? `Received email from ${input.fromName}; workflow handled it.`
        : input.handledBy === "ai"
          ? `Received email from ${input.fromName}; AI fallback replied.`
          : `Received email from ${input.fromName}; automation skipped.`,
    metadata: {
      conversationId: input.conversationId,
      channel: "email",
      customerId: input.customerId || null,
      fromAddress: input.fromAddress,
      workflowHandled: input.workflowResult?.handled || false,
      flowId: input.workflowResult?.flowId || null,
      flowName: input.workflowResult?.flowName || null,
      pendingApproval: input.workflowResult?.pendingApproval || false,
      pendingDelay: input.workflowResult?.pendingDelay || false,
      reason: input.reason || input.workflowResult?.reason || null,
      handledBy: input.handledBy,
    },
  });
}

export async function processEmail(
  parsed: ParsedMail,
  config: EmailConfig,
  account?: EmailAccountContext
) {
  const fromAddress = parsed.from?.value?.[0]?.address;
  const fromName =
    parsed.from?.value?.[0]?.name || fromAddress || "Unknown";
  const subject = parsed.subject || "No Subject";
  const textBody = parsed.text || "";

  if (!fromAddress) return;

  // Resolve customer identity across channels
  const customerId = await resolveCustomer("email", fromAddress, fromName);

  // Find or create conversation. Multi-account: prefer the same account's
  // conversation so parallel inboxes keep separate threads per account.
  let conversation = await prisma.conversation.findFirst({
    where: {
      channel: "email",
      status: { in: ["active", "escalated"] },
      OR: [{ customerId }, { customerContact: fromAddress }],
      ...(account ? { channelAccountId: account.id } : {}),
    },
    include: {
      agent: { select: { id: true, name: true, automationMode: true, metadata: true } },
    },
  });
  if (!conversation && account) {
    conversation = await prisma.conversation.findFirst({
      where: {
        channel: "email",
        status: { in: ["active", "escalated"] },
        channelAccountId: null,
        OR: [{ customerId }, { customerContact: fromAddress }],
      },
      include: {
        agent: { select: { id: true, name: true, automationMode: true, metadata: true } },
      },
    });
  }

  if (!conversation) {
    const created = await createNewConversation(
      "email",
      fromName,
      fromAddress,
      customerId
    );
    conversation = await prisma.conversation.findUnique({
      where: { id: created.id },
      include: {
        agent: { select: { id: true, name: true, automationMode: true, metadata: true } },
      },
    });
    await logActivity({
      action: "conversation.created_from_email",
      entity: ACTIVITY_ENTITIES.CONVERSATION,
      entityId: created.id,
      description: `Created Email conversation for ${fromName}.`,
      metadata: {
        channel: "email",
        customerId,
        customerName: fromName,
        customerContact: fromAddress,
      },
    });
  }

  if (account && conversation && conversation.channelAccountId !== account.id) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { channelAccountId: account.id },
      include: {
        agent: { select: { id: true, name: true, automationMode: true, metadata: true } },
      },
    });
  }
  if (account) {
    prisma.channelAccount
      .update({ where: { id: account.id }, data: { lastInboundAt: new Date() } })
      .catch(() => {});
  }

  if (conversation && (!conversation.agentId || getAssignedAgentChannel(conversation.agent) !== "email")) {
    // A known receiving account already tells us which mailbox/agent this
    // is for; only fall back to the sender-address heuristic when we don't
    // have that context (the single default-inbox listener).
    const route = account?.defaultAgentId
      ? { agentId: account.defaultAgentId, channelAccountId: account.id, agent: null as { name: string; automationMode: string } | null }
      : await resolveAgentRoute({
          channel: "email",
          channelAccountIdentifier: fromAddress,
        });

    if (route.agentId) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          agentId: route.agentId,
          ...(route.channelAccountId && { channelAccountId: route.channelAccountId }),
          metadata: {
            ...(conversation.metadata && typeof conversation.metadata === "object"
              ? conversation.metadata
              : {}),
            ...(route.agent && {
              agentName: route.agent.name,
              agentAutomationMode: route.agent.automationMode,
            }),
          },
        },
        include: {
          agent: { select: { id: true, name: true, automationMode: true, metadata: true } },
        },
      });
    }
  }

  if (!conversation) {
    logger.error("[Email] Conversation was not available after create/route", {
      fromAddress,
      customerId,
    });
    return;
  }

  const threadId = getEmailThreadId(parsed);
  const messageContent = `Subject: ${subject}\n\n${textBody}`;

  if (isLikelyBulkEmail(parsed)) {
    const reason = "Email auto-reply skipped because the message looks like bulk, spam, newsletter, or no-reply mail";
    await saveIncomingEmailOnly(
      conversation.id,
      messageContent,
      reason
    );
    await logIncomingEmailActivity({
      conversationId: conversation.id,
      customerId,
      fromAddress,
      fromName,
      reason,
      handledBy: "skipped",
    });
    return;
  }

  const automation = await getChannelAutomationSettings("email");

  if (!automation.isActive || automation.mode === "manual_only") {
    logger.debug("[Email] Channel automation disabled; saving message only", {
      conversationId: conversation.id,
      mode: automation.mode,
    });
    await saveIncomingEmailOnly(
      conversation.id,
      messageContent,
      !automation.isActive
        ? "Email channel is disabled"
        : "Email channel is manual-only"
    );
    await logIncomingEmailActivity({
      conversationId: conversation.id,
      customerId,
      fromAddress,
      fromName,
      reason: !automation.isActive ? "Email channel is disabled" : "Email channel is manual-only",
      handledBy: "skipped",
    });
    return;
  }

  if (shouldSuppressAutoReply(conversation.metadata, threadId)) {
    const reason = "Email auto-reply skipped because this thread was already replied to recently";
    await saveIncomingEmailOnly(
      conversation.id,
      messageContent,
      reason
    );
    await logActivity({
      action: "ai.reply_skipped_by_cooldown",
      entity: ACTIVITY_ENTITIES.CONVERSATION,
      entityId: conversation.id,
      description: reason,
      metadata: {
        channel: "email",
        customerId,
        fromAddress,
        fromName,
        threadId,
      },
    });
    await logIncomingEmailActivity({
      conversationId: conversation.id,
      customerId,
      fromAddress,
      fromName,
      reason,
      handledBy: "skipped",
    });
    return;
  }

  let workflowResult: WorkflowRuntimeResult = {
    handled: false,
    replies: [],
    reason: "Workflow skipped by channel automation mode",
    checkedFlows: 0,
  };

  if (automation.mode === "workflow_first" || automation.mode === "approval_required") {
    workflowResult = await runChannelWorkflows({
      channel: "email",
      triggerEvent: "email_message",
      conversationId: conversation.id,
      customerId,
      agentId: conversation.agentId,
      channelAccountId: conversation.channelAccountId,
      message: messageContent,
    });

    if (workflowResult.handled) {
      if (workflowResult.replies.length > 0) {
        await markEmailAutoReplied(
          conversation.id,
          conversation.metadata,
          threadId,
          "workflow"
        );
      }
      await logIncomingEmailActivity({
        conversationId: conversation.id,
        customerId,
        fromAddress,
        fromName,
        workflowResult,
        handledBy: "workflow",
      });
      return;
    }
  }

  if (automation.fallback === "no_reply" || automation.fallback === "human_takeover") {
    const reason = `Email channel fallback is ${automation.fallback}`;
    await saveIncomingEmailOnly(
      conversation.id,
      messageContent,
      reason
    );
    await logIncomingEmailActivity({
      conversationId: conversation.id,
      customerId,
      fromAddress,
      fromName,
      reason,
      workflowResult,
      handledBy: "skipped",
    });
    return;
  }

  const aiResponse = await chat(conversation.id, messageContent, {
    workflowChecked: true,
    workflowMatch: false,
    workflowReason: workflowResult.reason || "No workflow matched",
    workflowCheckedFlows: workflowResult.checkedFlows || 0,
  });

  const branding = await getEmailBranding();
  const transporter = getSmtpTransporter(config);
  await transporter.sendMail({
    from: config.smtpFrom,
    to: fromAddress,
    subject: sanitizeEmailSubject(`Re: ${subject}`),
    text: aiResponse,
    html: buildEmailHtml(aiResponse, branding),
    inReplyTo: parsed.messageId,
    references: parsed.messageId,
  });

  await markEmailAutoReplied(conversation.id, conversation.metadata, threadId, "ai");
  await logIncomingEmailActivity({
    conversationId: conversation.id,
    customerId,
    fromAddress,
    fromName,
    workflowResult,
    handledBy: "ai",
  });
}

interface EmailBranding {
  businessName: string;
  primaryColor?: string;
}

async function getEmailBranding(): Promise<EmailBranding> {
  const settings = await prisma.settings.findFirst({
    select: { businessName: true },
  });
  return {
    businessName: settings?.businessName || "Support",
  };
}

function buildEmailHtml(text: string, branding?: EmailBranding): string {
  const name = branding?.businessName || "Support";
  const color = branding?.primaryColor || "#0F172A";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:${escapeHtml(color)};padding:20px 24px;">
          <h1 style="margin:0;font-size:18px;font-weight:600;color:#FFFFFF;">${escapeHtml(name)}</h1>
        </td></tr>
        <tr><td style="padding:24px;">
          ${text
            .split("\n")
            .map((line) => `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(line)}</p>`)
            .join("")}
        </td></tr>
        <tr><td style="border-top:1px solid #E2E8F0;padding:16px 24px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#94A3B8;">${escapeHtml(name)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function processUnreadEmails(
  imap: Imap,
  config: EmailConfig,
  options: { since?: Date; account?: EmailAccountContext } = {}
) {
  const criteria: (string | string[])[] = ["UNSEEN"];
  if (options.since) {
    criteria.push(["SINCE", options.since.toUTCString()]);
  }

  imap.search(criteria, (err, results) => {
    if (err || !results.length) return;

    const fetch = imap.fetch(results, { bodies: "" });
    fetch.on("message", (msg) => {
      msg.on("body", (stream) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        simpleParser(stream as any, (parseErr: Error | null, parsed: ParsedMail) => {
          if (parseErr) {
            logger.error("[Email] Parse error:", parseErr);
            return;
          }
          processEmail(parsed, config, options.account).catch((error) =>
            logger.error("[Email] Failed to process email:", error)
          );
        });
      });
    });
  });
}

export async function startEmailListener(companyId: string) {
  if (isListening) return;
  if (listenerStartPromise) return listenerStartPromise;
  setCurrentCompany(companyId);

  listenerStartPromise = new Promise(async (resolve, reject) => {
    const config = await getEmailConfig();
    if (!config) {
      logger.info("[Email] Not configured, skipping listener start");
      listenerStartPromise = null;
      resolve();
      return;
    }

    const imap = createImapConnection(config);

    imap.once("ready", () => {
      logger.info("[Email] IMAP connected");

      imap.openBox("INBOX", false, (err) => {
        if (err) {
          logger.error("[Email] Error opening inbox:", err);
          listenerStartPromise = null;
          reject(err);
          return;
        }

        isListening = true;
        listenerStartPromise = null;
        processUnreadEmails(imap, config, {
          since: new Date(Date.now() - 60 * 60 * 1000),
        });

        imap.on("mail", () => {
          processUnreadEmails(imap, config);
        });

        resolve();
      });
    });

    imap.once("error", (err: Error) => {
      logger.error("[Email] IMAP error:", err);
      isListening = false;
      listenerStartPromise = null;
      if (imapConnection === imap) {
        imapConnection = null;
      }
      reject(err);
    });

    imap.once("end", () => {
      logger.info("[Email] IMAP disconnected");
      isListening = false;
      listenerStartPromise = null;
      if (imapConnection === imap) {
        imapConnection = null;
      }
    });

    imapConnection = imap;
    try {
      imap.connect();
    } catch (error) {
      listenerStartPromise = null;
      if (imapConnection === imap) {
        imapConnection = null;
      }
      reject(error);
    }
  });

  return listenerStartPromise;
}

export async function stopEmailListener() {
  listenerStartPromise = null;
  if (imapConnection) {
    imapConnection.end();
    imapConnection = null;
    isListening = false;
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  channelAccountId?: string | null
): Promise<boolean> {
  // Multi-account: when the conversation belongs to a channel account with
  // its own SMTP credentials, send through that inbox instead of the default.
  if (channelAccountId) {
    const sent = await sendEmailViaAccount(channelAccountId, to, subject, body);
    if (sent) return true;
  }

  const config = await getEmailConfig();
  if (!config) return false;

  const branding = await getEmailBranding();
  const transporter = getSmtpTransporter(config);
  await transporter.sendMail({
    from: config.smtpFrom,
    to,
    subject,
    text: body,
    html: buildEmailHtml(body, branding),
  });

  return true;
}

/**
 * Send through a specific channel account's SMTP credentials
 * (stored in ChannelAccount.credentials: smtpHost, smtpPort, smtpUser,
 * smtpPass, smtpFrom). Returns false when the account has no usable config.
 */
export async function sendEmailViaAccount(
  accountId: string,
  to: string,
  subject: string,
  body: string
): Promise<boolean> {
  try {
    const account = await prisma.channelAccount.findUnique({ where: { id: accountId } });
    if (!account || account.channel !== "email" || !account.isActive) return false;

    const credentials = (account.credentials || {}) as Record<string, unknown>;
    const smtpHost = typeof credentials.smtpHost === "string" ? credentials.smtpHost : "";
    const smtpUser = typeof credentials.smtpUser === "string" ? credentials.smtpUser : "";
    const smtpPass = typeof credentials.smtpPass === "string" ? credentials.smtpPass : "";
    if (!smtpHost || !smtpUser || !smtpPass) return false;

    const smtpPort = Number(credentials.smtpPort) || 587;
    const config: EmailConfig = {
      imapHost: "",
      imapPort: 993,
      imapUser: smtpUser,
      imapPass: smtpPass,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFrom: typeof credentials.smtpFrom === "string" && credentials.smtpFrom
        ? credentials.smtpFrom
        : account.identifier,
    };

    const branding = await getEmailBranding();
    const transporter = getSmtpTransporter(config);
    await transporter.sendMail({
      from: config.smtpFrom,
      to,
      subject,
      text: body,
      html: buildEmailHtml(body, branding),
    });

    prisma.channelAccount
      .update({ where: { id: accountId }, data: { lastOutboundAt: new Date() } })
      .catch(() => {});
    return true;
  } catch (error) {
    logger.error("Failed to send email via channel account:", error);
    return false;
  }
}

function testImapConnection(config: EmailConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection(config);
    const timeout = setTimeout(() => {
      imap.removeAllListeners();
      try {
        imap.end();
      } catch {
        // Ignore cleanup errors after a timed out connection attempt.
      }
      reject(new Error("IMAP connection timed out"));
    }, 15000);

    imap.once("ready", () => {
      imap.openBox("INBOX", true, (error) => {
        clearTimeout(timeout);
        imap.end();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    imap.once("error", (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });

    imap.connect();
  });
}

export async function testEmailConnection(): Promise<{
  ok: boolean;
  smtp: boolean;
  imap: boolean;
  message: string;
}> {
  const config = await getEmailConfig();
  if (!config) {
    return {
      ok: false,
      smtp: false,
      imap: false,
      message: "Email is not configured. Save SMTP and IMAP settings first.",
    };
  }

  try {
    const transporter = getSmtpTransporter(config);
    await transporter.verify();
  } catch (error) {
    return {
      ok: false,
      smtp: false,
      imap: false,
      message: `SMTP failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    await testImapConnection(config);
  } catch (error) {
    return {
      ok: false,
      smtp: true,
      imap: false,
      message: `IMAP failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    ok: true,
    smtp: true,
    imap: true,
    message: "SMTP and IMAP connection tests passed.",
  };
}

export function getEmailStatus() {
  return {
    connected: isListening,
    status: isListening ? "connected" : "disconnected",
  };
}
