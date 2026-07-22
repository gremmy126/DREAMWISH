import type { AIModelTierId } from "../ai/ai-model-catalog";
import type { AIProviderName } from "../ai/ai-provider";
import { mutateOwnerDocument, readOwnerDocument } from "../db/owner-document-store";

// Auditable model usage per owner and tier. Records never store prompt text,
// generated content, API keys, or payment credentials — only token counts and
// the tier/provider/model that produced them. Settlement is idempotent by
// request id so a retried settle cannot double-count usage.

export const AI_USAGE_EVENT_NAMESPACE = "ai.usage.events.v1";
const RECENT_EVENT_CAP = 100;

export type AIUsageEventStatus = "reserved" | "settled" | "released" | "reconciliation_required";

export type AIUsageEvent = {
  requestId: string;
  surface: string;
  tierId: AIModelTierId;
  provider: AIProviderName | null;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reservedCredits: number;
  settledCredits: number;
  status: AIUsageEventStatus;
  createdAt: string;
  settledAt: string | null;
};

export type AIUsageAggregate = {
  tierId: AIModelTierId;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  settledCredits: number;
  lastUsedAt: string | null;
};

export type AIUsageDocument = {
  aggregates: Partial<Record<AIModelTierId, AIUsageAggregate>>;
  recentEvents: AIUsageEvent[];
  settledRequestIds: string[];
};

export function emptyUsageDocument(): AIUsageDocument {
  return { aggregates: {}, recentEvents: [], settledRequestIds: [] };
}

function emptyAggregate(tierId: AIModelTierId): AIUsageAggregate {
  return { tierId, calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, settledCredits: 0, lastUsedAt: null };
}

/**
 * Applies an authoritative settlement to the usage document exactly once. A
 * repeated request id is a no-op so duplicate settlement (retry, reconnect)
 * cannot inflate the per-tier aggregate.
 */
export function applyUsageSettlement(
  doc: AIUsageDocument,
  settlement: {
    requestId: string;
    surface: string;
    tierId: AIModelTierId;
    provider: AIProviderName | null;
    modelId: string | null;
    inputTokens: number;
    outputTokens: number;
    settledCredits: number;
    now: string;
  }
): { doc: AIUsageDocument; duplicate: boolean } {
  if (doc.settledRequestIds.includes(settlement.requestId)) {
    return { doc, duplicate: true };
  }
  const totalTokens = settlement.inputTokens + settlement.outputTokens;
  const previous = doc.aggregates[settlement.tierId] || emptyAggregate(settlement.tierId);
  const aggregate: AIUsageAggregate = {
    tierId: settlement.tierId,
    calls: previous.calls + 1,
    inputTokens: previous.inputTokens + settlement.inputTokens,
    outputTokens: previous.outputTokens + settlement.outputTokens,
    totalTokens: previous.totalTokens + totalTokens,
    settledCredits: previous.settledCredits + settlement.settledCredits,
    lastUsedAt: settlement.now
  };
  const event: AIUsageEvent = {
    requestId: settlement.requestId,
    surface: settlement.surface,
    tierId: settlement.tierId,
    provider: settlement.provider,
    modelId: settlement.modelId,
    inputTokens: settlement.inputTokens,
    outputTokens: settlement.outputTokens,
    totalTokens,
    reservedCredits: 0,
    settledCredits: settlement.settledCredits,
    status: "settled",
    createdAt: settlement.now,
    settledAt: settlement.now
  };
  return {
    doc: {
      aggregates: { ...doc.aggregates, [settlement.tierId]: aggregate },
      recentEvents: [event, ...doc.recentEvents].slice(0, RECENT_EVENT_CAP),
      settledRequestIds: [...doc.settledRequestIds, settlement.requestId].slice(-5_000)
    },
    duplicate: false
  };
}

function normalize(doc: AIUsageDocument | Partial<AIUsageDocument> | null): AIUsageDocument {
  if (!doc || typeof doc !== "object") return emptyUsageDocument();
  return {
    aggregates: doc.aggregates || {},
    recentEvents: Array.isArray(doc.recentEvents) ? doc.recentEvents : [],
    settledRequestIds: Array.isArray(doc.settledRequestIds) ? doc.settledRequestIds : []
  };
}

export function settleUsageEvent(
  ownerId: string,
  settlement: {
    requestId: string;
    surface: string;
    tierId: AIModelTierId;
    provider: AIProviderName | null;
    modelId: string | null;
    inputTokens: number;
    outputTokens: number;
    settledCredits: number;
    now?: () => Date;
  }
): Promise<{ duplicate: boolean }> {
  const now = (settlement.now?.() || new Date()).toISOString();
  return mutateOwnerDocument<AIUsageDocument, { duplicate: boolean }>(
    ownerId,
    AI_USAGE_EVENT_NAMESPACE,
    emptyUsageDocument(),
    (doc) => {
      const result = applyUsageSettlement(normalize(doc), { ...settlement, now });
      Object.assign(doc, result.doc);
      return { duplicate: result.duplicate };
    }
  );
}

export async function getUsageAggregates(ownerId: string): Promise<AIUsageAggregate[]> {
  const doc = normalize(
    await readOwnerDocument<AIUsageDocument>(ownerId, AI_USAGE_EVENT_NAMESPACE, emptyUsageDocument())
  );
  return Object.values(doc.aggregates).filter((aggregate): aggregate is AIUsageAggregate => Boolean(aggregate));
}

export async function getRecentUsageEvents(ownerId: string, limit = 20): Promise<AIUsageEvent[]> {
  const doc = normalize(
    await readOwnerDocument<AIUsageDocument>(ownerId, AI_USAGE_EVENT_NAMESPACE, emptyUsageDocument())
  );
  return doc.recentEvents.slice(0, Math.max(0, limit));
}
