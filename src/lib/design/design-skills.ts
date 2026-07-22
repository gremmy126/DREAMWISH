import type { AgentBuildKind } from "../agent/agent-build";

// DreamWish Design Skills Registry. The Skill concept (atomic reusable design
// capability with declarative metadata) follows the Skills protocol of
// nexu-io/open-design (Apache-2.0); every skill definition here is
// DreamWish-original and runs on the internal Design Engine — no Open Design
// cloud dependency.

export type DesignSkillRisk = "low" | "medium";

export type DesignSkill = {
  id: string;
  name: string;
  description: string;
  /** Which artifact kinds the skill can produce or review. */
  supportedArtifactTypes: AgentBuildKind[];
  /** "generate" produces an artifact; "review" critiques an existing one. */
  mode: "generate" | "review";
  /** Appended to the engine system prompt when the skill is selected. */
  promptDirective: string;
  /** Keywords that auto-select this skill from a natural-language brief. */
  triggers: string[];
  riskLevel: DesignSkillRisk;
  version: string;
  /** Provenance: dreamwish = original, open-design-inspired = concept credit. */
  source: "dreamwish" | "open-design-inspired";
  enabled: boolean;
};

export const DESIGN_SKILLS: DesignSkill[] = [
  {
    id: "landing-page-designer",
    name: "Landing Page Designer",
    description: "전환 중심 랜딩 페이지 — hero, 핵심 흐름, 섹션 리듬, CTA 계층 설계",
    supportedArtifactTypes: ["website"],
    mode: "generate",
    promptDirective:
      "Landing page structure: sticky nav, hero with a single clear promise and one primary CTA, " +
      "3–6 value sections with real copy, social-proof only if the user supplies it, FAQ, footer with legal links. " +
      "One primary CTA style per page; secondary actions stay quiet.",
    triggers: ["랜딩", "landing", "홈페이지", "소개 페이지", "hero"],
    riskLevel: "low",
    version: "1.0.0",
    source: "open-design-inspired",
    enabled: true
  },
  {
    id: "dashboard-designer",
    name: "Dashboard Designer",
    description: "데이터 밀도가 높은 대시보드 — 상태 카드, 표, 필터, 빈 상태 설계",
    supportedArtifactTypes: ["website", "app"],
    mode: "generate",
    promptDirective:
      "Dashboard rules: stat cards with tabular numerals, a filter row (period/search), dense but readable tables " +
      "with 13–14px body and 1.5 line-height, explicit empty and error states, no decorative charts without data.",
    triggers: ["대시보드", "dashboard", "관리자", "admin", "지표", "analytics"],
    riskLevel: "low",
    version: "1.0.0",
    source: "open-design-inspired",
    enabled: true
  },
  {
    id: "mobile-ui-designer",
    name: "Mobile UI Designer",
    description: "모바일 우선 앱 화면 — 하단 내비, 44px 터치 영역, 단계형 플로우",
    supportedArtifactTypes: ["app", "website"],
    mode: "generate",
    promptDirective:
      "Mobile-first: 390px viewport is the primary target, bottom navigation or hamburger, 44px+ touch targets, " +
      "no horizontal overflow, thumb-reachable primary actions, step-by-step flows over dense forms.",
    triggers: ["모바일", "mobile", "앱 화면", "app screen"],
    riskLevel: "low",
    version: "1.0.0",
    source: "dreamwish",
    enabled: true
  },
  {
    id: "pricing-designer",
    name: "Pricing Designer",
    description: "요금제 페이지 — 플랜 비교, 월/연간 토글, FAQ, 환불 정책 링크",
    supportedArtifactTypes: ["website"],
    mode: "generate",
    promptDirective:
      "Pricing rules: 2–4 plans max, one recommended plan visually elevated, monthly/annual toggle that actually " +
      "switches numbers, benefit bullets in plain language, FAQ, refund-policy link. Never invent fake testimonials or inflated numbers.",
    triggers: ["요금", "가격", "pricing", "플랜", "구독"],
    riskLevel: "low",
    version: "1.0.0",
    source: "dreamwish",
    enabled: true
  },
  {
    id: "component-designer",
    name: "Component Designer",
    description: "단일 컴포넌트/패턴 — 버튼·카드·폼·표 등을 독립 데모로 제작",
    supportedArtifactTypes: ["website", "app"],
    mode: "generate",
    promptDirective:
      "Build ONE component (with its states: default/hover/focus/disabled/loading/error) presented on a neutral demo " +
      "page. Show light and dark variants side by side when colors are involved.",
    triggers: ["컴포넌트", "component", "버튼", "카드 디자인", "폼"],
    riskLevel: "low",
    version: "1.0.0",
    source: "dreamwish",
    enabled: true
  },
  {
    id: "data-visualization-designer",
    name: "Data Visualization Designer",
    description: "차트·그래프 중심 화면 — Chart.js 기반, 접근성 있는 데이터 표현",
    supportedArtifactTypes: ["website", "app"],
    mode: "generate",
    promptDirective:
      "Data-viz rules: use Chart.js from the allowed CDNs, label axes and units, provide the same data as an " +
      "accessible table below each chart, never fabricate impressive-looking numbers — use clearly-labeled example data the user gave or neutral placeholders.",
    triggers: ["차트", "그래프", "chart", "시각화", "visualization"],
    riskLevel: "low",
    version: "1.0.0",
    source: "open-design-inspired",
    enabled: true
  },
  {
    id: "presentation-designer",
    name: "Presentation Designer",
    description: "웹 프레젠테이션 — 가로 슬라이드 덱을 단일 HTML로 제작",
    supportedArtifactTypes: ["website"],
    mode: "generate",
    promptDirective:
      "Presentation deck as a single HTML file: full-viewport slides, keyboard (←/→) and on-screen navigation, " +
      "slide counter, consistent title/body hierarchy per slide, print-friendly CSS so the deck can be saved to PDF via the browser.",
    triggers: ["프레젠테이션", "발표", "슬라이드", "presentation", "deck", "ppt"],
    riskLevel: "low",
    version: "1.0.0",
    source: "open-design-inspired",
    enabled: true
  },
  {
    id: "brand-image-designer",
    name: "Brand Image Designer",
    description: "로고·배너·일러스트 — 브랜드 일관성 있는 SVG 아트웍",
    supportedArtifactTypes: ["image"],
    mode: "generate",
    promptDirective:
      "Vector artwork: balanced composition, harmonious palette anchored on the DreamWish violet unless the user " +
      "specifies another brand, no external references, export-ready standalone SVG.",
    triggers: ["로고", "배너", "일러스트", "logo", "banner", "썸네일"],
    riskLevel: "low",
    version: "1.0.0",
    source: "dreamwish",
    enabled: true
  },
  {
    id: "accessibility-reviewer",
    name: "Accessibility Reviewer",
    description: "접근성 검토 — 대비, 키보드, ARIA, 터치 영역, reduced-motion",
    supportedArtifactTypes: ["website", "app"],
    mode: "review",
    promptDirective:
      "Audit for WCAG AA: contrast of every text/background pair, keyboard reachability and focus-visible, " +
      "ARIA roles/labels on interactive elements, 44px touch targets, reduced-motion support, color-only state signals.",
    triggers: ["접근성", "accessibility", "a11y", "대비", "스크린리더"],
    riskLevel: "low",
    version: "1.0.0",
    source: "dreamwish",
    enabled: true
  },
  {
    id: "responsive-reviewer",
    name: "Responsive Reviewer",
    description: "반응형 검토 — 모바일 잘림, 브레이크포인트, 터치 동작",
    supportedArtifactTypes: ["website", "app"],
    mode: "review",
    promptDirective:
      "Audit responsiveness at 390px, 768px, and 1280px: horizontal overflow, nav collapse behavior, tap target " +
      "size, readable font sizes, table/code overflow containers.",
    triggers: ["반응형", "responsive", "모바일 잘림", "breakpoint"],
    riskLevel: "low",
    version: "1.0.0",
    source: "dreamwish",
    enabled: true
  },
  {
    id: "design-critic",
    name: "Design Critic",
    description: "디자인 총평 — 계층, 간격 리듬, 타이포, 색 사용, 카피 품질 평가",
    supportedArtifactTypes: ["website", "app", "image"],
    mode: "review",
    promptDirective:
      "Critique like a design director: information hierarchy, spacing rhythm, typography scale, color discipline, " +
      "CTA clarity, copy quality (no lorem ipsum, no fake numbers), consistency with the DreamWish design contract. " +
      "Return concrete, actionable findings ordered by impact.",
    triggers: ["평가", "크리틱", "critique", "리뷰", "검사"],
    riskLevel: "low",
    version: "1.0.0",
    source: "open-design-inspired",
    enabled: true
  },
  {
    id: "brand-consistency-reviewer",
    name: "Brand Consistency Reviewer",
    description: "DESIGN.md 준수 검사 — 토큰·radius·모션·보이스 일관성",
    supportedArtifactTypes: ["website", "app", "image"],
    mode: "review",
    promptDirective:
      "Check the artifact against the DreamWish DESIGN.md contract: token colors, radius scale, shadow restraint, " +
      "motion durations, Korean-first voice. Flag every divergence with the exact token that should be used.",
    triggers: ["브랜드", "일관성", "design.md", "토큰", "brand"],
    riskLevel: "low",
    version: "1.0.0",
    source: "open-design-inspired",
    enabled: true
  }
];

export function listDesignSkills(options?: { mode?: DesignSkill["mode"] }): DesignSkill[] {
  return DESIGN_SKILLS.filter(
    (skill) => skill.enabled && (!options?.mode || skill.mode === options.mode)
  );
}

export function getDesignSkill(id: string): DesignSkill | null {
  return DESIGN_SKILLS.find((skill) => skill.id === id && skill.enabled) ?? null;
}

/** Pick the best generate-mode skill for a natural-language brief. */
export function matchDesignSkill(brief: string): DesignSkill | null {
  const text = brief.toLowerCase();
  let best: { skill: DesignSkill; hits: number } | null = null;
  for (const skill of listDesignSkills({ mode: "generate" })) {
    const hits = skill.triggers.filter((trigger) => text.includes(trigger.toLowerCase())).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { skill, hits };
  }
  return best?.skill ?? null;
}
