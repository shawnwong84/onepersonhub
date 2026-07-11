// Conversations can accumulate unbounded message history; capping the
// embedded/list fetch to the most recent N keeps conversation pages from
// growing without limit while full pagination is not yet built (deferred -
// see roadmap 5 phase 6).
export const RECENT_MESSAGES_LIMIT = 200;

export const recentMessagesQuery = {
  orderBy: { createdAt: "desc" as const },
  take: RECENT_MESSAGES_LIMIT,
};

export function toAscending<T>(messages: T[]): T[] {
  return messages.slice().reverse();
}
