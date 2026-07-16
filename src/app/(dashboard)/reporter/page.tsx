"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bot, Database, RefreshCw, Signal } from "lucide-react";
import { ReporterChat } from "@/components/reporter/reporter-chat";
import { formatRelativeTime } from "@/lib/utils";

interface ReporterRecord {
  id: string;
  recordType: string;
  title: string;
  status: string;
  updatedAt: string;
}

interface HeartbeatSettings {
  heartbeatEnabled: boolean;
  heartbeatMinutes: number;
  notifySeverity: string;
  emailRecipients: string;
}

export default function ReporterPage() {
  const [reports, setReports] = useState<ReporterRecord[]>([]);
  const [openSignals, setOpenSignals] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [heartbeat, setHeartbeat] = useState<HeartbeatSettings>({
    heartbeatEnabled: true,
    heartbeatMinutes: 15,
    notifySeverity: "high",
    emailRecipients: "",
  });
  const [savingHeartbeat, setSavingHeartbeat] = useState(false);
  const [heartbeatNotice, setHeartbeatNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [recordsRes, signalsRes, moduleRes, meRes] = await Promise.all([
        fetch("/api/modules/reporter-agent/records?limit=10"),
        fetch("/api/modules/signals?status=open&limit=1"),
        fetch("/api/marketplace/modules/reporter-agent"),
        fetch("/api/auth"),
      ]);
      if (recordsRes.ok) {
        const body = await recordsRes.json();
        setReports(body.data || []);
      }
      if (signalsRes.ok) {
        const body = await signalsRes.json();
        setOpenSignals(body.pagination?.total ?? 0);
      }
      if (moduleRes.ok) {
        const body = await moduleRes.json();
        const config = body.config || {};
        setHeartbeat({
          heartbeatEnabled: config.heartbeatEnabled !== false,
          heartbeatMinutes: Number(config.heartbeatMinutes) || 15,
          notifySeverity: config.notifySeverity || "high",
          emailRecipients: Array.isArray(config.emailRecipients) ? config.emailRecipients.join(", ") : "",
        });
      }
      if (meRes.ok) {
        const body = await meRes.json();
        setIsAdmin(body.user?.role === "admin");
      }
    } catch {
      // panel data is non-critical
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runScan() {
    setScanning(true);
    setError("");
    try {
      const res = await fetch("/api/modules/reporter-agent/scan", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || body?.error || "Scan failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function saveHeartbeat() {
    setSavingHeartbeat(true);
    setHeartbeatNotice("");
    try {
      const res = await fetch("/api/marketplace/modules/reporter-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "configure",
          config: {
            heartbeatEnabled: heartbeat.heartbeatEnabled,
            heartbeatMinutes: Math.max(5, Number(heartbeat.heartbeatMinutes) || 15),
            notifySeverity: heartbeat.notifySeverity,
            emailRecipients: heartbeat.emailRecipients
              .split(",")
              .map((value) => value.trim())
              .filter((value) => value.includes("@")),
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to save heartbeat settings");
      setHeartbeatNotice("Heartbeat settings saved.");
    } catch (err) {
      setHeartbeatNotice(err instanceof Error ? err.message : "Failed to save heartbeat settings");
    } finally {
      setSavingHeartbeat(false);
    }
  }

  async function runHeartbeatNow() {
    setSavingHeartbeat(true);
    setHeartbeatNotice("");
    try {
      const res = await fetch("/api/reporter/heartbeat", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Heartbeat failed");
      setHeartbeatNotice(`Heartbeat ran: ${body.newSignals ?? 0} new signal(s), ${body.delivered ?? 0} chat deliveries.`);
      await load();
    } catch (err) {
      setHeartbeatNotice(err instanceof Error ? err.message : "Heartbeat failed");
    } finally {
      setSavingHeartbeat(false);
    }
  }

  return (
    <div className="h-full overflow-hidden bg-owly-bg">
      <div className="mx-auto grid h-full max-w-[1400px] gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-owly-border bg-owly-surface">
          <div className="flex items-center justify-between border-b border-owly-border px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-owly-primary-50 text-owly-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-owly-text">Reporter Agent</h1>
                <p className="text-sm text-owly-text-light">
                  Ask about anything in your modules. Answers cite the records they come from.
                </p>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ReporterChat />
          </div>
        </section>

        <aside className="min-h-0 space-y-5 overflow-y-auto">
          <section className="rounded-xl border border-owly-border bg-owly-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-owly-text">Monitoring</h2>
              <button
                type="button"
                disabled={scanning}
                onClick={runScan}
                className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-60"
              >
                <RefreshCw className={scanning ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {scanning ? "Scanning..." : "Run scan"}
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex items-center justify-between rounded-lg bg-owly-bg p-3">
              <span className="flex items-center gap-2 text-sm text-owly-text">
                <Signal className="h-4 w-4 text-purple-600" />
                Open signals
              </span>
              <span className="text-lg font-bold text-owly-text">{openSignals}</span>
            </div>
            <Link
              href="/modules/reporter-agent"
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-owly-primary hover:underline"
            >
              <Database className="h-4 w-4" />
              Open Reporter workspace
            </Link>
          </section>

          {isAdmin && (
            <section className="rounded-xl border border-owly-border bg-owly-surface p-5">
              <h2 className="font-semibold text-owly-text">Heartbeat</h2>
              <p className="mt-1 text-sm text-owly-text-light">
                The Reporter Agent scans on a schedule and messages affected users when new issues appear.
              </p>
              {heartbeatNotice && (
                <p className="mt-2 rounded-lg bg-owly-bg px-3 py-2 text-sm text-owly-text">{heartbeatNotice}</p>
              )}
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-owly-text">
                  <input
                    type="checkbox"
                    checked={heartbeat.heartbeatEnabled}
                    onChange={(event) => setHeartbeat((h) => ({ ...h, heartbeatEnabled: event.target.checked }))}
                  />
                  Heartbeat enabled
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-owly-text">Frequency (minutes)</span>
                  <input
                    type="number"
                    min={5}
                    value={heartbeat.heartbeatMinutes}
                    onChange={(event) => setHeartbeat((h) => ({ ...h, heartbeatMinutes: Number(event.target.value) }))}
                    className="mt-1 h-9 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-owly-text">Notify (bell) from severity</span>
                  <select
                    value={heartbeat.notifySeverity}
                    onChange={(event) => setHeartbeat((h) => ({ ...h, notifySeverity: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                  >
                    {["low", "medium", "high", "urgent", "critical"].map((severity) => (
                      <option key={severity} value={severity}>{severity}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-owly-text">Critical alert emails (comma-separated)</span>
                  <input
                    value={heartbeat.emailRecipients}
                    onChange={(event) => setHeartbeat((h) => ({ ...h, emailRecipients: event.target.value }))}
                    placeholder="ops@example.com"
                    className="mt-1 h-9 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingHeartbeat}
                    onClick={saveHeartbeat}
                    className="rounded-lg bg-owly-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={savingHeartbeat}
                    onClick={runHeartbeatNow}
                    className="rounded-lg border border-owly-border px-3 py-2 text-sm font-semibold text-owly-text hover:bg-owly-bg disabled:opacity-60"
                  >
                    Run heartbeat now
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-owly-border bg-owly-surface">
            <div className="border-b border-owly-border px-5 py-4">
              <h2 className="font-semibold text-owly-text">Recent reports</h2>
              <p className="text-sm text-owly-text-light">Generated by scans and the heartbeat.</p>
            </div>
            {reports.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-owly-text-light">No reports yet. Run a scan.</p>
            ) : (
              <div className="divide-y divide-owly-border">
                {reports.map((report) => (
                  <Link
                    key={report.id}
                    href={`/modules/reporter-agent/records/${report.id}`}
                    className="block px-5 py-3 hover:bg-owly-bg/60"
                  >
                    <p className="truncate text-sm font-semibold text-owly-text">{report.title}</p>
                    <p className="mt-0.5 text-xs text-owly-text-light">
                      {report.recordType} - {formatRelativeTime(report.updatedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
