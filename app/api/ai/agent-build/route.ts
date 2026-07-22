import { NextResponse } from "next/server";
import {
  AGENT_BUILD_KINDS,
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

export async function POST(request: Request) {
  try {
    await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      kind?: unknown;
      prompt?: unknown;
      previousCode?: unknown;
      feedback?: unknown;
    };
    const kind = AGENT_BUILD_KINDS.has(body.kind as AgentBuildKind)
      ? (body.kind as AgentBuildKind)
      : "website";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
    const previousCode =
      typeof body.previousCode === "string" ? body.previousCode.slice(0, 60_000) : "";
    const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0, 2000) : "";
    if (!prompt && !feedback) {
      return NextResponse.json(
        { ok: false, error: "무엇을 만들지 설명해 주세요." },
        { status: 400 }
      );
    }

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPTS[kind] },
      previousCode && feedback
        ? {
            role: "user" as const,
            content:
              `기존 결과물을 수정해 주세요.\n\n원래 요청: ${prompt}\n수정 요청: ${feedback}\n\n` +
              `기존 코드:\n${previousCode}`
          }
        : { role: "user" as const, content: prompt }
    ];

    const raw = await chatWithAI(messages);
    const code = extractArtifact(raw, kind);
    if (!code) {
      return NextResponse.json(
        { ok: false, error: "생성 결과를 해석하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, kind, code });
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
