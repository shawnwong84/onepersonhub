import type { Metadata } from "next";
import { Building2, Lock, Users, ScrollText } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { SecurityPillar } from "@/components/marketing/security-pillar";
import { PhotoBand } from "@/components/marketing/photo-band";
import { CtaBand } from "@/components/marketing/cta-band";

const PAGE_TITLE = "Security - Paperhuman";
const PAGE_DESCRIPTION =
  "Per-company data isolation enforced at the data-access layer and the database, secrets encrypted at rest, role-based access control, and a full activity log.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/security",
    type: "website",
  },
};

export default function SecurityPage() {
  return (
    <>
      <section className="mx-auto max-w-[1400px] px-4 pb-4 pt-16 text-center sm:px-6 sm:pt-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">Security</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-owly-text md:text-4xl">
            A watcher you can trust with real customer data.
          </h1>
          <p className="mx-auto mt-3 max-w-[56ch] text-lg text-owly-text-light">
            Paperhuman is multi-tenant: every company runs on shared infrastructure, but no company can ever see
            another&apos;s data. That isolation is enforced automatically at the data-access layer, not by convention.
          </p>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Reveal>
            <SecurityPillar
              icon={Building2}
              title="Per-company tenant isolation"
              body="Every database query is automatically scoped to the caller's company by the application's data-access layer, before it ever reaches Postgres."
            />
          </Reveal>
          <Reveal delay={0.06}>
            <SecurityPillar
              icon={Lock}
              title="Secrets encrypted at rest"
              body="Stored credentials, including SMTP/IMAP passwords, provider API keys, and OAuth tokens, are encrypted with AES-256-GCM before they touch the database."
            />
          </Reveal>
          <Reveal delay={0.12}>
            <SecurityPillar
              icon={Users}
              title="Role-based access control"
              body="Viewer, agent, supervisor, admin. Assignment-scoped access is enforced server-side and visualized in a permission matrix, not just hidden UI."
            />
          </Reveal>
          <Reveal delay={0.18}>
            <SecurityPillar
              icon={ScrollText}
              title="Auditability"
              body="A full activity log records every action by actor. Deactivating a team member kills their session on the next request; password hashes never leave the API."
            />
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <PhotoBand
            src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1600&auto=format&fit=crop&q=80"
            alt="A person pointing at code on a laptop screen"
            eyebrow="Enforced in code, not by convention"
            caption="Every query is scoped before it ever reaches the database."
          />
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <div className="rounded-2xl border border-owly-border bg-owly-primary-50 p-6 sm:p-10">
            <h2 className="text-xl font-semibold tracking-tight text-owly-text md:text-2xl">
              How tenant isolation actually works
            </h2>
            <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-owly-text-light sm:text-base">
              Every request resolves to exactly one company before any data is read or written. From that point on,
              every query (reads, writes, updates, deletes, across every part of the product) passes through a
              single data-access layer that automatically attaches that company&apos;s id, with no route or feature
              able to opt out. That scoping is backed by a real foreign-key constraint at the database level, so a
              row can&apos;t exist without a valid company behind it. It&apos;s not an application-level filter you
              have to trust in isolation, it&apos;s enforced twice, at two different layers.
            </p>
          </div>
        </Reveal>
      </section>

      <CtaBand />
    </>
  );
}
