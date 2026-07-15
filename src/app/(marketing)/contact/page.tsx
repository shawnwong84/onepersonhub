import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Mail, Rocket } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { PhotoBand } from "@/components/marketing/photo-band";
import { ContactForm } from "@/components/marketing/contact-form";

const PAGE_TITLE = "Contact - Paperhuman";
const PAGE_DESCRIPTION = "Reach out or request a demo to see Paperhuman watching your business.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/contact",
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-16 text-center sm:px-6 sm:py-20">
      <Reveal>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">Contact</p>
        <h1 className="mx-auto mt-2 max-w-xl text-3xl font-semibold tracking-tight text-owly-text md:text-4xl">
          The fastest way to reach us is to just start.
        </h1>
        <p className="mx-auto mt-3 max-w-[52ch] text-lg text-owly-text-light">
          Request a demo and we will set up a time to show you Paperhuman watching your channels and systems.
        </p>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 items-start gap-6 text-left lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <ContactForm />

          <div className="space-y-4">
            <Link
              href="/request-demo"
              className="group flex flex-col items-start rounded-2xl border border-owly-border bg-owly-surface p-6 hover:border-owly-primary/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-owly-primary-50">
                <Rocket className="h-5 w-5 text-owly-primary" strokeWidth={1.75} />
              </div>
              <h2 className="mt-4 font-semibold text-owly-text">Ready to buy, not just ask?</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-owly-text-light">
                Request a demo instead and we will set up a time to walk you through it.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-owly-primary">
                Request a demo
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px" strokeWidth={1.75} />
              </span>
            </Link>

            <a
              href="mailto:hello@paperhuman.im"
              className="flex items-center gap-1.5 text-sm font-semibold text-owly-text-light hover:text-owly-primary"
            >
              <Mail className="h-4 w-4" strokeWidth={1.75} />
              hello@paperhuman.im
            </a>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.2} className="mt-10">
        <PhotoBand
          src="https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1600&auto=format&fit=crop&q=80"
          alt="A handshake between two people in an office"
          eyebrow="Real people, not a ticket queue"
          caption="Once you're signed in, support is built into the product."
        />
      </Reveal>
    </section>
  );
}
