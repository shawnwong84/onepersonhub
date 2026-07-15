import Image from "next/image";
import { Check } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const HIGHLIGHTS = [
  "Orders, inventory, finance, sales, procurement, HR, and more",
  "Turning on an area adds its own watched workspace, not a generic form",
  "Customer Care and the Reporter Agent watcher are always on",
];

export function ModuleDeepDive() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 sm:py-20">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <div className="overflow-hidden rounded-2xl border border-owly-border bg-owly-surface shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-16px_rgba(0,0,0,0.16)] lg:rotate-1">
            <Image
              src="/marketing/marketplace.png"
              alt="Paperhuman module marketplace showing installable business modules"
              width={1600}
              height={1000}
              className="h-auto w-full"
            />
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <h2 className="text-2xl font-semibold tracking-tight text-owly-text md:text-3xl">
            12 areas of your business, watched around the clock.
          </h2>
          <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-owly-text-light">
            Each area comes with its own record types, escalation rules, and Reporter Agent signals, wired into the same channels you already use, so nothing about orders, stock, or invoices slips past unnoticed.
          </p>
          <ul className="mt-6 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-owly-text">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-owly-success" strokeWidth={1.75} />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
