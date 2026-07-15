import type { Metadata } from "next";
import { Reveal } from "@/components/marketing/reveal";
import { DemoRequestForm } from "@/components/marketing/demo-request-form";

const PAGE_TITLE = "Request a demo - Paperhuman";
const PAGE_DESCRIPTION = "Tell us about your team and we'll set up a time to show you Paperhuman in action.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/request-demo",
    type: "website",
  },
};

export default function RequestDemoPage() {
  return (
    <section className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-20">
      <Reveal>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">Request a demo</p>
          <h1 className="mx-auto mt-2 max-w-md text-3xl font-semibold tracking-tight text-owly-text md:text-4xl">
            See Paperhuman watching your business.
          </h1>
          <p className="mx-auto mt-3 max-w-[46ch] text-base text-owly-text-light">
            Tell us a bit about your team and we&apos;ll be in touch to set up a time.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.1} className="mt-10">
        <DemoRequestForm />
      </Reveal>
    </section>
  );
}
