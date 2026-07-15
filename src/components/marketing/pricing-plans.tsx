"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BILLING_PLANS, type BillingCycle } from "@/lib/billing/plans";
import { PlanCard } from "@/components/marketing/plan-card";

export function PricingPlans() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <div>
      <div className="flex justify-center">
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

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {BILLING_PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} cycle={cycle} />
        ))}
      </div>
    </div>
  );
}
