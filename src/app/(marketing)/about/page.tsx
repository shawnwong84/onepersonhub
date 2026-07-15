import type { Metadata } from "next";
import { Target, Users2, ShieldCheck, Sparkles } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { PresenceMap } from "@/components/marketing/presence-map";
import { PhotoBand } from "@/components/marketing/photo-band";
import { CtaBand } from "@/components/marketing/cta-band";

const MARKET_COUNT = 6;

const PAGE_TITLE = "About - Paperhuman";
const PAGE_DESCRIPTION =
  "Paperhuman is the watcher for one-person teams and small businesses: it monitors your channels and systems and escalates to a human, instead of enterprise procurement panels.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/about",
    type: "website",
  },
};

const VALUES = [
  {
    icon: Target,
    title: "Built for the smallest teams",
    body: "Most automation platforms are priced and designed for enterprise procurement. Paperhuman starts free and stays usable for a team of one.",
  },
  {
    icon: Users2,
    title: "It watches, a human decides",
    body: "Paperhuman escalates, it doesn't decide for you. Judgment stays with a person, every time it actually matters.",
  },
  {
    icon: ShieldCheck,
    title: "Isolation you can verify",
    body: "Every company's data is scoped at the data-access layer and backed by a real database constraint, not a promise.",
  },
  {
    icon: Sparkles,
    title: "One watcher, not five tools",
    body: "Channels, systems, and signals live in one place instead of being stitched together from integrations you have to check yourself.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="mx-auto max-w-[1400px] px-4 pb-4 pt-16 text-center sm:px-6 sm:pt-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">About</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-owly-text md:text-4xl">
            The watcher for teams too small to watch everything themselves.
          </h1>
          <p className="mx-auto mt-3 max-w-[56ch] text-lg text-owly-text-light">
            Paperhuman watches your WhatsApp, email, phone, and connected systems, so problems get caught and
            handed to a human before your customer ever notices them.
          </p>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <div className="rounded-2xl border border-owly-border bg-owly-surface p-6 sm:p-10">
            <h2 className="text-xl font-semibold tracking-tight text-owly-text md:text-2xl">Why it exists</h2>
            <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-owly-text-light sm:text-base">
              A one-person shop and a ten-person support team both get the same inbound flood: WhatsApp orders,
              email complaints, phone calls, stock that runs low without warning. Enterprise monitoring tools are
              built for the second team, priced for the tenth. Paperhuman watches for both, starting with a free
              plan that covers customer care and the Reporter Agent watcher, then growing area by area as the
              business does.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <PhotoBand
            src="/marketing/groupphoto_1.png"
            alt="The Paperhuman team at the office, in front of the Paperhuman sign"
            eyebrow="Built by a small team, for small teams"
            caption="We know what it's like to run support with too few hands."
          />
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 overflow-hidden rounded-2xl border border-owly-border lg:order-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/marketing/groupphoto_2.png"
                alt="The Paperhuman team celebrating together on a company sports day"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">Who we are</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-owly-text md:text-3xl">
                A young, multi-national team, still small enough to answer our own support inbox.
              </h2>
              <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-owly-text-light">
                We&apos;re a small team spread across a few countries, and we started Paperhuman because we spent too
                many of our own working hours chasing eyeballs: replying to the same questions, refreshing the same
                inbox, checking the same stock sheet. That&apos;s work a machine should be watching, not a person.
              </p>
              <div className="mt-6 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-owly-text">Vision</p>
                  <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-owly-text-light">
                    Hand the repetitive, eyeball-chasing work to AI, so people get to spend their time on the parts
                    of the job that actually need a human: judgment, relationships, and decisions.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-owly-text">Mission</p>
                  <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-owly-text-light">
                    Give small and medium businesses the same always-on coverage that used to require a whole
                    support floor, so a small team can operate with bigger wings.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">Where we operate</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-owly-text md:text-3xl">
                Serving teams across {MARKET_COUNT} markets today.
              </h2>
              <p className="mt-3 max-w-[48ch] text-base leading-relaxed text-owly-text-light">
                Paperhuman supports businesses in Singapore, Malaysia, Thailand, Indonesia, China, and Hong Kong,
                with more markets added as demand grows.
              </p>
            </div>
            <PresenceMap />
          </div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-owly-text md:text-3xl">What we believe</h2>
        </Reveal>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((value, index) => (
            <Reveal key={value.title} delay={index * 0.06}>
              <div className="h-full rounded-2xl border border-owly-border bg-owly-surface p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-owly-primary-50">
                  <value.icon className="h-5 w-5 text-owly-primary" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 font-semibold text-owly-text">{value.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-owly-text-light">{value.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <CtaBand />
    </>
  );
}
