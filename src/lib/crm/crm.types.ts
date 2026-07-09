export type CustomerStatus = "active" | "lead" | "paused" | "inactive";
export type CustomerImportance = "low" | "medium" | "high" | "critical";

export type Customer = {
  id: string;
  companyId: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  tags: string[];
  status: CustomerStatus;
  importance: CustomerImportance;
  createdAt: string;
  updatedAt: string;
};

export type CustomerMemory = {
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
  id: string;
  name: string;
  domain: string;
  industry: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmActivity = {
  id: string;
  customerId: string;
  type: "note" | "meeting" | "call" | "email_draft" | "task";
  title: string;
  body: string;
  createdAt: string;
};
