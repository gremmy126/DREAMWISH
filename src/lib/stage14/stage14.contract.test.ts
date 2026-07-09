import { CHAT_QUICK_ACTIONS } from "@/src/lib/chat/chat-ui-actions";
import {
  LANGUAGE_OPTIONS,
  getLanguageLabel,
  resolveLanguagePreference
} from "@/src/lib/settings/app-preferences";

type QuickActionId = (typeof CHAT_QUICK_ACTIONS)[number]["id"];

const noExternalSyncShortcut: Extract<QuickActionId, "external_sync"> extends never
  ? true
  : never = true;
const noAgentShortcut: Extract<QuickActionId, "agent"> extends never ? true : never = true;

const expectedLanguageOptions: readonly [
  { readonly value: "ko"; readonly label: "한국어"; readonly shortLabel: "한국어" },
  { readonly value: "en"; readonly label: "English"; readonly shortLabel: "English" },
  { readonly value: "ja"; readonly label: "日本語"; readonly shortLabel: "日本語" }
] = LANGUAGE_OPTIONS;

const topbarJapaneseLabel: "日本語" = getLanguageLabel(resolveLanguagePreference("ja").language);

void noExternalSyncShortcut;
void noAgentShortcut;
void expectedLanguageOptions;
void topbarJapaneseLabel;
