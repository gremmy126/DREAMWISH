export type ChatModeIntent = "ask" | "plan" | "agent";

export type IntegrationCommandApp = {
  commandPrefix: string;
};

export const CHAT_MODE_BEHAVIOR = {
  ask: {
    intent: "ask",
    title: "AI Answer",
    description: "질문에 답하고 필요한 경우 근거와 연결된 맥락을 함께 표시합니다."
  },
  plan: {
    intent: "plan",
    title: "Plan Preview",
    description: "실행하지 않고 단계별 계획만 만듭니다."
  },
  agent: {
    intent: "agent",
    title: "Agent Execution Preview",
    description: "승인 전 실행 미리보기와 권한 단계를 만듭니다."
  }
} as const;

export function shouldRouteToAgentPreview(
  message: string,
  mode: ChatModeIntent,
  apps: IntegrationCommandApp[] = []
) {
  if (mode === "plan" || mode === "agent") return true;
  return isExplicitAgentPreviewCommand(message) || matchesIntegrationAppCommand(message, apps);
}

export function isExplicitAgentPreviewCommand(message: string) {
  return /^(agent|에이전트|plan|계획)\s*[:：-]/iu.test(message) || isExternalServiceCommand(message);
}

export function isExternalServiceCommand(message: string) {
  return /(?:Gmail|구글메일|메일\s*보내|답장\s*보내|Calendar|캘린더|Slack|슬랙|외부 데이터|동기화|승인 대기)/iu.test(
    message
  );
}

export function matchesIntegrationAppCommand(
  message: string,
  apps: IntegrationCommandApp[]
) {
  return apps.some((app) =>
    message.toLowerCase().startsWith(app.commandPrefix.toLowerCase())
  );
}
