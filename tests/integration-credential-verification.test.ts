import assert from "node:assert/strict";
import fs from "node:fs";
import { verifyIntegrationCredential } from "../src/lib/integrations/credential-verifier";

test("OpenAI credentials are verified against the provider before save", async () => {
  const calls: string[] = [];
  const result = await verifyIntegrationCredential("openai", { apiKey: "sk-test" }, async (url, init) => {
    calls.push(String(url));
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer sk-test");
    return Response.json({ data: [] });
  });
  assert.equal(result.accountLabel, "OpenAI API");
  assert.deepEqual(calls, ["https://api.openai.com/v1/models"]);
});

test("credential verifier rejects missing fields and unsafe provider URLs before fetch", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return Response.json({}); };
  await assert.rejects(
    () => verifyIntegrationCredential("jira", { siteUrl: "https://example.atlassian.net", email: "a@b.com" }, fetcher),
    /MISSING_CREDENTIAL_FIELD/u,
  );
  await assert.rejects(
    () => verifyIntegrationCredential("jira", { siteUrl: "http://127.0.0.1", email: "a@b.com", apiToken: "x" }, fetcher),
    /UNSAFE_PROVIDER_URL/u,
  );
  assert.equal(calls, 0);
});

test("credential verifier normalizes provider authentication and availability failures", async () => {
  await assert.rejects(
    () => verifyIntegrationCredential("openai", { apiKey: "bad" }, async () => Response.json({}, { status: 401 })),
    /PROVIDER_AUTH_FAILED/u,
  );
  await assert.rejects(
    () => verifyIntegrationCredential("openai", { apiKey: "bad" }, async () => Response.json({}, { status: 503 })),
    /PROVIDER_UNAVAILABLE/u,
  );
});

test("every key app has a concrete provider verification branch and save occurs after verification", () => {
  const verifier = fs.readFileSync("src/lib/integrations/credential-verifier.ts", "utf8");
  for (const appId of [
    "notion", "github", "discord", "telegram", "airtable", "trello", "asana", "jira", "linear",
    "hubspot", "salesforce", "stripe", "shopify", "wordpress", "facebook", "instagram", "x", "linkedin", "openai",
  ]) assert.match(verifier, new RegExp(`\\b${appId}:`, "u"), appId);

  const route = fs.readFileSync("app/api/automation/credentials/route.ts", "utf8");
  assert.match(route, /const verification = await verifyIntegrationCredential[\s\S]+const credential = await saveVerifiedCredential/u);
  assert.doesNotMatch(route, /saveCredential\(/u);
});
