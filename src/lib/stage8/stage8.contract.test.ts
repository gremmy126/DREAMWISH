import { planConnectorAction } from "@/src/lib/agent/connector-planner";
import { getPaymentProviderForMarket } from "@/src/lib/payments/payment-routing";
import { listPaymentProviders } from "@/src/lib/payments/payment.types";
import { createApprovalPreviewForConnector } from "@/src/lib/integrations/permission";
import { connectorRegistry } from "@/src/lib/integrations/registry";
import { runMockSync } from "@/src/lib/integrations/sync-engine";
import type {
  Connector,
  ConnectorAction,
  ConnectorPermission,
  Integration,
  SyncOptions
} from "@/src/lib/integrations/types";
import { encryptTokenField } from "@/src/lib/security/encryption";
import { normalizeExternalMessage } from "@/src/lib/sync/normalizer";

async function stage8Contract() {
  const connectors: Connector[] = connectorRegistry.list();
  const gmail = connectorRegistry.get("gmail");
  const permissions: ConnectorPermission[] = await gmail.getPermissions();
  const action: ConnectorAction = {
    type: "draft_email",
    connectorId: "gmail",
    goal: "Gmail 초안 작성 계획만 만들기",
    requiredPermissionKeys: ["gmail.draft.create"],
    payload: { subject: "후속 연락", body: "승인 전 미리보기" }
  };
  const syncOptions: SyncOptions = { type: "mock", limit: 3 };
  const integration: Integration = await gmail.getStatus();

  return {
    connectors,
    permissions,
    integration,
    plan: await planConnectorAction("Gmail 초안 작성 계획만 만들어줘"),
    preview: createApprovalPreviewForConnector(action, permissions),
    sync: await runMockSync("gmail", syncOptions),
    encrypted: encryptTokenField("token-value").encryptedValue,
    normalized: normalizeExternalMessage({
      integrationId: "gmail",
      externalId: "msg_1",
      source: "gmail",
      sender: "customer@example.com",
      subject: "문의",
      bodyText: "고객 문의 본문"
    }),
    paymentProviders: listPaymentProviders(),
    internationalPayment: getPaymentProviderForMarket("international"),
    domesticPayment: getPaymentProviderForMarket("domestic")
  };
}

void stage8Contract();
