import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Company, CrmActivity, Customer, CustomerMemory } from "./crm.types";

type CrmDb = {
  companies: Company[];
  customers: Customer[];
  customer_memory: CustomerMemory[];
  activities: CrmActivity[];
};

const DB_DIR = path.join(process.cwd(), ".local-db");
const DB_PATH = path.join(DB_DIR, "crm.json");

export async function listCustomers() {
  const db = await readDb();
  return db.customers;
}

export async function listCrmActivities() {
  const db = await readDb();
  return db.activities;
}

export async function createCustomerDraft(input: {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  position: string;
  memo?: string;
}) {
  const now = new Date().toISOString();
  const company: Company = {
    id: randomUUID(),
    name: input.companyName.trim() || "개인 고객",
    domain: input.email.includes("@") ? input.email.split("@")[1] : "",
    industry: "",
    createdAt: now,
    updatedAt: now
  };
  const customer: Customer = {
    id: randomUUID(),
    companyId: company.id,
    name: input.name.trim() || "새 고객",
    email: input.email.trim(),
    phone: input.phone.trim(),
    position: input.position.trim(),
    tags: ["draft"],
    status: "lead",
    importance: "medium",
    createdAt: now,
    updatedAt: now
  };
  const activity: CrmActivity = {
    id: randomUUID(),
    customerId: customer.id,
    type: "note",
    title: "고객 초안 생성",
    body: input.memo?.trim() || "직접 생성한 고객 초안입니다.",
    createdAt: now
  };

  const db = await readDb();
  db.companies.unshift(company);
  db.customers.unshift(customer);
  db.activities.unshift(activity);
  await writeDb(db);
  return customer;
}

export async function upsertCustomer(customer: Customer) {
  const db = await readDb();
  const existingIndex = db.customers.findIndex((item) => item.id === customer.id);
  if (existingIndex >= 0) db.customers[existingIndex] = customer;
  else db.customers.unshift(customer);
  await writeDb(db);
  return customer;
}

export async function upsertCustomerMemory(memory: CustomerMemory) {
  const db = await readDb();
  const existingIndex = db.customer_memory.findIndex(
    (item) => item.customerId === memory.customerId
  );
  if (existingIndex >= 0) db.customer_memory[existingIndex] = memory;
  else db.customer_memory.unshift(memory);
  await writeDb(db);
  return memory;
}

export async function addCrmActivity(activity: CrmActivity) {
  const db = await readDb();
  db.activities.unshift(activity);
  await writeDb(db);
  return activity;
}

async function readDb(): Promise<CrmDb> {
  await fs.mkdir(DB_DIR, { recursive: true });

  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<CrmDb>;
    return {
      companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      customer_memory: Array.isArray(parsed.customer_memory) ? parsed.customer_memory : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : []
    };
  } catch {
    return { companies: [], customers: [], customer_memory: [], activities: [] };
  }
}

async function writeDb(db: CrmDb) {
  await fs.mkdir(DB_DIR, { recursive: true });
  const tempPath = `${DB_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tempPath, DB_PATH);
}
