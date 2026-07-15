import Image from "next/image";
import { Reveal } from "@/components/marketing/reveal";
import { BrandLogo } from "@/components/marketing/brand-logo";

type Partner =
  | { name: string; slug: "whatsapp" | "sap" | "odoo" | "shopee" }
  | { name: string; image: string; invertDark?: boolean; lightChip?: boolean }
  | { name: string };

// Real vector marks where a source is available (Simple Icons for
// WhatsApp/SAP/Odoo/Shopee, official brand SVGs saved under
// public/marketing/logos for OpenAI/AWS). Lazada, Amazon, Oracle, and
// Dynamics 365 have no real logo asset available to this project - see the
// note in brand-logo.tsx - so they intentionally stay plain wordmarks
// rather than a hand-drawn approximation of their logo.
const PARTNERS: Partner[] = [
  { name: "WhatsApp", slug: "whatsapp" },
  { name: "OpenAI", image: "/marketing/logos/openai.svg", invertDark: true },
  // AWS's mark has no official dark-background variant (dark navy wordmark),
  // so it gets a fixed light chip instead of `invertDark`, which would just
  // flip navy-on-dark to a wrong, non-brand blue-on-light.
  { name: "AWS", image: "/marketing/logos/aws.svg", lightChip: true },
  { name: "SAP", slug: "sap" },
  { name: "Shopee", slug: "shopee" },
  { name: "Lazada" },
  { name: "Amazon" },
  { name: "Oracle" },
  { name: "Dynamics 365" },
  { name: "Odoo", slug: "odoo" },
];

export function PartnersSection() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <Reveal>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-owly-text-light">
          Watching across the infrastructure and systems you already trust
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          {PARTNERS.map((partner) => (
            <div
              key={partner.name}
              className="flex h-16 items-center justify-center rounded-xl border border-owly-border bg-owly-surface px-4"
            >
              {"image" in partner ? (
                <span className={"lightChip" in partner && partner.lightChip ? "rounded-md bg-white px-2.5 py-1.5" : ""}>
                  <Image
                    src={partner.image}
                    alt={partner.name}
                    width={96}
                    height={24}
                    className={`h-6 w-auto object-contain ${partner.invertDark ? "dark:invert" : ""}`}
                  />
                </span>
              ) : (
                <BrandLogo
                  name={partner.name}
                  slug={"slug" in partner ? partner.slug : undefined}
                  className={"slug" in partner ? "h-6 w-6" : "text-sm"}
                />
              )}
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
