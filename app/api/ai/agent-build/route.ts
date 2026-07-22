import { NextResponse } from "next/server";
import {
  AGENT_BUILD_KINDS,
  classifyAgentRequest,
  extractArtifact,
  type AgentBuildKind
} from "@/src/lib/agent/agent-build";
import { isAIModelTierId, type AIModelTierId } from "@/src/lib/ai/ai-model-catalog";
import { chatWithAI } from "@/src/lib/ai/ai.service";
import { parseProviderName } from "@/src/lib/ai/provider-options";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import { AICreditError } from "@/src/lib/billing/ai-credit-ledger";
import { AICreditMeteringError, runMeteredCompletion } from "@/src/lib/billing/ai-credit-metering";
import { renderDesignContextForPrompt } from "@/src/lib/design/design-md";
import { getDesignSkill, matchDesignSkill } from "@/src/lib/design/design-skills";
import { inspectGeneratedHtml } from "@/src/lib/design/html-guard";

export const maxDuration = 300;

// 앞단 프록시/CDN(예: Cloudflare 524는 100초)에서 요청이 잘려 JSON이 아닌
// 오류 페이지가 반환되면, 클라이언트에는 원인 없는 "생성에 실패했습니다"만
// 뜬다. 그래서 생성은 항상 짧고 예측 가능한 시간(단일 패스) 안에 끝내고,
// 어떤 경우에도 그 안에서 JSON을 돌려준다. 품질은 강한 시스템 프롬프트로
// 확보하고, 추가 개선은 사용자가 채팅으로 요청하는 수정 패스에서 처리한다.
const MAIN_TIMEOUT_MS = 45_000;
// AI 호출이 어떤 이유로 멈춰도 이 데드라인에서 반드시 JSON 오류를 돌려준다.
const GENERATION_DEADLINE_MS = 55_000;

// 완성형 단일 파일 결과물은 출력이 길다: 토큰 한도는 넉넉히 주되(공급자별로
// 자동 클램프됨), 시간은 위 값으로 통제한다.
const BUILD_AI_OPTIONS = { maxTokens: 16_000, temperature: 0.7 };

class AgentDeadlineError extends Error {
  constructor() {
    super("agent generation exceeded the deadline");
    this.name = "AgentDeadlineError";
  }
}

// 어떤 비동기 작업이라도 지정 시간 내에 반드시 결말이 나도록 감싼다.
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AgentDeadlineError()), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

// '다시 디자인': 기능은 유지한 채 완전히 다른 미학 방향으로 재구성한다.
const REDESIGN_PROMPT =
  "You are an award-winning design director. The user wants a COMPLETELY DIFFERENT look for this page. " +
  "Keep every feature and all content meaning, but rebuild the visual design from scratch in a DIFFERENT aesthetic direction than the current one — different palette, different typography pairing, different layout rhythm.\n" +
  AESTHETIC_DIRECTIONS + "\n" + OPEN_SOURCE_LIBRARIES + "\n" + DESIGN_BAR + "\n" +
  "Reply with ONLY the complete rewritten HTML document — no explanation, no markdown fences.";

type AgentGenerationPlan = {
  messages: { role: "system" | "user"; content: string }[];
  provider: ReturnType<typeof parseProviderName>;
  kind: AgentBuildKind;
  refine: boolean;
  redesign: boolean;
  skillId: string | null;
  ownerId: string;
  // When set, generation runs through the metered credit boundary on this tier's
  // exact provider+model and consumes credits; otherwise the free path is used.
  tierId: AIModelTierId | null;
};

type GenerationOutcome = { payload: Record<string, unknown>; status: number };

// 채팅 한 문장으로 웹사이트·앱·프로그램·이미지를 생성/수정한다. 준비(인증·
// 검증·프롬프트 구성)는 즉시 끝내고, 실제 AI 생성은 클라이언트가
// `Accept: text/event-stream`을 보낸 경우 SSE 스트림으로 응답을 곧바로 열어
// 하트비트를 보내며 진행한다 → 앞단 프록시가 "응답 시작"을 기다리다
// 502/504로 끊는 것을 막는다. Accept가 없는(이전 버전) 클라이언트에는 일반
// JSON으로 응답해, 배포 전후 버전이 섞여 있어도 항상 동작한다.
export async function POST(request: Request) {
  let plan: AgentGenerationPlan;
  try {
    plan = await prepareGeneration(request);
  } catch (error) {
    if (error instanceof AgentInputError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
    }
    const mapped = mapAgentError(error);
    return NextResponse.json(
      { ok: false, code: mapped.code, retryable: true, error: mapped.message },
      { status: mapped.status }
    );
  }

  const wantsStream = (request.headers.get("accept") || "").includes("text/event-stream");
  if (!wantsStream) {
    const outcome = await runGeneration(plan);
    return NextResponse.json(outcome.payload, { status: outcome.status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // Stream already closed by the client.
        }
      };
      // 하트비트(SSE 주석)로 연결을 살려 프록시 타임아웃을 막는다.
      const heartbeat = setInterval(() => safeEnqueue(": ping\n\n"), 3000);
      try {
        const outcome = await runGeneration(plan);
        safeEnqueue(`event: result\ndata: ${JSON.stringify(outcome.payload)}\n\n`);
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx 등 리버스 프록시의 응답 버퍼링을 꺼 스트림이 즉시 흐르게 한다.
      "X-Accel-Buffering": "no"
    }
  });
}

// 단일 패스 생성 실행. 성공/실패 모두 JSON 페이로드와 상태 코드로 정리해,
// 스트리밍(result 이벤트)과 일반 JSON 응답이 같은 결과를 공유한다.
async function runGeneration(plan: AgentGenerationPlan): Promise<GenerationOutcome> {
  try {
    // Paid path: a selected credit tier runs on its exact provider+model and
    // consumes credits with authoritative usage. No tier keeps the free path.
    const metered = plan.tierId
      ? await withDeadline(
          runMeteredCompletion({
            ownerId: plan.ownerId,
            tierId: plan.tierId,
            surface: "agent",
            messages: plan.messages,
            maxOutputTokens: BUILD_AI_OPTIONS.maxTokens,
            temperature: BUILD_AI_OPTIONS.temperature,
            timeoutMs: MAIN_TIMEOUT_MS
          }),
          GENERATION_DEADLINE_MS
        )
      : null;
    const raw = metered
      ? metered.content
      : await withDeadline(
          chatWithAI(plan.messages, plan.provider, { ...BUILD_AI_OPTIONS, timeoutMs: MAIN_TIMEOUT_MS }),
          GENERATION_DEADLINE_MS
        );
    const code = extractArtifact(raw, plan.kind);
    if (!code) {
      return {
        status: 502,
        payload: {
          ok: false,
          code: "AGENT_RESPONSE_INVALID",
          retryable: true,
          error: "생성 결과를 해석하지 못했습니다. 다시 시도해 주세요."
        }
      };
    }
    const guard =
      plan.kind === "website" || plan.kind === "app"
        ? inspectGeneratedHtml(code)
        : { safe: true, findings: [] };
    return {
      status: 200,
      payload: {
        ok: true,
        kind: plan.kind,
        code,
        refined: plan.refine,
        redesigned: plan.redesign,
        skillId: plan.skillId,
        guard,
        ...(metered
          ? {
              tierId: metered.tierId,
              usage: metered.usage,
              settledCredits: metered.settledCredits,
              remainingCredits: metered.balance.available
            }
          : {})
      }
    };
  } catch (error) {
    console.error("[agent-build] failed:", error instanceof Error ? error.message : error);
    const mapped = mapAgentError(error);
    return {
      status: mapped.status,
      payload: { ok: false, code: mapped.code, retryable: true, error: mapped.message }
    };
  }
}

class AgentInputError extends Error {
  readonly status = 400 as const;
  readonly code = "AGENT_VALIDATION_FAILED" as const;
  constructor(message: string) {
    super(message);
    this.name = "AgentInputError";
  }
}

// 인증·입력 검증·프롬프트 구성까지의 빠른 준비 단계. 느린 AI 호출은 하지
// 않으므로, 여기서 실패하면 일반 JSON 오류로 즉시 응답한다.
async function prepareGeneration(request: Request): Promise<AgentGenerationPlan> {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    message?: unknown;
    refine?: unknown;
    redesign?: unknown;
    previousCode?: unknown;
    previousKind?: unknown;
    provider?: unknown;
    tierId?: unknown;
    history?: unknown;
    skillId?: unknown;
    useDesignSystem?: unknown;
  };
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
  const provider = parseProviderName(body.provider);
  const tierId = isAIModelTierId(body.tierId) ? body.tierId : null;
  const previousCode =
    typeof body.previousCode === "string" ? body.previousCode.slice(0, 60_000) : "";
  const previousKind = AGENT_BUILD_KINDS.has(body.previousKind as AgentBuildKind)
    ? (body.previousKind as AgentBuildKind)
    : null;
  const redesign = body.redesign === true && Boolean(previousCode) && Boolean(previousKind);
  if (!message && !redesign) {
    throw new AgentInputError("무엇을 만들지 채팅으로 설명해 주세요.");
  }
  const refine =
    !redesign && body.refine === true && Boolean(previousCode) && Boolean(previousKind);
  const kind: AgentBuildKind = refine || redesign
    ? previousKind!
    : classifyAgentRequest(message) || "website";

  const requestedSkill =
    typeof body.skillId === "string" ? getDesignSkill(body.skillId) : null;
  const skill =
    requestedSkill && requestedSkill.mode === "generate"
      ? requestedSkill
      : !refine && !redesign
        ? matchDesignSkill(message)
        : null;
  const applicableSkill = skill && skill.supportedArtifactTypes.includes(kind) ? skill : null;

  const useDesignSystem = body.useDesignSystem === true;
  const designSystemBlock = useDesignSystem
    ? "\nAesthetic direction OVERRIDE — use the DreamWish design contract below instead of picking your own direction:\n" +
      renderDesignContextForPrompt() + "\n"
    : "";
  const skillBlock = applicableSkill ? `\nSkill directive (${applicableSkill.name}): ${applicableSkill.promptDirective}\n` : "";
  const promptExtras = designSystemBlock + skillBlock;

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

  return {
    messages,
    provider,
    kind,
    refine,
    redesign,
    skillId: applicableSkill?.id ?? null,
    ownerId: owner.uid,
    tierId
  };
}

// 오류 → 표준 코드·안내 메시지·상태 매핑. 사용자에겐 안전한 안내만, 서버
// 로그에는 원인을 남긴다.
function mapAgentError(error: unknown): { code: string; message: string; status: number } {
  const detail = error instanceof Error ? error.message : "";
  if (error instanceof OwnerContextError) {
    return { code: "AGENT_PERMISSION_DENIED", message: "로그인이 필요합니다.", status: 401 };
  }
  if (error instanceof AICreditError && error.code === "AI_CREDIT_INSUFFICIENT") {
    return {
      code: "AI_CREDIT_INSUFFICIENT",
      message: "선택한 모델의 크레딧이 부족합니다. 크레딧을 충전하거나 다른 등급을 선택해 주세요.",
      status: 402
    };
  }
  if (error instanceof AICreditMeteringError) {
    if (error.code === "AI_TIER_NOT_CONFIGURED") {
      return { code: "AI_TIER_NOT_CONFIGURED", message: "선택한 모델 등급은 현재 사용할 수 없습니다.", status: 409 };
    }
    if (error.code === "AI_USAGE_UNAVAILABLE") {
      return {
        code: "AI_USAGE_UNAVAILABLE",
        message: "사용량을 확인할 수 없어 요금이 청구되지 않았습니다. 다시 시도해 주세요.",
        status: 502
      };
    }
  }
  if (/All configured AI providers failed/iu.test(detail)) {
    return {
      code: "AGENT_PROVIDER_AUTH_FAILED",
      message:
        "연결된 모든 AI 공급자 호출이 실패했습니다. 다른 모델을 선택해 다시 시도하거나, " +
        "설정에서 공급자 API 키와 사용량 한도를 확인해 주세요.",
      status: 502
    };
  }
  if (error instanceof AgentDeadlineError || /timed out|timeout|aborted|deadline/iu.test(detail)) {
    return {
      code: "AGENT_PROVIDER_TIMEOUT",
      message:
        "생성 시간이 초과되었습니다. 다른(더 빠른) 모델을 선택하거나, 요청을 나눠(핵심 구조 먼저 → 세부는 수정 요청으로) 시도해 주세요.",
      status: 502
    };
  }
  if (/rate|429|quota/iu.test(detail)) {
    return {
      code: "AGENT_USAGE_LIMIT_EXCEEDED",
      message: "AI 공급자 사용량 한도에 걸렸습니다. 잠시 후 다시 시도하거나 다른 모델을 선택해 주세요.",
      status: 502
    };
  }
  if (/not configured|provider/iu.test(detail)) {
    return {
      code: "AGENT_MODEL_NOT_AVAILABLE",
      message: "연결된 AI 공급자가 없습니다. 설정에서 AI 공급자 키를 등록해 주세요.",
      status: 502
    };
  }
  return {
    code: "AGENT_UNKNOWN_ERROR",
    message: "생성에 실패했습니다. 다른 모델을 선택하거나 잠시 후 다시 시도해 주세요.",
    status: 502
  };
}
