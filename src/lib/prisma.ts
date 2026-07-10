import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

// Settings fields that hold provider/API secrets. Encrypted transparently
// by the query extension below so a database dump alone yields nothing usable.
const SETTINGS_SECRET_FIELDS = [
  "aiApiKey",
  "elevenLabsKey",
  "twilioToken",
  "smtpPass",
  "imapPass",
  "whatsappApiKey",
  "telegramBotToken",
] as const;

// Sub-keys inside free-form JSON credential blobs (ChannelAccount.credentials,
// Channel.config) that hold secrets. Non-listed keys (host, port, user,
// from...) stay plaintext so the JSON remains inspectable for debugging.
const JSON_CREDENTIAL_SECRET_KEYS = ["smtpPass", "imapPass", "apiKey", "authToken", "password", "secret", "token"];

function encryptRecordFields<T extends Record<string, unknown>>(data: T | undefined, fields: readonly string[]) {
  if (!data || typeof data !== "object") return;
  for (const field of fields) {
    const value = data[field];
    if (typeof value === "string" && value) {
      (data as Record<string, unknown>)[field] = encryptSecret(value);
    }
  }
}

function decryptRecordFields<T extends Record<string, unknown>>(data: T | null | undefined, fields: readonly string[]) {
  if (!data || typeof data !== "object") return;
  for (const field of fields) {
    const value = data[field];
    if (typeof value === "string" && value) {
      (data as Record<string, unknown>)[field] = decryptSecret(value);
    }
  }
}

function forEachResultRow(result: unknown, fn: (row: Record<string, unknown>) => void) {
  if (Array.isArray(result)) {
    for (const row of result) {
      if (row && typeof row === "object") fn(row as Record<string, unknown>);
    }
  } else if (result && typeof result === "object") {
    fn(result as Record<string, unknown>);
  }
}

function encryptSettingsWriteArgs(args: Record<string, unknown>) {
  encryptRecordFields(args.data as Record<string, unknown> | undefined, SETTINGS_SECRET_FIELDS);
  encryptRecordFields(args.create as Record<string, unknown> | undefined, SETTINGS_SECRET_FIELDS);
  encryptRecordFields(args.update as Record<string, unknown> | undefined, SETTINGS_SECRET_FIELDS);
}

function encryptJsonCredentials(credentials: unknown): unknown {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) return credentials;
  const next = { ...(credentials as Record<string, unknown>) };
  for (const key of JSON_CREDENTIAL_SECRET_KEYS) {
    const value = next[key];
    if (typeof value === "string" && value) {
      next[key] = encryptSecret(value);
    }
  }
  return next;
}

function decryptJsonCredentials(credentials: unknown): unknown {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) return credentials;
  const next = { ...(credentials as Record<string, unknown>) };
  for (const key of JSON_CREDENTIAL_SECRET_KEYS) {
    const value = next[key];
    if (typeof value === "string" && value) {
      next[key] = decryptSecret(value);
    }
  }
  return next;
}

/** Encrypts secret sub-keys inside the given JSON field name in write args. */
function encryptJsonFieldWriteArgs(args: Record<string, unknown>, jsonField: string) {
  for (const container of ["data", "create", "update"] as const) {
    const value = args[container] as Record<string, unknown> | undefined;
    if (value && typeof value === "object" && jsonField in value) {
      value[jsonField] = encryptJsonCredentials(value[jsonField]);
    }
  }
}

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/owly?schema=public";

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({
    adapter,
    // Password hashes must never leave the API by accident. Queries that
    // genuinely need the hash (login) opt back in with omit: { password: false }.
    omit: {
      teamMember: { password: true },
      admin: { password: true },
    },
  });

  // Transparent encryption at rest for Settings secret fields and the
  // credential JSON blobs on ChannelAccount and Channel. Every call site
  // keeps calling prisma.settings.* / prisma.channelAccount.* / prisma.channel.*
  // exactly as before - encryption/decryption happens invisibly here.
  return client.$extends({
    name: "secretsEncryption",
    query: {
      settings: {
        async $allOperations({ args, query }) {
          encryptSettingsWriteArgs(args as Record<string, unknown>);
          const result = await query(args);
          forEachResultRow(result, (row) => decryptRecordFields(row, SETTINGS_SECRET_FIELDS));
          return result;
        },
      },
      channelAccount: {
        async $allOperations({ args, query }) {
          encryptJsonFieldWriteArgs(args as Record<string, unknown>, "credentials");
          const result = await query(args);
          forEachResultRow(result, (row) => {
            if ("credentials" in row) {
              row.credentials = decryptJsonCredentials(row.credentials);
            }
          });
          return result;
        },
      },
      channel: {
        async $allOperations({ args, query }) {
          encryptJsonFieldWriteArgs(args as Record<string, unknown>, "config");
          const result = await query(args);
          forEachResultRow(result, (row) => {
            if ("config" in row) {
              row.config = decryptJsonCredentials(row.config);
            }
          });
          return result;
        },
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
