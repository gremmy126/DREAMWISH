import type { ActionDefinition, ActionValue } from "../registry/action.types";

export type ActionAdapterExecutionInput = {
  definition: ActionDefinition;
  normalizedInput: Record<string, ActionValue>;
  ownerId: string;
  connectionId: string | null;
  idempotencyKey: string;
};

export type ActionAdapterExecutionResult = {
  output: Record<string, unknown>;
  apiRequestId?: string | null;
  rateLimitRemaining?: number | null;
  adapterLatencyMs?: number | null;
};

export interface ActionAdapter {
  readonly adapterVersion: number;
  supports(adapterKey: string, adapterVersion: number): boolean;
  execute(input: ActionAdapterExecutionInput): Promise<ActionAdapterExecutionResult>;
}
