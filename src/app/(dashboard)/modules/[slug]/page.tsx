"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileText,
  Kanban,
  Plus,
  RefreshCw,
  Search,
  Signal,
  Table2,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { getWorkspaceConfig, type WorkspaceField } from "@/lib/marketplace/workspace-config";

interface MarketplaceModule {
  slug: string;
  name: string;
  category: string;
  description: string;
  isInstalled: boolean;
  isEnabled: boolean;
  records: string[];
  workflows: string[];
  reporterSignals: string[];
}

interface ModuleRecord {
  id: string;
  recordType: string;
  title: string;
  status: string;
  priority: string;
  sourceChannel: string;
  conversationId: string | null;
  reporterState: string;
  updatedAt: string;
  data: Record<string, unknown>;
}

interface ModuleSignal {
  id: string;
  signalType: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  moduleRecordId: string | null;
  createdAt: string;
}

interface Paginated<T> {
  data: T[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}


export default function ModuleWorkspacePage() {
  return (
    <Suspense>
      <ModuleWorkspacePageContent />
    </Suspense>
  );
}

function ModuleWorkspacePageContent() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const focusedRecordId = searchParams.get("recordId");

  const [moduleData, setModuleData] = useState<MarketplaceModule | null>(null);
  const [records, setRecords] = useState<ModuleRecord[]>([]);
  const [signals, setSignals] = useState<ModuleSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noAccess, setNoAccess] = useState(false);
  const [recordStatus, setRecordStatus] = useState("all");
  const [recordSearch, setRecordSearch] = useState("");
  const [signalStatus, setSignalStatus] = useState("open");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [view, setView] = useState<"table" | "board">("table");
  const workspace = getWorkspaceConfig(slug);
  const boardStages = useMemo(() => {
    if (!workspace.boardField) return [];
    return workspace.fields.find((field) => field.key === workspace.boardField)?.options || [];
  }, [workspace]);
  const emptyRecord = {
    recordType: workspace.recordTypes[0]?.value || "record",
    title: "",
    status: workspace.statuses[0] || "open",
    priority: "normal",
    sourceChannel: "",
    sourceMessage: "",
    fields: {} as Record<string, string>,
  };
  const [newRecord, setNewRecord] = useState(emptyRecord);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const recordParams = new URLSearchParams({ limit: "200" });
      const signalParams = new URLSearchParams({ limit: "50", module: slug });
      if (signalStatus !== "all") signalParams.set("status", signalStatus);

      const [moduleRes, recordsRes, signalsRes] = await Promise.all([
        fetch(`/api/marketplace/modules/${slug}`),
        fetch(`/api/modules/${slug}/records?${recordParams.toString()}`),
        fetch(`/api/modules/signals?${signalParams.toString()}`),
      ]);

      if (moduleRes.status === 403) {
        setNoAccess(true);
        setLoading(false);
        return;
      }
      if (!moduleRes.ok) throw new Error("Failed to fetch module");
      if (!recordsRes.ok) throw new Error("Failed to fetch module records");
      if (!signalsRes.ok) throw new Error("Failed to fetch module signals");

      const nextModule = (await moduleRes.json()) as MarketplaceModule;
      const nextRecords = (await recordsRes.json()) as Paginated<ModuleRecord>;
      const nextSignals = (await signalsRes.json()) as Paginated<ModuleSignal>;

      setModuleData(nextModule);
      setRecords(nextRecords.data);
      setSignals(nextSignals.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load module workspace");
    } finally {
      setLoading(false);
    }
  }, [signalStatus, slug]);

  useEffect(() => {
    load();
  }, [load]);

  const activeSignals = signals.filter((signal) => signal.status !== "resolved");
  const focusedRecord = useMemo(
    () => records.find((record) => record.id === focusedRecordId) || null,
    [focusedRecordId, records]
  );
  const listFields = useMemo(
    () =>
      workspace.listColumns
        .map((key) => workspace.fields.find((field) => field.key === key))
        .filter((field): field is WorkspaceField => Boolean(field)),
    [workspace]
  );
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const record of records) {
      counts[record.status] = (counts[record.status] || 0) + 1;
    }
    return counts;
  }, [records]);
  const filteredRecords = useMemo(() => {
    const query = recordSearch.trim().toLowerCase();
    return records.filter((record) => {
      if (recordStatus !== "all" && record.status !== recordStatus) return false;
      if (!query) return true;
      const dataText = JSON.stringify(record.data || {}).toLowerCase();
      return [record.title, record.recordType, record.status, record.priority, record.sourceChannel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)) || dataText.includes(query);
    });
  }, [recordSearch, recordStatus, records]);

  const alertCount = useMemo(() => {
    const alert = workspace.rowAlert;
    if (!alert) return 0;
    return records.filter((record) => alert.applies(record.data || {})).length;
  }, [records, workspace]);

  async function moveCard(record: ModuleRecord, stage: string) {
    if (!workspace.boardField) return;
    const res = await fetch(`/api/modules/${slug}/records/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { ...(record.data || {}), [workspace.boardField]: stage } }),
    });
    if (res.ok) await load();
  }

  async function createRecord() {
    setSaving(true);
    setError("");
    try {
      const data: Record<string, unknown> = { source: "manual" };
      for (const field of workspace.fields) {
        const raw = newRecord.fields[field.key];
        if (raw === undefined || raw === "") continue;
        data[field.key] = field.type === "number" ? Number(raw) : raw;
      }

      const res = await fetch(`/api/modules/${slug}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType: newRecord.recordType,
          title: newRecord.title,
          status: newRecord.status,
          priority: newRecord.priority,
          sourceChannel: newRecord.sourceChannel,
          sourceMessage: newRecord.sourceMessage,
          data,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to create record");

      setShowCreate(false);
      setNewRecord(emptyRecord);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create record");
    } finally {
      setSaving(false);
    }
  }

  async function resolveSignal(id: string) {
    const res = await fetch(`/api/modules/signals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    if (res.ok) await load();
  }

  async function runReporterScan() {
    setScanning(true);
    setError("");
    try {
      const res = await fetch("/api/modules/reporter-agent/scan", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to run Reporter Agent scan");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run Reporter Agent scan");
    } finally {
      setScanning(false);
    }
  }

  function exportRecords() {
    const headers = ["id", "recordType", "title", "status", "priority", "sourceChannel", "conversationId", "updatedAt"];
    const rows = filteredRecords.map((record) =>
      headers.map((key) => csvCell(String(record[key as keyof ModuleRecord] ?? ""))).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}-records.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (noAccess) {
    return (
      <div className="h-full overflow-y-auto bg-owly-bg p-6">
        <div className="mx-auto max-w-lg rounded-xl border border-owly-border bg-owly-surface p-10 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-orange-500" />
          <p className="mt-4 font-semibold text-owly-text">You do not have access to this module</p>
          <p className="mt-2 text-sm text-owly-text-light">
            Ask an administrator to assign this module to you from the Team page.
          </p>
        </div>
      </div>
    );
  }

  if (loading && !moduleData) {
    return (
      <div className="h-full overflow-y-auto bg-owly-bg p-6">
        <div className="rounded-xl border border-owly-border bg-owly-surface p-8 text-sm text-owly-text-light">
          Loading module workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-owly-bg">
      <div className="mx-auto max-w-[1500px] space-y-5 p-5">
        <div className="flex flex-col gap-4 rounded-xl border border-owly-border bg-owly-surface p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-4">
              <Link href="/marketplace" className="inline-flex items-center gap-2 text-sm font-semibold text-owly-primary">
                <ArrowLeft className="h-4 w-4" />
                Marketplace
              </Link>
              <Link href="/modules" className="inline-flex items-center gap-2 text-sm font-semibold text-owly-primary">
                <Database className="h-4 w-4" />
                All modules
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-owly-text">{workspace.title !== "Module workspace" ? workspace.title : moduleData?.name || slug}</h1>
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-xs font-semibold",
                  moduleData?.isEnabled ? "bg-green-100 text-green-700" : "bg-owly-bg text-owly-text-light"
                )}
              >
                {moduleData?.isEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-owly-text-light">
              {workspace.description || moduleData?.description || "Operate records and Reporter Agent signals for this module."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-lg border border-owly-border px-3 py-2 text-sm font-semibold text-owly-text hover:bg-owly-bg"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            {slug === "reporter-agent" && (
              <button
                type="button"
                disabled={scanning}
                onClick={runReporterScan}
                className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-60"
              >
                <Signal className="h-4 w-4" />
                {scanning ? "Scanning..." : "Run scan"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setNewRecord(emptyRecord);
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-owly-primary px-3 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              New record
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className={cn("grid gap-4", workspace.rowAlert ? "md:grid-cols-5" : "md:grid-cols-4")}>
          <Stat label="Records" value={records.length} icon={Database} />
          {workspace.rowAlert && (
            <Stat label={workspace.rowAlert.label} value={alertCount} icon={AlertTriangle} tone="orange" />
          )}
          <Stat label="Open signals" value={activeSignals.length} icon={Signal} tone="purple" />
          <Stat label="Workflows" value={moduleData?.workflows.length || 0} icon={FileText} tone="blue" />
          <Stat label="Reporter rules" value={moduleData?.reporterSignals.length || 0} icon={AlertTriangle} tone="orange" />
        </div>

        {focusedRecord && (
          <div className="rounded-xl border border-owly-primary bg-owly-primary-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-owly-primary">Focused record</p>
            <p className="mt-1 font-semibold text-owly-text">{focusedRecord.title}</p>
            <p className="mt-1 text-sm text-owly-text-light">
              {focusedRecord.recordType} - {focusedRecord.status} - {focusedRecord.priority}
            </p>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
          <section className="rounded-xl border border-owly-border bg-owly-surface">
            <div className="flex flex-col gap-3 border-b border-owly-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-semibold text-owly-text">Module records</h2>
                <p className="text-sm text-owly-text-light">Structured records created manually or by workflow automation.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-owly-text-light" />
                  <input
                    value={recordSearch}
                    onChange={(event) => setRecordSearch(event.target.value)}
                    placeholder="Search records"
                    className="h-10 w-full rounded-lg border border-owly-border bg-owly-bg pl-9 pr-3 text-sm text-owly-text outline-none focus:border-owly-primary sm:w-56"
                  />
                </label>
                {boardStages.length > 0 && (
                  <div className="inline-flex h-10 items-center rounded-lg border border-owly-border bg-owly-bg p-1">
                    <button
                      type="button"
                      onClick={() => setView("table")}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium",
                        view === "table" ? "bg-owly-surface text-owly-text shadow-sm" : "text-owly-text-light"
                      )}
                    >
                      <Table2 className="h-4 w-4" />
                      Table
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("board")}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium",
                        view === "board" ? "bg-owly-surface text-owly-text shadow-sm" : "text-owly-text-light"
                      )}
                    >
                      <Kanban className="h-4 w-4" />
                      Board
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={exportRecords}
                  disabled={filteredRecords.length === 0}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-owly-border px-3 text-sm font-semibold text-owly-text hover:bg-owly-bg disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
              </div>
            </div>
            {view === "board" && boardStages.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto p-4">
                {boardStages.map((stage) => {
                  const cards = filteredRecords.filter(
                    (record) => (record.data?.[workspace.boardField!] || boardStages[0]) === stage
                  );
                  return (
                    <div key={stage} className="w-64 flex-shrink-0 rounded-lg bg-owly-bg p-3">
                      <div className="flex items-center justify-between px-1 pb-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                          {statusLabel(stage)}
                        </p>
                        <span className="rounded-full bg-owly-surface px-1.5 text-xs font-semibold text-owly-text-light">
                          {cards.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {cards.map((record) => {
                          const stageIndex = boardStages.indexOf(stage);
                          return (
                            <div key={record.id} className="rounded-lg border border-owly-border bg-owly-surface p-3">
                              <Link
                                href={`/modules/${slug}/records/${record.id}`}
                                className="block truncate text-sm font-semibold text-owly-text hover:text-owly-primary"
                              >
                                {record.title}
                              </Link>
                              <div className="mt-1.5 space-y-0.5 text-xs text-owly-text-light">
                                {listFields.slice(0, 2).map((field) => (
                                  <p key={field.key} className="truncate">
                                    {field.label}: {cellValue(record.data?.[field.key])}
                                  </p>
                                ))}
                              </div>
                              <div className="mt-2 flex items-center justify-between">
                                <button
                                  type="button"
                                  disabled={stageIndex <= 0}
                                  onClick={() => moveCard(record, boardStages[stageIndex - 1])}
                                  className="rounded-md p-1 text-owly-text-light hover:bg-owly-bg hover:text-owly-text disabled:opacity-30"
                                  title="Move to previous stage"
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="text-xs text-owly-text-light">{formatRelativeTime(record.updatedAt)}</span>
                                <button
                                  type="button"
                                  disabled={stageIndex >= boardStages.length - 1}
                                  onClick={() => moveCard(record, boardStages[stageIndex + 1])}
                                  className="rounded-md p-1 text-owly-text-light hover:bg-owly-bg hover:text-owly-text disabled:opacity-30"
                                  title="Move to next stage"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
            <div className="flex flex-wrap gap-2 border-b border-owly-border px-5 py-3">
              <StatusTab
                label="All"
                count={records.length}
                active={recordStatus === "all"}
                onClick={() => setRecordStatus("all")}
              />
              {workspace.statuses.map((status) => (
                <StatusTab
                  key={status}
                  label={statusLabel(status)}
                  count={statusCounts[status] || 0}
                  active={recordStatus === status}
                  onClick={() => setRecordStatus(status)}
                />
              ))}
            </div>
            {filteredRecords.length === 0 ? (
              <EmptyState text="No records yet. Create one manually or use a workflow action." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-owly-border text-left text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                      <th className="px-5 py-3">Record</th>
                      {listFields.map((field) => (
                        <th key={field.key} className="px-3 py-3">{field.label}</th>
                      ))}
                      <th className="px-3 py-3">Updated</th>
                      <th className="px-5 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-owly-border">
                    {filteredRecords.map((record) => (
                      <tr
                        key={record.id}
                        className={cn("hover:bg-owly-bg/60", focusedRecordId === record.id && "bg-owly-primary-50")}
                      >
                        <td className="max-w-[280px] px-5 py-3">
                          <Link
                            href={`/modules/${slug}/records/${record.id}`}
                            className="block truncate font-semibold text-owly-text hover:text-owly-primary"
                          >
                            {record.title}
                          </Link>
                          <p className="mt-0.5 truncate text-xs text-owly-text-light">
                            {record.recordType} {record.sourceChannel ? `- ${record.sourceChannel}` : ""}
                            {record.conversationId ? (
                              <>
                                {" - "}
                                <Link
                                  href={`/conversations?conversationId=${record.conversationId}`}
                                  className="text-owly-primary hover:underline"
                                >
                                  conversation
                                </Link>
                              </>
                            ) : null}
                          </p>
                        </td>
                        {listFields.map((field) => (
                          <td key={field.key} className="max-w-[180px] truncate px-3 py-3 text-owly-text-light">
                            {cellValue(record.data?.[field.key])}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-3 py-3 text-owly-text-light">
                          {formatRelativeTime(record.updatedAt)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right">
                          <span className="inline-flex items-center gap-2">
                            {workspace.rowAlert?.applies(record.data || {}) && (
                              <Badge tone="red">{workspace.rowAlert.label}</Badge>
                            )}
                            <Badge>{statusLabel(record.status)}</Badge>
                            {(record.priority === "urgent" || record.priority === "high") && (
                              <Badge tone="red">{record.priority}</Badge>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
              </>
            )}
          </section>

          <aside className="space-y-5">
            <section className="rounded-xl border border-owly-border bg-owly-surface">
              <div className="flex items-center justify-between border-b border-owly-border px-5 py-4">
                <div>
                  <h2 className="font-semibold text-owly-text">Reporter Agent signals</h2>
                  <p className="text-sm text-owly-text-light">Items requiring attention across module operations.</p>
                </div>
                <select
                  value={signalStatus}
                  onChange={(event) => setSignalStatus(event.target.value)}
                  className="rounded-lg border border-owly-border bg-owly-bg px-3 py-2 text-sm text-owly-text"
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="all">All</option>
                </select>
              </div>
              {signals.length === 0 ? (
                <EmptyState text="No Reporter Agent signals for this module." />
              ) : (
                <div className="divide-y divide-owly-border">
                  {signals.map((signal) => (
                    <div key={signal.id} className="space-y-3 px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-owly-text">{signal.title}</p>
                          <p className="mt-1 text-sm text-owly-text-light">{signal.description || signal.signalType}</p>
                        </div>
                        <Badge tone={signal.severity === "urgent" || signal.severity === "high" ? "red" : "purple"}>
                          {signal.severity}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-owly-text-light">
                        <span>{formatRelativeTime(signal.createdAt)}</span>
                        {signal.status !== "resolved" ? (
                          <button
                            type="button"
                            onClick={() => resolveSignal(signal.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 font-semibold text-green-700 hover:bg-green-100"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Resolve
                          </button>
                        ) : (
                          <span className="font-semibold text-green-700">Resolved</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-owly-border bg-owly-surface p-5">
              <h2 className="font-semibold text-owly-text">Module scope</h2>
              <DetailList title="Workflows" items={moduleData?.workflows || []} />
              <DetailList title="Record types" items={moduleData?.records || []} />
              {workspace.fields.length > 0 && (
                <DetailList title="Primary fields" items={workspace.fields.map((field) => field.label)} />
              )}
              <DetailList title="Reporter signals" items={moduleData?.reporterSignals || []} />
            </section>
          </aside>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-owly-surface shadow-xl">
            <div className="border-b border-owly-border px-5 py-4">
              <h2 className="text-lg font-bold text-owly-text">Create module record</h2>
              <p className="text-sm text-owly-text-light">Use this for manual operations. Workflow-created records use the same API.</p>
            </div>
            <div className="grid max-h-[60vh] gap-4 overflow-y-auto p-5 md:grid-cols-2">
              <SelectField
                label="Record type"
                value={newRecord.recordType}
                options={workspace.recordTypes.map((type) => type.value)}
                optionLabels={Object.fromEntries(workspace.recordTypes.map((type) => [type.value, type.label]))}
                onChange={(value) => setNewRecord((r) => ({ ...r, recordType: value }))}
              />
              <Field label="Title" value={newRecord.title} onChange={(value) => setNewRecord((r) => ({ ...r, title: value }))} />
              <SelectField label="Status" value={newRecord.status} options={workspace.statuses} onChange={(value) => setNewRecord((r) => ({ ...r, status: value }))} />
              <SelectField label="Priority" value={newRecord.priority} options={["low", "normal", "medium", "high", "urgent"]} onChange={(value) => setNewRecord((r) => ({ ...r, priority: value }))} />
              <Field label="Source channel" value={newRecord.sourceChannel} onChange={(value) => setNewRecord((r) => ({ ...r, sourceChannel: value }))} />
              <Field label="Source message" value={newRecord.sourceMessage} onChange={(value) => setNewRecord((r) => ({ ...r, sourceMessage: value }))} />
              {workspace.fields.map((field) => (
                <WorkspaceFieldInput
                  key={field.key}
                  field={field}
                  value={newRecord.fields[field.key] || ""}
                  onChange={(value) =>
                    setNewRecord((r) => ({ ...r, fields: { ...r.fields, [field.key]: value } }))
                  }
                />
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-owly-border px-5 py-4">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-owly-border px-4 py-2 text-sm font-semibold text-owly-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !newRecord.title.trim() || !newRecord.recordType.trim()}
                onClick={createRecord}
                className="rounded-lg bg-owly-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone?: "default" | "purple" | "blue" | "orange";
}) {
  const toneClass =
    tone === "purple"
      ? "bg-purple-50 text-purple-600"
      : tone === "blue"
      ? "bg-blue-50 text-blue-600"
      : tone === "orange"
      ? "bg-orange-50 text-orange-600"
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

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "red" | "purple" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-xs font-semibold",
        tone === "red"
          ? "bg-red-50 text-red-700"
          : tone === "purple"
          ? "bg-purple-50 text-purple-700"
          : "bg-owly-bg text-owly-text-light"
      )}
    >
      {children}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-sm text-owly-text-light">{text}</div>;
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-owly-text">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-lg bg-owly-bg px-2 py-1 text-xs font-medium text-owly-text-light">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm font-semibold text-owly-text">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  optionLabels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm font-semibold text-owly-text">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] || statusLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function statusLabel(value: string) {
  return value.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

function cellValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "--";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  return "...";
}

function StatusTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-owly-primary text-white"
          : "bg-owly-bg text-owly-text-light hover:text-owly-text"
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-xs font-semibold",
          active ? "bg-white/20 text-white" : "bg-owly-surface text-owly-text-light"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function WorkspaceFieldInput({
  field,
  value,
  onChange,
}: {
  field: WorkspaceField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "select") {
    return (
      <SelectField
        label={field.label}
        value={value || field.options?.[0] || ""}
        options={field.options || []}
        onChange={onChange}
      />
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="md:col-span-2">
        <span className="text-sm font-semibold text-owly-text">{field.label}</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="mt-1 h-24 w-full rounded-lg border border-owly-border bg-owly-bg px-3 py-2 text-sm text-owly-text outline-none focus:border-owly-primary"
        />
      </label>
    );
  }
  return (
    <label>
      <span className="text-sm font-semibold text-owly-text">{field.label}</span>
      <input
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        className="mt-1 h-10 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
      />
    </label>
  );
}
