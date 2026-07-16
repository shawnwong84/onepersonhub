"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, Clock, Save, Send } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { getWorkspaceConfig, type WorkspaceField, type LineItemRow } from "@/lib/marketplace/workspace-config";

/** Accepts the legacy newline-delimited string shape, a plain string array,
 * or the current { item, quantity }[] shape - so records saved before this
 * per-item-quantity redesign still load and display correctly. */
function parseLineItems(value: unknown): LineItemRow[] {
  if (Array.isArray(value)) {
    return value.map((row) => {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        const r = row as Record<string, unknown>;
        const qty = Number(r.quantity);
        return { item: String(r.item ?? ""), quantity: Number.isFinite(qty) && qty > 0 ? qty : 1 };
      }
      return { item: String(row ?? ""), quantity: 1 };
    });
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ item: line, quantity: 1 }));
  }
  return [];
}

interface ModuleRecordEvent {
  id: string;
  action: string;
  description: string;
  createdBy: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

interface ModuleSignal {
  id: string;
  signalType: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
}

interface ModuleRecord {
  id: string;
  recordType: string;
  title: string;
  status: string;
  priority: string;
  sourceChannel: string;
  sourceMessage: string;
  conversationId: string | null;
  customerId: string | null;
  reporterState: string;
  reporterNotes: string;
  data: Record<string, unknown>;
  events: ModuleRecordEvent[];
  signals: ModuleSignal[];
  createdAt: string;
  updatedAt: string;
}

export default function ModuleRecordDetailPage() {
  const params = useParams<{ slug: string; id: string }>();
  const { slug, id } = params;
  const workspace = getWorkspaceConfig(slug);
  const [record, setRecord] = useState<ModuleRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    status: "open",
    priority: "normal",
    reporterState: "normal",
    reporterNotes: "",
    fields: {} as Record<string, string>,
    lineItems: [] as LineItemRow[],
    otherData: "{}",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/modules/${slug}/records/${id}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to fetch module record");
      const next = body as ModuleRecord;
      setRecord(next);
      const data = next.data || {};
      const knownKeys = new Set(workspace.fields.map((field) => field.key));
      const fields: Record<string, string> = {};
      const otherData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (workspace.lineItemsKey && key === workspace.lineItemsKey) continue;
        const isPrimitive = value === null || ["string", "number", "boolean"].includes(typeof value);
        if (knownKeys.has(key) && isPrimitive) {
          fields[key] = value === null ? "" : String(value);
        } else {
          otherData[key] = value;
        }
      }
      setDraft({
        title: next.title,
        status: next.status,
        priority: next.priority,
        reporterState: next.reporterState,
        reporterNotes: next.reporterNotes || "",
        fields,
        lineItems: workspace.lineItemsKey ? parseLineItems(data[workspace.lineItemsKey]) : [],
        otherData: JSON.stringify(otherData, null, 2),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch module record");
    } finally {
      setLoading(false);
    }
    // workspace is derived from the slug and stable per route
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      let parsedData: Record<string, unknown> = {};
      try {
        parsedData = JSON.parse(draft.otherData || "{}") as Record<string, unknown>;
      } catch {
        throw new Error("Additional data must be valid JSON.");
      }
      for (const field of workspace.fields) {
        const raw = draft.fields[field.key];
        if (raw === undefined || raw === "") continue;
        parsedData[field.key] = field.type === "number" ? Number(raw) : raw;
      }
      if (workspace.lineItemsKey) {
        parsedData[workspace.lineItemsKey] = draft.lineItems.filter((row) => row.item.trim() !== "");
      }

      const res = await fetch(`/api/modules/${slug}/records/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          status: draft.status,
          priority: draft.priority,
          reporterState: draft.reporterState,
          reporterNotes: draft.reporterNotes,
          data: parsedData,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to save module record");
      setRecord(body);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save module record");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(toStatus: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/modules/${slug}/records/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toStatus }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to update status");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  async function sendCustomerReply() {
    const reply = workspace.customerReply;
    if (!reply || !record?.conversationId) return;
    setSendingReply(true);
    setError("");
    setNotice("");
    try {
      const content = reply.buildMessage({ title: record.title, data: record.data || {} });
      const res = await fetch(`/api/conversations/${record.conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, role: "admin" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to send customer reply");

      await fetch(`/api/modules/${slug}/records/${id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "customer_reply_sent",
          description: "Confirmation reply sent to the customer through the source conversation.",
        }),
      });
      setNotice("Confirmation sent to the customer.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send customer reply");
    } finally {
      setSendingReply(false);
    }
  }

  async function resolveSignal(signalId: string) {
    const res = await fetch(`/api/modules/signals/${signalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    if (res.ok) await load();
  }

  if (loading && !record) {
    return (
      <div className="h-full overflow-y-auto bg-owly-bg p-5">
        <div className="rounded-xl border border-owly-border bg-owly-surface p-8 text-sm text-owly-text-light">
          Loading module record...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-owly-bg">
      <div className="mx-auto max-w-[1300px] space-y-5 p-5">
        <div className="rounded-xl border border-owly-border bg-owly-surface p-5">
          <Link href={`/modules/${slug}?recordId=${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-owly-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to module
          </Link>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-owly-primary">{record?.recordType}</p>
              <div className="mt-1 flex items-center gap-3">
                <h1 className="text-2xl font-bold text-owly-text">{record?.title || "Module record"}</h1>
                {record && (
                  <span className="rounded-full bg-owly-primary-50 px-2.5 py-1 text-xs font-semibold text-owly-primary">
                    {statusLabel(record.status)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-owly-text-light">
                Updated {record ? formatRelativeTime(record.updatedAt) : "--"}
                {record?.conversationId ? (
                  <>
                    {" - "}
                    <Link href={`/conversations?conversationId=${record.conversationId}`} className="text-owly-primary hover:underline">
                      Open conversation
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {record &&
                workspace.customerReply &&
                workspace.customerReply.availableWhen.includes(record.status) &&
                record.conversationId && (
                  <button
                    type="button"
                    disabled={sendingReply}
                    onClick={sendCustomerReply}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                    {sendingReply ? "Sending..." : workspace.customerReply.label}
                  </button>
                )}
              {record &&
                workspace.actions
                  .filter((action) => action.from.includes(record.status))
                  .map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      disabled={saving}
                      onClick={() => runAction(action.to)}
                      className={
                        action.tone === "success"
                          ? "inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                          : action.tone === "danger"
                          ? "inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                          : "inline-flex items-center gap-2 rounded-lg border border-owly-border bg-owly-bg px-4 py-2 text-sm font-semibold text-owly-text hover:bg-owly-primary-50 disabled:opacity-60"
                      }
                    >
                      {action.label}
                    </button>
                  ))}
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-owly-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-5">
            <div className="rounded-xl border border-owly-border bg-owly-surface p-5">
              <h2 className="font-semibold text-owly-text">Record details</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Title" value={draft.title} onChange={(value) => setDraft((d) => ({ ...d, title: value }))} />
                <SelectField
                  label="Status"
                  value={draft.status}
                  options={workspace.statuses.includes(draft.status) ? workspace.statuses : [draft.status, ...workspace.statuses]}
                  onChange={(value) => setDraft((d) => ({ ...d, status: value }))}
                />
                <SelectField label="Priority" value={draft.priority} options={["low", "normal", "medium", "high", "urgent"]} onChange={(value) => setDraft((d) => ({ ...d, priority: value }))} />
                <SelectField label="Reporter state" value={draft.reporterState} options={["normal", "watch", "attention", "blocked", "resolved"]} onChange={(value) => setDraft((d) => ({ ...d, reporterState: value }))} />
                <label className="md:col-span-2">
                  <span className="text-sm font-semibold text-owly-text">Reporter notes</span>
                  <textarea
                    value={draft.reporterNotes}
                    onChange={(event) => setDraft((d) => ({ ...d, reporterNotes: event.target.value }))}
                    className="mt-1 h-24 w-full rounded-lg border border-owly-border bg-owly-bg px-3 py-2 text-sm text-owly-text outline-none focus:border-owly-primary"
                  />
                </label>
              </div>
            </div>

            {workspace.lineItemsKey && record && (
              <LineItemsEditor
                value={draft.lineItems}
                onChange={(rows) => setDraft((d) => ({ ...d, lineItems: rows }))}
              />
            )}

            {workspace.fields.length > 0 && (
              <div className="rounded-xl border border-owly-border bg-owly-surface p-5">
                <h2 className="font-semibold text-owly-text">{record?.recordType ? `${statusLabel(record.recordType)} fields` : "Module fields"}</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {workspace.fields.map((field) => (
                    <WorkspaceFieldInput
                      key={field.key}
                      field={field}
                      value={draft.fields[field.key] || ""}
                      onChange={(value) =>
                        setDraft((d) => ({ ...d, fields: { ...d.fields, [field.key]: value } }))
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-owly-border bg-owly-surface p-5">
              <button
                type="button"
                onClick={() => setShowAdvanced((value) => !value)}
                className="flex w-full items-center justify-between text-left"
              >
                <div>
                  <h2 className="font-semibold text-owly-text">Additional data</h2>
                  <p className="text-sm text-owly-text-light">Extraction output and other fields not covered by the form above.</p>
                </div>
                <ChevronDown className={showAdvanced ? "h-4 w-4 rotate-180 transition" : "h-4 w-4 transition"} />
              </button>
              {showAdvanced && (
                <textarea
                  value={draft.otherData}
                  onChange={(event) => setDraft((d) => ({ ...d, otherData: event.target.value }))}
                  className="mt-4 h-72 w-full rounded-lg border border-owly-border bg-owly-bg px-3 py-2 font-mono text-sm text-owly-text outline-none focus:border-owly-primary"
                />
              )}
            </div>

            <div className="rounded-xl border border-owly-border bg-owly-surface">
              <div className="border-b border-owly-border px-5 py-4">
                <h2 className="font-semibold text-owly-text">Record timeline</h2>
              </div>
              {record?.events?.length ? (
                <div className="divide-y divide-owly-border">
                  {record.events.map((event) => (
                    <div key={event.id} className="flex gap-3 px-5 py-4">
                      <div className="mt-0.5 rounded-lg bg-owly-primary-50 p-2 text-owly-primary">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-owly-text">{event.description}</p>
                        <p className="mt-1 text-xs text-owly-text-light">
                          {event.action} by {event.createdBy || "System"} - {formatRelativeTime(event.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-sm text-owly-text-light">No events recorded.</div>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-xl border border-owly-border bg-owly-surface">
              <div className="border-b border-owly-border px-5 py-4">
                <h2 className="font-semibold text-owly-text">Reporter signals</h2>
              </div>
              {record?.signals?.length ? (
                <div className="divide-y divide-owly-border">
                  {record.signals.map((signal) => (
                    <div key={signal.id} className="space-y-3 px-5 py-4">
                      <div>
                        <p className="font-semibold text-owly-text">{signal.title}</p>
                        <p className="mt-1 text-sm text-owly-text-light">{signal.description || signal.signalType}</p>
                      </div>
                      <div className="flex items-center justify-between text-xs text-owly-text-light">
                        <span>{signal.severity} - {signal.status}</span>
                        {signal.status !== "resolved" && (
                          <button
                            type="button"
                            onClick={() => resolveSignal(signal.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 font-semibold text-green-700 hover:bg-green-100"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-sm text-owly-text-light">No signals linked to this record.</div>
              )}
            </div>

            <div className="rounded-xl border border-owly-border bg-owly-surface p-5">
              <h2 className="font-semibold text-owly-text">Source</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <Info label="Channel" value={record?.sourceChannel || "--"} />
                <Info label="Customer" value={record?.customerId || "--"} />
                <Info label="Conversation" value={record?.conversationId || "--"} />
                <Info label="Source message" value={record?.sourceMessage || "--"} />
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
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
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
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
            {statusLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function statusLabel(value: string) {
  return value.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

function LineItemsEditor({
  value,
  onChange,
}: {
  value: LineItemRow[];
  onChange: (rows: LineItemRow[]) => void;
}) {
  function updateRow(index: number, patch: Partial<LineItemRow>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }
  function addRow() {
    onChange([...value, { item: "", quantity: 1 }]);
  }

  return (
    <div className="rounded-xl border border-owly-border bg-owly-surface">
      <div className="flex items-center justify-between border-b border-owly-border px-5 py-4">
        <h2 className="font-semibold text-owly-text">Line items</h2>
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-owly-border px-3 py-1.5 text-sm font-semibold text-owly-text hover:bg-owly-bg"
        >
          + Add item
        </button>
      </div>
      {value.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-owly-text-light">No line items yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-owly-border text-left text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                <th className="px-5 py-2.5 w-10">#</th>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5 w-32">Quantity</th>
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-owly-border">
              {value.map((row, index) => (
                <tr key={index}>
                  <td className="px-5 py-2.5 text-owly-text-light">{index + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      value={row.item}
                      onChange={(event) => updateRow(index, { item: event.target.value })}
                      placeholder="Item name"
                      className="h-9 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(event) => updateRow(index, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                      className="h-9 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="text-owly-text-light hover:text-owly-danger"
                      aria-label="Remove item"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
    return <SelectField label={field.label} value={value || field.options?.[0] || ""} options={field.options || []} onChange={onChange} />;
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-owly-text-light">{label}</dt>
      <dd className="mt-1 break-words text-owly-text">{value}</dd>
    </div>
  );
}
