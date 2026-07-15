"use client";

import { Header } from "@/components/layout/header";
import {
  Plug,
  Plus,
  X,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  KeyRound,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { unwrapListResponse } from "@/lib/api-response";
import { useToast } from "@/components/ui/toast";
import {
  CONNECTOR_PROVIDERS,
  type ConnectorFieldDef,
  type ConnectorProviderDef,
} from "@/lib/connectors/catalog";

interface ConnectorData {
  id: string;
  provider: string;
  name: string;
  authType: string;
  status: string;
  isActive: boolean;
  config: Record<string, unknown>;
  lastTestedAt: string | null;
  lastTestResult: { ok?: boolean; message?: string } | null;
  lastError: string | null;
}

function statusBadge(status: string) {
  switch (status) {
    case "connected":
      return { icon: CheckCircle, className: "bg-green-100 text-green-700" };
    case "error":
      return { icon: XCircle, className: "bg-red-100 text-red-700" };
    case "connecting":
      return { icon: Loader2, className: "bg-orange-50 text-orange-700" };
    default:
      return { icon: AlertCircle, className: "bg-gray-100 text-gray-500" };
  }
}

function emptyFormValues(provider: ConnectorProviderDef): Record<string, string> {
  const values: Record<string, string> = { name: "" };
  for (const field of provider.fields) values[field.key] = "";
  return values;
}

function ConnectorsPageInner() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [connectors, setConnectors] = useState<ConnectorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState<ConnectorProviderDef | null>(null);
  const [editing, setEditing] = useState<ConnectorData | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors?limit=100");
      if (res.ok) {
        setConnectors(unwrapListResponse<ConnectorData>(await res.json()));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Surface the OAuth callback's redirect outcome once, then let the URL
  // params go stale (no history rewrite needed for this admin-only page).
  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("oauth_error");
    if (connected) {
      toast({ type: "success", title: `Connected to ${connected}` });
      load();
    } else if (oauthError) {
      toast({ type: "error", title: "OAuth connection failed", description: oauthError });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const byProvider = useMemo(() => {
    const map = new Map<string, ConnectorData[]>();
    for (const connector of connectors) {
      const list = map.get(connector.provider) || [];
      list.push(connector);
      map.set(connector.provider, list);
    }
    return map;
  }, [connectors]);

  function openConnect(provider: ConnectorProviderDef) {
    setActiveProvider(provider);
    setEditing(null);
    setForm(emptyFormValues(provider));
    setError("");
  }

  function openEdit(connector: ConnectorData) {
    const provider = CONNECTOR_PROVIDERS.find((p) => p.provider === connector.provider);
    if (!provider) return;
    setActiveProvider(provider);
    setEditing(connector);
    const values: Record<string, string> = { name: connector.name };
    for (const field of provider.fields) {
      const value = connector.config[field.key];
      values[field.key] = typeof value === "string" ? value : "";
    }
    setError("");
    setForm(values);
  }

  function closeModal() {
    setActiveProvider(null);
    setEditing(null);
  }

  async function save() {
    if (!activeProvider) return;
    setSaving(true);
    setError("");
    try {
      if (activeProvider.authType === "oauth2") {
        const res = await fetch("/api/connectors/oauth/authorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: activeProvider.provider, connectorId: editing?.id, ...form }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to start OAuth flow");
        window.location.href = body.redirectUrl;
        return;
      }

      const payload = { provider: activeProvider.provider, ...form };
      const res = editing
        ? await fetch(`/api/connectors/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/connectors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to save connector");
      closeModal();
      await load();
      toast({ type: "success", title: editing ? "Connector updated" : "Connector created" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save connector");
    } finally {
      setSaving(false);
    }
  }

  async function remove(connector: ConnectorData) {
    if (!window.confirm(`Delete connector "${connector.name}"?`)) return;
    const res = await fetch(`/api/connectors/${connector.id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
      toast({ type: "success", title: "Connector deleted" });
    } else {
      toast({ type: "error", title: "Failed to delete connector" });
    }
  }

  async function test(connector: ConnectorData) {
    setTestingId(connector.id);
    try {
      const res = await fetch(`/api/connectors/${connector.id}/test`, { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        toast({
          type: body.result?.ok ? "success" : "error",
          title: body.result?.ok ? "Connection succeeded" : "Connection failed",
          description: body.result?.message,
        });
        await load();
      } else {
        toast({ type: "error", title: body?.error || "Test connection failed" });
      }
    } finally {
      setTestingId(null);
    }
  }

  return (
    <>
      <Header title="Connectors" description="Connect SAP, Oracle, Microsoft 365, Dynamics 365 Business Central, and Odoo." />

      <div className="p-4 sm:p-6 space-y-6">
        <section>
          <h2 className="mb-3 font-semibold text-owly-text">Available connectors</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CONNECTOR_PROVIDERS.map((provider) => (
              <div key={provider.provider} className="flex flex-col rounded-xl border border-owly-border bg-owly-surface p-4">
                <div className="flex items-center gap-2">
                  <Plug className="h-5 w-5 text-owly-primary" />
                  <h3 className="font-semibold text-owly-text">{provider.name}</h3>
                </div>
                <p className="mt-2 flex-1 text-sm text-owly-text-light">{provider.description}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-owly-text-light">
                  {provider.authType === "oauth2" ? "OAuth 2.0" : "API key / Basic auth"}
                </p>
                <button
                  type="button"
                  onClick={() => openConnect(provider)}
                  className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-owly-primary px-3 py-2 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" />
                  Connect
                </button>
                {(byProvider.get(provider.provider)?.length ?? 0) > 0 && (
                  <p className="mt-2 text-xs text-owly-text-light">
                    {byProvider.get(provider.provider)!.length} connection{byProvider.get(provider.provider)!.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-owly-border bg-owly-surface">
          <div className="border-b border-owly-border px-5 py-4">
            <h2 className="font-semibold text-owly-text">Connections</h2>
            <p className="text-sm text-owly-text-light">
              Credentials are encrypted at rest. Use Test Connection to verify a connector against its live endpoint.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-owly-primary" />
            </div>
          ) : connectors.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-owly-text-light">
              No connectors yet. Connect one of the ERP systems above to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-owly-border text-left text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                    <th className="px-5 py-3">Connector</th>
                    <th className="px-3 py-3">Provider</th>
                    <th className="px-3 py-3">Auth</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Last tested</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-owly-border">
                  {connectors.map((connector) => {
                    const badge = statusBadge(connector.status);
                    const BadgeIcon = badge.icon;
                    const provider = CONNECTOR_PROVIDERS.find((p) => p.provider === connector.provider);
                    return (
                      <tr key={connector.id} className="hover:bg-owly-bg/60">
                        <td className="px-5 py-3 font-semibold text-owly-text">{connector.name}</td>
                        <td className="px-3 py-3 text-owly-text-light">{provider?.name || connector.provider}</td>
                        <td className="px-3 py-3 text-owly-text-light">
                          {connector.authType === "oauth2" ? "OAuth 2.0" : "API key"}
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", badge.className)}>
                            <BadgeIcon className={cn("h-3 w-3", connector.status === "connecting" && "animate-spin")} />
                            {connector.status}
                          </span>
                          {connector.lastError && (
                            <p className="mt-1 max-w-xs truncate text-xs text-red-600" title={connector.lastError}>
                              {connector.lastError}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-owly-text-light">
                          {connector.lastTestedAt ? new Date(connector.lastTestedAt).toLocaleString() : "Never"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => test(connector)}
                              disabled={testingId === connector.id}
                              className="rounded-lg p-1.5 text-owly-text-light hover:bg-owly-primary-50 hover:text-owly-primary disabled:opacity-60"
                              title="Test connection"
                            >
                              {testingId === connector.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </button>
                            {connector.authType === "oauth2" && provider && (
                              <button
                                type="button"
                                onClick={() => openConnect(provider)}
                                className="rounded-lg p-1.5 text-owly-text-light hover:bg-owly-primary-50 hover:text-owly-primary"
                                title="Reauthorize"
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEdit(connector)}
                              className="rounded-lg p-1.5 text-owly-text-light hover:bg-owly-primary-50 hover:text-owly-primary"
                              title="Edit connector"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(connector)}
                              className="rounded-lg p-1.5 text-owly-text-light hover:bg-red-50 hover:text-red-600"
                              title="Delete connector"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {activeProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-owly-border bg-owly-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-owly-border px-5 py-4">
              <h3 className="text-lg font-semibold text-owly-text">
                {editing ? `Edit ${editing.name}` : `Connect ${activeProvider.name}`}
              </h3>
              <button type="button" onClick={closeModal} className="rounded-lg p-1.5 text-owly-text-light hover:bg-owly-bg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}
              {!editing && (
                <label className="block text-sm">
                  <span className="font-medium text-owly-text">Connection name</span>
                  <input
                    value={form.name || ""}
                    onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                    placeholder={`e.g. ${activeProvider.name} Production`}
                    className="mt-1 h-10 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                  />
                </label>
              )}
              {activeProvider.fields
                .filter((field) => !(editing && activeProvider.authType === "oauth2" && field.key === "clientSecret"))
                .map((field: ConnectorFieldDef) => (
                  <label key={field.key} className="block text-sm">
                    <span className="font-medium text-owly-text">
                      {field.label}
                      {field.authMode && <span className="ml-1 text-xs text-owly-text-light">({field.authMode === "api_key" ? "API key auth" : "Basic auth"})</span>}
                    </span>
                    <input
                      type={field.type === "password" ? "password" : "text"}
                      value={form[field.key] || ""}
                      onChange={(event) => setForm((f) => ({ ...f, [field.key]: event.target.value }))}
                      placeholder={field.placeholder || (editing && field.location === "credentials" ? "Leave blank to keep current value" : "")}
                      className="mt-1 h-10 w-full rounded-lg border border-owly-border bg-owly-bg px-3 text-sm text-owly-text outline-none focus:border-owly-primary"
                    />
                    {field.helpText && <span className="mt-1 block text-xs text-owly-text-light">{field.helpText}</span>}
                  </label>
                ))}
              {activeProvider.authType === "oauth2" && !editing && (
                <p className="rounded-lg bg-owly-bg px-3 py-2 text-xs text-owly-text-light">
                  Saving redirects to {activeProvider.name}&apos;s consent screen. You&apos;ll return here once authorized.
                </p>
              )}
              {activeProvider.authType === "oauth2" && editing && (
                <p className="rounded-lg bg-owly-bg px-3 py-2 text-xs text-owly-text-light">
                  This updates connection settings only. Use the reauthorize action to refresh credentials.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-owly-border px-5 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-owly-border px-4 py-2 text-sm font-semibold text-owly-text hover:bg-owly-bg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || (!editing && !form.name?.trim())}
                onClick={save}
                className="inline-flex items-center gap-2 rounded-lg bg-owly-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {activeProvider.authType === "oauth2" ? "Connect via OAuth" : editing ? "Save changes" : "Create connector"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ConnectorsPage() {
  return (
    <Suspense fallback={null}>
      <ConnectorsPageInner />
    </Suspense>
  );
}
