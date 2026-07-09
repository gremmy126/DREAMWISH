import type { ConnectorSyncResult } from "@/src/lib/integrations/types";

export function formatSyncHistory(result: ConnectorSyncResult) {
  return `${result.connectorId}: ${result.status} · ${result.normalizedCount} normalized`;
}
