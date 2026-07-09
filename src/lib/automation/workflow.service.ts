import type { Workflow } from "./workflow.types";

export function createWorkflowDraft(name: string, triggerType = "manual"): Workflow {
  const now = new Date().toISOString();

  return {
    id: makeId("workflow"),
    name: name.trim() || "새 Workflow",
    description: "승인 기반 자동화 초안입니다. 실제 Trigger 실행은 다음 단계에서 연결합니다.",
    trigger: {
      type: triggerType,
      label: triggerTypeLabel(triggerType)
    },
    conditions: [
      {
        field: "approval.status",
        operator: "equals",
        value: "approved"
      }
    ],
    actions: [
      {
        type: "request_approval",
        label: "Execution Preview 생성 후 승인 요청",
        target: "approval_requests"
      }
    ],
    status: "draft",
    createdAt: now,
    updatedAt: now
  };
}

export const workflowTables = [
  "workflows",
  "workflow_steps",
  "agents",
  "agent_runs",
  "approval_requests",
  "execution_history"
];

function triggerTypeLabel(type: string) {
  if (type === "crm.customer.updated") return "CRM 고객 업데이트";
  if (type === "knowledge.document.created") return "문서 생성";
  if (type === "manual") return "수동 실행";
  return type;
}

function makeId(prefix: string) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}
