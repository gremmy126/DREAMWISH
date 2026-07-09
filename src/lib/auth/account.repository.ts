import {
  ADMIN_EMAIL,
  buildAccessState,
  normalizeEmail,
  type AccessState,
  type AccountRole
} from "./access-control";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type AccountRecord = {
  email: string;
  name: string | null;
  role: AccountRole;
  paid: boolean;
  createdAt: string;
  lastLoginAt: string;
  paidAt: string | null;
};

type AccountDb = {
  accounts: AccountRecord[];
};

const ACCOUNT_DB_FILE = "accounts.json";
const EMPTY_DB: AccountDb = { accounts: [] };

export async function loginAccount(input: {
  email: string;
  name?: string | null;
}): Promise<{ account: AccountRecord; access: AccessState }> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new Error("올바른 이메일을 입력해주세요.");
  }

  const db = await readDb();
  const now = new Date().toISOString();
  const existing = db.accounts.find((account) => account.email === email);
  const admin = email === ADMIN_EMAIL;

  const account: AccountRecord = existing
    ? {
        ...existing,
        name: input.name?.trim() || existing.name,
        role: admin ? "admin" : existing.role,
        paid: admin ? true : existing.paid,
        lastLoginAt: now
      }
    : {
        email,
        name: input.name?.trim() || null,
        role: admin ? "admin" : "user",
        paid: admin,
        createdAt: now,
        lastLoginAt: now,
        paidAt: admin ? now : null
      };

  const index = db.accounts.findIndex((item) => item.email === email);
  if (index >= 0) db.accounts[index] = account;
  else db.accounts.unshift(account);

  await writeDb(db);
  return { account, access: toAccessState(account) };
}

export async function getAccountAccess(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const db = await readDb();
  const account = db.accounts.find((item) => item.email === normalized);
  if (!account) {
    return toAccessState({
      email: normalized,
      name: null,
      role: normalized === ADMIN_EMAIL ? "admin" : "user",
      paid: normalized === ADMIN_EMAIL,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      paidAt: normalized === ADMIN_EMAIL ? new Date().toISOString() : null
    });
  }

  return toAccessState(account);
}

export async function markAccountPaid(input: {
  email?: string | null;
  externalCustomerId?: string | null;
}) {
  const email = normalizeEmail(String(input.email || input.externalCustomerId || ""));
  if (!email || !email.includes("@")) return null;

  const db = await readDb();
  const now = new Date().toISOString();
  const existing = db.accounts.find((account) => account.email === email);
  const account: AccountRecord = existing
    ? { ...existing, paid: true, paidAt: existing.paidAt || now }
    : {
        email,
        name: null,
        role: email === ADMIN_EMAIL ? "admin" : "user",
        paid: true,
        createdAt: now,
        lastLoginAt: now,
        paidAt: now
      };

  const index = db.accounts.findIndex((item) => item.email === email);
  if (index >= 0) db.accounts[index] = account;
  else db.accounts.unshift(account);

  await writeDb(db);
  return { account, access: toAccessState(account) };
}

async function readDb() {
  const db = await readJsonStore<AccountDb>(ACCOUNT_DB_FILE, EMPTY_DB);
  return { accounts: Array.isArray(db.accounts) ? db.accounts : [] };
}

async function writeDb(db: AccountDb) {
  await writeJsonStore(ACCOUNT_DB_FILE, db);
}

function toAccessState(account: AccountRecord): AccessState {
  return buildAccessState({ email: account.email, paid: account.paid });
}
