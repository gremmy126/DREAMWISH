import { IntegrationCenter } from "./IntegrationCenter";

export function IntegrationsView({ selectedConnectorId }: { selectedConnectorId?: string | null }) {
  return <IntegrationCenter selectedConnectorId={selectedConnectorId} />;
}
