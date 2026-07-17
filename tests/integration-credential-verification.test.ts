import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
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

test("Notion credentials use the current provider API version", async () => {
  const result = await verifyIntegrationCredential(
    "notion",
    { integrationToken: "notion-test" },
    async (_url, init) => {
      assert.equal(
        new Headers(init?.headers).get("notion-version"),
        "2026-03-11"
      );
      return Response.json({ id: "notion-bot", name: "DREAMWISH" });
    }
  );
  assert.equal(result.providerAccountId, "notion-bot");
});

test("Google Sheets service-account JSON is exchanged and verified", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const serviceAccountJson = JSON.stringify({
    type: "service_account",
    project_id: "dreamwish-test",
    client_email: "automation@dreamwish-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    token_uri: "https://oauth2.googleapis.com/token"
  });
  const result = await verifyIntegrationCredential(
    "google-sheets",
    { serviceAccountJson },
    async (url, init) => {
      assert.equal(String(url), "https://oauth2.googleapis.com/token");
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      assert.ok(body.get("assertion"));
      return Response.json({ access_token: "service-account-token", expires_in: 3600 });
    }
  );
  assert.match(result.accountLabel, /automation@dreamwish-test\.iam\.gserviceaccount\.com/u);
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
    "hubspot", "salesforce", "stripe", "shopify", "wordpress", "facebook", "instagram", "x", "linkedin", "openai", "google-sheets",
  ]) assert.match(verifier, new RegExp(`["']?${appId}["']?:`, "u"), appId);

  const route = fs.readFileSync("app/api/automation/credentials/route.ts", "utf8");
  assert.match(route, /const verification = await verifyIntegrationCredential[\s\S]+const credential = await saveVerifiedCredential/u);
  assert.doesNotMatch(route, /saveCredential\(/u);
});
