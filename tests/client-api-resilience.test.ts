import assert from "node:assert/strict";
import fs from "node:fs";
import { readApiResponse } from "../src/lib/api/api-response";

test("readApiResponse reports an empty successful response with a stable client error", async () => {
  const response = new Response("", { status: 200 });
  await assert.rejects(
    () => readApiResponse(response),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as Error & { code: string }).code === "EMPTY_RESPONSE"
  );
});

test("readApiResponse preserves an empty failed response status without leaking a JSON parser error", async () => {
  const response = new Response("", { status: 503 });
  await assert.rejects(
    () => readApiResponse(response),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "Request failed with status 503" &&
      !(error instanceof SyntaxError)
  );
});

test("chat memory and crm views use the shared safe API response reader", () => {
  for (const file of [
    "components/Chat/ChatView.tsx",
    "components/Memory/MemoryView.tsx",
    "components/CRM/CRMView.tsx"
  ]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /readApiResponse/u, `${file} must use readApiResponse`);
  }

  const chat = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  const memory = fs.readFileSync("components/Memory/MemoryView.tsx", "utf8");
  assert.doesNotMatch(chat, /projectsResponse\.json\(\)/u);
  assert.doesNotMatch(chat, /linksResponse\.json\(\)/u);
  assert.doesNotMatch(memory, /knowledgeResponse\.json\(\)/u);
  assert.match(memory, /finally/u);
});
