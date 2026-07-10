/**
 * Per-identifier login lockout, independent of the IP-based rate limit in
 * middleware.ts. This stops credential-stuffing against one account from
 * many IPs (which an IP-based limit alone would not catch), at the cost of
 * being in-memory/single-instance for now (see roadmap 5 phase 2 for the
 * Redis-backed version needed once the app runs on more than one instance).
 */

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

interface LockoutEntry {
  failedCount: number;
  firstFailedAt: number;
  lockedUntil: number | null;
}

const store = new Map<string, LockoutEntry>();

function normalize(identifier: string): string {
  return identifier.trim().toLowerCase();
}

export interface LockoutStatus {
  locked: boolean;
  retryAfterSeconds: number;
}

/** Checks whether an identifier (username) is currently locked out. */
export function isLockedOut(identifier: string): LockoutStatus {
  const entry = store.get(normalize(identifier));
  if (!entry?.lockedUntil) return { locked: false, retryAfterSeconds: 0 };

  const now = Date.now();
  if (now >= entry.lockedUntil) {
    store.delete(normalize(identifier));
    return { locked: false, retryAfterSeconds: 0 };
  }

  return { locked: true, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
}

/**
 * Records a failed login attempt. Once MAX_FAILED_ATTEMPTS accumulate within
 * ATTEMPT_WINDOW_MS, the identifier is locked for LOCKOUT_DURATION_MS.
 */
export function recordFailedLogin(identifier: string): LockoutStatus {
  const key = normalize(identifier);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.firstFailedAt > ATTEMPT_WINDOW_MS) {
    store.set(key, { failedCount: 1, firstFailedAt: now, lockedUntil: null });
    return { locked: false, retryAfterSeconds: 0 };
  }

  entry.failedCount += 1;
  if (entry.failedCount >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
    return { locked: true, retryAfterSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000) };
  }

  return { locked: false, retryAfterSeconds: 0 };
}

/** Clears failed-attempt tracking after a successful login. */
export function clearLoginAttempts(identifier: string): void {
  store.delete(normalize(identifier));
}

export function _getStoreForTesting() {
  return store;
}
