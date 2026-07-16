"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";

export interface ChatCitation {
  type: "record" | "signal" | "ticket";
  id: string;
  moduleSlug: string;
  title: string;
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  metadata: { citations?: ChatCitation[]; refused?: boolean; proactive?: boolean };
  createdAt: string;
}

/** Replace [record:id]/[signal:id]/[ticket:id] markers with readable text. */
function renderContent(content: string) {
  return content.replace(/\[(record|signal|ticket):([a-z0-9-]+)\]/gi, "");
}

export function ReporterChat({ compact = false }: { compact?: boolean }) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/reporter/threads");
      if (!res.ok) return;
      const data = await res.json();
      const latest = data.threads?.[0];
      if (latest) {
        setThreadId(latest.id);
        const messagesRes = await fetch(`/api/reporter/threads/${latest.id}/messages`);
        if (messagesRes.ok) {
          const body = await messagesRes.json();
          setMessages(body.messages || []);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, role: "user", content: message, metadata: {}, createdAt: new Date().toISOString() },
    ]);
    try {
      const res = await fetch("/api/reporter/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, threadId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Chat failed");
      setThreadId(body.threadId);
      setMessages((prev) => [
        ...prev,
        {
          id: `reply-${Date.now()}`,
          role: "reporter",
          content: body.reply,
          metadata: { citations: body.citations, refused: body.refused },
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "reporter",
          content: err instanceof Error ? err.message : "Something went wrong.",
          metadata: {},
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex-1 space-y-3 overflow-y-auto", compact ? "p-3" : "p-5")}>
        {loading ? (
          <p className="text-sm text-owly-text-light">Loading conversation...</p>
        ) : messages.length === 0 ? (
          <div className="rounded-lg bg-owly-bg p-4 text-sm text-owly-text-light">
            <p className="flex items-center gap-2 font-semibold text-owly-text">
              <Bot className="h-4 w-4 text-owly-primary" />
              Reporter Agent
            </p>
            <p className="mt-2">
              Ask me about your modules - open orders, low stock, overdue invoices, pending approvals.
              I only answer from the modules you have access to.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm",
                  message.role === "user"
                    ? "bg-owly-primary text-white"
                    : message.metadata?.proactive
                    ? "border border-purple-200 bg-purple-50 text-owly-text"
                    : "bg-owly-bg text-owly-text"
                )}
              >
                {message.metadata?.proactive && (
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-purple-600">Heartbeat report</p>
                )}
                <p className="whitespace-pre-wrap">{renderContent(message.content)}</p>
                {message.metadata?.citations && message.metadata.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {message.metadata.citations.map((citation) => (
                      <Link
                        key={citation.id}
                        href={
                          citation.type === "record"
                            ? `/modules/${citation.moduleSlug}/records/${citation.id}`
                            : citation.type === "ticket"
                              ? "/tickets"
                              : `/modules/${citation.moduleSlug}`
                        }
                        className="rounded-md bg-owly-surface px-2 py-0.5 text-xs font-medium text-owly-primary hover:underline"
                      >
                        {citation.title}
                      </Link>
                    ))}
                  </div>
                )}
                <p className={cn("mt-1 text-[10px]", message.role === "user" ? "text-white/60" : "text-owly-text-light")}>
                  {formatRelativeTime(message.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-owly-bg px-3.5 py-2.5 text-sm text-owly-text-light">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className={cn("border-t border-owly-border", compact ? "p-2" : "p-4")}>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            rows={compact ? 1 : 2}
            placeholder="Ask the Reporter Agent..."
            className="flex-1 resize-none rounded-lg border border-owly-border bg-owly-bg px-3 py-2 text-sm text-owly-text outline-none focus:border-owly-primary"
          />
          <button
            type="button"
            disabled={sending || !input.trim()}
            onClick={send}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-owly-primary text-white disabled:opacity-50"
            title="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
