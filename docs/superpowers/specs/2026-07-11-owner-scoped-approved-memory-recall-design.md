# Owner-Scoped Approved Memory Recall Design

## Status

Approved in conversation on 2026-07-11.

## Goal

Complete one trustworthy personal-brain loop:

1. preserve each user's original chat history;
2. derive source-linked memory candidates without auto-approving them;
3. let the user approve, edit, reject, or forget a memory;
4. recall only that user's approved memories in later answers; and
5. show which approved memories supported an answer.

The feature must prevent one Firebase account from reading, searching, approving, or recalling another account's data.

## Product Decisions

- Original user and assistant messages are retained as the lossless archive.
- The raw archive is not automatically used as LLM context.
- Memory extraction may create zero or more candidates from a completed exchange.
- A candidate never enters recall until the user explicitly approves it.
- Editing during approval stores the edited memory while preserving links to the original messages.
- Rejecting a candidate keeps its audit record but excludes it from recall.
- Forgetting an approved memory disables recall and graph participation while preserving the original chat archive.
- All memory-pipeline data is scoped by the verified Firebase UID.
- Legacy unowned data is backed up and assigned once to the authenticated administrator UID.

## Scope

### Included

- Owner scoping for chat sessions and messages.
- Owner scoping for memory candidates, approved memories, embeddings, and graph construction.
- Owner scoping for the project, knowledge-note, and file records that may supply memory or graph context.
- Source provenance from a memory to its originating session and message IDs.
- Explicit candidate approval, edit-and-approve, reject, and approved-memory forget actions.
- Correction of approved memory with provenance and version history preserved.
- Retrieval of approved memory for later chat requests.
- Memory citations in chat answers.
- Idempotent administrator migration of legacy unowned JSON data.
- Focused API, repository, migration, retrieval, and UI contract tests.

### Excluded

- Replacing JSON persistence with SQLite, Postgres, or a vector database.
- IndexedDB browser replication and whole-archive export.
- A new Brain Home dashboard.
- New external connectors or connector write actions.
- Multi-model answer comparison, automatic provider fallback, or model routing.
- Self-improvement policy updates.
- Full account scoping of CRM, calendar, workflow, automation, payment, or OAuth data when those records cannot enter this memory pipeline. Those domains require separate security slices before they may contribute recall context.

## Chosen Approach

Extend the existing repositories and UI instead of adding a parallel V2 store or replacing the persistence layer.

This approach reuses the current chat repository, memory engine, graph builder, streaming route, Memory view, and source cards. It has the smallest migration surface and preserves existing behavior outside the approved-memory boundary. Compatibility readers normalize legacy records, while new writes always require an owner.

## Trust Boundary and Owner Context

The server derives identity only from the signed `dreamwish-session` cookie. Request bodies, query parameters, localStorage, and custom headers cannot select an owner.

A shared server helper returns an immutable owner context:

```ts
type OwnerContext = {
  uid: string;
  email: string;
  role: "admin" | "user";
};
```

Protected route handlers call the helper and pass `owner.uid` to services and repositories. Public repository functions that access user content require `ownerId` as their first argument or as a mandatory field in an options object. Missing owner context fails closed.

Repository APIs use the name `ownerId`. Existing chat JSON records retain their snake-case convention and persist this value as `owner_id`; memory, project, note, and file records persist it as `ownerId`. This naming choice avoids unrelated record rewrites while keeping service interfaces consistent.

Owner mismatches return `404` for record-specific routes so IDs cannot be enumerated across accounts. Collection routes return only records owned by the current UID.

## Data Model

### Chat archive

`ChatSessionRecord` and `ChatMessageRecord` gain an owner field. A message must have the same owner as its session. New message records also retain provider and model metadata when available.

Archiving a session hides it from the active list but does not delete its messages or provenance. Archived messages are not searched for recall unless they are the source of an already approved memory.

### Memory lifecycle

The memory lifecycle is:

```text
pending -> approved -> forgotten
pending -> rejected
```

An approved memory is never changed back to pending. A user correction creates an audit entry and updates the approved content without removing the original source links.

Memory records add:

- `ownerId`
- `sourceSessionId`
- `sourceMessageIds`
- `status: "pending" | "approved" | "rejected" | "forgotten"`
- `approvedAt`, `rejectedAt`, or `forgottenAt` when applicable
- `approvedBy`
- `version`, incremented on every accepted mutation
- an append-only history entry for approval, edit, rejection, and forgetting

Every candidate source ID must resolve to a chat message owned by the same UID. Approval fails if provenance is missing or crosses an owner boundary.

Candidate mutations include `expectedVersion`. A stale version returns a conflict without changing the record. This prevents two tabs from silently overwriting approval or edits.

Each completed exchange also has a capture job containing `ownerId`, `sourceSessionId`, `sourceMessageIds`, `status`, `attempts`, `lastErrorCode`, and timestamps. Its status is `pending`, `completed`, or `failed`. A failed job is the durable retry record; retrying the same job is idempotent and cannot create duplicate candidates for the same normalized fact and source messages.

### Knowledge graph

Graph nodes and edges are computed for an explicit owner. The graph builder loads only that owner's approved, non-forgotten memories and only owner-scoped notes or files. Each node and edge preserves source memory IDs.

Pending, rejected, forgotten, unowned, or foreign records cannot contribute graph nodes, edges, or retrieval context.

## Data Flow

### Chat and capture

1. The streaming chat route resolves `OwnerContext` from the signed cookie.
2. The route creates or loads an owner-scoped chat session.
3. It persists the user's message before invoking the provider.
4. It retrieves a bounded set of the same owner's approved memories.
5. It sends those memories to the selected provider as a clearly delimited, untrusted factual context block.
6. It streams and persists the assistant response.
7. After a completed response, the capture engine analyzes the exchange and creates zero or more pending candidates linked to both message IDs.
8. Candidate extraction failure is recorded for retry and does not turn a successful chat answer into a failure.

### Approval

1. Chat shows a compact candidate card after a completed exchange when candidates exist.
2. The user can approve, edit and approve, or defer to the Memory Inbox.
3. The Memory Inbox also supports rejection.
4. Approval validates owner and provenance, persists the approved content, refreshes its local embedding, and makes it eligible for graph construction.
5. Rejection keeps the audit record and excludes the candidate from retrieval.

### Recall and citations

Approved-memory retrieval combines the existing local lexical/vector score with recency and graph/entity overlap. It returns at most six memories and enforces a combined context budget of 2,400 characters. Results with a normalized score below `0.25` are omitted.

The prompt labels recalled memory as user-owned reference data, not executable instructions. Each recalled item carries a stable `memory://<memoryId>` source plus its source session and message IDs. The final chat response exposes those sources through the existing source-card pattern. Memory sources add `sourceType: "memory"`, `sourceId`, `sessionId`, and `messageIds` to the existing source shape. The completed stream payload also reports `memoryStatus: "used" | "empty" | "degraded"` and any newly created candidate summaries, so the UI does not infer capture or retrieval state.

Raw chats, pending candidates, rejected memories, and forgotten memories are never injected into the prompt.

## API and Component Changes

### Server APIs

- Existing chat, session, memory dashboard, candidate, approval, knowledge, project, and file routes derive the owner from the signed session.
- Candidate mutation supports approve, edit-and-approve, and reject.
- Approved-memory mutation supports forget.
- Responses never include foreign records or accept a client-supplied owner ID.
- Stable response codes are `AUTH_REQUIRED`, `MEMORY_NOT_FOUND`, `MEMORY_CONFLICT`, `MEMORY_EXTRACTION_FAILED`, `MEMORY_RETRIEVAL_DEGRADED`, and `MIGRATION_FAILED`.

### Chat UI

- The completed assistant message can show a `Memory candidate` card.
- The card supports `Approve`, `Edit and approve`, and `Review later`.
- Recalled memory sources appear with normal answer sources and link back to the owning session when available.
- A non-blocking status indicates that memory extraction or recall was degraded.

### Memory UI

- The existing Inbox remains the full review surface.
- Pending items support approve, edit-and-approve, and reject.
- Approved items show provenance and support correction or forget.
- Forgotten items are excluded from active memory and graph counts.

## Legacy Migration

Migration identifier: `owner-v1`.

The migration runs during the first successful administrator login or session refresh after Firebase verification and before protected user content is returned. A non-administrator never claims unowned records and sees no unowned content.

Before rewriting affected JSON files, the migration copies them into a timestamped directory under `DATA_DIR/.migration-backups/owner-v1/`. If any backup fails, no source file is rewritten. Rewrites use the existing temp-file-and-rename pattern.

Affected legacy chat, memory, project, knowledge-note, and file records without an owner are assigned to the administrator UID. Existing owned records are unchanged. A marker under `DATA_DIR/.migrations/owner-v1.json` records the UID, completion time, and affected files.

The migration is idempotent:

- the same completed UID returns success without rewriting;
- a marker for a different UID fails closed;
- a partial or invalid marker requires operator review and does not expose unowned records;
- records remain readable only through the migration compatibility layer during the administrator migration request.

## Error Handling

- Persist the user message before provider execution. If provider execution fails, retain the interrupted exchange state for retry.
- Memory extraction failure never removes the chat response; it records a retryable capture failure.
- Approval conflicts return a stable conflict response and leave the candidate unchanged.
- Retrieval failure produces an answer without memory and a non-blocking degraded-memory status.
- Missing or foreign records return `404`.
- Missing or invalid authentication returns `401`; insufficient entitlement remains governed by the existing API access policy.
- Migration backup or rewrite failure stops migration, keeps legacy content hidden from non-admin users, and returns a stable migration error.

## Security and Privacy Invariants

- Only verified session claims establish `ownerId`.
- Every user-content repository read, search, mutation, graph build, and recall query in this slice includes an owner filter.
- A memory and each of its source messages must share the same owner.
- Only approved, non-forgotten memories can reach an LLM prompt.
- Recalled content is delimited and treated as untrusted reference data.
- API keys, session tokens, OAuth tokens, and authorization headers never enter chat, memory, citations, logs, or migration backups beyond their pre-existing dedicated stores.
- Logs may contain record IDs and stable error codes, but not memory or message bodies.

## Testing

All new executable tests live under `tests/` so the current test runner discovers them.

Required coverage:

- two UIDs cannot list, load, search, mutate, approve, forget, graph, or recall each other's records;
- request-body and header owner spoofing have no effect;
- session and message owner consistency is enforced;
- a completed exchange preserves raw messages and creates source-linked pending candidates when durable memory is detected;
- pending and rejected candidates never enter recall;
- approval makes the edited memory retrievable with correct provenance;
- stale approval or correction versions fail without overwriting the current memory;
- a failed capture job can be retried idempotently without duplicate candidates;
- forgetting removes a memory from retrieval and graph output without deleting its chat sources;
- retrieval respects the six-result limit, the `0.25` relevance threshold, and the 2,400-character context budget;
- memory citations resolve to records owned by the current UID;
- extraction and retrieval degradation do not fail a successful chat response;
- `owner-v1` creates a backup, assigns legacy data only to the administrator, is idempotent, and fails closed on a conflicting or invalid marker;
- existing access-control, chat, memory, RAG, and UI contract tests continue to pass.

Final verification requires:

```text
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

## Success Criteria

The slice is complete when:

1. User A cannot observe or influence User B's chat, memory, graph, or recall data.
2. A new chat exchange remains in the raw archive even when no memory is approved.
3. A pending candidate is absent from subsequent LLM context.
4. After approval, a relevant later question recalls the memory and displays traceable sources.
5. Rejection or forgetting removes the memory from recall and graph output.
6. Legacy unowned data is backed up and claimed exactly once by the authenticated administrator.
7. Existing tests plus the new isolation, lifecycle, provenance, migration, and UI tests pass.
