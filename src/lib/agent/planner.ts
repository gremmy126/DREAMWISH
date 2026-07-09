import type { ExecutionPlan, ExecutionPlanStep, ExecutionRisk } from "./agent.types";

export async function planAgentExecution(request: string): Promise<ExecutionPlan> {
  const goal = request.trim() || "사용자 요청 처리";
  const steps = buildSteps(goal);

  return {
    id: makeId("plan"),
    goal,
    steps,
    risk: inferRisk(goal, steps),
    estimatedTime: `${Math.max(3, steps.length * 2)}분`,
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
      title: "CRM 검색",
      description: "고객, 회사, 연락처, 과거 활동, AI Memory를 조회합니다.",
      target: "crm",
      requiresApproval: false
    });
  }

  steps.push({
    type: "knowledge_search",
    title: "Knowledge 검색",
    description: "SecondBrain 문서와 최근 대화 맥락에서 근거를 찾습니다.",
    target: "knowledge",
    requiresApproval: false
  });

  if (/(프로젝트|project|파일|문서|견적)/iu.test(normalized)) {
    steps.push({
      type: "project_lookup",
      title: "관련 프로젝트 확인",
      description: "요청과 연결된 프로젝트, 파일, 결정 기록을 확인합니다.",
      target: "projects",
      requiresApproval: false
    });
  }

  if (/(회의|미팅|일정|calendar|예약|다음 주|내일|오늘)/iu.test(normalized)) {
    steps.push({
      type: "calendar_check",
      title: "일정 확인",
      description: "로컬 캘린더 구조에서 가능한 일정 후보를 만들고 충돌 가능성을 표시합니다.",
      target: "calendar",
      requiresApproval: false
    });
  }

  if (/(gmail|구글메일|메일|답장|calendar|캘린더|slack|슬랙|외부 데이터|동기화|승인 대기)/iu.test(normalized)) {
    steps.push(
      {
        type: "permission_check",
        title: "Permission Check",
        description: "Gmail, Google Calendar, Slack 권한과 OAuth 연결 상태를 확인합니다.",
        target: "integration_permission",
        requiresApproval: false
      },
      {
        type: "external_execution_preview",
        title: "Execution Preview",
        description: "읽을 데이터, 생성/수정/전송될 데이터, 위험도, 저장 위치를 미리보기로 만듭니다.",
        target: "execution_preview",
        requiresApproval: true
      },
      {
        type: "user_approval",
        title: "User Approval",
        description: "메일 발송, 초안 생성, 일정 생성/수정, Slack 전송, CRM/Knowledge 반영은 승인 전까지 차단합니다.",
        target: "approval",
        requiresApproval: true
      },
      {
        type: "connector_execute",
        title: "Connector Execute",
        description: "승인된 작업만 Connector가 실행하고, 읽기 작업은 최근 30일 범위로 제한합니다.",
        target: "connector",
        requiresApproval: true
      },
      {
        type: "execution_history",
        title: "Execution History",
        description: "외부 API 호출 결과, 승인 링크, 오류, Sync History를 기록합니다.",
        target: "history",
        requiresApproval: false
      }
    );
  }

  if (/(자동화|workflow|automation|반복)/iu.test(normalized)) {
    steps.push({
      type: "workflow_prepare",
      title: "Workflow 초안 생성",
      description: "Trigger, Condition, Action, Approval 흐름을 가진 자동화 초안을 준비합니다.",
      target: "automation",
      requiresApproval: true
    });
  }

  steps.push(
    {
      type: "draft",
      title: "실행 초안 작성",
      description: "AI가 바로 수정하지 않고 사용자가 검토할 수 있는 실행 미리보기를 작성합니다.",
      target: "execution_preview",
      requiresApproval: true
    },
    {
      type: "approval",
      title: "사용자 승인 요청",
      description: "CRM, Knowledge, Automation, 파일 변경은 승인 전까지 실행하지 않습니다.",
      target: "approval",
      requiresApproval: true
    },
    {
      type: "memory_update",
      title: "Memory 업데이트",
      description: "승인 후 실행 결과와 다음 행동을 Agent Memory에 기록합니다.",
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

function inferRisk(goal: string, steps: ExecutionPlanStep[]): ExecutionRisk {
  if (/(계약|결제|송금|삭제|발송|메일 보내|send)/iu.test(goal)) return "high";
  if (steps.some((step) => step.requiresApproval)) return "medium";
  return "low";
}

function makeId(prefix: string) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}
