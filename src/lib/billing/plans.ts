/**
 * Stripe subscription plan catalog. Each company has its own BillingAccount
 * row - a subscription gates how many non-core business modules (see
 * CORE_MODULE_SLUGS in src/lib/marketplace/catalog.ts) that company may have
 * enabled at once. customer-care and reporter-agent are core: always free,
 * never counted against a plan's quota.
 *
 * Stripe Products/Prices must be created once in the Stripe Dashboard (test
 * mode for dev) - this file only references their IDs via env vars, it does
 * not create them.
 */

export type BillingPlanId = "free" | "starter" | "growth" | "unlimited";
export type BillingCycle = "monthly" | "annual";

export interface BillingPlanDef {
  id: BillingPlanId;
  name: string;
  tagline: string;
  moduleQuota: number; // paid (non-core) modules allowed; Infinity = unlimited
  priceMonthlyCents: number;
  priceAnnualCents: number; // ~2 months free vs. monthly x12
  stripePriceIdMonthly: string;
  stripePriceIdAnnual: string;
  /** Free plan bypasses Stripe entirely - activated directly, no checkout. */
  isFree?: boolean;
}

function monthly(cents: number): number {
  return cents;
}

// Annual = 10x monthly (2 months free), the standard SaaS annual discount
// unless told otherwise.
function annual(monthlyCents: number): number {
  return monthlyCents * 10;
}

export const BILLING_PLANS: BillingPlanDef[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Customer care only, no cost.",
    moduleQuota: 0,
    priceMonthlyCents: 0,
    priceAnnualCents: 0,
    stripePriceIdMonthly: "",
    stripePriceIdAnnual: "",
    isFree: true,
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "Customer care plus 2 modules of your choice.",
    moduleQuota: 2,
    priceMonthlyCents: monthly(2990),
    priceAnnualCents: annual(2990),
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || "",
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL || "",
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Customer care plus 4 modules of your choice.",
    moduleQuota: 4,
    priceMonthlyCents: monthly(9990),
    priceAnnualCents: annual(9990),
    stripePriceIdMonthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY || "",
    stripePriceIdAnnual: process.env.STRIPE_PRICE_GROWTH_ANNUAL || "",
  },
  {
    id: "unlimited",
    name: "Unlimited",
    tagline: "Customer care plus every module, no limits.",
    moduleQuota: Infinity,
    priceMonthlyCents: monthly(15990),
    priceAnnualCents: annual(15990),
    stripePriceIdMonthly: process.env.STRIPE_PRICE_UNLIMITED_MONTHLY || "",
    stripePriceIdAnnual: process.env.STRIPE_PRICE_UNLIMITED_ANNUAL || "",
  },
];

export function getPlan(id: string | null | undefined): BillingPlanDef | undefined {
  return BILLING_PLANS.find((plan) => plan.id === id);
}

export function getPlanByStripePriceId(priceId: string): BillingPlanDef | undefined {
  if (!priceId) return undefined;
  return BILLING_PLANS.find(
    (plan) => plan.stripePriceIdMonthly === priceId || plan.stripePriceIdAnnual === priceId
  );
}

export function getStripePriceId(plan: BillingPlanDef, cycle: BillingCycle): string {
  return cycle === "annual" ? plan.stripePriceIdAnnual : plan.stripePriceIdMonthly;
}
