export type ExternalConnectionTarget = {
  id: string;
  label: string;
  targetType: "app" | "website";
  url: string;
  commandPrefix: string;
  description: string;
};

export type ExternalConnectionPlan = {
  targetId: string;
  targetType: ExternalConnectionTarget["targetType"];
  createdCapability: string;
  commandPrefix: string;
  previewOnly: boolean;
  steps: string[];
};

export const externalConnectionTargets: ExternalConnectionTarget[] = [
  {
    id: "github",
    label: "GitHub",
    targetType: "app",
    url: "https://github.com",
    commandPrefix: "GitHub",
    description: "Connect repository issues, pull requests, and code context."
  },
  {
    id: "slack",
    label: "Slack",
    targetType: "app",
    url: "https://slack.com",
    commandPrefix: "Slack",
    description: "Connect workspace messages and project decisions."
  },
  {
    id: "google-workspace",
    label: "Google Workspace",
    targetType: "app",
    url: "https://workspace.google.com",
    commandPrefix: "Google",
    description: "Connect Gmail and Calendar context through approval-first OAuth."
  },
  {
    id: "firebase",
    label: "Firebase",
    targetType: "website",
    url: "https://firebase.google.com",
    commandPrefix: "Firebase",
    description: "Track Firebase project configuration and sync readiness."
  }
];

export function buildExternalConnectionPlan(
  target: ExternalConnectionTarget
): ExternalConnectionPlan {
  return {
    targetId: target.id,
    targetType: target.targetType,
    createdCapability: `${target.label} context connector`,
    commandPrefix: target.commandPrefix,
    previewOnly: true,
    steps: [
      "Create a local connector setting for AI Chat commands.",
      "Use stored OAuth/API configuration only on the server.",
      "Show a preview before any write action.",
      "Record accepted connections in integration settings and history."
    ]
  };
}

export function findExternalConnectionTarget(id: string) {
  return externalConnectionTargets.find((target) => target.id === id) || null;
}
