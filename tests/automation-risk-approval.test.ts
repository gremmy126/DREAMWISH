import assert from "node:assert/strict";
import {
  ApprovalSnapshotMismatchError,
  buildApprovalSnapshot,
  computeApprovalHash,
  verifyApprovalSnapshot
} from "../src/lib/automation/approval/approval-hash";
import { evaluateActionPolicy } from "../src/lib/automation/approval/approval.service";

const base = {
  workflowId: "workflow-1",
  workflowVersion: 7,
  executionId: "execution-1",
  nodeId: "node-1",
  actionId: "refund",
  actionVersion: 2,
  adapterVersion: 4,
  integrationConnectionId: "connection-1",
  normalizedInput: { amount: 1200, order: { id: "o-1", token: "must-not-store" } },
  targetAccount: "billing@example.com",
  targetResources: ["payment-1"],
  executionCount: 1,
  amount: 1200,
  currency: "KRW",
  scheduledFor: "2026-07-17T09:00:00.000Z",
  outputSchemaVersion: 1,
  riskLevel: "critical" as const,
  approvalPolicy: "high_risk_two_stage" as const,
  approvalExpiresAt: "2026-07-17T09:30:00.000Z"
};

test("approval hash is canonical domain-separated and excludes secrets", () => {
  const first = buildApprovalSnapshot(base);
  const second = buildApprovalSnapshot({ ...base, normalizedInput: { order: { token: "different-secret", id: "o-1" }, amount: 1200 } });
  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.doesNotMatch(JSON.stringify(first), /must-not-store/u);
  assert.equal(first.inputHash, second.inputHash);
  assert.equal(computeApprovalHash(first.snapshot), first.snapshotHash);
});

test("approval becomes stale when protected execution facts change", () => {
  const approved = buildApprovalSnapshot(base);
  for (const patch of [
    { integrationConnectionId: "connection-2" }, { amount: 1300 }, { workflowVersion: 8 },
    { executionCount: 2 }, { scheduledFor: "2026-07-17T09:05:00.000Z" }
  ]) assert.notEqual(buildApprovalSnapshot({ ...base, ...patch }).snapshotHash, approved.snapshotHash);
  assert.throws(
    () => verifyApprovalSnapshot(approved.snapshotHash, buildApprovalSnapshot({ ...base, amount: 1300 }).snapshot),
    (error: unknown) => error instanceof ApprovalSnapshotMismatchError && error.message === "승인된 내용과 실제 실행 내용이 변경되었습니다. 다시 승인해 주세요."
  );
});

test("risk policy never bypasses high or critical approval", () => {
  for (const approvalPolicy of ["automatic", "test_only", "high_risk_two_stage"] as const) {
    assert.equal(evaluateActionPolicy({ riskLevel: "high", executionMode: "live", approvalPolicy, externalChange: true }).decision, "two_stage");
    assert.equal(evaluateActionPolicy({ riskLevel: "critical", executionMode: "live", approvalPolicy, externalChange: true }).decision, "critical");
  }
  assert.equal(evaluateActionPolicy({ riskLevel: "low", executionMode: "live", approvalPolicy: "high_risk_two_stage", externalChange: true }).decision, "automatic");
  assert.equal(evaluateActionPolicy({ riskLevel: "medium", executionMode: "manual", approvalPolicy: "automatic", externalChange: true }).decision, "preview_approval");
  assert.equal(evaluateActionPolicy({ riskLevel: "read", executionMode: "test", approvalPolicy: "all_external_changes", externalChange: false }).decision, "automatic");
});
