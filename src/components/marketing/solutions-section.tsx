import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { USE_CASE_PROFILES } from "@/lib/marketing/use-cases";

export function SolutionsSection() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 sm:py-20">
      <Reveal>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">Watching by team</p>
        <h2 className="mt-2 max-w-xl text-2xl font-semibold tracking-tight text-owly-text md:text-3xl">
          What Paperhuman watches, for how your team actually works.
        </h2>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {USE_CASE_PROFILES.map((profile, index) => (
          <Reveal key={profile.slug} delay={index * 0.06}>
            <div className="h-full rounded-2xl border border-owly-border bg-owly-surface p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-owly-primary-50">
                <profile.icon className="h-5 w-5 text-owly-primary" strokeWidth={1.75} />
              </div>
              <h3 className="mt-4 font-semibold text-owly-text">{profile.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-owly-text-light">{profile.body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.1}>
        <Link
          href="/use-cases"
          className="mt-8 inline-flex items-center gap-1 text-sm font-semibold text-owly-primary hover:text-owly-primary-dark"
        >
          See all use cases
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
        </Link>
      </Reveal>
    </section>
  );
}
