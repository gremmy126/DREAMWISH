import assert from "node:assert/strict";
import { canTransitionArtifactStatus } from "../src/lib/design/design-artifacts.repository";
import { findDesignMdSection, loadDesignMd, parseDesignMd } from "../src/lib/design/design-md";
import {
  getDesignSkill,
  listDesignSkills,
  matchDesignSkill
} from "../src/lib/design/design-skills";
import { DESIGN_TOKENS, renderTokensForPrompt } from "../src/lib/design/design-tokens";

test("DESIGN.md parser splits sections and keeps the title", () => {
  const parsed = parseDesignMd(
    "# Sample System\n\nintro\n\n## 1. Brand\nbrand body\n\n## 2. Color\ncolor body\n"
  );
  assert.equal(parsed.title, "Sample System");
  assert.equal(parsed.sections.length, 2);
  assert.equal(parsed.sections[0].heading, "1. Brand");
  assert.equal(parsed.sections[0].body, "brand body");
  assert.equal(findDesignMdSection(parsed, "color")?.body, "color body");
});

test("the real design-system/DESIGN.md loads with the core contract sections", () => {
  const document = loadDesignMd();
  assert.match(document.title, /DreamWish/u);
  for (const keyword of ["Brand", "Color", "Typography", "Motion", "Accessibility"]) {
    assert.ok(
      findDesignMdSection(document, keyword),
      `DESIGN.md must contain a ${keyword} section`
    );
  }
});

test("design tokens cover semantic colors and feed the engine prompt", () => {
  const names = DESIGN_TOKENS.map((token) => token.name);
  for (const required of ["primary", "success", "warning", "danger", "info"]) {
    assert.ok(names.includes(required), `token ${required} missing`);
  }
  const prompt = renderTokensForPrompt();
  assert.match(prompt, /#6d5df6/iu);
  assert.match(prompt, /reduced-motion/u);
});

test("design skills registry matches briefs and hides nothing invalid", () => {
  assert.equal(matchDesignSkill("우리 회사 랜딩 페이지 만들어줘")?.id, "landing-page-designer");
  assert.equal(matchDesignSkill("관리자 대시보드 새로 디자인해줘")?.id, "dashboard-designer");
  assert.equal(matchDesignSkill("아무 관련 없는 요청")?.id, undefined);
  // review-mode skills are never auto-matched for generation.
  assert.ok(listDesignSkills({ mode: "generate" }).every((skill) => skill.mode === "generate"));
  assert.equal(getDesignSkill("design-critic")?.mode, "review");
  assert.equal(getDesignSkill("no-such-skill"), null);
});

test("artifact status lifecycle allows the approval flow and blocks nonsense", () => {
  assert.ok(canTransitionArtifactStatus("ready", "approved"));
  assert.ok(canTransitionArtifactStatus("ready", "review"));
  assert.ok(canTransitionArtifactStatus("review", "approved"));
  assert.ok(canTransitionArtifactStatus("approved", "archived"));
  assert.ok(!canTransitionArtifactStatus("archived", "approved"));
  assert.ok(!canTransitionArtifactStatus("draft", "approved"));
});
