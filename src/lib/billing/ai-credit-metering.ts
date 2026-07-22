import { randomUUID } from "node:crypto";
import { getAIModelTier, type AIModelTier, type AIModelTierId } from "../ai/ai-model-catalog";
import type { AICompletion, AIMessage } from "../ai/ai-provider";
import { createAIProvider } from "../ai/ai.service";
import {
  AICreditError,
  reserveTierCredits,
  releaseTierReservation,
  settleTierReservation,
  type TierBalance
} from "./ai-credit-ledger";
import { settleUsageEvent } from "./ai-usage-event.repository";

// The single metered execution boundary for authenticated paid AI calls:
// resolve the selected tier, reserve conservatively, call ONLY that tier's
// exact provider and model (paid calls never fail over), then settle the
// authoritative provider token usage and return the unused reservation. If the
// provider fails before producing billable, metered output, the whole
// reservation is released so nothing is charged.

const DEFAULT_MAX_OUTPUT_TOKENS = 2_048;
const MIN_RESERVATION = 16;

export type AICreditMeteringErrorCode =
  | "AI_TIER_NOT_CONFIGURED"
  | "AI_USAGE_UNAVAILABLE"
  | "AI_PROVIDER_FAILED";

export class AICreditMeteringError extends Error {
  readonly code: AICreditMeteringErrorCode;
  constructor(code: AICreditMeteringErrorCode, message: string) {
    super(message);
    this.name = "AICreditMeteringError";
    this.code = code;
  }
}

/**
 * Conservative input-token estimate from request content. It intentionally errs
 * toward reserving enough: settlement later trues this up to the provider's
 * authoritative usage, and the ledger clamps consumption to the reservation.
 */
export function estimateInputTokens(messages: AIMessage[]): number {
  const chars = messages.reduce((sum, message) => sum + (message.content?.length || 0), 0);
  return Math.ceil(chars / 3) + messages.length * 4;
}

export function estimateReservation(messages: AIMessage[], maxOutputTokens?: number): number {
  const output = maxOutputTokens && maxOutputTokens > 0 ? maxOutputTokens : DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.max(MIN_RESERVATION, estimateInputTokens(messages) + output);
}

type MeteredProvider = {
  name: string;
  model: string;
  chatWithUsage?: (
    messages: AIMessage[],
    options?: { model?: string; maxTokens?: number; timeoutMs?: number; temperature?: number }
  ) => Promise<AICompletion>;
};

export type MeteringDeps = {
  resolveTier?: (tierId: AIModelTierId) => AIModelTier;
  createProvider?: (providerName: AIModelTier["provider"]) => MeteredProvider;
  reserve?: typeof reserveTierCredits;
  settle?: typeof settleTierReservation;
  release?: typeof releaseTierReservation;
  recordUsage?: typeof settleUsageEvent;
  now?: () => Date;
};

export type MeteredCompletionResult = {
  requestId: string;
  content: string;
  tierId: AIModelTierId;
  usage: AICompletion["usage"];
  settledCredits: number;
  balance: TierBalance;
};

export async function runMeteredCompletion(
  input: {
    ownerId: string;
    tierId: AIModelTierId;
    surface: string;
    messages: AIMessage[];
    maxOutputTokens?: number;
    timeoutMs?: number;
    temperature?: number;
  },
  deps: MeteringDeps = {}
): Promise<MeteredCompletionResult> {
  const resolveTier = deps.resolveTier || getAIModelTier;
  const createProvider = deps.createProvider || ((name) => createAIProvider(name) as MeteredProvider);
  const reserve = deps.reserve || reserveTierCredits;
  const settle = deps.settle || settleTierReservation;
  const release = deps.release || releaseTierReservation;
  const recordUsage = deps.recordUsage || settleUsageEvent;

  const tier = resolveTier(input.tierId);
  if (!tier.configured) {
    throw new AICreditMeteringError(
      "AI_TIER_NOT_CONFIGURED",
      `현재 사용할 수 없는 모델 등급입니다. (${input.tierId})`
    );
  }

  const requestId = randomUUID();
  const reservedAmount = estimateReservation(input.messages, input.maxOutputTokens);

  // Insufficient balance throws AI_CREDIT_INSUFFICIENT before any provider call.
  await reserve(input.ownerId, {
    tierId: tier.id,
    amount: reservedAmount,
    correlationId: requestId,
    idempotencyKey: `reserve:${requestId}`,
    actorId: input.ownerId,
    reason: input.surface,
    now: deps.now
  });

  let settled = false;
  try {
    const provider = createProvider(tier.provider);
    if (typeof provider.chatWithUsage !== "function") {
      throw new AICreditMeteringError("AI_USAGE_UNAVAILABLE", "이 공급자는 사용량 계량을 지원하지 않습니다.");
    }
    // Call ONLY this tier's exact provider and model — no cross-provider failover.
    const completion = await provider.chatWithUsage(input.messages, {
      model: tier.modelId,
      maxTokens: input.maxOutputTokens,
      timeoutMs: input.timeoutMs,
      temperature: input.temperature
    });
    const settledCredits = completion.usage.totalTokens;

    const { balance } = await settle(input.ownerId, {
      tierId: tier.id,
      reserved: reservedAmount,
      usage: settledCredits,
      correlationId: requestId,
      idempotencyKey: `settle:${requestId}`,
      actorId: input.ownerId,
      reason: input.surface,
      now: deps.now
    });
    settled = true;

    // Usage audit is best-effort: never fail a settled call over the audit row.
    await recordUsage(input.ownerId, {
      requestId,
      surface: input.surface,
      tierId: tier.id,
      provider: tier.provider,
      modelId: tier.modelId,
      inputTokens: completion.usage.inputTokens,
      outputTokens: completion.usage.outputTokens,
      settledCredits,
      now: deps.now
    }).catch(() => undefined);

    return {
      requestId,
      content: completion.content,
      tierId: tier.id,
      usage: completion.usage,
      settledCredits,
      balance
    };
  } catch (error) {
    if (!settled) {
      await release(input.ownerId, {
        tierId: tier.id,
        amount: reservedAmount,
        correlationId: requestId,
        idempotencyKey: `release:${requestId}`,
        actorId: input.ownerId,
        reason: `${input.surface}:failed`,
        now: deps.now
      }).catch(() => undefined);
    }
    if (error instanceof AICreditError || error instanceof AICreditMeteringError) throw error;
    throw new AICreditMeteringError(
      "AI_PROVIDER_FAILED",
      error instanceof Error ? error.message : "AI 공급자 호출에 실패했습니다."
    );
  }
}
