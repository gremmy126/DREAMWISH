import type { ActionDefinition, ActionValue } from "../registry/action.types";
import type { ActionAdapter } from "./action-adapter.types";
import { collaborationActionAdapter } from "./collaboration.adapter";
import { dropboxActionAdapter } from "./dropbox.adapter";
import { googleActionAdapter } from "./google.adapter";
import { localToolAdapter } from "./local-tool.adapter";
import { microsoftActionAdapter } from "./microsoft.adapter";
import { publicHttpAdapter } from "./public-http.adapter";
import { triggerActionAdapter } from "./trigger.adapter";

const ACTION_ADAPTERS: readonly ActionAdapter[] = Object.freeze([
  triggerActionAdapter,
  googleActionAdapter,
  collaborationActionAdapter,
  microsoftActionAdapter,
  dropboxActionAdapter,
  publicHttpAdapter,
  localToolAdapter
]);

export function getRegisteredActionAdapter(definition: ActionDefinition) {
  const adapter = ACTION_ADAPTERS.find((candidate) =>
    candidate.supports(definition.adapterKey, definition.adapterVersion)
  );
  if (!adapter) {
    throw Object.assign(new Error(`Action adapter is not implemented: ${definition.adapterKey}@${definition.adapterVersion}`), {
      code: "ADAPTER_NOT_IMPLEMENTED",
      retryable: false
    });
  }
  return adapter;
}

export function executeRegisteredActionAdapter(input: {
  definition: ActionDefinition;
  normalizedInput: Record<string, ActionValue>;
  ownerId: string;
  connectionId: string | null;
  idempotencyKey: string;
}) {
  return getRegisteredActionAdapter(input.definition).execute(input);
}

export function hasRegisteredActionAdapter(definition: ActionDefinition) {
  return ACTION_ADAPTERS.some((adapter) => adapter.supports(definition.adapterKey, definition.adapterVersion));
}
