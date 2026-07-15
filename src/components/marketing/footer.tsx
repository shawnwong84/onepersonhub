import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/security", label: "Security" },
      { href: "/integrations", label: "Integrations" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/use-cases", label: "Customers" },
      { href: "/contact", label: "Contact" },
      { href: "/api-docs", label: "Docs" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/request-demo", label: "Request a demo" },
      { href: "/login", label: "Log in" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-owly-border">
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <BrandMark size={28} />
              <span className="text-base font-semibold text-owly-text">Paperhuman</span>
            </Link>
            <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-owly-text-light">
              The watcher for small teams: monitors your channels and systems, escalates to a human for action.
            </p>
            <a
              href="mailto:hello@paperhuman.im"
              className="mt-3 inline-block text-sm text-owly-text-light hover:text-owly-text"
            >
              hello@paperhuman.im
            </a>
          </div>

          <div className="grid grid-cols-2 gap-6 sm:contents">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.heading}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-owly-text-light">
                  {column.heading}
                </p>
                <ul className="mt-3 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-owly-text-light hover:text-owly-text"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 border-t border-owly-border pt-6 text-xs text-owly-text-light">
          © {new Date().getFullYear()} Paperhuman
        </div>
      </div>
    </footer>
  );
}
