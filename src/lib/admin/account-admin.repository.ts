import { isAdminEmail, normalizeEmail } from "../auth/access-control";
import { getPostgres, hasPostgresStorage } from "../db/postgres";
import {
  readJsonStore,
  withJsonStoreLock,
  writeJsonStore
} from "../local-db/json-store";
import { ensureAdminSchema } from "./schema";
import type {
  AdminAuditEvent,
  AdminUserMutation,
  AuthIdentity,
  IdentityProvider,
  OperationalAccount
} from "./account-admin.types";

type AdminAccountDb = {
  accounts: OperationalAccount[];
  identities: AuthIdentity[];
  auditEvents: Array<Record<string, unknown>>;
};

const ADMIN_ACCOUNT_FILE = "admin-accounts.json";
const EMPTY_DB: AdminAccountDb = { accounts: [], identities: [], auditEvents: [] };

export async function upsertOperationalAccount(input: {
  id: string;
  email: string;
  name?: string | null;
  provider: IdentityProvider;
  providerSubject?: string;
}): Promise<OperationalAccount> {
  const id = input.id.trim();
  const email = normalizeEmail(input.email);
  const providerSubject = (input.providerSubject || id).trim();
  if (!id || !providerSubject || !email.includes("@")) {
    throw new Error("A valid account identity and email are required.");
  }
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const sql = getPostgres();
    return sql.begin(async (transaction) => {
      const existing = await transaction`
        SELECT a.* FROM user_accounts a
        LEFT JOIN auth_identities i ON i.account_id = a.id
        WHERE (i.provider = ${input.provider} AND i.provider_subject = ${providerSubject})
           OR LOWER(a.email) = ${email}
        ORDER BY CASE WHEN i.provider_subject = ${providerSubject} THEN 0 ELSE 1 END
        LIMIT 1
        FOR UPDATE OF a
      `;
      const accountId = String(existing[0]?.id || id);
      const role = existing[0]?.role === "admin" || isAdminEmail(email) ? "admin" : "user";
      const rows = await transaction`
        INSERT INTO user_accounts (id, email, name, role, status, session_version, created_at, updated_at, last_login_at)
        VALUES (${accountId}, ${email}, ${input.name?.trim() || null}, ${role}, 'active', 1, NOW(), NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          name = COALESCE(EXCLUDED.name, user_accounts.name),
          role = CASE WHEN user_accounts.role = 'admin' OR EXCLUDED.role = 'admin' THEN 'admin' ELSE 'user' END,
          updated_at = NOW(),
          last_login_at = NOW()
        RETURNING *
      `;
      await transaction`
        INSERT INTO auth_identities (account_id, provider, provider_subject, created_at, last_login_at)
        VALUES (${accountId}, ${input.provider}, ${providerSubject}, NOW(), NOW())
        ON CONFLICT (provider, provider_subject) DO UPDATE SET
          last_login_at = NOW()
      `;
      return mapAccountRow(rows[0]);
    });
  }

  return withJsonStoreLock(ADMIN_ACCOUNT_FILE, async () => {
    const db = await readLocalDb();
    const identity = db.identities.find(
      (item) => item.provider === input.provider && item.providerSubject === providerSubject
    );
    const existing = db.accounts.find(
      (item) => item.id === identity?.accountId || item.email === email
    );
    const now = new Date().toISOString();
    const account: OperationalAccount = existing
      ? {
          ...existing,
          email,
          name: input.name?.trim() || existing.name,
          role: existing.role === "admin" || isAdminEmail(email) ? "admin" : "user",
          updatedAt: now,
          lastLoginAt: now
        }
      : {
          id,
          email,
          name: input.name?.trim() || null,
          role: isAdminEmail(email) ? "admin" : "user",
          status: "active",
          sessionVersion: 1,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
          deletionScheduledAt: null
        };
    db.accounts = [account, ...db.accounts.filter((item) => item.id !== account.id)];
    const nextIdentity: AuthIdentity = {
      accountId: account.id,
      provider: input.provider,
      providerSubject,
      createdAt: identity?.createdAt || now,
      lastLoginAt: now
    };
    db.identities = [
      nextIdentity,
      ...db.identities.filter(
        (item) => !(item.provider === input.provider && item.providerSubject === providerSubject)
      )
    ];
    await writeJsonStore(ADMIN_ACCOUNT_FILE, db);
    return account;
  });
}

export async function getOperationalAccount(id: string): Promise<OperationalAccount | null> {
  if (!id.trim()) return null;
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`SELECT * FROM user_accounts WHERE id = ${id} LIMIT 1`;
    return rows[0] ? mapAccountRow(rows[0]) : null;
  }
  return (await readLocalDb()).accounts.find((item) => item.id === id) || null;
}

export async function getOperationalAccountByEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`SELECT * FROM user_accounts WHERE LOWER(email) = ${normalized} LIMIT 1`;
    return rows[0] ? mapAccountRow(rows[0]) : null;
  }
  return (await readLocalDb()).accounts.find((item) => item.email === normalized) || null;
}

export async function listOperationalAccounts(input: { query?: string; limit?: number; offset?: number } = {}) {
  const query = normalizeEmail(input.query || "");
  const limit = Math.min(100, Math.max(1, input.limit || 50));
  const offset = Math.max(0, input.offset || 0);
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const pattern = `%${query}%`;
    const rows = await getPostgres()`
      SELECT * FROM user_accounts
      WHERE ${query === ""} OR LOWER(email) LIKE ${pattern} OR LOWER(COALESCE(name, '')) LIKE ${pattern}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return rows.map(mapAccountRow);
  }
  return (await readLocalDb()).accounts
    .filter((item) => !query || item.email.includes(query) || item.name?.toLowerCase().includes(query))
    .slice(offset, offset + limit);
}

export async function mutateOperationalAccount(
  id: string,
  mutation: AdminUserMutation
): Promise<OperationalAccount> {
  const current = await getOperationalAccount(id);
  if (!current) throw new Error("Account not found.");
  const next = applyMutation(current, mutation);
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`
      UPDATE user_accounts SET
        role = ${next.role}, status = ${next.status}, session_version = ${next.sessionVersion},
        deletion_scheduled_at = ${next.deletionScheduledAt}, updated_at = ${next.updatedAt}
      WHERE id = ${id}
      RETURNING *
    `;
    return mapAccountRow(rows[0]);
  }
  return withJsonStoreLock(ADMIN_ACCOUNT_FILE, async () => {
    const db = await readLocalDb();
    const latest = db.accounts.find((item) => item.id === id);
    if (!latest) throw new Error("Account not found.");
    const updated = applyMutation(latest, mutation);
    db.accounts = db.accounts.map((item) => (item.id === id ? updated : item));
    await writeJsonStore(ADMIN_ACCOUNT_FILE, db);
    return updated;
  });
}

export async function countActiveAdministrators() {
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`
      SELECT COUNT(*)::INTEGER AS count FROM user_accounts
      WHERE role = 'admin' AND status = 'active'
    `;
    return Number(rows[0]?.count || 0);
  }
  return (await readLocalDb()).accounts.filter(
    (item) => item.role === "admin" && item.status === "active"
  ).length;
}

export async function appendAdminAuditEvent(input: {
  actorAccountId: string;
  targetAccountId?: string | null;
  action: string;
  safeMetadata?: Record<string, unknown>;
}): Promise<AdminAuditEvent> {
  const event: AdminAuditEvent = {
    id: crypto.randomUUID(),
    actorAccountId: input.actorAccountId,
    targetAccountId: input.targetAccountId || null,
    action: input.action,
    safeMetadata: input.safeMetadata || {},
    createdAt: new Date().toISOString()
  };
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    await getPostgres()`
      INSERT INTO admin_audit_events (id, actor_account_id, target_account_id, action, safe_metadata, created_at)
      VALUES (${event.id}, ${event.actorAccountId}, ${event.targetAccountId}, ${event.action}, ${getPostgres().json(event.safeMetadata as never)}, ${event.createdAt})
    `;
    return event;
  }
  return withJsonStoreLock(ADMIN_ACCOUNT_FILE, async () => {
    const db = await readLocalDb();
    db.auditEvents = [event, ...db.auditEvents];
    await writeJsonStore(ADMIN_ACCOUNT_FILE, db);
    return event;
  });
}

export async function listAdminAuditEvents(limit = 200): Promise<AdminAuditEvent[]> {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`
      SELECT * FROM admin_audit_events ORDER BY created_at DESC LIMIT ${safeLimit}
    `;
    return rows.map((row) => ({
      id: String(row.id),
      actorAccountId: String(row.actor_account_id),
      targetAccountId: row.target_account_id ? String(row.target_account_id) : null,
      action: String(row.action),
      safeMetadata: (row.safe_metadata || {}) as Record<string, unknown>,
      createdAt: toIso(row.created_at)
    }));
  }
  return (await readLocalDb()).auditEvents.slice(0, safeLimit) as AdminAuditEvent[];
}

function applyMutation(account: OperationalAccount, mutation: AdminUserMutation) {
  const now = new Date().toISOString();
  const next = { ...account, updatedAt: now };
  switch (mutation.type) {
    case "suspend":
      return { ...next, status: "suspended" as const, sessionVersion: account.sessionVersion + 1 };
    case "restore":
      return { ...next, status: "active" as const, deletionScheduledAt: null };
    case "force_logout":
      return { ...next, sessionVersion: account.sessionVersion + 1 };
    case "promote":
      return { ...next, role: "admin" as const, sessionVersion: account.sessionVersion + 1 };
    case "demote":
      return { ...next, role: "user" as const, sessionVersion: account.sessionVersion + 1 };
    case "schedule_delete": {
      const scheduledAt = mutation.deletionScheduledAt || new Date(Date.now() + 7 * 86_400_000).toISOString();
      return {
        ...next,
        status: "deletion_pending" as const,
        deletionScheduledAt: scheduledAt,
        sessionVersion: account.sessionVersion + 1
      };
    }
    case "cancel_delete":
      return { ...next, status: "active" as const, deletionScheduledAt: null };
    case "delete":
      return {
        ...next,
        status: "deleted" as const,
        deletionScheduledAt: null,
        sessionVersion: account.sessionVersion + 1
      };
  }
}

async function readLocalDb(): Promise<AdminAccountDb> {
  const db = await readJsonStore<AdminAccountDb>(ADMIN_ACCOUNT_FILE, EMPTY_DB);
  return {
    accounts: Array.isArray(db.accounts) ? db.accounts : [],
    identities: Array.isArray(db.identities) ? db.identities : [],
    auditEvents: Array.isArray(db.auditEvents) ? db.auditEvents : []
  };
}

function mapAccountRow(row: Record<string, unknown>): OperationalAccount {
  return {
    id: String(row.id),
    email: normalizeEmail(String(row.email)),
    name: row.name == null ? null : String(row.name),
    role: row.role === "admin" ? "admin" : "user",
    status: ["active", "suspended", "deletion_pending", "deleted"].includes(String(row.status))
      ? (String(row.status) as OperationalAccount["status"])
      : "active",
    sessionVersion: Number(row.session_version || 1),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    lastLoginAt: toIso(row.last_login_at),
    deletionScheduledAt: row.deletion_scheduled_at ? toIso(row.deletion_scheduled_at) : null
  };
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
