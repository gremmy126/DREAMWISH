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
import { renderDesignContextForPrompt } from "@/src/lib/design/design-md";
import { getDesignSkill, matchDesignSkill } from "@/src/lib/design/design-skills";
import { inspectGeneratedHtml } from "@/src/lib/design/html-guard";

export const maxDuration = 300;

// 완성형 단일 파일 결과물은 출력이 길고 오래 걸린다: 기본 60초/기본 토큰
// 한도로는 긴 프롬프트에서 시간 초과·잘림이 발생하므로 넉넉하게 준다.
const BUILD_AI_OPTIONS = { timeoutMs: 150_000, maxTokens: 16_000, temperature: 0.7 };
const POLISH_AI_OPTIONS = { timeoutMs: 120_000, maxTokens: 16_000, temperature: 0.7 };

// 미리보기 iframe에서 로드가 허용되는 검증된 오픈소스 CDN만 사용을 허용한다.
const OPEN_SOURCE_LIBRARIES =
  "You MAY load these open-source libraries via CDN, and ONLY these: " +
  'Tailwind CSS (<script src="https://cdn.tailwindcss.com"></script>), ' +
  "Google Fonts (fonts.googleapis.com — use Pretendard/Noto Sans KR for Korean, Inter/Plus Jakarta Sans for Latin), " +
  "Font Awesome 6 (cdnjs.cloudflare.com), AOS scroll animations, GSAP, Swiper, Chart.js, Alpine.js " +
  "(from cdn.jsdelivr.net, cdnjs.cloudflare.com, or unpkg.com). " +
  "Never hotlink external images — use inline SVG, CSS gradients, and emoji for all imagery.";

const AESTHETIC_DIRECTIONS =
  "Before writing code, SILENTLY plan (do not output the plan): pick ONE distinctive aesthetic direction that fits the subject, " +
  "an exact palette (hex values), a Google Fonts pairing, and the section layout. Aesthetic directions to choose from:\n" +
  "1) Dark glassmorphism SaaS — deep navy/black, blurred glass cards, glowing gradient accents.\n" +
  "2) Light editorial minimal — off-white, huge serif or tight sans display type, thin rules, lots of air.\n" +
  "3) Vivid gradient startup — bold multi-stop gradients, floating 3D-feel shapes, playful energy.\n" +
  "4) Premium neutral — warm beige/ivory, charcoal text, serif headlines, understated luxury.\n" +
  "5) Bold brutalist — oversized type, hard borders, high-contrast blocks, striking color pops.";

const DESIGN_BAR =
  "Design quality bar (MANDATORY — this must look like a top-tier product from Awwwards/Dribbble, never a plain unstyled document):\n" +
  "- A deliberate design system: one accent color + neutrals, consistent 8px spacing scale, max-width container, generous whitespace, 96px+ vertical rhythm between sections.\n" +
  "- Typography hierarchy: display headline (clamp 40-72px, bold, tight tracking), clear section titles, readable 16-18px body, Google Fonts loaded.\n" +
  "- A striking hero section with gradient or layered background (CSS shapes/blur circles), badge/eyebrow text, strong headline with an accent-colored span, sub-copy, and prominent CTA buttons.\n" +
  "- Cards with rounded corners (12-20px), layered soft shadows, subtle borders, and hover lift transitions; icons for every feature (Font Awesome or inline SVG) inside tinted icon chips.\n" +
  "- Custom-styled form controls (never browser defaults): styled inputs with focus rings, custom file-upload dropzones, toggle/range styling.\n" +
  "- Micro-interactions: smooth hover states, focus rings, transition-all; AOS or CSS reveal animations on scroll where natural.\n" +
  "- Fully responsive (mobile-first, CSS grid/flex; nav collapses to a working hamburger on mobile).\n" +
  "- Realistic, specific Korean copy relevant to the request — never lorem ipsum; include believable numbers, feature names, and social proof.\n" +
  "- Accessible contrast, semantic HTML (header/main/section/footer), alt text on SVGs.";

const SYSTEM_PROMPTS: Record<AgentBuildKind, string> = {
  website:
    "You are a world-class product designer and front-end engineer who wins design awards. " +
    "Build a COMPLETE single-file website as one HTML document with inline <style> and <script>.\n" +
    AESTHETIC_DIRECTIONS + "\n" + OPEN_SOURCE_LIBRARIES + "\n" + DESIGN_BAR + "\n" +
    "Structure: sticky nav, hero, 3+ content sections (features/steps/pricing/FAQ as fits), footer.\n" +
    "Reply with ONLY the HTML document — no explanation, no markdown fences.",
  app:
    "You are a world-class product designer and front-end engineer. " +
    "Build a COMPLETE single-file interactive web app (SPA) as one HTML document with inline <style> and <script>. " +
    "State in vanilla JS or Alpine.js; localStorage for persistence; every advertised feature must actually work.\n" +
    AESTHETIC_DIRECTIONS + "\n" + OPEN_SOURCE_LIBRARIES + "\n" + DESIGN_BAR + "\n" +
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
  "Upgrade: visual hierarchy, hero impact, spacing rhythm, typography, color harmony, card/button styling, custom form controls (kill every browser-default element), hover and scroll animations, responsiveness, and copywriting (Korean). " +
  AESTHETIC_DIRECTIONS + "\n" + OPEN_SOURCE_LIBRARIES + "\n" + DESIGN_BAR + "\n" +
  "Reply with ONLY the complete rewritten HTML document — no explanation, no markdown fences.";

// '다시 디자인': 기능은 유지한 채 완전히 다른 미학 방향으로 재구성한다.
const REDESIGN_PROMPT =
  "You are an award-winning design director. The user wants a COMPLETELY DIFFERENT look for this page. " +
  "Keep every feature and all content meaning, but rebuild the visual design from scratch in a DIFFERENT aesthetic direction than the current one — different palette, different typography pairing, different layout rhythm.\n" +
  AESTHETIC_DIRECTIONS + "\n" + OPEN_SOURCE_LIBRARIES + "\n" + DESIGN_BAR + "\n" +
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
      redesign?: unknown;
      previousCode?: unknown;
      previousKind?: unknown;
      provider?: unknown;
      history?: unknown;
      skillId?: unknown;
      useDesignSystem?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
    const provider = parseProviderName(body.provider);
    const previousCode =
      typeof body.previousCode === "string" ? body.previousCode.slice(0, 60_000) : "";
    const previousKind = AGENT_BUILD_KINDS.has(body.previousKind as AgentBuildKind)
      ? (body.previousKind as AgentBuildKind)
      : null;
    const redesign = body.redesign === true && Boolean(previousCode) && Boolean(previousKind);
    if (!message && !redesign) {
      return NextResponse.json(
        { ok: false, error: "무엇을 만들지 채팅으로 설명해 주세요." },
        { status: 400 }
      );
    }
    const refine =
      !redesign && body.refine === true && Boolean(previousCode) && Boolean(previousKind);
    const kind: AgentBuildKind = refine || redesign
      ? previousKind!
      : classifyAgentRequest(message) || "website";

    // Design Skills Registry: 명시 선택 > 자연어 자동 매칭. 선택된 스킬의
    // 지시문이 시스템 프롬프트에 추가된다 (Open Design Skills 개념 참고).
    const requestedSkill =
      typeof body.skillId === "string" ? getDesignSkill(body.skillId) : null;
    const skill =
      requestedSkill && requestedSkill.mode === "generate"
        ? requestedSkill
        : !refine && !redesign
          ? matchDesignSkill(message)
          : null;
    const applicableSkill = skill && skill.supportedArtifactTypes.includes(kind) ? skill : null;

    // DreamWish 디자인 시스템 모드: DESIGN.md 계약을 미학 방향으로 사용한다.
    const useDesignSystem = body.useDesignSystem === true;
    const designSystemBlock = useDesignSystem
      ? "\nAesthetic direction OVERRIDE — use the DreamWish design contract below instead of picking your own direction:\n" +
        renderDesignContextForPrompt() + "\n"
      : "";
    const skillBlock = applicableSkill ? `\nSkill directive (${applicableSkill.name}): ${applicableSkill.promptDirective}\n` : "";
    const promptExtras = designSystemBlock + skillBlock;

    // 최근 대화 맥락을 함께 전달해 "아까 말한 대로" 같은 지시도 이해한다.
    const historyBlock = Array.isArray(body.history)
      ? body.history
          .slice(-8)
          .filter(
            (item): item is { role: string; text: string } =>
              Boolean(item) &&
              typeof (item as { text?: unknown }).text === "string" &&
              typeof (item as { role?: unknown }).role === "string"
          )
          .map((item) => `${item.role === "user" ? "사용자" : "AI"}: ${item.text.slice(0, 400)}`)
          .join("\n")
      : "";
    const contextPrefix = historyBlock ? `지금까지의 대화:\n${historyBlock}\n\n` : "";

    const messages = redesign
      ? [
          { role: "system" as const, content: REDESIGN_PROMPT + promptExtras },
          {
            role: "user" as const,
            content:
              `${contextPrefix}완전히 다른 스타일로 다시 디자인해 주세요.` +
              (message ? ` 참고 요청: ${message}` : "") +
              `\n\n현재 코드:\n${previousCode}`
          }
        ]
      : [
          { role: "system" as const, content: SYSTEM_PROMPTS[kind] + promptExtras },
          refine
            ? {
                role: "user" as const,
                content:
                  `${contextPrefix}기존 결과물을 아래 요청대로 수정해 완전한 결과물 전체를 다시 출력해 주세요. ` +
                  `수정하지 않는 부분의 품질도 함께 다듬어 주세요.\n\n` +
                  `수정 요청: ${message}\n\n기존 코드:\n${previousCode}`
              }
            : { role: "user" as const, content: `${contextPrefix}${message}` }
        ];

    const raw = await chatWithAI(messages, provider, BUILD_AI_OPTIONS);
    let code = extractArtifact(raw, kind);
    if (!code) {
      return NextResponse.json(
        { ok: false, error: "생성 결과를 해석하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    // 새로 만든 웹사이트·앱은 디자인 폴리시 패스를 한 번 더 거친다.
    // 실패하면 초안을 그대로 사용한다 (품질 향상은 best-effort).
    if (!refine && !redesign && (kind === "website" || kind === "app")) {
      try {
        const polished = await chatWithAI(
          [
            { role: "system" as const, content: POLISH_PROMPT + promptExtras },
            {
              role: "user" as const,
              content: `원래 요청: ${message}\n\n현재 코드:\n${code.slice(0, 60_000)}`
            }
          ],
          provider,
          POLISH_AI_OPTIONS
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

    // 생성 결과 보안 검사 — 미리보기 전에 위험 패턴을 클라이언트에 알린다.
    const guard =
      kind === "website" || kind === "app" ? inspectGeneratedHtml(code) : { safe: true, findings: [] };

    return NextResponse.json({
      ok: true,
      kind,
      code,
      refined: refine,
      redesigned: redesign,
      skillId: applicableSkill?.id ?? null,
      guard
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    console.error("[agent-build] failed:", detail);
    let message = "생성에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    if (/All configured AI providers failed/iu.test(detail)) {
      message =
        "연결된 모든 AI 공급자 호출이 실패했습니다. 다른 모델을 선택해 다시 시도하거나, " +
        "설정에서 공급자 API 키와 사용량 한도를 확인해 주세요.";
    } else if (/timed out|timeout/iu.test(detail)) {
      message =
        "생성 시간이 초과되었습니다. 요청을 두 단계로 나눠(핵심 구조 먼저 → 세부 기능은 수정 요청으로) 시도해 주세요.";
    } else if (/rate|429|quota/iu.test(detail)) {
      message = "AI 공급자 사용량 한도에 걸렸습니다. 잠시 후 다시 시도하거나 다른 모델을 선택해 주세요.";
    } else if (/not configured|provider/iu.test(detail)) {
      message = "연결된 AI 공급자가 없습니다. 설정에서 AI 공급자 키를 등록해 주세요.";
    } else if (detail) {
      message = detail;
    }
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
