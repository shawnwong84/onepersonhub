"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";

interface AgentOption {
  id: string;
  name: string;
  status?: string;
}

interface ChannelAccountData {
  id: string;
  channel: string;
  name: string;
  identifier: string;
  status: string;
  isActive: boolean;
  automationMode: string;
  defaultAgent: AgentOption | null;
  agents: { agent: AgentOption; priority: number }[];
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  _count: { conversations: number; agents: number };
}

const CHANNEL_TYPES = ["whatsapp", "email", "sms", "telegram", "phone"];
const AUTOMATION_MODES = [
  { value: "workflow_first", label: "Workflow first" },
  { value: "ai_first", label: "AI first" },
  { value: "approval_required", label: "Approval required" },
  { value: "manual_only", label: "Manual only" },
];

const EMPTY_FORM = {
  channel: "whatsapp",
  name: "",
  identifier: "",
  automationMode: "workflow_first",
  defaultAgentId: "",
  isActive: true,
};

export function ChannelAccountsSection() {
  const [accounts, setAccounts] = useState<ChannelAccountData[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ChannelAccountData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [accountsRes, agentsRes] = await Promise.all([
        fetch("/api/channel-accounts?limit=100"),
        fetch("/api/agents?limit=100"),
      ]);
      if (accountsRes.ok) {
        const body = await accountsRes.json();
        setAccounts(body.data || []);
      }
      if (agentsRes.ok) {
        const body = await agentsRes.json();
        setAgents((body.data || body.agents || []).map((agent: AgentOption) => ({ id: agent.id, name: agent.name })));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  }

  function openEdit(account: ChannelAccountData) {
    setEditing(account);
    setForm({
      channel: account.channel,
      name: account.name,
      identifier: account.identifier,
      automationMode: account.automationMode,
      defaultAgentId: account.defaultAgent?.id || "",
      isActive: account.isActive,
    });
    setError("");
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        channel: form.channel,
        name: form.name.trim(),
        identifier: form.identifier.trim(),
        automationMode: form.automationMode,
        defaultAgentId: form.defaultAgentId || null,
        isActive: form.isActive,
      };
      const res = editing
        ? await fetch(`/api/channel-accounts/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/channel-accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to save channel account");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save channel account");
    } finally {
      setSaving(false);
    }
  }

  async function remove(account: ChannelAccountData) {
    if (!window.confirm(`Delete channel account "${account.name}"? Conversations keep their history.`)) return;
    const res = await fetch(`/api/channel-accounts/${account.id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <section className="max-w-7xl mt-6 rounded-xl border border-owly-border bg-owly-surface">
      <div className="flex flex-col gap-3 border-b border-owly-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-owly-text">Channel accounts</h2>
          <p className="text-sm text-owly-text-light">
            Multiple numbers and inboxes per channel, each with its own default agent and automation mode.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-owly-primary px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Add account
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-owly-primary" />
        </div>
      ) : accounts.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-owly-text-light">
          No channel accounts yet. Add one to route a specific WhatsApp number or inbox to its own agent.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-owly-border text-left text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                <th className="px-5 py-3">Account</th>
                <th className="px-3 py-3">Channel</th>
                <th className="px-3 py-3">Default agent</th>
                <th className="px-3 py-3">Automation</th>
                <th className="px-3 py-3">Activity</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-owly-border">
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-owly-bg/60">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-owly-text">{account.name}</p>
                    <p className="text-xs text-owly-text-light">{account.identifier}</p>
                  </td>
                  <td className="px-3 py-3 capitalize text-owly-text-light">{account.channel}</td>
                  <td className="px-3 py-3">
                    {account.defaultAgent ? (
                      <span className="inline-flex items-center gap-1.5 text-owly-text">
                        <Users className="h-3.5 w-3.5 text-owly-primary" />
                        {account.defaultAgent.name}
                      </span>
                    ) : (
                      <span className="text-owly-text-light">--</span>
                    )}
                    {account._count.agents > 0 && (
                      <p className="mt-0.5 text-xs text-owly-text-light">
                        +{account._count.agents} assigned agent{account._count.agents > 1 ? "s" : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-owly-text-light">
                    {AUTOMATION_MODES.find((mode) => mode.value === account.automationMode)?.label || account.automationMode}
                  </td>
                  <td className="px-3 py-3 text-xs text-owly-text-light">
                    <p>{account._count.conversations} conversations</p>
                    {account.lastInboundAt && <p>in: {formatRelativeTime(account.lastInboundAt)}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        !account.isActive
                          ? "bg-gray-100 text-gray-500"
                          : account.status === "connected"
                          ? "bg-green-100 text-green-700"
                          : "bg-orange-50 text-orange-700"
                      )}
                    >
                      {!account.isActive ? "inactive" : account.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(account)}
                        className="rounded-lg p-1.5 text-owly-text-light hover:bg-owly-primary-50 hover:text-owly-primary"
                        title="Edit account"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(account)}
                        className="rounded-lg p-1.5 text-owly-text-light hover:bg-red-50 hover:text-red-600"
                        title="Delete account"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-owly-border bg-owly-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-owly-border px-5 py-4">
              <h3 className="text-lg font-semibold text-owly-text">
                {editing ? `Edit ${editing.name}` : "Add channel account"}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1.5 text-owly-text-light hover:bg-owly-bg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}
              <label className="block text-sm">
                <span className="font-medium text-owly-text">Channel</span>
                <select
                  value={form.channel}
                  disabled={Boolean(editing)}
                  onChange={(event) => setForm((f) => ({ ...f, channel: event.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary disabled:opacity-60"
                >
                  {CHANNEL_TYPES.map((type) => (
                    <option key={type} value={type} className="capitalize">{type}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-owly-text">Name</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                  placeholder="e.g. Sales WhatsApp"
                  className="mt-1 h-10 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-owly-text">Identifier (number or address)</span>
                <input
                  value={form.identifier}
                  onChange={(event) => setForm((f) => ({ ...f, identifier: event.target.value }))}
                  placeholder="+60123456789 or sales@company.com"
                  className="mt-1 h-10 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-owly-text">Default agent</span>
                <select
                  value={form.defaultAgentId}
                  onChange={(event) => setForm((f) => ({ ...f, defaultAgentId: event.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                >
                  <option value="">No default agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-owly-text-light">
                  Inbound messages on this account route to this agent unless another assignment matches.
                </span>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-owly-text">Automation mode</span>
                <select
                  value={form.automationMode}
                  onChange={(event) => setForm((f) => ({ ...f, automationMode: event.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                >
                  {AUTOMATION_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-owly-text">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((f) => ({ ...f, isActive: event.target.checked }))}
                />
                Account active
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-owly-border px-5 py-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-owly-border px-4 py-2 text-sm font-semibold text-owly-text hover:bg-owly-bg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !form.name.trim() || !form.identifier.trim()}
                onClick={save}
                className="inline-flex items-center gap-2 rounded-lg bg-owly-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Create account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
