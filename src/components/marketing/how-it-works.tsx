import { MessageCircle, GitBranch, ShieldCheck, Sparkles, Radar } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const STEPS = [
  {
    icon: Radar,
    label: "Paperhuman watches",
    body: "Every connected channel and system is monitored continuously, not checked when someone remembers to.",
  },
  {
    icon: MessageCircle,
    label: "A signal comes in",
    body: "A message, an order, a stock level, an overdue invoice, anything across what's connected.",
  },
  {
    icon: GitBranch,
    label: "It checks against your rules",
    body: "Matches your conditions and drafts the next step, like a record or a reply.",
  },
  {
    icon: ShieldCheck,
    label: "Escalates to a human",
    body: "The moment a decision is needed, the right person is notified to approve or act.",
  },
  {
    icon: Sparkles,
    label: "Nothing slips through",
    body: "Your customer never has to find the problem before you do.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6 sm:py-20">
      <Reveal>
        <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-owly-text md:text-3xl">
          Always watching. Escalates only when it matters.
        </h2>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
        {STEPS.map((step, i) => (
          <Reveal key={step.label} delay={i * 0.06}>
            <div className="h-full rounded-2xl border border-owly-border bg-owly-surface p-5">
              <step.icon className="h-5 w-5 text-owly-primary" strokeWidth={1.75} />
              <h3 className="mt-4 font-semibold text-owly-text">{step.label}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-owly-text-light">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
