export type AutomationCredentialField = { id: string; label: string; secret: boolean; required: boolean; placeholder?: string; help?: string };
export type AutomationAuthMode = "oauth" | "api_key" | "token" | "multi_field";
export type AutomationOAuthTarget = { provider: string; service: string };
export type AutomationAppDefinition = {
  id: string; label: string; logoPath: string; color: string;
  authType: "none" | "oauth" | "api_key" | "token" | "multi_field";
  supportedAuthModes: AutomationAuthMode[];
  oauthTarget?: AutomationOAuthTarget;
  verificationKind: string | null;
  credentialFields: AutomationCredentialField[];
  help: string;
};

const field = (id: string, label: string, secret = true, placeholder = ""): AutomationCredentialField => ({ id, label, secret, required: true, placeholder });
const oauth = (
  id: string,
  label: string,
  color: string,
  help: string,
  oauthTarget?: AutomationOAuthTarget,
): AutomationAppDefinition => ({
  id,
  label,
  logoPath: `/automation-icons/${id}.svg`,
  color,
  authType: "oauth",
  supportedAuthModes: ["oauth"],
  ...(oauthTarget ? { oauthTarget } : {}),
  verificationKind: null,
  credentialFields: [],
  help,
});
const token = (
  id: string,
  label: string,
  color: string,
  fields: AutomationCredentialField[],
  help: string,
  oauthTarget?: AutomationOAuthTarget,
): AutomationAppDefinition => {
  const credentialMode: AutomationAuthMode = fields.length > 1 ? "multi_field" : "token";
  return {
    id,
    label,
    logoPath: `/automation-icons/${id}.svg`,
    color,
    authType: credentialMode,
    supportedAuthModes: oauthTarget ? ["oauth", credentialMode] : [credentialMode],
    ...(oauthTarget ? { oauthTarget } : {}),
    verificationKind: id,
    credentialFields: fields,
    help,
  };
};

export const AUTOMATION_APPS: AutomationAppDefinition[] = [
  oauth("gmail", "Gmail", "#EA4335", "Google OAuth 계정 연결 · 운영자 Client ID/Secret 필요", { provider: "google", service: "gmail" }),
  oauth("google-sheets", "Google Sheets", "#0F9D58", "Google OAuth 계정 연결"),
  oauth("calendar", "Google Calendar", "#4285F4", "Google OAuth 계정 연결", { provider: "google", service: "calendar" }),
  oauth("drive", "Google Drive", "#F9AB00", "Google OAuth 계정 연결", { provider: "google", service: "drive" }),
  oauth("youtube", "YouTube", "#FF0000", "Google OAuth 계정 연결"),
  oauth("slack", "Slack", "#4A154B", "Slack OAuth 계정 연결 · 운영자 Client ID/Secret/Signing Secret 필요", { provider: "slack", service: "slack" }),
  token("notion", "Notion", "#111111", [field("integrationToken", "Integration Token")], "Notion Internal Integration에서 발급", { provider: "notion", service: "notion" }),
  token("github", "GitHub", "#181717", [field("personalAccessToken", "Fine-grained Personal Access Token")], "GitHub Settings > Developer settings에서 발급", { provider: "github", service: "github" }),
  token("discord", "Discord", "#5865F2", [field("botToken", "Bot Token"), field("serverId", "Server ID", false), field("channelId", "Channel ID", false)], "Discord Developer Portal Bot 설정", { provider: "discord", service: "discord" }),
  token("telegram", "Telegram", "#26A5E4", [field("botToken", "Bot Token"), field("chatId", "Chat ID", false)], "BotFather에서 Bot Token 발급"),
  oauth("outlook", "Outlook", "#0078D4", "Microsoft OAuth · 운영자 Client ID/Secret/Tenant 필요"),
  oauth("microsoft-teams", "Microsoft Teams", "#6264A7", "Microsoft OAuth · 운영자 Client ID/Secret/Tenant 필요"),
  oauth("onedrive", "OneDrive", "#0078D4", "Microsoft OAuth · 운영자 Client ID/Secret/Tenant 필요"),
  oauth("dropbox", "Dropbox", "#0061FF", "Dropbox OAuth · 운영자 App Key/Secret 필요"),
  token("airtable", "Airtable", "#18BFFF", [field("personalAccessToken", "Personal Access Token")], "Airtable Developer Hub에서 PAT 발급"),
  token("trello", "Trello", "#0052CC", [field("apiKey", "API Key"), field("apiToken", "API Token")], "Trello Power-Ups Admin에서 Key와 Token 발급"),
  token("asana", "Asana", "#F06A6A", [field("personalAccessToken", "Personal Access Token")], "Asana Developer Console에서 PAT 발급"),
  token("jira", "Jira", "#0052CC", [field("siteUrl", "Site URL", false, "https://example.atlassian.net"), field("email", "Account Email", false), field("apiToken", "API Token")], "Atlassian 계정 보안에서 API Token 발급"),
  token("linear", "Linear", "#5E6AD2", [field("personalApiKey", "Personal API Key")], "Linear Settings > API에서 발급"),
  token("hubspot", "HubSpot", "#FF7A59", [field("privateAppToken", "Private App Access Token")], "HubSpot Private App에서 발급"),
  token("salesforce", "Salesforce", "#00A1E0", [field("instanceUrl", "Instance URL", false), field("accessToken", "Access Token")], "Salesforce Connected App 토큰"),
  token("stripe", "Stripe", "#635BFF", [field("apiKey", "Restricted 또는 Secret API Key")], "Stripe Developers > API keys에서 Restricted Key 권장"),
  token("shopify", "Shopify", "#7AB55C", [field("storeDomain", "Store Domain", false, "store.myshopify.com"), field("adminAccessToken", "Admin API Access Token")], "Shopify Custom App Admin API 자격증명"),
  token("wordpress", "WordPress", "#21759B", [field("siteUrl", "Site URL", false), field("username", "Username", false), field("applicationPassword", "Application Password")], "WordPress 사용자 프로필에서 Application Password 발급"),
  token("facebook", "Facebook", "#0866FF", [field("pageAccessToken", "Page Access Token"), field("pageId", "Page ID", false)], "Meta for Developers에서 Page Token 발급"),
  token("instagram", "Instagram", "#E4405F", [field("accessToken", "Access Token"), field("businessAccountId", "Instagram Business Account ID", false)], "Meta Graph API 토큰"),
  token("x", "X", "#111111", [field("apiKey", "API Key"), field("apiSecret", "API Secret"), field("accessToken", "Access Token"), field("accessTokenSecret", "Access Token Secret")], "X Developer Portal OAuth 1.0a 사용자 자격증명"),
  token("linkedin", "LinkedIn", "#0A66C2", [field("accessToken", "OAuth Access Token"), field("personOrOrganizationId", "Person 또는 Organization ID", false)], "LinkedIn Developer App에서 토큰 발급"),
  token("openai", "OpenAI", "#10A37F", [field("apiKey", "API Key")], "OpenAI Platform API Keys에서 발급")
];

export function getAutomationApp(appId: string) { return AUTOMATION_APPS.find((app) => app.id === appId) || null; }
