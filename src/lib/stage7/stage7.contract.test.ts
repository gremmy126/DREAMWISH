import type { AIProviderName } from "@/src/lib/ai/ai-provider";
import { parseProviderName, SUPPORTED_FREE_PROVIDERS } from "@/src/lib/ai/provider-options";
import { createExecutionPreview } from "@/src/lib/agent/approval";
import { planAgentExecution } from "@/src/lib/agent/planner";
import { createWorkflowDraft } from "@/src/lib/automation/workflow.service";
import type { Customer, CustomerMemory } from "@/src/lib/crm/crm.types";
import { listCrmTables } from "@/src/lib/crm/schema";

const selectedProvider: AIProviderName = parseProviderName("groq") || "groq";
const providerList: AIProviderName[] = [...SUPPORTED_FREE_PROVIDERS, selectedProvider];

const customer: Customer = {
  id: "customer_1",
  companyId: "company_1",
  name: "고객 A",
  email: "customer@example.com",
  phone: "010-0000-0000",
  position: "대표",
  tags: ["vip"],
  status: "active",
  importance: "high",
  createdAt: "2026-07-09T00:00:00.000Z",
  updatedAt: "2026-07-09T00:00:00.000Z"
};

const memory: CustomerMemory = {
  customerId: customer.id,
  preferences: ["간결한 보고"],
  personality: "분석적",
  interests: ["AI", "CRM"],
  communicationStyle: "짧고 명확하게",
  lastEmotion: "neutral",
  relationshipScore: 80,
  purchaseHistory: [],
  meetingHistory: [],
  goals: ["업무 자동화"],
  painPoints: ["반복 업무"],
  budget: "미정",
  favoriteProducts: [],
  bestContactTime: "오전",
  nextAction: "다음 미팅 제안",
  riskScore: 15,
  contractProbability: 60,
  summary: "Agentic AI 도입 가능성이 높은 고객"
};

async function stage7Contract() {
  const plan = await planAgentExecution("고객 A에게 다음 주 미팅 잡아줘");
  const preview = createExecutionPreview(plan);
  const workflow = createWorkflowDraft("VIP 고객 후속 연락", "crm.customer.updated");
  const tables = listCrmTables();

  return {
    providerList,
    customer,
    memory,
    plan,
    preview,
    workflow,
    tables
  };
}

void stage7Contract();
