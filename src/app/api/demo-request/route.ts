import { NextRequest, NextResponse } from "next/server";
import { sendTransactionalEmail } from "@/lib/email/resend";
import { demoRequestInternalEmailHtml, demoRequestThankYouEmailHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO_REQUEST_TO = "hello@paperhuman.im";

// POST /api/demo-request - the marketing site's "Request a demo" form.
// Unauthenticated by design (public path in middleware.ts), same trust
// level as /api/register. Sends one internal notification to the sales
// inbox and one thank-you email back to the requester via Resend.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = asString(body.name);
    const email = asString(body.email).toLowerCase();
    const company = asString(body.company);
    const message = asString(body.message);

    if (!name || !email || !company) {
      return NextResponse.json(
        { error: "Name, email, and company are all required." },
        { status: 400 }
      );
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    // Fire-and-forget, same as the welcome email in /api/register - an
    // undeliverable notification must never fail the requester's submission.
    void sendTransactionalEmail({
      to: DEMO_REQUEST_TO,
      subject: `New demo request from ${company}`,
      html: demoRequestInternalEmailHtml({ name, email, company, message }),
    });
    void sendTransactionalEmail({
      to: email,
      subject: "We got your demo request",
      html: demoRequestThankYouEmailHtml(name),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to submit demo request:", error);
    return NextResponse.json({ error: "Could not submit your request. Please try again." }, { status: 500 });
  }
}
