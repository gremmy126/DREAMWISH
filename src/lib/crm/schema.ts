export type CrmTableDefinition = {
  name: string;
  description: string;
  columns: string[];
};

export const crmTables: CrmTableDefinition[] = [
  {
    name: "customers",
    description: "고객 기본 정보",
    columns: [
      "id",
      "companyId",
      "name",
      "email",
      "phone",
      "position",
      "tags",
      "status",
      "importance",
      "createdAt",
      "updatedAt"
    ]
  },
  {
    name: "companies",
    description: "회사/조직 정보",
    columns: ["id", "name", "domain", "industry", "createdAt", "updatedAt"]
  },
  {
    name: "contacts",
    description: "연락처와 커뮤니케이션 채널",
    columns: ["id", "customerId", "channel", "value", "isPrimary", "createdAt"]
  },
  {
    name: "leads",
    description: "잠재 고객",
    columns: ["id", "name", "source", "status", "score", "createdAt", "updatedAt"]
  },
  {
    name: "opportunities",
    description: "영업 기회",
    columns: ["id", "customerId", "title", "stage", "amount", "probability", "updatedAt"]
  },
  {
    name: "deals",
    description: "거래",
    columns: ["id", "opportunityId", "status", "amount", "closedAt"]
  },
  {
    name: "contracts",
    description: "계약",
    columns: ["id", "customerId", "dealId", "status", "startsAt", "endsAt"]
  },
  {
    name: "activities",
    description: "고객 활동 타임라인",
    columns: ["id", "customerId", "type", "title", "body", "createdAt"]
  },
  {
    name: "customer_memory",
    description: "AI 고객 이해와 다음 행동",
    columns: [
      "customerId",
      "preferences",
      "personality",
      "interests",
      "communicationStyle",
      "relationshipScore",
      "nextAction",
      "riskScore",
      "contractProbability",
      "summary"
    ]
  }
];

export function listCrmTables() {
  return crmTables;
}
