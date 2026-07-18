import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { getPostgres } from "../db/postgres";
import { ensureRevenueSchema } from "./revenue.schema";

export async function appendRevenueAudit(input: {
  ownerId: string; candidateId: string; action: string;
  actorType: "user" | "trusted_source" | "billing" | "system";
  safeMetadata?: Record<string, unknown>;
}) {
  await ensureRevenueSchema();
  return insertRevenueAudit(getPostgres(), input);
}

export async function insertRevenueAudit(
  sql: postgres.Sql | postgres.TransactionSql,
  input: { ownerId: string; candidateId: string; action: string; actorType: "user" | "trusted_source" | "billing" | "system"; safeMetadata?: Record<string, unknown> }
) {
  const rows = await sql`
    INSERT INTO revenue_audit_events (id, owner_id, candidate_id, action, actor_type, safe_metadata)
    VALUES (${randomUUID()}, ${input.ownerId}, ${input.candidateId}, ${input.action}, ${input.actorType}, ${sql.json((input.safeMetadata || {}) as never)})
    RETURNING *
  `;
  return rows[0]!;
}

export async function listRevenueAudit(ownerId: string, candidateId: string) {
  await ensureRevenueSchema();
  return getPostgres()`SELECT * FROM revenue_audit_events WHERE owner_id = ${ownerId} AND candidate_id = ${candidateId} ORDER BY created_at`;
}
