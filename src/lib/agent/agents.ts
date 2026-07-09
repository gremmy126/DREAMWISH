import type { Agent, ApprovalRequest, ExecutionPlan, ExecutionResult } from "./agent.types";
import { executeApprovedPlan } from "./executor";
import { learnFromExecution } from "./learning";
import { planAgentExecution } from "./planner";

type AgentDefinition = Pick<Agent, "name" | "description" | "canHandle">;

const definitions: AgentDefinition[] = [
  {
    name: "Sales Agent",
    description: "고객, 견적, 계약, 다음 행동 추천을 담당합니다.",
    canHandle: (input) => /(고객|견적|계약|영업|deal|sales)/iu.test(input)
  },
  {
    name: "Marketing Agent",
    description: "캠페인, 콘텐츠, 리드 nurturing 계획을 담당합니다.",
    canHandle: (input) => /(마케팅|캠페인|콘텐츠|lead)/iu.test(input)
  },
  {
    name: "Support Agent",
    description: "문의, 이슈, 지원 기록을 구조화합니다.",
    canHandle: (input) => /(지원|문의|이슈|support)/iu.test(input)
  },
  {
    name: "Customer Success Agent",
    description: "고객 상태, 리스크, 유지 전략을 관리합니다.",
    canHandle: (input) => /(성공|리스크|온보딩|customer success)/iu.test(input)
  },
  {
    name: "Knowledge Agent",
    description: "SecondBrain 문서, 연결 맥락, 관련 자료를 찾습니다.",
    canHandle: (input) => /(문서|지식|검색|맥락|knowledge)/iu.test(input)
  },
  {
    name: "Calendar Agent",
    description: "회의와 일정 후보를 계획합니다.",
    canHandle: (input) => /(회의|미팅|일정|예약|calendar)/iu.test(input)
  },
  {
    name: "Email Agent",
    description: "메일 초안을 작성하지만 실제 발송은 하지 않습니다.",
    canHandle: (input) => /(메일|email|발송)/iu.test(input)
  },
  {
    name: "Analytics Agent",
    description: "활동량과 AI 사용 현황을 분석합니다.",
    canHandle: (input) => /(분석|리포트|통계|analytics)/iu.test(input)
  },
  {
    name: "Finance Agent",
    description: "계약, 결제, 청구 관련 초안을 정리합니다.",
    canHandle: (input) => /(결제|청구|인보이스|finance)/iu.test(input)
  },
  {
    name: "Meeting Agent",
    description: "회의록, 결정, 후속 작업을 정리합니다.",
    canHandle: (input) => /(회의록|미팅|결정|follow up)/iu.test(input)
  }
];

export const agentCatalog = definitions.map((definition) => createAgent(definition));

function createAgent(definition: AgentDefinition): Agent {
  return {
    ...definition,
    plan: planAgentExecution,
    execute(plan: ExecutionPlan, approval: ApprovalRequest): Promise<ExecutionResult> {
      return executeApprovedPlan(plan, approval);
    },
    learn: learnFromExecution
  };
}
