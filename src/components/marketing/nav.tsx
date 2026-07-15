"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  MessageCircle,
  Bot,
  GitBranch,
  Store,
  Radar,
  ShieldCheck,
  Plug,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { USE_CASE_PROFILES } from "@/lib/marketing/use-cases";

const PRODUCT_FEATURE_LINKS = [
  { href: "/features#channels", label: "Channels", description: "WhatsApp, email, and phone, all watched in one inbox.", icon: MessageCircle },
  { href: "/features#ai-agents", label: "AI agents", description: "Named agents that know when to escalate.", icon: Bot },
  { href: "/features#workflows", label: "Workflows", description: "Checks conditions, then escalates for approval.", icon: GitBranch },
  { href: "/features#modules", label: "Module marketplace", description: "Orders, inventory, finance, and more, watched.", icon: Store },
  { href: "/features#reporter-agent", label: "Reporter Agent", description: "A chatbot that watches your business.", icon: Radar },
];

const PRODUCT_PLATFORM_LINKS = [
  { href: "/security", label: "Security", description: "Tenant isolation, encryption, and RBAC.", icon: ShieldCheck },
  { href: "/integrations", label: "Integrations", description: "Everywhere Paperhuman watches.", icon: Plug },
];

const PRODUCT_SOLUTIONS_LINKS = USE_CASE_PROFILES.map((profile) => ({
  href: `/use-cases#${profile.slug}`,
  label: profile.title,
  description: profile.body,
  icon: profile.icon,
}));

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, []);

  function openNow() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function closeSoon() {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-owly-border/70 bg-owly-surface/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark size={28} />
          <span className="text-base font-semibold text-owly-text">Paperhuman</span>
        </Link>

        <div className="hidden items-center gap-5 lg:flex">
          <div
            ref={containerRef}
            className="relative"
            onMouseEnter={openNow}
            onMouseLeave={closeSoon}
          >
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="flex items-center gap-1 text-sm font-medium text-owly-text-light hover:text-owly-text"
            >
              Product
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
            </button>

            {open && (
              <div className="absolute left-1/2 top-full w-[800px] -translate-x-1/2 pt-3">
                <div className="grid grid-cols-3 gap-1 rounded-2xl border border-owly-border bg-owly-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-16px_rgba(0,0,0,0.16)]">
                  <div className="space-y-0.5">
                    <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-owly-text-light">
                      Solutions
                    </p>
                    {PRODUCT_SOLUTIONS_LINKS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-owly-bg"
                      >
                        <item.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-owly-primary" strokeWidth={1.75} />
                        <span>
                          <span className="block text-sm font-medium text-owly-text">{item.label}</span>
                          <span className="block text-xs text-owly-text-light">{item.description}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                  <div className="space-y-0.5">
                    <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-owly-text-light">
                      Features
                    </p>
                    {PRODUCT_FEATURE_LINKS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-owly-bg"
                      >
                        <item.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-owly-primary" strokeWidth={1.75} />
                        <span>
                          <span className="block text-sm font-medium text-owly-text">{item.label}</span>
                          <span className="block text-xs text-owly-text-light">{item.description}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                  <div className="space-y-0.5">
                    <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-owly-text-light">
                      Platform
                    </p>
                    {PRODUCT_PLATFORM_LINKS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-owly-bg"
                      >
                        <item.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-owly-primary" strokeWidth={1.75} />
                        <span>
                          <span className="block text-sm font-medium text-owly-text">{item.label}</span>
                          <span className="block text-xs text-owly-text-light">{item.description}</span>
                        </span>
                      </Link>
                    ))}

                    <div className="mt-3 rounded-xl bg-owly-primary-50 p-3">
                      <p className="text-xs font-medium text-owly-text">
                        Ready to see it running end to end?
                      </p>
                      <Link
                        href="/request-demo"
                        onClick={() => setOpen(false)}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-owly-primary hover:text-owly-primary-dark"
                      >
                        Request a demo
                        <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Link href="/use-cases" className="text-sm font-medium text-owly-text-light hover:text-owly-text">
            Customers
          </Link>
          <Link href="/about" className="text-sm font-medium text-owly-text-light hover:text-owly-text">
            About
          </Link>
          <Link href="/api-docs" className="text-sm font-medium text-owly-text-light hover:text-owly-text">
            Docs
          </Link>
          <Link href="/contact" className="text-sm font-medium text-owly-text-light hover:text-owly-text">
            Contact
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-owly-text-light hover:text-owly-text sm:inline-block"
          >
            Log in
          </Link>
          <Link
            href="/request-demo"
            className="group inline-flex items-center gap-1.5 rounded-full bg-owly-primary py-2 pl-4 pr-1.5 text-sm font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-owly-primary-dark active:scale-[0.98]"
          >
            Request a demo
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px">
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
