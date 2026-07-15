-- Single-tenant Stripe subscription billing. Mirrors the Settings singleton
-- pattern (id 'default') - this deployment has exactly one billing account.

CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "plan" TEXT,
    "billingCycle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'none',
    "currentPeriodEnd" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "moduleQuotaExceeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);
