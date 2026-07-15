import { prismaUnscoped } from "@/lib/prisma";
import { CORE_MODULE_SLUGS } from "@/lib/marketplace/catalog";
import { getPlan } from "@/lib/billing/plans";
import type { BillingAccount } from "@/generated/prisma/client";

export const GRACE_PERIOD_DAYS = 7;

const LOCKED_STATUSES = new Set(["none", "canceled", "incomplete"]);

// One BillingAccount per company - cache keyed by companyId.
const cacheByCompany = new Map<string, BillingAccount>();
const cacheLoading = new Map<string, Promise<BillingAccount>>();

async function loadBillingAccount(companyId: string): Promise<BillingAccount> {
  return prismaUnscoped.billingAccount.upsert({
    where: { companyId },
    create: { companyId },
    update: {},
  });
}

/** Cached read of a company's BillingAccount row (created on first read). */
export async function getBillingAccount(companyId: string): Promise<BillingAccount> {
  const cached = cacheByCompany.get(companyId);
  if (cached) return cached;

  let loading = cacheLoading.get(companyId);
  if (!loading) {
    loading = loadBillingAccount(companyId).then((account) => {
      cacheByCompany.set(companyId, account);
      cacheLoading.delete(companyId);
      return account;
    });
    cacheLoading.set(companyId, loading);
  }
  return loading;
}

/** Call after any write to BillingAccount (webhook events, admin actions). */
export function invalidateBillingCache(companyId: string): void {
  cacheByCompany.delete(companyId);
  cacheLoading.delete(companyId);
}

/** True when the whole app should redirect to /billing instead of rendering. */
export function isBillingLocked(account: BillingAccount): boolean {
  if (LOCKED_STATUSES.has(account.status)) return true;
  if (account.status === "past_due") {
    return !account.gracePeriodEndsAt || account.gracePeriodEndsAt.getTime() < Date.now();
  }
  return false;
}

/** Count of currently-enabled non-core (paid, quota-counted) modules. */
export async function getEnabledPaidModuleCount(companyId: string): Promise<number> {
  return prismaUnscoped.businessModule.count({
    where: {
      companyId,
      isEnabled: true,
      slug: { notIn: CORE_MODULE_SLUGS },
    },
  });
}

/** Whether enabling one more paid module would exceed the account's plan quota. */
export async function canEnableAnotherPaidModule(account: BillingAccount): Promise<boolean> {
  const plan = getPlan(account.plan);
  if (!plan) return false; // no active plan = no paid modules
  if (plan.moduleQuota === Infinity) return true;
  const enabledCount = await getEnabledPaidModuleCount(account.companyId);
  return enabledCount < plan.moduleQuota;
}
