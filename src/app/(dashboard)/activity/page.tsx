"use client";

import { Header } from "@/components/layout/header";
import Link from "next/link";
import {
  ScrollText,
  MessageSquare,
  Ticket,
  Settings,
  BookOpen,
  Users,
  Bot,
  Radio,
  Store,
  AlertTriangle,
  CheckCircle2,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { cn, formatRelativeTime } from "@/lib/utils";

interface ActivityData {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  userName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface ActivityResponse {
  data: ActivityData[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: {
    total: number;
    failedEvents: number;
    approvalEvents: number;
    channelEvents: number;
  };
}

const entityTypes = [
  { value: "all", label: "All Types" },
  { value: "conversation", label: "Conversation" },
  { value: "ticket", label: "Ticket" },
  { value: "message", label: "Message" },
  { value: "workflow", label: "Workflow" },
  { value: "approval", label: "Approval" },
  { value: "channel", label: "Channel" },
  { value: "agent", label: "Agent" },
  { value: "marketplace", label: "Marketplace" },
  { value: "module", label: "Module" },
  { value: "settings", label: "Settings" },
  { value: "knowledge", label: "Knowledge" },
  { value: "team", label: "Team" },
];

const sourceTypes = [
  { value: "all", label: "All sources" },
  { value: "admin", label: "Admin" },
  { value: "system", label: "System" },
  { value: "ai", label: "AI" },
  { value: "workflow", label: "Workflow" },
  { value: "channel", label: "Channel" },
  { value: "module", label: "Module" },
];

const actionTypes = [
  { value: "all", label: "All actions" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "deleted", label: "Deleted" },
  { value: "received", label: "Received" },
  { value: "sent", label: "Sent" },
  { value: "matched", label: "Matched" },
  { value: "completed", label: "Completed" },
  { value: "approval", label: "Approval" },
  { value: "failed", label: "Failed" },
];

const entityConfig: Record<
  string,
  { icon: React.ElementType; bgColor: string; iconColor: string }
> = {
  conversation: {
    icon: MessageSquare,
    bgColor: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  message: {
    icon: MessageSquare,
    bgColor: "bg-sky-50",
    iconColor: "text-sky-600",
  },
  workflow: {
    icon: Bot,
    bgColor: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  approval: {
    icon: CheckCircle2,
    bgColor: "bg-purple-50",
    iconColor: "text-purple-600",
  },
  channel: {
    icon: Radio,
    bgColor: "bg-cyan-50",
    iconColor: "text-cyan-600",
  },
  agent: {
    icon: Bot,
    bgColor: "bg-indigo-50",
    iconColor: "text-indigo-600",
  },
  marketplace: {
    icon: Store,
    bgColor: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  module: {
    icon: Store,
    bgColor: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  ticket: {
    icon: Ticket,
    bgColor: "bg-orange-50",
    iconColor: "text-orange-600",
  },
  settings: {
    icon: Settings,
    bgColor: "bg-gray-100",
    iconColor: "text-gray-600",
  },
  knowledge: {
    icon: BookOpen,
    bgColor: "bg-green-50",
    iconColor: "text-green-600",
  },
  team: {
    icon: Users,
    bgColor: "bg-purple-50",
    iconColor: "text-purple-600",
  },
};

export default function ActivityPage() {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [entityFilter, setEntityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ActivityData | null>(null);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (entityFilter !== "all") params.set("entity", entityFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (actorFilter.trim()) params.set("actor", actorFilter.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/activity?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error("Failed to fetch activities:", error);
    } finally {
      setLoading(false);
    }
  }, [page, entityFilter, sourceFilter, actionFilter, actorFilter, fromDate, toDate, search]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    setPage(1);
  }, [entityFilter, sourceFilter, actionFilter, actorFilter, fromDate, toDate, search]);

  const activities = data?.data || [];
  const totalPages = data?.pagination.totalPages || 1;
  const total = data?.pagination.total || 0;

  function exportCsv() {
    const rows = [
      ["Created", "Entity", "Action", "Actor", "Description"],
      ...activities.map((activity) => [
        activity.createdAt,
        activity.entity,
        activity.action,
        activity.userName,
        activity.description,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Header
        title="Activity Log"
        description="Track all actions and changes"
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <SummaryCard label="Total events" value={data?.summary.total || total} icon={ScrollText} />
          <SummaryCard label="Failed automation" value={data?.summary.failedEvents || 0} icon={AlertTriangle} tone="red" />
          <SummaryCard label="Approvals" value={data?.summary.approvalEvents || 0} icon={CheckCircle2} tone="purple" />
          <SummaryCard label="Channel events" value={data?.summary.channelEvents || 0} icon={Radio} tone="blue" />
        </div>

        {/* Filter Bar */}
        <div className="bg-owly-surface rounded-xl border border-owly-border p-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_150px_150px_150px_130px_130px_auto] md:items-center">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-owly-text-light" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search activity..."
                className="h-10 w-full rounded-lg border border-owly-border bg-owly-bg pl-9 pr-3 text-sm text-owly-text outline-none focus:ring-2 focus:ring-owly-primary/30"
              />
            </label>
            <Filter className="h-4 w-4 text-owly-text-light" />
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="text-sm px-3 py-2 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 text-owly-text"
            >
              {entityTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="text-sm px-3 py-2 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 text-owly-text"
            >
              {sourceTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="text-sm px-3 py-2 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 text-owly-text"
            >
              {actionTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              placeholder="Actor"
              className="text-sm px-3 py-2 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 text-owly-text"
            />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-sm px-3 py-2 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 text-owly-text"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="text-sm px-3 py-2 border border-owly-border rounded-lg bg-owly-bg focus:outline-none focus:ring-2 focus:ring-owly-primary/30 text-owly-text"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 rounded-lg border border-owly-border px-3 py-2 text-sm font-medium text-owly-text hover:bg-owly-primary-50"
              >
                <Download className="h-4 w-4" />
                CSV
              </button>
              <span className="text-sm text-owly-text-light">
              {total} {total === 1 ? "entry" : "entries"}
              </span>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-owly-surface rounded-xl border border-owly-border">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-sm text-owly-text-light">Loading...</div>
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="p-4 rounded-full bg-owly-primary-50 mb-4">
                <ScrollText className="h-8 w-8 text-owly-primary" />
              </div>
              <p className="font-medium text-owly-text">No activity found</p>
              <p className="text-sm text-owly-text-light mt-1">
                Actions and changes will appear here as they happen
              </p>
            </div>
          ) : (
            <div className="divide-y divide-owly-border">
              {activities.map((activity) => {
                const config = entityConfig[activity.entity] || {
                  icon: ScrollText,
                  bgColor: "bg-gray-100",
                  iconColor: "text-gray-600",
                };
                const Icon = config.icon;

                return (
                  <div
                    key={activity.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(activity)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelected(activity);
                    }}
                    className="flex cursor-pointer items-start gap-4 px-5 py-4 hover:bg-owly-primary-50/30 transition-colors"
                  >
                    <div
                      className={cn(
                        "p-2 rounded-lg flex-shrink-0 mt-0.5",
                        config.bgColor
                      )}
                    >
                      <Icon className={cn("h-4 w-4", config.iconColor)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-owly-text">
                        {activity.description}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-owly-text-light">
                          {activity.userName}
                        </span>
                        <span className="text-xs text-owly-text-light">
                          {formatRelativeTime(activity.createdAt)}
                        </span>
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-xs font-medium",
                            activity.entity === "conversation"
                              ? "bg-blue-50 text-blue-700"
                              : activity.entity === "ticket"
                              ? "bg-orange-50 text-orange-700"
                              : activity.entity === "settings"
                              ? "bg-gray-100 text-gray-700"
                              : activity.entity === "knowledge"
                              ? "bg-green-50 text-green-700"
                              : activity.entity === "team"
                              ? "bg-purple-50 text-purple-700"
                              : "bg-gray-100 text-gray-700"
                          )}
                        >
                          {activity.entity}
                        </span>
                        <span className="rounded bg-owly-bg px-1.5 py-0.5 text-xs font-medium text-owly-text-light">
                          {activity.action}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-owly-primary">Details</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between bg-owly-surface rounded-xl border border-owly-border px-5 py-3">
            <p className="text-sm text-owly-text-light">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors",
                  page <= 1
                    ? "text-owly-text-light cursor-not-allowed"
                    : "text-owly-text hover:bg-owly-primary-50"
                )}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors",
                  page >= totalPages
                    ? "text-owly-text-light cursor-not-allowed"
                    : "text-owly-text hover:bg-owly-primary-50"
                )}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setSelected(null)}>
          <aside
            className="h-full w-full max-w-xl overflow-y-auto bg-owly-surface shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-owly-border bg-owly-surface px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-owly-primary">Activity detail</p>
                <h2 className="text-lg font-bold text-owly-text">{selected.action}</h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg p-2 text-owly-text-light hover:bg-owly-bg hover:text-owly-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-owly-border p-4">
                <p className="text-sm text-owly-text">{selected.description}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <Info label="Entity" value={selected.entity} />
                  <Info label="Actor" value={selected.userName} />
                  <Info label="When" value={formatRelativeTime(selected.createdAt)} />
                  <Info label="Entity ID" value={selected.entityId || "--"} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selected.entity === "conversation" && selected.entityId && (
                  <Link
                    href={`/conversations?conversationId=${selected.entityId}`}
                    className="rounded-lg bg-owly-primary px-3 py-2 text-sm font-semibold text-white"
                  >
                    Open conversation
                  </Link>
                )}
                {selected.entity === "ticket" && selected.entityId && (
                  <Link
                    href={`/tickets?ticketId=${selected.entityId}`}
                    className="rounded-lg bg-owly-primary px-3 py-2 text-sm font-semibold text-white"
                  >
                    Open ticket
                  </Link>
                )}
                {selected.entity === "workflow" && selected.entityId && (
                  <Link
                    href={`/flows/${selected.entityId}`}
                    className="rounded-lg bg-owly-primary px-3 py-2 text-sm font-semibold text-white"
                  >
                    Open workflow
                  </Link>
                )}
                {selected.entity === "agent" && selected.entityId && (
                  <Link
                    href={`/agents/${selected.entityId}`}
                    className="rounded-lg bg-owly-primary px-3 py-2 text-sm font-semibold text-white"
                  >
                    Open agent
                  </Link>
                )}
                {selected.entity === "module_record" &&
                  typeof selected.metadata?.moduleSlug === "string" &&
                  selected.entityId && (
                    <Link
                      href={`/modules/${selected.metadata.moduleSlug}/records/${selected.entityId}`}
                      className="rounded-lg bg-owly-primary px-3 py-2 text-sm font-semibold text-white"
                    >
                      Open module record
                    </Link>
                  )}
              </div>

              <div className="rounded-xl border border-owly-border">
                <div className="border-b border-owly-border px-4 py-3 text-sm font-semibold text-owly-text">
                  Metadata
                </div>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap p-4 text-xs text-owly-text-light">
                  {JSON.stringify(selected.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone?: "default" | "red" | "purple" | "blue";
}) {
  const toneClass =
    tone === "red"
      ? "bg-red-50 text-red-600"
      : tone === "purple"
      ? "bg-purple-50 text-purple-600"
      : tone === "blue"
      ? "bg-blue-50 text-blue-600"
      : "bg-owly-primary-50 text-owly-primary";

  return (
    <div className="flex items-center justify-between rounded-xl border border-owly-border bg-owly-surface p-4">
      <div>
        <p className="text-sm text-owly-text-light">{label}</p>
        <p className="mt-1 text-2xl font-bold text-owly-text">{value}</p>
      </div>
      <div className={cn("rounded-lg p-2", toneClass)}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-owly-text-light">{label}</p>
      <p className="mt-1 break-all text-sm font-medium text-owly-text">{value}</p>
    </div>
  );
}
