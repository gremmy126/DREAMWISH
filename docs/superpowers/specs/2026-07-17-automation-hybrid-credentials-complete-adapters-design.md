# Automation Hybrid Credentials, Action-Aware Scenarios, and Complete Adapters Design

## 1. Goal

Make every automation connection and execution truthful. Users may connect an app with OAuth or provider-supported credentials, but each Action may use only authentication modes that can actually perform that Action. Replace the legacy app-level simulated runner with the existing durable Action Registry, PostgreSQL queue, approval state machine, and versioned Adapter pipeline. Remove every `준비 중` label only when the exact Action has a real tested Adapter.

This design extends the approved Automation Registry, Approval, Queue, and OAuth Engine design. It does not change the existing canvas appearance or the mandatory high/critical approval policy.

## 2. Current Findings

- The Action Registry contains 227 Actions. 116 have registered Adapter implementations and 111 are disabled as `준비 중`.
- Google Sheets and YouTube are declared OAuth-only in the app Registry, but neither has an `oauthTarget`, so their connection UI cannot start OAuth.
- Google Sheets is incorrectly represented as the Google Drive OAuth service. YouTube has no OAuth service or scope contract.
- Verified key credentials are encrypted and stored, but workflow activation and execution resolve only `integration_connections` OAuth records. A selected API credential therefore cannot execute an Action.
- The email-to-Notion prompt currently produces the wrong semantic order and empty mappings. The legacy graph runner classifies external work by app ID rather than Action ID, so a Gmail receive step is incorrectly previewed as Gmail send and asks for `to` and `body`.
- The legacy approval preview expects old Notion fields `parentPageId` while the Action Registry uses `parentId`. This creates a second false missing-field error.

## 3. Considered Approaches

### A. Accept arbitrary keys for every OAuth app

Rejected. A Google API key cannot upload or modify YouTube content and cannot access private Google Sheets. Treating it as equivalent to OAuth would create false connected states and runtime failures. Accepting end-user OAuth client secrets would also move application-level secrets into a user form without solving provider redirect registration.

### B. Keep OAuth-only connections

Rejected. It is simple, but it prevents legitimate service-account automation for Google Sheets and does not satisfy users who operate server-to-server workloads.

### C. Capability-bound hybrid authentication

Selected. The Registry declares allowed authentication modes per Action. The server verifies, encrypts, resolves, and authorizes each credential through one runtime interface. OAuth remains preferred for user-account access; service accounts, API keys, PATs, bot tokens, and provider tokens are enabled only for Actions they can perform.

## 4. Authentication Contract

### 4.1 Registry types

Add a serializable `supportedAuthModes` field to `ActionDefinition`. Supported values are `oauth`, `service_account`, `api_key`, `token`, `multi_field`, and `internal`. The app Registry describes connection forms, but ActionDefinition is authoritative for execution eligibility.

Every stored connection exposes a safe runtime descriptor:

```ts
type ResolvedActionCredential = {
  id: string;
  appId: string;
  mode: "oauth" | "service_account" | "api_key" | "token" | "multi_field" | "internal";
  accountLabel: string | null;
  grantedScopes: string[];
  status: "valid" | "expired" | "reconnect_required";
  secret: OAuthBearerSecret | StructuredCredentialSecret | null;
};
```

The descriptor is server-only. Secrets never enter workflow JSON, approval snapshots, queue safe payloads, logs, or client DTOs.

### 4.2 OAuth application secrets

Users do not enter provider OAuth Client IDs or Client Secrets. Those identify the DREAMWISH OAuth application and remain operator-managed environment configuration. Users only log in and consent through the provider screen.

### 4.3 Google OAuth services

Extend the Google service contract with `sheets` and `youtube`:

- `sheets`: identity scopes plus `spreadsheets` and `spreadsheets.readonly` as required by the selected Actions.
- `youtube`: identity scopes plus `youtube`, `youtube.upload`, and `youtube.force-ssl` as required by the selected Actions.

Both use the canonical Google callback URI. The durable OAuth session retains the exact app ID so one provider callback can create separate Gmail, Drive, Calendar, Sheets, and YouTube connections.

### 4.4 Google Sheets service account

Google Sheets supports either OAuth or a service-account credential containing `client_email`, `private_key`, and optional `project_id`. The server parses and validates the JSON, creates a short-lived signed JWT assertion, exchanges it at Google's token endpoint, and verifies the resulting token. The UI explains that the target spreadsheet must be shared with the service-account email.

Service-account credentials may execute Sheets read/write Actions according to the requested scope. They do not grant Gmail, Drive-user, Calendar-user, or YouTube-user access.

### 4.5 YouTube API key

An API key may connect only to public YouTube Data API read Actions. Add `get-video`, `search-videos`, and `get-channel` Actions with `supportedAuthModes: ["api_key", "oauth"]`. Existing upload, update, thumbnail, and playlist-write Actions require OAuth and never accept an API key.

The connection verifier calls a bounded public YouTube Data API request. It stores only encrypted key material and safe verification metadata.

## 5. Unified Credential Resolution

Introduce an `ActionCredentialResolver` used by activation validation, preview, approval, and Worker execution. It resolves either a durable OAuth connection or a verified encrypted credential by owner ID and selected connection ID, confirms app identity, authentication mode, expiry, scopes/capabilities, and returns a server-only secret to the Adapter client.

The common pipeline order remains:

1. Load pinned ActionDefinition version.
2. Validate and normalize input.
3. Resolve owner-scoped connection through `ActionCredentialResolver`.
4. Check Action authentication mode, scope/capability, credential status, idempotency, and rate limit.
5. Build and persist a masked Preview.
6. Apply approval policy.
7. Call the exact Adapter only after approval requirements pass.
8. Validate and mask output, persist metrics, events, and audit records.

Activation no longer assumes every credential ID belongs to `integration_connections`. It validates the selected connection through the same resolver used immediately before execution.

## 6. Gmail to AI to Notion Scenario

### 6.1 Root cause

The prompt compiler detects app names but does not compile user intent into stable Action IDs, correct order, required input, or mappings. The legacy runner then treats every Gmail action as send and every Notion action as page creation. This is why the screenshot asks for a Gmail recipient and reports `부분 완료`.

### 6.2 Correct graph

The template and prompt compiler produce:

1. Gmail `watch-new-email` Trigger.
2. AI `summarize` Action with `input` mapped from the received message body, falling back to snippet.
3. Notion `create-page` Action with:
   - `parentId`: selected by the user from a safe Notion resource selector or entered explicitly;
   - `title`: mapped from the Gmail subject;
   - `content`: mapped from the AI summary output.

The Gmail Trigger is read-only and never appears as an external-send approval. The AI step executes before Notion. Notion page creation is an external write and follows the workflow's medium-risk policy. If `parentId`, connection, or a mapping is missing, activation is blocked before a run is created; the system does not create a misleading partial run.

### 6.3 Runtime cutover

Remove app-ID-based execution classification and stop creating new legacy JSON `AutomationRun` records. Manual, scheduled, Gmail-triggered, webhook, delayed, and retried executions all enqueue the canonical PostgreSQL execution path. Run History reads canonical executions and Approval Center handles approvals. Existing legacy records remain read-only history and are labelled `이전 실행 기록`; their disabled approval endpoint is not presented as executable.

## 7. Adapter Completion

The remaining 111 Action definitions are implemented in bounded provider packs. An Adapter is enabled only with request construction, authentication, idempotency behavior where supported, timeout, provider error normalization, output normalization, request/rate-limit telemetry, secret masking, and contract tests.

Provider packs:

1. Google and content flow: Gmail reply/forward/attachment save, Drive upload/download, YouTube read/write, AI-to-Notion scenario.
2. Messaging: Discord and Telegram.
3. Internal: DREAMWISH CRM, Variables, Data Store, Error Handler.
4. Work management: Airtable, Trello, Asana, Jira, Linear, HubSpot, Salesforce.
5. Commerce: Stripe and Shopify.
6. Publishing: WordPress, Facebook, Instagram, X, LinkedIn.
7. AI and code: OpenAI and configured AI provider Actions; JavaScript/TypeScript only through an isolated code-worker boundary.
8. Binary cloud files: Drive, OneDrive, and Dropbox upload/download through the existing owner-scoped file storage contract.

For APIs that require provider-side application review, paid access, webhook registration, organization approval, or an isolated worker, the Adapter is still implemented and tested with fixtures, but UI readiness reports the exact external configuration requirement. It does not report a fake success.

## 8. Error Handling and Security

- Unsupported authentication mode: `AUTH_MODE_NOT_ALLOWED`.
- Wrong app connection: `CONNECTION_APP_MISMATCH`.
- Expired/revoked credential: `CREDENTIAL_INVALID` or `RECONNECT_REQUIRED`.
- Insufficient OAuth scope or credential capability: `SCOPE_INSUFFICIENT`.
- Provider setup missing: `PROVIDER_CONFIGURATION_REQUIRED` with safe field names only.
- Provider 401/403, 429, and 5xx responses map to stable typed errors and retry policy.
- Google private keys, OAuth tokens, API keys, authorization headers, passwords, and provider payload secrets are always masked.
- URL-based Adapters reuse the existing public HTTPS/SSRF policy.
- High and critical Actions retain the mandatory two-stage approval and snapshot hash verification.

## 9. Testing and Completion Criteria

- A failing regression test reproduces the current Gmail receive step being classified as Gmail send.
- Prompt compilation produces Gmail Trigger → AI summarize → Notion create-page in that order with stable mappings.
- Activation blocks an unset Notion parent page before execution.
- Sheets and YouTube OAuth start routes create correct app-bound sessions and provider scopes.
- Sheets service-account credentials verify, encrypt, resolve, and execute without OAuth.
- YouTube API keys execute only public read Actions; every write Action rejects them before a provider call.
- OAuth and key credentials use the same activation and Worker pipeline without exposing secrets.
- Every one of the 227 Action definitions resolves to an exact Adapter implementation, or is explicitly configuration-blocked by an implemented Adapter rather than `ADAPTER_NOT_IMPLEMENTED`.
- Legacy app-level approval classification creates no new runs.
- Full test, lint, typecheck, build, and `git diff --check` pass.
- Live provider verification is reported separately when test accounts or provider approvals are unavailable; fixture success is never described as a live provider success.
