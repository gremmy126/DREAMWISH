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
  return /^(agent|에이전트|plan|계획)\s*[:：>\-]/iu.test(message) ||
    isExternalServiceCommand(message);
}

export function isExternalServiceCommand(message: string) {
  return /(?:drive|google\s*drive|gmail|google\s*mail|calendar|slack|github|notion|discord|firebase|browser|local\s*files?|files?|webhook|메일|일정|캘린더|깃허브|노션|디스코드|파이어베이스|브라우저|파일|웹훅|자동화)/iu.test(
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
