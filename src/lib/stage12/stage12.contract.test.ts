import {
  buildAutomationDraftTemplate,
  triggerExamples
} from "@/src/lib/automation/automation-designer";
import {
  buildExternalConnectionPlan,
  externalConnectionTargets
} from "@/src/lib/connections/external-actions";
import {
  buildCrmActivityDrafts,
  getCrmPipelineSummary
} from "@/src/lib/crm/crm-workspace";
import {
  getAIProviderKeyState,
  getConnectorAuthState,
  getFirebaseConnectionState
} from "@/src/lib/integrations/connection-status";
import {
  KNOWLEDGE_MEMORY_TABS,
  buildKnowledgeTabModel
} from "@/src/lib/knowledge/knowledge-tabs";
import {
  PAYMENT_STATUS_KEY,
  buildPaymentButtonState
} from "@/src/lib/payments/payment-state";
import {
  resolveLanguagePreference,
  resolveThemePreference
} from "@/src/lib/settings/app-preferences";

async function assertStage12Contracts() {
  const crmSummary = getCrmPipelineSummary([
    {
      id: "customer_1",
      companyId: "company_1",
      name: "Ada",
      email: "ada@example.com",
      phone: "",
      position: "CTO",
      tags: ["vip"],
      status: "lead",
      importance: "high",
      createdAt: "2026-07-09T00:00:00.000Z",
      updatedAt: "2026-07-09T00:00:00.000Z"
    }
  ]);
  crmSummary.leads satisfies number;
  crmSummary.nextBestActions[0].customerId satisfies string;

  const crmDrafts = buildCrmActivityDrafts("customer_1", "follow up next week");
  crmDrafts[0].type satisfies "note" | "meeting" | "call" | "email_draft" | "task";

  KNOWLEDGE_MEMORY_TABS[0].id satisfies "network" | "documents" | "tags" | "recommendations";
  const knowledgeTabs = buildKnowledgeTabModel([
    {
      id: "note_1",
      title: "Firebase notes",
      body: "Use Firebase for sync status only.",
      tags: ["firebase", "sync"],
      projectId: null,
      sourceFileId: null,
      createdAt: "2026-07-09T00:00:00.000Z",
      updatedAt: "2026-07-09T00:00:00.000Z"
    }
  ]);
  knowledgeTabs.tags[0].count satisfies number;
  knowledgeTabs.recommendations[0]?.targetType satisfies "document" | "tag" | "app" | "website";

  const automationTemplate = buildAutomationDraftTemplate({
    name: "Renewal follow-up",
    trigger: "When a customer becomes active",
    action: "Create Gmail draft"
  });
  automationTemplate.triggerHelp satisfies string;
  triggerExamples[0].label satisfies string;

  const connectorAuth = await getConnectorAuthState("github");
  connectorAuth.status satisfies "connected" | "not_connected" | "mock_mode";
  const aiState = getAIProviderKeyState();
  aiState.providers[0].connected satisfies boolean;
  const firebase = getFirebaseConnectionState();
  firebase.clientConfigured satisfies boolean;

  const payment = buildPaymentButtonState(true);
  payment.hidden satisfies boolean;
  PAYMENT_STATUS_KEY satisfies string;

  resolveThemePreference("dark").dataTheme satisfies "light" | "dark";
  resolveLanguagePreference("ko").htmlLang satisfies "ko" | "en" | "ja";

  const externalPlan = buildExternalConnectionPlan(externalConnectionTargets[0]);
  externalPlan.createdCapability satisfies string;
}

void assertStage12Contracts;
