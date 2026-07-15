import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prismaUnscoped } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { getPlan, getPlanByStripePriceId } from "@/lib/billing/plans";
import { getEnabledPaidModuleCount, invalidateBillingCache, GRACE_PERIOD_DAYS } from "@/lib/billing/status";

// Stripe webhooks carry no app-level auth/session - the only thing that
// tells us which company an event belongs to is the companyId we stamped
// into Checkout Session / subscription metadata when the checkout was
// created (see src/app/api/billing/checkout/route.ts). Every handler below
// resolves companyId from Stripe's own metadata rather than relying on any
// tenant context, and uses prismaUnscoped since there is no request-scoped
// company to inject.

function planFromSubscription(subscription: Stripe.Subscription): { plan: string | null; cycle: string | null } {
  const priceId = subscription.items.data[0]?.price?.id;
  const plan = priceId ? getPlanByStripePriceId(priceId) : undefined;
  if (!plan) return { plan: null, cycle: null };
  const cycle = plan.stripePriceIdAnnual === priceId ? "annual" : "monthly";
  return { plan: plan.id, cycle };
}

function companyIdFromSubscription(subscription: Stripe.Subscription): string | null {
  const companyId = subscription.metadata?.companyId;
  return typeof companyId === "string" && companyId ? companyId : null;
}

async function syncFromSubscription(subscription: Stripe.Subscription) {
  const companyId = companyIdFromSubscription(subscription);
  if (!companyId) {
    logger.error("Stripe subscription has no companyId in metadata, skipping sync:", undefined, { subscriptionId: subscription.id });
    return;
  }

  const { plan, cycle } = planFromSubscription(subscription);
  const status = subscription.status; // active | past_due | canceled | incomplete | trialing | unpaid...
  const currentPeriodEndSec = subscription.items.data[0]?.current_period_end;

  let moduleQuotaExceeded = false;
  const planDef = getPlan(plan);
  if (planDef && planDef.moduleQuota !== Infinity) {
    const enabledCount = await getEnabledPaidModuleCount(companyId);
    moduleQuotaExceeded = enabledCount > planDef.moduleQuota;
  }

  await prismaUnscoped.billingAccount.upsert({
    where: { companyId },
    create: {
      companyId,
      stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripeSubscriptionId: subscription.id,
      plan,
      billingCycle: cycle,
      status,
      currentPeriodEnd: currentPeriodEndSec ? new Date(currentPeriodEndSec * 1000) : null,
      gracePeriodEndsAt: status === "past_due" ? new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000) : null,
      moduleQuotaExceeded,
    },
    update: {
      stripeSubscriptionId: subscription.id,
      plan,
      billingCycle: cycle,
      status,
      currentPeriodEnd: currentPeriodEndSec ? new Date(currentPeriodEndSec * 1000) : null,
      gracePeriodEndsAt:
        status === "past_due" ? new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000) : null,
      moduleQuotaExceeded,
    },
  });
  invalidateBillingCache(companyId);
}

/** Fallback resolver for events that only carry a subscription id, not the full object. */
async function companyIdForSubscriptionId(subscriptionId: string): Promise<string | null> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return companyIdFromSubscription(subscription);
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    logger.error("Stripe webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const stripe = getStripeClient();
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncFromSubscription(subscription);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        await syncFromSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = companyIdFromSubscription(subscription);
        if (companyId) {
          await prismaUnscoped.billingAccount.upsert({
            where: { companyId },
            create: { companyId, status: "canceled" },
            update: {
              status: "canceled",
              stripeSubscriptionId:
                subscription.id, // kept for reference; portal can still show history
              gracePeriodEndsAt: null,
            },
          });
          invalidateBillingCache(companyId);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionField = (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription;
        const companyId = subscriptionField
          ? await companyIdForSubscriptionId(
              typeof subscriptionField === "string" ? subscriptionField : subscriptionField.id
            )
          : null;
        if (companyId) {
          await prismaUnscoped.billingAccount.upsert({
            where: { companyId },
            create: {
              companyId,
              status: "past_due",
              gracePeriodEndsAt: new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
            },
            update: {
              status: "past_due",
              gracePeriodEndsAt: new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
            },
          });
          invalidateBillingCache(companyId);
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionField = (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription;
        if (subscriptionField) {
          const stripe = getStripeClient();
          const subscriptionId = typeof subscriptionField === "string" ? subscriptionField : subscriptionField.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncFromSubscription(subscription);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    logger.error("Failed to process Stripe webhook event:", error, { type: event.type });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
