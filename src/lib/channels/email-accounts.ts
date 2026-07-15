import Imap from "imap";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { setCurrentCompany } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";
import {
  processUnreadEmails,
  type EmailConfig,
  type EmailAccountContext,
} from "@/lib/channels/email";

interface AccountImapState {
  imap: Imap | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  message: string;
}

// Registry of per-account IMAP connections keyed by ChannelAccount id, mirroring
// the WhatsApp per-account client registry (whatsapp-accounts.ts).
const globalForEmailAccounts = globalThis as unknown as {
  emailAccountImapClients?: Map<string, AccountImapState>;
};
const registry =
  globalForEmailAccounts.emailAccountImapClients ||
  (globalForEmailAccounts.emailAccountImapClients = new Map<string, AccountImapState>());

function getState(accountId: string): AccountImapState {
  let state = registry.get(accountId);
  if (!state) {
    state = { imap: null, status: "disconnected", message: "Not connected" };
    registry.set(accountId, state);
  }
  return state;
}

export function getEmailAccountStatus(accountId: string) {
  const state = getState(accountId);
  return { status: state.status, message: state.message };
}

function getImapConfig(credentials: Record<string, unknown>): EmailConfig | null {
  const imapHost = typeof credentials.imapHost === "string" ? credentials.imapHost : "";
  const imapUser = typeof credentials.imapUser === "string" ? credentials.imapUser : "";
  const imapPass = typeof credentials.imapPass === "string" ? credentials.imapPass : "";
  if (!imapHost || !imapUser || !imapPass) return null;

  return {
    imapHost,
    imapPort: Number(credentials.imapPort) || 993,
    imapUser,
    imapPass,
    // SMTP fields mirror the same credentials blob so getSmtpTransporter()
    // (used by processEmail's auto-reply path) sends back through this
    // same account's outbox rather than the default/global SMTP config.
    smtpHost: typeof credentials.smtpHost === "string" ? credentials.smtpHost : imapHost,
    smtpPort: Number(credentials.smtpPort) || 587,
    smtpUser: typeof credentials.smtpUser === "string" ? credentials.smtpUser : imapUser,
    smtpPass: typeof credentials.smtpPass === "string" ? credentials.smtpPass : imapPass,
    smtpFrom:
      typeof credentials.smtpFrom === "string" && credentials.smtpFrom
        ? credentials.smtpFrom
        : imapUser,
  };
}

export async function connectEmailAccount(accountId: string): Promise<void> {
  const state = getState(accountId);
  if (state.imap && state.status === "connected") return;

  const account = await prismaUnscoped.channelAccount.findUnique({ where: { id: accountId } });
  if (!account || account.channel !== "email" || !account.isActive) {
    state.status = "error";
    state.message = "Account not found, not an email account, or inactive";
    return;
  }
  setCurrentCompany(account.companyId);

  const config = getImapConfig((account.credentials || {}) as Record<string, unknown>);
  if (!config) {
    state.status = "error";
    state.message = "IMAP credentials not configured for this account";
    return;
  }

  const context: EmailAccountContext = {
    id: account.id,
    identifier: account.identifier,
    defaultAgentId: account.defaultAgentId,
  };

  state.status = "connecting";
  state.message = "Connecting...";

  const imap = new Imap({
    user: config.imapUser,
    password: config.imapPass,
    host: config.imapHost,
    port: config.imapPort,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  });

  imap.once("ready", () => {
    logger.info(`[Email:${account.name}] IMAP connected`);
    imap.openBox("INBOX", false, (err) => {
      if (err) {
        logger.error(`[Email:${account.name}] Error opening inbox:`, err);
        state.status = "error";
        state.message = err.message;
        return;
      }

      state.status = "connected";
      state.message = "Connected";
      prisma.channelAccount
        .update({ where: { id: accountId }, data: { status: "connected" } })
        .catch(() => {});

      processUnreadEmails(imap, config, {
        since: new Date(Date.now() - 60 * 60 * 1000),
        account: context,
      });
      imap.on("mail", () => {
        processUnreadEmails(imap, config, { account: context });
      });
    });
  });

  imap.once("error", (err: Error) => {
    logger.error(`[Email:${account.name}] IMAP error:`, err);
    state.status = "error";
    state.message = err.message;
    if (state.imap === imap) state.imap = null;
    prisma.channelAccount
      .update({ where: { id: accountId }, data: { status: "error" } })
      .catch(() => {});
  });

  imap.once("end", () => {
    logger.info(`[Email:${account.name}] IMAP disconnected`);
    state.status = "disconnected";
    state.message = "Disconnected";
    if (state.imap === imap) state.imap = null;
  });

  state.imap = imap;
  try {
    imap.connect();
  } catch (error) {
    state.status = "error";
    state.message = error instanceof Error ? error.message : String(error);
    if (state.imap === imap) state.imap = null;
  }
}

export async function disconnectEmailAccount(accountId: string): Promise<void> {
  const state = registry.get(accountId);
  if (state?.imap) {
    try {
      state.imap.end();
    } catch (error) {
      logger.error(`[Email] Failed to close IMAP connection for account ${accountId}:`, error);
    }
    state.imap = null;
  }
  if (state) {
    state.status = "disconnected";
    state.message = "Disconnected";
  }
  await prismaUnscoped.channelAccount
    .update({ where: { id: accountId }, data: { status: "disconnected" } })
    .catch(() => {});
}

/**
 * Starts a listener for every active email channel account with IMAP
 * configured, except the "default" identifier — that one is a bookkeeping
 * row synced from the primary connection's own Settings-backed config (see
 * src/app/api/channels/email/route.ts) so account-based routing has a real
 * row to match. Its actual IMAP connection is still owned by the separate
 * startEmailListener()/stopEmailListener() mechanism, triggered by the
 * Channels page's Primary card, not by this per-account registry — starting
 * it here too would poll the same mailbox twice. Called once at boot.
 */
export async function startAllEmailAccountListeners(): Promise<void> {
  const accounts = await prismaUnscoped.channelAccount.findMany({
    where: { channel: "email", isActive: true, identifier: { not: "default" } },
    select: { id: true, name: true },
  });

  for (const account of accounts) {
    await connectEmailAccount(account.id).catch((error) =>
      logger.error(`[Email:${account.name}] Failed to start account listener:`, error)
    );
  }
}

/** Destroys every registered account's IMAP connection cleanly — used on process shutdown. */
export async function destroyAllEmailAccountListeners(): Promise<void> {
  await Promise.allSettled(
    Array.from(registry.entries()).map(async ([accountId, state]) => {
      if (!state.imap) return;
      try {
        state.imap.end();
      } catch (error) {
        logger.error(`[Email] Failed to close IMAP connection for account ${accountId} during shutdown:`, error);
      }
    })
  );
}
