import { getAutomationApp } from "./app-registry";
import { getAutomationTool } from "./tool-registry";

export type AutomationAction = { id: string; label: string; group: "trigger" | "read" | "create" | "update" | "delete" | "advanced" };
const common: AutomationAction[] = [
  { id: "watch-new", label: "새 항목 감지", group: "trigger" },
  { id: "list", label: "목록 조회", group: "read" },
  { id: "get", label: "상세 조회", group: "read" },
  { id: "search", label: "검색", group: "read" },
  { id: "create", label: "새 항목 생성", group: "create" },
  { id: "update", label: "항목 수정", group: "update" },
  { id: "delete", label: "삭제 또는 보관", group: "delete" },
  { id: "custom-request", label: "사용자 지정 API 요청", group: "advanced" }
];
const overrides: Record<string, string[]> = {
  gmail: ["새 이메일 감지", "이메일 검색", "이메일 조회", "이메일 전송", "답장", "임시저장", "라벨 이동", "첨부파일 조회"],
  slack: ["새 메시지 감지", "메시지 조회", "채널 조회", "메시지 전송", "메시지 수정", "메시지 삭제", "반응 추가", "파일 업로드"],
  "google-sheets": ["새 행 감지", "범위 조회", "행 찾기", "행 추가", "행 수정", "행 삭제", "시트 생성", "사용자 지정 API 요청"],
  openai: ["텍스트 응답", "구조화 응답", "임베딩", "이미지 생성", "음성 인식", "음성 합성", "모델 목록", "사용자 지정 API 요청"]
};

export function listAutomationActions(appId: string): AutomationAction[] {
  const tool = getAutomationTool(appId);
  if (tool) return tool.operations.map((label, index) => ({ id: `${appId}-${index + 1}`, label, group: index === 0 ? "create" : "update" }));
  if (!getAutomationApp(appId)) return common;
  const labels = overrides[appId];
  if (!labels) return common;
  return labels.map((label, index) => ({ id: `${appId}-${index + 1}`, label, group: index === 0 ? "trigger" : index < 3 ? "read" : index < 6 ? "create" : "advanced" }));
}
