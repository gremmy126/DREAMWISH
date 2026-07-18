import assert from "node:assert/strict";
import fs from "node:fs";
import {
  classifyConnectionFailure,
  toPublicIntegrationConnection,
  type IntegrationConnection
} from "../src/lib/oauth/integration-connection.types";

const connection: IntegrationConnection = {
  id: "connection-1", ownerId: "owner-1", userId: "owner-1", appId: "gmail", provider: "google",
  oauthAppConfigId: "oauth-config-1", oauthAppConfigVersion: 1,
  providerAccountId: "account-1", providerWorkspaceId: null, accountLabel: "Work", accountEmail: "work@example.com",
  accessTokenCiphertext: "secret-access", refreshTokenCiphertext: "secret-refresh", tokenKeyVersion: 1,
  expiresAt: "2099-01-01T00:00:00.000Z", grantedScopes: ["gmail.send"], status: "connected",
  connectedAt: "2026-07-17T00:00:00.000Z", refreshedAt: null, validatedAt: null, disconnectedAt: null,
  revokedAt: null, disconnectActorId: null, disconnectReason: null, revokeResult: null,
  createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z"
};

test("public connection DTO never serializes token ciphertext", () => {
  const dto = toPublicIntegrationConnection(connection);
  assert.equal(dto.id, connection.id);
  assert.doesNotMatch(JSON.stringify(dto), /secret-access|secret-refresh|ciphertext/u);
});

test("transient OAuth failures retain the connection row in explicit states", () => {
  assert.equal(classifyConnectionFailure("token_expired"), "token_expired");
  assert.equal(classifyConnectionFailure("refresh_failed"), "refresh_failed");
  assert.equal(classifyConnectionFailure("insufficient_scope"), "insufficient_scope");
  assert.equal(classifyConnectionFailure("provider_unavailable"), "provider_unavailable");
  assert.notEqual(classifyConnectionFailure("action_failed"), "disconnected");
});

test("durable connection repository is owner scoped multi-account and soft-delete only", () => {
  const source = fs.readFileSync("src/lib/repositories/integration-connection.repository.ts", "utf8");
  assert.match(source, /INSERT INTO integration_connections/u);
  assert.match(source, /WHERE owner_id = \$\{ownerId\}/u);
  assert.match(source, /token_ciphertext = NULL/u);
  assert.match(source, /refresh_token_ciphertext = NULL/u);
  assert.match(source, /status = 'disconnected'/u);
  assert.doesNotMatch(source, /DELETE FROM integration_connections/u);
  assert.match(source, /provider_account_id/u);
});

test("OAuth authorization sessions use PostgreSQL one-time state and encrypted PKCE", () => {
  const source = fs.readFileSync("src/lib/repositories/oauth-session.repository.ts", "utf8");
  assert.match(source, /oauth_authorization_sessions/u);
  assert.match(source, /FOR UPDATE/u);
  assert.match(source, /pkce_verifier_ciphertext/u);
  assert.match(source, /encryptToken/u);
});
