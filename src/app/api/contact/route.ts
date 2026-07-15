import { NextRequest, NextResponse } from "next/server";
import { sendTransactionalEmail } from "@/lib/email/resend";
import { contactMessageInternalEmailHtml, contactThankYouEmailHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_TO = "hello@paperhuman.im";

// POST /api/contact - the marketing site's "Contact us" form. Unauthenticated
// by design (public path in middleware.ts), same trust level as
// /api/demo-request. Sends one internal notification to the inbox and one
// thank-you email back to the sender via Resend.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = asString(body.name);
    const email = asString(body.email).toLowerCase();
    const message = asString(body.message);

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are all required." },
        { status: 400 }
      );
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    // Fire-and-forget, same as /api/demo-request - an undeliverable
    // notification must never fail the sender's submission.
    void sendTransactionalEmail({
      to: CONTACT_TO,
      subject: `New contact message from ${name}`,
      html: contactMessageInternalEmailHtml({ name, email, message }),
    });
    void sendTransactionalEmail({
      to: email,
      subject: "We got your message",
      html: contactThankYouEmailHtml(name),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to submit contact message:", error);
    return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 500 });
  }
}
