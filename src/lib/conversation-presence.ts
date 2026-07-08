interface PresenceEntry {
  userId: string;
  userName: string;
  state: "viewing" | "typing";
  updatedAt: number;
}

const presenceByConversation = new Map<string, Map<string, PresenceEntry>>();
const PRESENCE_TTL_MS = 30_000;

function prune(conversationId: string) {
  const entries = presenceByConversation.get(conversationId);
  if (!entries) return;
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  for (const [userId, entry] of entries.entries()) {
    if (entry.updatedAt < cutoff) entries.delete(userId);
  }
  if (entries.size === 0) presenceByConversation.delete(conversationId);
}

export function setConversationPresence(
  conversationId: string,
  userId: string,
  userName: string,
  state: "viewing" | "typing" | "left"
) {
  if (!presenceByConversation.has(conversationId)) {
    presenceByConversation.set(conversationId, new Map());
  }
  const entries = presenceByConversation.get(conversationId)!;
  if (state === "left") {
    entries.delete(userId);
  } else {
    entries.set(userId, {
      userId,
      userName,
      state,
      updatedAt: Date.now(),
    });
  }
  prune(conversationId);
}

export function getConversationPresence(conversationId: string) {
  prune(conversationId);
  return Array.from(presenceByConversation.get(conversationId)?.values() || []);
}
