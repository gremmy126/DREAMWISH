import type { ChatSessionRecord } from "./chat.types";

// 과거에는 결정 분석 대화가 "[결정분석]" 제목의 채팅 세션으로 미러링됐다.
// 지금은 결정 분석 기록이 결정에만 저장되므로, 남아 있는 미러 세션은
// 자유 채팅 목록에서 숨긴다.
const DECISION_MIRROR_PREFIX = "[결정분석]";

export function isDecisionMirroredSession(session: Pick<ChatSessionRecord, "title">) {
  return session.title.trimStart().startsWith(DECISION_MIRROR_PREFIX);
}

export function filterFreeChatSessions(sessions: ChatSessionRecord[]) {
  return sessions.filter((session) => !isDecisionMirroredSession(session));
}

export function upsertOptimisticChatSession(
  sessions: ChatSessionRecord[],
  session: ChatSessionRecord
) {
  const withoutExisting = sessions.filter((item) => item.id !== session.id);
  return [session, ...withoutExisting].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
