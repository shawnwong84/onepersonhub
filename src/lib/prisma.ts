import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { currentCompanyId } from "@/lib/tenant-context";

// Every model except Company itself is scoped to the current request's
// company by the tenant-scoping wrapper below. Keyed by the lowerCamelCase
// delegate name Prisma exposes on the client (e.g. `prisma.company`).
const TENANT_EXCLUDED_MODELS = new Set(["company"]);

const FILTERED_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

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
// Channel.config, Connector.credentials) that hold secrets. Non-listed keys
// (host, port, user, from...) stay plaintext so the JSON remains inspectable
// for debugging.
const JSON_CREDENTIAL_SECRET_KEYS = [
  "smtpPass",
  "imapPass",
  "apiKey",
  "authToken",
  "password",
  "secret",
  "token",
  "clientSecret",
  "accessToken",
  "refreshToken",
];

// Flat secret field on ConnectorOAuthState - the client secret must be held
// server-side between the authorize redirect and the callback exchange.
const CONNECTOR_OAUTH_STATE_SECRET_FIELDS = ["pendingClientSecret"] as const;

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
  prisma: ReturnType<typeof createPrismaClient>["prisma"] | undefined;
  prismaUnscoped: ReturnType<typeof createPrismaClient>["prismaUnscoped"] | undefined;
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
  const withEncryption = client.$extends({
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
      connector: {
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
      connectorOAuthState: {
        async $allOperations({ args, query }) {
          const typedArgs = args as Record<string, unknown>;
          encryptRecordFields(typedArgs.data as Record<string, unknown> | undefined, CONNECTOR_OAUTH_STATE_SECRET_FIELDS);
          encryptRecordFields(typedArgs.create as Record<string, unknown> | undefined, CONNECTOR_OAUTH_STATE_SECRET_FIELDS);
          encryptRecordFields(typedArgs.update as Record<string, unknown> | undefined, CONNECTOR_OAUTH_STATE_SECRET_FIELDS);
          const result = await query(args);
          forEachResultRow(result, (row) => decryptRecordFields(row, CONNECTOR_OAUTH_STATE_SECRET_FIELDS));
          return result;
        },
      },
    },
  });

  // Transparent multi-tenant scoping: every query against every model
  // (except Company itself) is automatically filtered/tagged with the
  // current request's companyId (set by requireAuth() via
  // src/lib/tenant-context.ts). No route file needs to add `companyId` to
  // its own `where`/`data` - this rewrites args before they reach Postgres.
  //
  // Implemented as a plain Proxy (NOT a Prisma Client Extension's
  // query middleware) deliberately: Prisma defers actual query execution
  // via its own internal lazy "PrismaPromise" machinery, and that dispatch
  // does not preserve Node's AsyncLocalStorage context (verified empirically -
  // even wrapping the exact query call in tenantContext.run() still lost the
  // store by the time a Client Extension's $allOperations callback ran). A
  // Proxy's `get` trap intercepting `prisma.<model>.<method>` fires
  // synchronously at the call site itself, inside the caller's own
  // still-valid context, so currentCompanyId() is read there instead -
  // before ever handing off to Prisma's internal dispatch.
  const MUTATING_OPS_WITH_DATA = new Set(["create", "createManyAndReturn"]);

  function wrapModelDelegate(modelDelegate: Record<string, unknown>) {
    return new Proxy(modelDelegate, {
      get(target, prop, receiver) {
        const original = Reflect.get(target, prop, receiver);
        if (typeof prop !== "string" || typeof original !== "function") return original;

        const isFiltered = FILTERED_OPERATIONS.has(prop);
        const isCreate = MUTATING_OPS_WITH_DATA.has(prop);
        const isCreateMany = prop === "createMany";
        const isUpsert = prop === "upsert";
        if (!isFiltered && !isCreate && !isCreateMany && !isUpsert) {
          return original.bind(target);
        }

        return (args: Record<string, unknown> = {}) => {
          const companyId = currentCompanyId();
          const a = { ...args };

          if (isFiltered) {
            a.where = { ...((a.where as object) ?? {}), companyId };
          }
          if (isCreate && a.data && !Array.isArray(a.data)) {
            a.data = { ...(a.data as Record<string, unknown>), companyId };
          }
          if (isCreateMany && Array.isArray(a.data)) {
            a.data = (a.data as Record<string, unknown>[]).map((row) => ({ ...row, companyId }));
          }
          if (isUpsert) {
            a.where = { ...((a.where as object) ?? {}), companyId };
            if (a.create) a.create = { ...(a.create as Record<string, unknown>), companyId };
          }

          return original.call(target, a);
        };
      },
    });
  }

  const modelDelegateCache = new Map<string, unknown>();

  const withTenancy = new Proxy(withEncryption, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || prop.startsWith("$") || TENANT_EXCLUDED_MODELS.has(prop)) {
        return original;
      }
      if (!original || typeof original !== "object") return original;

      if (!modelDelegateCache.has(prop)) {
        modelDelegateCache.set(prop, wrapModelDelegate(original as Record<string, unknown>));
      }
      return modelDelegateCache.get(prop);
    },
  }) as typeof withEncryption;

  return { prisma: withTenancy, prismaUnscoped: withEncryption };
}

const clients = globalForPrisma.prisma && globalForPrisma.prismaUnscoped
  ? { prisma: globalForPrisma.prisma, prismaUnscoped: globalForPrisma.prismaUnscoped }
  : createPrismaClient();

// Tenant-scoped client - used by every route/lib function that runs inside
// an authenticated request (after requireAuth() has set the tenant context).
export const prisma = clients.prisma;

// NOT tenant-scoped - used only for the small set of bootstrap lookups that
// must resolve a companyId before one is known: login-by-username,
// getCurrentUser()'s self-lookup-by-id, API-key lookup, and registration
// (which creates the Company itself). Importing this anywhere else is a bug.
export const prismaUnscoped = clients.prismaUnscoped;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaUnscoped = prismaUnscoped;
}
