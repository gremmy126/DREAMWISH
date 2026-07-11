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
    for (const key of ["candidates", "memories", "embeddings", "changes", "captureJobs"]) {
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
      JSON.stringify({ migration: "owner-v1", ownerId: "different-uid", files: [] }, null, 2)
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
