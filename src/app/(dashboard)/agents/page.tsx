"use client";

import { Header } from "@/components/layout/header";
import { unwrapListResponse } from "@/lib/api-response";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import type React from "react";
import {
  Bot,
  Brain,
  Check,
  Database,
  Mail,
  Plus,
  Radio,
  Save,
  Settings2,
  Trash2,
  Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Category {
  id: string;
  name: string;
  description: string;
}

interface Flow {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

interface AgentTool {
  id?: string;
  toolType: string;
  toolName: string;
  isEnabled: boolean;
  requiresApproval: boolean;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  status: string;
  tone: string;
  language: string;
  systemPrompt: string;
  fallbackMode: string;
  automationMode: string;
  requireApproval: boolean;
  useGlobalKnowledge: boolean;
  metadata?: {
    channel?: string;
  } | null;
  knowledgeScopes?: Array<{ categoryId?: string | null }>;
  workflows?: Array<{ flowId: string; flow: Flow }>;
  tools?: AgentTool[];
  _count?: {
    channelAccounts: number;
    knowledgeScopes: number;
    workflows: number;
    tools: number;
    conversations: number;
  };
}

const defaultForm = {
  name: "",
  description: "",
  status: "active",
  tone: "friendly",
  language: "auto",
  systemPrompt: "",
  automationMode: "workflow_first",
  fallbackMode: "ai_reply",
  requireApproval: false,
  useGlobalKnowledge: true,
  channel: "whatsapp",
  categoryIds: [] as string[],
  flowIds: [] as string[],
  tools: [
    {
      toolType: "mcp",
      toolName: "call_external_tool",
      isEnabled: false,
      requiresApproval: true,
    },
  ] as AgentTool[],
};

const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "sms", label: "SMS" },
  { value: "telegram", label: "Telegram" },
];

function formFromAgent(agent: Agent) {
  return {
    name: agent.name,
    description: agent.description,
    status: agent.status,
    tone: agent.tone,
    language: agent.language,
    systemPrompt: agent.systemPrompt,
    automationMode: agent.automationMode,
    fallbackMode: agent.fallbackMode,
    requireApproval: agent.requireApproval,
    useGlobalKnowledge: agent.useGlobalKnowledge,
    channel: agent.metadata?.channel || "whatsapp",
    categoryIds:
      agent.knowledgeScopes
        ?.map((scope) => scope.categoryId)
        .filter((id): id is string => Boolean(id)) || [],
    flowIds: agent.workflows?.map((workflow) => workflow.flowId) || [],
    tools: agent.tools?.length ? agent.tools : defaultForm.tools,
  };
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function AgentsClient({ routeAgentId = null }: { routeAgentId?: string | null }) {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) || null,
    [agents, selectedAgentId]
  );

  const loadData = useCallback(async (preferredAgentId?: string | null) => {
    setError("");
    try {
      const [agentRes, categoryRes, flowRes] = await Promise.all([
        fetch("/api/agents?limit=100"),
        fetch("/api/knowledge/categories?limit=100"),
        fetch("/api/flows?limit=100"),
      ]);

      if (!agentRes.ok) throw new Error("Failed to fetch agents");
      if (!categoryRes.ok) throw new Error("Failed to fetch KB categories");
      if (!flowRes.ok) throw new Error("Failed to fetch workflows");

      const [agentPayload, categoryPayload, flowPayload] =
        await Promise.all([
          agentRes.json(),
          categoryRes.json(),
          flowRes.json(),
        ]);

      const nextAgents = unwrapListResponse<Agent>(agentPayload);
      setAgents(nextAgents);
      setCategories(unwrapListResponse<Category>(categoryPayload));
      setFlows(unwrapListResponse<Flow>(flowPayload));

      const nextSelectedId = preferredAgentId ?? routeAgentId;
      const nextSelectedAgent = nextSelectedId
        ? nextAgents.find((agent) => agent.id === nextSelectedId)
        : null;

      if (nextSelectedId === "new") {
        setSelectedAgentId(null);
        setForm(defaultForm);
      } else if (nextSelectedAgent) {
        setSelectedAgentId(nextSelectedAgent.id);
        setForm(formFromAgent(nextSelectedAgent));
      } else if (!nextSelectedId && nextAgents[0]) {
        setSelectedAgentId(nextAgents[0].id);
        setForm(formFromAgent(nextAgents[0]));
        router.replace(`/agents/${nextAgents[0].id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [routeAgentId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (routeAgentId === "new") {
      setSelectedAgentId(null);
      setForm(defaultForm);
      return;
    }

    if (!routeAgentId) return;

    const agent = agents.find((item) => item.id === routeAgentId);
    if (agent) {
      setSelectedAgentId(agent.id);
      setForm(formFromAgent(agent));
    }
  }, [agents, routeAgentId]);

  function selectAgent(agent: Agent) {
    setSelectedAgentId(agent.id);
    setForm(formFromAgent(agent));
    router.push(`/agents/${agent.id}`);
  }

  function startNewAgent() {
    setSelectedAgentId(null);
    setForm(defaultForm);
    router.push("/agents/new");
  }

  async function saveAgent() {
    if (!form.name.trim()) {
      setError("Agent name is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const url = selectedAgentId ? `/api/agents/${selectedAgentId}` : "/api/agents";
      const method = selectedAgentId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          metadata: { channel: form.channel },
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to save agent");
      }

      const saved = await res.json();
      setSelectedAgentId(saved.id);
      setForm(formFromAgent(saved));
      router.replace(`/agents/${saved.id}`);
      await loadData(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgent() {
    if (!selectedAgentId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${selectedAgentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete agent");
      setSelectedAgentId(null);
      setForm(defaultForm);
      router.replace("/agents/new");
      await loadData("new");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete agent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header title="Agents" description="Assign each AI agent to one channel" />

      <div className="flex h-[calc(100vh-4.5rem)] bg-slate-50">
        <aside className="w-80 border-r border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Agent profiles</h2>
              <p className="text-xs text-slate-500">Channel, KB, workflow, and tool routing</p>
            </div>
            <button
              onClick={startNewAgent}
              className="inline-flex items-center gap-1 rounded-md bg-owly-primary px-3 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              New
            </button>
          </div>

          {loading ? (
            <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
              Loading agents...
            </div>
          ) : agents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No agents yet. Create one for WhatsApp support, email finance, or another channel role.
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => selectAgent(agent)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors",
                    selectedAgentId === agent.id
                      ? "border-owly-primary bg-owly-primary/10"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{agent.name}</p>
                      <p className="line-clamp-2 text-xs text-slate-500">
                        {agent.description || "No description"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        agent.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {agent.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span>
                      {CHANNEL_OPTIONS.find((option) => option.value === agent.metadata?.channel)?.label ||
                        "WhatsApp"}
                    </span>
                    <span>{agent._count?.knowledgeScopes || 0} KB scopes</span>
                    <span>{agent._count?.workflows || 0} workflows</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {selectedAgent ? selectedAgent.name : "New agent"}
              </h1>
              <p className="text-sm text-slate-500">
                Define what this agent knows, where it listens, and what it can execute.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedAgentId && (
                <button
                  onClick={deleteAgent}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
              <button
                onClick={saveAgent}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-owly-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save agent"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-5">
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Bot className="h-5 w-5 text-owly-primary" />
                  <h2 className="font-semibold text-slate-900">Agent identity</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">Name</span>
                    <input
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      placeholder="Customer Support Agent"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-owly-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">Status</span>
                    <select
                      value={form.status}
                      onChange={(event) => setForm({ ...form, status: event.target.value })}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-owly-primary"
                    >
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </label>
                </div>
                <label className="mt-4 block space-y-1">
                  <span className="text-sm font-medium text-slate-700">Description</span>
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    placeholder="Handles WhatsApp support questions and refund triage."
                    rows={3}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-owly-primary"
                  />
                </label>
                <label className="mt-4 block space-y-1">
                  <span className="text-sm font-medium text-slate-700">System instructions</span>
                  <textarea
                    value={form.systemPrompt}
                    onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })}
                    placeholder="Use the scoped KB first. Ask for approval before refund or payment actions."
                    rows={5}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-owly-primary"
                  />
                </label>
              </div>

              <AssignmentCard
                icon={Radio}
                title="Assigned channel"
                subtitle="Choose the single channel this agent is responsible for."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {CHANNEL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm({ ...form, channel: option.value })}
                      className={cn(
                        "rounded-lg border p-4 text-left transition-colors",
                        form.channel === option.value
                          ? "border-owly-primary bg-owly-primary/10"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          {option.label}
                        </span>
                        {form.channel === option.value && (
                          <span className="rounded-full bg-owly-primary px-2 py-0.5 text-xs font-medium text-white">
                            Selected
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        This agent handles {option.label.toLowerCase()} conversations.
                      </p>
                    </button>
                  ))}
                </div>
              </AssignmentCard>

              <AssignmentCard
                icon={Database}
                title="Knowledge scope"
                subtitle="Select KB categories this agent can use. Empty means global KB if enabled."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {categories.map((category) => (
                    <label
                      key={category.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                        form.categoryIds.includes(category.id)
                          ? "border-emerald-400 bg-emerald-50"
                          : "border-slate-200"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={form.categoryIds.includes(category.id)}
                        onChange={() =>
                          setForm({
                            ...form,
                            categoryIds: toggleValue(form.categoryIds, category.id),
                          })
                        }
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-slate-900">{category.name}</p>
                        <p className="text-xs text-slate-500">
                          {category.description || "Knowledge category"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </AssignmentCard>

              <AssignmentCard
                icon={Workflow}
                title="Workflow routing"
                subtitle="Workflows this agent can use before falling back to AI."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {flows.map((flow) => (
                    <label
                      key={flow.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                        form.flowIds.includes(flow.id)
                          ? "border-violet-400 bg-violet-50"
                          : "border-slate-200"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={form.flowIds.includes(flow.id)}
                        onChange={() =>
                          setForm({
                            ...form,
                            flowIds: toggleValue(form.flowIds, flow.id),
                          })
                        }
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-slate-900">{flow.name}</p>
                        <p className="text-xs text-slate-500">
                          {flow.isActive ? "Active" : "Draft"} - {flow.description || "No description"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </AssignmentCard>
            </section>

            <aside className="space-y-5">
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-owly-primary" />
                  <h2 className="font-semibold text-slate-900">Runtime policy</h2>
                </div>
                <div className="space-y-4">
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium text-slate-700">Automation mode</span>
                    <select
                      value={form.automationMode}
                      onChange={(event) =>
                        setForm({ ...form, automationMode: event.target.value })
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="workflow_first">Workflow first</option>
                      <option value="ai_first">AI first</option>
                      <option value="manual_only">Manual only</option>
                    </select>
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium text-slate-700">Fallback</span>
                    <select
                      value={form.fallbackMode}
                      onChange={(event) =>
                        setForm({ ...form, fallbackMode: event.target.value })
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="ai_reply">AI reply</option>
                      <option value="human_handoff">Human handoff</option>
                      <option value="no_reply">No auto reply</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <input
                      type="checkbox"
                      checked={form.requireApproval}
                      onChange={(event) =>
                        setForm({ ...form, requireApproval: event.target.checked })
                      }
                    />
                    <span className="text-sm text-slate-700">Require approval before actions</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <input
                      type="checkbox"
                      checked={form.useGlobalKnowledge}
                      onChange={(event) =>
                        setForm({ ...form, useGlobalKnowledge: event.target.checked })
                      }
                    />
                    <span className="text-sm text-slate-700">Use global KB when no scope is selected</span>
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Brain className="h-5 w-5 text-owly-primary" />
                  <h2 className="font-semibold text-slate-900">Enabled capabilities</h2>
                </div>
                {form.tools.map((tool, index) => (
                  <label key={`${tool.toolType}-${tool.toolName}`} className="mb-3 flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                    <input
                      type="checkbox"
                      checked={tool.isEnabled}
                      onChange={(event) => {
                        const tools = [...form.tools];
                        tools[index] = { ...tool, isEnabled: event.target.checked };
                        setForm({ ...form, tools });
                      }}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium text-slate-900">
                        {tool.toolName.replaceAll("_", " ")}
                      </p>
                      <p className="text-xs text-slate-500">
                        {tool.toolType.toUpperCase()} tool
                        {tool.requiresApproval ? " - approval required" : ""}
                      </p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Mail className="h-5 w-5 text-owly-primary" />
                  <h2 className="font-semibold text-slate-900">Recommended setup</h2>
                </div>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                    WhatsApp Support Agent: support KB, refund approval workflow.
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                    Finance Support Agent: billing email account, invoices KB.
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                    Sales Agent: lead workflows, product docs, CRM tools.
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </>
  );
}

export default function AgentsPage() {
  return <AgentsClient />;
}

function AssignmentCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-owly-primary" />
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
