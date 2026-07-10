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
    id: "drive",
    label: "Google Drive",
    targetType: "app",
    url: "https://drive.google.com",
    commandPrefix: "Drive",
    description: "Connect Drive files and document context through approval-first Google OAuth."
  },
  {
    id: "gmail",
    label: "Gmail",
    targetType: "app",
    url: "https://mail.google.com",
    commandPrefix: "Gmail",
    description: "Connect email context, drafts, and approval-first message actions."
  },
  {
    id: "calendar",
    label: "Google Calendar",
    targetType: "app",
    url: "https://calendar.google.com",
    commandPrefix: "Calendar",
    description: "Connect schedule context and approval-first calendar actions."
  },
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
    id: "notion",
    label: "Notion",
    targetType: "app",
    url: "https://notion.so",
    commandPrefix: "Notion",
    description: "Connect Notion pages and workspace knowledge."
  },
  {
    id: "discord",
    label: "Discord",
    targetType: "app",
    url: "https://discord.com",
    commandPrefix: "Discord",
    description: "Connect Discord identity and optional server context."
  },
  {
    id: "firebase",
    label: "Firebase",
    targetType: "website",
    url: "https://firebase.google.com",
    commandPrefix: "Firebase",
    description: "Track Firebase project configuration and sync readiness."
  },
  {
    id: "browser",
    label: "Browser",
    targetType: "app",
    url: "https://www.google.com",
    commandPrefix: "Browser",
    description: "Connect browser research context and page summaries."
  },
  {
    id: "local-files",
    label: "Local Files",
    targetType: "app",
    url: "file://local-files",
    commandPrefix: "Files",
    description: "Connect local file search and approved file actions."
  },
  {
    id: "webhook",
    label: "Webhook",
    targetType: "app",
    url: "https://dreamwish.co.kr/api/webhooks",
    commandPrefix: "Webhook",
    description: "Connect incoming event automation through webhook triggers."
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
