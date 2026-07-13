import { runMockSync } from "@/src/lib/integrations/sync-engine";
import type { SyncOptions } from "@/src/lib/integrations/types";

export function runConnectorSync(ownerId: string, connectorId: string, options: SyncOptions) {
  return runMockSync(ownerId, connectorId, options);
}
