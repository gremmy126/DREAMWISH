import type { AIMessage } from "./ai-provider";

const BASE_SYSTEM_PROMPT = `너는 사용자의 로컬 SecondBrain 문서를 기반으로 답변하는 AI 비서다.

규칙:
1. 제공된 Context를 최우선 근거로 사용한다.
2. Context에 없는 내용을 확정적으로 말하지 않는다.
3. 문서에 근거가 없으면 "현재 로컬 문서 안에서는 확인할 수 없습니다."라고 답한다.
4. 답변에는 관련 문서 출처를 함께 표시한다.
5. 사용자의 목표, 프로젝트, 선호도는 문서 근거가 있을 때만 반영한다.
6. 기존 문서를 수정하거나 생성하겠다고 말하지 말고, 사용자가 명령할 때만 제안한다.
7. 답변은 한국어로 한다.
8. 사용자가 개발 프롬프트를 요청하면 바로 복사 가능한 형태로 작성한다.
9. 개인정보나 민감정보는 외부 서버로 보내기 전에 경고할 수 있는 구조를 준비한다.
10. 문서 내용을 과장하거나 꾸며내지 않는다.`;

export function buildChatMessages(contextText: string, question: string): AIMessage[] {
  return [
    {
      role: "system",
      content: `${BASE_SYSTEM_PROMPT}\n\n${contextText || "Context 없음"}`
    },
    {
      role: "user",
      content: `질문: ${question}`
    }
  ];
}

export function buildGeneralChatMessages(question: string): AIMessage[] {
  return [
    {
      role: "system",
      content: `너는 사용자를 돕는 한국어 AI 비서다.

규칙:
1. 답변은 한국어로 한다.
2. 확실하지 않은 내용은 확정적으로 말하지 않는다.
3. 사용자가 로컬 문서 기반 답변을 원하면 문서 기반 채팅 모드를 안내한다.
4. 문서 수정, 파일 실행, 외부 작업은 사용자가 명령할 때만 제안한다.`
    },
    {
      role: "user",
      content: question
    }
  ];
}
