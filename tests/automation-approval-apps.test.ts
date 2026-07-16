import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  approveAndExecuteRun,
  buildRunApprovalPreview
} from "../src/lib/automation/run-approval";
import { recordAutomationRun } from "../src/lib/automation/run.repository";
import { saveScenario } from "../src/lib/automation/scenario.repository";
import {
  callOutboundWebhook,
  sendDiscordWebhook
} from "../src/lib/business/outbound-send.service";
import {
  enrichYouTubeVideos,
  extractYouTubeId,
  formatIsoDuration
} from "../src/lib/deep-research/youtube-enrich";
import type { AutomationScenario, ScenarioNode } from "../src/lib/automation/scenario-designer";
import type { ResearchVideo } from "../src/lib/deep-research/deep-research.types";

test("approval executes GitHub issue, Notion page and webhook steps", async () => {
  await withTempDataDir(async () => {
    const { run } = await seedRun("alice", [
      node("github", { repo: "gremmy/app", title: "버그 보고", body: "상세" }),
      node("notion", { parentPageId: "page-1", title: "회의록", content: "내용" }),
      node("webhook", { url: "https://hooks.example.com/x", payload: '{"a":1}' })
    ]);

    const preview = await buildRunApprovalPreview("alice", run.id);
    assert.equal(preview!.actions.length, 3);
    assert.match(preview!.actions[0].preview, /gremmy\/app/u);
    assert.equal(preview!.actions[1].kind, "notion_page");
    assert.equal(preview!.actions[2].kind, "webhook_call");

    const calls: string[] = [];
    const updated = await approveAndExecuteRun("alice", run.id, {
      createGitHubIssue: async (_owner, input) => {
        calls.push(`github:${input.repo}:${input.title}`);
        return { ok: true, messageId: "12" };
      },
      createNotionPage: async (_owner, input) => {
        calls.push(`notion:${input.parentPageId}:${input.title}`);
        return { ok: true, messageId: "pg" };
      },
      callWebhook: async (input) => {
        calls.push(`webhook:${input.url}`);
        return { ok: true, messageId: "200" };
      }
    });
    assert.deepEqual(calls, [
      "github:gremmy/app:버그 보고",
      "notion:page-1:회의록",
      "webhook:https://hooks.example.com/x"
    ]);
    assert.ok(updated!.steps.every((step) => step.status === "success"));
    assert.equal(updated!.status, "success");
  });
});

test("webhook approval blocks unsafe destinations before any request", async () => {
  const internal = await callOutboundWebhook(
    { url: "https://192.168.0.10/hook", payload: "{}" },
    async () => {
      throw new Error("호출되면 안 됨");
    }
  );
  assert.equal(internal.ok, false);
  assert.equal(internal.code, "invalid_recipient");

  const http = await callOutboundWebhook(
    { url: "http://example.com/hook", payload: "{}" },
    async () => {
      throw new Error("호출되면 안 됨");
    }
  );
  assert.equal(http.ok, false);

  const wrongHost = await sendDiscordWebhook(
    { webhookUrl: "https://evil.com/api/webhooks/1/x", content: "hi" },
    async () => {
      throw new Error("호출되면 안 됨");
    }
  );
  assert.equal(wrongHost.ok, false);
});

test("YouTube enrichment fills channel, duration and publish date when API key exists", async () => {
  const videos: ResearchVideo[] = [
    {
      id: "v1",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      title: "기존 제목",
      channel: null,
      description: "",
      thumbnailUrl: null,
      publishedAt: null,
      durationLabel: null,
      relatedQuery: "질문"
    }
  ];
  const enriched = await enrichYouTubeVideos(videos, {
    apiKey: "test-key",
    fetchFn: async (input) => {
      const url = String(input);
      assert.match(url, /googleapis\.com\/youtube\/v3\/videos/u);
      assert.match(url, /abcdefghijk/u);
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "abcdefghijk",
              snippet: {
                title: "공식 제목",
                channelTitle: "채널명",
                publishedAt: "2026-01-02T00:00:00Z",
                description: "설명"
              },
              contentDetails: { duration: "PT1H2M3S" }
            }
          ]
        }),
        { status: 200 }
      );
    }
  });
  assert.equal(enriched[0].channel, "채널명");
  assert.equal(enriched[0].durationLabel, "1:02:03");
  assert.equal(enriched[0].publishedAt, "2026-01-02T00:00:00Z");
});

test("YouTube enrichment is a safe no-op without a key or on API failure", async () => {
  const videos: ResearchVideo[] = [
    {
      id: "v1",
      url: "https://youtu.be/abcdefghijk",
      title: "제목",
      channel: null,
      description: "",
      thumbnailUrl: null,
      publishedAt: null,
      durationLabel: null,
      relatedQuery: "q"
    }
  ];
  const noKey = await enrichYouTubeVideos(videos, { apiKey: "" });
  assert.equal(noKey[0].channel, null);

  const failed = await enrichYouTubeVideos(videos, {
    apiKey: "k",
    fetchFn: async () => new Response("quota", { status: 403 })
  });
  assert.equal(failed[0].channel, null);

  assert.equal(extractYouTubeId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeId("https://example.com/watch?v=abcdefghijk"), null);
  assert.equal(formatIsoDuration("PT4M9S"), "4:09");
  assert.equal(formatIsoDuration("bad"), null);
});

async function seedRun(ownerId: string, nodes: ScenarioNode[]) {
  const scenario: AutomationScenario = {
    id: `scenario_${Math.random()}`,
    ownerId,
    name: "앱 승인 테스트",
    description: "",
    status: "active",
    realtime: false,
    nodes,
    edges: [],
    runs: 1,
    successfulRuns: 1,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z"
  };
  await saveScenario(ownerId, scenario);
  const run = await recordAutomationRun({
    ownerId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    trigger: "schedule",
    status: "partial",
    steps: nodes.map((item, index) => ({
      nodeId: item.id,
      label: item.appId,
      operation: "send",
      order: index + 1,
      status: "approval_required",
      detail: "외부 전송 작업은 사용자 승인 후 실행됩니다."
    })),
    error: null,
    startedAt: "2026-07-16T00:00:00.000Z",
    finishedAt: "2026-07-16T00:00:01.000Z"
  });
  return { scenario, run };
}

function node(appId: string, config: Record<string, string>): ScenarioNode {
  return {
    id: `node_${appId}_${Math.random()}`,
    appId,
    label: appId,
    operation: "send",
    kind: "action",
    position: { x: 0, y: 0 },
    requiresCredential: true,
    credentialId: "cred",
    config
  };
}

async function withTempDataDir(run: () => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-approval-apps-"));
  const original = process.env.DATA_DIR;
  const originalDb = process.env.DATABASE_URL;
  process.env.DATA_DIR = directory;
  delete process.env.DATABASE_URL;
  try {
    await run();
  } finally {
    if (original === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = original;
    if (originalDb !== undefined) process.env.DATABASE_URL = originalDb;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
