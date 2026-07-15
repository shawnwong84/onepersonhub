"use client";

import { Header } from "@/components/layout/header";
import { Check, Loader2, ArrowUpRight, ShieldAlert, CreditCard } from "lucide-react";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { BILLING_PLANS, type BillingCycle, type BillingPlanId } from "@/lib/billing/plans";

interface BillingStatus {
  status: string;
  plan: string | null;
  billingCycle: string | null;
  currentPeriodEnd: string | null;
  gracePeriodEndsAt: string | null;
  moduleQuotaExceeded: boolean;
  locked: boolean;
  moduleQuota: number | null;
  enabledPaidModules: number;
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatDate(value: string | null): string {
  if (!value) return "--";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  none: "No active subscription",
  trialing: "Trialing",
  active: "Active",
  past_due: "Payment past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
};

function BillingPageInner() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [checkingOut, setCheckingOut] = useState<BillingPlanId | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status");
      if (res.ok) setBilling(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      toast({ type: "success", title: "Subscription confirmed", description: "Thanks — your plan is now active." });
      load();
    } else if (checkout === "cancelled") {
      toast({ type: "info", title: "Checkout cancelled" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function choosePlan(planId: BillingPlanId) {
    setCheckingOut(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, cycle }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to start checkout");
      if (body.activated) {
        toast({ type: "success", title: "Free plan activated" });
        await load();
        setCheckingOut(null);
        return;
      }
      window.location.href = body.url;
    } catch (err) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Failed to start checkout" });
      setCheckingOut(null);
    }
  }

  async function openPortal() {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to open billing portal");
      window.location.href = body.url;
    } catch (err) {
      toast({ type: "error", title: err instanceof Error ? err.message : "Failed to open billing portal" });
      setOpeningPortal(false);
    }
  }

  const subscribed = billing && billing.plan && billing.status !== "none" && billing.status !== "canceled";

  return (
    <>
      <Header title="Billing" description="Choose a plan and manage your Paperhuman subscription." />

      <div className="p-4 sm:p-6 space-y-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-owly-primary" />
          </div>
        ) : (
          <>
            {billing?.locked && (
              <div className="flex items-start gap-3 rounded-2xl border border-owly-danger/30 bg-owly-danger/5 px-5 py-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-owly-danger" />
                <div>
                  <p className="text-sm font-semibold text-owly-text">
                    {billing.status === "past_due" ? "Your last payment failed and the grace period has ended." : "A subscription is required to use Paperhuman."}
                  </p>
                  <p className="mt-0.5 text-sm text-owly-text-light">
                    Choose a plan below to restore access.
                  </p>
                </div>
              </div>
            )}

            {billing?.moduleQuotaExceeded && (
              <div className="flex items-start gap-3 rounded-2xl border border-owly-warning/30 bg-owly-warning/5 px-5 py-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-owly-warning" />
                <div>
                  <p className="text-sm font-semibold text-owly-text">Module quota exceeded</p>
                  <p className="mt-0.5 text-sm text-owly-text-light">
                    Your current plan allows fewer modules than you have enabled. Disable modules on the{" "}
                    <a href="/marketplace" className="font-medium text-owly-primary underline underline-offset-2">
                      Marketplace
                    </a>{" "}
                    page, or upgrade your plan below.
                  </p>
                </div>
              </div>
            )}

            {subscribed && (
              <section className="rounded-2xl border border-owly-border bg-owly-surface p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-owly-text-light">Current plan</p>
                    <p className="mt-1 text-xl font-semibold text-owly-text">
                      {BILLING_PLANS.find((p) => p.id === billing?.plan)?.name || billing?.plan}
                      <span className="ml-2 text-sm font-normal text-owly-text-light">
                        ({billing?.billingCycle === "annual" ? "annual" : "monthly"})
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-owly-text-light">
                      Status: <span className="font-medium text-owly-text">{STATUS_LABEL[billing?.status || ""] || billing?.status}</span>
                      {billing?.currentPeriodEnd && <> · Renews {formatDate(billing.currentPeriodEnd)}</>}
                    </p>
                    <p className="mt-1 text-sm text-owly-text-light">
                      {billing?.moduleQuota === null
                        ? `${billing?.enabledPaidModules} modules enabled (unlimited)`
                        : `${billing?.enabledPaidModules} of ${billing?.moduleQuota} paid modules enabled`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openPortal}
                    disabled={openingPortal}
                    className="group inline-flex items-center gap-2 rounded-full bg-owly-primary py-3 pl-6 pr-2 text-sm font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-owly-primary-dark active:scale-[0.98] disabled:opacity-60"
                  >
                    {openingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    Manage subscription
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
                      <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
                    </span>
                  </button>
                </div>
              </section>
            )}

            <section>
              <div className="flex flex-col items-center gap-6 text-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">Plans</p>
                  <h2 className="mt-2 text-2xl font-semibold text-owly-text">Pick the plan that fits your team</h2>
                  <p className="mt-1 text-sm text-owly-text-light">
                    Customer care and the Reporter Agent chatbot are included free on every plan.
                  </p>
                </div>

                <div className="inline-flex items-center rounded-full border border-owly-border bg-owly-bg p-1">
                  {(["monthly", "annual"] as BillingCycle[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setCycle(option)}
                      className={cn(
                        "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                        cycle === option ? "bg-owly-surface text-owly-text shadow-sm" : "text-owly-text-light"
                      )}
                    >
                      {option}
                      {option === "annual" && (
                        <span className="ml-1.5 rounded-full bg-owly-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-owly-success">
                          2 months free
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                {BILLING_PLANS.map((plan) => {
                  const isCurrent = billing?.plan === plan.id && subscribed;
                  const isPopular = plan.id === "growth";
                  const priceCents = cycle === "annual" ? plan.priceAnnualCents : plan.priceMonthlyCents;

                  return (
                    <div
                      key={plan.id}
                      className={cn(
                        "rounded-[2rem] p-2 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                        isPopular ? "bg-owly-primary/10 ring-1 ring-owly-primary/30" : "bg-black/[0.03] ring-1 ring-black/5 dark:bg-white/[0.03] dark:ring-white/10"
                      )}
                    >
                      <div className="relative flex h-full flex-col rounded-[calc(2rem-0.5rem)] bg-owly-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_24px_-8px_rgba(0,0,0,0.08)]">
                        {isPopular && (
                          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-owly-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                            Most popular
                          </span>
                        )}
                        <h3 className="text-lg font-semibold text-owly-text">{plan.name}</h3>
                        <p className="mt-1 text-sm text-owly-text-light">{plan.tagline}</p>

                        <div className="mt-5 flex items-baseline gap-1">
                          {plan.isFree ? (
                            <span className="text-3xl font-semibold text-owly-text">Free</span>
                          ) : (
                            <>
                              <span className="text-3xl font-semibold text-owly-text">${formatCents(priceCents)}</span>
                              <span className="text-sm text-owly-text-light">/{cycle === "annual" ? "yr" : "mo"}</span>
                            </>
                          )}
                        </div>

                        <ul className="mt-5 space-y-2 text-sm text-owly-text-light">
                          <li className="flex items-center gap-2">
                            <Check className="h-4 w-4 flex-shrink-0 text-owly-success" strokeWidth={1.5} />
                            Customer care + Reporter Agent (free)
                          </li>
                          {plan.moduleQuota > 0 && (
                            <li className="flex items-center gap-2">
                              <Check className="h-4 w-4 flex-shrink-0 text-owly-success" strokeWidth={1.5} />
                              {plan.moduleQuota === Infinity ? "All business modules" : `${plan.moduleQuota} business modules of your choice`}
                            </li>
                          )}
                        </ul>

                        <button
                          type="button"
                          disabled={isCurrent || checkingOut === plan.id}
                          onClick={() => choosePlan(plan.id)}
                          className={cn(
                            "group mt-6 inline-flex items-center justify-center gap-2 rounded-full py-3 pl-6 pr-2 text-sm font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:cursor-default disabled:opacity-70",
                            isCurrent
                              ? "bg-owly-bg text-owly-text-light"
                              : "bg-owly-primary text-white hover:bg-owly-primary-dark"
                          )}
                        >
                          {checkingOut === plan.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isCurrent ? (
                            "Current plan"
                          ) : (
                            <>
                              Choose {plan.name}
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
                                <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingPageInner />
    </Suspense>
  );
}
