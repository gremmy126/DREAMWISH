export type QuestionIntent = "GENERAL" | "LOCAL" | "WEB";

export type ChatExecutionPlan = {
  intent: QuestionIntent;
  shouldUseRag: boolean;
  shouldUseWeb: boolean;
};

const WEB_PREFIXES = [
  "웹 검색",
  "웹검색",
  "web search",
  "web",
  "web検索",
  "ウェブ検索"
];

const WEB_PATTERNS = [
  /오늘|현재|지금|실시간|최신|최근|뉴스|속보|주가|환율|날씨|가격|시세|버전|릴리스|업데이트/iu,
  /\b(?:today|current|now|real[-\s]?time|latest|recent|news|stock|price|exchange rate|weather|version|release|update)\b/iu,
  /今日|現在|今|リアルタイム|最新|ニュース|株価|為替|天気|価格|バージョン/iu
];

const LOCAL_PATTERNS = [
  /내\s*(프로젝트|메모|문서|파일|crm|일정|캘린더|knowledge|지식|노트|대화|작성한|업로드|첨부)/iu,
  /내가\s*(작성|저장|올린|만든|말한|기록)/iu,
  /우리\s*(프로젝트|문서|crm|일정|캘린더|메모|knowledge|노트)/iu,
  /로컬|local|secondbrain|second brain|dreamwish|개인\s*두뇌|대화\s*기록|저장된\s*(문서|메모|파일|기록)/iu,
  /my\s+(project|memo|note|document|file|crm|calendar|knowledge|workspace|conversation|saved)/iu,
  /私の|自分の|保存した|ローカル|ドキュメント|メモ|プロジェクト|CRM|予定|ナレッジ/iu
];

export function classifyQuestion(question: string): QuestionIntent {
  const normalized = question.trim();
  if (!normalized) return "GENERAL";

  if (hasExplicitWebPrefix(normalized) || WEB_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "WEB";
  }

  if (LOCAL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "LOCAL";
  }

  return "GENERAL";
}

export function getChatExecutionPlan(question: string): ChatExecutionPlan {
  const intent = classifyQuestion(question);

  return {
    intent,
    shouldUseRag: intent === "LOCAL",
    shouldUseWeb: intent === "WEB"
  };
}

export function getWebSearchQuery(question: string): string {
  const normalized = question.trim();

  for (const prefix of WEB_PREFIXES) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = normalized.match(new RegExp(`^${escaped}\\s*[:：→\\-]?\\s*([\\s\\S]+)$`, "iu"));
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return normalized;
}

function hasExplicitWebPrefix(question: string) {
  return WEB_PREFIXES.some((prefix) => {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped}(?:\\s*[:：→\\-]|\\s+)`, "iu").test(question);
  });
}
