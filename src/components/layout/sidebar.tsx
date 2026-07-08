"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Contact,
  MessageSquare,
  Settings,
  Radio,
  Ticket,
  BarChart3,
  ScrollText,
  Timer,
  Zap,
  Workflow,
  Clock,
  Shield,
  FileCode,
  Webhook,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Bot,
  Coins,
  Store,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getModuleIcon } from "@/lib/marketplace/icon-map";

interface NavSection {
  title?: string;
  items: { name: string; href: string; icon: React.ElementType }[];
}

const sections: NavSection[] = [
  {
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Conversations", href: "/conversations", icon: MessageSquare },
      { name: "Approvals", href: "/approvals", icon: ShieldCheck },
      { name: "Customers", href: "/customers", icon: Contact },
      { name: "Tickets", href: "/tickets", icon: Ticket },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { name: "Knowledge Base", href: "/knowledge", icon: BookOpen },
      { name: "Canned Responses", href: "/canned-responses", icon: Zap },
      { name: "Agents", href: "/agents", icon: Bot },
      { name: "Automation", href: "/automation", icon: Workflow },
      { name: "Flows", href: "/flows", icon: GitBranch },
      { name: "Business Hours", href: "/business-hours", icon: Clock },
    ],
  },
  {
    title: "Team",
    items: [
      { name: "Team", href: "/team", icon: Users },
      { name: "SLA Rules", href: "/sla", icon: Timer },
    ],
  },
  {
    title: "Channels",
    items: [
      { name: "Channels", href: "/channels", icon: Radio },
      { name: "Webhooks", href: "/webhooks", icon: Webhook },
    ],
  },
  {
    title: "Insights",
    items: [
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Token Usage", href: "/token-usage", icon: Coins },
      { name: "Activity Log", href: "/activity", icon: ScrollText },
    ],
  },
  {
    title: "System",
    items: [
      { name: "Marketplace", href: "/marketplace", icon: Store },
      { name: "Administration", href: "/admin", icon: Shield },
      { name: "API Docs", href: "/api-docs", icon: FileCode },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

interface InstalledModule {
  slug: string;
  name: string;
  iconName: string;
  isEnabled: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [installedModules, setInstalledModules] = useState<InstalledModule[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/modules?installed=true")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { modules: InstalledModule[] } | null) => {
        if (!cancelled && data?.modules) {
          setInstalledModules(data.modules.filter((module) => module.isEnabled));
        }
      })
      .catch(() => {
        // Nav stays usable without the module list; keep the last known entries.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const navSections = useMemo(() => {
    if (installedModules.length === 0) return sections;
    const moduleSection: NavSection = {
      title: "Modules",
      items: installedModules.map((module) => ({
        name: module.name,
        href: `/modules/${module.slug}`,
        icon: getModuleIcon(module.iconName),
      })),
    };
    const systemIndex = sections.findIndex((section) => section.title === "System");
    return [...sections.slice(0, systemIndex), moduleSection, ...sections.slice(systemIndex)];
  }, [installedModules]);

  return (
    <aside
      className={cn(
        "flex flex-col bg-owly-sidebar text-white transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-semibold text-white">
          C
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-base font-bold tracking-tight">Cosstigo</h1>
            <p className="text-[10px] text-white/50">AI Customer Care</p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-3">
        {navSections.map((section, si) => (
          <div key={si}>
            {section.title && !collapsed && (
              <p className="px-3 mb-1 text-[10px] uppercase tracking-wider text-white/40 font-medium">
                {section.title}
              </p>
            )}
            {collapsed && si > 0 && (
              <div className="mx-3 mb-2 border-t border-white/10" />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    prefetch={false}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-owly-sidebar-active text-white"
                        : "text-white/65 hover:bg-owly-sidebar-hover hover:text-white"
                    )}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && <span>{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-2 py-2 border-t border-white/10">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-1.5 rounded-md text-white/40 hover:text-white hover:bg-owly-sidebar-hover transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
