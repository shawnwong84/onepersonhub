import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/crypto", () => ({
  secretsEncryptionEnabled: vi.fn().mockReturnValue(true),
}));

import { validateStartupEnv, StartupEnvValidationError } from "@/lib/env-validation";
import { secretsEncryptionEnabled } from "@/lib/crypto";

const mockSecretsEncryptionEnabled = vi.mocked(secretsEncryptionEnabled);

describe("validateStartupEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockSecretsEncryptionEnabled.mockReset().mockReturnValue(true);
    process.env.DATABASE_URL = "postgresql://real-user:real-pass@db.example.com:5432/owly";
    process.env.JWT_SECRET = "a-genuinely-long-random-secret-value-1234567890";
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("passes with valid production config", async () => {
    await expect(validateStartupEnv()).resolves.toBeUndefined();
  });

  it("does not enforce placeholder/production-only checks outside production", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/owly?schema=public";
    process.env.JWT_SECRET = "change-me";
    await expect(validateStartupEnv()).resolves.toBeUndefined();
  });

  it("fails when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    await expect(validateStartupEnv()).rejects.toThrow(StartupEnvValidationError);
    await expect(validateStartupEnv()).rejects.toThrow(/DATABASE_URL is not set/);
  });

  it("fails when DATABASE_URL is still the documented local-dev default in production", async () => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/owly?schema=public";
    await expect(validateStartupEnv()).rejects.toThrow(/documented local-dev default/);
  });

  it("fails when JWT_SECRET is missing in production", async () => {
    delete process.env.JWT_SECRET;
    await expect(validateStartupEnv()).rejects.toThrow(/JWT_SECRET is not set/);
  });

  it("fails when JWT_SECRET is a documented placeholder in production", async () => {
    process.env.JWT_SECRET = "change-me";
    await expect(validateStartupEnv()).rejects.toThrow(/documented placeholder value/);
  });

  it("fails when JWT_SECRET is too short in production", async () => {
    process.env.JWT_SECRET = "short";
    await expect(validateStartupEnv()).rejects.toThrow(/only 5 characters/);
  });

  it("fails when secretsEncryptionEnabled throws (e.g. SECRETS_ENCRYPTION_KEY missing in production)", async () => {
    mockSecretsEncryptionEnabled.mockImplementation(() => {
      throw new Error("SECRETS_ENCRYPTION_KEY is required in production. Generate one with: openssl rand -base64 32");
    });
    await expect(validateStartupEnv()).rejects.toThrow(/SECRETS_ENCRYPTION_KEY is required/);
  });

  it("aggregates multiple problems into one error", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    try {
      await validateStartupEnv();
      expect.fail("expected validateStartupEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(StartupEnvValidationError);
      const message = (error as Error).message;
      expect(message).toContain("DATABASE_URL is not set");
      expect(message).toContain("JWT_SECRET is not set");
    }
  });
});
