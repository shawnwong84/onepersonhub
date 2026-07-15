import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import { getBillingAccount, getEnabledPaidModuleCount, isBillingLocked } from "@/lib/billing/status";
import { getPlan } from "@/lib/billing/plans";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "billing:read");
  if (!isAuthenticated(auth)) return auth;

  const account = await getBillingAccount(auth.companyId);
  const plan = getPlan(account.plan);
  const enabledPaidModules = await getEnabledPaidModuleCount(auth.companyId);

  return NextResponse.json({
    status: account.status,
    plan: account.plan,
    billingCycle: account.billingCycle,
    currentPeriodEnd: account.currentPeriodEnd,
    gracePeriodEndsAt: account.gracePeriodEndsAt,
    moduleQuotaExceeded: account.moduleQuotaExceeded,
    locked: isBillingLocked(account),
    moduleQuota: plan ? (plan.moduleQuota === Infinity ? null : plan.moduleQuota) : 0,
    enabledPaidModules,
  });
}
