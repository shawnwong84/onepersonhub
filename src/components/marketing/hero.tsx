import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AbstractArtwork } from "@/components/marketing/abstract-artwork";

export function Hero() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 pb-20 pt-16 sm:px-6 sm:pt-20 lg:pt-24">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <div>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-owly-text md:text-5xl lg:text-6xl">
            The watcher between your business and your customers.
          </h1>
          <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-owly-text-light">
            Paperhuman connects to your channels and systems, catches what needs attention before your customers do, and escalates to a real human for action.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/request-demo"
              className="group inline-flex items-center gap-2 rounded-full bg-owly-primary py-3.5 pl-7 pr-2.5 text-base font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-owly-primary-dark active:scale-[0.98]"
            >
              Request a demo
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
                <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
              </span>
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-x-6 -inset-y-6 -z-10 rounded-[2.5rem] bg-owly-primary/5 lg:-inset-x-10 lg:-inset-y-10" />
          <AbstractArtwork className="pointer-events-none absolute -right-16 -top-16 -z-10 h-56 w-56 lg:-right-24 lg:-top-24 lg:h-72 lg:w-72" />
          <div className="overflow-hidden rounded-2xl border border-owly-border bg-owly-surface shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-16px_rgba(0,0,0,0.16)] lg:-rotate-1">
            <Image
              src="/marketing/paperhuman_hero_3.png"
              alt="An agent escalating a low-stock order to a human after Paperhuman catches it"
              width={1672}
              height={941}
              priority
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
