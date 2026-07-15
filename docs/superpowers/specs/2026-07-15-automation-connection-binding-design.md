# Automation Connection Binding Design

## Goal

When Connection Management shows a verified app account, Automation must stop showing `연결 필요` for an unbound scenario node whenever there is exactly one safe account choice. The same binding decision must be enforced by the server immediately before a scenario runs; this is not a cosmetic badge change.

The design covers encrypted API credentials and verified OAuth accounts. It preserves the existing global sidebar, Automation tabs, canvas, templates, and connection-management presentation.

## Current Failure

Connection state and scenario-node state are currently independent:

- Automation loads saved scenarios and encrypted credentials but never reconciles them.
- A node badge checks only whether `credentialId` is truthy.
- AI drafts write a non-existent `pending-${appId}` string, which makes structural validation pass even though no account exists.
- Scenario save and run routes do not verify that the referenced connection belongs to the authenticated owner, matches the node app, or remains verified.
- OAuth connections are not part of the Automation account selector.

The result is both confusing and unsafe: a real connection may still look disconnected, while a fake string can look connected.

## Canonical Binding Model

Each credential-requiring node stores an exact typed reference:

```ts
type ScenarioConnectionBinding =
  | { kind: "credential"; id: string }
  | { kind: "oauth"; id: string };

type AutomationConnectionCandidate = {
  binding: ScenarioConnectionBinding;
  appId: string;
  label: string;
  accountLabel: string | null;
  masked: string | null;
  state: "verified" | "needs_reconnect";
  verifiedAt: string | null;
};

type ScenarioConnectionResolution = {
  nodeId: string;
  state:
    | "not_required"
    | "connected"
    | "needs_connection"
    | "needs_selection"
    | "needs_reconnect";
  binding: ScenarioConnectionBinding | null;
  candidates: AutomationConnectionCandidate[];
  autoBinding: ScenarioConnectionBinding | null;
};
```

The public candidate contains no ciphertext, access token, refresh token, API secret, OAuth scope payload, owner ID, or provider response body. The exact secret/token resolver remains server-only.

Legacy `credentialId` rows are normalized as follows:

- `pending-*` becomes unbound.
- A real legacy ID becomes `{ kind: "credential", id }` and is resolved normally.
- Nodes that do not require a connection always store `null`.
- Legacy scenarios read as `version: 1`; the first successful CAS write persists the normalized model.

## Resolution Rules

For each node:

1. If `requiresCredential` is false, clear any binding and report `not_required`.
2. If the current binding still belongs to the authenticated owner, matches the node app, and is verified, keep it even if other accounts exist.
3. If there is no binding and exactly one verified candidate for the app, select it automatically.
4. If there is no binding and no verified candidate, report `needs_connection`.
5. If there is no binding and two or more verified candidates, do not guess; report `needs_selection`.
6. If an explicit binding is deleted, expired, revoked, unverified, app-mismatched, or otherwise stale, report `needs_reconnect`. Never silently switch it to another account.

Automatic reconciliation changes only truly unbound nodes. It is idempotent: a second reconciliation with the same candidate set does not increment the scenario version.

## Versioning and Persistence

`AutomationScenario` gains a numeric `version`.

- All scenario PUT, status changes, and connection-binding PATCH operations require `expectedVersion`.
- The repository compares the version inside the owner-document lock and increments it once on a real change.
- The JSON fallback wraps the entire read/compare/write in `withJsonStoreLock`; version CAS is not implemented as an unlocked read followed by write.
- A conflict returns HTTP 409 with a safe current scenario so the client can reload instead of overwriting concurrent edits.
- GET routes never persist reconciliation.
- After loading an active scenario, the client may request server reconciliation. The server computes the unique binding and applies it with CAS.
- After a credential is saved in Automation, the client refreshes the safe candidate list and reconciles the active scenario immediately.

Because credentials/OAuth tokens and scenarios live in different stores, deletion does not attempt an unsafe cross-store transaction. A stale exact reference remains auditable, immediately resolves to `needs_reconnect`, and is rejected at run time. The UI refreshes candidate state after a local connection change.

## OAuth and Credential Parity

The unified candidate service includes:

- encrypted credentials only when `verificationStatus === "verified"` and `verifiedAt` exists;
- reconnect candidates when a saved credential is no longer verified;
- OAuth token records by their exact token record ID, mapped through the app's declared `oauthTarget`;
- OAuth as verified only when it is same-owner, active, verified, has no verification error, and its access token is either unexpired or refreshable through that exact token record. An expired/non-refreshable record is `needs_reconnect`.

Multiple OAuth accounts are preserved as separate candidates. No service may select the first active token as a fallback for a bound scenario. A new server-only exact accessor resolves and, when its exact record is refreshable, refreshes only the token identified by `{ ownerId, appId, tokenId }`. Failed or unavailable exact refresh changes that candidate to `needs_reconnect`; it never falls back to another token.

OAuth save, exact refresh, and revoke mutations use the JSON-store lock so concurrent account updates cannot overwrite another token row.

Environment-only tokens have no owner-specific durable ID and therefore cannot be silently bound to a user scenario. They remain configuration status, not an Automation connection candidate.

## API Contract

`GET /api/automation/connections` returns only same-owner safe candidates.

`PATCH /api/automation/scenarios/:scenarioId` accepts:

```ts
type ScenarioConnectionPatch = {
  expectedVersion: number;
  mode: "reconcile" | "select" | "clear";
  nodeId?: string;
  binding?: ScenarioConnectionBinding;
};
```

- `reconcile` computes all unambiguous automatic bindings server-side.
- `select` requires an exact verified same-owner/app candidate.
- `clear` removes one node's binding.
- Client-supplied owner IDs, app IDs, labels, account metadata, or secret fields are rejected.

The ordinary scenario PUT validates any changed binding against the same candidate service. It cannot persist an arbitrary ID from the browser.

## Run-Time Enforcement

Before recording or executing a run, the server loads the scenario for the authenticated owner and resolves every node again from current durable connection records.

- `connected` nodes may continue.
- `needs_connection`, `needs_selection`, and `needs_reconnect` return HTTP 422 with safe node-specific issues.
- Exact encrypted credentials are revealed only by same-owner/app/verified ID.
- Exact OAuth access tokens are loaded or refreshed only by the bound token record ID.
- A deleted or revoked connection blocks the run even if the browser still has stale candidate data.

The current mock runner still performs this gate. Future real executors consume the exact resolved server handle, never a client-provided secret or a “first account” lookup.

## Presentation

- One verified candidate: the inspector selects it and the node no longer shows `연결 필요` after the CAS reconciliation succeeds.
- No verified candidate: `연결 필요` and the existing setup action.
- Multiple verified candidates: `계정 선택 필요` and an explicit selector.
- Stale explicit binding: `다시 연결 또는 계정 선택`.
- Connected: show the safe account label; do not show secrets.
- Connection Management uses verified candidate state, not merely the presence of a stored credential row, when displaying `연결됨`.

## Testing

- Zero, one, and multiple verified candidates.
- Existing valid explicit selection remains stable with multiple candidates.
- Deleted, expired, revoked, needs-reconnect, app-mismatched, and cross-owner references fail closed.
- Credential and OAuth bindings use the same rules.
- Legacy `pending-*` and numeric version migration.
- Auto-binding increments the version once and is idempotent.
- Concurrent same-version writes return 409 and do not overwrite user edits.
- Arbitrary/foreign binding IDs are rejected by PUT/PATCH.
- Run-time validation blocks missing, ambiguous, and stale bindings.
- Public APIs and UI props contain no encrypted/token/secret material.
- Existing Automation canvas, templates, run history, connection management, and guide remain available.
