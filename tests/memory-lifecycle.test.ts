import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-bytes";

test("conversation capture creates a pending candidate without approving memory", async () => {
  await withTempDataDir(async () => {
    const chat = requireProjectModule<
      typeof import("../src/lib/db/repositories/chat.repository")
    >("src/lib/db/repositories/chat.repository.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const engine = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");

    const session = await chat.createSession("uid-a", "Preference");
    const userMessage = await chat.addMessage({
      ownerId: "uid-a",
      sessionId: session.id,
      role: "user",
      content: "I prefer concise answers."
    });
    const assistantMessage = await chat.addMessage({
      ownerId: "uid-a",
      sessionId: session.id,
      role: "assistant",
      content: "I will answer concisely."
    });

    const capture = await lifecycle.captureConversationMemory({
      ownerId: "uid-a",
      sessionId: session.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      userMessage: userMessage.content,
      assistantAnswer: assistantMessage.content
    });

    assert.equal(capture.status, "completed");
    assert.equal(capture.job.ownerId, "uid-a");
    assert.equal(capture.candidates.length, 1);
    assert.equal(capture.candidates[0].ownerId, "uid-a");
    assert.equal(capture.candidates[0].status, "pending");
    assert.equal(capture.candidates[0].sourceSessionId, session.id);
    assert.deepEqual(capture.candidates[0].sourceMessageIds, [
      userMessage.id,
      assistantMessage.id
    ]);
    assert.equal((await engine.listApprovedMemories("uid-a")).length, 0);
  });
});

test("retrying the same conversation capture does not duplicate jobs or candidates", async () => {
  await withTempDataDir(async (dataDir) => {
    const chat = requireProjectModule<
      typeof import("../src/lib/db/repositories/chat.repository")
    >("src/lib/db/repositories/chat.repository.ts");
    const { captureConversationMemory } = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");

    const session = await chat.createSession("uid-a", "Retry");
    const userMessage = await chat.addMessage({
      ownerId: "uid-a",
      sessionId: session.id,
      role: "user",
      content: "Remember this preference."
    });
    const assistantMessage = await chat.addMessage({
      ownerId: "uid-a",
      sessionId: session.id,
      role: "assistant",
      content: "I will remember it after approval."
    });
    const input = {
      ownerId: "uid-a",
      sessionId: session.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      userMessage: userMessage.content,
      assistantAnswer: assistantMessage.content
    };

    const first = await captureConversationMemory(input);
    const retry = await captureConversationMemory(input);
    const db = JSON.parse(fs.readFileSync(path.join(dataDir, "memory.json"), "utf8")) as {
      candidates: Array<{ id: string }>;
      captureJobs: Array<{ id: string }>;
    };

    assert.equal(retry.job.id, first.job.id);
    assert.equal(retry.candidates[0].id, first.candidates[0].id);
    assert.equal(db.captureJobs.length, 1);
    assert.equal(db.candidates.length, 1);
  });
});

test("approval validates archived chat provenance and materializes owner-scoped derived data", async () => {
  await withTempDataDir(async (dataDir) => {
    const chat = requireProjectModule<
      typeof import("../src/lib/db/repositories/chat.repository")
    >("src/lib/db/repositories/chat.repository.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const engine = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");

    const session = await chat.createSession("uid-a", "Archived provenance");
    const userMessage = await chat.addMessage({
      ownerId: "uid-a",
      sessionId: session.id,
      role: "user",
      content: "I prefer concise answers."
    });
    const assistantMessage = await chat.addMessage({
      ownerId: "uid-a",
      sessionId: session.id,
      role: "assistant",
      content: "I will answer concisely."
    });
    const capture = await lifecycle.captureConversationMemory({
      ownerId: "uid-a",
      sessionId: session.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      userMessage: userMessage.content,
      assistantAnswer: assistantMessage.content
    });
    await chat.archiveSession("uid-a", session.id);

    const approved = await lifecycle.approveCandidate("uid-a", capture.candidates[0].id, {
      expectedVersion: 1,
      content: "The user prefers concise answers.",
      note: "Confirmed"
    });
    const ownerHash = createHash("sha256").update("uid-a").digest("hex");
    const markdownPath = path.join(dataDir, approved.markdownPath);
    const db = JSON.parse(fs.readFileSync(path.join(dataDir, "memory.json"), "utf8")) as {
      embeddings: Array<{ ownerId: string; memoryId: string }>;
    };

    assert.equal(approved.status, "approved");
    assert.equal(approved.version, 2);
    assert.equal(approved.approvedBy, "uid-a");
    assert.equal(approved.content, "The user prefers concise answers.");
    assert.match(approved.markdownPath, new RegExp(`^memory-markdown/${ownerHash}/`, "u"));
    assert.equal(fs.existsSync(markdownPath), true);
    assert.deepEqual(
      db.embeddings.map(({ ownerId, memoryId }) => ({ ownerId, memoryId })),
      [{ ownerId: "uid-a", memoryId: approved.id }]
    );
    assert.deepEqual((await engine.listApprovedMemories("uid-a")).map((item) => item.id), [
      approved.id
    ]);
    assert.equal((await engine.listApprovedMemories("uid-b")).length, 0);
    await assert.rejects(
      () => lifecycle.rejectCandidate("uid-a", approved.id, { expectedVersion: 1 }),
      /MEMORY_CONFLICT/u
    );
  });
});

test("foreign owners receive a masked 404 for lifecycle transitions", async () => {
  await withTempDataDir(async () => {
    const { createMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const candidate = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "manual-note-a",
      content: "Private owner A memory"
    });

    for (const transition of [
      () => lifecycle.approveCandidate("uid-b", candidate.id, { expectedVersion: 1 }),
      () => lifecycle.rejectCandidate("uid-b", candidate.id, { expectedVersion: 1 })
    ]) {
      await assert.rejects(transition, (error: unknown) => {
        assert.ok(error instanceof lifecycle.MemoryLifecycleError);
        assert.equal(error.code, "MEMORY_NOT_FOUND");
        assert.equal(error.status, 404);
        return true;
      });
    }

    const approved = await lifecycle.approveCandidate("uid-a", candidate.id, {
      expectedVersion: 1
    });
    await assert.rejects(
      () =>
        lifecycle.correctApprovedMemory("uid-b", approved.id, {
          expectedVersion: approved.version,
          content: "Foreign correction"
        }),
      (error: unknown) => {
        assert.ok(error instanceof lifecycle.MemoryLifecycleError);
        assert.equal(error.code, "MEMORY_NOT_FOUND");
        assert.equal(error.status, 404);
        return true;
      }
    );
  });
});

test("correction increments version and forgetting removes approved derived data", async () => {
  await withTempDataDir(async (dataDir) => {
    const { createMemoryCandidate, listApprovedMemories } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const candidate = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "manual-correction-a",
      content: "Original content"
    });
    const approved = await lifecycle.approveCandidate("uid-a", candidate.id, {
      expectedVersion: 1
    });

    const corrected = await lifecycle.correctApprovedMemory("uid-a", approved.id, {
      expectedVersion: 2,
      content: "Corrected content"
    });
    const markdownPath = path.join(dataDir, corrected.markdownPath);
    assert.equal(corrected.status, "approved");
    assert.equal(corrected.version, 3);
    assert.equal(corrected.content, "Corrected content");
    assert.notEqual(corrected.embeddingId, approved.embeddingId);
    assert.match(fs.readFileSync(markdownPath, "utf8"), /Corrected content/u);

    const forgotten = await lifecycle.forgetApprovedMemory("uid-a", corrected.id, {
      expectedVersion: 3
    });
    const db = JSON.parse(fs.readFileSync(path.join(dataDir, "memory.json"), "utf8")) as {
      embeddings: Array<{ ownerId: string; memoryId: string }>;
      memories: Array<{ id: string; status: string; version: number; history?: unknown[] }>;
    };
    const stored = db.memories.find((item) => item.id === forgotten.id);

    assert.equal(forgotten.status, "forgotten");
    assert.equal(forgotten.version, 4);
    assert.equal(fs.existsSync(markdownPath), false);
    assert.equal((await listApprovedMemories("uid-a")).length, 0);
    assert.equal(
      db.embeddings.some(
        (embedding) =>
          embedding.ownerId === "uid-a" && embedding.memoryId === forgotten.id
      ),
      false
    );
    assert.equal(stored?.status, "forgotten");
    assert.equal(stored?.version, 4);
    assert.ok((stored?.history?.length || 0) >= 3);

    const search = requireProjectModule<
      typeof import("../src/lib/memory/memory-search")
    >("src/lib/memory/memory-search.ts");
    const { buildKnowledgeNetwork } = requireProjectModule<
      typeof import("../src/lib/memory/knowledge-network")
    >("src/lib/memory/knowledge-network.ts");
    assert.equal(
      (await search.quickMemorySearch("Corrected content", { ownerId: "uid-a" }))
        .results.length,
      0
    );
    assert.equal(
      (await search.deepThinkSearch("Corrected content", { ownerId: "uid-a" }))
        .sources.length,
      0
    );
    assert.equal(
      (await buildKnowledgeNetwork({ ownerId: "uid-a" })).nodes.some(
        (node) => node.type === "memory" && node.sourceIds.includes(forgotten.id)
      ),
      false
    );
  });
});

test("rejection increments version and remains visible only to its owner", async () => {
  await withTempDataDir(async () => {
    const engine = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const { rejectCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const candidate = await engine.createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "manual-reject-a",
      content: "Reject this candidate"
    });

    const rejected = await rejectCandidate("uid-a", candidate.id, {
      expectedVersion: 1
    });

    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.version, 2);
    assert.equal(rejected.history?.at(-1)?.event, "Memory rejected");
    assert.deepEqual(
      (await engine.listMemoryCandidates("uid-a", { status: "rejected" })).map(
        (item) => item.id
      ),
      [candidate.id]
    );
    assert.equal(
      (await engine.listMemoryCandidates("uid-b", { status: "rejected" })).length,
      0
    );
  });
});

test("legacy auto-memory calls fail closed instead of auto-approving", async () => {
  await withTempDataDir(async () => {
    const { runAutoMemoryEngineQuietly } = requireProjectModule<
      typeof import("../src/lib/memory/auto-memory-engine")
    >("src/lib/memory/auto-memory-engine.ts");
    const { readMemoryDb } = requireProjectModule<
      typeof import("../src/lib/memory/memory-repository")
    >("src/lib/memory/memory-repository.ts");

    const originalConsoleError = console.error;
    let loggedError = false;
    console.error = () => {
      loggedError = true;
    };
    let result: Awaited<ReturnType<typeof runAutoMemoryEngineQuietly>>;
    try {
      result = await runAutoMemoryEngineQuietly({
        sessionId: "legacy-session",
        userMessage: "Remember this preference.",
        assistantAnswer: "I will remember it."
      });
    } finally {
      console.error = originalConsoleError;
    }
    const db = await readMemoryDb();

    assert.equal(result, null);
    assert.equal(loggedError, false);
    assert.equal(db.memories.length, 0);
    assert.equal(db.embeddings.length, 0);
    assert.equal(db.candidates.length, 0);
  });
});

test("dashboard and daily briefing include only approved memory for one owner", async () => {
  await withTempDataDir(async () => {
    const engine = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const { approveCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    for (const ownerId of ["uid-a", "uid-b"]) {
      const candidate = await engine.createMemoryCandidate({
        ownerId,
        source: "manual",
        sourceId: `manual-${ownerId}`,
        title: `Private ${ownerId}`,
        content: `Important private memory for ${ownerId}`,
        importance: 0.95
      });
      await approveCandidate(ownerId, candidate.id, { expectedVersion: 1 });
    }

    const dashboard = await engine.buildMemoryDashboardSnapshot("uid-a");
    const daily = await engine.generateDailyMemoryBrief("uid-a", {
      date: "2026-07-11"
    });

    assert.equal(dashboard.statistics.totalMemories, 1);
    assert.deepEqual(dashboard.recentMemory.map((item) => item.ownerId), ["uid-a"]);
    assert.deepEqual(dashboard.timeline.map((item) => item.title), ["Private uid-a"]);
    assert.deepEqual(daily.importantMemories, ["Private uid-a"]);
  });
});

test("memory change previews and undo are owner scoped", async () => {
  await withTempDataDir(async () => {
    const engine = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const execution = requireProjectModule<
      typeof import("../src/lib/memory/memory-execution")
    >("src/lib/memory/memory-execution.ts");
    const candidate = await engine.createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "manual-preview-a",
      content: "Preview target"
    });
    const approved = await lifecycle.approveCandidate("uid-a", candidate.id, {
      expectedVersion: 1
    });
    const preview = await execution.createMemoryChangePreview("uid-a", {
      action: "update",
      targetId: approved.id,
      proposedContent: "Proposed correction"
    });

    assert.equal(preview.ownerId, "uid-a");
    assert.equal(preview.version, 1);
    assert.deepEqual(await execution.undoMemoryChange("uid-b", preview.id), {
      ok: false,
      error: "Memory change preview not found"
    });
    assert.deepEqual(await execution.undoMemoryChange("uid-a", preview.id), {
      ok: true
    });
  });
});

test("external capture stamps the server owner and remains pending", async () => {
  await withTempDataDir(async () => {
    const { captureExternalMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/external-memory-capture")
    >("src/lib/memory/external-memory-capture.ts");
    const { listMemoryCandidates } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");

    const candidate = await captureExternalMemoryCandidate({
      ownerId: "uid-a",
      connectorId: "gmail",
      sourceId: "gmail-message-1",
      title: "Renewal",
      content: "A customer requested renewal follow-up.",
      preview: "Renewal follow-up"
    });

    assert.equal(candidate.ownerId, "uid-a");
    assert.equal(candidate.status, "pending");
    assert.equal(candidate.sourceId, "gmail-message-1");
    assert.deepEqual(candidate.sourceMessageIds, []);
    assert.deepEqual(
      (await listMemoryCandidates("uid-a", { status: "pending" })).map(
        (item) => item.id
      ),
      [candidate.id]
    );
    assert.equal(
      (await listMemoryCandidates("uid-b", { status: "pending" })).length,
      0
    );
  });
});

test("memory repository upserts use owner and id as the composite key", async () => {
  await withTempDataDir(async () => {
    const repository = requireProjectModule<
      typeof import("../src/lib/memory/memory-repository")
    >("src/lib/memory/memory-repository.ts");
    const now = new Date().toISOString();
    for (const ownerId of ["uid-a", "uid-b"]) {
      await repository.upsertMemoryCaptureJob({
        id: "shared-capture-id",
        ownerId,
        sourceSessionId: `session-${ownerId}`,
        sourceMessageIds: [`message-${ownerId}`],
        status: "completed",
        attempts: 1,
        lastErrorCode: null,
        createdAt: now,
        updatedAt: now
      });
    }

    const jobs = (await repository.readMemoryDb()).captureJobs;
    assert.equal(jobs.length, 2);
    assert.deepEqual(
      jobs.map((job) => job.ownerId).sort(),
      ["uid-a", "uid-b"]
    );
  });
});

test("MCP memory execution uses its server owner argument and ignores payload ownership", async () => {
  await withTempDataDir(async () => {
    const engine = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const { approveCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const { runMemoryMcpTool } = requireProjectModule<
      typeof import("../src/lib/memory/mcp-memory-server")
    >("src/lib/memory/mcp-memory-server.ts");
    for (const ownerId of ["uid-a", "uid-b"]) {
      const candidate = await engine.createMemoryCandidate({
        ownerId,
        source: "manual",
        sourceId: `manual-mcp-${ownerId}`,
        title: `MCP ${ownerId}`,
        content: `MCP private ${ownerId}`
      });
      await approveCandidate(ownerId, candidate.id, { expectedVersion: 1 });
    }

    const search = await runMemoryMcpTool("uid-a", "memory.search", {
      query: "MCP private",
      ownerId: "uid-b"
    });
    assert.equal(search.ok, true);
    const searchData = search.ok
      ? (search.data as { results: Array<{ title: string }> })
      : { results: [] };
    assert.deepEqual(searchData.results.map((item) => item.title), ["MCP uid-a"]);

    const capture = await runMemoryMcpTool("uid-a", "memory.capture", {
      source: "manual",
      sourceId: "mcp-manual-a",
      content: "Pending from MCP",
      ownerId: "uid-b"
    });
    assert.equal(capture.ok, true);
    assert.equal(
      capture.ok ? (capture.data as { ownerId: string }).ownerId : null,
      "uid-a"
    );
  });
});

test("memory mutation routes derive owner and approver from the signed session", async () => {
  await withTempDataDir(async () => {
    await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
      const { createSessionToken, SESSION_COOKIE_NAME } = require(
        "../src/lib/auth/session-token"
      ) as typeof import("../src/lib/auth/session-token");
      const cookieA = `${SESSION_COOKIE_NAME}=${await createSessionToken({
        uid: "uid-a",
        email: "a@example.com",
        paid: true
      })}`;
      const cookieB = `${SESSION_COOKIE_NAME}=${await createSessionToken({
        uid: "uid-b",
        email: "b@example.com",
        paid: true
      })}`;
      const candidatesRoute = requireProjectModule<
        typeof import("../app/api/memory/candidates/route")
      >("app/api/memory/candidates/route.ts");
      const approveRoute = requireProjectModule<
        typeof import("../app/api/memory/candidates/[id]/approve/route")
      >("app/api/memory/candidates/[id]/approve/route.ts");
      const rejectRoute = requireProjectModule<
        typeof import("../app/api/memory/candidates/[id]/reject/route")
      >("app/api/memory/candidates/[id]/reject/route.ts");
      const memoryRoute = requireProjectModule<
        typeof import("../app/api/memory/[id]/route")
      >("app/api/memory/[id]/route.ts");

      const createdResponse = await candidatesRoute.POST(
        jsonRequest("http://localhost/api/memory/candidates", cookieA, {
          ownerId: "uid-b",
          source: "manual",
          sourceId: "manual-route-a",
          content: "Route private A"
        })
      );
      assert.equal(createdResponse.status, 201);
      const candidate = ((await createdResponse.json()) as {
        candidate: { id: string; ownerId: string; version: number };
      }).candidate;
      assert.equal(candidate.ownerId, "uid-a");
      assert.equal(
        (
          (await (
            await candidatesRoute.GET(
              cookieRequest("http://localhost/api/memory/candidates", cookieB)
            )
          ).json()) as { candidates: unknown[] }
        ).candidates.length,
        0
      );

      const foreignApproval = await approveRoute.POST(
        jsonRequest(
          `http://localhost/api/memory/candidates/${candidate.id}/approve`,
          cookieB,
          { expectedVersion: 1 }
        ),
        routeContext(candidate.id)
      );
      assert.equal(foreignApproval.status, 404);
      const approvedResponse = await approveRoute.POST(
        jsonRequest(
          `http://localhost/api/memory/candidates/${candidate.id}/approve`,
          cookieA,
          { expectedVersion: 1, approvedBy: "uid-b", note: "Owner approved" }
        ),
        routeContext(candidate.id)
      );
      assert.equal(approvedResponse.status, 200);
      const approved = ((await approvedResponse.json()) as {
        memory: { id: string; approvedBy: string; version: number };
      }).memory;
      assert.equal(approved.approvedBy, "uid-a");

      const correctedResponse = await memoryRoute.PATCH(
        jsonRequest(`http://localhost/api/memory/${approved.id}`, cookieA, {
          expectedVersion: 2,
          content: "Route corrected A"
        }, "PATCH"),
        routeContext(approved.id)
      );
      assert.equal(correctedResponse.status, 200);
      const corrected = ((await correctedResponse.json()) as {
        memory: { version: number };
      }).memory;
      assert.equal(corrected.version, 3);
      const forgottenResponse = await memoryRoute.DELETE(
        jsonRequest(`http://localhost/api/memory/${approved.id}`, cookieA, {
          expectedVersion: 3
        }, "DELETE"),
        routeContext(approved.id)
      );
      assert.equal(forgottenResponse.status, 200);

      const rejectCandidateResponse = await candidatesRoute.POST(
        jsonRequest("http://localhost/api/memory/candidates", cookieA, {
          source: "manual",
          sourceId: "manual-route-reject-a",
          content: "Reject through route"
        })
      );
      const rejectCandidate = ((await rejectCandidateResponse.json()) as {
        candidate: { id: string };
      }).candidate;
      const rejectedResponse = await rejectRoute.POST(
        jsonRequest(
          `http://localhost/api/memory/candidates/${rejectCandidate.id}/reject`,
          cookieA,
          { expectedVersion: 1 }
        ),
        routeContext(rejectCandidate.id)
      );
      assert.equal(rejectedResponse.status, 200);
      assert.equal(
        ((await rejectedResponse.json()) as { candidate: { status: string } }).candidate
          .status,
        "rejected"
      );
    });
  });
});

test("all memory adapter routes require auth and preserve owner isolation", async () => {
  await withTempDataDir(async () => {
    await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
      const { createSessionToken, SESSION_COOKIE_NAME } = require(
        "../src/lib/auth/session-token"
      ) as typeof import("../src/lib/auth/session-token");
      const cookieA = `${SESSION_COOKIE_NAME}=${await createSessionToken({
        uid: "uid-a",
        email: "a@example.com",
        paid: true
      })}`;
      const cookieB = `${SESSION_COOKIE_NAME}=${await createSessionToken({
        uid: "uid-b",
        email: "b@example.com",
        paid: true
      })}`;
      const engine = requireProjectModule<
        typeof import("../src/lib/memory/memory-engine")
      >("src/lib/memory/memory-engine.ts");
      const { approveCandidate } = requireProjectModule<
        typeof import("../src/lib/memory/memory-lifecycle")
      >("src/lib/memory/memory-lifecycle.ts");
      for (const ownerId of ["uid-a", "uid-b"]) {
        const candidate = await engine.createMemoryCandidate({
          ownerId,
          source: "manual",
          sourceId: `adapter-${ownerId}`,
          title: `Adapter ${ownerId}`,
          content: `Adapter private ${ownerId}`,
          importance: 0.95
        });
        await approveCandidate(ownerId, candidate.id, { expectedVersion: 1 });
      }

      const dashboardRoute = requireProjectModule<
        typeof import("../app/api/memory/dashboard/route")
      >("app/api/memory/dashboard/route.ts");
      const dailyRoute = requireProjectModule<
        typeof import("../app/api/memory/daily/route")
      >("app/api/memory/daily/route.ts");
      const searchRoute = requireProjectModule<
        typeof import("../app/api/memory/search/route")
      >("app/api/memory/search/route.ts");
      const mcpRoute = requireProjectModule<
        typeof import("../app/api/memory/mcp/route")
      >("app/api/memory/mcp/route.ts");
      const externalRoute = requireProjectModule<
        typeof import("../app/api/memory/external-capture/route")
      >("app/api/memory/external-capture/route.ts");
      const candidatesRoute = requireProjectModule<
        typeof import("../app/api/memory/candidates/route")
      >("app/api/memory/candidates/route.ts");
      const approveRoute = requireProjectModule<
        typeof import("../app/api/memory/candidates/[id]/approve/route")
      >("app/api/memory/candidates/[id]/approve/route.ts");

      const dashboardA = await dashboardRoute.GET(
        cookieRequest("http://localhost/api/memory/dashboard", cookieA)
      );
      assert.equal(dashboardA.status, 200);
      assert.equal(
        ((await dashboardA.json()) as { statistics: { totalMemories: number } })
          .statistics.totalMemories,
        1
      );
      const dailyA = await dailyRoute.GET(
        cookieRequest("http://localhost/api/memory/daily?date=2026-07-11", cookieA)
      );
      assert.deepEqual(
        ((await dailyA.json()) as { brief: { importantMemories: string[] } }).brief
          .importantMemories,
        ["Adapter uid-a"]
      );

      const searchA = await searchRoute.POST(
        jsonRequest("http://localhost/api/memory/search", cookieA, {
          query: "Adapter private",
          ownerId: "uid-b"
        })
      );
      assert.deepEqual(
        ((await searchA.json()) as { results: Array<{ title: string }> }).results.map(
          (item) => item.title
        ),
        ["Adapter uid-a"]
      );
      const searchB = await searchRoute.POST(
        jsonRequest("http://localhost/api/memory/search", cookieB, {
          query: "uid-a"
        })
      );
      assert.equal(
        ((await searchB.json()) as { results: Array<{ title: string }> }).results.some(
          (item) => item.title === "Adapter uid-a"
        ),
        false
      );

      const mcpSearch = await mcpRoute.POST(
        jsonRequest("http://localhost/api/memory/mcp", cookieA, {
          tool: "memory.search",
          payload: { query: "Adapter private", ownerId: "uid-b" }
        })
      );
      const mcpBody = (await mcpSearch.json()) as {
        ok: boolean;
        data?: { results: Array<{ title: string }> };
      };
      assert.equal(mcpBody.ok, true);
      assert.deepEqual(mcpBody.data?.results.map((item) => item.title), [
        "Adapter uid-a"
      ]);

      const externalResponse = await externalRoute.POST(
        jsonRequest("http://localhost/api/memory/external-capture", cookieA, {
          ownerId: "uid-b",
          connectorId: "gmail",
          sourceId: "external-route-a",
          title: "External A",
          content: "External private A",
          preview: "External A"
        })
      );
      assert.equal(externalResponse.status, 201);
      assert.equal(
        ((await externalResponse.json()) as { candidate: { ownerId: string } }).candidate
          .ownerId,
        "uid-a"
      );

      const invalidChatResponse = await candidatesRoute.POST(
        jsonRequest("http://localhost/api/memory/candidates", cookieA, {
          source: "chat",
          sourceId: "unverified-chat",
          content: "Unverified chat provenance"
        })
      );
      const invalidChat = ((await invalidChatResponse.json()) as {
        candidate: { id: string };
      }).candidate;
      const invalidApproval = await approveRoute.POST(
        jsonRequest(
          `http://localhost/api/memory/candidates/${invalidChat.id}/approve`,
          cookieA,
          { expectedVersion: 1 }
        ),
        routeContext(invalidChat.id)
      );
      assert.equal(invalidApproval.status, 422);

      const staleCandidate = await engine.createMemoryCandidate({
        ownerId: "uid-a",
        source: "manual",
        sourceId: "stale-route-a",
        content: "Stale route"
      });
      await approveCandidate("uid-a", staleCandidate.id, { expectedVersion: 1 });
      const staleApproval = await approveRoute.POST(
        jsonRequest(
          `http://localhost/api/memory/candidates/${staleCandidate.id}/approve`,
          cookieA,
          { expectedVersion: 1 }
        ),
        routeContext(staleCandidate.id)
      );
      assert.equal(staleApproval.status, 409);

      const noAuth = new Request("http://localhost/api/memory");
      const unauthorizedResponses = await Promise.all([
        dashboardRoute.GET(noAuth),
        dailyRoute.GET(noAuth),
        searchRoute.POST(jsonRequest("http://localhost/api/memory/search", "", {})),
        mcpRoute.GET(noAuth),
        mcpRoute.POST(jsonRequest("http://localhost/api/memory/mcp", "", {})),
        externalRoute.POST(
          jsonRequest("http://localhost/api/memory/external-capture", "", {})
        ),
        candidatesRoute.GET(noAuth),
        candidatesRoute.POST(
          jsonRequest("http://localhost/api/memory/candidates", "", {})
        )
      ]);
      assert.deepEqual(
        unauthorizedResponses.map((response) => response.status),
        new Array(8).fill(401)
      );
    });
  });
});

test("the ownerless legacy approval API is not exported", () => {
  const engine = requireProjectModule<Record<string, unknown>>(
    "src/lib/memory/memory-engine.ts"
  );
  assert.equal("approveMemoryCandidate" in engine, false);
});

test("concurrent approval attempts allow exactly one expected-version transition", async () => {
  await withTempDataDir(async (dataDir) => {
    const { createMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const candidate = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "concurrent-approval-a",
      content: "Approve once"
    });

    const results = await Promise.allSettled([
      lifecycle.approveCandidate("uid-a", candidate.id, { expectedVersion: 1 }),
      lifecycle.approveCandidate("uid-a", candidate.id, { expectedVersion: 1 })
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    const db = JSON.parse(fs.readFileSync(path.join(dataDir, "memory.json"), "utf8")) as {
      memories: unknown[];
      embeddings: unknown[];
    };
    const markdownRoot = path.join(
      dataDir,
      "memory-markdown",
      createHash("sha256").update("uid-a").digest("hex")
    );

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(
      rejected[0].reason instanceof lifecycle.MemoryLifecycleError
        ? rejected[0].reason.code
        : null,
      "MEMORY_CONFLICT"
    );
    assert.equal(db.memories.length, 1);
    assert.equal(db.embeddings.length, 1);
    assert.equal(fs.readdirSync(markdownRoot).length, 1);
  });
});

test("concurrent approvals for different owners preserve every memory artifact", async () => {
  await withTempDataDir(async (dataDir) => {
    const { createMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const { approveCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const candidateA = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "concurrent-owner-a",
      title: "Concurrent A",
      content: "Concurrent owner A memory"
    });
    const candidateB = await createMemoryCandidate({
      ownerId: "uid-b",
      source: "manual",
      sourceId: "concurrent-owner-b",
      title: "Concurrent B",
      content: "Concurrent owner B memory"
    });

    const [approvedA, approvedB] = await Promise.all([
      approveCandidate("uid-a", candidateA.id, { expectedVersion: 1 }),
      approveCandidate("uid-b", candidateB.id, { expectedVersion: 1 })
    ]);
    const db = JSON.parse(fs.readFileSync(path.join(dataDir, "memory.json"), "utf8")) as {
      candidates: Array<{ id: string; ownerId: string; status: string }>;
      memories: Array<{ id: string; ownerId: string }>;
      embeddings: Array<{ memoryId: string; ownerId: string }>;
    };

    assert.deepEqual(
      db.memories.map((memory) => `${memory.ownerId}:${memory.id}`).sort(),
      [`uid-a:${approvedA.id}`, `uid-b:${approvedB.id}`].sort()
    );
    assert.deepEqual(
      db.embeddings.map((embedding) => `${embedding.ownerId}:${embedding.memoryId}`).sort(),
      [`uid-a:${approvedA.id}`, `uid-b:${approvedB.id}`].sort()
    );
    assert.deepEqual(
      db.candidates
        .filter((candidate) => [approvedA.id, approvedB.id].includes(candidate.id))
        .map((candidate) => `${candidate.ownerId}:${candidate.status}`)
        .sort(),
      ["uid-a:approved", "uid-b:approved"]
    );
    assert.equal(fs.existsSync(path.join(dataDir, approvedA.markdownPath)), true);
    assert.equal(fs.existsSync(path.join(dataDir, approvedB.markdownPath)), true);
  });
});

test("capture jobs persist pending and sanitized failed state across an idempotent retry", async () => {
  await withTempDataDir(async (dataDir) => {
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const { analyzeConversationForMemory } = requireProjectModule<
      typeof import("../src/lib/memory/auto-memory-engine")
    >("src/lib/memory/auto-memory-engine.ts");
    const input = {
      ownerId: "uid-a",
      sessionId: "capture-failure-session",
      userMessageId: "capture-failure-user",
      assistantMessageId: "capture-failure-assistant",
      userMessage: "Remember this durable preference.",
      assistantAnswer: "I will keep it pending for approval.",
      createdAt: "2026-07-11T01:02:03.000Z"
    };
    let observedPending = false;
    const failure = Object.assign(new Error("secret diagnostic must not persist"), {
      code: "EXTRACTOR_DOWN"
    });

    const failed = await lifecycle.captureConversationMemoryWithExtractor(
      input,
      () => {
        const duringExtraction = JSON.parse(
          fs.readFileSync(path.join(dataDir, "memory.json"), "utf8")
        ) as { captureJobs: Array<{ status: string; attempts: number }> };
        observedPending =
          duringExtraction.captureJobs.length === 1 &&
          duringExtraction.captureJobs[0].status === "pending" &&
          duringExtraction.captureJobs[0].attempts === 1;
        throw failure;
      }
    );
    const rawAfterFailure = fs.readFileSync(path.join(dataDir, "memory.json"), "utf8");

    assert.equal(observedPending, true);
    assert.equal(failed.status, "failed");
    assert.equal(failed.job.status, "failed");
    assert.equal(failed.job.attempts, 1);
    assert.equal(failed.job.lastErrorCode, "EXTRACTOR_DOWN");
    assert.equal(rawAfterFailure.includes("secret diagnostic"), false);

    const retry = await lifecycle.captureConversationMemoryWithExtractor(
      input,
      analyzeConversationForMemory
    );
    const completedRetry = await lifecycle.captureConversationMemoryWithExtractor(
      input,
      analyzeConversationForMemory
    );
    const db = JSON.parse(fs.readFileSync(path.join(dataDir, "memory.json"), "utf8")) as {
      candidates: Array<{ id: string }>;
      captureJobs: Array<{ id: string }>;
    };

    assert.equal(retry.status, "completed");
    assert.equal(retry.job.id, failed.job.id);
    assert.equal(retry.job.createdAt, failed.job.createdAt);
    assert.equal(retry.job.attempts, 2);
    assert.equal(retry.job.lastErrorCode, null);
    assert.equal(completedRetry.job.attempts, 2);
    assert.equal(retry.candidates.length, 1);
    assert.equal(completedRetry.candidates[0].id, retry.candidates[0].id);
    assert.equal(db.captureJobs.length, 1);
    assert.equal(db.candidates.length, 1);
  });
});

test("legacy owner-v1 memory records normalize deterministically without inventing chat provenance", async () => {
  await withTempDataDir(async (dataDir) => {
    const { createMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const { readMemoryDb } = requireProjectModule<
      typeof import("../src/lib/memory/memory-repository")
    >("src/lib/memory/memory-repository.ts");
    const manual = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "legacy-manual-a",
      content: "Legacy manual pending"
    });
    const chat = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "chat",
      sourceId: "legacy-chat-a",
      content: "Legacy chat without message provenance"
    });
    const approvedCandidate = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "legacy-approved-a",
      content: "Legacy approved content"
    });
    const approved = await lifecycle.approveCandidate("uid-a", approvedCandidate.id, {
      expectedVersion: 1
    });
    const memoryPath = path.join(dataDir, "memory.json");
    const legacyDb = JSON.parse(fs.readFileSync(memoryPath, "utf8")) as {
      candidates: Array<Record<string, unknown>>;
      memories: Array<Record<string, unknown>>;
    };
    for (const record of [...legacyDb.candidates, ...legacyDb.memories]) {
      delete record.version;
      delete record.sourceSessionId;
      delete record.sourceMessageIds;
    }
    fs.writeFileSync(memoryPath, JSON.stringify(legacyDb, null, 2), "utf8");

    const normalized = await readMemoryDb();
    const normalizedManual = normalized.candidates.find((item) => item.id === manual.id);
    const normalizedApproved = normalized.memories.find((item) => item.id === approved.id);
    assert.equal(normalizedManual?.version, 1);
    assert.equal(normalizedManual?.sourceSessionId, null);
    assert.deepEqual(normalizedManual?.sourceMessageIds, []);
    assert.equal(normalizedApproved?.version, 1);

    const approvedManual = await lifecycle.approveCandidate("uid-a", manual.id, {
      expectedVersion: 1
    });
    assert.equal(approvedManual.version, 2);
    const corrected = await lifecycle.correctApprovedMemory("uid-a", approved.id, {
      expectedVersion: 1,
      content: "Legacy approved corrected"
    });
    assert.equal(corrected.version, 2);
    const forgotten = await lifecycle.forgetApprovedMemory("uid-a", approved.id, {
      expectedVersion: 2
    });
    assert.equal(forgotten.version, 3);

    await assert.rejects(
      () => lifecycle.approveCandidate("uid-a", chat.id, { expectedVersion: 1 }),
      (error: unknown) => {
        assert.ok(error instanceof lifecycle.MemoryLifecycleError);
        assert.equal(error.code, "MEMORY_PROVENANCE_INVALID");
        assert.equal(error.status, 422);
        return true;
      }
    );
  });
});

test("same-title auto captures use distinct Markdown paths and forget independently", async () => {
  await withTempDataDir(async (dataDir) => {
    const chat = requireProjectModule<
      typeof import("../src/lib/db/repositories/chat.repository")
    >("src/lib/db/repositories/chat.repository.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const session = await chat.createSession("uid-a", "Collision test");
    const captureInputs: Array<{
      userMessageId: string;
      assistantMessageId: string;
      userMessage: string;
      assistantAnswer: string;
    }> = [];
    for (let index = 0; index < 2; index += 1) {
      const user = await chat.addMessage({
        ownerId: "uid-a",
        sessionId: session.id,
        role: "user",
        content: "I prefer one stable response style."
      });
      const assistant = await chat.addMessage({
        ownerId: "uid-a",
        sessionId: session.id,
        role: "assistant",
        content: "I will keep that response style after approval."
      });
      captureInputs.push({
        userMessageId: user.id,
        assistantMessageId: assistant.id,
        userMessage: user.content,
        assistantAnswer: assistant.content
      });
    }

    const captures = await Promise.all(
      captureInputs.map((input) =>
        lifecycle.captureConversationMemory({
          ownerId: "uid-a",
          sessionId: session.id,
          ...input
        })
      )
    );
    const approved = [];
    for (const capture of captures) {
      approved.push(
        await lifecycle.approveCandidate("uid-a", capture.candidates[0].id, {
          expectedVersion: 1
        })
      );
    }

    assert.equal(approved[0].title, approved[1].title);
    assert.notEqual(approved[0].markdownPath, approved[1].markdownPath);
    assert.equal(fs.existsSync(path.join(dataDir, approved[0].markdownPath)), true);
    assert.equal(fs.existsSync(path.join(dataDir, approved[1].markdownPath)), true);

    await lifecycle.forgetApprovedMemory("uid-a", approved[0].id, {
      expectedVersion: 2
    });
    assert.equal(fs.existsSync(path.join(dataDir, approved[0].markdownPath)), false);
    assert.equal(fs.existsSync(path.join(dataDir, approved[1].markdownPath)), true);
    assert.match(
      fs.readFileSync(path.join(dataDir, approved[1].markdownPath), "utf8"),
      /one stable response style/u
    );
  });
});

test("correction removes a replaced legacy owner-scoped Markdown artifact", async () => {
  await withTempDataDir(async (dataDir) => {
    const { createMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const candidate = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "legacy-markdown-a",
      title: "Legacy Markdown",
      content: "Legacy Markdown content"
    });
    const approved = await lifecycle.approveCandidate("uid-a", candidate.id, {
      expectedVersion: 1
    });
    const ownerHash = createHash("sha256").update("uid-a").digest("hex");
    const legacyPath = `memory-markdown/${ownerHash}/legacy-prehash-name.md`;
    fs.renameSync(
      path.join(dataDir, approved.markdownPath),
      path.join(dataDir, legacyPath)
    );
    const dbPath = path.join(dataDir, "memory.json");
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
      candidates: Array<{ id: string; markdownPath?: string }>;
      memories: Array<{ id: string; markdownPath: string }>;
    };
    const storedMemory = db.memories.find((memory) => memory.id === approved.id);
    const storedCandidate = db.candidates.find((item) => item.id === approved.id);
    if (!storedMemory || !storedCandidate) throw new Error("legacy fixture missing");
    storedMemory.markdownPath = legacyPath;
    storedCandidate.markdownPath = legacyPath;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");

    const corrected = await lifecycle.correctApprovedMemory("uid-a", approved.id, {
      expectedVersion: 2,
      content: "Corrected Markdown content"
    });

    assert.notEqual(corrected.markdownPath, legacyPath);
    assert.equal(fs.existsSync(path.join(dataDir, corrected.markdownPath)), true);
    assert.equal(fs.existsSync(path.join(dataDir, legacyPath)), false);
  });
});

test("correction migrates a real SecondBrain legacy Markdown artifact without partial success", async () => {
  await withTempDataDir(async (dataDir) => {
    const { createMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const candidate = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "real-legacy-correction-a",
      title: "Real Legacy Correction",
      content: "Real legacy content"
    });
    const approved = await lifecycle.approveCandidate("uid-a", candidate.id, {
      expectedVersion: 1
    });
    const legacyDirectory = path.join(
      process.cwd(),
      "SecondBrain",
      "08_Memory",
      "approved"
    );
    const memoryDirectoryExisted = fs.existsSync(path.dirname(legacyDirectory));
    const approvedDirectoryExisted = fs.existsSync(legacyDirectory);
    const legacyPath = `SecondBrain/08_Memory/approved/codex-${randomUUID()}.md`;
    const legacyAbsolutePath = path.resolve(process.cwd(), legacyPath);
    fs.mkdirSync(legacyDirectory, { recursive: true });
    const approvedAbsolutePath = path.join(dataDir, approved.markdownPath);
    fs.copyFileSync(approvedAbsolutePath, legacyAbsolutePath);
    fs.rmSync(approvedAbsolutePath);
    const dbPath = path.join(dataDir, "memory.json");
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
      candidates: Array<{ id: string; markdownPath?: string }>;
      memories: Array<{ id: string; markdownPath: string }>;
    };
    const storedMemory = db.memories.find((memory) => memory.id === approved.id);
    const storedCandidate = db.candidates.find((item) => item.id === approved.id);
    if (!storedMemory || !storedCandidate) throw new Error("real legacy fixture missing");
    storedMemory.markdownPath = legacyPath;
    storedCandidate.markdownPath = legacyPath;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");

    try {
      const outcome = await Promise.allSettled([
        lifecycle.correctApprovedMemory("uid-a", approved.id, {
          expectedVersion: 2,
          content: "Corrected from the real legacy path"
        })
      ]);
      assert.equal(
        outcome[0].status,
        "fulfilled",
        outcome[0].status === "rejected" ? String(outcome[0].reason) : undefined
      );
      const corrected = outcome[0].value;
      const persisted = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
        memories: Array<{
          id: string;
          content: string;
          markdownPath: string;
          version: number;
        }>;
      };
      const persistedMemory = persisted.memories.find((memory) => memory.id === approved.id);

      assert.match(corrected.markdownPath, /^memory-markdown\//u);
      assert.equal(corrected.content, "Corrected from the real legacy path");
      assert.equal(corrected.version, 3);
      assert.equal(fs.existsSync(path.join(dataDir, corrected.markdownPath)), true);
      assert.equal(fs.existsSync(legacyAbsolutePath), false);
      assert.equal(persistedMemory?.markdownPath, corrected.markdownPath);
      assert.equal(persistedMemory?.content, corrected.content);
      assert.equal(persistedMemory?.version, corrected.version);
    } finally {
      fs.rmSync(legacyAbsolutePath, { force: true });
      if (
        !approvedDirectoryExisted &&
        fs.existsSync(legacyDirectory) &&
        fs.readdirSync(legacyDirectory).length === 0
      ) {
        fs.rmdirSync(legacyDirectory);
      }
      const memoryDirectory = path.dirname(legacyDirectory);
      if (
        !memoryDirectoryExisted &&
        fs.existsSync(memoryDirectory) &&
        fs.readdirSync(memoryDirectory).length === 0
      ) {
        fs.rmdirSync(memoryDirectory);
      }
    }
  });
});

test("forget rolls back and then removes a real SecondBrain legacy Markdown artifact", async () => {
  await withTempDataDir(async (dataDir) => {
    const { createMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const candidate = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "real-legacy-forget-a",
      title: "Real Legacy Forget",
      content: "Forget this real legacy artifact"
    });
    const approved = await lifecycle.approveCandidate("uid-a", candidate.id, {
      expectedVersion: 1
    });
    const legacyDirectory = path.join(
      process.cwd(),
      "SecondBrain",
      "08_Memory",
      "approved"
    );
    const memoryDirectoryExisted = fs.existsSync(path.dirname(legacyDirectory));
    const approvedDirectoryExisted = fs.existsSync(legacyDirectory);
    const legacyPath = `SecondBrain/08_Memory/approved/codex-${randomUUID()}.md`;
    const legacyAbsolutePath = path.resolve(process.cwd(), legacyPath);
    fs.mkdirSync(legacyDirectory, { recursive: true });
    const approvedAbsolutePath = path.join(dataDir, approved.markdownPath);
    fs.copyFileSync(approvedAbsolutePath, legacyAbsolutePath);
    fs.rmSync(approvedAbsolutePath);
    const originalLegacyBytes = fs.readFileSync(legacyAbsolutePath);
    const dbPath = path.join(dataDir, "memory.json");
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
      candidates: Array<{ id: string; markdownPath?: string }>;
      memories: Array<{ id: string; markdownPath: string }>;
    };
    const storedMemory = db.memories.find((memory) => memory.id === approved.id);
    const storedCandidate = db.candidates.find((item) => item.id === approved.id);
    if (!storedMemory || !storedCandidate) throw new Error("real legacy fixture missing");
    storedMemory.markdownPath = legacyPath;
    storedCandidate.markdownPath = legacyPath;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");

    try {
      const blockedTempPath = `${dbPath}.tmp`;
      fs.mkdirSync(blockedTempPath);
      try {
        await assert.rejects(() =>
          lifecycle.forgetApprovedMemory("uid-a", approved.id, { expectedVersion: 2 })
        );
        assert.deepEqual(fs.readFileSync(legacyAbsolutePath), originalLegacyBytes);
        const afterFailure = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
          memories: Array<{ id: string; status: string; markdownPath: string; version: number }>;
        };
        const stillApproved = afterFailure.memories.find((memory) => memory.id === approved.id);
        assert.equal(stillApproved?.status, "approved");
        assert.equal(stillApproved?.markdownPath, legacyPath);
        assert.equal(stillApproved?.version, 2);
      } finally {
        fs.rmSync(blockedTempPath, { recursive: true, force: true });
      }

      const forgotten = await lifecycle.forgetApprovedMemory("uid-a", approved.id, {
        expectedVersion: 2
      });
      const persisted = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
        memories: Array<{
          id: string;
          status: string;
          markdownPath: string;
          embeddingId: string;
          version: number;
        }>;
        embeddings: Array<{ memoryId: string }>;
      };
      const persistedMemory = persisted.memories.find((memory) => memory.id === approved.id);

      assert.equal(forgotten.status, "forgotten");
      assert.equal(forgotten.version, 3);
      assert.equal(forgotten.markdownPath, "");
      assert.equal(forgotten.embeddingId, "");
      assert.equal(fs.existsSync(legacyAbsolutePath), false);
      assert.equal(persistedMemory?.status, "forgotten");
      assert.equal(persistedMemory?.markdownPath, "");
      assert.equal(persistedMemory?.embeddingId, "");
      assert.equal(persistedMemory?.version, 3);
      assert.equal(
        persisted.embeddings.some((embedding) => embedding.memoryId === approved.id),
        false
      );
    } finally {
      fs.rmSync(legacyAbsolutePath, { force: true });
      if (
        !approvedDirectoryExisted &&
        fs.existsSync(legacyDirectory) &&
        fs.readdirSync(legacyDirectory).length === 0
      ) {
        fs.rmdirSync(legacyDirectory);
      }
      const memoryDirectory = path.dirname(legacyDirectory);
      if (
        !memoryDirectoryExisted &&
        fs.existsSync(memoryDirectory) &&
        fs.readdirSync(memoryDirectory).length === 0
      ) {
        fs.rmdirSync(memoryDirectory);
      }
    }
  });
});

test("Markdown cleanup rejects absolute traversal nested and outside-owner paths", async () => {
  await withTempDataDir(async (dataDir) => {
    const { deleteApprovedMemoryMarkdown } = requireProjectModule<
      typeof import("../src/lib/memory/memory-markdown")
    >("src/lib/memory/memory-markdown.ts");
    const ownerHash = createHash("sha256").update("uid-a").digest("hex");
    const otherOwnerHash = createHash("sha256").update("uid-b").digest("hex");
    const outsideAbsolutePath = path.join(dataDir, "outside.md");
    fs.writeFileSync(outsideAbsolutePath, "outside sentinel", "utf8");
    const invalidPaths = [
      outsideAbsolutePath,
      "../outside.md",
      `memory-markdown/${ownerHash}/../outside.md`,
      `memory-markdown/${ownerHash}/nested/file.md`,
      `memory-markdown/${otherOwnerHash}/other-owner.md`,
      "SecondBrain/08_Memory/approved/../outside.md",
      "SecondBrain/08_Memory/approved/nested/file.md",
      "SecondBrain/08_Memory/outside.md"
    ];

    for (const invalidPath of invalidPaths) {
      await assert.rejects(
        () => deleteApprovedMemoryMarkdown("uid-a", invalidPath),
        /MEMORY_MARKDOWN_PATH_INVALID/u,
        invalidPath
      );
    }
    assert.equal(fs.readFileSync(outsideAbsolutePath, "utf8"), "outside sentinel");
  });
});

test("legacy memory with missing or unknown status is quarantined without data loss", async () => {
  await withTempDataDir(async (dataDir) => {
    const { createMemoryCandidate, listApprovedMemories } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const { approveCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const { readMemoryDb } = requireProjectModule<
      typeof import("../src/lib/memory/memory-repository")
    >("src/lib/memory/memory-repository.ts");
    const candidate = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "unknown-status-a",
      content: "Must not be recalled with unknown status"
    });
    const approved = await approveCandidate("uid-a", candidate.id, {
      expectedVersion: 1
    });
    const dbPath = path.join(dataDir, "memory.json");
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
      memories: Array<{ id: string; status?: string }>;
    };
    const stored = db.memories.find((memory) => memory.id === approved.id);
    if (!stored) throw new Error("unknown-status fixture missing");
    stored.status = "unknown";
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");

    assert.equal((await readMemoryDb()).memories.length, 0);
    assert.equal((await listApprovedMemories("uid-a")).length, 0);

    await createMemoryCandidate({
      ownerId: "uid-b",
      source: "manual",
      sourceId: "unrelated-write-b",
      content: "An unrelated write must not discard quarantined memory"
    });
    const persisted = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
      memories: Array<{ id: string }>;
      quarantinedMemories?: Array<Record<string, unknown>>;
    };
    assert.equal(persisted.memories.some((memory) => memory.id === approved.id), false);
    const quarantined = persisted.quarantinedMemories?.find(
      (memory) => memory.id === approved.id
    );
    assert.equal(quarantined?.ownerId, "uid-a");
    assert.equal(quarantined?.status, "unknown");
    assert.equal(quarantined?.content, approved.content);
  });
});

test("lifecycle and legacy auto-memory history remain append-only past fifty entries", async () => {
  await withTempDataDir(async () => {
    const engine = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const autoMemory = requireProjectModule<
      typeof import("../src/lib/memory/auto-memory-engine")
    >("src/lib/memory/auto-memory-engine.ts");
    const history = Array.from({ length: 51 }, (_, index) => ({
      at: `2026-07-11T00:00:${String(index).padStart(2, "0")}.000Z`,
      event: `event-${index}`,
      sourceId: `source-${index}`,
      summary: `summary-${index}`
    }));
    const candidate = await engine.createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "append-only-a",
      content: "Append-only history",
      history
    });

    const rejected = await lifecycle.rejectCandidate("uid-a", candidate.id, {
      expectedVersion: 1
    });
    assert.equal(rejected.history?.length, 52);
    assert.equal(rejected.history?.[0].event, "event-0");
    assert.equal(rejected.history?.at(-1)?.event, "Memory rejected");

    const extraction = autoMemory.analyzeConversationForMemory({
      userMessage: "Remember this project preference.",
      assistantAnswer: "I will keep it pending for review."
    });
    assert.ok(extraction);
    const merged = autoMemory.mergeAutoMemoryMetadata(
      {
        id: "legacy-auto-history",
        ownerId: "uid-a",
        sourceId: extraction.sourceId,
        projectId: extraction.projectId,
        category: extraction.category,
        tags: [],
        relatedConcepts: [],
        relatedLinks: [],
        history
      } as unknown as import("../src/lib/memory/memory.types").ApprovedMemory,
      extraction,
      "2026-07-11T02:00:00.000Z"
    );
    assert.equal(merged.history?.length, 52);
    assert.equal(merged.history?.[0].event, "event-0");
    assert.equal(merged.history?.at(-1)?.event, "Auto memory update");
  });
});

test("reject and forget persist their terminal transition timestamps", async () => {
  await withTempDataDir(async (dataDir) => {
    const { createMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const lifecycle = requireProjectModule<
      typeof import("../src/lib/memory/memory-lifecycle")
    >("src/lib/memory/memory-lifecycle.ts");
    const rejectable = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "timestamp-reject-a",
      content: "Reject with timestamp"
    });
    const forgettable = await createMemoryCandidate({
      ownerId: "uid-a",
      source: "manual",
      sourceId: "timestamp-forget-a",
      content: "Forget with timestamp"
    });

    const rejected = await lifecycle.rejectCandidate("uid-a", rejectable.id, {
      expectedVersion: 1
    });
    const approved = await lifecycle.approveCandidate("uid-a", forgettable.id, {
      expectedVersion: 1
    });
    const forgotten = await lifecycle.forgetApprovedMemory("uid-a", approved.id, {
      expectedVersion: 2
    });
    const db = JSON.parse(fs.readFileSync(path.join(dataDir, "memory.json"), "utf8")) as {
      candidates: Array<{
        id: string;
        rejectedAt?: string;
        forgottenAt?: string;
      }>;
      memories: Array<{ id: string; forgottenAt?: string }>;
    };

    assert.match(rejected.rejectedAt || "", /^\d{4}-\d{2}-\d{2}T/u);
    assert.equal(rejected.rejectedAt, rejected.updatedAt);
    assert.match(forgotten.forgottenAt || "", /^\d{4}-\d{2}-\d{2}T/u);
    assert.equal(forgotten.forgottenAt, forgotten.updatedAt);
    assert.equal(
      db.candidates.find((item) => item.id === rejected.id)?.rejectedAt,
      rejected.rejectedAt
    );
    assert.equal(
      db.memories.find((item) => item.id === forgotten.id)?.forgottenAt,
      forgotten.forgottenAt
    );
  });
});

async function withTempDataDir(run: (dataDir: string) => void | Promise<void>) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-memory-lifecycle-"));
  const originalDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  try {
    await run(dataDir);
  } finally {
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function requireProjectModule<T>(relativePath: string): T {
  const moduleLoader = require("node:module") as {
    _resolveFilename: (
      request: string,
      parent: unknown,
      isMain: boolean,
      options?: unknown
    ) => string;
  };
  const originalResolve = moduleLoader._resolveFilename;
  moduleLoader._resolveFilename = function resolveProjectAlias(
    request: string,
    parent: unknown,
    isMain: boolean,
    options?: unknown
  ) {
    const mapped = request.startsWith("@/")
      ? path.join(process.cwd(), request.slice(2))
      : request;
    return originalResolve.call(this, mapped, parent, isMain, options);
  };

  try {
    return require(path.join(process.cwd(), relativePath)) as T;
  } finally {
    moduleLoader._resolveFilename = originalResolve;
  }
}

function jsonRequest(
  url: string,
  cookie: string,
  body: unknown,
  method = "POST"
) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body)
  });
}

function cookieRequest(url: string, cookie: string) {
  return new Request(url, { headers: { cookie } });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function withEnv(
  values: Record<string, string | undefined>,
  run: () => void | Promise<void>
) {
  const original = { ...process.env };
  process.env = { ...original };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    process.env = original;
  }
}
