import type { Metadata } from "next";
import { MessageCircle, Mail, Phone, Webhook } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { IntegrationCard } from "@/components/marketing/integration-card";
import { PhotoBand } from "@/components/marketing/photo-band";
import { CtaBand } from "@/components/marketing/cta-band";
import { CONNECTOR_PROVIDERS } from "@/lib/connectors/catalog";

const PAGE_TITLE = "Integrations - Paperhuman";
const PAGE_DESCRIPTION =
  "Paperhuman watches WhatsApp, email, and phone in one inbox, plus the ERP systems you already run: SAP, Oracle, Microsoft 365, Dynamics 365 Business Central, and Odoo.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/integrations",
    type: "website",
  },
};

const CHANNEL_CARDS = [
  {
    icon: MessageCircle,
    name: "WhatsApp",
    description: "Connect via WhatsApp Web. Multiple numbers supported, each with its own agent and automation mode.",
  },
  {
    icon: Mail,
    name: "Email",
    description: "IMAP/SMTP. Extra inboxes send through their own credentials, each routed to its own agent.",
  },
  {
    icon: Phone,
    name: "Phone",
    description: "Twilio for calls plus ElevenLabs for voice replies, with the same workflow and approval engine.",
  },
];

export default function IntegrationsPage() {
  return (
    <>
      <section className="mx-auto max-w-[1400px] px-4 pb-4 pt-16 text-center sm:px-6 sm:pt-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">Integrations</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-owly-text md:text-4xl">
            Paperhuman watches everywhere your business already runs.
          </h1>
          <p className="mx-auto mt-3 max-w-[52ch] text-lg text-owly-text-light">
            One inbox for every customer channel, plus direct connectors into the ERP systems you already run, so nothing there goes unwatched.
          </p>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-owly-text md:text-3xl">Channels</h2>
        </Reveal>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {CHANNEL_CARDS.map((channel, index) => (
            <Reveal key={channel.name} delay={index * 0.06}>
              <IntegrationCard icon={channel.icon} name={channel.name} description={channel.description} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <PhotoBand
            src="https://images.unsplash.com/photo-1553413077-190dd305871c?w=1600&auto=format&fit=crop&q=80"
            alt="A warehouse aisle stocked with shelved inventory"
            eyebrow="Where orders and stock meet"
            caption="Connect the ERP that already tracks your inventory and orders."
          />
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight text-owly-text md:text-3xl">ERP connectors</h2>
          <p className="mt-2 max-w-[60ch] text-base text-owly-text-light">
            Connect the ERP that already tracks your orders, stock, and invoices, and Paperhuman watches it
            alongside your channels. Each connector needs your own instance and credentials; there&apos;s no
            generic multi-tenant client, so every connection is set up per customer.
          </p>
        </Reveal>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTOR_PROVIDERS.map((provider, index) => (
            <Reveal key={provider.provider} delay={index * 0.06}>
              <IntegrationCard
                icon={Webhook}
                name={provider.name}
                description={provider.description}
                authType={provider.authType}
              />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <div className="rounded-2xl border border-owly-border bg-owly-surface p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-owly-primary-50">
                <Webhook className="h-5 w-5 text-owly-primary" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="font-semibold text-owly-text">Inbound webhooks</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-owly-text-light">
                  Beyond the named integrations above, an inbound webhook endpoint lets any external system feed
                  signals into your workflows directly, so Paperhuman can watch systems we don&apos;t have a named
                  connector for yet.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <CtaBand />
    </>
  );
}
