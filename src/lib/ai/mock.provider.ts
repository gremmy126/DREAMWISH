import type { AIMessage, AIProvider } from "./ai-provider";

export class MockProvider implements AIProvider {
  name = "mock";
  model = "local-mock";

  async chat(messages: AIMessage[]): Promise<string> {
    const last = [...messages].reverse().find((message) => message.role === "user");
    const hasContext = messages.some(
      (message) => message.role === "system" && message.content.includes("[Context ")
    );

    if (!hasContext) {
      return [
        "일반 AI 채팅 모드입니다.",
        "",
        `질문: ${last?.content.trim() || "질문 없음"}`,
        "",
        "현재 Mock Provider가 선택되어 있어 실제 외부 모델 호출 없이 응답 구조만 확인합니다. 로컬 문서 근거가 필요한 질문은 문서 기반 채팅(RAG)을 사용하세요."
      ].join("\n");
    }

    return [
      "로컬 문서에서 확인된 내용만 기준으로 답변합니다.",
      "",
      `질문: ${last?.content.replace(/^질문:\s*/u, "").trim() || "질문 없음"}`,
      "",
      "제공된 문서 조각에 근거가 있는 범위에서는 관련 SecondBrain 문서의 목적, 규칙, 업데이트 기록을 함께 확인해야 합니다. 문서에 없는 세부 내용은 확정하지 않는 것이 안전합니다."
    ].join("\n");
  }

  async *streamChat(messages: AIMessage[]): AsyncIterable<string> {
    const answer = await this.chat(messages);
    const parts = answer.match(/[\s\S]{1,24}/g) || [answer];

    for (const part of parts) {
      await new Promise((resolve) => setTimeout(resolve, 12));
      yield part;
    }
  }
}
