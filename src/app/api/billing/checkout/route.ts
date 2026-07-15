import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { getBillingAccount, getEnabledPaidModuleCount, invalidateBillingCache } from "@/lib/billing/status";
import { getPlan, getStripePriceId, type BillingCycle } from "@/lib/billing/plans";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "billing:update");
  if (!isAuthenticated(auth)) return auth;

  try {
    const body = await request.json();
    const planId = asString(body.plan);
    const cycle = (asString(body.cycle, "monthly") === "annual" ? "annual" : "monthly") as BillingCycle;

    const plan = getPlan(planId);
    if (!plan) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }

    if (plan.isFree) {
      const account = await getBillingAccount(auth.companyId);
      // Downgrading from a paid plan - cancel the Stripe subscription so the
      // customer isn't still being charged for a plan they just left.
      if (account.stripeSubscriptionId) {
        try {
          const stripe = getStripeClient();
          await stripe.subscriptions.cancel(account.stripeSubscriptionId);
        } catch (error) {
          logger.error("Failed to cancel Stripe subscription during downgrade to free:", error);
        }
      }

      const enabledCount = await getEnabledPaidModuleCount(auth.companyId);
      const moduleQuotaExceeded = enabledCount > plan.moduleQuota;

      await prisma.billingAccount.upsert({
        where: { companyId: auth.companyId },
        create: { companyId: auth.companyId, plan: plan.id, status: "active", moduleQuotaExceeded },
        update: {
          plan: plan.id,
          billingCycle: null,
          status: "active",
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
          gracePeriodEndsAt: null,
          moduleQuotaExceeded,
        },
      });
      invalidateBillingCache(auth.companyId);

      return NextResponse.json({ activated: true });
    }

    const priceId = getStripePriceId(plan, cycle);
    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe price for ${plan.name} (${cycle}) is not configured. Set the STRIPE_PRICE_* env vars.` },
        { status: 500 }
      );
    }

    const stripe = getStripeClient();
    const account = await getBillingAccount(auth.companyId);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: account.stripeCustomerId || undefined,
      client_reference_id: planId,
      success_url: `${appUrl}/billing?checkout=success`,
      cancel_url: `${appUrl}/billing?checkout=cancelled`,
      metadata: { plan: planId, billingCycle: cycle, companyId: auth.companyId },
      subscription_data: { metadata: { plan: planId, billingCycle: cycle, companyId: auth.companyId } },
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error("Failed to create billing checkout session:", error);
    return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 });
  }
}
