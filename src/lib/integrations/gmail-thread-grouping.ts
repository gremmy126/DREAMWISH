import type { GmailThreadRecord } from "../repositories/gmail-thread.repository";

export type GmailThreadMessage = {
  id: string;
  threadId: string;
  subject: string;
  receivedAt: string;
};

export function groupGmailThreads(
  messages: readonly GmailThreadMessage[]
): GmailThreadRecord[] {
  const groups = new Map<string, GmailThreadMessage[]>();
  for (const message of messages) {
    const group = groups.get(message.threadId) || [];
    group.push(message);
    groups.set(message.threadId, group);
  }

  return [...groups.entries()]
    .map(([threadId, group]) => {
      const ordered = [...group].sort((a, b) =>
        a.receivedAt.localeCompare(b.receivedAt)
      );
      const latest = ordered.at(-1)!;
      return {
        id: `gmail_thread_${threadId}`,
        threadId,
        messageIds: ordered.map((message) => message.id),
        subject: latest.subject || "(제목 없음)",
        updatedAt: latest.receivedAt
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
