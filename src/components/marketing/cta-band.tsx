import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

export function CtaBand() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 sm:py-20">
      <Reveal>
        <div className="rounded-[2rem] bg-owly-primary px-8 py-14 text-center sm:px-16">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Let Paperhuman start watching today.
          </h2>
          <p className="mx-auto mt-3 max-w-[46ch] text-base text-white/80">
            Connect your first channel or system in a few minutes, and only get pulled in when it matters.
          </p>
          <Link
            href="/request-demo"
            className="group mt-7 inline-flex items-center gap-2 rounded-full bg-white py-3.5 pl-7 pr-2.5 text-base font-semibold text-slate-900 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/90 active:scale-[0.98]"
          >
            Request a demo
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
              <ArrowUpRight className="h-4 w-4 text-slate-900" strokeWidth={1.75} />
            </span>
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
