import { randomUUID } from "node:crypto";
import { getPostgres } from "../../db/postgres";
import { ensureAutomationRuntimeSchema } from "./schema";
import type { ActionRiskLevel, ActionValue } from "../registry/action.types";

export type AppendAutomationAuditInput = {
  ownerId: string;
  userId?: string | null;
  approverId?: string | null;
  workflowId?: string | null;
  executionId?: string | null;
  stepRunId?: string | null;
  actionId?: string | null;
  riskLevel?: ActionRiskLevel | null;
  warningAcknowledgedAt?: string | null;
  finalApprovedAt?: string | null;
  rejectedAt?: string | null;
  approvedInputHash?: string | null;
  actualInputHash?: string | null;
  approvalChannels?: string[];
  approvalResult?: string | null;
  executionResult?: string | null;
  safeConnectionIdentity?: Record<string, ActionValue> | null;
  metadata?: Record<string, ActionValue>;
};

export async function appendAutomationAuditEvent(input: AppendAutomationAuditInput) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const id = randomUUID();
  await sql`
    INSERT INTO automation_audit_events (
      id, owner_id, user_id, approver_id, workflow_id, execution_id, step_run_id,
      action_id, risk_level, warning_acknowledged_at, final_approved_at, rejected_at,
      approved_input_hash, actual_input_hash, approval_channels, approval_result,
      execution_result, safe_connection_identity, safe_metadata
    ) VALUES (
      ${id}, ${input.ownerId}, ${input.userId || null}, ${input.approverId || null},
      ${input.workflowId || null}, ${input.executionId || null}, ${input.stepRunId || null},
      ${input.actionId || null}, ${input.riskLevel || null}, ${input.warningAcknowledgedAt || null},
      ${input.finalApprovedAt || null}, ${input.rejectedAt || null}, ${input.approvedInputHash || null},
      ${input.actualInputHash || null}, ${input.approvalChannels || []}, ${input.approvalResult || null},
      ${input.executionResult || null}, ${input.safeConnectionIdentity ? sql.json(input.safeConnectionIdentity as never) : null},
      ${sql.json((input.metadata || {}) as never)}
    )
  `;
  return id;
}

export async function listAutomationAuditEvents(ownerId: string, limit = 200) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  return sql`
    SELECT * FROM automation_audit_events
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC
    LIMIT ${Math.max(1, Math.min(500, Math.trunc(limit)))}
  `;
}
