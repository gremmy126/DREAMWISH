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

test("ensureSession creates only when the session id is omitted", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-owner-chat-"));
  const originalDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;

  try {
    const {
      archiveSession,
      createSession,
      ensureSession,
      listSessions
    } = requireProjectModule<typeof import("../src/lib/db/repositories/chat.repository")>(
      "src/lib/db/repositories/chat.repository.ts"
    );
    const foreign = await createSession("uid-a", "Foreign session");
    const archived = await createSession("uid-b", "Archived session");
    await archiveSession("uid-b", archived.id);

    for (const inaccessibleId of [foreign.id, archived.id, "missing-session-id", ""]) {
      await assert.rejects(
        () => ensureSession("uid-b", inaccessibleId, "must not create"),
        /Chat session not found/u
      );
    }

    assert.deepEqual(await listSessions("uid-b"), []);
    assert.deepEqual(readChatDbCounts(dataDir), { sessions: 2, messages: 0 });

    const created = await ensureSession("uid-b", undefined, "allowed new session");
    assert.equal(created.owner_id, "uid-b");
    assert.deepEqual(readChatDbCounts(dataDir), { sessions: 3, messages: 0 });
  } finally {
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("ordinary chat returns 404 for supplied inaccessible session ids without writing", async () => {
  await withEnv(
    {
      AUTH_SESSION_SECRET: "test-session-secret-that-is-at-least-32-bytes",
      AI_PROVIDER: undefined,
      GEMINI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
      OPENROUTER_API_KEY: undefined,
      GROQ_API_KEY: undefined,
      HF_TOKEN: undefined,
      HUGGINGFACE_API_KEY: undefined,
      CLOUDFLARE_API_TOKEN: undefined,
      CLOUDFLARE_API_KEY: undefined
    },
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-owner-chat-"));
      const originalDataDir = process.env.DATA_DIR;
      process.env.DATA_DIR = dataDir;

      try {
        const repository = requireProjectModule<
          typeof import("../src/lib/db/repositories/chat.repository")
        >("src/lib/db/repositories/chat.repository.ts");
        const foreign = await repository.createSession("uid-a", "Foreign session");
        const { createSessionToken, SESSION_COOKIE_NAME } = require(
          "../src/lib/auth/session-token"
        ) as typeof import("../src/lib/auth/session-token");
        const token = await createSessionToken({
          uid: "uid-b",
          email: "owner-b@example.com",
          paid: true
        });
        const { POST } = requireProjectModule<typeof import("../app/api/ai/chat/route")>(
          "app/api/ai/chat/route.ts"
        );

        const response = await POST(
          new Request("http://localhost/api/ai/chat", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: `${SESSION_COOKIE_NAME}=${token}`
            },
            body: JSON.stringify({ message: "hello", sessionId: foreign.id })
          })
        );

        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: {
            code: "CHAT_SESSION_NOT_FOUND",
            message: "Chat session not found",
            retryable: false
          }
        });

        const invalidTypeResponse = await POST(
          new Request("http://localhost/api/ai/chat", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: `${SESSION_COOKIE_NAME}=${token}`
            },
            body: JSON.stringify({ message: "hello", sessionId: null })
          })
        );

        assert.equal(invalidTypeResponse.status, 404);
        assert.deepEqual(await invalidTypeResponse.json(), {
          ok: false,
          error: {
            code: "CHAT_SESSION_NOT_FOUND",
            message: "Chat session not found",
            retryable: false
          }
        });
        assert.deepEqual(await repository.listSessions("uid-b"), []);
        assert.deepEqual(readChatDbCounts(dataDir), { sessions: 1, messages: 0 });
      } finally {
        if (originalDataDir === undefined) delete process.env.DATA_DIR;
        else process.env.DATA_DIR = originalDataDir;
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    }
  );
});

test("streaming chat returns 404 before constructing a stream for supplied inaccessible session ids", async () => {
  await withEnv(
    {
      AUTH_SESSION_SECRET: "test-session-secret-that-is-at-least-32-bytes",
      AI_PROVIDER: undefined,
      GEMINI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
      OPENROUTER_API_KEY: undefined,
      GROQ_API_KEY: undefined,
      HF_TOKEN: undefined,
      HUGGINGFACE_API_KEY: undefined,
      CLOUDFLARE_API_TOKEN: undefined,
      CLOUDFLARE_API_KEY: undefined
    },
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-owner-chat-"));
      const originalDataDir = process.env.DATA_DIR;
      process.env.DATA_DIR = dataDir;

      try {
        const repository = requireProjectModule<
          typeof import("../src/lib/db/repositories/chat.repository")
        >("src/lib/db/repositories/chat.repository.ts");
        const foreign = await repository.createSession("uid-a", "Foreign session");
        const { createSessionToken, SESSION_COOKIE_NAME } = require(
          "../src/lib/auth/session-token"
        ) as typeof import("../src/lib/auth/session-token");
        const token = await createSessionToken({
          uid: "uid-b",
          email: "owner-b@example.com",
          paid: true
        });
        const { POST } = requireProjectModule<
          typeof import("../app/api/ai/chat/stream/route")
        >("app/api/ai/chat/stream/route.ts");

        const response = await POST(
          new Request("http://localhost/api/ai/chat/stream", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: `${SESSION_COOKIE_NAME}=${token}`
            },
            body: JSON.stringify({ message: "hello", sessionId: foreign.id })
          })
        );

        assert.equal(response.status, 404);
        assert.match(response.headers.get("content-type") || "", /^application\/json/iu);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: {
            code: "CHAT_SESSION_NOT_FOUND",
            message: "Chat session not found",
            retryable: false
          }
        });

        const invalidTypeResponse = await POST(
          new Request("http://localhost/api/ai/chat/stream", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: `${SESSION_COOKIE_NAME}=${token}`
            },
            body: JSON.stringify({ message: "hello", sessionId: null })
          })
        );

        assert.equal(invalidTypeResponse.status, 404);
        assert.match(
          invalidTypeResponse.headers.get("content-type") || "",
          /^application\/json/iu
        );
        assert.deepEqual(await invalidTypeResponse.json(), {
          ok: false,
          error: {
            code: "CHAT_SESSION_NOT_FOUND",
            message: "Chat session not found",
            retryable: false
          }
        });
        assert.deepEqual(await repository.listSessions("uid-b"), []);
        assert.deepEqual(readChatDbCounts(dataDir), { sessions: 1, messages: 0 });
      } finally {
        if (originalDataDir === undefined) delete process.env.DATA_DIR;
        else process.env.DATA_DIR = originalDataDir;
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    }
  );
});

function readChatDbCounts(dataDir: string) {
  const db = JSON.parse(fs.readFileSync(path.join(dataDir, "chat.json"), "utf8")) as {
    chat_sessions: unknown[];
    chat_messages: unknown[];
  };
  return {
    sessions: db.chat_sessions.length,
    messages: db.chat_messages.length
  };
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
