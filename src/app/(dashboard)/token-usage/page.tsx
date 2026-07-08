"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Coins,
  Database,
  DollarSign,
  Layers3,
} from "lucide-react";
import { BarChart, LineChart } from "@/components/ui/chart";
import { StatCard } from "@/components/ui/stat-card";
import { cn, formatRelativeTime } from "@/lib/utils";

interface TokenUsageRow {
  id: string;
  provider: string;
  model: string;
  feature: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  entityType: string;
  entityId: string;
  createdAt: string;
}

interface TokenBreakdown {
  key: string;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  count: number;
}

interface DailyUsage {
  date: string;
  totalTokens: number;
  estimatedCostUsd: number;
  count: number;
}

interface TokenUsageResponse {
  data: TokenUsageRow[];
  totals: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    embeddingTokens?: number | null;
    totalTokens?: number | null;
    estimatedCostUsd?: number | null;
  };
  breakdowns: {
    byFeature: TokenBreakdown[];
    byOperation: TokenBreakdown[];
    byEntityType: TokenBreakdown[];
    byModel: TokenBreakdown[];
    daily: DailyUsage[];
  };
  budget: {
    monthlyUsed: number;
    monthlyBudget: number;
    warningPercent: number;
    warning: boolean;
  };
}

const FEATURE_OPTIONS = [
  { label: "All features", value: "" },
  { label: "Knowledge ingestion", value: "knowledge_ingestion" },
  { label: "AI reply", value: "ai_reply" },
  { label: "Workflow AI", value: "workflow_ai" },
  { label: "OCR", value: "ocr" },
  { label: "Embeddings", value: "embedding" },
];

const ENTITY_TYPE_OPTIONS = [
  { label: "All entities", value: "" },
  { label: "Document", value: "knowledge_document" },
  { label: "Ingestion run", value: "knowledge_ingestion_run" },
  { label: "Conversation", value: "conversation" },
  { label: "Workflow", value: "workflow" },
  { label: "Flow", value: "flow" },
];

const RANGE_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

function formatNumber(value: number | null | undefined) {
  return Math.round(value || 0).toLocaleString();
}

function formatCost(value: number | null | undefined) {
  return `$${(value || 0).toFixed(4)}`;
}

function formatLabel(value: string) {
  return value ? value.replace(/_/g, " ") : "unknown";
}

function getStartDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  return date.toISOString().slice(0, 10);
}

export default function TokenUsagePage() {
  const [data, setData] = useState<TokenUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(30);
  const [feature, setFeature] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");

  const start = useMemo(() => getStartDate(rangeDays), [rangeDays]);
  const end = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start,
        end,
        limit: "500",
      });
      if (feature) params.set("feature", feature);
      if (entityType) params.set("entityType", entityType);
      if (entityId.trim()) params.set("entityId", entityId.trim());
      const res = await fetch(`/api/token-usage?${params.toString()}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [end, entityId, entityType, feature, start]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const totals = data?.totals || {};
  const monthlyBudget = data?.budget.monthlyBudget || 0;
  const monthlyUsed = data?.budget.monthlyUsed || 0;
  const budgetPercent = monthlyBudget > 0 ? Math.min(100, Math.round((monthlyUsed / monthlyBudget) * 100)) : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-owly-border bg-owly-surface px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold text-owly-text">Token Usage</h1>
          <p className="text-sm text-owly-text-light">
            Track LLM, OCR, embedding, workflow, and RAG token consumption
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <select
            value={feature}
            onChange={(event) => setFeature(event.target.value)}
            className="rounded-lg border border-owly-border bg-owly-surface px-3 py-2 text-sm text-owly-text outline-none focus:border-owly-primary"
          >
            {FEATURE_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
            className="rounded-lg border border-owly-border bg-owly-surface px-3 py-2 text-sm text-owly-text outline-none focus:border-owly-primary"
          >
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={entityId}
            onChange={(event) => setEntityId(event.target.value)}
            placeholder="Entity ID"
            className="w-48 rounded-lg border border-owly-border bg-owly-surface px-3 py-2 text-sm text-owly-text outline-none placeholder:text-owly-text-light focus:border-owly-primary"
          />
          <select
            value={rangeDays}
            onChange={(event) => setRangeDays(Number(event.target.value))}
            className="rounded-lg border border-owly-border bg-owly-surface px-3 py-2 text-sm text-owly-text outline-none focus:border-owly-primary"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="flex-1 overflow-auto bg-owly-bg p-5">
        {loading ? (
          <div className="rounded-xl border border-owly-border bg-owly-surface p-6 text-sm text-owly-text-light">
            Loading token usage...
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Total Tokens"
                value={formatNumber(totals.totalTokens)}
                change={`${start} to ${end}`}
                icon={Coins}
              />
              <StatCard
                title="Prompt Tokens"
                value={formatNumber(totals.promptTokens)}
                icon={Layers3}
                iconColor="bg-blue-50 text-blue-600"
              />
              <StatCard
                title="Embedding Tokens"
                value={formatNumber(totals.embeddingTokens)}
                icon={Database}
                iconColor="bg-emerald-50 text-emerald-600"
              />
              <StatCard
                title="Estimated Cost"
                value={formatCost(totals.estimatedCostUsd)}
                icon={DollarSign}
                iconColor="bg-amber-50 text-amber-600"
              />
            </div>

            <section className="rounded-xl border border-owly-border bg-owly-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-owly-text">Monthly Budget</h2>
                  <p className="text-sm text-owly-text-light">
                    {monthlyBudget > 0
                      ? `${formatNumber(monthlyUsed)} of ${formatNumber(monthlyBudget)} tokens used this month`
                      : "No monthly token budget is configured in Settings"}
                  </p>
                </div>
                {data?.budget.warning && (
                  <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Budget warning
                  </div>
                )}
              </div>
              <div className="h-3 rounded-full bg-owly-border">
                <div
                  className={cn(
                    "h-3 rounded-full",
                    data?.budget.warning ? "bg-amber-500" : "bg-owly-primary"
                  )}
                  style={{ width: `${budgetPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-owly-text-light">
                Warning threshold: {data?.budget.warningPercent || 80}%
              </p>
            </section>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <LineChart
                title="Daily Token Usage"
                data={(data?.breakdowns.daily || []).map((item) => ({
                  label: item.date.slice(5),
                  value: item.totalTokens,
                }))}
                height={260}
              />
              <BarChart
                title="Usage by Feature"
                data={(data?.breakdowns.byFeature || []).slice(0, 8).map((item) => ({
                  label: formatLabel(item.key),
                  value: item.totalTokens,
                }))}
                height={260}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <BreakdownTable title="By Operation" rows={data?.breakdowns.byOperation || []} />
              <BreakdownTable title="By Model" rows={data?.breakdowns.byModel || []} />
            </div>

            <section className="rounded-xl border border-owly-border bg-owly-surface">
              <div className="flex items-center gap-2 border-b border-owly-border px-5 py-4">
                <Activity className="h-4 w-4 text-owly-primary" />
                <h2 className="text-sm font-semibold text-owly-text">Recent Usage Events</h2>
              </div>
              <div className="divide-y divide-owly-border">
                {(data?.data || []).length === 0 ? (
                  <div className="px-5 py-8 text-sm text-owly-text-light">No token usage found for this filter.</div>
                ) : (
                  (data?.data || []).map((row) => (
                    <div key={row.id} className="grid grid-cols-12 gap-3 px-5 py-3 text-sm">
                      <div className="col-span-4">
                        <div className="font-semibold text-owly-text">{formatLabel(row.feature)}</div>
                        <div className="text-xs text-owly-text-light">{formatLabel(row.operation)}</div>
                      </div>
                      <div className="col-span-2 text-owly-text-light">{row.model}</div>
                      <div className="col-span-2 text-owly-text-light">{row.entityType || "none"}</div>
                      <div className="col-span-2 font-semibold text-owly-text">{row.totalTokens.toLocaleString()}</div>
                      <div className="col-span-1 text-owly-text-light">{formatCost(row.estimatedCostUsd)}</div>
                      <div className="col-span-1 text-right text-xs text-owly-text-light">
                        {formatRelativeTime(row.createdAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: TokenBreakdown[] }) {
  return (
    <section className="rounded-xl border border-owly-border bg-owly-surface">
      <div className="flex items-center gap-2 border-b border-owly-border px-5 py-4">
        <CalendarDays className="h-4 w-4 text-owly-primary" />
        <h2 className="text-sm font-semibold text-owly-text">{title}</h2>
      </div>
      <div className="divide-y divide-owly-border">
        {rows.length === 0 ? (
          <div className="px-5 py-6 text-sm text-owly-text-light">No usage found.</div>
        ) : (
          rows.slice(0, 8).map((row) => (
            <div key={`${title}-${row.key}`} className="grid grid-cols-12 gap-3 px-5 py-3 text-sm">
              <div className="col-span-5 font-semibold capitalize text-owly-text">{formatLabel(row.key)}</div>
              <div className="col-span-3 text-owly-text-light">{row.count.toLocaleString()} events</div>
              <div className="col-span-2 font-semibold text-owly-text">{row.totalTokens.toLocaleString()}</div>
              <div className="col-span-2 text-right text-owly-text-light">{formatCost(row.estimatedCostUsd)}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
