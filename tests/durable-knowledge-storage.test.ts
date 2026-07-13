import assert from "node:assert/strict";
import fs from "node:fs";

test("knowledge notes use append-only owner-scoped PostgreSQL revisions in production", () => {
  const source = fs.readFileSync("src/lib/knowledge/knowledge.repository.ts", "utf8");
  assert.match(source, /readOwnerDocument/u);
  assert.match(source, /mutateOwnerDocument/u);
  assert.match(source, /knowledge-notes-v1/u);
  assert.match(source, /process\.env\.DATABASE_URL/u);
  assert.doesNotMatch(source, /DELETE FROM|TRUNCATE/u);
});
