import {
  mutateOwnerState,
  readOwnerState,
  type OwnerStateStore
} from "../db/owner-state-store";
import { getBusinessPlan } from "../business/business-plan.repository";
import { createMemoryCandidate } from "../memory/memory-engine";

// Organization settings that took over the reusable company information from
// the retired Business page (docs/stage-1-audit.md §2). The remaining
// business-plan records (goals, risks, priorities) migrate into Memory as
// reviewable candidates so nothing is deleted without approval.

export type OrganizationProfile = {
  companyName: string;
  logoUrl: string;
  industry: string;
  size: string;
  introduction: string;
  businessModel: string;
  coreCustomers: string;
  updatedAt: string | null;
};

type OrganizationState = {
  profile: OrganizationProfile;
  businessPlanMigratedAt: string | null;
};

const EMPTY_PROFILE: OrganizationProfile = {
  companyName: "",
  logoUrl: "",
  industry: "",
  size: "",
  introduction: "",
  businessModel: "",
  coreCustomers: "",
  updatedAt: null
};

const ORGANIZATION_STORE: OwnerStateStore<OrganizationState> = {
  namespace: "organization-profile",
  fileName: "organization-profile.json",
  fallback: () => ({ profile: { ...EMPTY_PROFILE }, businessPlanMigratedAt: null })
};

export async function getOrganizationProfile(ownerId: string): Promise<OrganizationState> {
  return readOwnerState(ORGANIZATION_STORE, ownerId);
}

export async function updateOrganizationProfile(
  ownerId: string,
  patch: Partial<OrganizationProfile>
): Promise<OrganizationProfile> {
  return mutateOwnerState(ORGANIZATION_STORE, ownerId, (state) => {
    const fields: Array<keyof Omit<OrganizationProfile, "updatedAt">> = [
      "companyName",
      "logoUrl",
      "industry",
      "size",
      "introduction",
      "businessModel",
      "coreCustomers"
    ];
    for (const field of fields) {
      const value = patch[field];
      if (typeof value === "string") state.profile[field] = value.trim().slice(0, 2000);
    }
    state.profile.updatedAt = new Date().toISOString();
    return structuredClone(state.profile);
  });
}

// Imports the retired Business page's plan data into Memory as pending
// candidates: goals -> 전략 목표, risks -> 의사결정 원칙(위험 성향),
// priorities -> 의사결정 원칙(우선순위). Original records stay untouched.
export async function migrateBusinessPlanToMemory(ownerId: string): Promise<{
  migrated: number;
  alreadyMigratedAt: string | null;
}> {
  const state = await getOrganizationProfile(ownerId);
  if (state.businessPlanMigratedAt) {
    return { migrated: 0, alreadyMigratedAt: state.businessPlanMigratedAt };
  }

  const plan = await getBusinessPlan(ownerId);
  let migrated = 0;

  for (const goal of plan.goals) {
    await createMemoryCandidate({
      ownerId,
      source: "manual",
      category: "Business",
      title: `전략 목표: ${goal.title}`,
      content:
        `전략 목표: ${goal.title}\n` +
        `상태: ${goal.status}, 진행률: ${goal.progress}%` +
        (goal.targetDate ? `, 목표일: ${goal.targetDate}` : ""),
      tags: ["전략 목표", "비즈니스 이전"]
    });
    migrated += 1;
  }
  for (const risk of plan.risks) {
    await createMemoryCandidate({
      ownerId,
      source: "manual",
      category: "Business",
      title: `의사결정 원칙(위험): ${risk.title}`,
      content:
        `위험 요인: ${risk.title}\n위험 수준: ${risk.level}` +
        (risk.mitigation ? `\n대응 방안: ${risk.mitigation}` : ""),
      tags: ["의사결정 원칙", "위험 성향", "비즈니스 이전"]
    });
    migrated += 1;
  }
  for (const priority of plan.priorities) {
    await createMemoryCandidate({
      ownerId,
      source: "manual",
      category: "Business",
      title: `의사결정 원칙(우선순위): ${priority.title}`,
      content: `우선순위 ${priority.order + 1}: ${priority.title}`,
      tags: ["의사결정 원칙", "우선순위", "비즈니스 이전"]
    });
    migrated += 1;
  }

  await mutateOwnerState(ORGANIZATION_STORE, ownerId, (state) => {
    state.businessPlanMigratedAt = new Date().toISOString();
  });

  return { migrated, alreadyMigratedAt: null };
}
