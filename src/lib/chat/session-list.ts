import type { ChatSessionRecord } from "./chat.types";

export function upsertOptimisticChatSession(
  sessions: ChatSessionRecord[],
  session: ChatSessionRecord
) {
  const withoutExisting = sessions.filter((item) => item.id !== session.id);
  return [session, ...withoutExisting].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
