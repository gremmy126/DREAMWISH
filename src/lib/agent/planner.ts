import type { ExecutionPlan, ExecutionPlanStep, ExecutionRisk } from "./agent.types";

export async function planAgentExecution(request: string): Promise<ExecutionPlan> {
  const goal = request.trim() || "Handle user request";
  const steps = buildSteps(goal);

  return {
    id: makeId("plan"),
    goal,
    steps,
    risk: inferRisk(goal, steps),
    estimatedTime: `${Math.max(3, steps.length * 2)} min`,
    requiredApproval: true,
    createdAt: new Date().toISOString()
  };
}

function buildSteps(goal: string): ExecutionPlanStep[] {
  const normalized = goal.toLowerCase();
  const steps: Omit<ExecutionPlanStep, "id" | "order">[] = [];

  if (/(고객|customer|crm|계약|견적|리드|lead)/iu.test(normalized)) {
    steps.push({
      type: "crm_search",
      title: "CRM search",
      description: "Look up customers, companies, contacts, past activity, and AI memory.",
      target: "crm",
      requiresApproval: false
    });
  }

  steps.push({
    type: "knowledge_search",
    title: "Knowledge search",
    description: "Find grounding context from SecondBrain, memory, chat history, and recent documents.",
    target: "knowledge",
    requiresApproval: false
  });

  if (/(프로젝트|project|파일|문서|견적|file|document)/iu.test(normalized)) {
    steps.push({
      type: "project_lookup",
      title: "Project context check",
      description: "Check related projects, files, and decision records before proposing changes.",
      target: "projects",
      requiresApproval: false
    });
  }

  if (/(회의|미팅|일정|calendar|예약|다음 주|내일|오늘|予定|カレンダー)/iu.test(normalized)) {
    steps.push({
      type: "calendar_check",
      title: "Calendar check",
      description: "Review available schedule context and prepare event changes only as a preview.",
      target: "calendar",
      requiresApproval: false
    });
  }

  if (needsExternalAppPlan(normalized)) {
    steps.push(
      {
        type: "permission_check",
        title: "Permission check",
        description: "Check OAuth/API connection status for Gmail, Calendar, Slack, GitHub, Notion, and Firebase.",
        target: "integration_permission",
        requiresApproval: false
      },
      {
        type: "external_execution_preview",
        title: "Execution preview",
        description: "Prepare a read/write/edit/send/delete preview with risk and required permissions.",
        target: "execution_preview",
        requiresApproval: true
      },
      {
        type: "user_approval",
        title: "User approval",
        description: "Block external edits, sends, deletes, CRM writes, and knowledge updates until approval.",
        target: "approval",
        requiresApproval: true
      },
      {
        type: "connector_execute",
        title: "Connector execute",
        description: "Execute only the approved connector action and record the result in execution history.",
        target: "connector",
        requiresApproval: true
      },
      {
        type: "execution_history",
        title: "Execution history",
        description: "Record API result, approval link, errors, and sync history.",
        target: "history",
        requiresApproval: false
      }
    );
  }

  if (/(자동화|workflow|automation|반복|自動化)/iu.test(normalized)) {
    steps.push({
      type: "workflow_prepare",
      title: "Workflow draft",
      description: "Prepare trigger, condition, action, approval, and execution history steps.",
      target: "automation",
      requiresApproval: true
    });
  }

  steps.push(
    {
      type: "draft",
      title: "Draft execution preview",
      description: "Prepare a reviewable preview instead of modifying data immediately.",
      target: "execution_preview",
      requiresApproval: true
    },
    {
      type: "approval",
      title: "Request user approval",
      description: "Do not change CRM, Knowledge, Automation, files, or connected apps until approval.",
      target: "approval",
      requiresApproval: true
    },
    {
      type: "memory_update",
      title: "Memory update",
      description: "After approval and execution, record useful outcomes for future agent behavior.",
      target: "memory",
      requiresApproval: true
    }
  );

  return steps.map((step, index) => ({
    ...step,
    id: makeId("step"),
    order: index + 1
  }));
}

function needsExternalAppPlan(goal: string) {
  return /(gmail|google\s*mail|메일|초안|calendar|캘린더|slack|슬랙|github|깃허브|notion|노션|firebase|파이어베이스|외부\s*앱|동기화|승인\s*대기|send|edit|update|delete|create)/iu.test(goal);
}

function inferRisk(goal: string, steps: ExecutionPlanStep[]): ExecutionRisk {
  if (/(계약|결제|송금|삭제|delete|send|발송|메일 보내|전송)/iu.test(goal)) return "high";
  if (steps.some((step) => step.requiresApproval)) return "medium";
  return "low";
}

function makeId(prefix: string) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}
