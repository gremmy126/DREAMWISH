import { NextResponse } from "next/server";
import {
  getAIProviderKeyState,
  getAllConnectorAuthStates,
  getFirebaseConnectionState
} from "@/src/lib/integrations/connection-status";
import { listIntegrationSyncSettings } from "@/src/lib/integrations/integration-settings.repository";
import { connectorRegistry } from "@/src/lib/integrations/registry";

export async function GET() {
  const connectors = connectorRegistry.list();
  const [settings, authStates] = await Promise.all([
    listIntegrationSyncSettings(),
    getAllConnectorAuthStates([...connectors.map((connector) => connector.id), "firebase"])
  ]);

  const items = await Promise.all(
    connectors.map(async (connector) => {
      const base = await connector.getStatus();
      const auth = authStates[connector.id];
      const setting = settings.find((item) => item.connectorId === connector.id);

      return {
        connectorId: connector.id,
        integration: {
          ...base,
          status: auth?.status || base.status,
          isMock: auth?.status === "mock_mode" ? true : base.isMock && !auth?.configured,
          connectedAccount: auth?.accountLabel || base.connectedAccount,
          syncEnabled: setting?.enabled ?? (auth?.status === "connected" || base.syncEnabled),
          lastSyncedAt: base.lastSyncedAt
        },
        auth
      };
    })
  );

  return NextResponse.json({
    items,
    firebase: getFirebaseConnectionState(),
    ai: getAIProviderKeyState()
  });
}
