import { runMockSync } from "@/src/lib/integrations/sync-engine";
import type { SyncOptions } from "@/src/lib/integrations/types";

export function runConnectorSync(connectorId: string, options: SyncOptions) {
  return runMockSync(connectorId, options);
}
