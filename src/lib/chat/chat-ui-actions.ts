export type ChatQuickActionId =
  | "todo"
  | "schedule"
  | "web_search"
  | "code_run"
  | "automation"
  | "approval_queue";

export type ChatQuickAction = {
  id: ChatQuickActionId;
  label: string;
  prompt: string;
};

export const CHAT_QUICK_ACTIONS = [
  { id: "todo", label: "할 일 만들기", prompt: "할 일: " },
  { id: "schedule", label: "예약 만들기", prompt: "예약: " },
  { id: "web_search", label: "웹 검색", prompt: "웹 검색: " },
  { id: "code_run", label: "코드 실행", prompt: "코드: " },
  { id: "automation", label: "자동화", prompt: "자동화 만들어: " },
  { id: "approval_queue", label: "승인 대기", prompt: "승인 대기 작업 보여줘" }
] as const satisfies readonly ChatQuickAction[];
