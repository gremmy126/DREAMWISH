import { connectorRegistry } from "@/src/lib/integrations/registry";

export async function listConnectorPermissions(connectorId: string) {
  return connectorRegistry.get(connectorId).getPermissions();
}
