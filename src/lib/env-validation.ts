/**
 * Fails fast at boot, with a clear actionable message, when required env
 * vars are missing or still set to a documented placeholder value in
 * production. Without this, a misconfigured production deployment would
 * start up fine and only surface an error lazily on the first request that
 * happens to touch auth or secrets encryption — much harder to diagnose.
 */

const JWT_SECRET_PLACEHOLDERS = new Set([
  "change-me",
  "change-this-to-a-random-secret",
  "your-random-secret-here",
  "your-random-secret-at-least-32-characters",
  "a-random-secret-string-at-least-32-chars",
  "another-random-secret-string",
]);

const DATABASE_URL_PLACEHOLDER = "postgresql://postgres:postgres@localhost:5432/owly?schema=public";

export class StartupEnvValidationError extends Error {
  constructor(problems: string[]) {
    super(
      `Refusing to start: invalid production configuration.\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\nSet these in your production environment before starting the app.`
    );
    this.name = "StartupEnvValidationError";
  }
}

/**
 * Validates required env vars. Only enforces the "defaulted"/placeholder
 * checks in production — dev and test environments intentionally use the
 * documented defaults, and already have their own narrower fallback logic
 * (see src/lib/auth.ts, src/lib/crypto.ts).
 */
export async function validateStartupEnv(): Promise<void> {
  const problems: string[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    problems.push("DATABASE_URL is not set.");
  } else if (isProduction && databaseUrl === DATABASE_URL_PLACEHOLDER) {
    problems.push(
      "DATABASE_URL is still set to the documented local-dev default (postgres:postgres@localhost). Point it at your real production database."
    );
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProduction) problems.push("JWT_SECRET is not set.");
  } else if (isProduction && JWT_SECRET_PLACEHOLDERS.has(jwtSecret)) {
    problems.push(
      "JWT_SECRET is still set to a documented placeholder value. Generate a real one: openssl rand -base64 32"
    );
  } else if (isProduction && jwtSecret.length < 32) {
    problems.push(`JWT_SECRET is only ${jwtSecret.length} characters; use at least 32 for a real secret.`);
  }

  // SECRETS_ENCRYPTION_KEY's own required-in-production and
  // decodes-to-32-bytes checks already live in src/lib/crypto.ts and run the
  // moment that module is touched; surface them here too so a missing/
  // invalid key is caught at boot instead of on the first secret read/write.
  if (isProduction) {
    try {
      const { secretsEncryptionEnabled } = await import("@/lib/crypto");
      secretsEncryptionEnabled();
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (problems.length > 0) {
    throw new StartupEnvValidationError(problems);
  }
}
