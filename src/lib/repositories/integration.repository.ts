import { connectorRegistry } from "@/src/lib/integrations/registry";

export async function listIntegrations() {
  return Promise.all(connectorRegistry.list().map((connector) => connector.getStatus()));
}
