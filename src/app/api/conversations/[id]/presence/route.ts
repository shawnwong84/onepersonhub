import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/route-auth";
import {
  getConversationPresence,
  setConversationPresence,
} from "@/lib/conversation-presence";
import { emitTyping } from "@/lib/realtime";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "conversations:read");
  if (!isAuthenticated(auth)) return auth;
  const { id } = await params;

  return NextResponse.json({
    items: getConversationPresence(id).filter((entry) => entry.userId !== auth.userId),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request, "conversations:read");
  if (!isAuthenticated(auth)) return auth;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const state = ["viewing", "typing", "left"].includes(body.state)
    ? body.state as "viewing" | "typing" | "left"
    : "viewing";

  setConversationPresence(id, auth.userId, auth.name || auth.username, state);
  if (state === "typing" || state === "left" || state === "viewing") {
    emitTyping(id, auth.name || auth.username, state === "typing");
  }

  return NextResponse.json({ items: getConversationPresence(id) });
}
