import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-bytes";
const ADMIN_EMAIL = "kara111131@naver.com";

test("project, knowledge, and file repositories isolate records and links by owner", async () => {
  await withTempDataDir(async () => {
    const projects = requireProjectModule<
      typeof import("../src/lib/projects/project.repository")
    >("src/lib/projects/project.repository.ts");
    const knowledge = requireProjectModule<
      typeof import("../src/lib/knowledge/knowledge.repository")
    >("src/lib/knowledge/knowledge.repository.ts");
    const files = requireProjectModule<typeof import("../src/lib/files/file.repository")>(
      "src/lib/files/file.repository.ts"
    );
    const chat = requireProjectModule<
      typeof import("../src/lib/db/repositories/chat.repository")
    >("src/lib/db/repositories/chat.repository.ts");

    const projectA = await projects.createProject({ ownerId: "uid-a", name: "A" });
    const projectB = await projects.createProject({ ownerId: "uid-b", name: "B" });
    assert.equal(projectA.ownerId, "uid-a");
    assert.deepEqual((await projects.listProjects("uid-a")).map((item) => item.id), [
      projectA.id
    ]);
    assert.deepEqual((await projects.listProjects("uid-b")).map((item) => item.id), [
      projectB.id
    ]);

    const noteA = await knowledge.createKnowledgeNote({
      ownerId: "uid-a",
      title: "A note",
      body: "private alpha knowledge",
      projectId: projectA.id
    });
    await knowledge.createKnowledgeNote({
      ownerId: "uid-b",
      title: "B note",
      body: "private beta knowledge",
      projectId: projectB.id
    });
    assert.equal(noteA.ownerId, "uid-a");
    assert.deepEqual(
      (await knowledge.listKnowledgeNotes("uid-a", projectA.id)).map((item) => item.id),
      [noteA.id]
    );
    assert.equal((await knowledge.listKnowledgeNotes("uid-b", projectA.id)).length, 0);

    const fileA = await files.saveFileRecord({
      ownerId: "uid-a",
      name: "a.md",
      mimeType: "text/markdown",
      size: 1,
      source: "files",
      textPreview: "private alpha file",
      projectId: null
    });
    await files.saveFileRecord({
      ownerId: "uid-b",
      name: "b.md",
      mimeType: "text/markdown",
      size: 1,
      source: "files",
      projectId: null
    });
    assert.equal(fileA.ownerId, "uid-a");
    assert.deepEqual((await files.listFileRecords("uid-a")).map((item) => item.id), [
      fileA.id
    ]);
    assert.equal((await files.listFileRecords("uid-b", projectA.id)).length, 0);

    const sessionA = await chat.createSession("uid-a", "A chat");
    const sessionB = await chat.createSession("uid-b", "B chat");
    const linkA = await projects.assignSessionToProject({
      ownerId: "uid-a",
      projectId: projectA.id,
      sessionId: sessionA.id
    });
    assert.equal(linkA.ownerId, "uid-a");
    assert.deepEqual(await projects.listProjectSessionLinks("uid-a"), [linkA]);
    assert.deepEqual(await projects.listProjectSessionLinks("uid-b"), []);

    await assert.rejects(
      () =>
        projects.assignSessionToProject({
          ownerId: "uid-b",
          projectId: projectA.id,
          sessionId: sessionB.id
        }),
      /Project or chat session not found/u
    );
    await assert.rejects(
      () =>
        projects.assignSessionToProject({
          ownerId: "uid-a",
          projectId: projectA.id,
          sessionId: sessionB.id
        }),
      /Project or chat session not found/u
    );
    assert.deepEqual(await projects.listProjectSessionLinks("uid-b"), []);
  });
});

test("memory search and knowledge network fail closed without an owner", async () => {
  await withTempDataDir(async () => {
    const { saveFileRecord } = requireProjectModule<
      typeof import("../src/lib/files/file.repository")
    >("src/lib/files/file.repository.ts");
    const { quickMemorySearch } = requireProjectModule<
      typeof import("../src/lib/memory/memory-search")
    >("src/lib/memory/memory-search.ts");
    const { buildKnowledgeNetwork } = requireProjectModule<
      typeof import("../src/lib/memory/knowledge-network")
    >("src/lib/memory/knowledge-network.ts");

    await saveFileRecord({
      ownerId: "uid-a",
      name: "private.md",
      mimeType: "text/markdown",
      size: 10,
      source: "files",
      textPreview: "private alpha document",
      projectId: null
    });

    assert.equal((await quickMemorySearch("private alpha")).results.length, 0);
    assert.equal((await buildKnowledgeNetwork()).nodes.length, 0);
    assert.ok(
      (await quickMemorySearch("private alpha", { ownerId: "uid-a" })).results.length > 0
    );
    assert.equal(
      (await quickMemorySearch("private alpha", { ownerId: "uid-b" })).results.length,
      0
    );
    assert.ok((await buildKnowledgeNetwork({ ownerId: "uid-a" })).nodes.length > 0);
    assert.equal((await buildKnowledgeNetwork({ ownerId: "uid-b" })).nodes.length, 0);
  });
});

test("owner-scoped source routes use the verified owner", async () => {
  await withTempDataDir(async () => {
    await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
      const { createSessionToken, SESSION_COOKIE_NAME } = require(
        "../src/lib/auth/session-token"
      ) as typeof import("../src/lib/auth/session-token");
      const tokenA = await createSessionToken({
        uid: "uid-a",
        email: "a@example.com",
        paid: true
      });
      const tokenB = await createSessionToken({
        uid: "uid-b",
        email: "b@example.com",
        paid: true
      });
      const cookieA = `${SESSION_COOKIE_NAME}=${tokenA}`;
      const cookieB = `${SESSION_COOKIE_NAME}=${tokenB}`;
      const projectRoute = requireProjectModule<typeof import("../app/api/projects/route")>(
        "app/api/projects/route.ts"
      );
      const noteRoute = requireProjectModule<
        typeof import("../app/api/knowledge/notes/route")
      >("app/api/knowledge/notes/route.ts");
      const fileRoute = requireProjectModule<typeof import("../app/api/files/route")>(
        "app/api/files/route.ts"
      );

      const projectResponse = await projectRoute.POST(
        jsonRequest("http://localhost/api/projects", cookieA, { name: "Private A" })
      );
      assert.equal(projectResponse.status, 201);
      const project = ((await projectResponse.json()) as { project: { id: string } }).project;

      await noteRoute.POST(
        jsonRequest("http://localhost/api/knowledge/notes", cookieA, {
          title: "Private note",
          body: "alpha",
          projectId: project.id
        })
      );
      await fileRoute.POST(
        jsonRequest("http://localhost/api/files", cookieA, {
          name: "private.md",
          mimeType: "text/markdown",
          size: 1,
          source: "files",
          projectId: project.id
        })
      );

      assert.deepEqual(
        (await (await projectRoute.GET(cookieRequest("http://localhost/api/projects", cookieB))).json())
          .projects,
        []
      );
      assert.deepEqual(
        (
          await (
            await noteRoute.GET(
              cookieRequest("http://localhost/api/knowledge/notes", cookieB)
            )
          ).json()
        ).notes,
        []
      );
      assert.deepEqual(
        (await (await fileRoute.GET(cookieRequest("http://localhost/api/files", cookieB))).json())
          .files,
        []
      );
    });
  });
});

test("owner-v1 migration backs up and claims legacy records once", async () => {
  await withTempDataDir(async (dataDir) => {
    const fixtures = legacyOwnerFixtures();
    for (const [name, value] of Object.entries(fixtures)) {
      fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value, null, 2), "utf8");
    }
    const { runOwnerV1Migration } = requireProjectModule<
      typeof import("../src/lib/migrations/owner-v1")
    >("src/lib/migrations/owner-v1.ts");

    const result = await runOwnerV1Migration({
      uid: "admin-uid",
      email: ADMIN_EMAIL,
      role: "admin"
    });
    assert.deepEqual(result, {
      migration: "owner-v1",
      ownerId: "admin-uid",
      migrated: true,
      files: ["chat.json", "memory.json", "projects.json", "knowledge.json", "files.json"]
    });

    const markerPath = path.join(dataDir, ".migrations", "owner-v1.json");
    const backupRoot = path.join(dataDir, ".migration-backups", "owner-v1");
    assert.ok(fs.existsSync(markerPath));
    assert.ok(fs.existsSync(backupRoot));
    const backupDirectories = fs.readdirSync(backupRoot);
    assert.equal(backupDirectories.length, 1);
    const backupDir = path.join(backupRoot, backupDirectories[0]);

    for (const [name, fixture] of Object.entries(fixtures)) {
      assert.deepEqual(readJson(path.join(backupDir, name)), fixture);
    }

    const chat = readJson(path.join(dataDir, "chat.json"));
    assert.equal(chat.chat_sessions[0].owner_id, "admin-uid");
    assert.equal(chat.chat_messages[0].owner_id, "existing-chat-owner");
    const memory = readJson(path.join(dataDir, "memory.json"));
    for (const key of [
      "candidates",
      "memories",
      "quarantinedMemories",
      "embeddings",
      "changes",
      "captureJobs"
    ]) {
      assert.equal(memory[key][0].ownerId, "admin-uid");
    }
    const projects = readJson(path.join(dataDir, "projects.json"));
    assert.equal(projects.projects[0].ownerId, "admin-uid");
    assert.equal(projects.sessionLinks[0].ownerId, "admin-uid");
    assert.equal(readJson(path.join(dataDir, "knowledge.json")).notes[0].ownerId, "admin-uid");
    assert.equal(readJson(path.join(dataDir, "files.json")).files[0].ownerId, "admin-uid");

    assert.deepEqual(
      await runOwnerV1Migration({
        uid: "admin-uid",
        email: ADMIN_EMAIL,
        role: "admin"
      }),
      {
        migration: "owner-v1",
        ownerId: "admin-uid",
        migrated: false,
        files: ["chat.json", "memory.json", "projects.json", "knowledge.json", "files.json"]
      }
    );
    assert.equal(fs.readdirSync(backupRoot).length, 1);
  });
});

test("owner-v1 backs up and claims an unowned memory quarantined before migration", async () => {
  await withTempDataDir(async (dataDir) => {
    const memoryPath = path.join(dataDir, "memory.json");
    const unknownMemory = {
      id: "legacy-unknown-memory",
      status: "unknown",
      content: "원본 bytes와  공백을\n그대로 보존합니다 🌙",
      opaque: { source: "legacy", values: [3, 1, 4] }
    };
    fs.writeFileSync(
      memoryPath,
      JSON.stringify({ candidates: [], memories: [unknownMemory] }, null, 2),
      "utf8"
    );
    const { createMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const { runOwnerV1Migration } = requireProjectModule<
      typeof import("../src/lib/migrations/owner-v1")
    >("src/lib/migrations/owner-v1.ts");

    const runtimeCandidate = await createMemoryCandidate({
      ownerId: "runtime-user",
      source: "manual",
      sourceId: "pre-migration-quarantine-write",
      content: "Move the unknown record to quarantine before admin migration"
    });
    const beforeMigrationBytes = fs.readFileSync(memoryPath);
    const beforeMigration = JSON.parse(beforeMigrationBytes.toString("utf8")) as {
      quarantinedMemories: Array<Record<string, unknown>>;
    };
    const beforeQuarantine = beforeMigration.quarantinedMemories.find(
      (memory) => memory.id === unknownMemory.id
    );
    assert.equal(beforeQuarantine?.ownerId, undefined);
    assert.equal(beforeQuarantine?.content, unknownMemory.content);
    assert.equal(fs.existsSync(path.join(dataDir, ".migrations", "owner-v1.json")), false);

    await runOwnerV1Migration({
      uid: "admin-uid",
      email: ADMIN_EMAIL,
      role: "admin"
    });

    const backupRoot = path.join(dataDir, ".migration-backups", "owner-v1");
    const backupDirectory = fs.readdirSync(backupRoot)[0];
    assert.deepEqual(
      fs.readFileSync(path.join(backupRoot, backupDirectory, "memory.json")),
      beforeMigrationBytes
    );
    const migrated = readJson(memoryPath);
    const quarantined = migrated.quarantinedMemories.find(
      (memory: { id: string }) => memory.id === unknownMemory.id
    );
    assert.equal(quarantined.ownerId, "admin-uid");
    assert.equal(quarantined.status, unknownMemory.status);
    assert.equal(quarantined.content, unknownMemory.content);
    assert.deepEqual(quarantined.opaque, unknownMemory.opaque);
    assert.equal(
      migrated.candidates.find(
        (candidate: { id: string }) => candidate.id === runtimeCandidate.id
      ).ownerId,
      "runtime-user"
    );
    const marker = readJson(path.join(dataDir, ".migrations", "owner-v1.json"));
    assert.equal(marker.migration, "owner-v1");
    assert.equal(marker.ownerId, "admin-uid");
    assert.ok(marker.files.includes("memory.json"));
  });
});

test("owner-v1 losslessly envelopes non-record quarantine values and repository rewrites preserve them", async () => {
  await withTempDataDir(async (dataDir) => {
    const memoryPath = path.join(dataDir, "memory.json");
    const rawValues: unknown[] = [
      ["array-value", 7, { nested: { ok: true } }, [1, 2, 3]],
      "legacy-string",
      42,
      false,
      null,
      {
        id: "legacy-object-record",
        status: "unknown",
        content: "Object-shaped quarantine record",
        nested: { values: ["a", "b"] }
      }
    ];
    fs.writeFileSync(
      memoryPath,
      JSON.stringify({ candidates: [], memories: rawValues }, null, 2),
      "utf8"
    );
    const { createMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const { runOwnerV1Migration } = requireProjectModule<
      typeof import("../src/lib/migrations/owner-v1")
    >("src/lib/migrations/owner-v1.ts");

    await createMemoryCandidate({
      ownerId: "runtime-user",
      source: "manual",
      sourceId: "quarantine-non-record-values",
      content: "Quarantine every unsupported legacy memory shape"
    });
    const beforeMigration = readJson(memoryPath);
    assert.deepEqual(beforeMigration.quarantinedMemories, rawValues);
    const beforeMigrationBytes = fs.readFileSync(memoryPath);
    assert.equal(fs.existsSync(path.join(dataDir, ".migrations", "owner-v1.json")), false);

    const firstMigration = await runOwnerV1Migration({
      uid: "admin-uid",
      email: ADMIN_EMAIL,
      role: "admin"
    });
    assert.equal(firstMigration.migrated, true);
    const backupRoot = path.join(dataDir, ".migration-backups", "owner-v1");
    const backupDirectory = fs.readdirSync(backupRoot)[0];
    assert.deepEqual(
      fs.readFileSync(path.join(backupRoot, backupDirectory, "memory.json")),
      beforeMigrationBytes
    );

    const migrated = readJson(memoryPath);
    const entries = migrated.quarantinedMemories as Array<Record<string, any>>;
    assert.equal(entries.length, rawValues.length);
    assert.equal(entries[0].envelopeType, "owner-v1/quarantined-memory");
    assert.equal(entries[0].envelopeVersion, 1);
    assert.ok(Array.isArray(entries[0].raw));
    assert.deepEqual(entries[0].raw, rawValues[0]);
    const unwrapped = entries.map((entry, index) => {
      assert.equal(entry.ownerId, "admin-uid", `entry ${index}`);
      const original = rawValues[index];
      if (original !== null && typeof original === "object" && !Array.isArray(original)) {
        const { ownerId: _ownerId, ...rawRecord } = entry;
        return rawRecord;
      }
      assert.equal(entry.envelopeType, "owner-v1/quarantined-memory", `entry ${index}`);
      assert.equal(entry.envelopeVersion, 1, `entry ${index}`);
      return entry.raw;
    });
    assert.deepEqual(unwrapped, rawValues);

    const afterMigrationBytes = fs.readFileSync(memoryPath);
    const secondMigration = await runOwnerV1Migration({
      uid: "admin-uid",
      email: ADMIN_EMAIL,
      role: "admin"
    });
    assert.equal(secondMigration.migrated, false);
    assert.deepEqual(fs.readFileSync(memoryPath), afterMigrationBytes);

    const migratedEntries = structuredClone(entries);
    await createMemoryCandidate({
      ownerId: "post-migration-user",
      source: "manual",
      sourceId: "preserve-quarantine-envelopes",
      content: "A later repository mutation must retain every envelope"
    });
    assert.deepEqual(readJson(memoryPath).quarantinedMemories, migratedEntries);
    const marker = readJson(path.join(dataDir, ".migrations", "owner-v1.json"));
    assert.equal(marker.ownerId, "admin-uid");
    assert.ok(marker.files.includes("memory.json"));
  });
});

test("owner-v1 migration rejects a user without changing legacy data", async () => {
  await withTempDataDir(async (dataDir) => {
    const filePath = path.join(dataDir, "files.json");
    fs.writeFileSync(filePath, JSON.stringify({ files: [{ id: "legacy-file" }] }, null, 2));
    const before = fs.readFileSync(filePath, "utf8");
    const { OwnerMigrationError, runOwnerV1Migration } = requireProjectModule<
      typeof import("../src/lib/migrations/owner-v1")
    >("src/lib/migrations/owner-v1.ts");

    await assert.rejects(
      () =>
        runOwnerV1Migration({
          uid: "user-uid",
          email: "user@example.com",
          role: "user"
        }),
      (error: unknown) => {
        assert.ok(error instanceof OwnerMigrationError);
        assert.equal(error.code, "MIGRATION_FAILED");
        return true;
      }
    );
    assert.equal(fs.readFileSync(filePath, "utf8"), before);
    assert.equal(fs.existsSync(path.join(dataDir, ".migrations")), false);
    assert.equal(fs.existsSync(path.join(dataDir, ".migration-backups")), false);
  });
});

test("owner-v1 migration rejects a conflicting marker without rewriting JSON", async () => {
  await withTempDataDir(async (dataDir) => {
    const filePath = path.join(dataDir, "files.json");
    const markerPath = path.join(dataDir, ".migrations", "owner-v1.json");
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ files: [{ id: "legacy-file" }] }, null, 2));
    fs.writeFileSync(
      markerPath,
      JSON.stringify(
        {
          migration: "owner-v1",
          ownerId: "different-uid",
          completedAt: "2026-07-11T00:00:00.000Z",
          files: []
        },
        null,
        2
      )
    );
    const fileBefore = fs.readFileSync(filePath, "utf8");
    const markerBefore = fs.readFileSync(markerPath, "utf8");
    const { OwnerMigrationError, runOwnerV1Migration } = requireProjectModule<
      typeof import("../src/lib/migrations/owner-v1")
    >("src/lib/migrations/owner-v1.ts");

    await assert.rejects(
      () =>
        runOwnerV1Migration({
          uid: "admin-uid",
          email: ADMIN_EMAIL,
          role: "admin"
        }),
      (error: unknown) => {
        assert.ok(error instanceof OwnerMigrationError);
        assert.equal(error.code, "MIGRATION_FAILED");
        return true;
      }
    );
    assert.equal(fs.readFileSync(filePath, "utf8"), fileBefore);
    assert.equal(fs.readFileSync(markerPath, "utf8"), markerBefore);
    assert.equal(fs.existsSync(path.join(dataDir, ".migration-backups")), false);
  });
});

test("owner-v1 migration rejects every existing invalid marker without rewriting", async () => {
  const invalidMarkers = [
    { label: "null", raw: "null" },
    { label: "false", raw: "false" },
    { label: "empty object", raw: "{}" },
    {
      label: "same-owner incomplete marker",
      raw: JSON.stringify({ migration: "owner-v1", ownerId: "admin-uid", files: [] })
    },
    {
      label: "wrong migration",
      raw: JSON.stringify({
        migration: "owner-v2",
        ownerId: "admin-uid",
        completedAt: "2026-07-11T00:00:00.000Z",
        files: []
      })
    },
    {
      label: "empty owner",
      raw: JSON.stringify({
        migration: "owner-v1",
        ownerId: "   ",
        completedAt: "2026-07-11T00:00:00.000Z",
        files: []
      })
    },
    {
      label: "invalid completion time",
      raw: JSON.stringify({
        migration: "owner-v1",
        ownerId: "admin-uid",
        completedAt: "not-a-date",
        files: []
      })
    },
    {
      label: "non-string files entry",
      raw: JSON.stringify({
        migration: "owner-v1",
        ownerId: "admin-uid",
        completedAt: "2026-07-11T00:00:00.000Z",
        files: [42]
      })
    },
    { label: "invalid JSON", raw: "{" }
  ];
  const { OwnerMigrationError, runOwnerV1Migration } = requireProjectModule<
    typeof import("../src/lib/migrations/owner-v1")
  >("src/lib/migrations/owner-v1.ts");

  for (const marker of invalidMarkers) {
    await withTempDataDir(async (dataDir) => {
      const filePath = path.join(dataDir, "files.json");
      const markerPath = path.join(dataDir, ".migrations", "owner-v1.json");
      const sourceBefore = JSON.stringify({ files: [{ id: marker.label }] }, null, 2);
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      fs.writeFileSync(filePath, sourceBefore, "utf8");
      fs.writeFileSync(markerPath, marker.raw, "utf8");

      await assert.rejects(
        () =>
          runOwnerV1Migration({
            uid: "admin-uid",
            email: ADMIN_EMAIL,
            role: "admin"
          }),
        (error: unknown) => {
          assert.ok(error instanceof OwnerMigrationError, marker.label);
          assert.equal(error.code, "MIGRATION_FAILED");
          return true;
        }
      );
      assert.equal(fs.readFileSync(filePath, "utf8"), sourceBefore, marker.label);
      assert.equal(fs.readFileSync(markerPath, "utf8"), marker.raw, marker.label);
    });
  }
});

test("owner-v1 migration backs up all raw stores before rejecting an invalid shape", async () => {
  await withTempDataDir(async (dataDir) => {
    const rawStores: Record<string, Buffer> = {
      "chat.json": Buffer.from("{invalid-json", "utf8"),
      "memory.json": Buffer.from("false", "utf8"),
      "projects.json": Buffer.from("0", "utf8"),
      "knowledge.json": Buffer.from("null", "utf8"),
      "files.json": Buffer.from('"primitive"', "utf8")
    };
    for (const [name, raw] of Object.entries(rawStores)) {
      fs.writeFileSync(path.join(dataDir, name), raw);
    }
    const { runOwnerV1Migration } = requireProjectModule<
      typeof import("../src/lib/migrations/owner-v1")
    >("src/lib/migrations/owner-v1.ts");

    await assert.rejects(() =>
      runOwnerV1Migration({
        uid: "admin-uid",
        email: ADMIN_EMAIL,
        role: "admin"
      })
    );

    const backupRoot = path.join(dataDir, ".migration-backups", "owner-v1");
    const backupDirectories = fs.readdirSync(backupRoot);
    assert.equal(backupDirectories.length, 1);
    const backupDir = path.join(backupRoot, backupDirectories[0]);
    for (const [name, raw] of Object.entries(rawStores)) {
      assert.deepEqual(fs.readFileSync(path.join(backupDir, name)), raw);
      assert.deepEqual(fs.readFileSync(path.join(dataDir, name)), raw);
    }
    assert.equal(fs.existsSync(path.join(dataDir, ".migrations", "owner-v1.json")), false);
  });
});

test("owner-v1 migration serializes concurrent calls and re-reads the marker", async () => {
  await withTempDataDir(async (dataDir) => {
    fs.writeFileSync(
      path.join(dataDir, "files.json"),
      JSON.stringify({ files: [{ id: "legacy-file" }] }, null, 2),
      "utf8"
    );
    const { runOwnerV1Migration } = requireProjectModule<
      typeof import("../src/lib/migrations/owner-v1")
    >("src/lib/migrations/owner-v1.ts");
    const owner = { uid: "admin-uid", email: ADMIN_EMAIL, role: "admin" as const };

    const results = await Promise.all([
      runOwnerV1Migration(owner),
      runOwnerV1Migration(owner)
    ]);

    assert.deepEqual(
      results.map((result) => result.migrated).sort(),
      [false, true]
    );
    assert.equal(
      fs.readdirSync(path.join(dataDir, ".migration-backups", "owner-v1")).length,
      1
    );
    assert.equal(readJson(path.join(dataDir, "files.json")).files[0].ownerId, "admin-uid");
  });
});

test("owner-v1 memory migration and runtime mutation preserve both concurrent writes", async () => {
  await withTempDataDir(async (dataDir) => {
    const legacyCandidate = {
      id: "legacy-candidate",
      title: "Legacy candidate",
      content: "Legacy content",
      status: "pending"
    };
    fs.writeFileSync(
      path.join(dataDir, "memory.json"),
      JSON.stringify({ candidates: [legacyCandidate], memories: [] }, null, 2),
      "utf8"
    );
    const padding = "x".repeat(4 * 1024 * 1024);
    fs.writeFileSync(
      path.join(dataDir, "projects.json"),
      JSON.stringify({ projects: [], sessionLinks: [], padding }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(dataDir, "knowledge.json"),
      JSON.stringify({ notes: [], padding }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(dataDir, "files.json"),
      JSON.stringify({ files: [], padding }),
      "utf8"
    );

    const { runOwnerV1Migration } = requireProjectModule<
      typeof import("../src/lib/migrations/owner-v1")
    >("src/lib/migrations/owner-v1.ts");
    const { createMemoryCandidate } = requireProjectModule<
      typeof import("../src/lib/memory/memory-engine")
    >("src/lib/memory/memory-engine.ts");
    const migrationPromise = runOwnerV1Migration({
      uid: "admin-uid",
      email: ADMIN_EMAIL,
      role: "admin"
    });

    await waitForOwnerV1MemoryBackup(dataDir);
    const candidatePromise = createMemoryCandidate({
      ownerId: "runtime-owner",
      source: "manual",
      sourceId: "concurrent-runtime-candidate",
      content: "Runtime candidate must survive migration"
    });
    const [migration, runtimeCandidate] = await Promise.all([
      migrationPromise,
      candidatePromise
    ]);

    assert.equal(migration.migrated, true);
    const memory = readJson(path.join(dataDir, "memory.json"));
    assert.equal(
      memory.candidates.find((candidate: { id: string }) => candidate.id === legacyCandidate.id)
        ?.ownerId,
      "admin-uid"
    );
    assert.equal(
      memory.candidates.find(
        (candidate: { id: string }) => candidate.id === runtimeCandidate.id
      )?.ownerId,
      "runtime-owner"
    );
    assert.ok(fs.existsSync(path.join(dataDir, ".migrations", "owner-v1.json")));
  });
});

test("verified admin owner context completes owner-v1 before returning", async () => {
  await withTempDataDir(async (dataDir) => {
    await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
      fs.writeFileSync(
        path.join(dataDir, "files.json"),
        JSON.stringify({ files: [{ id: "legacy-file" }] }, null, 2)
      );
      const { createSessionToken, SESSION_COOKIE_NAME } = require(
        "../src/lib/auth/session-token"
      ) as typeof import("../src/lib/auth/session-token");
      const { getOwnerContext } = requireProjectModule<
        typeof import("../src/lib/auth/owner-context")
      >("src/lib/auth/owner-context.ts");
      const token = await createSessionToken({
        uid: "admin-uid",
        email: ADMIN_EMAIL,
        paid: true
      });

      assert.deepEqual(
        await getOwnerContext(
          new Request("http://localhost/api/files", {
            headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` }
          })
        ),
        { uid: "admin-uid", email: ADMIN_EMAIL, role: "admin" }
      );
      assert.equal(
        readJson(path.join(dataDir, "files.json")).files[0].ownerId,
        "admin-uid"
      );
      assert.ok(fs.existsSync(path.join(dataDir, ".migrations", "owner-v1.json")));
    });
  });
});

function legacyOwnerFixtures(): Record<string, Record<string, unknown>> {
  return {
    "chat.json": {
      chat_sessions: [{ id: "session-1" }],
      chat_messages: [{ id: "message-1", owner_id: "existing-chat-owner" }],
      preserved: "chat"
    },
    "memory.json": {
      candidates: [{ id: "candidate-1" }],
      memories: [{ id: "memory-1" }],
      quarantinedMemories: [
        { id: "quarantine-1", status: "unknown", content: "preserve quarantine" }
      ],
      embeddings: [{ id: "embedding-1" }],
      changes: [{ id: "change-1" }],
      captureJobs: [{ id: "capture-1" }],
      preserved: "memory"
    },
    "projects.json": {
      projects: [{ id: "project-1" }],
      sessionLinks: [{ projectId: "project-1", sessionId: "session-1" }],
      preserved: "projects"
    },
    "knowledge.json": { notes: [{ id: "note-1" }], preserved: "knowledge" },
    "files.json": { files: [{ id: "file-1" }], preserved: "files" }
  };
}

function jsonRequest(url: string, cookie: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body)
  });
}

function cookieRequest(url: string, cookie: string) {
  return new Request(url, { headers: { cookie } });
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function waitForOwnerV1MemoryBackup(dataDir: string) {
  const backupRoot = path.join(dataDir, ".migration-backups", "owner-v1");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(backupRoot)) {
      const memoryBackupExists = fs
        .readdirSync(backupRoot)
        .some((directory) =>
          fs.existsSync(path.join(backupRoot, directory, "memory.json"))
        );
      if (memoryBackupExists) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("owner-v1 memory backup was not created in time");
}

async function withTempDataDir(run: (dataDir: string) => void | Promise<void>) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-owner-v1-"));
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
