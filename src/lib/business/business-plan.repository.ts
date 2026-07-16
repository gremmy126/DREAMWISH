import { randomUUID } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

export type BusinessGoal = {
  ownerId: string;
  id: string;
  title: string;
  targetDate: string | null;
  progress: number;
  status: "active" | "completed" | "on_hold";
  createdAt: string;
  updatedAt: string;
};

export type BusinessRisk = {
  ownerId: string;
  id: string;
  title: string;
  level: "low" | "medium" | "high";
  mitigation: string;
  createdAt: string;
  updatedAt: string;
};

export type BusinessPriority = {
  ownerId: string;
  id: string;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

type PlanDb = {
  goals: BusinessGoal[];
  risks: BusinessRisk[];
  priorities: BusinessPriority[];
};

const FILE_NAME = "business-plan.json";
const EMPTY_DB: PlanDb = { goals: [], risks: [], priorities: [] };

export async function getBusinessPlan(ownerId: string) {
  return accessDb((db) => ({
    goals: db.goals.filter((item) => item.ownerId === ownerId),
    risks: db.risks.filter((item) => item.ownerId === ownerId),
    priorities: db.priorities
      .filter((item) => item.ownerId === ownerId)
      .sort((a, b) => a.order - b.order)
  }));
}

export async function createBusinessPlanItem(
  ownerId: string,
  kind: "goal" | "risk" | "priority",
  input: { title: string; targetDate?: string | null; level?: string; mitigation?: string }
) {
  const title = input.title?.trim();
  if (!title) throw new Error("title is required");
  return accessDb((db) => {
    const now = new Date().toISOString();
    if (kind === "goal") {
      const goal: BusinessGoal = {
        ownerId,
        id: randomUUID(),
        title: title.slice(0, 200),
        targetDate: input.targetDate || null,
        progress: 0,
        status: "active",
        createdAt: now,
        updatedAt: now
      };
      db.goals.unshift(goal);
      return goal;
    }
    if (kind === "risk") {
      const risk: BusinessRisk = {
        ownerId,
        id: randomUUID(),
        title: title.slice(0, 200),
        level: input.level === "high" || input.level === "low" ? input.level : "medium",
        mitigation: input.mitigation?.trim().slice(0, 500) || "",
        createdAt: now,
        updatedAt: now
      };
      db.risks.unshift(risk);
      return risk;
    }
    const priority: BusinessPriority = {
      ownerId,
      id: randomUUID(),
      title: title.slice(0, 200),
      order: db.priorities.filter((item) => item.ownerId === ownerId).length,
      createdAt: now,
      updatedAt: now
    };
    db.priorities.push(priority);
    return priority;
  });
}

export async function updateBusinessPlanItem(
  ownerId: string,
  kind: "goal" | "risk" | "priority",
  id: string,
  patch: Record<string, unknown>
) {
  return accessDb((db) => {
    const collection =
      kind === "goal" ? db.goals : kind === "risk" ? db.risks : db.priorities;
    const item = collection.find(
      (candidate) => candidate.ownerId === ownerId && candidate.id === id
    );
    if (!item) return null;
    if (kind === "goal") {
      const goal = item as BusinessGoal;
      if (typeof patch.progress === "number" && Number.isFinite(patch.progress)) {
        goal.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
        if (goal.progress >= 100) goal.status = "completed";
      }
      if (patch.status === "active" || patch.status === "completed" || patch.status === "on_hold") {
        goal.status = patch.status;
      }
      if (typeof patch.title === "string" && patch.title.trim()) goal.title = patch.title.trim().slice(0, 200);
    } else if (kind === "risk") {
      const risk = item as BusinessRisk;
      if (patch.level === "low" || patch.level === "medium" || patch.level === "high") risk.level = patch.level;
      if (typeof patch.mitigation === "string") risk.mitigation = patch.mitigation.trim().slice(0, 500);
      if (typeof patch.title === "string" && patch.title.trim()) risk.title = patch.title.trim().slice(0, 200);
    } else {
      const priority = item as BusinessPriority;
      if (typeof patch.order === "number" && Number.isFinite(patch.order)) priority.order = Math.round(patch.order);
      if (typeof patch.title === "string" && patch.title.trim()) priority.title = patch.title.trim().slice(0, 200);
    }
    item.updatedAt = new Date().toISOString();
    return item;
  });
}

export async function deleteBusinessPlanItem(
  ownerId: string,
  kind: "goal" | "risk" | "priority",
  id: string
) {
  return accessDb((db) => {
    const collection =
      kind === "goal" ? db.goals : kind === "risk" ? db.risks : db.priorities;
    const index = collection.findIndex(
      (candidate) => candidate.ownerId === ownerId && candidate.id === id
    );
    if (index < 0) return false;
    collection.splice(index, 1);
    return true;
  });
}

async function accessDb<T>(operation: (db: PlanDb) => T | Promise<T>): Promise<T> {
  return withJsonStoreLock(FILE_NAME, async () => {
    const raw = await readJsonStore<PlanDb>(FILE_NAME, EMPTY_DB);
    const db: PlanDb = {
      goals: Array.isArray(raw.goals) ? raw.goals : [],
      risks: Array.isArray(raw.risks) ? raw.risks : [],
      priorities: Array.isArray(raw.priorities) ? raw.priorities : []
    };
    const result = await operation(db);
    await writeJsonStore(FILE_NAME, db);
    return result;
  });
}
