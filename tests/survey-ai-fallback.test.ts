import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildDefaultDraftQuestions,
  generateSurveyDraft,
  generateSurveySummary
} from "../src/lib/surveys/survey-ai";
import {
  createSurvey,
  getSurvey,
  getSurveyResults,
  issueMemberToken,
  publishSurvey,
  submitSurveyResponse
} from "../src/lib/surveys/survey.service";

const OWNER = "owner-org-1";

const AI_ENV_KEYS = [
  "AI_PROVIDER",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "HUGGINGFACE_API_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN"
];

async function withoutAiProviders(run: () => Promise<void>) {
  const saved = new Map<string, string | undefined>();
  for (const key of AI_ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  try {
    await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("the default AI draft contains the five specified base questions", () => {
  const questions = buildDefaultDraftQuestions(null);
  assert.equal(questions.length, 5);

  const [agree, impact, feasibility, risk, open] = questions;
  assert.equal(agree.type, "scale_1_5");
  assert.equal(agree.decisionCriterion, "support");
  assert.match(agree.prompt, /동의/u);
  assert.equal(impact.type, "scale_1_5");
  assert.equal(impact.decisionCriterion, "impact");
  assert.equal(feasibility.type, "scale_1_5");
  assert.equal(feasibility.decisionCriterion, "feasibility");
  assert.equal(risk.type, "multi_choice");
  assert.equal(risk.decisionCriterion, "risk");
  assert.equal(risk.scoreDirection, "negative");
  assert.ok(risk.options.length >= 2);
  assert.equal(open.type, "open_text");
  assert.match(open.prompt, /놓친 문제|대안/u);
});

test("AI draft generation falls back to defaults when no provider works", async () => {
  await withoutAiProviders(async () => {
    const decision = {
      id: "decision-1",
      title: "신제품 출시",
      objective: "3분기 출시 여부 결정",
      status: "draft",
      problem: {
        statement: "",
        goals: [],
        constraints: ["예산 5,000만 원"],
        budget: "",
        deadline: "",
        riskTolerance: "medium",
        successCriteria: [],
        reversible: true
      },
      criteria: [],
      alternatives: [],
      scenarios: [],
      recommendation: null,
      finalDecision: null,
      executionPlan: [],
      retrospective: null,
      employeeSignalWeight: 0.15,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as never;
    const draft = await generateSurveyDraft(decision);
    assert.equal(draft.source, "default");
    assert.equal(draft.questions.length, 5);
  });
});

test("AI summary failure returns null and leaves statistics fully available", async () => {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-ai-fallback-"));
  process.env.DATA_DIR = dataDir;
  try {
    await withoutAiProviders(async () => {
      const survey = await createSurvey(OWNER, OWNER, {
        title: "AI 실패 내성 검증",
        minimumResultCount: 1,
        targetMemberEmails: ["m1@ex.com"],
        questions: buildDefaultDraftQuestions(null)
      });
      await publishSurvey(OWNER, survey.id);
      const stored = await getSurvey(OWNER, survey.id);
      const issued = await issueMemberToken(OWNER, survey.id, "m1@ex.com");
      await submitSurveyResponse(
        OWNER,
        survey.id,
        issued.token,
        stored!.questions.map((question) => {
          if (question.type === "scale_1_5") return { questionId: question.id, numericValue: 3 };
          if (question.type === "multi_choice") {
            return { questionId: question.id, selectedOptions: [question.options[0]] };
          }
          return { questionId: question.id, text: "의견" };
        })
      );

      const results = await getSurveyResults(OWNER, survey.id);
      assert.equal(results.locked, false);
      if (results.locked) return;

      const summary = await generateSurveySummary(results.aggregate, results.openAnswers);
      assert.equal(summary, null);

      // Statistics stay intact after the AI failure.
      const again = await getSurveyResults(OWNER, survey.id);
      assert.equal(again.locked, false);
      if (!again.locked) {
        assert.equal(again.aggregate.responseCount, 1);
        assert.ok(again.aggregate.employeeSignalScore !== null);
      }
    });
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
