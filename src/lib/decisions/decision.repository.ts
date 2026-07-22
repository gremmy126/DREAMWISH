import { randomUUID } from "node:crypto";
import {
  listOwnerStates,
  mutateOwnerState,
  readOwnerState,
  type OwnerStateStore
} from "../db/owner-state-store";
import {
  clampEmployeeSignalWeight,
  type Decision,
  type DecisionProblem,
  type DecisionStatus
} from "./decision.types";

type DecisionState = {
  decisions: Decision[];
};

const DECISION_STORE: OwnerStateStore<DecisionState> = {
  namespace: "decision-state",
  fileName: "decisions.json",
  fallback: () => ({ decisions: [] })
};

const EMPTY_PROBLEM: DecisionProblem = {
  statement: "",
  goals: [],
  constraints: [],
  budget: "",
  deadline: "",
  riskTolerance: "medium",
  successCriteria: [],
  reversible: true
};

export type CreateDecisionInput = {
  title: string;
  objective?: string;
  problem?: Partial<DecisionProblem>;
};

export async function listDecisions(ownerId: string): Promise<Decision[]> {
  const state = await readOwnerState(DECISION_STORE, ownerId);
  return [...state.decisions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDecision(
  ownerId: string,
  decisionId: string
): Promise<Decision | null> {
  const state = await readOwnerState(DECISION_STORE, ownerId);
  return state.decisions.find((decision) => decision.id === decisionId) || null;
}

export async function createDecision(
  ownerId: string,
  input: CreateDecisionInput
): Promise<Decision> {
  const title = input.title?.trim();
  if (!title) throw new Error("title is required");
  const now = new Date().toISOString();
  const decision: Decision = {
    id: randomUUID(),
    title: title.slice(0, 200),
    objective: input.objective?.trim().slice(0, 2000) || "",
    status: "draft",
    problem: { ...EMPTY_PROBLEM, ...sanitizeProblem(input.problem) },
    criteria: [
      { id: "support", label: "지지도", weight: 0.3, direction: "positive" },
      { id: "impact", label: "기대 효과", weight: 0.3, direction: "positive" },
      { id: "feasibility", label: "실행 가능성", weight: 0.25, direction: "positive" },
      { id: "risk", label: "위험", weight: 0.15, direction: "negative" }
    ],
    alternatives: [],
    scenarios: [],
    recommendation: null,
    finalDecision: null,
    executionPlan: [],
    retrospective: null,
    research: null,
    simulationResult: null,
    conversation: [],
    chatSessionId: null,
    employeeSignalWeight: clampEmployeeSignalWeight(undefined),
    createdAt: now,
    updatedAt: now
  };
  await mutateOwnerState(DECISION_STORE, ownerId, (state) => {
    state.decisions.unshift(decision);
    return decision;
  });
  return decision;
}

export async function updateDecision(
  ownerId: string,
  decisionId: string,
  patch: Partial<Decision>
): Promise<Decision | null> {
  return mutateOwnerState(DECISION_STORE, ownerId, (state) => {
    const decision = state.decisions.find((item) => item.id === decisionId);
    if (!decision) return null;

    if (typeof patch.title === "string" && patch.title.trim()) {
      decision.title = patch.title.trim().slice(0, 200);
    }
    if (typeof patch.objective === "string") {
      decision.objective = patch.objective.trim().slice(0, 2000);
    }
    if (patch.status && isDecisionStatus(patch.status)) decision.status = patch.status;
    if (patch.problem) {
      decision.problem = { ...decision.problem, ...sanitizeProblem(patch.problem) };
    }
    if (Array.isArray(patch.criteria)) decision.criteria = patch.criteria;
    if (Array.isArray(patch.alternatives)) decision.alternatives = patch.alternatives;
    if (Array.isArray(patch.scenarios)) decision.scenarios = patch.scenarios;
    if (patch.recommendation !== undefined) decision.recommendation = patch.recommendation;
    if (patch.finalDecision !== undefined) decision.finalDecision = patch.finalDecision;
    if (Array.isArray(patch.executionPlan)) decision.executionPlan = patch.executionPlan;
    if (patch.retrospective !== undefined) decision.retrospective = patch.retrospective;
    if (patch.research !== undefined) decision.research = sanitizeResearch(patch.research);
    if (patch.chatSessionId !== undefined) {
      decision.chatSessionId =
        typeof patch.chatSessionId === "string" && patch.chatSessionId.trim()
          ? patch.chatSessionId.trim().slice(0, 100)
          : null;
    }
    if (patch.simulationResult !== undefined) decision.simulationResult = patch.simulationResult;
    if (Array.isArray(patch.conversation)) {
      decision.conversation = patch.conversation
        .filter(
          (message) =>
            message &&
            (message.role === "ai" || message.role === "user") &&
            typeof message.text === "string"
        )
        .slice(-200);
    }
    if (patch.employeeSignalWeight !== undefined) {
      decision.employeeSignalWeight = clampEmployeeSignalWeight(patch.employeeSignalWeight);
    }
    decision.updatedAt = new Date().toISOString();
    return structuredClone(decision);
  });
}

export async function deleteDecision(
  ownerId: string,
  decisionId: string
): Promise<boolean> {
  return mutateOwnerState(DECISION_STORE, ownerId, (state) => {
    const index = state.decisions.findIndex((item) => item.id === decisionId);
    if (index < 0) return false;
    state.decisions.splice(index, 1);
    return true;
  });
}

export async function listAllDecisionOwners() {
  return listOwnerStates(DECISION_STORE);
}

function sanitizeResearch(research: Decision["research"]): Decision["research"] {
  if (!research) return research;
  const sources = Array.isArray(research.sources)
    ? research.sources
        .filter(
          (source) =>
            source && typeof source.url === "string" && source.url.trim().length > 0
        )
        .slice(0, 40)
        .map((source) => ({
          title: String(source.title || "").slice(0, 300),
          url: String(source.url).slice(0, 1000),
          domain: String(source.domain || "").slice(0, 200)
        }))
    : undefined;
  return { ...research, ...(sources ? { sources } : {}) };
}

function sanitizeProblem(problem: Partial<DecisionProblem> | undefined): Partial<DecisionProblem> {
  if (!problem) return {};
  const output: Partial<DecisionProblem> = {};
  if (typeof problem.statement === "string") output.statement = problem.statement.slice(0, 4000);
  if (Array.isArray(problem.goals)) output.goals = sanitizeStringList(problem.goals);
  if (Array.isArray(problem.constraints)) output.constraints = sanitizeStringList(problem.constraints);
  if (typeof problem.budget === "string") output.budget = problem.budget.slice(0, 300);
  if (typeof problem.deadline === "string") output.deadline = problem.deadline.slice(0, 100);
  if (problem.riskTolerance === "low" || problem.riskTolerance === "medium" || problem.riskTolerance === "high") {
    output.riskTolerance = problem.riskTolerance;
  }
  if (Array.isArray(problem.successCriteria)) {
    output.successCriteria = sanitizeStringList(problem.successCriteria);
  }
  if (typeof problem.reversible === "boolean") output.reversible = problem.reversible;
  return output;
}

function sanitizeStringList(values: unknown[]): string[] {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 30);
}

function isDecisionStatus(value: unknown): value is DecisionStatus {
  return (
    value === "draft" ||
    value === "analyzing" ||
    value === "deciding" ||
    value === "approved" ||
    value === "executing" ||
    value === "reviewed"
  );
}
