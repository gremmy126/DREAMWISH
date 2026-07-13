import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildGmailRawMessage } from "../src/lib/business/business-message.service";

test("Gmail message builder creates a safe base64url RFC message", () => {
  const raw = buildGmailRawMessage({ to: "client@example.com", subject: "제안서", body: "안녕하세요" });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /To: client@example\.com/u);
  assert.match(decoded, /Subject: =\?UTF-8\?B\?/u);
  assert.match(decoded, /안녕하세요/u);
  assert.throws(() => buildGmailRawMessage({ to: "a@example.com\r\nBcc: leak@example.com", subject: "x", body: "x" }), /invalid_recipient/u);
});

test("Business messaging uses owner OAuth tokens and explicit provider send", async () => {
  const route = await read("app/api/business/messages/route.ts");
  const ui = await read("components/Business/MessageWorkspace.tsx");
  const hub = await read("components/Business/BusinessHub.tsx");
  assert.match(route, /requireOwnerContext\(request\)/u);
  assert.match(route, /getActiveAccessToken/u);
  assert.match(route, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send/u);
  assert.match(route, /slack\.com\/api\/chat\.postMessage/u);
  assert.match(route, /response\.ok/u);
  assert.match(ui, /Gmail/u);
  assert.match(ui, /Slack/u);
  assert.match(ui, /답장 보내기/u);
  assert.match(ui, /전송할까요/u);
  assert.match(hub, /MessageWorkspace/u);
});

function read(relativePath: string) { return fs.readFile(path.join(process.cwd(), relativePath), "utf8"); }
