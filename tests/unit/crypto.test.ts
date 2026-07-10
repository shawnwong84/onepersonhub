import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const TEST_KEY = "TmAaQT9QzmIAiW8Q7+4ZJn9+mcz4LGlFnYlWzR/cBVg=";

describe("secrets encryption (crypto.ts)", () => {
  const originalEnv = process.env.SECRETS_ENCRYPTION_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;
    vi.resetModules();
  });

  describe("with a configured key", () => {
    beforeEach(() => {
      process.env.SECRETS_ENCRYPTION_KEY = TEST_KEY;
      vi.resetModules();
    });

    it("round-trips a plaintext secret", async () => {
      const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
      const encrypted = encryptSecret("sk-super-secret-value");
      expect(encrypted).toMatch(/^enc:v1:/);
      expect(encrypted).not.toContain("sk-super-secret-value");
      expect(decryptSecret(encrypted)).toBe("sk-super-secret-value");
    });

    it("produces different ciphertext for the same plaintext each time (random IV)", async () => {
      const { encryptSecret } = await import("@/lib/crypto");
      const a = encryptSecret("same-value");
      const b = encryptSecret("same-value");
      expect(a).not.toBe(b);
    });

    it("returns empty string unchanged", async () => {
      const { encryptSecret } = await import("@/lib/crypto");
      expect(encryptSecret("")).toBe("");
    });

    it("treats legacy plaintext (no prefix) as already-plaintext on decrypt", async () => {
      const { decryptSecret } = await import("@/lib/crypto");
      expect(decryptSecret("plain-legacy-value")).toBe("plain-legacy-value");
    });

    it("fails closed to empty string when the key cannot decrypt (tampered/rotated)", async () => {
      const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
      const encrypted = encryptSecret("original");
      const tampered = encrypted.slice(0, -4) + "abcd";
      expect(decryptSecret(tampered)).toBe("");
    });

    it("reports encryption enabled", async () => {
      const { secretsEncryptionEnabled } = await import("@/lib/crypto");
      expect(secretsEncryptionEnabled()).toBe(true);
    });
  });

  describe("without a configured key (dev fallback)", () => {
    beforeEach(() => {
      delete process.env.SECRETS_ENCRYPTION_KEY;
      process.env.NODE_ENV = "test";
      vi.resetModules();
    });

    it("passes plaintext through unchanged", async () => {
      const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
      expect(encryptSecret("plain-value")).toBe("plain-value");
      expect(decryptSecret("plain-value")).toBe("plain-value");
    });

    it("reports encryption disabled", async () => {
      const { secretsEncryptionEnabled } = await import("@/lib/crypto");
      expect(secretsEncryptionEnabled()).toBe(false);
    });
  });

  describe("in production without a key", () => {
    beforeEach(() => {
      delete process.env.SECRETS_ENCRYPTION_KEY;
      process.env.NODE_ENV = "production";
      vi.resetModules();
    });

    it("throws on first use", async () => {
      const { encryptSecret } = await import("@/lib/crypto");
      expect(() => encryptSecret("anything")).toThrow(/SECRETS_ENCRYPTION_KEY is required/);
    });
  });

  describe("key validation", () => {
    it("rejects a key that does not decode to 32 bytes", async () => {
      process.env.SECRETS_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
      vi.resetModules();
      const { encryptSecret } = await import("@/lib/crypto");
      expect(() => encryptSecret("value")).toThrow(/32 bytes/);
    });

    it("accepts a hex-encoded 32-byte key", async () => {
      process.env.SECRETS_ENCRYPTION_KEY = Buffer.from(TEST_KEY, "base64").toString("hex");
      vi.resetModules();
      const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
      const encrypted = encryptSecret("hex-key-value");
      expect(decryptSecret(encrypted)).toBe("hex-key-value");
    });
  });
});
