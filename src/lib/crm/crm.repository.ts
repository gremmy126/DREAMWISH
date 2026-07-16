import { randomUUID } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import type {
  Company,
  CrmActivity,
  CrmAuditEvent,
  CrmDeal,
  CrmInsight,
  CrmTask,
  Customer,
  CustomerMemory
} from "./crm.types";

type CrmDb = {
  legacyOwnerId?: string;
  companies: Company[];
  customers: Customer[];
  customer_memory: CustomerMemory[];
  activities: CrmActivity[];
  tasks: CrmTask[];
  deals: CrmDeal[];
  insights: CrmInsight[];
  audit: CrmAuditEvent[];
};

const FILE_NAME = "crm.json";
const EMPTY_DB: CrmDb = {
  companies: [], customers: [], customer_memory: [], activities: [], tasks: [], deals: [], insights: [], audit: []
};

export async function listCustomers(ownerId: string, options: { query?: string; includeDeleted?: boolean } = {}) {
  return accessDb(ownerId, (db) => {
    const query = options.query?.trim().toLowerCase() || "";
    return db.customers.filter((item) =>
      item.ownerId === ownerId &&
      (options.includeDeleted || !item.deletedAt) &&
      (!query || `${item.name} ${item.email} ${item.phone} ${item.companyName} ${item.tags.join(" ")}`.toLowerCase().includes(query))
    );
  });
}

export async function listCrmActivities(ownerId: string, customerId?: string) {
  return accessDb(ownerId, (db) => db.activities.filter((item) =>
    item.ownerId === ownerId && (!customerId || item.customerId === customerId)
  ));
}

export async function listCrmTasks(ownerId: string, customerId?: string) {
  return accessDb(ownerId, (db) => db.tasks.filter((item) =>
    item.ownerId === ownerId && (!customerId || item.customerId === customerId)
  ));
}

export async function listCrmDeals(ownerId: string, customerId?: string) {
  return accessDb(ownerId, (db) => db.deals.filter((item) =>
    item.ownerId === ownerId && (!customerId || item.customerId === customerId)
  ));
}

export async function listCrmInsights(ownerId: string) {
  return accessDb(ownerId, (db) => db.insights.filter((item) => item.ownerId === ownerId));
}

export async function listCrmAuditEvents(ownerId: string) {
  return accessDb(ownerId, (db) => db.audit.filter((item) => item.ownerId === ownerId));
}

export async function createCustomerDraft(input: {
  ownerId: string;
  name: string;
  email: string;
  phone: string;
  companyName: string;
  position: string;
  memo?: string;
}) {
  return accessDb(input.ownerId, (db) => {
    const now = new Date().toISOString();
    const company: Company = {
      ownerId: input.ownerId, id: randomUUID(), name: input.companyName.trim() || "개인 고객",
      domain: input.email.includes("@") ? input.email.split("@")[1] : "", industry: "", createdAt: now, updatedAt: now
    };
    const customer: Customer = {
      ownerId: input.ownerId, id: randomUUID(), companyId: company.id, companyName: company.name,
      name: input.name.trim() || "새 고객", email: input.email.trim(), phone: input.phone.trim(),
      position: input.position.trim(), tags: ["draft"], status: "lead", importance: "medium",
      customerType: company.name === "개인 고객" ? "person" : "company", memo: input.memo?.trim() || "",
      expectedValue: 0, relationshipScore: 50, lastContactAt: null, nextContactAt: null,
      createdAt: now, updatedAt: now, deletedAt: null
    };
    db.companies.unshift(company);
    db.customers.unshift(customer);
    db.activities.unshift({
      ownerId: input.ownerId, id: randomUUID(), customerId: customer.id, type: "note",
      title: "고객 생성", body: customer.memo || "직접 생성된 고객입니다.", createdAt: now
    });
    audit(db, input.ownerId, "customer.created", customer.id, now);
    return customer;
  });
}

export async function updateCustomer(ownerId: string, customerId: string, patch: Partial<Omit<Customer, "ownerId" | "id" | "createdAt">>) {
  return accessDb(ownerId, (db) => {
    const index = db.customers.findIndex((item) => item.ownerId === ownerId && item.id === customerId && !item.deletedAt);
    if (index < 0) return null;
    const current = db.customers[index];
    const updated: Customer = { ...current, ...patch, ownerId, id: current.id, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
    db.customers[index] = updated;
    audit(db, ownerId, "customer.updated", customerId, updated.updatedAt);
    return updated;
  });
}

export async function upsertCustomer(customer: Customer) {
  return updateCustomer(customer.ownerId, customer.id, customer) as Promise<Customer | null>;
}

export async function softDeleteCustomer(ownerId: string, customerId: string) {
  return accessDb(ownerId, (db) => {
    const customer = db.customers.find((item) => item.ownerId === ownerId && item.id === customerId && !item.deletedAt);
    if (!customer) return false;
    const now = new Date().toISOString();
    customer.deletedAt = now;
    customer.updatedAt = now;
    audit(db, ownerId, "customer.deleted", customerId, now);
    return true;
  });
}

export async function addCrmActivity(ownerId: string, input: Omit<CrmActivity, "ownerId" | "id" | "createdAt">) {
  return accessDb(ownerId, (db) => {
    const customer = db.customers.find((item) => item.ownerId === ownerId && item.id === input.customerId && !item.deletedAt);
    if (!customer) return null;
    const activity: CrmActivity = { ...input, ownerId, id: randomUUID(), createdAt: new Date().toISOString() };
    db.activities.unshift(activity);
    customer.lastContactAt = activity.createdAt;
    customer.updatedAt = activity.createdAt;
    audit(db, ownerId, "activity.created", activity.id, activity.createdAt);
    return activity;
  });
}

export async function createCrmDeal(input: {
  ownerId: string;
  customerId: string;
  title: string;
  value?: number;
  probability?: number;
  stage?: CrmDeal["stage"];
  expectedCloseAt?: string | null;
}) {
  return accessDb(input.ownerId, (db) => {
    const customer = db.customers.find(
      (item) => item.ownerId === input.ownerId && item.id === input.customerId && !item.deletedAt
    );
    if (!customer) return null;
    const now = new Date().toISOString();
    const deal: CrmDeal = {
      ownerId: input.ownerId,
      id: randomUUID(),
      customerId: input.customerId,
      title: input.title.trim().slice(0, 200) || "새 딜",
      stage: input.stage || "discovery",
      value: safeAmount(input.value),
      probability: Math.max(0, Math.min(100, Math.round(input.probability ?? 30))),
      expectedCloseAt: input.expectedCloseAt || null,
      createdAt: now,
      updatedAt: now
    };
    db.deals.unshift(deal);
    audit(db, input.ownerId, "deal.created", deal.id, now);
    return deal;
  });
}

export async function updateCrmDeal(
  ownerId: string,
  dealId: string,
  patch: Partial<Pick<CrmDeal, "title" | "stage" | "value" | "probability" | "expectedCloseAt">>
) {
  return accessDb(ownerId, (db) => {
    const deal = db.deals.find((item) => item.ownerId === ownerId && item.id === dealId);
    if (!deal) return null;
    if (typeof patch.title === "string" && patch.title.trim()) deal.title = patch.title.trim().slice(0, 200);
    if (patch.stage) deal.stage = patch.stage;
    if (typeof patch.value === "number") deal.value = safeAmount(patch.value);
    if (typeof patch.probability === "number") {
      deal.probability = Math.max(0, Math.min(100, Math.round(patch.probability)));
    }
    if (patch.expectedCloseAt !== undefined) deal.expectedCloseAt = patch.expectedCloseAt;
    if (patch.stage === "won") deal.probability = 100;
    if (patch.stage === "lost") deal.probability = 0;
    deal.updatedAt = new Date().toISOString();
    audit(db, ownerId, "deal.updated", dealId, deal.updatedAt);
    return deal;
  });
}

export async function deleteCrmDeal(ownerId: string, dealId: string) {
  return accessDb(ownerId, (db) => {
    const index = db.deals.findIndex((item) => item.ownerId === ownerId && item.id === dealId);
    if (index < 0) return false;
    db.deals.splice(index, 1);
    audit(db, ownerId, "deal.deleted", dealId, new Date().toISOString());
    return true;
  });
}

export async function createCrmTask(input: {
  ownerId: string;
  customerId: string;
  title: string;
  dueAt?: string | null;
  priority?: CrmTask["priority"];
}) {
  return accessDb(input.ownerId, (db) => {
    const customer = db.customers.find(
      (item) => item.ownerId === input.ownerId && item.id === input.customerId && !item.deletedAt
    );
    if (!customer) return null;
    const now = new Date().toISOString();
    const task: CrmTask = {
      ownerId: input.ownerId,
      id: randomUUID(),
      customerId: input.customerId,
      title: input.title.trim().slice(0, 200) || "새 업무",
      dueAt: input.dueAt || null,
      priority: input.priority || "medium",
      completedAt: null,
      createdAt: now,
      updatedAt: now
    };
    db.tasks.unshift(task);
    audit(db, input.ownerId, "task.created", task.id, now);
    return task;
  });
}

export async function updateCrmTask(
  ownerId: string,
  taskId: string,
  patch: { completed?: boolean; title?: string; dueAt?: string | null; priority?: CrmTask["priority"] }
) {
  return accessDb(ownerId, (db) => {
    const task = db.tasks.find((item) => item.ownerId === ownerId && item.id === taskId);
    if (!task) return null;
    const now = new Date().toISOString();
    if (typeof patch.completed === "boolean") task.completedAt = patch.completed ? now : null;
    if (typeof patch.title === "string" && patch.title.trim()) task.title = patch.title.trim().slice(0, 200);
    if (patch.dueAt !== undefined) task.dueAt = patch.dueAt;
    if (patch.priority) task.priority = patch.priority;
    task.updatedAt = now;
    audit(db, ownerId, "task.updated", taskId, now);
    return task;
  });
}

export async function deleteCrmTask(ownerId: string, taskId: string) {
  return accessDb(ownerId, (db) => {
    const index = db.tasks.findIndex((item) => item.ownerId === ownerId && item.id === taskId);
    if (index < 0) return false;
    db.tasks.splice(index, 1);
    audit(db, ownerId, "task.deleted", taskId, new Date().toISOString());
    return true;
  });
}

function safeAmount(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export async function upsertCustomerMemory(memory: CustomerMemory) {
  return accessDb(memory.ownerId, (db) => {
    const index = db.customer_memory.findIndex((item) => item.ownerId === memory.ownerId && item.customerId === memory.customerId);
    if (index >= 0) db.customer_memory[index] = memory;
    else db.customer_memory.unshift(memory);
    return memory;
  });
}

export async function saveCrmInsight(insight: CrmInsight) {
  return accessDb(insight.ownerId, (db) => {
    const index = db.insights.findIndex((item) => item.ownerId === insight.ownerId && item.customerId === insight.customerId);
    if (index >= 0) db.insights[index] = insight;
    else db.insights.unshift(insight);
    return insight;
  });
}

function audit(db: CrmDb, ownerId: string, action: string, entityId: string, createdAt: string) {
  db.audit.unshift({ ownerId, id: randomUUID(), action, entityId, createdAt });
}

async function accessDb<T>(ownerId: string, operation: (db: CrmDb) => T | Promise<T>): Promise<T> {
  return withJsonStoreLock(FILE_NAME, async () => {
    const raw = await readJsonStore<CrmDb>(FILE_NAME, EMPTY_DB);
    const db = normalizeDb(raw, ownerId);
    const result = await operation(db);
    await writeJsonStore(FILE_NAME, db);
    return result;
  });
}

function normalizeDb(raw: Partial<CrmDb>, ownerId: string): CrmDb {
  const db: CrmDb = {
    legacyOwnerId: raw.legacyOwnerId,
    companies: Array.isArray(raw.companies) ? raw.companies : [],
    customers: Array.isArray(raw.customers) ? raw.customers : [],
    customer_memory: Array.isArray(raw.customer_memory) ? raw.customer_memory : [],
    activities: Array.isArray(raw.activities) ? raw.activities : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    deals: Array.isArray(raw.deals) ? raw.deals : [],
    insights: Array.isArray(raw.insights) ? raw.insights : [],
    audit: Array.isArray(raw.audit) ? raw.audit : []
  };
  const collections: Array<Array<{ ownerId?: string }>> = [db.companies, db.customers, db.customer_memory, db.activities];
  if (!db.legacyOwnerId && collections.some((items) => items.some((item) => !item.ownerId))) db.legacyOwnerId = ownerId;
  if (db.legacyOwnerId === ownerId) {
    for (const items of collections) for (const item of items) if (!item.ownerId) item.ownerId = ownerId;
  }
  db.customers = db.customers.map((item) => ({
    ...item,
    companyName: item.companyName ?? "",
    customerType: item.customerType ?? "other",
    memo: item.memo ?? "",
    expectedValue: item.expectedValue ?? 0,
    relationshipScore: item.relationshipScore ?? 50,
    lastContactAt: item.lastContactAt ?? null,
    nextContactAt: item.nextContactAt ?? null,
    deletedAt: item.deletedAt ?? null
  }));
  return db;
}
