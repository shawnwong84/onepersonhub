import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { getBillingAccount } from "@/lib/billing/status";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "billing:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const account = await getBillingAccount(auth.companyId);
    if (!account.stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe customer on file yet - subscribe to a plan first." }, { status: 400 });
    }

    const stripe = getStripeClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: `${appUrl}/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error("Failed to create billing portal session:", error);
    return NextResponse.json({ error: "Failed to open billing portal" }, { status: 500 });
  }
}
