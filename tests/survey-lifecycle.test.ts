import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mutateOwnerState } from "../src/lib/db/owner-state-store";
import {
  SURVEY_STORE,
  SurveyError,
  closeSurvey,
  createSurvey,
  getSurvey,
  getSurveyAdminStats,
  getSurveyResults,
  issueMemberToken,
  listSurveysForMember,
  publishSurvey,
  submitSurveyResponse,
  updateSurveyDraft
} from "../src/lib/surveys/survey.service";
import { buildDefaultDraftQuestions } from "../src/lib/surveys/survey-ai";

const OWNER = "owner-org-1";

async function withTempDataDir(run: () => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-survey-"));
  process.env.DATA_DIR = dataDir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function createPublishedSurvey(options: {
  targets?: string[];
  minimumResultCount?: number;
} = {}) {
  const survey = await createSurvey(OWNER, OWNER, {
    title: "신제품 출시 의견수렴",
    decisionId: "decision-1",
    minimumResultCount: options.minimumResultCount ?? 5,
    targetMemberEmails: options.targets ?? [
      "m1@ex.com",
      "m2@ex.com",
      "m3@ex.com",
      "m4@ex.com",
      "m5@ex.com",
      "m6@ex.com"
    ],
    questions: buildDefaultDraftQuestions(null)
  });
  await publishSurvey(OWNER, survey.id);
  return survey;
}

function defaultAnswers(surveyQuestions: Array<{ id: string; type: string; options: string[] }>) {
  return surveyQuestions.map((question) => {
    if (question.type === "scale_1_5") return { questionId: question.id, numericValue: 4 };
    if (question.type === "multi_choice") {
      return { questionId: question.id, selectedOptions: [question.options[0]] };
    }
    if (question.type === "yes_no") return { questionId: question.id, selectedOptions: ["예"] };
    if (question.type === "open_text") {
      return { questionId: question.id, text: "단계적 출시가 좋겠습니다." };
    }
    return { questionId: question.id, selectedOptions: [question.options[0]] };
  });
}

test("survey create, publish, respond, and close lifecycle works end to end", async () => {
  await withTempDataDir(async () => {
    const survey = await createPublishedSurvey();
    const stored = await getSurvey(OWNER, survey.id);
    assert.equal(stored?.status, "active");
    assert.equal(stored?.anonymityMode, "verified_anonymous");
    assert.equal(stored?.minimumResultCount, 5);

    const issued = await issueMemberToken(OWNER, survey.id, "m1@ex.com");
    assert.ok(issued.token.length >= 40);

    const result = await submitSurveyResponse(
      OWNER,
      survey.id,
      issued.token,
      defaultAnswers(stored!.questions)
    );
    assert.ok(result.responseId);

    const stats = await getSurveyAdminStats(OWNER, survey.id);
    assert.equal(stats.responseCount, 1);
    assert.equal(stats.eligibleCount, 6);

    const closed = await closeSurvey(OWNER, survey.id);
    assert.equal(closed.status, "closed");
  });
});

test("used tokens, expired tokens, and closed surveys are rejected", async () => {
  await withTempDataDir(async () => {
    const survey = await createPublishedSurvey();
    const stored = await getSurvey(OWNER, survey.id);

    // Used token cannot be replayed.
    const first = await issueMemberToken(OWNER, survey.id, "m1@ex.com");
    await submitSurveyResponse(OWNER, survey.id, first.token, defaultAnswers(stored!.questions));
    await assert.rejects(
      submitSurveyResponse(OWNER, survey.id, first.token, defaultAnswers(stored!.questions)),
      (error: unknown) => error instanceof SurveyError && error.code === "TOKEN_USED"
    );
    // A member who already responded cannot get a fresh token either.
    await assert.rejects(
      issueMemberToken(OWNER, survey.id, "m1@ex.com"),
      (error: unknown) => error instanceof SurveyError && error.code === "ALREADY_RESPONDED"
    );

    // Expired token is rejected before anything is stored.
    const second = await issueMemberToken(OWNER, survey.id, "m2@ex.com");
    await mutateOwnerState(SURVEY_STORE, OWNER, (state) => {
      for (const invite of state.invites) {
        if (!invite.redeemedAt) invite.expiresAt = new Date(Date.now() - 1000).toISOString();
      }
    });
    await assert.rejects(
      submitSurveyResponse(OWNER, survey.id, second.token, defaultAnswers(stored!.questions)),
      (error: unknown) => error instanceof SurveyError && error.code === "TOKEN_EXPIRED"
    );

    // Closed survey refuses new submissions.
    const third = await issueMemberToken(OWNER, survey.id, "m3@ex.com");
    await closeSurvey(OWNER, survey.id);
    await assert.rejects(
      submitSurveyResponse(OWNER, survey.id, third.token, defaultAnswers(stored!.questions)),
      (error: unknown) => error instanceof SurveyError && error.code === "SURVEY_CLOSED"
    );

    // Invalid token never matches.
    await assert.rejects(
      submitSurveyResponse(OWNER, survey.id, "not-a-real-token", []),
      (error: unknown) => error instanceof SurveyError && error.code === "TOKEN_INVALID"
    );
  });
});

test("a failed save keeps the token unredeemed (single transaction)", async () => {
  await withTempDataDir(async () => {
    const survey = await createPublishedSurvey();
    const stored = await getSurvey(OWNER, survey.id);
    const issued = await issueMemberToken(OWNER, survey.id, "m1@ex.com");

    // Required questions unanswered -> validation error inside the transaction.
    await assert.rejects(
      submitSurveyResponse(OWNER, survey.id, issued.token, []),
      (error: unknown) => error instanceof SurveyError && error.code === "VALIDATION"
    );

    // Nothing was persisted and the same token still works.
    const stats = await getSurveyAdminStats(OWNER, survey.id);
    assert.equal(stats.responseCount, 0);
    const retry = await submitSurveyResponse(
      OWNER,
      survey.id,
      issued.token,
      defaultAnswers(stored!.questions)
    );
    assert.ok(retry.responseId);
  });
});

test("draft editing is allowed, published editing is not", async () => {
  await withTempDataDir(async () => {
    const survey = await createSurvey(OWNER, OWNER, {
      title: "초안",
      targetMemberEmails: ["m1@ex.com"],
      questions: buildDefaultDraftQuestions(null)
    });
    const updated = await updateSurveyDraft(OWNER, survey.id, { title: "수정된 초안" });
    assert.equal(updated.title, "수정된 초안");

    await publishSurvey(OWNER, survey.id);
    await assert.rejects(
      updateSurveyDraft(OWNER, survey.id, { title: "게시 후 수정" }),
      (error: unknown) => error instanceof SurveyError && error.code === "VALIDATION"
    );
  });
});

test("results unlock only at the minimum result count", async () => {
  await withTempDataDir(async () => {
    const survey = await createPublishedSurvey({ minimumResultCount: 5 });
    const stored = await getSurvey(OWNER, survey.id);

    for (const email of ["m1@ex.com", "m2@ex.com", "m3@ex.com", "m4@ex.com"]) {
      const issued = await issueMemberToken(OWNER, survey.id, email);
      await submitSurveyResponse(OWNER, survey.id, issued.token, defaultAnswers(stored!.questions));
    }

    const locked = await getSurveyResults(OWNER, survey.id);
    assert.equal(locked.locked, true);
    if (locked.locked) {
      assert.equal(locked.responseCount, 4);
      assert.equal(locked.minimumResultCount, 5);
      // Waiting state exposes counts only.
      assert.deepEqual(
        Object.keys(locked).sort(),
        ["locked", "minimumResultCount", "responseCount", "status"]
      );
    }

    const fifth = await issueMemberToken(OWNER, survey.id, "m5@ex.com");
    await submitSurveyResponse(OWNER, survey.id, fifth.token, defaultAnswers(stored!.questions));

    const open = await getSurveyResults(OWNER, survey.id);
    assert.equal(open.locked, false);
    if (!open.locked) {
      assert.equal(open.aggregate.responseCount, 5);
      assert.ok(open.aggregate.employeeSignalScore !== null);
      assert.ok(open.openAnswers.length >= 1);
    }
  });
});

test("members see their surveys and states without exposing others", async () => {
  await withTempDataDir(async () => {
    const survey = await createPublishedSurvey();
    const stored = await getSurvey(OWNER, survey.id);

    const before = await listSurveysForMember("m1@ex.com");
    assert.equal(before.length, 1);
    assert.equal(before[0].myState, "pending");
    assert.equal(before[0].questionCount, stored!.questions.length);

    const issued = await issueMemberToken(OWNER, survey.id, "m1@ex.com");
    await submitSurveyResponse(OWNER, survey.id, issued.token, defaultAnswers(stored!.questions));

    const after = await listSurveysForMember("m1@ex.com");
    assert.equal(after[0].myState, "completed");

    const outsider = await listSurveysForMember("stranger@ex.com");
    assert.equal(outsider.length, 0);

    await assert.rejects(
      issueMemberToken(OWNER, survey.id, "stranger@ex.com"),
      (error: unknown) => error instanceof SurveyError && error.code === "NOT_ELIGIBLE"
    );
  });
});

test("tenant isolation: another organization cannot reach the survey", async () => {
  await withTempDataDir(async () => {
    const survey = await createPublishedSurvey();
    assert.equal(await getSurvey("other-org", survey.id), null);
    await assert.rejects(
      getSurveyResults("other-org", survey.id),
      (error: unknown) => error instanceof SurveyError && error.code === "SURVEY_NOT_FOUND"
    );
    // The transaction checks the token hash first (spec order), so a foreign
    // organization learns nothing beyond "invalid token".
    await assert.rejects(
      submitSurveyResponse("other-org", survey.id, "any-token", []),
      (error: unknown) =>
        error instanceof SurveyError &&
        (error.code === "TOKEN_INVALID" || error.code === "SURVEY_NOT_FOUND")
    );
  });
});
