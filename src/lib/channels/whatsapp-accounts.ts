import { Client, LocalAuth, Message } from "whatsapp-web.js";
import qrcode from "qrcode";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { setCurrentCompany } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";
import { ACTIVITY_ENTITIES, logActivity } from "@/lib/activity";
import { processIncomingMessage, type WhatsAppAccountContext } from "@/lib/channels/whatsapp";

interface AccountClientState {
  client: Client | null;
  status: "disconnected" | "connecting" | "qr_ready" | "connected" | "error";
  qr: string | null;
  message: string;
  initPromise: Promise<void> | null;
}

// Registry of WhatsApp clients keyed by ChannelAccount id. Each account keeps
// its own LocalAuth session under .wwebjs_auth/session-account-<id>.
const globalForAccounts = globalThis as unknown as {
  whatsappAccountClients?: Map<string, AccountClientState>;
};
const registry =
  globalForAccounts.whatsappAccountClients ||
  (globalForAccounts.whatsappAccountClients = new Map<string, AccountClientState>());

function getState(accountId: string): AccountClientState {
  let state = registry.get(accountId);
  if (!state) {
    state = { client: null, status: "disconnected", qr: null, message: "Not connected", initPromise: null };
    registry.set(accountId, state);
  }
  return state;
}

async function setAccountStatus(accountId: string, status: string) {
  await prisma.channelAccount
    .update({ where: { id: accountId }, data: { status } })
    .catch(() => {});
}

export function getWhatsAppAccountStatus(accountId: string) {
  const state = getState(accountId);
  return { status: state.status, qr: state.qr, message: state.message };
}

export async function connectWhatsAppAccount(accountId: string): Promise<void> {
  const state = getState(accountId);
  if (state.initPromise) return state.initPromise;
  if (state.client && state.status === "connected") return;

  // Unscoped + explicit setCurrentCompany rather than the tenant-scoped
  // `prisma`: this can run at boot (no request context yet) as well as from
  // an authenticated route, and the client's "message" listener registered
  // below needs a real, explicitly-set tenant context to inherit - not one
  // that happens to still be active from whatever call triggered this.
  const account = await prismaUnscoped.channelAccount.findUnique({ where: { id: accountId } });
  if (!account || account.channel !== "whatsapp") {
    throw new Error("WhatsApp channel account not found");
  }
  if (!account.isActive) {
    throw new Error("Channel account is inactive. Activate it before connecting.");
  }
  setCurrentCompany(account.companyId);

  const context: WhatsAppAccountContext = { id: account.id, identifier: account.identifier };

  state.initPromise = (async () => {
    state.status = "connecting";
    state.message = "Initializing WhatsApp client...";
    await setAccountStatus(accountId, "connecting");

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: `account-${accountId}`, dataPath: ".wwebjs_auth" }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      },
    });

    client.on("qr", async (qr: string) => {
      try {
        state.qr = await qrcode.toDataURL(qr);
        state.status = "qr_ready";
        state.message = `Scan the QR code with WhatsApp (${account.name})`;
        await setAccountStatus(accountId, "qr_ready");
      } catch (error) {
        logger.error(`[WhatsApp:${account.name}] Failed to generate QR:`, error);
        state.status = "error";
        state.message = "Failed to generate QR code";
      }
    });

    client.on("ready", async () => {
      logger.info(`[WhatsApp:${account.name}] Client ready`);
      state.qr = null;
      state.status = "connected";
      state.message = "Connected";
      await setAccountStatus(accountId, "connected");
      await logActivity({
        action: "channel.whatsapp_account_connected",
        entity: ACTIVITY_ENTITIES.CHANNEL,
        entityId: accountId,
        description: `WhatsApp account ${account.name} (${account.identifier}) connected.`,
        metadata: { channel: "whatsapp", accountId, identifier: account.identifier },
      });
    });

    client.on("auth_failure", async (message: string) => {
      logger.error(`[WhatsApp:${account.name}] Auth failure: ${message}`);
      state.status = "error";
      state.message = `Authentication failed: ${message}`;
      await setAccountStatus(accountId, "auth_failure");
    });

    client.on("disconnected", async (reason: string) => {
      logger.info(`[WhatsApp:${account.name}] Disconnected: ${reason}`);
      state.status = "disconnected";
      state.message = `Disconnected: ${reason}`;
      state.qr = null;
      if (state.client === client) state.client = null;
      await setAccountStatus(accountId, "disconnected");
    });

    client.on("message", async (message: Message) => {
      try {
        await processIncomingMessage(message, context);
      } catch (error) {
        logger.error(`[WhatsApp:${account.name}] Failed to process message:`, error);
      }
    });

    state.client = client;
    await client.initialize();
  })().finally(() => {
    state.initPromise = null;
  });

  return state.initPromise;
}

export async function disconnectWhatsAppAccount(accountId: string): Promise<void> {
  const state = getState(accountId);
  const client = state.client;
  state.client = null;
  state.qr = null;
  state.status = "disconnected";
  state.message = "Disconnected";

  if (client) {
    try {
      await client.destroy();
    } catch (error) {
      logger.error("[WhatsApp] Failed to destroy account client:", error);
    }
  }
  await setAccountStatus(accountId, "disconnected");
  await logActivity({
    action: "channel.whatsapp_account_disconnected",
    entity: ACTIVITY_ENTITIES.CHANNEL,
    entityId: accountId,
    description: "WhatsApp channel account disconnected.",
    metadata: { channel: "whatsapp", accountId },
  });
}

/**
 * Destroys every registered account client's underlying puppeteer session
 * without the DB/activity-log side effects of disconnectWhatsAppAccount —
 * used on process shutdown, where we want sessions closed cleanly (so
 * puppeteer/chromium child processes don't linger and LocalAuth session
 * files aren't left mid-write) but don't need to record a deliberate
 * "disconnected" action for what's actually a server restart.
 */
/**
 * Starts a client for every active WhatsApp channel account, except the
 * "default" identifier - that one is a bookkeeping row synced from the
 * primary connection's own config, not a real per-account session (see
 * the analogous comment on startAllEmailAccountListeners). Without this,
 * a server restart wipes the in-memory client registry and every
 * previously-connected account goes silently unreachable until someone
 * reopens the Channels page and reconnects it by hand. Called once at boot.
 */
export async function startAllWhatsAppAccountListeners(): Promise<void> {
  const accounts = await prismaUnscoped.channelAccount.findMany({
    where: { channel: "whatsapp", isActive: true, identifier: { not: "default" } },
    select: { id: true, name: true },
  });

  for (const account of accounts) {
    await connectWhatsAppAccount(account.id).catch((error) =>
      logger.error(`[WhatsApp:${account.name}] Failed to start account listener:`, error)
    );
  }
}

export async function destroyAllWhatsAppAccountClients(): Promise<void> {
  await Promise.allSettled(
    Array.from(registry.entries()).map(async ([accountId, state]) => {
      if (!state.client) return;
      try {
        await state.client.destroy();
      } catch (error) {
        logger.error(`[WhatsApp] Failed to destroy account client ${accountId} during shutdown:`, error);
      }
    })
  );
}

/** Send through a specific account's client; false when it is not connected. */
export async function sendWhatsAppAccountMessage(
  accountId: string,
  to: string,
  message: string
): Promise<boolean> {
  const state = getState(accountId);
  if (!state.client || state.status !== "connected") return false;

  const chatId = to.includes("@") ? to : `${to}@c.us`;
  const sent = await state.client.sendMessage(chatId, message);
  if (sent) {
    prisma.channelAccount
      .update({ where: { id: accountId }, data: { lastOutboundAt: new Date() } })
      .catch(() => {});
  }
  return Boolean(sent);
}
