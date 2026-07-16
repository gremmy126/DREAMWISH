import {
  archiveSession,
  createSession
} from "../db/repositories/chat.repository";
import {
  listResearchJobs,
  mutateResearchJob
} from "./deep-research.repository";
import type { ChatSessionRecord } from "../chat/chat.types";

export async function attachUnlinkedResearchJobsToChatSessions(
  ownerId: string
): Promise<ChatSessionRecord[]> {
  const jobs = (await listResearchJobs(ownerId, { limit: 20 })).filter(
    (job) => !job.chatSessionId
  );
  const attached: ChatSessionRecord[] = [];

  for (const job of jobs) {
    const session = await createSession(ownerId, job.query);
    let linked = false;
    const updated = await mutateResearchJob(ownerId, job.id, (record) => {
      if (record.chatSessionId) return;
      record.chatSessionId = session.id;
      linked = true;
    });

    if (!updated || !linked) {
      await archiveSession(ownerId, session.id);
      continue;
    }
    attached.push(session);
  }

  return attached;
}
