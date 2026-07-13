export type AutomationToolDefinition = { id: string; label: string; color: string; operations: string[] };
export const AUTOMATION_TOOLS: AutomationToolDefinition[] = [
  { id: "text-formatter", label: "Text · Formatter", color: "#7C3AED", operations: ["텍스트 결합", "분리", "치환", "대소문자 변환", "정규식 추출"] },
  { id: "datetime", label: "날짜 · 시간", color: "#2563EB", operations: ["파싱", "형식 변환", "시간대 변환", "날짜 계산", "현재 시각"] },
  { id: "math", label: "Math", color: "#EA580C", operations: ["사칙연산", "반올림", "합계", "평균", "백분율"] },
  { id: "json", label: "JSON", color: "#0F766E", operations: ["파싱", "직렬화", "경로 선택", "객체 병합", "스키마 검증"] },
  { id: "csv", label: "CSV", color: "#16A34A", operations: ["CSV 파싱", "CSV 생성", "열 선택", "행 필터", "배열 변환"] },
  { id: "array-aggregator", label: "Array Aggregator", color: "#0891B2", operations: ["결과 모으기", "그룹화", "정렬", "중복 제거", "배열 평탄화"] },
  { id: "text-aggregator", label: "Text Aggregator", color: "#9333EA", operations: ["텍스트 모으기", "구분자 적용", "템플릿 적용", "그룹별 출력", "요약"] },
  { id: "variables", label: "Variables", color: "#4F46E5", operations: ["변수 설정", "조회", "수정", "삭제", "여러 변수 설정"] },
  { id: "data-store", label: "Data Store", color: "#334155", operations: ["키 저장", "조회", "목록", "수정", "삭제", "만료 설정"] },
  { id: "error-handler", label: "Error Handler", color: "#DC2626", operations: ["재시도", "대체 경로", "오류 무시", "실행 중단", "오류 전달"] }
];
export function getAutomationTool(id: string) { return AUTOMATION_TOOLS.find((tool) => tool.id === id) || null; }
