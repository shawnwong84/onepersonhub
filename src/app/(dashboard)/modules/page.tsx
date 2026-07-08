"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Download, Package, Search, Signal, Store } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketplaceModule {
  slug: string;
  name: string;
  category: string;
  description: string;
  channels: string[];
  records: string[];
  workflows: string[];
  reporterSignals: string[];
  isInstalled: boolean;
  isEnabled: boolean;
}

interface MarketplaceResponse {
  modules: MarketplaceModule[];
}

interface ModuleAnalytics {
  summary: {
    installedModules: number;
    enabledModules: number;
    recordsCreated: number;
    openSignals: number;
    resolvedSignals: number;
    approvalVolume: number;
    automationSuccessRate: number;
  };
}

export default function ModulesPage() {
  const [modules, setModules] = useState<MarketplaceModule[]>([]);
  const [analytics, setAnalytics] = useState<ModuleAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!showAll) params.set("installed", "true");
      if (search.trim()) params.set("search", search.trim());
      const [res, analyticsRes] = await Promise.all([
        fetch(`/api/marketplace/modules?${params.toString()}`),
        fetch("/api/modules/analytics?days=30"),
      ]);
      if (res.ok) {
        const data = (await res.json()) as MarketplaceResponse;
        setModules(data.modules);
      }
      if (analyticsRes.ok) {
        setAnalytics((await analyticsRes.json()) as ModuleAnalytics);
      }
    } finally {
      setLoading(false);
    }
  }, [search, showAll]);

  useEffect(() => {
    const timeout = window.setTimeout(load, 200);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const enabledCount = useMemo(
    () => modules.filter((module) => module.isInstalled && module.isEnabled).length,
    [modules]
  );

  return (
    <div className="h-full overflow-y-auto bg-owly-bg">
      <div className="mx-auto max-w-[1400px] space-y-5 p-5">
        <div className="flex flex-col gap-4 rounded-xl border border-owly-border bg-owly-surface p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-owly-primary">
              <Database className="h-4 w-4" />
              Modules
            </div>
            <h1 className="mt-2 text-2xl font-bold text-owly-text">Installed business modules</h1>
            <p className="mt-1 max-w-3xl text-sm text-owly-text-light">
              Manage structured records and Reporter Agent signals created from Email and WhatsApp automation.
            </p>
          </div>
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-owly-primary px-4 py-2 text-sm font-semibold text-white"
          >
            <Store className="h-4 w-4" />
            Marketplace
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.href = "/api/modules/export?type=records";
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-owly-border px-3 py-2 text-sm font-semibold text-owly-text hover:bg-owly-bg"
            >
              <Download className="h-4 w-4" />
              Export records
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/api/modules/export?type=signals";
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-owly-border px-3 py-2 text-sm font-semibold text-owly-text hover:bg-owly-bg"
            >
              <Download className="h-4 w-4" />
              Export signals
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Stat label="Visible modules" value={modules.length} icon={Package} />
          <Stat label="Enabled modules" value={analytics?.summary.enabledModules ?? enabledCount} icon={Database} tone="green" />
          <Stat label="Records this month" value={analytics?.summary.recordsCreated ?? 0} icon={Database} tone="green" />
          <Stat
            label="Open signals"
            value={analytics?.summary.openSignals ?? 0}
            icon={Signal}
            tone="purple"
          />
          <Stat label="Automation success" value={analytics?.summary.automationSuccessRate ?? 0} suffix="%" icon={Signal} tone="purple" />
        </div>

        <div className="rounded-xl border border-owly-border bg-owly-surface p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-owly-text-light" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search modules..."
                className="h-11 w-full rounded-lg border border-owly-border bg-owly-bg pl-9 pr-3 text-sm text-owly-text outline-none focus:border-owly-primary"
              />
            </label>
            <label className="flex h-11 items-center gap-2 rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(event) => setShowAll(event.target.checked)}
              />
              Show available
            </label>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-52 animate-pulse rounded-xl border border-owly-border bg-owly-surface" />
            ))}
          </div>
        ) : modules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-owly-border bg-owly-surface p-10 text-center">
            <p className="font-semibold text-owly-text">No modules installed yet</p>
            <p className="mt-1 text-sm text-owly-text-light">Install modules from Marketplace to start storing business records.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {modules.map((module) => (
              <Link
                key={module.slug}
                href={module.isInstalled ? `/modules/${module.slug}` : `/marketplace`}
                className={cn(
                  "rounded-xl border bg-owly-surface p-5 transition hover:border-owly-primary hover:shadow-sm",
                  module.isInstalled ? "border-owly-border" : "border-dashed border-owly-border opacity-75"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-owly-text">{module.name}</p>
                    <p className="mt-1 text-xs text-owly-text-light">{module.category}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-1 text-xs font-semibold",
                      module.isEnabled
                        ? "bg-green-100 text-green-700"
                        : module.isInstalled
                        ? "bg-owly-bg text-owly-text-light"
                        : "bg-orange-50 text-orange-700"
                    )}
                  >
                    {module.isEnabled ? "Enabled" : module.isInstalled ? "Disabled" : "Available"}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-owly-text-light">{module.description}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-owly-text-light">
                  <div>
                    <p className="font-semibold text-owly-text">{module.records.length}</p>
                    records
                  </div>
                  <div>
                    <p className="font-semibold text-owly-text">{module.workflows.length}</p>
                    workflows
                  </div>
                  <div>
                    <p className="font-semibold text-owly-text">{module.reporterSignals.length}</p>
                    signals
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix = "",
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ElementType;
  tone?: "default" | "green" | "purple";
}) {
  const toneClass =
    tone === "green"
      ? "bg-green-50 text-green-600"
      : tone === "purple"
      ? "bg-purple-50 text-purple-600"
      : "bg-owly-primary-50 text-owly-primary";

  return (
    <div className="flex items-center justify-between rounded-xl border border-owly-border bg-owly-surface p-4">
      <div>
        <p className="text-sm text-owly-text-light">{label}</p>
        <p className="mt-1 text-2xl font-bold text-owly-text">{value}{suffix}</p>
      </div>
      <div className={cn("rounded-lg p-2", toneClass)}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );
}
