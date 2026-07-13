import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("json store returns fallback only when the file is missing", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-strict-json-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  try {
    const { readJsonStore } = require("../src/lib/local-db/json-store") as {
      readJsonStore: <T>(fileName: string, fallback: T) => Promise<T>;
    };
    assert.deepEqual(await readJsonStore("missing.json", { rows: [] }), { rows: [] });
    fs.writeFileSync(path.join(dataDir, "broken.json"), "{broken", "utf8");
    await assert.rejects(() => readJsonStore("broken.json", { rows: [] }), /JSON/u);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("memory repository uses owner-scoped postgres revisions when configured", () => {
  const source = fs.readFileSync("src/lib/memory/memory-repository.ts", "utf8");
  assert.match(source, /hasPostgresStorage\(\)/u);
  assert.match(source, /mutateOwnerDocument/u);
  assert.match(source, /listLatestOwnerDocuments/u);
  assert.match(source, /memory-state/u);
  assert.match(source, /candidate\.ownerId/u);
  assert.match(source, /memory\.ownerId/u);
});
