import { AsyncLocalStorage } from "node:async_hooks";

interface TenantStore {
  companyId: string;
}

// Cached on globalThis: Turbopack's per-route code splitting can bundle this
// module into more than one chunk (e.g. once alongside prisma.ts, once
// alongside a given route file), each getting its OWN module-scope
// `tenantContext` instance otherwise - setCurrentCompany() in one chunk's
// copy would silently write to a different AsyncLocalStorage than the copy
// currentCompanyId() reads from in another chunk, always resulting in "No
// tenant context set" even though requireAuth() ran and set it correctly.
// Verified this was the actual root cause via a debug Proxy trace: the
// throwing call and a `hasCurrentCompany() === true` check one line earlier,
// in the same synchronous call stack, resolved to two different chunk
// files. globalThis is the one thing guaranteed shared across all chunks in
// the same process (mirrors src/lib/prisma.ts's own globalForPrisma pattern).
const globalForTenantContext = globalThis as unknown as {
  tenantContext?: AsyncLocalStorage<TenantStore>;
};

const tenantContext =
  globalForTenantContext.tenantContext ??
  (globalForTenantContext.tenantContext = new AsyncLocalStorage<TenantStore>());

/**
 * Establishes the current request's company for the remainder of this
 * async call chain. Called once, by requireAuth(), right after the
 * caller's identity (and thus companyId) is resolved. Uses enterWith
 * rather than run() so every existing `const auth = await requireAuth(...)`
 * call site keeps working unchanged - no route file needs to wrap its
 * logic in a callback to get tenant scoping.
 */
export function setCurrentCompany(companyId: string): void {
  tenantContext.enterWith({ companyId });
}

/**
 * Reads the current request's companyId. Throws if no company has been
 * set - this is deliberate: a Prisma call reaching the tenant-scoping
 * extension (src/lib/prisma.ts) outside any resolved auth context is a
 * bug that must fail loudly, not silently query across every company.
 */
export function currentCompanyId(): string {
  const store = tenantContext.getStore();
  if (!store) {
    throw new Error(
      "No tenant context set - every Prisma call must run after requireAuth() has resolved a company (see src/lib/tenant-context.ts)."
    );
  }
  return store.companyId;
}

/** True if a tenant context is currently set, without throwing. */
export function hasCurrentCompany(): boolean {
  return tenantContext.getStore() !== undefined;
}
