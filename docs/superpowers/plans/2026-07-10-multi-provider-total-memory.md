# Multi-Provider Total Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users explicitly choose any server-configured free AI provider while permanently retaining all chats as source-linked memory, graphing that knowledge, mirroring it to IndexedDB, and exporting it safely.

**Architecture:** Railway persistent storage under `DATA_DIR` is authoritative. Existing provider adapters, chat repository, memory engine, and knowledge network are extended rather than replaced; a small public provider catalog and archive/sync boundary keep secrets server-only and browser replication versioned.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node JSON repositories, IndexedDB, Node test runner.

## Global Constraints

- API credentials are read only from server environment variables and are never serialized to clients.
- Provider selection is explicit and never silently falls back.
- Visible chat deletion archives data; it never removes chat source records or derived memories.
- Every completed exchange creates a lossless permanent-memory record.
- Railway `DATA_DIR` is authoritative; IndexedDB is a disposable local replica.

---

### Task 1: Persistent data root and public provider catalog

**Files:**
- Modify: `src/lib/local-db/json-store.ts`
- Modify: `src/lib/db/repositories/chat.repository.ts`
- Modify: `src/lib/ai/config.ts`
- Create: `app/api/ai/providers/route.ts`
- Modify: `tests/ai-provider-config.test.ts`

**Interfaces:**
- Produces: `getDataDirectory(): string`
- Produces: `getPublicAIProviderCatalog(): Array<{provider; label; model; configured}>`

- [ ] **Step 1: Write failing tests** for `DATA_DIR` resolution and a public catalog that contains model/configuration metadata but no `apiKey`, `headers`, or `baseUrl`.
- [ ] **Step 2: Run** `npm test -- tests/ai-provider-config.test.ts` and confirm the new assertions fail because the functions do not exist.
- [ ] **Step 3: Implement the shared data root**:

```ts
export function getDataDirectory() {
  return process.env.DATA_DIR?.trim() || path.join(process.cwd(), ".local-db");
}
```

Use it in both JSON-store and chat repository paths.
- [ ] **Step 4: Implement the secret-free catalog** by mapping `PROVIDER_ORDER` through runtime config and returning only provider, human label, model, and configured.
- [ ] **Step 5: Add `GET /api/ai/providers`** returning `{ providers }` from the public catalog.
- [ ] **Step 6: Run** `npm test -- tests/ai-provider-config.test.ts` and `npm run typecheck`; expect zero failures.
- [ ] **Step 7: Commit** with `feat: expose configured AI provider catalog`.

### Task 2: Session provider persistence and permanent archive semantics

**Files:**
- Modify: `src/lib/chat/chat.types.ts`
- Modify: `src/lib/db/repositories/chat.repository.ts`
- Modify: `app/api/ai/chat/route.ts`
- Modify: `app/api/ai/chat/stream/route.ts`
- Modify: `app/api/ai/sessions/[id]/route.ts`
- Create: `tests/chat-persistence.test.ts`

**Interfaces:**
- `ChatSessionRecord.provider: AIProviderName | null`
- `ChatMessageRecord.provider: AIProviderName | null`
- `ChatMessageRecord.model: string | null`
- `ensureSession(sessionId, message, provider?)`

- [ ] **Step 1: Write failing repository tests** proving a chosen provider is saved on session/messages and `deleteSession` preserves all records while setting `archived_at`.
- [ ] **Step 2: Run** `npm test -- tests/chat-persistence.test.ts`; expect missing metadata and physical deletion failures.
- [ ] **Step 3: Extend records and repository migrations** so old JSON without new fields loads with `null`, new sessions retain provider, and hard-delete paths call archival only.
- [ ] **Step 4: Validate provider selection** in both chat routes before saving messages, pass the runtime model from `getProviderRuntimeConfig`, and include provider/model on user and assistant records.
- [ ] **Step 5: Run** the focused test and typecheck; expect zero failures.
- [ ] **Step 6: Commit** with `feat: persist provider and permanent chat archive`.

### Task 3: Lossless total memory and provenance-aware knowledge graph

**Files:**
- Modify: `src/lib/memory/memory.types.ts`
- Modify: `src/lib/memory/auto-memory-engine.ts`
- Modify: `src/lib/memory/knowledge-network.ts`
- Modify: `src/lib/ai/prompts.ts`
- Modify: `app/api/ai/chat/route.ts`
- Modify: `app/api/ai/chat/stream/route.ts`
- Modify: `tests/auto-memory-engine.test.ts`
- Create: `tests/knowledge-network.test.ts`

**Interfaces:**
- `AutoMemoryConversationInput.userMessageId?: string`
- `AutoMemoryConversationInput.assistantMessageId?: string`
- `ApprovedMemory.sourceMessageIds?: string[]`
- `buildMemoryContext(question, limit): Promise<string>`

- [ ] **Step 1: Add failing tests** proving every non-empty exchange yields a unique lossless memory, repeated entities merge provenance, and conflicts keep both source observations.
- [ ] **Step 2: Run** focused tests and confirm failures occur for current project-level deduplication/provenance behavior.
- [ ] **Step 3: Preserve every exchange** by keying the lossless record from session and message IDs rather than merging it into one project memory. Store full original conversation plus source IDs.
- [ ] **Step 4: Extend graph types and merge logic** with aliases, observation count, timestamps, and complete `sourceIds`; never overwrite conflicting source observations.
- [ ] **Step 5: Build bounded memory context** from memory search and graph neighbors, then prepend it through `buildContextAwareChatMessages` for general and local chat.
- [ ] **Step 6: Pass saved message IDs** from chat routes into the memory engine so every graph item is traceable.
- [ ] **Step 7: Run** focused tests, full `npm test`, and typecheck; expect zero failures.
- [ ] **Step 8: Commit** with `feat: retain total memory with graph provenance`.

### Task 4: Versioned archive API, IndexedDB replica, and export

**Files:**
- Create: `src/lib/archive/archive.service.ts`
- Create: `app/api/archive/sync/route.ts`
- Create: `app/api/archive/export/route.ts`
- Create: `src/lib/archive/browser-replica.ts`
- Create: `components/Common/ArchiveSyncStatus.tsx`
- Modify: `components/Chat/ChatView.tsx`
- Modify: `components/Memory/MemoryView.tsx`
- Create: `tests/archive-service.test.ts`

**Interfaces:**
- `buildArchiveSnapshot(): Promise<ArchiveSnapshot>`
- `serializeArchive(snapshot, format: "json" | "markdown"): string`
- `syncArchiveReplica(snapshot): Promise<void>`

- [ ] **Step 1: Write failing archive tests** for complete chat/memory/graph content, monotonic revision, Markdown headings, and forbidden secret keys.
- [ ] **Step 2: Run** `npm test -- tests/archive-service.test.ts` and confirm missing-module failure.
- [ ] **Step 3: Implement archive snapshot and serializers** using repository reads only; recursively reject keys matching `/api.?key|token|authorization|headers/iu`.
- [ ] **Step 4: Add authenticated sync/export routes** returning JSON snapshots and attachment downloads for `json` or `markdown`.
- [ ] **Step 5: Implement IndexedDB stores** `sessions`, `messages`, `memories`, `nodes`, `edges`, and `meta`; replace each store in one transaction only when incoming revision is newer.
- [ ] **Step 6: Trigger sync** after initial chat/memory load and successful chat completion; render last-sync/error state and export buttons.
- [ ] **Step 7: Run** archive tests, full tests, typecheck, and build; expect zero failures.
- [ ] **Step 8: Commit** with `feat: add local archive replica and exports`.

### Task 5: Chat model UI and recommended-connections removal

**Files:**
- Modify: `components/Chat/ChatView.tsx`
- Modify: `tests/auth-and-ui-contract.test.ts`
- Modify: `tests/ai-provider-config.test.ts`

**Interfaces:**
- Consumes: `GET /api/ai/providers`
- Consumes: `ChatSessionRecord.provider`

- [ ] **Step 1: Add failing UI contract tests** that require dynamic configured-provider rendering, session provider restoration, permanent-memory/sync labels, and absence of `ConnectedContextWorkspace` from AI Chat.
- [ ] **Step 2: Run** the focused UI contract test and confirm the old static provider list and context workspace fail expectations.
- [ ] **Step 3: Replace static options** with the provider catalog, disable sending when none are configured, restore `session.provider`, and show actionable provider errors.
- [ ] **Step 4: Remove** `ConnectedContextWorkspace` import/rendering from ChatView while keeping Knowledge Network graph UI.
- [ ] **Step 5: Run** full tests, lint, typecheck, and build; expect all commands to exit 0.
- [ ] **Step 6: Commit** with `feat: finish explicit model and total memory UI`.

### Task 6: Railway configuration and operational documentation

**Files:**
- Create: `.env.example`
- Create: `docs/railway-total-memory.md`
- Modify: `README.md`

**Interfaces:**
- Documents: `DATA_DIR=/data`, Railway volume mount `/data`, and provider environment variables.

- [ ] **Step 1: Add `.env.example`** with blank secret values and current default model identifiers.
- [ ] **Step 2: Document Railway volume setup**, backup behavior, IndexedDB limitations, retention semantics, and provider quota errors.
- [ ] **Step 3: Run** `git diff --check`, `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`; require every command to exit 0.
- [ ] **Step 4: Commit** with `docs: add Railway total memory setup`.
