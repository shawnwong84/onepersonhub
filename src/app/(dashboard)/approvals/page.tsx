"use client";

import { Header } from "@/components/layout/header";
import {
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRelativeTime, getChannelLabel } from "@/lib/utils";

interface ApprovalItem {
  id: string;
  conversationId: string;
  customerName: string;
  customerContact: string;
  channel: string;
  conversationStatus: string;
  messageCount: number;
  flowName: string;
  title: string;
  instructions: string;
  requestedAt: string;
  ageMinutes: number;
  staleAfterMinutes: number;
  isStale: boolean;
  proposedAction?: {
    type?: string;
    label?: string;
    payload?: string;
  } | null;
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/workflow-approvals");
      if (!res.ok) return;
      const data = await res.json();
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setItems(nextItems);
      setEdits((current) => {
        const next = { ...current };
        for (const item of nextItems) {
          if (next[item.id] === undefined) {
            next[item.id] = item.proposedAction?.payload || "";
          }
        }
        return next;
      });
      setComments((current) => {
        const next = { ...current };
        for (const item of nextItems) {
          if (next[item.id] === undefined) {
            next[item.id] = "";
          }
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();

    const events = new EventSource("/api/realtime?channel=global");
    events.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        if (
          event.type === "notification" ||
          event.type === "conversation:updated" ||
          event.type === "message:new"
        ) {
          fetchApprovals();
        }
      } catch {
        // Ignore heartbeat and malformed events.
      }
    };

    return () => events.close();
  }, [fetchApprovals]);

  const resolveApproval = async (
    item: ApprovalItem,
    decision: "approve" | "skip" | "reject"
  ) => {
    if (busyId) return;
    setBusyId(item.id);
    const previous = items;
    setItems((current) => current.filter((approval) => approval.id !== item.id));

    try {
      const res = await fetch(
        `/api/conversations/${item.conversationId}/workflow-approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            payload: decision === "approve" ? edits[item.id] : undefined,
            comment: comments[item.id]?.trim() || undefined,
          }),
        }
      );

      if (!res.ok) {
        setItems(previous);
      } else {
        fetchApprovals();
      }
    } catch (error) {
      console.error("Failed to resolve workflow approval:", error);
      setItems(previous);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Header
        title="Approvals"
        description="Review workflow actions waiting for customer service approval"
      />

      <main className="flex-1 overflow-y-auto bg-owly-bg p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Pending approvals" value={String(items.length)} />
            <Metric
              label="Stale approvals"
              value={String(items.filter((item) => item.isStale).length)}
            />
            <Metric
              label="Reply approvals"
              value={String(
                items.filter((item) => item.proposedAction?.type === "reply_customer")
                  .length
              )}
            />
            <Metric
              label="Channels"
              value={String(new Set(items.map((item) => item.channel)).size)}
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-owly-border bg-owly-surface p-5 text-sm text-owly-text-light">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading approvals
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-owly-border bg-owly-surface p-10 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-owly-text-light" />
              <h3 className="mt-4 text-lg font-semibold text-owly-text">
                No approvals waiting
              </h3>
              <p className="mt-2 text-sm text-owly-text-light">
                Workflow approvals will appear here when automation pauses for a decision.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <section
                  key={item.id}
                  className={
                    item.isStale
                      ? "rounded-lg border border-amber-300 bg-amber-50 p-4"
                      : "rounded-lg border border-owly-border bg-owly-surface p-4"
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                          {item.flowName}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-owly-text-light">
                          <Clock className="h-3.5 w-3.5" />
                          {formatRelativeTime(item.requestedAt)}
                        </span>
                        {item.isStale && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            Stale: {item.ageMinutes}m waiting
                          </span>
                        )}
                      </div>
                      <h2 className="mt-2 text-base font-semibold text-owly-text">
                        {item.title}
                      </h2>
                      {item.instructions && (
                        <p className="mt-1 text-sm text-owly-text-light">
                          {item.instructions}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() =>
                        router.push(`/conversations?conversationId=${item.conversationId}`)
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-owly-border px-3 py-2 text-sm font-semibold text-owly-text hover:bg-owly-primary-50"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Open conversation
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
                    <div className="rounded-lg border border-owly-border bg-owly-bg p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                        Customer
                      </div>
                      <div className="mt-2 text-sm font-semibold text-owly-text">
                        {item.customerName}
                      </div>
                      <div className="mt-1 text-xs text-owly-text-light">
                        {getChannelLabel(item.channel)} · {item.customerContact}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-owly-primary-50 px-2 py-0.5 text-xs font-semibold text-owly-primary">
                          {item.conversationStatus}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {item.messageCount} messages
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-owly-border bg-owly-bg p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                        Proposed next step
                      </div>
                      <div className="mt-2 text-sm font-semibold text-owly-text">
                        {item.proposedAction?.label || "Workflow action"}
                      </div>
                      {item.proposedAction?.type === "reply_customer" ? (
                        <textarea
                          value={edits[item.id] || ""}
                          onChange={(event) =>
                            setEdits((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          rows={4}
                          className="mt-2 w-full resize-none rounded-lg border border-owly-border bg-owly-surface px-3 py-2 text-sm text-owly-text outline-none focus:border-owly-primary focus:ring-2 focus:ring-owly-primary/20"
                        />
                      ) : (
                        <p className="mt-2 text-sm text-owly-text-light">
                          {item.proposedAction?.payload || "No payload"}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-owly-border bg-owly-bg p-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-owly-text-light">
                      Decision note
                    </label>
                    <textarea
                      value={comments[item.id] || ""}
                      onChange={(event) =>
                        setComments((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                      rows={2}
                      placeholder="Optional reason or context for approve, skip, or reject"
                      className="mt-2 w-full resize-none rounded-lg border border-owly-border bg-owly-surface px-3 py-2 text-sm text-owly-text outline-none focus:border-owly-primary focus:ring-2 focus:ring-owly-primary/20"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => resolveApproval(item, "approve")}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => resolveApproval(item, "skip")}
                      disabled={busyId === item.id}
                      className="rounded-lg border border-owly-border px-3 py-2 text-sm font-semibold text-owly-text hover:bg-owly-primary-50 disabled:opacity-60"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => resolveApproval(item, "reject")}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-owly-border bg-owly-surface p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-owly-text-light">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-owly-text">{value}</div>
    </div>
  );
}
