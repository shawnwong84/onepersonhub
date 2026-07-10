import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isLockedOut,
  recordFailedLogin,
  clearLoginAttempts,
  _getStoreForTesting,
} from "@/lib/login-lockout";

describe("login-lockout", () => {
  beforeEach(() => {
    _getStoreForTesting().clear();
    vi.useRealTimers();
  });

  it("is not locked out with no prior attempts", () => {
    expect(isLockedOut("someone").locked).toBe(false);
  });

  it("does not lock out below the failure threshold", () => {
    for (let i = 0; i < 4; i++) recordFailedLogin("bruteforced-user");
    expect(isLockedOut("bruteforced-user").locked).toBe(false);
  });

  it("locks out after the 5th failed attempt", () => {
    for (let i = 0; i < 5; i++) recordFailedLogin("bruteforced-user");
    const status = isLockedOut("bruteforced-user");
    expect(status.locked).toBe(true);
    expect(status.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("is case-insensitive on the identifier", () => {
    for (let i = 0; i < 5; i++) recordFailedLogin("Admin");
    expect(isLockedOut("admin").locked).toBe(true);
    expect(isLockedOut("ADMIN").locked).toBe(true);
  });

  it("tracks different identifiers independently", () => {
    for (let i = 0; i < 5; i++) recordFailedLogin("user-a");
    expect(isLockedOut("user-a").locked).toBe(true);
    expect(isLockedOut("user-b").locked).toBe(false);
  });

  it("clears attempts after a successful login", () => {
    for (let i = 0; i < 4; i++) recordFailedLogin("recovering-user");
    clearLoginAttempts("recovering-user");
    recordFailedLogin("recovering-user");
    expect(isLockedOut("recovering-user").locked).toBe(false);
  });

  it("unlocks automatically once the lockout duration elapses", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    for (let i = 0; i < 5; i++) recordFailedLogin("timed-out-user");
    expect(isLockedOut("timed-out-user").locked).toBe(true);

    vi.setSystemTime(now + 16 * 60 * 1000); // past the 15-minute lockout window
    expect(isLockedOut("timed-out-user").locked).toBe(false);
  });
});
