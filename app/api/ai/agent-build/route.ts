import { NextResponse } from "next/server";
import {
  AGENT_BUILD_KINDS,
  classifyAgentRequest,
  extractArtifact,
  type AgentBuildKind
} from "@/src/lib/agent/agent-build";
import { chatWithAI } from "@/src/lib/ai/ai.service";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";

export const maxDuration = 120;

const SYSTEM_PROMPTS: Record<AgentBuildKind, string> = {
  website:
    "You are an expert front-end engineer. Build a COMPLETE single-file website as one HTML document. " +
    "All CSS and JavaScript must be inline (<style>, <script>). No external resources (no CDN, fonts, images by URL). " +
    "Modern, polished, mobile-responsive design. Korean UI text unless the user asks otherwise. " +
    "Reply with ONLY the HTML document — no explanation, no markdown fences.",
  app:
    "You are an expert front-end engineer. Build a COMPLETE single-file interactive web app (SPA) as one HTML document. " +
    "All CSS and JavaScript inline. State handled with vanilla JS. localStorage may be used for persistence. " +
    "No external resources. Modern, polished, mobile-responsive design. Korean UI text unless the user asks otherwise. " +
    "Reply with ONLY the HTML document — no explanation, no markdown fences.",
  program:
    "You are an expert software engineer. Write a COMPLETE, runnable single-file program that fulfils the request. " +
    "Default to JavaScript (Node.js) unless the user names another language. Include brief usage instructions as code comments. " +
    "Reply with ONLY the code — no explanation, no markdown fences.",
  image:
    "You are an expert vector illustrator. Create a COMPLETE standalone SVG image (<svg …>…</svg>) that fulfils the request. " +
    'Use viewBox="0 0 1200 800" unless a different aspect ratio suits better. Rich gradients, shapes and text are welcome. ' +
    "No external references (no images, no fonts by URL, no scripts). " +
    "Reply with ONLY the SVG markup — no explanation, no markdown fences."
};

// 채팅 한 문장으로 웹사이트·앱·프로그램·이미지를 생성/수정한다. 종류는
// 메시지에서 추론하고, 기존 결과물이 있으면 수정 요청으로 처리한다.
export async function POST(request: Request) {
  try {
    await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      message?: unknown;
      refine?: unknown;
      previousCode?: unknown;
      previousKind?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
    if (!message) {
      return NextResponse.json(
        { ok: false, error: "무엇을 만들지 채팅으로 설명해 주세요." },
        { status: 400 }
      );
    }
    const previousCode =
      typeof body.previousCode === "string" ? body.previousCode.slice(0, 60_000) : "";
    const previousKind = AGENT_BUILD_KINDS.has(body.previousKind as AgentBuildKind)
      ? (body.previousKind as AgentBuildKind)
      : null;
    const refine = body.refine === true && Boolean(previousCode) && Boolean(previousKind);
    const kind: AgentBuildKind = refine
      ? previousKind!
      : classifyAgentRequest(message) || "website";

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPTS[kind] },
      refine
        ? {
            role: "user" as const,
            content:
              `기존 결과물을 아래 요청대로 수정해 완전한 결과물 전체를 다시 출력해 주세요.\n\n` +
              `수정 요청: ${message}\n\n기존 코드:\n${previousCode}`
          }
        : { role: "user" as const, content: message }
    ];

    const raw = await chatWithAI(messages);
    const code = extractArtifact(raw, kind);
    if (!code) {
      return NextResponse.json(
        { ok: false, error: "생성 결과를 해석하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, kind, code, refined: refine });
  } catch (error) {
    const message =
      error instanceof Error && /provider/iu.test(error.message)
        ? "연결된 AI 공급자가 없습니다. 설정에서 AI 공급자 키를 등록해 주세요."
        : error instanceof Error
          ? error.message
          : "생성에 실패했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
