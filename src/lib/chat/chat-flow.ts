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
    case "EMPTY_MESSAGE":
    case "EMPTY_REQUEST_BODY":
    case "QUERY_REQUIRED":
    case "MESSAGE_REQUIRED":
      return "MESSAGE_REQUIRED";
    case "INVALID_CONTENT_TYPE":
    case "INVALID_JSON":
    case "QUERY_TOO_LONG":
    case "MESSAGE_TOO_LONG":
    case "INVALID_REQUEST":
      return "INVALID_REQUEST";
    case "LOCAL_SEARCH_FAILED":
    case "RETRIEVAL_ERROR":
      return "LOCAL_SEARCH_FAILED";
    case "WEB_SEARCH_FAILED":
      return "WEB_SEARCH_FAILED";
    case "PROVIDER_NOT_CONFIGURED":
      return "PROVIDER_NOT_CONFIGURED";
    case "PROVIDER_AUTH_ERROR":
    case "UNAUTHORIZED":
      return "PROVIDER_AUTH_ERROR";
    case "PROVIDER_RATE_LIMIT":
      return "PROVIDER_RATE_LIMIT";
    case "PROVIDER_TIMEOUT":
      return "PROVIDER_TIMEOUT";
    case "MODEL_NOT_FOUND":
      return "MODEL_NOT_FOUND";
    case "MODEL_RESPONSE_EMPTY":
      return "MODEL_RESPONSE_EMPTY";
    case "DATABASE_ERROR":
    case "GENERATION_FAILED":
    case "INTERNAL_ERROR":
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
    PROVIDER_NOT_CONFIGURED: "연결된 AI 제공자가 없습니다. 설정에서 API 키를 연결해 주세요.",
    PROVIDER_AUTH_ERROR: "AI 제공자 인증에 실패했습니다. API 키 또는 Firebase 로그인을 확인해 주세요.",
    PROVIDER_RATE_LIMIT: "AI 제공자의 사용량 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.",
    PROVIDER_TIMEOUT: "AI 제공자 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
    MODEL_NOT_FOUND: "선택한 AI 모델을 찾을 수 없습니다. 모델 설정을 확인해 주세요.",
    MODEL_RESPONSE_EMPTY: "AI 제공자가 빈 응답을 반환했습니다. 다시 시도해 주세요.",
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
    PROVIDER_NOT_CONFIGURED: "No AI provider is connected. Add an API key in settings.",
    PROVIDER_AUTH_ERROR: "AI provider authentication failed. Check the API key or Firebase login.",
    PROVIDER_RATE_LIMIT: "The AI provider rate limit was reached. Try again shortly.",
    PROVIDER_TIMEOUT: "The AI provider timed out. Try again shortly.",
    MODEL_NOT_FOUND: "The selected AI model was not found. Check the model setting.",
    MODEL_RESPONSE_EMPTY: "The AI provider returned an empty response. Try again.",
    GENERATION_FAILED: "Failed to generate a response.",
    REQUEST_CANCELLED: "The request was cancelled.",
    NETWORK_ERROR: "Unable to connect to the server.",
    TRY_AGAIN: "Please try again shortly."
  },
  ja: {
    MESSAGE_REQUIRED: "メッセージを入力してください。",
    INVALID_REQUEST: "リクエスト形式が正しくありません。",
    LOCAL_SEARCH_FAILED: "ローカル知識の検索に失敗しました。",
    WEB_SEARCH_FAILED: "ウェブ検索に失敗しました。",
    PROVIDER_NOT_CONFIGURED: "接続済みのAIプロバイダーがありません。設定でAPIキーを追加してください。",
    PROVIDER_AUTH_ERROR: "AIプロバイダーの認証に失敗しました。APIキーまたはFirebaseログインを確認してください。",
    PROVIDER_RATE_LIMIT: "AIプロバイダーの利用制限に達しました。しばらくしてから再試行してください。",
    PROVIDER_TIMEOUT: "AIプロバイダーの応答がタイムアウトしました。しばらくしてから再試行してください。",
    MODEL_NOT_FOUND: "選択したAIモデルが見つかりません。モデル設定を確認してください。",
    MODEL_RESPONSE_EMPTY: "AIプロバイダーが空の応答を返しました。もう一度お試しください。",
    GENERATION_FAILED: "回答を生成できませんでした。",
    REQUEST_CANCELLED: "リクエストがキャンセルされました。",
    NETWORK_ERROR: "サーバーに接続できません。",
    TRY_AGAIN: "しばらくしてからもう一度お試しください。"
  }
} as const;
