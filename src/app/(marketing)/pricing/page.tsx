import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { PricingFaq } from "@/components/marketing/pricing-faq";
import { PhotoBand } from "@/components/marketing/photo-band";
import { CtaBand } from "@/components/marketing/cta-band";
import { MARKETPLACE_MODULES, CORE_MODULE_SLUGS } from "@/lib/marketplace/catalog";

const PAGE_TITLE = "Pricing - Paperhuman";
const PAGE_DESCRIPTION =
  "Customer care and the Reporter Agent are free on every plan. Pick how many areas of your business Paperhuman watches, from Starter to Unlimited.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/pricing",
    type: "website",
  },
};

const paidModules = MARKETPLACE_MODULES.filter((module) => !CORE_MODULE_SLUGS.includes(module.slug));

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-[1400px] px-4 pb-4 pt-16 text-center sm:px-6 sm:pt-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">Pricing</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-owly-text md:text-4xl">
            Pick the plan that fits your team.
          </h1>
          <p className="mx-auto mt-3 max-w-[52ch] text-lg text-owly-text-light">
            Customer care and the Reporter Agent chatbot are included free on every plan, forever.
          </p>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <PricingPlans />
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <div className="rounded-2xl border border-owly-border bg-owly-primary-50 p-6 text-center sm:p-8">
            <div className="mx-auto flex max-w-md items-center justify-center gap-2 text-owly-text">
              <Check className="h-5 w-5 flex-shrink-0 text-owly-success" strokeWidth={1.75} />
              <p className="font-medium">
                Customer Care and Reporter Agent are core modules, always free, never counted against your quota.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <h2 className="text-center text-2xl font-semibold tracking-tight text-owly-text md:text-3xl">
            Which areas count against my quota?
          </h2>
          <p className="mx-auto mt-2 max-w-[52ch] text-center text-base text-owly-text-light">
            Only paid areas count. Turn on any {paidModules.length} of these for Paperhuman to watch, up to your plan&apos;s quota.
          </p>
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3">
            {paidModules.map((module) => (
              <div
                key={module.slug}
                className="rounded-xl border border-owly-border bg-owly-surface px-4 py-3 text-center text-sm font-medium text-owly-text"
              >
                {module.name}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <PhotoBand
            src="https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1600&auto=format&fit=crop&q=80"
            alt="An overhead view of a desk with multiple laptops and devices"
            eyebrow="No seat count, no paperwork"
            caption="Pick a plan by module quota, not by how many people are on your team."
          />
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <h2 className="text-center text-2xl font-semibold tracking-tight text-owly-text md:text-3xl">
            Frequently asked questions
          </h2>
          <PricingFaq />
        </Reveal>
      </section>

      <CtaBand />
    </>
  );
}
