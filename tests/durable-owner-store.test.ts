import assert from "node:assert/strict";
import fs from "node:fs";

test("durable owner store defines append-only owner revisions", () => {
  assert.equal(fs.existsSync("src/lib/db/owner-document-store.ts"), true);
  const source = fs.readFileSync("src/lib/db/owner-document-store.ts", "utf8");

  assert.match(source, /owner_id TEXT NOT NULL/u);
  assert.match(source, /namespace TEXT NOT NULL/u);
  assert.match(source, /revision BIGINT NOT NULL/u);
  assert.match(source, /payload JSONB NOT NULL/u);
  assert.match(source, /pg_advisory_xact_lock/u);
  assert.doesNotMatch(source, /DELETE FROM durable_owner_documents/u);
});

test("postgres storage is selected only when DATABASE_URL is non-empty", () => {
  assert.equal(fs.existsSync("src/lib/db/postgres.ts"), true);
  const { hasPostgresStorage } = require("../src/lib/db/postgres") as {
    hasPostgresStorage: () => boolean;
  };
  const previous = process.env.DATABASE_URL;
  try {
    delete process.env.DATABASE_URL;
    assert.equal(hasPostgresStorage(), false);
    process.env.DATABASE_URL = "   ";
    assert.equal(hasPostgresStorage(), false);
    process.env.DATABASE_URL = "postgresql://db.example/app";
    assert.equal(hasPostgresStorage(), true);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
