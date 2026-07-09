import type { RiskLevel } from "@/src/lib/integrations/types";

export type PermissionPolicy = {
  defaultRiskLimit: RiskLevel;
  requireApprovalFrom: RiskLevel;
  mockMode: boolean;
  autoSync: boolean;
};

export const defaultPermissionPolicy: PermissionPolicy = {
  defaultRiskLimit: "medium",
  requireApprovalFrom: "high",
  mockMode: true,
  autoSync: false
};
