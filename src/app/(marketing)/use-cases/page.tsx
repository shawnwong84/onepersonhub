import type { Metadata } from "next";
import { Reveal } from "@/components/marketing/reveal";
import { PhotoBand } from "@/components/marketing/photo-band";
import { CtaBand } from "@/components/marketing/cta-band";
import { USE_CASE_PROFILES } from "@/lib/marketing/use-cases";

const PAGE_TITLE = "Customers - Paperhuman";
const PAGE_DESCRIPTION = "Who Paperhuman watches for: small teams running customer support, orders, service, and inventory on WhatsApp, email, and phone.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/use-cases",
    type: "website",
  },
};

export default function CustomersPage() {
  return (
    <>
      <section className="mx-auto max-w-[1400px] px-4 pb-4 pt-16 text-center sm:px-6 sm:pt-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">Customers</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-owly-text md:text-4xl">
            Built for teams who can&apos;t watch everything themselves.
          </h1>
          <p className="mx-auto mt-3 max-w-[56ch] text-lg text-owly-text-light">
            Paperhuman is early. Instead of manufacturing testimonials, here is what each part of the product
            actually watches, so you can tell quickly if it fits your team.
          </p>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {USE_CASE_PROFILES.map((profile, index) => (
            <Reveal key={profile.slug} delay={index * 0.06} id={profile.slug} className="scroll-mt-24">
              <div className="h-full rounded-2xl border border-owly-border bg-owly-surface p-6 sm:p-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-owly-primary-50">
                  <profile.icon className="h-5 w-5 text-owly-primary" strokeWidth={1.75} />
                </div>
                <h2 className="mt-4 font-semibold text-owly-text">{profile.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-owly-text-light">{profile.body}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {profile.fits.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-owly-border px-2.5 py-1 text-xs font-medium text-owly-text-light"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <PhotoBand
            src="https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1600&auto=format&fit=crop&q=80"
            alt="Two coworkers reviewing code together at a desk"
            eyebrow="Whatever your team looks like"
            caption="From a team of one to a team spread across departments."
          />
        </Reveal>
      </section>

      <CtaBand />
    </>
  );
}
