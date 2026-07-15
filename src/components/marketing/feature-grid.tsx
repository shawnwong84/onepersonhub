import Image from "next/image";
import Link from "next/link";
import { Radar, Users, BookOpen, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/marketing/reveal";

interface ScreenshotCellProps {
  title: string;
  body: string;
  src: string;
  alt: string;
  className?: string;
}

function ScreenshotCell({ title, body, src, alt, className }: ScreenshotCellProps) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-owly-border bg-owly-surface", className)}>
      <div className="relative h-44 w-full overflow-hidden border-b border-owly-border sm:h-52">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 40vw, 100vw"
          className="object-cover object-left-top"
        />
      </div>
      <div className="p-5">
        <h3 className="font-semibold text-owly-text">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-owly-text-light">{body}</p>
      </div>
    </div>
  );
}

interface TextCellProps {
  icon: React.ElementType;
  title: string;
  body: string;
  tint: string;
  className?: string;
}

function TextCell({ icon: Icon, title, body, tint, className }: TextCellProps) {
  return (
    <div className={cn("flex h-full flex-col justify-between rounded-2xl border border-owly-border p-5", tint, className)}>
      <Icon className="h-5 w-5 text-owly-primary" strokeWidth={1.75} />
      <div className="mt-4">
        <h3 className="font-semibold text-owly-text">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-owly-text-light">{body}</p>
      </div>
    </div>
  );
}

export function FeatureGrid({ showAllLink = true }: { showAllLink?: boolean } = {}) {
  return (
    <section id="features" className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 sm:py-20">
      <Reveal>
        <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-owly-text md:text-3xl">
          Everything Paperhuman watches, in one place.
        </h2>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-6">
        <Reveal className="lg:col-span-4">
          <ScreenshotCell
            title="Channels"
            body="WhatsApp, email, and phone watched in one inbox, each with its own agent and automation mode."
            src="/marketing/conversations.png"
            alt="Paperhuman conversations inbox with WhatsApp and email threads"
            className="h-full"
          />
        </Reveal>
        <Reveal delay={0.06} className="lg:col-span-2">
          <ScreenshotCell
            title="AI agents"
            body="Named agents with their own knowledge scope, tone, and workflow set."
            src="/marketing/agents.png"
            alt="Paperhuman AI agent configuration screen"
            className="h-full"
          />
        </Reveal>

        <Reveal delay={0.12} className="lg:col-span-3">
          <ScreenshotCell
            title="Automation"
            body="Checks conditions automatically, then pauses and escalates for approval."
            src="/marketing/flows.png"
            alt="Paperhuman workflow list"
            className="h-full"
          />
        </Reveal>
        <Reveal delay={0.18} className="lg:col-span-3">
          <TextCell
            icon={Radar}
            title="Reporter Agent"
            body="Watches for low stock, overdue invoices, and stale approvals, then escalates to the right person."
            tint="bg-owly-accent/10"
            className="h-full"
          />
        </Reveal>

        <Reveal delay={0.24} className="lg:col-span-3">
          <TextCell
            icon={Users}
            title="Team & security"
            body="Role-based access from viewer to admin, with a permission matrix and full activity log."
            tint="bg-owly-primary-50"
            className="h-full"
          />
        </Reveal>
        <Reveal delay={0.3} className="lg:col-span-3">
          <TextCell
            icon={BookOpen}
            title="Knowledge base"
            body="Documents, spreadsheets, and crawled websites, with citations on every AI reply."
            tint="bg-owly-bg"
            className="h-full"
          />
        </Reveal>
      </div>

      {showAllLink && (
        <div className="mt-8 text-center">
          <Link
            href="/features"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-owly-text hover:text-owly-primary"
          >
            See all features
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px" strokeWidth={1.75} />
          </Link>
        </div>
      )}
    </section>
  );
}
