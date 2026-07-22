import { NextResponse } from "next/server";
import {
  AGENT_BUILD_KINDS,
  classifyAgentRequest,
  extractArtifact,
  type AgentBuildKind
} from "@/src/lib/agent/agent-build";
import { chatWithAI } from "@/src/lib/ai/ai.service";
import { parseProviderName } from "@/src/lib/ai/provider-options";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";

export const maxDuration = 120;

// 미리보기 iframe에서 로드가 허용되는 검증된 오픈소스 CDN만 사용을 허용한다.
const OPEN_SOURCE_LIBRARIES =
  "You MAY load these open-source libraries via CDN, and ONLY these: " +
  'Tailwind CSS (<script src="https://cdn.tailwindcss.com"></script>), ' +
  "Google Fonts (fonts.googleapis.com — use Pretendard/Noto Sans KR for Korean, Inter/Plus Jakarta Sans for Latin), " +
  "Font Awesome 6 (cdnjs.cloudflare.com), AOS scroll animations, GSAP, Swiper, Chart.js, Alpine.js " +
  "(from cdn.jsdelivr.net, cdnjs.cloudflare.com, or unpkg.com). " +
  "Never hotlink external images — use inline SVG, CSS gradients, and emoji for all imagery.";

const DESIGN_BAR =
  "Design quality bar (MANDATORY — this must look like a top-tier product from Awwwards/Dribbble, never a plain unstyled document):\n" +
  "- A deliberate design system: one accent color + neutrals, consistent 8px spacing scale, max-width container, generous whitespace.\n" +
  "- Typography hierarchy: display headline (48px+, bold, tight tracking), clear section titles, readable 16px body, Google Fonts loaded.\n" +
  "- A striking hero section with gradient or layered background, badge/eyebrow text, strong headline, sub-copy, and prominent CTA buttons.\n" +
  "- Cards with rounded corners (12-20px), soft shadows, subtle borders, and hover lift transitions; icons for every feature (Font Awesome or inline SVG).\n" +
  "- Micro-interactions: smooth hover states, focus rings, transition-all; AOS or CSS reveal animations on scroll where natural.\n" +
  "- Fully responsive (mobile-first, CSS grid/flex; nav collapses on mobile).\n" +
  "- Realistic, specific Korean copy relevant to the request — never lorem ipsum, never bare default-styled form elements.\n" +
  "- Dark or light theme chosen to fit the subject, with accessible contrast.";

const SYSTEM_PROMPTS: Record<AgentBuildKind, string> = {
  website:
    "You are a world-class product designer and front-end engineer who wins design awards. " +
    "Build a COMPLETE single-file website as one HTML document with inline <style> and <script>.\n" +
    OPEN_SOURCE_LIBRARIES + "\n" + DESIGN_BAR + "\n" +
    "Structure: sticky nav, hero, 3+ content sections (features/steps/pricing/FAQ as fits), footer.\n" +
    "Reply with ONLY the HTML document — no explanation, no markdown fences.",
  app:
    "You are a world-class product designer and front-end engineer. " +
    "Build a COMPLETE single-file interactive web app (SPA) as one HTML document with inline <style> and <script>. " +
    "State in vanilla JS or Alpine.js; localStorage for persistence; every advertised feature must actually work.\n" +
    OPEN_SOURCE_LIBRARIES + "\n" + DESIGN_BAR + "\n" +
    "App chrome: polished header, empty states with guidance, buttons with icons, keyboard-friendly inputs, toast/feedback on actions.\n" +
    "Reply with ONLY the HTML document — no explanation, no markdown fences.",
  program:
    "You are a principal software engineer. Write a COMPLETE, production-quality single-file program that fulfils the request. " +
    "Default to JavaScript (Node.js) unless the user names another language. " +
    "Include: clear usage instructions as header comments, input validation, helpful error messages, small focused functions, and edge-case handling. " +
    "Reply with ONLY the code — no explanation, no markdown fences.",
  image:
    "You are an award-winning vector illustrator. Create a COMPLETE standalone SVG image (<svg …>…</svg>) that fulfils the request. " +
    'Use viewBox="0 0 1200 800" unless a different aspect ratio suits better. ' +
    "Craft it like professional brand artwork: layered gradients, soft glows (feGaussianBlur), balanced composition, harmonious palette, subtle background texture. " +
    "No external references (no images, no fonts by URL, no scripts). " +
    "Reply with ONLY the SVG markup — no explanation, no markdown fences."
};

// 2차 패스: 초안을 시니어 디자이너 관점에서 대폭 업그레이드한다.
const POLISH_PROMPT =
  "You are a design director reviewing a junior developer's page. Rewrite it into a dramatically more beautiful, modern, award-quality page while keeping every feature working. " +
  "Upgrade: visual hierarchy, hero impact, spacing rhythm, typography, color harmony, card/button styling, hover and scroll animations, responsiveness, and copywriting (Korean). " +
  OPEN_SOURCE_LIBRARIES + "\n" +
  "Reply with ONLY the complete rewritten HTML document — no explanation, no markdown fences.";

// 채팅 한 문장으로 웹사이트·앱·프로그램·이미지를 생성/수정한다. 종류는
// 메시지에서 추론하고, 웹사이트·앱은 초안 생성 후 디자인 폴리시 패스를
// 한 번 더 거쳐 완성도를 끌어올린다.
export async function POST(request: Request) {
  try {
    await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      message?: unknown;
      refine?: unknown;
      previousCode?: unknown;
      previousKind?: unknown;
      provider?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
    if (!message) {
      return NextResponse.json(
        { ok: false, error: "무엇을 만들지 채팅으로 설명해 주세요." },
        { status: 400 }
      );
    }
    const provider = parseProviderName(body.provider);
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
              `기존 결과물을 아래 요청대로 수정해 완전한 결과물 전체를 다시 출력해 주세요. ` +
              `수정하지 않는 부분의 품질도 함께 다듬어 주세요.\n\n` +
              `수정 요청: ${message}\n\n기존 코드:\n${previousCode}`
          }
        : { role: "user" as const, content: message }
    ];

    const raw = await chatWithAI(messages, provider);
    let code = extractArtifact(raw, kind);
    if (!code) {
      return NextResponse.json(
        { ok: false, error: "생성 결과를 해석하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    // 새로 만든 웹사이트·앱은 디자인 폴리시 패스를 한 번 더 거친다.
    // 실패하면 초안을 그대로 사용한다 (품질 향상은 best-effort).
    if (!refine && (kind === "website" || kind === "app")) {
      try {
        const polished = await chatWithAI(
          [
            { role: "system" as const, content: POLISH_PROMPT },
            {
              role: "user" as const,
              content: `원래 요청: ${message}\n\n현재 코드:\n${code.slice(0, 60_000)}`
            }
          ],
          provider
        );
        const polishedCode = extractArtifact(polished, kind);
        // 짧게 잘려 나온 결과로 멀쩡한 초안을 덮어쓰지 않는다.
        if (polishedCode && polishedCode.length >= code.length * 0.6) {
          code = polishedCode;
        }
      } catch {
        // Keep the draft.
      }
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
