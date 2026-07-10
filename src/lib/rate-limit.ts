interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  auth: { maxRequests: 5, windowMs: 60 * 1000 } as RateLimitConfig,
  apiRead: { maxRequests: 600, windowMs: 60 * 1000 } as RateLimitConfig,
  apiWrite: { maxRequests: 180, windowMs: 60 * 1000 } as RateLimitConfig,
  realtime: { maxRequests: 120, windowMs: 60 * 1000 } as RateLimitConfig,
  // Inbound webhook: external systems triggering workflows, keyed per caller.
  webhookInbound: { maxRequests: 60, windowMs: 60 * 1000 } as RateLimitConfig,
} as const;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}

export function _getStoreForTesting() {
  return store;
}
