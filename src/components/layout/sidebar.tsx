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
  ChevronDown,
  GitBranch,
  Bot,
  Coins,
  Store,
  Plug,
  CreditCard,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getModuleIcon } from "@/lib/marketplace/icon-map";
import type { Permission } from "@/lib/rbac";

const COLLAPSED_SECTIONS_KEY = "owly-sidebar-collapsed-sections";
const COLLAPSED_KEY = "owly-sidebar-collapsed";

type NavBadgeKey = "approvals" | "escalatedConversations" | "openTickets";

export interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  // Undefined = visible to everyone (e.g. Dashboard, API Docs) - everything
  // else is hidden unless the current user's live (editable) permission set
  // includes this. Checked against /api/auth's `permissions` field, not a
  // hardcoded role list, so this stays correct after an admin edits a role.
  permission?: Permission;
  // Keys into the /api/nav-counts response - shows a small count badge next
  // to this item when > 0.
  badgeKey?: NavBadgeKey;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Conversations", href: "/conversations", icon: MessageSquare, permission: "conversations:read", badgeKey: "escalatedConversations" },
      { name: "Approvals", href: "/approvals", icon: ShieldCheck, permission: "conversations:read", badgeKey: "approvals" },
      { name: "Customers", href: "/customers", icon: Contact, permission: "customers:read" },
      { name: "Tickets", href: "/tickets", icon: Ticket, permission: "tickets:read", badgeKey: "openTickets" },
      { name: "Reporter", href: "/reporter", icon: Bot, permission: "module:read" },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { name: "Knowledge Base", href: "/knowledge", icon: BookOpen, permission: "knowledge:read" },
      { name: "Canned Responses", href: "/canned-responses", icon: Zap, permission: "canned:read" },
      { name: "Agents", href: "/agents", icon: Bot, permission: "agents:read" },
      { name: "Automation", href: "/automation", icon: Workflow, permission: "automation:read" },
      { name: "Flows", href: "/flows", icon: GitBranch, permission: "automation:read" },
      { name: "Business Hours", href: "/business-hours", icon: Clock, permission: "business-hours:read" },
    ],
  },
  {
    title: "Team",
    items: [
      { name: "Team", href: "/team", icon: Users, permission: "team:read" },
      { name: "SLA Rules", href: "/sla", icon: Timer, permission: "sla:read" },
    ],
  },
  {
    title: "Channels",
    items: [
      { name: "Channels", href: "/channels", icon: Radio, permission: "channels:read" },
      { name: "Webhooks", href: "/webhooks", icon: Webhook, permission: "webhooks:read" },
      { name: "Connectors", href: "/connectors", icon: Plug, permission: "connectors:read" },
    ],
  },
  {
    title: "System",
    items: [
      { name: "Marketplace", href: "/marketplace", icon: Store, permission: "marketplace:read" },
      { name: "Analytics", href: "/analytics", icon: BarChart3, permission: "analytics:read" },
      { name: "Token Usage", href: "/token-usage", icon: Coins, permission: "analytics:read" },
      { name: "Activity Log", href: "/activity", icon: ScrollText, permission: "activity:read" },
      { name: "Administration", href: "/admin", icon: Shield, permission: "admin:read" },
      { name: "API Docs", href: "/api-docs", icon: FileCode },
      { name: "Settings", href: "/settings", icon: Settings, permission: "settings:read" },
      { name: "Billing", href: "/billing", icon: CreditCard, permission: "billing:read" },
    ],
  },
];

interface InstalledModule {
  slug: string;
  name: string;
  iconName: string;
  isEnabled: boolean;
}

// Items with no `permission` are always visible (Dashboard, API Docs,
// installed-module links). `permissions === null` means the fetch hasn't
// resolved yet, so gated items stay hidden rather than flashing visible
// then disappearing. Drops any section left with zero visible items so an
// empty section header doesn't render.
export function filterSectionsByPermission(
  sections: NavSection[],
  permissions: Set<string> | null
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.permission || (permissions !== null && permissions.has(item.permission))
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [installedModules, setInstalledModules] = useState<InstalledModule[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  // null = not loaded yet, so every gated item stays hidden until we know
  // for sure rather than flashing then disappearing once permissions arrive.
  const [permissions, setPermissions] = useState<Set<string> | null>(null);
  const [navCounts, setNavCounts] = useState<Partial<Record<NavBadgeKey, number>>>({});
  // Icon-only mode tooltips are portaled to <body> instead of rendered
  // inline: the nav list scrolls (overflow-y-auto), and per the CSS spec an
  // element can't have overflow-x: visible alongside overflow-y: auto - the
  // browser silently forces both axes non-visible, clipping an absolutely
  // positioned tooltip even though its own opacity/position are correct.
  const [hoveredTooltip, setHoveredTooltip] = useState<{ name: string; top: number; left: number } | null>(
    null
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
      if (stored) setCollapsedSections(JSON.parse(stored));
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Ignore malformed/inaccessible storage - sidebar just starts expanded.
    }
  }, []);

  const toggleSection = (title: string) => {
    setCollapsedSections((current) => {
      const next = { ...current, [title]: !current[title] };
      try {
        localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        // Non-fatal - the toggle still works for this session.
      }
      return next;
    });
  };

  const toggleCollapsed = () => {
    setHoveredTooltip(null);
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Non-fatal - the toggle still works for this session.
      }
      return next;
    });
  };

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

  useEffect(() => {
    let cancelled = false;
    // Re-fetched on every route change (like the modules list above) so a
    // permission an admin just changed takes effect without a full reload.
    fetch("/api/auth")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { permissions?: string[] } | null) => {
        if (!cancelled && data?.permissions) {
          setPermissions(new Set(data.permissions));
        }
      })
      .catch(() => {
        // Nav stays usable without permission data; keep the last known set.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    function loadCounts() {
      fetch("/api/nav-counts")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: Partial<Record<NavBadgeKey, number>> | null) => {
          if (!cancelled && data) setNavCounts(data);
        })
        .catch(() => {
          // Nav stays usable without badge counts; keep the last known values.
        });
    }
    loadCounts();
    // Also refresh periodically, not just on navigation - these counts
    // (pending approvals, escalated conversations, open tickets) change in
    // the background while an agent stays on one page.
    const interval = window.setInterval(loadCounts, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pathname]);

  const navSections = useMemo(() => {
    let sections = NAV_SECTIONS;
    if (installedModules.length > 0) {
      const moduleSection: NavSection = {
        title: "Modules",
        items: installedModules.map((module) => ({
          name: module.name,
          href: `/modules/${module.slug}`,
          icon: getModuleIcon(module.iconName),
        })),
      };
      // Pinned right after the ungrouped Home section - modules are a
      // primary workspace, not an afterthought buried near the bottom.
      sections = [NAV_SECTIONS[0], moduleSection, ...NAV_SECTIONS.slice(1)];
    }
    return filterSectionsByPermission(sections, permissions);
  }, [installedModules, permissions]);

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col bg-owly-sidebar text-white transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm font-semibold text-white">
          C
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-base font-bold tracking-tight">Paperhuman</h1>
            <p className="text-[10px] text-white/50">AI Customer Care</p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-3">
        {navSections.map((section, si) => {
          // Per-section collapse only applies in the wide sidebar - the
          // icon-only collapsed mode always shows every item (there's no
          // title to click to re-expand a section in that mode).
          const isSectionCollapsed =
            !collapsed && section.title ? !!collapsedSections[section.title] : false;
          const sectionPanelId = section.title ? `sidebar-section-${section.title}` : undefined;

          return (
          <div key={si}>
            {section.title && !collapsed && (
              <button
                onClick={() => toggleSection(section.title as string)}
                aria-expanded={!isSectionCollapsed}
                aria-controls={sectionPanelId}
                className="focus-ring flex w-full items-center justify-between rounded px-3 mb-1 text-[10px] uppercase tracking-wider text-white/40 font-medium hover:text-white/70 transition-colors"
              >
                {section.title}
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    isSectionCollapsed && "-rotate-90"
                  )}
                />
              </button>
            )}
            {collapsed && si > 0 && (
              <div className="mx-3 mb-2 border-t border-white/10" />
            )}
            {!isSectionCollapsed && (
              <div id={sectionPanelId} className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href));

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      prefetch={false}
                      onMouseEnter={
                        collapsed
                          ? (e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredTooltip({
                                name: item.name,
                                top: rect.top + rect.height / 2,
                                left: rect.right + 8,
                              });
                            }
                          : undefined
                      }
                      onMouseLeave={collapsed ? () => setHoveredTooltip(null) : undefined}
                      onFocus={
                        collapsed
                          ? (e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredTooltip({
                                name: item.name,
                                top: rect.top + rect.height / 2,
                                left: rect.right + 8,
                              });
                            }
                          : undefined
                      }
                      onBlur={collapsed ? () => setHoveredTooltip(null) : undefined}
                      className={cn(
                        "focus-ring flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors",
                        isActive
                          ? "bg-owly-sidebar-active text-white"
                          : "text-white/65 hover:bg-owly-sidebar-hover hover:text-white"
                      )}
                    >
                      <span className="relative flex-shrink-0">
                        <item.icon className="h-4 w-4" />
                        {collapsed && Boolean(item.badgeKey && navCounts[item.badgeKey]) && (
                          <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-owly-danger text-[9px] font-bold leading-none text-white">
                            {navCounts[item.badgeKey!]! > 9 ? "9+" : navCounts[item.badgeKey!]}
                          </span>
                        )}
                      </span>
                      {!collapsed && (
                        <span className="flex flex-1 items-center justify-between gap-2 min-w-0">
                          <span className="truncate">{item.name}</span>
                          {Boolean(item.badgeKey && navCounts[item.badgeKey]) && (
                            <span className="flex-shrink-0 rounded-full bg-owly-danger px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                              {navCounts[item.badgeKey!]! > 99 ? "99+" : navCounts[item.badgeKey!]}
                            </span>
                          )}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          );
        })}
      </nav>

      <div className="px-2 py-2 border-t border-white/10">
        <button
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="focus-ring flex items-center justify-center w-full py-1.5 rounded-md text-white/40 hover:text-white hover:bg-owly-sidebar-hover transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {hoveredTooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-owly-sidebar-hover px-2 py-1 text-xs font-medium text-white shadow-lg"
            style={{ top: hoveredTooltip.top, left: hoveredTooltip.left }}
          >
            {hoveredTooltip.name}
          </span>,
          document.body
        )}
    </aside>
  );
}
