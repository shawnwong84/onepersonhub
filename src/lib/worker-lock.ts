import { logger } from "@/lib/logger";

interface RedisLockClient {
  set: (key: string, value: string, opts: { NX: true; PX: number }) => Promise<string | null>;
}

let redisClient: RedisLockClient | null = null;
let redisInitialized = false;

async function getRedisClient(): Promise<RedisLockClient | null> {
  if (redisInitialized) return redisClient;
  redisInitialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    // Dynamic import - only loads if Redis URL is configured.
    const { createClient } = await import("redis" as string);
    const client = createClient({ url: redisUrl });
    client.on("error", (error: unknown) => {
      logger.warn("Redis worker-lock client error", { error: String(error) });
    });
    await client.connect();
    redisClient = client as unknown as RedisLockClient;
    return redisClient;
  } catch (error) {
    logger.warn("Redis connection failed for worker locking, workers will run unguarded", {
      error: String(error),
    });
    return null;
  }
}

/**
 * Leader-election-per-tick for periodic in-process workers (reporter
 * heartbeat, website recrawl, etc). When multiple app instances run the
 * same setInterval, only the instance that wins this lock should do the
 * work for that tick — the rest skip it, avoiding duplicate notifications/
 * deliveries/recrawls. Self-healing: the lock expires after ttlMs even if
 * the winning instance crashes mid-tick, so the next tick elects a new
 * leader rather than staying stuck.
 *
 * With no REDIS_URL configured, this always returns true (single-instance
 * assumption) — matching this worker's pre-existing unguarded behavior.
 * If Redis is configured but unreachable, this fails open (returns true)
 * rather than risk NO instance ever running the work.
 */
export async function acquireWorkerTickLock(name: string, ttlMs: number): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return true;

  try {
    const result = await redis.set(`owly:worker-lock:${name}`, String(process.pid), { NX: true, PX: ttlMs });
    return result === "OK";
  } catch (error) {
    logger.warn("Worker lock acquisition failed, proceeding without lock", { name, error: String(error) });
    return true;
  }
}
