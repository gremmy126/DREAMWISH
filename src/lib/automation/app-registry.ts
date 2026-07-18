export type AutomationCredentialField = { id: string; label: string; secret: boolean; required: boolean; placeholder?: string; help?: string };
export type AutomationAuthMode = "oauth" | "api_key" | "token" | "multi_field";
export type AutomationOAuthTarget = { provider: string; service: string };

export type OAuthClientFieldDefinition = {
  id: "clientId" | "clientSecret";
  label: string;
  secret: boolean;
  required: true;
  help: string;
};

export type IntegrationConnectionGuide = {
  officialSetupUrl: string;
  redirectPath: string;
  steps: string[];
  scopeHelp: string;
};

export type AutomationAppDefinition = {
  id: string; label: string; logoPath: string; color: string;
  authType: "none" | "oauth" | "api_key" | "token" | "multi_field";
  supportedAuthModes: AutomationAuthMode[];
  oauthTarget?: AutomationOAuthTarget;
  oauthClientFields: OAuthClientFieldDefinition[];
  connectionGuide: IntegrationConnectionGuide;
  verificationKind: string | null;
  credentialFields: AutomationCredentialField[];
  help: string;
};

const OAUTH_REDIRECT_PATHS: Record<string, string> = {
  google: "/api/integrations/google/callback",
  slack: "/api/integrations/slack/callback",
  github: "/api/integrations/github/callback",
  notion: "/api/integrations/notion/callback",
  discord: "/api/integrations/discord/callback",
  microsoft: "/api/integrations/microsoft/callback",
  dropbox: "/api/integrations/dropbox/callback"
};

const OAUTH_SETUP_URLS: Record<string, string> = {
  google: "https://console.cloud.google.com/apis/credentials",
  slack: "https://api.slack.com/apps",
  github: "https://github.com/settings/developers",
  notion: "https://www.notion.so/my-integrations",
  discord: "https://discord.com/developers/applications",
  microsoft: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  dropbox: "https://www.dropbox.com/developers/apps"
};

const OAUTH_PROVIDER_LABELS: Record<string, string> = {
  google: "Google Cloud Console",
  slack: "Slack API 대시보드",
  github: "GitHub Developer settings",
  notion: "Notion Integrations",
  discord: "Discord Developer Portal",
  microsoft: "Microsoft Entra 관리 센터",
  dropbox: "Dropbox App Console"
};

export const STANDARD_OAUTH_CLIENT_FIELDS: OAuthClientFieldDefinition[] = [
  {
    id: "clientId",
    label: "Client ID",
    secret: false,
    required: true,
    help: "공급자 개발자 콘솔에서 만든 앱의 Client ID입니다."
  },
  {
    id: "clientSecret",
    label: "Client Secret",
    secret: true,
    required: true,
    help: "공급자 개발자 콘솔에서 발급한 Client Secret입니다. 암호화되어 저장되며 다시 표시되지 않습니다."
  }
];

function oauthGuide(provider: string, appLabel: string, scopeHelp: string): IntegrationConnectionGuide {
  const consoleLabel = OAUTH_PROVIDER_LABELS[provider] || "공급자 개발자 콘솔";
  return {
    officialSetupUrl: OAUTH_SETUP_URLS[provider] || "https://developers.google.com",
    redirectPath: OAUTH_REDIRECT_PATHS[provider] || "/api/integrations/callback",
    steps: [
      `${consoleLabel}에서 새 OAuth 앱을 만듭니다.`,
      `앱의 Redirect URI(Callback URL)에 아래 표시된 DREAMWISH 주소를 정확히 등록합니다.`,
      `발급된 Client ID와 Client Secret을 이 화면에 입력하고 저장합니다.`,
      `${appLabel} 연결 버튼을 눌러 계정 인증을 완료합니다.`
    ],
    scopeHelp
  };
}

function credentialGuide(setupUrl: string, steps: string[]): IntegrationConnectionGuide {
  return {
    officialSetupUrl: setupUrl,
    redirectPath: "",
    steps,
    scopeHelp: "발급 화면에서 필요한 권한 범위를 선택한 뒤 값을 붙여넣으세요."
  };
}

const field = (id: string, label: string, secret = true, placeholder = ""): AutomationCredentialField => ({ id, label, secret, required: true, placeholder });

const oauth = (
  id: string,
  label: string,
  logoPath: string,
  color: string,
  help: string,
  oauthTarget: AutomationOAuthTarget,
  scopeHelp: string
): AutomationAppDefinition => ({
  id,
  label,
  logoPath,
  color,
  authType: "oauth",
  supportedAuthModes: ["oauth"],
  oauthTarget,
  oauthClientFields: STANDARD_OAUTH_CLIENT_FIELDS,
  connectionGuide: oauthGuide(oauthTarget.provider, label, scopeHelp),
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
  setup: { url: string; steps: string[] },
  oauthTarget?: AutomationOAuthTarget,
  scopeHelp?: string
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
    oauthClientFields: oauthTarget ? STANDARD_OAUTH_CLIENT_FIELDS : [],
    connectionGuide: oauthTarget
      ? oauthGuide(oauthTarget.provider, label, scopeHelp || "연결 시 필요한 권한 범위가 자동으로 요청됩니다.")
      : credentialGuide(setup.url, setup.steps),
    verificationKind: id,
    credentialFields: fields,
    help,
  };
};

export const AUTOMATION_APPS: AutomationAppDefinition[] = [
  oauth("gmail", "Gmail", "/images/gmail.jpg", "#EA4335", "사용자 소유 Google OAuth 앱으로 연결", { provider: "google", service: "gmail" }, "Gmail 읽기·작성·전송 Scope를 요청합니다."),
  token("google-sheets", "Google Sheets", "/images/googlesheet.png", "#0F9D58", [field("serviceAccountJson", "Service Account JSON")], "Google OAuth 또는 공유한 시트에 접근 가능한 Service Account JSON", { url: "https://console.cloud.google.com/iam-admin/serviceaccounts", steps: ["Google Cloud Console에서 Service Account를 만듭니다.", "JSON 키를 발급받아 안전하게 보관합니다.", "대상 시트를 Service Account 이메일과 공유합니다.", "JSON 전체를 붙여넣어 저장합니다."] }, { provider: "google", service: "sheets" }, "Google Sheets 읽기/쓰기 Scope를 요청합니다."),
  oauth("calendar", "Google Calendar", "/images/googlecalendar.png", "#4285F4", "사용자 소유 Google OAuth 앱으로 연결", { provider: "google", service: "calendar" }, "Calendar 읽기·일정 쓰기 Scope를 요청합니다."),
  oauth("drive", "Google Drive", "/images/googledrive.png", "#F9AB00", "사용자 소유 Google OAuth 앱으로 연결", { provider: "google", service: "drive" }, "앱이 만든 Drive 파일에 접근하는 Scope를 요청합니다."),
  oauth("youtube", "YouTube", "/images/youtube.jpg", "#FF0000", "사용자 소유 Google OAuth 앱으로 연결", { provider: "google", service: "youtube" }, "YouTube 관리·업로드 Scope를 요청합니다."),
  oauth("slack", "Slack", "/images/slack.png", "#4A154B", "사용자 소유 Slack 앱으로 연결", { provider: "slack", service: "slack" }, "채널 읽기와 메시지 전송 Scope를 요청합니다."),
  token("notion", "Notion", "/images/notion.png", "#111111", [field("integrationToken", "Integration Token")], "Notion Internal Integration에서 발급", { url: "https://www.notion.so/my-integrations", steps: ["Notion Integrations에서 Internal Integration을 만듭니다.", "Integration Token을 복사합니다.", "연결할 페이지에 Integration을 초대합니다.", "토큰을 붙여넣어 저장합니다."] }, { provider: "notion", service: "notion" }),
  token("github", "GitHub", "/images/github.png", "#181717", [field("personalAccessToken", "Fine-grained Personal Access Token")], "GitHub Settings > Developer settings에서 발급", { url: "https://github.com/settings/personal-access-tokens", steps: ["GitHub Developer settings에서 Fine-grained PAT을 만듭니다.", "필요한 저장소와 권한만 선택합니다.", "토큰을 붙여넣어 저장합니다."] }, { provider: "github", service: "github" }),
  token("discord", "Discord", "/images/discord.jpg", "#5865F2", [field("botToken", "Bot Token"), field("serverId", "Server ID", false), field("channelId", "Channel ID", false)], "Discord Developer Portal Bot 설정", { url: "https://discord.com/developers/applications", steps: ["Discord Developer Portal에서 앱과 Bot을 만듭니다.", "Bot Token을 발급받습니다.", "Bot을 서버에 초대하고 권한을 부여합니다.", "토큰과 서버/채널 ID를 입력해 저장합니다."] }, { provider: "discord", service: "discord" }),
  token("telegram", "Telegram", "/images/telegram.jpg", "#26A5E4", [field("botToken", "Bot Token"), field("chatId", "Chat ID", false)], "BotFather에서 Bot Token 발급", { url: "https://core.telegram.org/bots#botfather", steps: ["텔레그램에서 BotFather로 봇을 만듭니다.", "발급된 Bot Token을 복사합니다.", "봇을 대상 채팅에 초대하고 Chat ID를 확인합니다.", "값을 입력해 저장합니다."] }),
  oauth("outlook", "Outlook", "/images/outlook.jpg", "#0078D4", "사용자 소유 Microsoft 앱 등록으로 연결", { provider: "microsoft", service: "outlook" }, "메일 읽기·전송과 일정 Scope를 요청합니다."),
  oauth("microsoft-teams", "Microsoft Teams", "/images/microsoftteam.jpg", "#6264A7", "사용자 소유 Microsoft 앱 등록으로 연결", { provider: "microsoft", service: "microsoft-teams" }, "채널·채팅 메시지 전송 Scope를 요청합니다."),
  oauth("onedrive", "OneDrive", "/images/onedrive.png", "#0078D4", "사용자 소유 Microsoft 앱 등록으로 연결", { provider: "microsoft", service: "onedrive" }, "파일 읽기/쓰기 Scope를 요청합니다."),
  oauth("dropbox", "Dropbox", "/images/dropbox.png", "#0061FF", "사용자 소유 Dropbox 앱으로 연결", { provider: "dropbox", service: "dropbox" }, "파일 읽기/쓰기와 공유 Scope를 요청합니다."),
  token("airtable", "Airtable", "/images/airtable.jpg", "#18BFFF", [field("personalAccessToken", "Personal Access Token")], "Airtable Developer Hub에서 PAT 발급", { url: "https://airtable.com/create/tokens", steps: ["Airtable Builder Hub에서 Personal Access Token을 만듭니다.", "필요한 Base와 Scope만 선택합니다.", "토큰을 붙여넣어 저장합니다."] }),
  token("trello", "Trello", "/images/trello.png", "#0052CC", [field("apiKey", "API Key"), field("apiToken", "API Token")], "Trello Power-Ups Admin에서 Key와 Token 발급", { url: "https://trello.com/power-ups/admin", steps: ["Trello Power-Ups Admin에서 API Key를 만듭니다.", "API Key로 사용자 Token을 발급합니다.", "두 값을 입력해 저장합니다."] }),
  token("asana", "Asana", "/images/asana.png", "#F06A6A", [field("personalAccessToken", "Personal Access Token")], "Asana Developer Console에서 PAT 발급", { url: "https://app.asana.com/0/my-apps", steps: ["Asana Developer Console에서 PAT을 만듭니다.", "토큰을 복사해 붙여넣습니다.", "저장 후 연결 상태를 확인합니다."] }),
  token("jira", "Jira", "/images/jira.png", "#0052CC", [field("siteUrl", "Site URL", false, "https://example.atlassian.net"), field("email", "Account Email", false), field("apiToken", "API Token")], "Atlassian 계정 보안에서 API Token 발급", { url: "https://id.atlassian.com/manage-profile/security/api-tokens", steps: ["Atlassian 계정 보안에서 API Token을 만듭니다.", "사이트 URL과 계정 이메일을 확인합니다.", "세 값을 입력해 저장합니다."] }),
  token("linear", "Linear", "/images/linear.jpg", "#5E6AD2", [field("personalApiKey", "Personal API Key")], "Linear Settings > API에서 발급", { url: "https://linear.app/settings/api", steps: ["Linear Settings > API에서 Personal API Key를 만듭니다.", "키를 복사해 붙여넣습니다.", "저장 후 연결 상태를 확인합니다."] }),
  token("hubspot", "HubSpot", "/images/hubspot.jpg", "#FF7A59", [field("privateAppToken", "Private App Access Token")], "HubSpot Private App에서 발급", { url: "https://developers.hubspot.com/docs/api/private-apps", steps: ["HubSpot 설정에서 Private App을 만듭니다.", "필요한 CRM Scope를 선택합니다.", "Access Token을 붙여넣어 저장합니다."] }),
  token("salesforce", "Salesforce", "/images/saleforce.png", "#00A1E0", [field("instanceUrl", "Instance URL", false), field("accessToken", "Access Token")], "Salesforce Connected App 토큰", { url: "https://help.salesforce.com/s/articleView?id=sf.connected_app_overview.htm", steps: ["Salesforce에서 Connected App을 구성합니다.", "Instance URL을 확인합니다.", "Access Token을 발급해 붙여넣습니다."] }),
  token("stripe", "Stripe", "/images/stripe.png", "#635BFF", [field("apiKey", "Restricted 또는 Secret API Key")], "Stripe Developers > API keys에서 Restricted Key 권장", { url: "https://dashboard.stripe.com/apikeys", steps: ["Stripe 대시보드 API Keys에서 Restricted Key를 만듭니다.", "필요한 권한만 부여합니다.", "키를 붙여넣어 저장합니다."] }),
  token("shopify", "Shopify", "/images/shopify.png", "#7AB55C", [field("storeDomain", "Store Domain", false, "store.myshopify.com"), field("adminAccessToken", "Admin API Access Token")], "Shopify Custom App Admin API 자격증명", { url: "https://help.shopify.com/en/manual/apps/app-types/custom-apps", steps: ["Shopify 관리자에서 Custom App을 만듭니다.", "Admin API Scope를 구성합니다.", "Access Token과 스토어 도메인을 입력합니다."] }),
  token("wordpress", "WordPress", "/images/wordpress.png", "#21759B", [field("siteUrl", "Site URL", false), field("username", "Username", false), field("applicationPassword", "Application Password")], "WordPress 사용자 프로필에서 Application Password 발급", { url: "https://wordpress.org/documentation/article/application-passwords/", steps: ["WordPress 프로필에서 Application Password를 만듭니다.", "사이트 URL과 사용자 이름을 확인합니다.", "세 값을 입력해 저장합니다."] }),
  token("facebook", "Facebook", "/images/facebook.jpg", "#0866FF", [field("pageAccessToken", "Page Access Token"), field("pageId", "Page ID", false)], "Meta for Developers에서 Page Token 발급", { url: "https://developers.facebook.com/apps", steps: ["Meta for Developers에서 앱을 만듭니다.", "페이지 권한을 부여하고 Page Access Token을 발급합니다.", "토큰과 Page ID를 입력합니다."] }),
  token("instagram", "Instagram", "/images/instagram.jpg", "#E4405F", [field("accessToken", "Access Token"), field("businessAccountId", "Instagram Business Account ID", false)], "Meta Graph API 토큰", { url: "https://developers.facebook.com/docs/instagram-platform", steps: ["Meta for Developers에서 Instagram Graph API 앱을 구성합니다.", "비즈니스 계정을 연결합니다.", "Access Token과 계정 ID를 입력합니다."] }),
  token("x", "X", "/images/x.png", "#111111", [field("apiKey", "API Key"), field("apiSecret", "API Secret"), field("accessToken", "Access Token"), field("accessTokenSecret", "Access Token Secret")], "X Developer Portal OAuth 1.0a 사용자 자격증명", { url: "https://developer.x.com/en/portal/dashboard", steps: ["X Developer Portal에서 앱을 만듭니다.", "OAuth 1.0a 사용자 자격증명 4종을 발급합니다.", "네 값을 입력해 저장합니다."] }),
  token("linkedin", "LinkedIn", "/images/linkedin.png", "#0A66C2", [field("accessToken", "OAuth Access Token"), field("personOrOrganizationId", "Person 또는 Organization ID", false)], "LinkedIn Developer App에서 토큰 발급", { url: "https://www.linkedin.com/developers/apps", steps: ["LinkedIn Developers에서 앱을 만듭니다.", "필요한 제품 권한을 신청합니다.", "Access Token과 대상 ID를 입력합니다."] }),
  token("openai", "OpenAI", "/images/openai.png", "#10A37F", [field("apiKey", "API Key")], "OpenAI Platform API Keys에서 발급", { url: "https://platform.openai.com/api-keys", steps: ["OpenAI Platform에서 API Key를 만듭니다.", "키를 붙여넣어 저장합니다.", "저장 후 연결 상태를 확인합니다."] })
];

const DREAMWISH_CRM_APP: AutomationAppDefinition = {
  id: "crm",
  label: "DREAMWISH CRM",
  logoPath: "/images/dreanwishcrm.png",
  color: "#ec4899",
  authType: "none",
  supportedAuthModes: [],
  oauthClientFields: [],
  connectionGuide: {
    officialSetupUrl: "https://dreamwish.co.kr",
    redirectPath: "",
    steps: ["DREAMWISH 내부 CRM은 별도 연결 없이 바로 사용합니다."],
    scopeHelp: "내부 데이터는 로그인한 소유자 범위에서만 접근합니다."
  },
  verificationKind: null,
  credentialFields: [],
  help: "DREAMWISH 내부 CRM은 별도 연결 없이 사용합니다."
};

export const AUTOMATION_APP_DEFINITIONS: AutomationAppDefinition[] = [...AUTOMATION_APPS, DREAMWISH_CRM_APP];

export function getAutomationApp(appId: string) { return AUTOMATION_APP_DEFINITIONS.find((app) => app.id === appId) || null; }
