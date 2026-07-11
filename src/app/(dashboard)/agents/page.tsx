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
  escalationDepartmentId?: string | null;
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
  escalationDepartmentId: "",
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
    escalationDepartmentId: agent.escalationDepartmentId || "",
    channel: agent.metadata?.channel || "whatsapp",
    categoryIds:
      agent.knowledgeScopes
        ?.map((scope) => scope.categoryId)
        .filter((id): id is string => Boolean(id)) || [],
    flowIds: agent.workflows?.map((workflow) => workflow.flowId) || [],
    tools: agent.tools?.length ? agent.tools : defaultForm.tools,
  };
}

interface AgentAnalytics {
  id: string;
  name: string;
  conversations: number;
  aiReplies: number;
  workflowReplies: number;
  aiFallbackRate: number;
  workflowSuccessRate: number;
  workflowRuns: number;
  handoffRate: number;
  handoffs: number;
}

interface AgentTestResult {
  reply: string;
  replyError: string;
  knowledge: { id: string; title: string; score: number }[];
  knowledgeScopeCount: number;
  usesGlobalKnowledge: boolean;
  matchedFlows: { id: string; name: string }[];
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
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [analytics, setAnalytics] = useState<AgentAnalytics[]>([]);
  const [testOpen, setTestOpen] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testChannel, setTestChannel] = useState("whatsapp");
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<AgentTestResult | null>(null);

  const runAgentTest = async () => {
    if (!selectedAgentId || !testMessage.trim() || testRunning) return;
    setTestRunning(true);
    try {
      const res = await fetch(`/api/agents/${selectedAgentId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testMessage.trim(), channel: testChannel }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Test failed");
      setTestResult(body as AgentTestResult);
    } catch (err) {
      setTestResult({
        reply: "",
        replyError: err instanceof Error ? err.message : "Test failed",
        knowledge: [],
        knowledgeScopeCount: 0,
        usesGlobalKnowledge: false,
        matchedFlows: [],
      });
    } finally {
      setTestRunning(false);
    }
  };

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) || null,
    [agents, selectedAgentId]
  );

  const loadData = useCallback(async (preferredAgentId?: string | null) => {
    setError("");
    try {
      const [agentRes, categoryRes, flowRes, departmentRes, analyticsRes] = await Promise.all([
        fetch("/api/agents?limit=100"),
        fetch("/api/knowledge/categories?limit=100"),
        fetch("/api/flows?limit=100"),
        fetch("/api/team/departments"),
        fetch("/api/agents/analytics?days=30"),
      ]);

      if (!agentRes.ok) throw new Error("Failed to fetch agents");
      if (!categoryRes.ok) throw new Error("Failed to fetch KB categories");
      if (!flowRes.ok) throw new Error("Failed to fetch workflows");
      if (departmentRes.ok) {
        const departmentPayload = await departmentRes.json();
        const list = Array.isArray(departmentPayload) ? departmentPayload : departmentPayload.data || [];
        setDepartments(list.map((dept: { id: string; name: string }) => ({ id: dept.id, name: dept.name })));
      }
      if (analyticsRes.ok) {
        const analyticsPayload = await analyticsRes.json();
        setAnalytics(analyticsPayload.agents || []);
      }

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

      <div className="flex h-[calc(100vh-4.5rem)] bg-owly-bg">
        <aside className="w-80 border-r border-owly-border bg-owly-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-owly-text">Agent profiles</h2>
              <p className="text-xs text-owly-text-light">Channel, KB, workflow, and tool routing</p>
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
            <div className="rounded-lg border border-owly-border p-4 text-sm text-owly-text-light">
              Loading agents...
            </div>
          ) : agents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-owly-border p-4 text-sm text-owly-text-light">
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
                      : "border-owly-border bg-owly-surface hover:bg-owly-bg"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-owly-text">{agent.name}</p>
                      <p className="line-clamp-2 text-xs text-owly-text-light">
                        {agent.description || "No description"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        agent.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-owly-bg text-owly-text-light"
                      )}
                    >
                      {agent.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-owly-text-light">
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
              <h1 className="text-2xl font-semibold text-owly-text">
                {selectedAgent ? selectedAgent.name : "New agent"}
              </h1>
              <p className="text-sm text-owly-text-light">
                Define what this agent knows, where it listens, and what it can execute.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedAgentId && (
                <button
                  onClick={() => {
                    setTestResult(null);
                    setTestMessage("");
                    setTestOpen(true);
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md border border-owly-border px-4 py-2 text-sm font-medium text-owly-text hover:bg-owly-bg"
                >
                  <Bot className="h-4 w-4" />
                  Test agent
                </button>
              )}
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

          {selectedAgentId && (() => {
            const stats = analytics.find((entry) => entry.id === selectedAgentId);
            if (!stats) return null;
            return (
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-owly-border bg-owly-surface p-3">
                  <p className="text-xs text-owly-text-light">Conversations (30d)</p>
                  <p className="text-xl font-bold text-owly-text">{stats.conversations}</p>
                </div>
                <div className="rounded-lg border border-owly-border bg-owly-surface p-3">
                  <p className="text-xs text-owly-text-light">AI fallback rate</p>
                  <p className="text-xl font-bold text-owly-text">{stats.aiFallbackRate}%</p>
                  <p className="text-[11px] text-owly-text-light">{stats.aiReplies} AI / {stats.workflowReplies} workflow replies</p>
                </div>
                <div className="rounded-lg border border-owly-border bg-owly-surface p-3">
                  <p className="text-xs text-owly-text-light">Workflow success</p>
                  <p className="text-xl font-bold text-owly-text">{stats.workflowSuccessRate}%</p>
                  <p className="text-[11px] text-owly-text-light">{stats.workflowRuns} runs</p>
                </div>
                <div className="rounded-lg border border-owly-border bg-owly-surface p-3">
                  <p className="text-xs text-owly-text-light">Human handoff rate</p>
                  <p className="text-xl font-bold text-owly-text">{stats.handoffRate}%</p>
                  <p className="text-[11px] text-owly-text-light">{stats.handoffs} takeovers</p>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-5">
              <div className="rounded-lg border border-owly-border bg-owly-surface p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Bot className="h-5 w-5 text-owly-primary" />
                  <h2 className="font-semibold text-owly-text">Agent identity</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-owly-text">Name</span>
                    <input
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      placeholder="Customer Support Agent"
                      className="w-full rounded-md border border-owly-border px-3 py-2 text-sm outline-none focus:border-owly-primary"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-owly-text">Status</span>
                    <select
                      value={form.status}
                      onChange={(event) => setForm({ ...form, status: event.target.value })}
                      className="w-full rounded-md border border-owly-border px-3 py-2 text-sm outline-none focus:border-owly-primary"
                    >
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </label>
                </div>
                <label className="mt-4 block space-y-1">
                  <span className="text-sm font-medium text-owly-text">Description</span>
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    placeholder="Handles WhatsApp support questions and refund triage."
                    rows={3}
                    className="w-full rounded-md border border-owly-border px-3 py-2 text-sm outline-none focus:border-owly-primary"
                  />
                </label>
                <label className="mt-4 block space-y-1">
                  <span className="text-sm font-medium text-owly-text">System instructions</span>
                  <textarea
                    value={form.systemPrompt}
                    onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })}
                    placeholder="Use the scoped KB first. Ask for approval before refund or payment actions."
                    rows={5}
                    className="w-full rounded-md border border-owly-border px-3 py-2 text-sm outline-none focus:border-owly-primary"
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
                          : "border-owly-border bg-owly-surface hover:bg-owly-bg"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-owly-text">
                          {option.label}
                        </span>
                        {form.channel === option.value && (
                          <span className="rounded-full bg-owly-primary px-2 py-0.5 text-xs font-medium text-white">
                            Selected
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-owly-text-light">
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
                          : "border-owly-border"
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
                        <p className="font-medium text-owly-text">{category.name}</p>
                        <p className="text-xs text-owly-text-light">
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
                          : "border-owly-border"
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
                        <p className="font-medium text-owly-text">{flow.name}</p>
                        <p className="text-xs text-owly-text-light">
                          {flow.isActive ? "Active" : "Draft"} - {flow.description || "No description"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </AssignmentCard>
            </section>

            <aside className="space-y-5">
              <div className="rounded-lg border border-owly-border bg-owly-surface p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-owly-primary" />
                  <h2 className="font-semibold text-owly-text">Runtime policy</h2>
                </div>
                <div className="space-y-4">
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium text-owly-text">Automation mode</span>
                    <select
                      value={form.automationMode}
                      onChange={(event) =>
                        setForm({ ...form, automationMode: event.target.value })
                      }
                      className="w-full rounded-md border border-owly-border px-3 py-2 text-sm"
                    >
                      <option value="workflow_first">Workflow first</option>
                      <option value="ai_first">AI first</option>
                      <option value="manual_only">Manual only</option>
                    </select>
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium text-owly-text">Fallback</span>
                    <select
                      value={form.fallbackMode}
                      onChange={(event) =>
                        setForm({ ...form, fallbackMode: event.target.value })
                      }
                      className="w-full rounded-md border border-owly-border px-3 py-2 text-sm"
                    >
                      <option value="ai_reply">AI reply</option>
                      <option value="human_handoff">Human handoff</option>
                      <option value="no_reply">No auto reply</option>
                    </select>
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium text-owly-text">Escalation department</span>
                    <select
                      value={form.escalationDepartmentId}
                      onChange={(event) =>
                        setForm({ ...form, escalationDepartmentId: event.target.value })
                      }
                      className="w-full rounded-md border border-owly-border px-3 py-2 text-sm"
                    >
                      <option value="">No escalation department</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
                    <span className="block text-xs text-owly-text-light">
                      Human handoffs from this agent route to this department.
                    </span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-owly-border p-3">
                    <input
                      type="checkbox"
                      checked={form.requireApproval}
                      onChange={(event) =>
                        setForm({ ...form, requireApproval: event.target.checked })
                      }
                    />
                    <span className="text-sm text-owly-text">Require approval before actions</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-owly-border p-3">
                    <input
                      type="checkbox"
                      checked={form.useGlobalKnowledge}
                      onChange={(event) =>
                        setForm({ ...form, useGlobalKnowledge: event.target.checked })
                      }
                    />
                    <span className="text-sm text-owly-text">Use global KB when no scope is selected</span>
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-owly-border bg-owly-surface p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Brain className="h-5 w-5 text-owly-primary" />
                  <h2 className="font-semibold text-owly-text">Enabled capabilities</h2>
                </div>
                {form.tools.map((tool, index) => (
                  <label key={`${tool.toolType}-${tool.toolName}`} className="mb-3 flex items-start gap-3 rounded-lg border border-owly-border p-3">
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
                      <p className="font-medium text-owly-text">
                        {tool.toolName.replaceAll("_", " ")}
                      </p>
                      <p className="text-xs text-owly-text-light">
                        {tool.toolType.toUpperCase()} tool
                        {tool.requiresApproval ? " - approval required" : ""}
                      </p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="rounded-lg border border-owly-border bg-owly-surface p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Mail className="h-5 w-5 text-owly-primary" />
                  <h2 className="font-semibold text-owly-text">Recommended setup</h2>
                </div>
                <ul className="space-y-2 text-sm text-owly-text-light">
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

      {testOpen && selectedAgentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-owly-border bg-owly-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-owly-border px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-owly-text">Test console</h3>
                <p className="text-sm text-owly-text-light">
                  Dry-run this agent with its KB scope and workflows. Nothing is sent to customers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTestOpen(false)}
                className="rounded-lg p-1.5 text-owly-text-light hover:bg-owly-bg"
              >
                <Trash2 className="hidden" />
                <span className="text-lg leading-none">&times;</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="flex gap-2">
                <select
                  value={testChannel}
                  onChange={(event) => setTestChannel(event.target.value)}
                  className="h-10 rounded-md border border-owly-border px-3 text-sm"
                >
                  {CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input
                  value={testMessage}
                  onChange={(event) => setTestMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") runAgentTest();
                  }}
                  placeholder="Type a sample customer message..."
                  className="h-10 flex-1 rounded-md border border-owly-border px-3 text-sm outline-none focus:border-owly-primary"
                />
                <button
                  type="button"
                  disabled={testRunning || !testMessage.trim()}
                  onClick={runAgentTest}
                  className="h-10 rounded-md bg-owly-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {testRunning ? "Running..." : "Run"}
                </button>
              </div>

              {testResult && (
                <>
                  {testResult.replyError && (
                    <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
                      {testResult.replyError}
                    </p>
                  )}
                  {testResult.reply && (
                    <div className="rounded-lg border border-owly-border bg-owly-bg p-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-owly-text-light">Agent reply</p>
                      <p className="whitespace-pre-wrap text-sm text-owly-text">{testResult.reply}</p>
                    </div>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-owly-border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                        Knowledge used ({testResult.knowledgeScopeCount} scope{testResult.knowledgeScopeCount === 1 ? "" : "s"}
                        {testResult.usesGlobalKnowledge ? " + global" : ""})
                      </p>
                      {testResult.knowledge.length === 0 ? (
                        <p className="mt-2 text-sm text-owly-text-light">No KB entries matched.</p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-sm text-owly-text">
                          {testResult.knowledge.map((item) => (
                            <li key={item.id} className="flex justify-between gap-2">
                              <span className="truncate">{item.title}</span>
                              <span className="text-xs text-owly-text-light">{Math.round(item.score * 100)}%</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="rounded-lg border border-owly-border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-owly-text-light">Workflows that would consider this</p>
                      {testResult.matchedFlows.length === 0 ? (
                        <p className="mt-2 text-sm text-owly-text-light">None - the agent would fall back per its policy.</p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-sm text-owly-text">
                          {testResult.matchedFlows.map((flow) => (
                            <li key={flow.id}>{flow.name}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
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
    <div className="rounded-lg border border-owly-border bg-owly-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-owly-primary" />
        <div>
          <h2 className="font-semibold text-owly-text">{title}</h2>
          <p className="text-xs text-owly-text-light">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
