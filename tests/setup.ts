import { vi, beforeEach } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS, BUILT_IN_ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

// Set test environment variables
process.env.JWT_SECRET = "test-secret-key-for-testing-only";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/owly_test";
process.env.NODE_ENV = "test";
// Tests must be hermetic and never depend on the developer's local .env
// (Vitest auto-loads it) — in particular, checkRateLimit/worker locks would
// otherwise try to connect to a real Redis instance during test runs.
delete process.env.REDIS_URL;

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

  const client = new Proxy(base, {
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

  return client;
}

// src/lib/rbac.ts's role cache reads prisma.role.findMany - without a
// default fixture matching the real migration's built-in-role seed, every
// hasPermission/isUnscoped call (which most scoped API routes go through
// even when route-auth itself is mocked) would see an empty/undefined role
// list and fail closed.
//
// Applied here in a global beforeEach for files that don't touch mocks
// themselves, AND exported so files whose own beforeEach calls
// vi.restoreAllMocks()/clearAllMocks() (which wipes this mockResolvedValue,
// since it runs after this hook in registration order) can re-apply it
// afterward in their own hook.
const ROLE_FIXTURE_UNSCOPED = new Set(["supervisor", "admin"]);
const ROLE_FIXTURE = BUILT_IN_ROLES.map((name) => ({
  id: name,
  name,
  label: name,
  isBuiltIn: true,
  isUnscoped: ROLE_FIXTURE_UNSCOPED.has(name),
  permissions: Object.entries(DEFAULT_ROLE_PERMISSIONS)
    .filter(([, roles]) => (roles as readonly string[]).includes(name))
    .map(([permission]) => ({ permission })),
}));

export function applyRoleFixture() {
  (prisma as unknown as { role: { findMany: ReturnType<typeof vi.fn> } }).role.findMany.mockResolvedValue(
    ROLE_FIXTURE
  );
}

beforeEach(() => {
  applyRoleFixture();
});
