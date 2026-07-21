import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readOwnerState } from "../src/lib/db/owner-state-store";
import {
  SURVEY_STORE,
  createSurvey,
  getSurvey,
  getSurveyAdminStats,
  getSurveyResults,
  issueMemberToken,
  listSurveys,
  publishSurvey,
  submitSurveyResponse
} from "../src/lib/surveys/survey.service";
import { buildDefaultDraftQuestions } from "../src/lib/surveys/survey-ai";

const OWNER = "owner-org-1";
const MEMBER_EMAIL = "m1@ex.com";

const FORBIDDEN_RESPONSE_FIELDS = [
  "userId",
  "user_id",
  "memberId",
  "member_id",
  "email",
  "name",
  "inviteId",
  "invite_id",
  "token",
  "tokenHash",
  "token_hash",
  "ip",
  "ipAddress",
  "userAgent",
  "user_agent",
  "department",
  "rank"
];

async function withTempDataDir(run: () => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-anon-"));
  process.env.DATA_DIR = dataDir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function setupWithOneResponse() {
  const survey = await createSurvey(OWNER, OWNER, {
    title: "익명성 검증 설문",
    minimumResultCount: 1,
    targetMemberEmails: [MEMBER_EMAIL, "m2@ex.com"],
    questions: buildDefaultDraftQuestions(null)
  });
  await publishSurvey(OWNER, survey.id);
  const stored = await getSurvey(OWNER, survey.id);
  const issued = await issueMemberToken(OWNER, survey.id, MEMBER_EMAIL);
  await submitSurveyResponse(
    OWNER,
    survey.id,
    issued.token,
    stored!.questions.map((question) => {
      if (question.type === "scale_1_5") return { questionId: question.id, numericValue: 5 };
      if (question.type === "multi_choice") {
        return { questionId: question.id, selectedOptions: [question.options[0]] };
      }
      return { questionId: question.id, text: "익명 의견입니다" };
    })
  );
  return { survey, token: issued.token };
}

test("responses and answers store no user identifiers, IP, or user agent", async () => {
  await withTempDataDir(async () => {
    const { token } = await setupWithOneResponse();
    const state = await readOwnerState(SURVEY_STORE, OWNER);

    assert.equal(state.responses.length, 1);
    for (const record of [...state.responses, ...state.answers]) {
      for (const field of FORBIDDEN_RESPONSE_FIELDS) {
        assert.ok(!(field in record), `forbidden field ${field} present`);
      }
    }
    // Day-bucket timestamps only.
    assert.match(state.responses[0].submittedAtBucket, /^\d{4}-\d{2}-\d{2}$/u);
    assert.match(state.responses[0].createdAtBucket, /^\d{4}-\d{2}-\d{2}$/u);

    // No serialized value anywhere in responses/answers contains the member
    // email or the raw token.
    const serialized = JSON.stringify([state.responses, state.answers]);
    assert.ok(!serialized.includes(MEMBER_EMAIL));
    assert.ok(!serialized.includes(token));
  });
});

test("no identifier links invites to responses", async () => {
  await withTempDataDir(async () => {
    await setupWithOneResponse();
    const state = await readOwnerState(SURVEY_STORE, OWNER);

    const inviteIds = new Set(state.invites.map((invite) => invite.id));
    const inviteValues = new Set(
      state.invites.flatMap((invite) => [invite.id, invite.memberKey, invite.tokenHash])
    );
    for (const response of state.responses) {
      assert.ok(!inviteIds.has(response.id));
      for (const value of Object.values(response)) {
        assert.ok(!inviteValues.has(String(value)), "response references invite data");
      }
    }
    for (const answer of state.answers) {
      for (const value of Object.values(answer)) {
        assert.ok(!inviteValues.has(String(value)), "answer references invite data");
      }
    }
  });
});

test("admin-facing reads never serialize the private invite table", async () => {
  await withTempDataDir(async () => {
    const { survey } = await setupWithOneResponse();

    const list = await listSurveys(OWNER);
    const detail = await getSurvey(OWNER, survey.id);
    const stats = await getSurveyAdminStats(OWNER, survey.id);
    const results = await getSurveyResults(OWNER, survey.id);

    const state = await readOwnerState(SURVEY_STORE, OWNER);
    const tokenHashes = state.invites.map((invite) => invite.tokenHash);
    const memberKeys = state.invites.map((invite) => invite.memberKey);

    const serialized = JSON.stringify({ list, detail, stats, results });
    assert.ok(!serialized.includes('"invites"'));
    for (const secret of [...tokenHashes, ...memberKeys]) {
      assert.ok(!serialized.includes(secret), "invite secret leaked into API payloads");
    }
    // Admin stats expose aggregate counts only.
    assert.deepEqual(
      Object.keys(stats).sort(),
      ["eligibleCount", "remainingDays", "responseCount", "responseRate"]
    );
  });
});

test("tokens are stored as hashes, never in the clear", async () => {
  await withTempDataDir(async () => {
    const { token } = await setupWithOneResponse();
    const state = await readOwnerState(SURVEY_STORE, OWNER);
    const serializedState = JSON.stringify(state);
    assert.ok(!serializedState.includes(token), "raw token persisted");
    assert.ok(state.invites.every((invite) => /^[0-9a-f]{64}$/u.test(invite.tokenHash)));
  });
});

test("survey member API routes carry tokens in the body, not the URL", async () => {
  const respondSource = await fs.readFile(
    path.join(process.cwd(), "app/api/surveys/member/respond/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(respondSource, /searchParams.*token/u);
  assert.match(respondSource, /token/u);
  assert.doesNotMatch(respondSource, /console\.(log|info|warn|error)/u);

  const tokenSource = await fs.readFile(
    path.join(process.cwd(), "app/api/surveys/member/token/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(tokenSource, /console\.(log|info|warn|error)/u);
});
