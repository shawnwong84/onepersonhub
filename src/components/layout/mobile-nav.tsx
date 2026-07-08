"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bot, Database, LayoutDashboard, MessageSquare, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/components/layout/sidebar";
import { getModuleIcon } from "@/lib/marketplace/icon-map";

interface InstalledModule {
  slug: string;
  name: string;
  iconName: string;
  isEnabled: boolean;
}

const TABS = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "Inbox", href: "/conversations", icon: MessageSquare },
  { name: "Modules", href: "/modules", icon: Database },
  { name: "Reporter", href: "/reporter", icon: Bot },
];

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [installedModules, setInstalledModules] = useState<InstalledModule[]>([]);

  useEffect(() => {
    setMoreOpen(false);
    let cancelled = false;
    fetch("/api/marketplace/modules?installed=true")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { modules: InstalledModule[] } | null) => {
        if (!cancelled && data?.modules) {
          setInstalledModules(data.modules.filter((module) => module.isEnabled));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-14 left-0 right-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-owly-surface p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm font-semibold text-owly-text">All pages</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-md p-1 text-owly-text-light hover:bg-owly-bg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {installedModules.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-owly-text-light">
                  Modules
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {installedModules.map((module) => {
                    const Icon = getModuleIcon(module.iconName);
                    return (
                      <Link
                        key={module.slug}
                        href={`/modules/${module.slug}`}
                        className="flex flex-col items-center gap-1 rounded-lg bg-owly-bg p-2 text-center"
                      >
                        <Icon className="h-5 w-5 text-owly-primary" />
                        <span className="line-clamp-2 text-[10px] font-medium text-owly-text">{module.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
            {NAV_SECTIONS.map((section, index) => (
              <div key={index} className="mb-3">
                {section.title && (
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-owly-text-light">
                    {section.title}
                  </p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {section.items.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg p-2 text-center",
                        isActive(item.href) ? "bg-owly-primary-50" : "bg-owly-bg"
                      )}
                    >
                      <item.icon className={cn("h-5 w-5", isActive(item.href) ? "text-owly-primary" : "text-owly-text-light")} />
                      <span className="line-clamp-2 text-[10px] font-medium text-owly-text">{item.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-owly-border bg-owly-surface lg:hidden">
        {TABS.map((tab) => (
          <Link
            key={tab.name}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
              isActive(tab.href) ? "text-owly-primary" : "text-owly-text-light"
            )}
          >
            <tab.icon className="h-5 w-5" />
            {tab.name}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((value) => !value)}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
            moreOpen ? "text-owly-primary" : "text-owly-text-light"
          )}
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  );
}
