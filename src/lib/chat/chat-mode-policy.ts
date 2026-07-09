export type ChatModeIntent = "ask" | "plan" | "agent";

export type IntegrationCommandApp = {
  commandPrefix: string;
};

export const CHAT_MODE_BEHAVIOR = {
  ask: {
    intent: "ask",
    title: "AI Answer",
    description: "Answers the question and shows connected context when useful."
  },
  plan: {
    intent: "plan",
    title: "Plan Preview",
    description: "Prepares a step-by-step plan without executing external changes."
  },
  agent: {
    intent: "agent",
    title: "Agent Execution Preview",
    description: "Builds an approval-first execution preview with permissions and risk."
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
  return /^(agent|에이전트|plan|계획|計画|エージェント)\s*[:：→-]/iu.test(message) ||
    isExternalServiceCommand(message);
}

export function isExternalServiceCommand(message: string) {
  return /(?:gmail|google\s*mail|메일\s*보내|초안\s*만들|calendar|캘린더|일정\s*(?:만들|수정|삭제)|slack|슬랙|github|깃허브|notion|노션|firebase|파이어베이스|외부\s*앱|승인\s*대기)/iu.test(
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
