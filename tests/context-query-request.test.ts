import assert from "node:assert/strict";
import { parseContextQueryRequest } from "../src/lib/api/context-query-request";

test("context query parser rejects missing content type with 415", async () => {
  const result = await parseContextQueryRequest(
    new Request("http://local.test/api/local/context/query", {
      method: "POST",
      body: JSON.stringify({ query: "hello" })
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 415);
    assert.equal(result.error.code, "INVALID_CONTENT_TYPE");
  }
});

test("context query parser rejects empty JSON body with 400", async () => {
  const result = await parseContextQueryRequest(
    new Request("http://local.test/api/local/context/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.error.code, "EMPTY_REQUEST_BODY");
  }
});

test("context query parser rejects invalid JSON with 400", async () => {
  const result = await parseContextQueryRequest(
    new Request("http://local.test/api/local/context/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json"
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.error.code, "INVALID_JSON");
  }
});

test("context query parser rejects non-string and blank queries", async () => {
  for (const query of [undefined, null, 123, "", "   \n\t"]) {
    const result = await parseContextQueryRequest(
      new Request("http://local.test/api/local/context/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      })
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.error.code, "QUERY_REQUIRED");
    }
  }
});

test("context query parser rejects overlong queries with 413", async () => {
  const result = await parseContextQueryRequest(
    new Request("http://local.test/api/local/context/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "x".repeat(10001) })
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
    assert.equal(result.error.code, "QUERY_TOO_LONG");
  }
});

test("context query parser trims valid query and normalizes optional fields", async () => {
  const result = await parseContextQueryRequest(
    new Request("http://local.test/api/local/context/query", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        query: "  Résolu 검색  ",
        conversationId: "session-1",
        limit: 99
      })
    })
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.query, "Résolu 검색");
    assert.equal(result.data.conversationId, "session-1");
    assert.equal(result.data.limit, 50);
  }
});
