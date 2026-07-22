import { NextResponse } from "next/server";
import { z } from "zod";
import { chatWithAI } from "@/src/lib/ai/ai.service";
import { parseProviderName } from "@/src/lib/ai/provider-options";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { renderDesignContextForPrompt } from "@/src/lib/design/design-md";
import { getDesignSkill } from "@/src/lib/design/design-skills";
import { mcpErrorResponse } from "@/src/lib/mcp/mcp-http";

export const maxDuration = 120;

const critiqueSchema = z.object({
  code: z.string().min(20).max(200_000),
  kind: z.enum(["website", "app", "image"]).default("website"),
  /** review-mode skill to run; defaults to the general design critic. */
  skillId: z.string().max(80).optional(),
  provider: z.string().max(40).optional()
});

const CRITIQUE_SYSTEM =
  "You are a rigorous design director reviewing an artifact against the DreamWish design contract below. " +
  "Return ONLY minified JSON: {\"score\": 0-100, \"summary\": \"one Korean sentence\", " +
  "\"findings\": [{\"severity\": \"high|medium|low\", \"area\": \"hierarchy|color|typography|spacing|accessibility|responsive|copy|brand\", " +
  "\"message\": \"Korean, concrete and actionable\"}]} with at most 8 findings ordered by impact. No markdown fences.";

// AI critique of a generated artifact against DESIGN.md — step 9 of the
// Design Agent loop (generate → preview → critique → revise → approve).
export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    void owner;
    const parsed = critiqueSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "평가할 코드를 확인해 주세요." }, { status: 400 });
    }
    const { code, kind, skillId, provider } = parsed.data;
    const skill = skillId ? getDesignSkill(skillId) : null;
    const skillDirective = skill && skill.mode === "review" ? `\n\nFocus: ${skill.promptDirective}` : "";

    const raw = await chatWithAI(
      [
        {
          role: "system",
          content: `${CRITIQUE_SYSTEM}${skillDirective}\n\n${renderDesignContextForPrompt()}`
        },
        {
          role: "user",
          content: `Artifact kind: ${kind}\n\n${code.slice(0, 60_000)}`
        }
      ],
      parseProviderName(provider),
      { timeoutMs: 90_000, maxTokens: 2_000, temperature: 0.3 }
    );

    const critique = parseCritique(raw);
    if (!critique) {
      return NextResponse.json(
        { ok: false, error: "평가 결과를 해석하지 못했습니다. 다시 시도해 주세요." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, critique, skillId: skill?.id ?? "design-critic" });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

const critiqueResultSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string().min(1).max(500),
  findings: z
    .array(
      z.object({
        severity: z.enum(["high", "medium", "low"]),
        area: z.string().max(40),
        message: z.string().min(1).max(500)
      })
    )
    .max(8)
});

function parseCritique(raw: string) {
  const candidate = raw.match(/\{[\s\S]*\}/u)?.[0];
  if (!candidate) return null;
  try {
    const parsed = critiqueResultSchema.safeParse(JSON.parse(candidate));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
