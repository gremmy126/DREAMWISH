import {
  APP_TRANSLATIONS,
  type AppLanguage,
  getChatQuickActionText,
  getNavLabel,
  t
} from "@/src/lib/i18n/translations";
import { getOAuthRedirectUri } from "@/src/lib/oauth/oauth-redirect";
import type { ConnectableOAuthProviderId } from "@/src/lib/oauth/oauth.types";
import type { KnowledgeNode } from "@/src/lib/network/network.types";

const languages: AppLanguage[] = ["ko", "en", "ja"];
const providers: ConnectableOAuthProviderId[] = [
  "google",
  "slack",
  "github",
  "notion",
  "discord"
];
const chatNode = {
  id: "chat:message",
  label: "Conversation",
  type: "chat"
} satisfies KnowledgeNode;

function assertStage16Contracts() {
  for (const language of languages) {
    APP_TRANSLATIONS[language].common.logout satisfies string;
    getNavLabel("integrations", language) satisfies string;
    getChatQuickActionText("todo", language).label satisfies string;
    t(language, "chat.actions.title") satisfies string;
  }

  for (const provider of providers) {
    getOAuthRedirectUri(provider, "http://localhost:3100/api/integrations/test/connect") satisfies string;
  }

  chatNode.type satisfies "chat";
}

void assertStage16Contracts;
