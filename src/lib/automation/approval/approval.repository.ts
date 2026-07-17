import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import postgres from "postgres";
import { getPostgres } from "../../db/postgres";
import { ensureAutomationRuntimeSchema } from "../runtime/schema";
import type { ApprovalSnapshot, ApprovalState } from "./approval.types";
import type { ActionValue } from "../registry/action.types";

export type ApprovalRequestRecord = {
  id: string;
  ownerId: string;
  executionId: string;
  stepRunId: string;
  state: ApprovalState;
  snapshot: ApprovalSnapshot;
  snapshotHash: string;
  confirmationPhraseHash: string | null;
  approvalExpiresAt: string;
  criticalAuthMethod: string | null;
  channels: string[];
};

export async function createApprovalRequest(input: {
  ownerId: string;
  stepRunId: string;
  snapshot: ApprovalSnapshot;
  snapshotHash: string;
  initialState: Extract<ApprovalState, "waiting_warning" | "waiting_final_approval">;
  confirmationPhrase?: string | null;
  criticalAuthMethod?: string | null;
  channels: string[];
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const id = randomUUID();
  return sql.begin(async (transaction) => {
    const rows = await transaction`
      INSERT INTO automation_approval_requests (
        id, owner_id, workflow_id, workflow_version, execution_id, step_run_id,
        node_id, action_id, action_version, adapter_version, integration_connection_id,
        snapshot_json, snapshot_hash, input_hash, output_schema_version, risk_level,
        approval_policy, state, approval_expires_at, confirmation_phrase_hash,
        critical_auth_method, approval_channels
      ) VALUES (
        ${id}, ${input.ownerId}, ${input.snapshot.workflowId}, ${input.snapshot.workflowVersion},
        ${input.snapshot.executionId}, ${input.stepRunId}, ${input.snapshot.nodeId}, ${input.snapshot.actionId},
        ${input.snapshot.actionVersion}, ${input.snapshot.adapterVersion}, ${input.snapshot.integrationConnectionId},
        ${transaction.json(input.snapshot as never)}, ${input.snapshotHash}, ${input.snapshot.inputHash},
        ${input.snapshot.outputSchemaVersion}, ${input.snapshot.riskLevel}, ${input.snapshot.approvalPolicy},
        ${input.initialState}, ${input.snapshot.approvalExpiresAt},
        ${input.confirmationPhrase ? confirmationPhraseHash(input.confirmationPhrase) : null},
        ${input.criticalAuthMethod || null}, ${input.channels}
      ) RETURNING *
    `;
    await appendApprovalEvent(transaction, input.ownerId, id, input.snapshot.executionId, "created", "system", null, {});
    return mapApproval(rows[0]!);
  }) as Promise<ApprovalRequestRecord>;
}

export async function getApprovalRequest(ownerId: string, requestId: string) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT * FROM automation_approval_requests
    WHERE owner_id = ${ownerId} AND id = ${requestId}
    LIMIT 1
  `;
  return rows[0] ? mapApproval(rows[0]) : null;
}

export async function listApprovalRequests(ownerId: string, limit = 100) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT * FROM automation_approval_requests
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC
    LIMIT ${Math.max(1, Math.min(500, Math.trunc(limit)))}
  `;
  return rows.map(mapApproval);
}

export async function listExpiredPendingApprovalIds(ownerId: string, limit = 100) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT id FROM automation_approval_requests
    WHERE owner_id = ${ownerId}
      AND state IN ('waiting_warning', 'waiting_final_approval')
      AND approval_expires_at <= NOW()
    ORDER BY approval_expires_at
    LIMIT ${Math.max(1, Math.min(500, Math.trunc(limit)))}
  `;
  return rows.map((row) => String(row.id));
}

export async function listExpiredPendingApprovals(limit = 100) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT owner_id, id FROM automation_approval_requests
    WHERE state IN ('waiting_warning', 'waiting_final_approval')
      AND approval_expires_at <= NOW()
    ORDER BY approval_expires_at
    LIMIT ${Math.max(1, Math.min(500, Math.trunc(limit)))}
  `;
  return rows.map((row) => ({ ownerId: String(row.owner_id), requestId: String(row.id) }));
}

export async function continueApprovalWarning(ownerId: string, requestId: string, actorId: string) {
  return transitionApproval({
    ownerId, requestId, from: "waiting_warning", to: "waiting_final_approval",
    eventType: "warning_continued", actorId,
    updates: { warning_acknowledged_at: new Date().toISOString(), warning_actor_id: actorId }
  });
}

export async function markFinalApproved(input: {
  ownerId: string;
  requestId: string;
  actorId: string;
  phrase?: string | null;
  criticalAuthResult?: string | null;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  return sql.begin(async (transaction) => {
    const currentRows = await transaction`
      SELECT * FROM automation_approval_requests
      WHERE owner_id = ${input.ownerId} AND id = ${input.requestId}
      FOR UPDATE
    `;
    if (!currentRows[0]) throw new Error("Approval request was not found.");
    const current = mapApproval(currentRows[0]);
    if (current.state !== "waiting_final_approval") throw new Error("Approval request is not waiting for final approval.");
    if (new Date(current.approvalExpiresAt).getTime() <= Date.now()) throw new Error("Approval request has expired.");
    if (current.confirmationPhraseHash && !verifyConfirmationPhrase(input.phrase || "", current.confirmationPhraseHash)) {
      throw new Error("확인 문구가 일치하지 않습니다.");
    }
    if (current.snapshot.riskLevel === "critical" && current.criticalAuthMethod && input.criticalAuthResult !== "verified") {
      throw new Error("추가 인증이 완료되지 않았습니다.");
    }
    const rows = await transaction`
      UPDATE automation_approval_requests
      SET state = 'approved', final_approved_at = NOW(), final_actor_id = ${input.actorId},
          critical_auth_result = ${input.criticalAuthResult || null}, approval_result = 'approved', updated_at = NOW()
      WHERE owner_id = ${input.ownerId} AND id = ${input.requestId} AND state = 'waiting_final_approval'
      RETURNING *
    `;
    if (!rows[0]) throw new Error("Approval request changed concurrently.");
    await appendApprovalEvent(transaction, input.ownerId, input.requestId, current.executionId, "final_approved", "owner", input.actorId, {});
    return mapApproval(rows[0]);
  }) as Promise<ApprovalRequestRecord>;
}

export async function rejectApproval(ownerId: string, requestId: string, actorId: string) {
  const current = await getApprovalRequest(ownerId, requestId);
  if (!current || !["waiting_warning", "waiting_final_approval"].includes(current.state)) throw new Error("Approval request cannot be rejected.");
  return transitionApproval({
    ownerId, requestId, from: current.state as "waiting_warning" | "waiting_final_approval", to: "rejected",
    eventType: "rejected", actorId, updates: { rejected_at: new Date().toISOString(), approval_result: "rejected" }
  });
}

export async function expireApproval(ownerId: string, requestId: string) {
  const current = await getApprovalRequest(ownerId, requestId);
  if (!current || !["waiting_warning", "waiting_final_approval"].includes(current.state)) throw new Error("Approval request cannot expire.");
  return transitionApproval({
    ownerId, requestId, from: current.state as "waiting_warning" | "waiting_final_approval", to: "expired",
    eventType: "expired", actorId: null, updates: { expired_at: new Date().toISOString(), approval_result: "expired" }
  });
}

export async function supersedeApproval(ownerId: string, requestId: string, newRequestId: string, actorId: string) {
  return transitionApproval({
    ownerId, requestId, from: "waiting_final_approval", to: "superseded",
    eventType: "superseded", actorId, updates: { superseded_by_request_id: newRequestId, approval_result: "superseded" }
  });
}

type ApprovalColumn = "warning_acknowledged_at" | "warning_actor_id" | "rejected_at" | "expired_at" | "approval_result" | "superseded_by_request_id";

async function transitionApproval(input: {
  ownerId: string;
  requestId: string;
  from: "waiting_warning" | "waiting_final_approval";
  to: ApprovalState;
  eventType: string;
  actorId: string | null;
  updates: Partial<Record<ApprovalColumn, string>>;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  return sql.begin(async (transaction) => {
    const currentRows = await transaction`
      SELECT execution_id, approval_expires_at FROM automation_approval_requests
      WHERE owner_id = ${input.ownerId} AND id = ${input.requestId} AND state = ${input.from}
      FOR UPDATE
    `;
    if (!currentRows[0]) throw new Error("Approval request changed concurrently or is not in the expected state.");
    if (["waiting_warning", "waiting_final_approval"].includes(input.to) && new Date(currentRows[0].approval_expires_at as Date | string).getTime() <= Date.now()) {
      throw new Error("Approval request has expired.");
    }
    const rows = await transaction`
      UPDATE automation_approval_requests
      SET state = ${input.to},
          warning_acknowledged_at = COALESCE(${input.updates.warning_acknowledged_at || null}, warning_acknowledged_at),
          warning_actor_id = COALESCE(${input.updates.warning_actor_id || null}, warning_actor_id),
          rejected_at = COALESCE(${input.updates.rejected_at || null}, rejected_at),
          expired_at = COALESCE(${input.updates.expired_at || null}, expired_at),
          approval_result = COALESCE(${input.updates.approval_result || null}, approval_result),
          superseded_by_request_id = COALESCE(${input.updates.superseded_by_request_id || null}, superseded_by_request_id),
          updated_at = NOW()
      WHERE owner_id = ${input.ownerId} AND id = ${input.requestId} AND state = ${input.from}
      RETURNING *
    `;
    if (!rows[0]) throw new Error("Approval request changed concurrently.");
    await appendApprovalEvent(transaction, input.ownerId, input.requestId, String(currentRows[0].execution_id), input.eventType, input.actorId ? "owner" : "system", input.actorId, {});
    return mapApproval(rows[0]);
  }) as Promise<ApprovalRequestRecord>;
}

async function appendApprovalEvent(
  query: postgres.TransactionSql,
  ownerId: string,
  requestId: string,
  executionId: string,
  eventType: string,
  actorType: string,
  actorId: string | null,
  metadata: Record<string, ActionValue>
) {
  await query`
    INSERT INTO automation_approval_events (
      id, owner_id, approval_request_id, execution_id, event_type, actor_type, actor_id, safe_metadata
    ) VALUES (
      ${randomUUID()}, ${ownerId}, ${requestId}, ${executionId}, ${eventType}, ${actorType},
      ${actorId}, ${query.json(metadata as never)}
    )
  `;
}

function mapApproval(row: Record<string, unknown>): ApprovalRequestRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    executionId: String(row.execution_id),
    stepRunId: String(row.step_run_id),
    state: String(row.state) as ApprovalState,
    snapshot: structuredClone(row.snapshot_json as ApprovalSnapshot),
    snapshotHash: String(row.snapshot_hash),
    confirmationPhraseHash: row.confirmation_phrase_hash ? String(row.confirmation_phrase_hash) : null,
    approvalExpiresAt: new Date(row.approval_expires_at as Date | string).toISOString(),
    criticalAuthMethod: row.critical_auth_method ? String(row.critical_auth_method) : null,
    channels: Array.isArray(row.approval_channels) ? row.approval_channels.map(String) : ["in_app"]
  };
}

function confirmationPhraseHash(phrase: string) {
  return createHash("sha256").update("automation-confirmation-v1\0").update(phrase).digest("hex");
}

function verifyConfirmationPhrase(phrase: string, expected: string) {
  const actual = Buffer.from(confirmationPhraseHash(phrase), "hex");
  const stored = Buffer.from(expected, "hex");
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}
