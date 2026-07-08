"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Search, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { getModuleIcon } from "@/lib/marketplace/icon-map";

interface MarketplaceModule {
  slug: string;
  name: string;
  category: string;
  description: string;
  longDescription: string;
  iconName: string;
  channels: string[];
  workflows: string[];
  records: string[];
  approvals: string[];
  reporterSignals: string[];
  examples: string[];
  isInstalled: boolean;
  isEnabled: boolean;
  isCore?: boolean;
  version: string;
  installedAt?: string | null;
  installedBy?: string | null;
  config?: Record<string, unknown>;
}

interface MarketplaceResponse {
  modules: MarketplaceModule[];
  categories: string[];
  total: number;
}

const actionLabels = {
  install: "installed",
  enable: "enabled",
  disable: "disabled",
  uninstall: "uninstalled",
  configure: "saved",
} as const;

export default function MarketplacePage() {
  const [modules, setModules] = useState<MarketplaceModule[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [installedOnly, setInstalledOnly] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const fetchModules = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (category !== "all") params.set("category", category);
      if (installedOnly) params.set("installed", "true");

      const res = await fetch(`/api/marketplace/modules?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch marketplace modules");
      const data = (await res.json()) as MarketplaceResponse;
      setModules(data.modules);
      setCategories(data.categories);
      setSelectedSlug((current) =>
        current && data.modules.some((module) => module.slug === current)
          ? current
          : data.modules[0]?.slug || null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch marketplace modules");
    } finally {
      setLoading(false);
    }
  }, [category, installedOnly, search]);

  useEffect(() => {
    const timeout = window.setTimeout(fetchModules, 200);
    return () => window.clearTimeout(timeout);
  }, [fetchModules]);

  const selected = useMemo(
    () => modules.find((module) => module.slug === selectedSlug) || modules[0],
    [modules, selectedSlug]
  );

  const installedCount = modules.filter((module) => module.isInstalled).length;

  const runModuleAction = useCallback(
    async (slug: string, action: "install" | "enable" | "disable" | "uninstall" | "configure") => {
      setActionLoading(action);
      setActionMessage("");
      try {
        const res = await fetch(`/api/marketplace/modules/${slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, config: selected?.config || {} }),
        });
        const updated = await res.json();
        if (!res.ok) {
          throw new Error(updated?.error || "Failed to update module");
        }

        setModules((current) =>
          current.map((module) => (module.slug === slug ? { ...module, ...updated } : module))
        );
        setActionMessage(`${updated.name} ${actionLabels[action]}.`);
      } catch (err) {
        setActionMessage(err instanceof Error ? err.message : "Failed to update module");
      } finally {
        setActionLoading("");
      }
    },
    [selected]
  );

  return (
    <div className="h-full overflow-y-auto bg-owly-bg">
      <div className="mx-auto max-w-[1500px] space-y-5 p-5">
        <div className="flex flex-col gap-4 rounded-xl border border-owly-border bg-owly-surface p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-owly-primary">
              <Store className="h-4 w-4" />
              Module Marketplace
            </div>
            <h1 className="mt-2 text-2xl font-bold text-owly-text">Install business automation modules</h1>
            <p className="mt-1 max-w-3xl text-sm text-owly-text-light">
              Modules add records, workflows, approvals, and Reporter Agent signals around inbound Email and WhatsApp messages.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-owly-primary-50 px-4 py-3">
              <p className="text-owly-text-light">Available</p>
              <p className="text-xl font-bold text-owly-text">{modules.length}</p>
            </div>
            <div className="rounded-lg bg-green-50 px-4 py-3">
              <p className="text-owly-text-light">Installed</p>
              <p className="text-xl font-bold text-green-700">{installedCount}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-owly-border bg-owly-surface p-4 md:grid-cols-[minmax(0,1fr)_220px_160px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-owly-text-light" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search modules, records, workflows..."
                  className="h-11 w-full rounded-lg border border-owly-border bg-white pl-9 pr-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                />
              </label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-11 rounded-lg border border-owly-border bg-white px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
              >
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <label className="flex h-11 items-center gap-2 rounded-lg border border-owly-border bg-white px-3 text-sm text-owly-text">
                <input
                  type="checkbox"
                  checked={installedOnly}
                  onChange={(event) => setInstalledOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-owly-border text-owly-primary"
                />
                Installed only
              </label>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid gap-3 xl:grid-cols-2">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-56 animate-pulse rounded-xl border border-owly-border bg-owly-surface" />
                ))
              ) : modules.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-owly-border bg-owly-surface p-8 text-center text-sm text-owly-text-light">
                  No modules match the current filters.
                </div>
              ) : (
                modules.map((module) => {
                  const Icon = getModuleIcon(module.iconName);
                  const active = selected?.slug === module.slug;

                  return (
                    <button
                      key={module.slug}
                      type="button"
                      onClick={() => setSelectedSlug(module.slug)}
                      className={cn(
                        "rounded-xl border bg-owly-surface p-4 text-left transition hover:border-owly-primary hover:shadow-sm",
                        active ? "border-owly-primary ring-2 ring-owly-primary/10" : "border-owly-border"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-owly-primary-50 text-owly-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-owly-text">{module.name}</p>
                              <p className="mt-0.5 text-xs text-owly-text-light">{module.category}</p>
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-semibold",
                                module.isCore
                                  ? "bg-owly-primary-50 text-owly-primary"
                                  : module.isInstalled
                                  ? "bg-green-100 text-green-700"
                                  : "bg-owly-bg text-owly-text-light"
                              )}
                            >
                              {module.isCore ? "Core" : module.isInstalled ? "Installed" : "Available"}
                            </span>
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm text-owly-text-light">{module.description}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {module.channels.map((channel) => (
                          <span key={channel} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                            {channel}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-owly-text-light">
                        <div>
                          <p className="font-semibold text-owly-text">{module.workflows.length}</p>
                          workflows
                        </div>
                        <div>
                          <p className="font-semibold text-owly-text">{module.records.length}</p>
                          records
                        </div>
                        <div>
                          <p className="font-semibold text-owly-text">{module.reporterSignals.length}</p>
                          signals
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <aside className="lg:sticky lg:top-5 lg:self-start">
            {selected ? (
              <div className="rounded-xl border border-owly-border bg-owly-surface">
                <div className="border-b border-owly-border p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-owly-primary">{selected.category}</p>
                      <h2 className="mt-1 text-xl font-bold text-owly-text">{selected.name}</h2>
                      <p className="mt-1 text-xs text-owly-text-light">Version {selected.version}</p>
                    </div>
                    {selected.isInstalled && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-owly-text-light">{selected.longDescription}</p>
                  <div className="mt-4 flex gap-2">
                    {!selected.isInstalled ? (
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => runModuleAction(selected.slug, "install")}
                        className="rounded-lg bg-owly-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {actionLoading === "install" ? "Installing..." : "Install module"}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => runModuleAction(selected.slug, "configure")}
                          className="rounded-lg bg-owly-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {actionLoading === "configure" ? "Saving..." : "Save config"}
                        </button>
                        {!selected.isCore && (
                          <>
                            <button
                              type="button"
                              disabled={Boolean(actionLoading)}
                              onClick={() =>
                                runModuleAction(selected.slug, selected.isEnabled ? "disable" : "enable")
                              }
                              className="rounded-lg border border-owly-border px-4 py-2 text-sm font-semibold text-owly-text hover:bg-owly-bg disabled:opacity-60"
                            >
                              {selected.isEnabled ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(actionLoading)}
                              onClick={() => runModuleAction(selected.slug, "uninstall")}
                              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                            >
                              Uninstall
                            </button>
                          </>
                        )}
                        <Link
                          href={`/modules/${selected.slug}`}
                          className="rounded-lg border border-owly-border px-4 py-2 text-sm font-semibold text-owly-text hover:bg-owly-bg"
                        >
                          Open module
                        </Link>
                      </>
                    )}
                  </div>
                  {actionMessage && (
                    <p
                      className={cn(
                        "mt-3 rounded-lg px-3 py-2 text-sm",
                        actionMessage.includes("Failed")
                          ? "bg-red-50 text-red-700"
                          : "bg-green-50 text-green-700"
                      )}
                    >
                      {actionMessage}
                    </p>
                  )}
                  {selected.isInstalled && (
                    <div className="mt-4 rounded-lg bg-owly-bg p-3 text-xs text-owly-text-light">
                      Installed by {selected.installedBy || "System"}
                      {selected.installedAt ? ` on ${new Date(selected.installedAt).toLocaleString()}` : ""}
                    </div>
                  )}
                </div>

                <DetailSection title="Included workflows" items={selected.workflows} />
                <DetailSection title="Records created or updated" items={selected.records} />
                <DetailSection title="Approval points" items={selected.approvals} empty="No approvals required." />
                <DetailSection title="Reporter Agent signals" items={selected.reporterSignals} />
                <DetailSection title="Input automation examples" items={selected.examples} />
              </div>
            ) : (
              <div className="rounded-xl border border-owly-border bg-owly-surface p-6 text-sm text-owly-text-light">
                Select a module to review what it adds.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function DetailSection({
  title,
  items,
  empty = "None configured.",
}: {
  title: string;
  items: string[];
  empty?: string;
}) {
  return (
    <div className="border-b border-owly-border p-5 last:border-b-0">
      <h3 className="text-sm font-semibold text-owly-text">{title}</h3>
      {items.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="rounded-lg bg-owly-bg px-2.5 py-1.5 text-xs font-medium text-owly-text">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-owly-text-light">{empty}</p>
      )}
    </div>
  );
}
