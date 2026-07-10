import { logger } from "@/lib/logger";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory fallback store (also the only store when REDIS_URL is unset).
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupMemoryStore() {
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

interface RedisMultiChain {
  incr: (key: string) => RedisMultiChain;
  pTTL: (key: string) => RedisMultiChain;
  exec: () => Promise<[number, number]>;
}

interface RedisRateLimitClient {
  multi: () => RedisMultiChain;
  pExpire: (key: string, ms: number) => Promise<unknown>;
}

let redisClient: RedisRateLimitClient | null = null;
let redisInitialized = false;

async function getRedisClient(): Promise<RedisRateLimitClient | null> {
  if (redisInitialized) return redisClient;
  redisInitialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    // Dynamic import - only loads if Redis URL is configured. Multiple
    // Next.js instances share this store, so rate limits (and the login
    // lockout, which is process-local memory otherwise) are consistent
    // across instances instead of being bypassable by hitting a different one.
    const { createClient } = await import("redis" as string);
    const client = createClient({ url: redisUrl });
    client.on("error", (error: unknown) => {
      logger.warn("Redis rate-limit client error, falling back to in-memory", { error: String(error) });
    });
    await client.connect();
    redisClient = client as unknown as RedisRateLimitClient;
    logger.info("Rate limiter connected to Redis");
    return redisClient;
  } catch (error) {
    logger.warn("Redis connection failed for rate limiting, using in-memory store", {
      error: String(error),
    });
    return null;
  }
}

function checkRateLimitInMemory(key: string, config: RateLimitConfig): RateLimitResult {
  cleanupMemoryStore();

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
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

async function checkRateLimitRedis(
  redis: RedisRateLimitClient,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redisKey = `owly:ratelimit:${key}`;
  const [count, ttl] = await redis.multi().incr(redisKey).pTTL(redisKey).exec();

  let resetInMs = ttl;
  if (ttl < 0) {
    // First hit in this window (or the key expired with no TTL race): arm it.
    await redis.pExpire(redisKey, config.windowMs);
    resetInMs = config.windowMs;
  }

  const resetAt = Date.now() + resetInMs;

  if (count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  return { allowed: true, remaining: config.maxRequests - count, resetAt };
}

/**
 * Fixed-window rate limiter. Uses Redis (shared across instances) when
 * REDIS_URL is set and reachable; otherwise falls back to an in-process
 * Map, which only rate-limits within a single instance.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      return await checkRateLimitRedis(redis, key, config);
    } catch (error) {
      logger.warn("Redis rate-limit check failed, falling back to in-memory", { error: String(error) });
    }
  }

  return checkRateLimitInMemory(key, config);
}

export async function resetRateLimit(key: string): Promise<void> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.pExpire(`owly:ratelimit:${key}`, 0);
      return;
    } catch (error) {
      logger.warn("Redis rate-limit reset failed", { error: String(error) });
    }
  }
  store.delete(key);
}

export function _getStoreForTesting() {
  return store;
}
