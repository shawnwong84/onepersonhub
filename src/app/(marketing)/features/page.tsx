import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Bot, GitBranch, Store, Radar, ShieldCheck, BookOpen, ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { FeatureDetailCard } from "@/components/marketing/feature-detail-card";
import { PhotoBand } from "@/components/marketing/photo-band";
import { CtaBand } from "@/components/marketing/cta-band";
import { MARKETPLACE_MODULES } from "@/lib/marketplace/catalog";

const PAGE_TITLE = "Features - Paperhuman";
const PAGE_DESCRIPTION =
  "Channels, AI agents, visual workflows, 12 watched business areas, and a Reporter Agent that escalates to a human the moment something needs attention.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/features",
    type: "website",
  },
};

export default function FeaturesPage() {
  return (
    <>
      <section className="mx-auto max-w-[1400px] px-4 pb-4 pt-16 text-center sm:px-6 sm:pt-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-owly-primary">Features</p>
          <h1 className="mx-auto mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-owly-text md:text-4xl">
            Everything Paperhuman watches, in one place.
          </h1>
          <p className="mx-auto mt-3 max-w-[52ch] text-lg text-owly-text-light">
            From the first signal to the moment it needs a human, nothing goes unwatched.
          </p>
        </Reveal>
      </section>

      <FeatureGrid showAllLink={false} />

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Reveal id="channels" className="scroll-mt-24">
            <FeatureDetailCard
              icon={MessageCircle}
              eyebrow="Channels"
              title="One inbox for WhatsApp, email, and phone"
              body="Every conversation is watched in one place, whichever channel it came from."
              points={[
                "WhatsApp (WhatsApp Web), Email (IMAP/SMTP), Phone (Twilio + ElevenLabs voice)",
                "Multiple accounts per channel: extra numbers and inboxes, each with its own agent and automation mode",
                "Per-channel automation modes: workflow-first, AI-first, approval-required, manual-only",
                "Inbound webhook endpoint for external systems to trigger workflows",
              ]}
            />
          </Reveal>
          <Reveal id="ai-agents" delay={0.06} className="scroll-mt-24">
            <FeatureDetailCard
              icon={Bot}
              eyebrow="AI agents"
              title="Named agents, scoped knowledge, real analytics"
              body="Each agent has its own personality, knowledge scope, and set of workflows, routed automatically."
              points={[
                "System prompt, tone, knowledge scope, workflow set, and escalation department per agent",
                "Automatic routing: channel account → default agent → prioritized assignments",
                "Test console: dry-run any agent against a sample message before it goes live",
                "Per-agent analytics: AI fallback rate, workflow success rate, human handoff rate",
              ]}
            />
          </Reveal>
          <Reveal id="workflows" delay={0.12} className="scroll-mt-24">
            <FeatureDetailCard
              icon={GitBranch}
              eyebrow="Workflows"
              title="Visual automation with a human in the loop"
              body="Build branching logic without code, and pause for approval wherever it matters."
              points={[
                "Triggers, true/false conditions, delays, approvals, replies, tickets, tags, API calls",
                "MCP tool calls and skill prompts for custom logic",
                "Approval steps pause execution: agents approve, edit, skip, or reject from the thread",
                "Full run logs: every trigger, skip reason, action, and error",
              ]}
            />
          </Reveal>
          <Reveal id="modules" delay={0.18} className="scroll-mt-24">
            <FeatureDetailCard
              icon={Store}
              eyebrow="Module marketplace"
              title={`${MARKETPLACE_MODULES.length} areas of your business, watched in one click`}
              body="Orders, inventory, finance, sales, HR, and more, each watched in its own workspace, not raw JSON."
              points={[
                "Status pipelines, structured record forms, one-click lifecycle actions",
                "Order line items and a Sales CRM kanban board",
                "Low-stock and overdue-invoice alerts",
                "Confirmed orders can message customers back through the source channel",
              ]}
            />
          </Reveal>
          <Reveal id="reporter-agent" delay={0.24} className="scroll-mt-24">
            <FeatureDetailCard
              icon={Radar}
              eyebrow="Reporter Agent"
              title="A chatbot that watches your business for you"
              body="Ask it questions, or let it come to you when something needs attention."
              points={[
                "Chatbot on every page, scoped to only the modules you can access",
                "Heartbeat scans for low stock, overdue invoices, stale approvals, unanswered conversations",
                "Delivers proactive chat messages, notifications, and critical-only email",
              ]}
            />
          </Reveal>
          <Reveal delay={0.3}>
            <FeatureDetailCard
              icon={BookOpen}
              eyebrow="Knowledge base"
              title="Documents, spreadsheets, and crawled sites"
              body="Every AI reply cites its sources. Grounded, not guessed."
              points={[
                "PDF/DOCX/CSV/XLSX/images with OCR, plus sitemap-aware website crawling",
                "Semantic search with embeddings, chunking, and citations on every reply",
                "Excel-style table editor for spreadsheet-derived documents",
              ]}
            />
          </Reveal>
        </div>

        <Reveal delay={0.36} className="mt-6">
          <FeatureDetailCard
            icon={ShieldCheck}
            eyebrow="Team & security"
            title="Role-based access, built in"
            body="Viewer, agent, supervisor, admin. Assignment-scoped visibility is enforced server-side, not just hidden in the UI."
          />
          <Link
            href="/security"
            className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-owly-text hover:text-owly-primary"
          >
            See the full security breakdown
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px" strokeWidth={1.75} />
          </Link>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <Reveal>
          <PhotoBand
            src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1600&auto=format&fit=crop&q=80"
            alt="Two coworkers celebrating with a high five at their desk"
            eyebrow="Less busywork, more wins"
            caption="Every automated reply and approval is time your team gets back."
          />
        </Reveal>
      </section>

      <CtaBand />
    </>
  );
}
