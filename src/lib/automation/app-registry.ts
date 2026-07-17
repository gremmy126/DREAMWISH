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
  logoPath: string,
  color: string,
  help: string,
  oauthTarget?: AutomationOAuthTarget,
): AutomationAppDefinition => ({
  id,
  label,
  logoPath,
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
  logoPath: string,
  color: string,
  fields: AutomationCredentialField[],
  help: string,
  oauthTarget?: AutomationOAuthTarget,
): AutomationAppDefinition => {
  const credentialMode: AutomationAuthMode = fields.length > 1 ? "multi_field" : "token";
  return {
    id,
    label,
    logoPath,
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
  oauth("gmail", "Gmail", "/images/gmail.jpg", "#EA4335", "Google OAuth 계정 연결 · 운영자 Client ID/Secret 필요", { provider: "google", service: "gmail" }),
  oauth("google-sheets", "Google Sheets", "/images/googlesheet.png", "#0F9D58", "Google OAuth 계정 연결"),
  oauth("calendar", "Google Calendar", "/images/googlecalendar.png", "#4285F4", "Google OAuth 계정 연결", { provider: "google", service: "calendar" }),
  oauth("drive", "Google Drive", "/images/googledrive.png", "#F9AB00", "Google OAuth 계정 연결", { provider: "google", service: "drive" }),
  oauth("youtube", "YouTube", "/images/youtube.jpg", "#FF0000", "Google OAuth 계정 연결"),
  oauth("slack", "Slack", "/images/slack.png", "#4A154B", "Slack OAuth 계정 연결 · 운영자 Client ID/Secret/Signing Secret 필요", { provider: "slack", service: "slack" }),
  token("notion", "Notion", "/images/notion.png", "#111111", [field("integrationToken", "Integration Token")], "Notion Internal Integration에서 발급", { provider: "notion", service: "notion" }),
  token("github", "GitHub", "/images/github.png", "#181717", [field("personalAccessToken", "Fine-grained Personal Access Token")], "GitHub Settings > Developer settings에서 발급", { provider: "github", service: "github" }),
  token("discord", "Discord", "/images/discord.jpg", "#5865F2", [field("botToken", "Bot Token"), field("serverId", "Server ID", false), field("channelId", "Channel ID", false)], "Discord Developer Portal Bot 설정", { provider: "discord", service: "discord" }),
  token("telegram", "Telegram", "/images/telegram.jpg", "#26A5E4", [field("botToken", "Bot Token"), field("chatId", "Chat ID", false)], "BotFather에서 Bot Token 발급"),
  oauth("outlook", "Outlook", "/images/outlook.jpg", "#0078D4", "Microsoft OAuth · 운영자 Client ID/Secret/Tenant 필요"),
  oauth("microsoft-teams", "Microsoft Teams", "/images/microsoftteam.jpg", "#6264A7", "Microsoft OAuth · 운영자 Client ID/Secret/Tenant 필요"),
  oauth("onedrive", "OneDrive", "/images/onedrive.png", "#0078D4", "Microsoft OAuth · 운영자 Client ID/Secret/Tenant 필요"),
  oauth("dropbox", "Dropbox", "/images/dropbox.png", "#0061FF", "Dropbox OAuth · 운영자 App Key/Secret 필요"),
  token("airtable", "Airtable", "/images/airtable.jpg", "#18BFFF", [field("personalAccessToken", "Personal Access Token")], "Airtable Developer Hub에서 PAT 발급"),
  token("trello", "Trello", "/images/trello.png", "#0052CC", [field("apiKey", "API Key"), field("apiToken", "API Token")], "Trello Power-Ups Admin에서 Key와 Token 발급"),
  token("asana", "Asana", "/images/asana.png", "#F06A6A", [field("personalAccessToken", "Personal Access Token")], "Asana Developer Console에서 PAT 발급"),
  token("jira", "Jira", "/images/jira.png", "#0052CC", [field("siteUrl", "Site URL", false, "https://example.atlassian.net"), field("email", "Account Email", false), field("apiToken", "API Token")], "Atlassian 계정 보안에서 API Token 발급"),
  token("linear", "Linear", "/images/linear.jpg", "#5E6AD2", [field("personalApiKey", "Personal API Key")], "Linear Settings > API에서 발급"),
  token("hubspot", "HubSpot", "/images/hubspot.jpg", "#FF7A59", [field("privateAppToken", "Private App Access Token")], "HubSpot Private App에서 발급"),
  token("salesforce", "Salesforce", "/images/saleforce.png", "#00A1E0", [field("instanceUrl", "Instance URL", false), field("accessToken", "Access Token")], "Salesforce Connected App 토큰"),
  token("stripe", "Stripe", "/images/stripe.png", "#635BFF", [field("apiKey", "Restricted 또는 Secret API Key")], "Stripe Developers > API keys에서 Restricted Key 권장"),
  token("shopify", "Shopify", "/images/shopify.png", "#7AB55C", [field("storeDomain", "Store Domain", false, "store.myshopify.com"), field("adminAccessToken", "Admin API Access Token")], "Shopify Custom App Admin API 자격증명"),
  token("wordpress", "WordPress", "/images/wordpress.png", "#21759B", [field("siteUrl", "Site URL", false), field("username", "Username", false), field("applicationPassword", "Application Password")], "WordPress 사용자 프로필에서 Application Password 발급"),
  token("facebook", "Facebook", "/images/facebook.jpg", "#0866FF", [field("pageAccessToken", "Page Access Token"), field("pageId", "Page ID", false)], "Meta for Developers에서 Page Token 발급"),
  token("instagram", "Instagram", "/images/instagram.jpg", "#E4405F", [field("accessToken", "Access Token"), field("businessAccountId", "Instagram Business Account ID", false)], "Meta Graph API 토큰"),
  token("x", "X", "/images/x.png", "#111111", [field("apiKey", "API Key"), field("apiSecret", "API Secret"), field("accessToken", "Access Token"), field("accessTokenSecret", "Access Token Secret")], "X Developer Portal OAuth 1.0a 사용자 자격증명"),
  token("linkedin", "LinkedIn", "/images/linkedin.png", "#0A66C2", [field("accessToken", "OAuth Access Token"), field("personOrOrganizationId", "Person 또는 Organization ID", false)], "LinkedIn Developer App에서 토큰 발급"),
  token("openai", "OpenAI", "/images/openai.png", "#10A37F", [field("apiKey", "API Key")], "OpenAI Platform API Keys에서 발급")
];

const DREAMWISH_CRM_APP: AutomationAppDefinition = {
  id: "crm",
  label: "DREAMWISH CRM",
  logoPath: "/images/dreanwishcrm.png",
  color: "#ec4899",
  authType: "none",
  supportedAuthModes: [],
  verificationKind: null,
  credentialFields: [],
  help: "DREAMWISH 내부 CRM은 별도 연결 없이 사용합니다."
};

export const AUTOMATION_APP_DEFINITIONS: AutomationAppDefinition[] = [...AUTOMATION_APPS, DREAMWISH_CRM_APP];

export function getAutomationApp(appId: string) { return AUTOMATION_APP_DEFINITIONS.find((app) => app.id === appId) || null; }
