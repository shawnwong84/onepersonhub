/**
 * Migration Script: Encrypt existing plaintext secrets (Settings,
 * ChannelAccount.credentials, Channel.config).
 *
 * Run: npx tsx scripts/reencrypt-secrets.ts
 *
 * Roadmap 5 Phase 1 introduced transparent AES-256-GCM encryption for
 * Settings secret fields and the credential JSON blobs on ChannelAccount
 * and Channel (see src/lib/crypto.ts and the query extension in
 * src/lib/prisma.ts). New writes are encrypted automatically, but rows
 * written before that change remain plaintext at rest. This script re-saves
 * every row so those legacy values get encrypted too. Safe to re-run:
 * already-encrypted values (enc:v1: prefix) are left untouched.
 *
 * Requires SECRETS_ENCRYPTION_KEY to be set (same key the running app uses).
 */

import crypto from "crypto";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    console.error("SECRETS_ENCRYPTION_KEY is not set. Nothing to do.");
    process.exit(1);
  }
  const key = raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    console.error(`SECRETS_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}.`);
    process.exit(1);
  }
  return key;
}

function encryptSecret(key: Buffer, plaintext: string): string {
  if (!plaintext || plaintext.startsWith(PREFIX)) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

const SETTINGS_SECRET_FIELDS = [
  "aiApiKey",
  "elevenLabsKey",
  "twilioToken",
  "smtpPass",
  "imapPass",
  "whatsappApiKey",
  "telegramBotToken",
] as const;

const JSON_CREDENTIAL_SECRET_KEYS = ["smtpPass", "imapPass", "apiKey", "authToken", "password", "secret", "token"];

function encryptJsonCredentials(key: Buffer, credentials: unknown): { next: Record<string, unknown>; changed: boolean } {
  const next = { ...(credentials as Record<string, unknown>) };
  let changed = false;
  for (const secretKey of JSON_CREDENTIAL_SECRET_KEYS) {
    const value = next[secretKey];
    if (typeof value === "string" && value && !value.startsWith(PREFIX)) {
      next[secretKey] = encryptSecret(key, value);
      changed = true;
    }
  }
  return { next, changed };
}

async function main() {
  const key = getKey();
  const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/owly?schema=public";
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  let settingsUpdated = 0;
  const allSettings = await prisma.settings.findMany();
  for (const row of allSettings) {
    const data: Record<string, string> = {};
    for (const field of SETTINGS_SECRET_FIELDS) {
      const value = (row as unknown as Record<string, string>)[field];
      if (typeof value === "string" && value && !value.startsWith(PREFIX)) {
        data[field] = encryptSecret(key, value);
      }
    }
    if (Object.keys(data).length > 0) {
      await prisma.settings.update({ where: { companyId: row.companyId }, data });
      settingsUpdated++;
    }
  }
  console.log(`Settings: encrypted secrets on ${settingsUpdated} row(s) (checked ${allSettings.length}).`);

  let accountsUpdated = 0;
  const allAccounts = await prisma.channelAccount.findMany();
  for (const row of allAccounts) {
    if (!row.credentials || typeof row.credentials !== "object") continue;
    const { next, changed } = encryptJsonCredentials(key, row.credentials);
    if (changed) {
      await prisma.channelAccount.update({ where: { id: row.id }, data: { credentials: next as Prisma.InputJsonValue } });
      accountsUpdated++;
    }
  }
  console.log(`ChannelAccount: encrypted credentials on ${accountsUpdated} row(s) (checked ${allAccounts.length}).`);

  let channelsUpdated = 0;
  const allChannels = await prisma.channel.findMany();
  for (const row of allChannels) {
    if (!row.config || typeof row.config !== "object") continue;
    const { next, changed } = encryptJsonCredentials(key, row.config);
    if (changed) {
      await prisma.channel.update({ where: { id: row.id }, data: { config: next as Prisma.InputJsonValue } });
      channelsUpdated++;
    }
  }
  console.log(`Channel: encrypted config on ${channelsUpdated} row(s) (checked ${allChannels.length}).`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Re-encryption failed:", error);
  process.exit(1);
});
