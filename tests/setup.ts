import { vi } from "vitest";

// Set test environment variables
process.env.JWT_SECRET = "test-secret-key-for-testing-only";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/owly_test";
process.env.NODE_ENV = "test";

// Mock Prisma globally
vi.mock("@/lib/prisma", () => ({
  prisma: createMockPrismaClient(),
}));

// Mock route-auth to always authenticate as admin in tests
vi.mock("@/lib/route-auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    userId: "test-admin-id",
    role: "admin",
    username: "admin",
    name: "Test Admin",
    authMethod: "cookie",
  }),
  isAuthenticated: vi.fn().mockReturnValue(true),
}));

// Mock realtime to prevent side effects in tests
vi.mock("@/lib/realtime", () => ({
  emitNewMessage: vi.fn(),
  emitConversationUpdate: vi.fn(),
  emitTyping: vi.fn(),
  publish: vi.fn(),
  subscribe: vi.fn(),
}));

// Mock next/headers
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: vi.fn().mockResolvedValue(new Map()),
}));

function createMockPrismaClient() {
  const methodNames = [
    "findUnique",
    "findFirst",
    "findMany",
    "create",
    "createMany",
    "update",
    "updateMany",
    "upsert",
    "delete",
    "deleteMany",
    "count",
    "aggregate",
    "groupBy",
  ];

  const base: Record<string, unknown> = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $transaction: vi.fn(),
  };

  // Models are created lazily so the mock never goes stale as the schema grows.
  const models = new Map<string, Record<string, unknown>>();

  return new Proxy(base, {
    get(target, prop) {
      if (typeof prop !== "string" || prop in target || prop === "then") {
        return target[prop as string];
      }
      if (!models.has(prop)) {
        const model: Record<string, unknown> = {};
        for (const method of methodNames) {
          model[method] = vi.fn();
        }
        models.set(prop, model);
      }
      return models.get(prop);
    },
  });
}
