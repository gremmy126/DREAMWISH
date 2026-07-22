export type FeatureStatus = "ready" | "partial" | "planned";

export type ProductFeatureGroup = {
  id: string;
  title: string;
  status: FeatureStatus;
  items: Array<{
    title: string;
    status: FeatureStatus;
  }>;
};

export const productFeatureGroups: ProductFeatureGroup[] = [
  {
    id: "ai-chat",
    title: "AI 채팅",
    status: "partial",
    items: [
      { title: "일반 AI 채팅", status: "partial" },
      { title: "문서 기반 채팅(RAG)", status: "ready" },
      { title: "프로젝트별 채팅", status: "planned" },
      { title: "웹 검색", status: "ready" },
      { title: "파일 첨부", status: "ready" },
      { title: "음성 입력", status: "partial" },
      { title: "이미지 분석", status: "partial" },
      { title: "코드 실행", status: "ready" },
      { title: "여러 AI 모델 선택", status: "partial" },
      { title: "AI 답변 비교", status: "planned" },
      { title: "대화 Fork", status: "planned" },
      { title: "프롬프트 라이브러리", status: "planned" }
    ]
  },
  {
    id: "knowledge-base",
    title: "지식베이스",
    status: "partial",
    items: [
      { title: "Markdown 관리", status: "partial" },
      { title: "Obsidian 연동", status: "planned" },
      { title: "폴더 관리", status: "partial" },
      { title: "태그", status: "planned" },
      { title: "백링크", status: "planned" },
      { title: "문서 관계 보기", status: "partial" },
      { title: "자동 요약", status: "planned" },
      { title: "AI 자동 분류", status: "planned" },
      { title: "문서 버전관리", status: "planned" },
      { title: "PDF / Word / Excel / PPT", status: "planned" },
      { title: "이미지 OCR", status: "planned" },
      { title: "유튜브 요약", status: "planned" },
      { title: "웹페이지 저장", status: "planned" }
    ]
  },
  {
    id: "project",
    title: "프로젝트",
    status: "partial",
    items: [
      { title: "프로젝트별 채팅", status: "planned" },
      { title: "문서", status: "planned" },
      { title: "파일", status: "planned" },
      { title: "할 일", status: "partial" },
      { title: "일정", status: "partial" },
      { title: "메모", status: "planned" },
      { title: "목표", status: "planned" },
      { title: "AI 기억", status: "planned" }
    ]
  },
  {
    id: "memo",
    title: "메모",
    status: "planned",
    items: [
      { title: "빠른 메모", status: "planned" },
      { title: "음성 메모", status: "planned" },
      { title: "스크린샷 메모", status: "planned" },
      { title: "웹 클리핑", status: "planned" },
      { title: "드래그 저장", status: "planned" },
      { title: "자동 태그", status: "planned" }
    ]
  },
  {
    id: "ai-memory",
    title: "AI 기억",
    status: "planned",
    items: [
      { title: "사용자 성향", status: "planned" },
      { title: "프로젝트", status: "planned" },
      { title: "작업 방식", status: "planned" },
      { title: "선호도", status: "planned" },
      { title: "사용자 수정", status: "planned" }
    ]
  },
  {
    id: "files",
    title: "파일 관리",
    status: "partial",
    items: [
      { title: "Explorer", status: "planned" },
      { title: "Drag & Drop", status: "planned" },
      { title: "PDF 보기", status: "planned" },
      { title: "이미지 보기", status: "partial" },
      { title: "Office 보기", status: "planned" },
      { title: "Markdown 보기", status: "partial" },
      { title: "대용량 검색", status: "planned" },
      { title: "중복파일 찾기", status: "planned" }
    ]
  },
  {
    id: "search",
    title: "검색",
    status: "partial",
    items: [
      { title: "통합 검색", status: "partial" },
      { title: "채팅 검색", status: "planned" },
      { title: "문서 검색", status: "ready" },
      { title: "PDF / 이미지 / 코드 검색", status: "planned" },
      { title: "Semantic Search", status: "partial" }
    ]
  },
  {
    id: "calendar",
    title: "일정",
    status: "partial",
    items: [
      { title: "캘린더", status: "partial" },
      { title: "일정", status: "partial" },
      { title: "마감일", status: "planned" },
      { title: "AI 일정 추천", status: "planned" },
      { title: "프로젝트 일정", status: "planned" },
      { title: "회의 일정", status: "planned" }
    ]
  },
  {
    id: "tasks",
    title: "할 일",
    status: "partial",
    items: [
      { title: "Todo", status: "partial" },
      { title: "Kanban", status: "partial" },
      { title: "캘린더", status: "planned" },
      { title: "우선순위", status: "planned" },
      { title: "반복작업", status: "planned" },
      { title: "AI 자동 생성", status: "partial" }
    ]
  },
  {
    id: "commands",
    title: "AI 명령",
    status: "partial",
    items: [
      { title: "Ctrl+K", status: "partial" },
      { title: "요약", status: "planned" },
      { title: "번역", status: "planned" },
      { title: "회의록 작성", status: "planned" },
      { title: "이메일 작성", status: "planned" },
      { title: "블로그 작성", status: "planned" },
      { title: "코드 생성", status: "partial" },
      { title: "파일 찾기", status: "partial" }
    ]
  },
  {
    id: "document-editing",
    title: "AI 문서 편집",
    status: "planned",
    items: [
      { title: "수정", status: "planned" },
      { title: "추가", status: "planned" },
      { title: "삭제", status: "planned" },
      { title: "번역", status: "planned" },
      { title: "요약", status: "planned" },
      { title: "문체 변경", status: "planned" },
      { title: "Markdown 자동 수정", status: "planned" }
    ]
  },
  {
    id: "browser",
    title: "웹 브라우저",
    status: "partial",
    items: [
      { title: "내장 브라우저", status: "planned" },
      { title: "검색", status: "ready" },
      { title: "AI 요약", status: "planned" },
      { title: "광고 제거", status: "planned" },
      { title: "웹 저장", status: "planned" },
      { title: "웹 번역", status: "planned" }
    ]
  },
  {
    id: "terminal",
    title: "터미널",
    status: "partial",
    items: [
      { title: "명령 실행", status: "planned" },
      { title: "Git", status: "planned" },
      { title: "Docker", status: "planned" },
      { title: "Python", status: "planned" },
      { title: "Node", status: "partial" }
    ]
  },
  {
    id: "code",
    title: "코드 워크스페이스",
    status: "partial",
    items: [
      { title: "VSCode 느낌", status: "planned" },
      { title: "AI 코드 수정", status: "planned" },
      { title: "코드 설명", status: "planned" },
      { title: "버그 찾기", status: "planned" },
      { title: "Git", status: "planned" },
      { title: "JavaScript 실행", status: "ready" }
    ]
  },
  {
    id: "visualization",
    title: "데이터 시각화",
    status: "partial",
    items: [
      { title: "프로젝트 그래프", status: "planned" },
      { title: "관계", status: "partial" },
      { title: "통계", status: "partial" },
      { title: "진행률", status: "partial" }
    ]
  },
  {
    id: "file-ai",
    title: "파일 AI",
    status: "partial",
    items: [
      { title: "PDF 업로드", status: "planned" },
      { title: "요약", status: "planned" },
      { title: "질문", status: "planned" },
      { title: "비교", status: "planned" },
      { title: "표 추출", status: "planned" },
      { title: "OCR", status: "planned" },
      { title: "텍스트 파일 첨부", status: "ready" }
    ]
  },
  {
    id: "voice",
    title: "음성",
    status: "partial",
    items: [
      { title: "음성 입력", status: "partial" },
      { title: "음성 답변", status: "planned" },
      { title: "회의 녹음", status: "planned" },
      { title: "자동 회의록", status: "planned" }
    ]
  },
  {
    id: "image",
    title: "이미지",
    status: "partial",
    items: [
      { title: "OCR", status: "planned" },
      { title: "객체 인식", status: "planned" },
      { title: "이미지 생성", status: "planned" },
      { title: "이미지 편집", status: "planned" },
      { title: "로컬 이미지 분석", status: "partial" }
    ]
  },
  {
    id: "local-ai",
    title: "로컬 AI",
    status: "partial",
    items: [
      { title: "Ollama", status: "partial" },
      { title: "GGUF", status: "planned" },
      { title: "CUDA", status: "planned" },
      { title: "CPU", status: "planned" },
      { title: "완전 오프라인", status: "planned" }
    ]
  },
  {
    id: "model-management",
    title: "모델 관리",
    status: "partial",
    items: [
      { title: "Claude", status: "ready" },
      { title: "Groq", status: "ready" },
      { title: "Gemini", status: "ready" },
      { title: "Ollama", status: "partial" },
      { title: "LM Studio", status: "partial" },
      { title: "OpenRouter", status: "ready" },
      { title: "Cloudflare", status: "ready" },
      { title: "API Key 관리", status: "planned" }
    ]
  },
  {
    id: "mcp",
    title: "MCP",
    status: "planned",
    items: [
      { title: "MCP 서버 추가", status: "planned" },
      { title: "삭제", status: "planned" },
      { title: "권한 설정", status: "planned" },
      { title: "실행 로그", status: "planned" }
    ]
  },
  {
    id: "plugins",
    title: "플러그인",
    status: "planned",
    items: [
      { title: "Marketplace", status: "planned" },
      { title: "설치", status: "planned" },
      { title: "업데이트", status: "planned" },
      { title: "삭제", status: "planned" }
    ]
  },
  {
    id: "settings",
    title: "설정",
    status: "ready",
    items: [
      { title: "테마", status: "ready" },
      { title: "단축키", status: "ready" },
      { title: "AI 모델", status: "partial" },
      { title: "저장 위치", status: "ready" },
      { title: "언어", status: "ready" },
      { title: "로컬 백업", status: "ready" }
    ]
  },
  {
    id: "backup",
    title: "백업",
    status: "partial",
    items: [
      { title: "Local", status: "ready" },
      { title: "자동 백업 설정", status: "partial" }
    ]
  }
];
