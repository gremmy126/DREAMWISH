export type CustomerStatus = "active" | "lead" | "paused" | "inactive";
export type CustomerImportance = "low" | "medium" | "high" | "critical";
export type CustomerType = "person" | "company" | "partner" | "investor" | "public" | "other";
export type DealStage = "discovery" | "contacted" | "proposal" | "negotiation" | "won" | "lost";

export type Customer = {
  ownerId: string;
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  tags: string[];
  status: CustomerStatus;
  importance: CustomerImportance;
  customerType: CustomerType;
  memo: string;
  expectedValue: number;
  relationshipScore: number;
  lastContactAt: string | null;
  nextContactAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CustomerMemory = {
  ownerId: string;
  customerId: string;
  preferences: string[];
  personality: string;
  interests: string[];
  communicationStyle: string;
  lastEmotion: string;
  relationshipScore: number;
  purchaseHistory: string[];
  meetingHistory: string[];
  goals: string[];
  painPoints: string[];
  budget: string;
  favoriteProducts: string[];
  bestContactTime: string;
  nextAction: string;
  riskScore: number;
  contractProbability: number;
  summary: string;
};

export type Company = {
  ownerId: string;
  id: string;
  name: string;
  domain: string;
  industry: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmActivity = {
  ownerId: string;
  id: string;
  customerId: string;
  type: "note" | "meeting" | "call" | "email_draft" | "task";
  title: string;
  body: string;
  createdAt: string;
};

export type CrmTask = {
  ownerId: string;
  id: string;
  customerId: string;
  title: string;
  dueAt: string | null;
  priority: CustomerImportance;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmDeal = {
  ownerId: string;
  id: string;
  customerId: string;
  title: string;
  stage: DealStage;
  value: number;
  probability: number;
  expectedCloseAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmInsight = {
  ownerId: string;
  customerId: string;
  summary: string;
  nextAction: string;
  riskScore: number;
  contractProbability: number;
  evidence: string[];
  generatedAt: string;
};

export type CrmAuditEvent = {
  ownerId: string;
  id: string;
  action: string;
  entityId: string;
  createdAt: string;
};
