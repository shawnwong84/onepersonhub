"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, X } from "lucide-react";
import { ReporterChat } from "./reporter-chat";

export function ReporterChatWidget() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // The dedicated page has the full experience; hide the bubble there.
  if (pathname.startsWith("/reporter")) return null;

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[520px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-owly-border bg-owly-surface shadow-2xl max-sm:inset-0 max-sm:bottom-0 max-sm:right-0 max-sm:h-full max-sm:w-full max-sm:rounded-none">
          <div className="flex items-center justify-between border-b border-owly-border bg-owly-primary px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold">Reporter Agent</p>
                <p className="text-xs text-white/70">Ask about your modules</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 hover:bg-white/10"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ReporterChat compact />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-16 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-owly-primary text-white shadow-lg transition-transform hover:scale-105 lg:bottom-4"
        title="Reporter Agent"
      >
        <Bot className="h-6 w-6" />
      </button>
    </>
  );
}
