import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";

let cachedKey: Buffer | null | undefined;

/**
 * Resolves the 32-byte secrets encryption key from SECRETS_ENCRYPTION_KEY
 * (base64 or hex). Returns null when unset so callers can fall back to
 * storing plaintext in non-production environments.
 */
function getEncryptionKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;

  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SECRETS_ENCRYPTION_KEY is required in production. Generate one with: openssl rand -base64 32"
      );
    }
    cachedKey = null;
    return cachedKey;
  }

  let key: Buffer;
  try {
    key = raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  } catch {
    throw new Error("SECRETS_ENCRYPTION_KEY is not valid base64 or hex.");
  }
  if (key.length !== 32) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}. Generate one with: openssl rand -base64 32`
    );
  }
  cachedKey = key;
  return cachedKey;
}

/** True once a real encryption key is configured. */
export function secretsEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null;
}

/**
 * Encrypts a plaintext secret. Returns the value unchanged when no key is
 * configured (dev-only fallback) or when the value is empty.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getEncryptionKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * Decrypts a value produced by encryptSecret. Values without the enc:v1:
 * prefix are assumed to be legacy plaintext (pre-encryption rows, or
 * dev environments without a key) and are returned as-is.
 */
export function decryptSecret(value: string): string {
  if (!value || !value.startsWith(PREFIX)) return value;
  const key = getEncryptionKey();
  if (!key) return value;

  try {
    const buffer = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const ciphertext = buffer.subarray(28);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Wrong/rotated key: fail closed to an empty secret rather than throwing,
    // so a misconfigured key degrades a feature instead of crashing the app.
    return "";
  }
}
