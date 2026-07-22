export type AgentBuildKind = "website" | "app" | "program" | "image";

export const AGENT_BUILD_KINDS = new Set<AgentBuildKind>([
  "website",
  "app",
  "program",
  "image"
]);

export const AGENT_KIND_LABELS: Record<AgentBuildKind, string> = {
  website: "웹사이트",
  app: "앱",
  program: "프로그램",
  image: "이미지"
};

export const AGENT_DEFAULT_FILENAMES: Record<AgentBuildKind, string> = {
  website: "website.html",
  app: "app.html",
  program: "program.js",
  image: "image.svg"
};

// 카테고리 버튼 없이 "웹사이트 만들어줘"처럼 자연어에서 결과물 종류를
// 추론한다. 명시적 키워드가 없으면 null을 돌려 호출자가 문맥(기존 결과물
// 수정 등)으로 판단하게 한다.
export function classifyAgentRequest(message: string): AgentBuildKind | null {
  const text = message.toLowerCase();
  if (/(이미지|로고|일러스트|그림|아이콘|배너|썸네일|포스터|그려|image|logo|icon|illustration|svg)/u.test(text)) {
    return "image";
  }
  if (/(웹\s*사이트|홈\s*페이지|랜딩|웹\s*페이지|포트폴리오|블로그|소개\s*페이지|website|landing|homepage)/u.test(text)) {
    return "website";
  }
  if (/(앱|어플|애플리케이션|계산기|투두|할\s*일|게임|타이머|메모장|대시보드|\bapp\b|game)/u.test(text)) {
    return "app";
  }
  if (/(프로그램|스크립트|파이썬|python|node|자바스크립트|javascript|typescript|알고리즘|크롤|파서|\bcode\b|코드\s*(를|로)?\s*(짜|만들|작성)|함수\s*(를)?\s*(짜|만들|작성)|program|script)/u.test(text)) {
    return "program";
  }
  return null;
}

// 폴더에서 불러온 파일의 확장자로 결과물 종류를 추정한다.
export function kindFromFileName(fileName: string): AgentBuildKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "website";
  if (lower.endsWith(".svg")) return "image";
  return "program";
}

/**
 * Strips markdown fences and pulls out the artifact for the requested kind.
 * 모델 출력이 토큰 한도로 중간에 잘려도 최대한 복구해 미리보기가 항상
 * 동작하게 한다 (브라우저는 닫히지 않은 태그를 자동 보정한다).
 */
export function extractArtifact(raw: string, kind: AgentBuildKind): string {
  let text = raw.trim();
  // 닫는 펜스가 잘려 나간 경우까지 처리한다.
  const fence = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/u);
  if (fence) {
    text = fence[1].trim();
  } else {
    const openFence = text.match(/```[a-zA-Z]*\n([\s\S]*)/u);
    if (openFence && !text.startsWith("<")) text = openFence[1].trim();
  }
  if (kind === "image") {
    const svg = text.match(/<svg[\s\S]*<\/svg>/iu);
    if (svg) return svg[0];
    // 잘린 SVG는 닫아서라도 렌더링한다.
    const openSvg = text.match(/<svg[\s\S]*/iu);
    return openSvg ? `${openSvg[0]}</svg>` : "";
  }
  if (kind === "website" || kind === "app") {
    const doc =
      text.match(/<!doctype html>[\s\S]*/iu) ||
      text.match(/<html[\s\S]*<\/html>/iu) ||
      text.match(/<html[\s\S]*/iu);
    if (doc) return doc[0];
    // Some models return only the body — wrap it so the preview still works.
    if (/<(div|main|section|body|style|script|header|nav)/iu.test(text)) {
      return `<!DOCTYPE html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>\n${text}\n</body></html>`;
    }
    return "";
  }
  return text;
}
