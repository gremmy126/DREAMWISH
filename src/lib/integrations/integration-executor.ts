import { createApprovalPreviewForConnector } from "./permission";
import { connectorRegistry } from "./registry";
import type { ConnectorAction } from "./types";
import { addApprovalExecutionLink } from "@/src/lib/repositories/approval-execution-link.repository";
import { createAuditLogEntry, recordAuditLogEntry } from "@/src/lib/security/audit-log";

export async function createIntegrationExecutionPreview(action: ConnectorAction) {
  const connector = connectorRegistry.get(action.connectorId);
  const permissions = await connector.getPermissions();
  return createApprovalPreviewForConnector(action, permissions);
}

export async function executeApprovedConnectorAction(
  action: ConnectorAction,
  approval: { approved: boolean; approvalId?: string }
) {
  const connector = connectorRegistry.get(action.connectorId);
  const preview = await createIntegrationExecutionPreview(action);

  if (preview.approvalRequired && !approval.approved) {
    const audit = createAuditLogEntry("connector.blocked", action.connectorId, {
      type: action.type,
      risk: preview.riskLevel
    });
    await recordAuditLogEntry(audit);
    await addApprovalExecutionLink({
      approvalId: approval.approvalId || "approval_missing",
      connectorId: action.connectorId,
      actionType: action.type,
      status: "blocked"
    });
    return {
      ok: false,
      message: "사용자 승인 전에는 외부 작업을 실행하지 않습니다.",
      audit
    } as const;
  }

  const result = await connector.execute({
    ...action,
    payload: { ...action.payload, approvedByUser: true }
  });
  await addApprovalExecutionLink({
    approvalId: approval.approvalId || "approval_manual",
    connectorId: action.connectorId,
    actionType: action.type,
    status: result.ok ? "executed" : "blocked"
  });

  const audit = createAuditLogEntry("connector.executed", action.connectorId, {
    type: action.type,
    risk: preview.riskLevel
  });
  await recordAuditLogEntry(audit);

  return {
    ...result,
    audit
  };
}
