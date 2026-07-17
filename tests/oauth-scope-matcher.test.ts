import assert from "node:assert/strict";
import { hasRequiredOAuthScope, missingOAuthScopes } from "../src/lib/oauth/scope-matcher";

test("OAuth scope matching understands provider URLs and capability aliases", () => {
  assert.equal(hasRequiredOAuthScope(["https://www.googleapis.com/auth/gmail.send"], "gmail.send", "gmail"), true);
  assert.equal(hasRequiredOAuthScope(["chat:write"], "chat.write", "slack"), true);
  assert.equal(hasRequiredOAuthScope(["repo"], "issues:write", "github"), true);
  assert.deepEqual(missingOAuthScopes(["repo"], ["issues:write", "workflow"], "github"), ["workflow"]);
});

test("Notion page grants are modeled without inventing token scopes", () => {
  assert.equal(hasRequiredOAuthScope([], "content.read", "notion"), true);
  assert.equal(hasRequiredOAuthScope([], "content.write", "notion"), true);
  assert.equal(hasRequiredOAuthScope([], "unrelated.scope", "notion"), false);
});
