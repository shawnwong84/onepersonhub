interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Are Customer Care and the Reporter Agent really free on every plan?",
    answer:
      "Yes. Both are core, always-watching, and never count against your plan's quota, including on the Free plan.",
  },
  {
    question: "What counts against my plan's quota?",
    answer:
      "Only the paid areas you choose to have watched (Orders, Products, Inventory and Warehouse, Supplier Management, Finance and Billing, Sales CRM, Procurement, HR and Recruitment, Field Service, Office Productivity). Starter includes 2, Growth includes 4, Unlimited includes all of them.",
  },
  {
    question: "What happens if I go over my quota?",
    answer:
      "You can't turn on another paid area until you disable one or upgrade your plan. Areas already being watched keep working normally.",
  },
  {
    question: "How does the annual discount work?",
    answer: "Annual billing is 10x the monthly price on every paid plan, effectively 2 months free.",
  },
  {
    question: "Can I upgrade or downgrade later?",
    answer:
      "Yes, from the Billing page at any time. Upgrading raises your quota immediately; downgrading takes effect at your next billing cycle.",
  },
];

export function PricingFaq() {
  return (
    <div className="mx-auto mt-6 max-w-3xl space-y-3">
      {FAQ_ITEMS.map((item) => (
        <details
          key={item.question}
          className="group rounded-2xl border border-owly-border bg-owly-surface p-5 open:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_24px_-8px_rgba(0,0,0,0.08)]"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-owly-text">
            {item.question}
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-owly-bg text-owly-text-light transition-transform duration-300 group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-owly-text-light">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
