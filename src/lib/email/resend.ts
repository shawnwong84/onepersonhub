import { Resend } from "resend";
import { logger } from "@/lib/logger";

// System/transactional email (welcome emails, future account notices), sent
// through Resend as Paperhuman itself. Deliberately separate from
// src/lib/channels/email.ts and src/lib/ai/tools.ts, which send customer
// replies through each company's own SMTP credentials - different sender
// identity, different credentials, must not be merged.

const EMAIL_FROM = process.env.EMAIL_FROM || "Paperhuman <hello@paperhuman.im>";

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

interface SendTransactionalEmailInput {
  to: string;
  subject: string;
  html: string;
}

/** Fire-and-forget transactional email. Never throws - a Resend outage or
 * missing API key must never block the caller's own success path (e.g.
 * registration), so failures are logged and swallowed here. */
export async function sendTransactionalEmail({ to, subject, html }: SendTransactionalEmailInput): Promise<void> {
  const resend = getClient();
  if (!resend) {
    logger.warn("Skipped transactional email: RESEND_API_KEY is not set", { to, subject });
    return;
  }
  try {
    // The Resend SDK does not throw for API-level errors (bad API key,
    // unverified sending domain, etc.) - it resolves with { data: null,
    // error }. Only network-level failures reject the promise. Both must be
    // checked, or a misconfigured account fails silently forever.
    const result = await resend.emails.send({ from: EMAIL_FROM, to, subject, html });
    if (result.error) {
      logger.error("Failed to send transactional email", result.error, { to, subject });
    }
  } catch (error) {
    logger.error("Failed to send transactional email", error, { to, subject });
  }
}
