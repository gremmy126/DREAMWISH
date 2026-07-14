import { listAutomations } from "../automation/automation.repository";
import { listCredentials } from "../automation/credential.repository";
import { listScenarios } from "../automation/scenario.repository";
import { listBusinessCards } from "../business/business-card.repository";
import { listBusinessConversations } from "../business/business-message.service";
import { listMeetings } from "../business/meeting.repository";
import { listRevenueCandidates } from "../business/revenue.repository";
import {
  listCrmActivities,
  listCrmAuditEvents,
  listCrmDeals,
  listCrmInsights,
  listCrmTasks,
  listCustomers
} from "../crm/crm.repository";
import { getSession, listSessions } from "../db/repositories/chat.repository";
import { listFileRecords } from "../files/file.repository";
import { listKnowledgeNotes } from "../knowledge/knowledge.repository";
import { readMemoryDb } from "../memory/memory-repository";
import { getStorageCapacity } from "./account-storage-quota";

export { ACCOUNT_STORAGE_QUOTA_BYTES } from "./account-storage-quota";

export type AccountStorageUsage = {
  usageBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  percentUsed: number;
  breakdown: {
    files: number;
    memories: number;
    knowledge: number;
    chat: number;
    business: number;
    automation: number;
  };
  measuredAt: string;
};

export async function calculateAccountStorageUsage(
  ownerId: string
): Promise<AccountStorageUsage> {
  const [
    files,
    memoryDb,
    knowledge,
    sessions,
    gmail,
    slack,
    businessCards,
    meetings,
    revenue,
    customers,
    activities,
    tasks,
    deals,
    insights,
    audit,
    automations,
    scenarios,
    credentials
  ] = await Promise.all([
    listFileRecords(ownerId),
    readMemoryDb(ownerId),
    listKnowledgeNotes(ownerId),
    listSessions(ownerId),
    listBusinessConversations(ownerId, "gmail"),
    listBusinessConversations(ownerId, "slack"),
    listBusinessCards(ownerId),
    listMeetings(ownerId),
    listRevenueCandidates(ownerId),
    listCustomers(ownerId, { includeDeleted: true }),
    listCrmActivities(ownerId),
    listCrmTasks(ownerId),
    listCrmDeals(ownerId),
    listCrmInsights(ownerId),
    listCrmAuditEvents(ownerId),
    listAutomations(ownerId),
    listScenarios(ownerId),
    listCredentials(ownerId)
  ]);
  const chatSessions = await Promise.all(
    sessions.map((session) => getSession(ownerId, session.id))
  );
  const memories = [
    ...memoryDb.candidates,
    ...memoryDb.memories,
    ...memoryDb.embeddings,
    ...memoryDb.changes,
    ...memoryDb.captureJobs
  ].filter((record) => record.ownerId === ownerId);
  const breakdown = {
    files: files.reduce((total, file) => total + Math.max(0, file.size), 0),
    memories: recordsBytes(memories),
    knowledge: recordsBytes(knowledge),
    chat: recordsBytes(chatSessions.filter(Boolean)),
    business: recordsBytes([
      ...gmail,
      ...slack,
      ...businessCards,
      ...meetings,
      ...revenue,
      ...customers,
      ...activities,
      ...tasks,
      ...deals,
      ...insights,
      ...audit
    ]),
    automation: recordsBytes([...automations, ...scenarios, ...credentials])
  };

  const usageBytes = Object.values(breakdown).reduce(
    (sum, value) => sum + value,
    0
  );

  return {
    usageBytes,
    ...getStorageCapacity(usageBytes),
    breakdown,
    measuredAt: new Date().toISOString()
  };
}

export function calculateAccountQuotaMetrics(usageBytes: number) {
  return getStorageCapacity(usageBytes);
}

export function recordsBytes(records: readonly unknown[]): number {
  return records.reduce<number>(
    (total, record) => total + Buffer.byteLength(JSON.stringify(record), "utf8"),
    0
  );
}
