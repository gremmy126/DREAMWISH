import { getErrorCode } from "../api/api-response";

export type ChatStatus =
  | "idle"
  | "submitting"
  | "searching-local"
  | "searching-web"
  | "generating"
  | "streaming"
  | "completed"
  | "error"
  | "cancelled";

export type ChatErrorLanguage = "ko" | "en" | "ja";

export function shouldSubmitChat(
  input: string,
  isSubmitting: boolean,
  isComposing: boolean
) {
  return input.trim().length > 0 && !isSubmitting && !isComposing;
}

export function getLocalizedChatError(
  code: string | null | undefined,
  language: ChatErrorLanguage
) {
  const key = normalizeChatErrorCode(code);
  return CHAT_ERROR_MESSAGES[language][key] ?? CHAT_ERROR_MESSAGES[language].TRY_AGAIN;
}

export function getChatErrorCode(error: unknown) {
  return normalizeChatErrorCode(getErrorCode(error));
}

function normalizeChatErrorCode(code: string | null | undefined): keyof typeof CHAT_ERROR_MESSAGES.en {
  switch (code) {
    case "EMPTY_REQUEST_BODY":
    case "QUERY_REQUIRED":
    case "MESSAGE_REQUIRED":
      return "MESSAGE_REQUIRED";
    case "INVALID_CONTENT_TYPE":
    case "INVALID_JSON":
    case "QUERY_TOO_LONG":
    case "MESSAGE_TOO_LONG":
      return "INVALID_REQUEST";
    case "LOCAL_SEARCH_FAILED":
      return "LOCAL_SEARCH_FAILED";
    case "WEB_SEARCH_FAILED":
      return "WEB_SEARCH_FAILED";
    case "GENERATION_FAILED":
    case "INTERNAL_SERVER_ERROR":
      return "GENERATION_FAILED";
    case "REQUEST_CANCELLED":
      return "REQUEST_CANCELLED";
    case "NETWORK_ERROR":
      return "NETWORK_ERROR";
    default:
      return "TRY_AGAIN";
  }
}

const CHAT_ERROR_MESSAGES = {
  ko: {
    MESSAGE_REQUIRED: "메시지를 입력해 주세요.",
    INVALID_REQUEST: "요청 형식이 올바르지 않습니다.",
    LOCAL_SEARCH_FAILED: "로컬 지식을 검색하지 못했습니다.",
    WEB_SEARCH_FAILED: "웹 검색에 실패했습니다.",
    GENERATION_FAILED: "답변을 생성하지 못했습니다.",
    REQUEST_CANCELLED: "요청이 취소되었습니다.",
    NETWORK_ERROR: "서버에 연결할 수 없습니다.",
    TRY_AGAIN: "잠시 후 다시 시도해 주세요."
  },
  en: {
    MESSAGE_REQUIRED: "Please enter a message.",
    INVALID_REQUEST: "The request format is invalid.",
    LOCAL_SEARCH_FAILED: "Failed to search local knowledge.",
    WEB_SEARCH_FAILED: "Web search failed.",
    GENERATION_FAILED: "Failed to generate a response.",
    REQUEST_CANCELLED: "The request was cancelled.",
    NETWORK_ERROR: "Unable to connect to the server.",
    TRY_AGAIN: "Please try again shortly."
  },
  ja: {
    MESSAGE_REQUIRED: "メッセージを入力してください。",
    INVALID_REQUEST: "リクエスト形式が正しくありません。",
    LOCAL_SEARCH_FAILED: "ローカルナレッジを検索できませんでした。",
    WEB_SEARCH_FAILED: "ウェブ検索に失敗しました。",
    GENERATION_FAILED: "回答を生成できませんでした。",
    REQUEST_CANCELLED: "リクエストがキャンセルされました。",
    NETWORK_ERROR: "サーバーに接続できません。",
    TRY_AGAIN: "しばらくしてからもう一度お試しください。"
  }
} as const;
