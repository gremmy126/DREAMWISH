import {
  ADMIN_EMAIL,
  buildAccessState,
  isAdminEmail,
  normalizeEmail,
  stringifyUnknownError
} from "@/src/lib/auth/access-control";
import { CHAT_MODE_BEHAVIOR, shouldRouteToAgentPreview } from "@/src/lib/chat/chat-mode-policy";
import { buildRelevantContextPayload } from "@/src/lib/context/relevance";
import { SIDEBAR_LANGUAGE_OPTIONS } from "@/src/lib/settings/sidebar-language";

const adminEmail: typeof ADMIN_EMAIL = "kara111131@naver.com";
const normalizedAdmin: "kara111131@naver.com" = normalizeEmail(" Kara111131@Naver.com ");
const adminCheck: true = isAdminEmail(adminEmail);
const adminAccess: true = buildAccessState({ email: adminEmail, paid: false }).canUseApp;
const unpaidUserAccess: true = buildAccessState({ email: "user@example.com", paid: false }).canUseApp;
const paidUserAccess: true = buildAccessState({ email: "user@example.com", paid: true }).canUseApp;
const eventError: "로그인 처리 중 오류가 발생했습니다." = stringifyUnknownError(new Event("error"));

const sidebarLanguages: readonly [
  { readonly value: "ko"; readonly label: "한국어"; readonly shortLabel: "한국어" },
  { readonly value: "en"; readonly label: "English"; readonly shortLabel: "English" },
  { readonly value: "ja"; readonly label: "日本語"; readonly shortLabel: "日本語" }
] = SIDEBAR_LANGUAGE_OPTIONS;

const askDoesNotAutoAgent: boolean = shouldRouteToAgentPreview("고객 CRM 상태 알려줘", "ask");
const planDoesPlan: "plan" = CHAT_MODE_BEHAVIOR.plan.intent;
const agentDoesAgent: "agent" = CHAT_MODE_BEHAVIOR.agent.intent;

const emptyContext = buildRelevantContextPayload({
  query: "AI비서 대시보드 방향",
  results: [],
  conversationMatches: [],
  webResults: [],
  suggestions: [],
  network: { nodes: [], edges: [] }
});
const noIrrelevantSuggestions: [] = emptyContext.suggestions as [];

void normalizedAdmin;
void adminCheck;
void adminAccess;
void unpaidUserAccess;
void paidUserAccess;
void eventError;
void sidebarLanguages;
void askDoesNotAutoAgent;
void planDoesPlan;
void agentDoesAgent;
void noIrrelevantSuggestions;
