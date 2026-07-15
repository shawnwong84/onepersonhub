import Link from "next/link";
import { Check, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BillingCycle, BillingPlanDef } from "@/lib/billing/plans";

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function PlanCard({ plan, cycle }: { plan: BillingPlanDef; cycle: BillingCycle }) {
  const isPopular = plan.id === "growth";
  const priceCents = cycle === "annual" ? plan.priceAnnualCents : plan.priceMonthlyCents;

  return (
    <div
      className={cn(
        "rounded-[2rem] p-2 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        isPopular
          ? "bg-owly-primary/10 ring-1 ring-owly-primary/30"
          : "bg-black/[0.03] ring-1 ring-black/5 dark:bg-white/[0.03] dark:ring-white/10"
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
            <Check className="h-4 w-4 flex-shrink-0 text-owly-success" strokeWidth={1.75} />
            Customer care + Reporter Agent
          </li>
          {plan.moduleQuota > 0 && (
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 flex-shrink-0 text-owly-success" strokeWidth={1.75} />
              {plan.moduleQuota === Infinity
                ? "Watches every area of your business"
                : `${plan.moduleQuota} areas of your choice, watched`}
            </li>
          )}
        </ul>

        <Link
          href="/request-demo"
          className="group mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-owly-primary py-3 pl-6 pr-2 text-sm font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-owly-primary-dark active:scale-[0.98]"
        >
          Request a demo
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
          </span>
        </Link>
      </div>
    </div>
  );
}
