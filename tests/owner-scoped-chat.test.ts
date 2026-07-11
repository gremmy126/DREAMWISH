import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("chat sessions and messages are isolated by owner", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-owner-chat-"));
  const originalDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;

  try {
    const {
      addMessage,
      createSession,
      getSession,
      listSessions,
      searchChatMessages
    } = requireProjectModule<typeof import("../src/lib/db/repositories/chat.repository")>(
      "src/lib/db/repositories/chat.repository.ts"
    );
    const a = await createSession("uid-a", "A session");
    const b = await createSession("uid-b", "B session");
    await addMessage({
      ownerId: "uid-a",
      sessionId: a.id,
      role: "user",
      content: "private A"
    });

    assert.deepEqual((await listSessions("uid-a")).map((item) => item.id), [a.id]);
    assert.equal(await getSession("uid-b", a.id), null);
    assert.equal((await searchChatMessages("uid-b", "private A")).length, 0);
    await assert.rejects(
      () =>
        addMessage({
          ownerId: "uid-b",
          sessionId: a.id,
          role: "user",
          content: "cross owner"
        }),
      /Chat session not found/u
    );
    assert.ok(await getSession("uid-b", b.id));
  } finally {
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

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
