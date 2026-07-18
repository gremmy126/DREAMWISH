# Local AI Chat and Deep Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade DREAMWISH chat and Deep Research to a resumable, cited, local-first service that uses an external `llama.cpp` server, owner-approved local knowledge, self-hosted search/extraction services, and a durable 21-node research graph.

**Architecture:** The browser selects quick, local RAG, web, or Deep Research. Cloud-safe requests continue through the existing Next.js provider layer; local requests traverse the encrypted Local Agent relay and are stored only in the Agent Vault. Deep Research runs as a BullMQ worker backed by Valkey, checkpoints graph state in the Agent SQLCipher store for local mode or PostgreSQL for cloud mode, and streams typed events through SSE or the encrypted relay.

**Tech Stack:** Next.js 15, TypeScript 5.7, Zod 4.4.3, LangGraph.js 1.4.7, BullMQ 5.80.8, ioredis 5.11.1, eventsource-parser 3.1.0, Valkey, SearXNG, Trafilatura, Crawl4AI 0.8.5, Playwright, Docling Serve 1.18.0, llama.cpp OpenAI-compatible HTTP API.

## Global Constraints

- Do not install or bundle Ollama or Open Deep Research.
- `llama-server` runs outside Docker and is reached only through `LOCAL_LLM_BASE_URL`, defaulting to `http://127.0.0.1:8080/v1` inside the Local Agent.
- Raw local prompts, answers, source text, documents, claims, and checkpoints never enter Railway PostgreSQL or logs.
- Research never starts from automatic mode selection without explicit user confirmation and a visible budget.
- Search and extraction reject loopback, link-local, private, metadata, non-HTTP, redirect-to-private, and DNS-rebinding targets.
- Every final factual claim links to at least one retained source span or is visibly marked unsupported.
- Cancellation preserves partial text and the last completed checkpoint; resume is idempotent.
- Markdown is stored as authored, then rendered with a safe Markdown component; it is never destroyed by blanket character deletion.
- Every dependency and container image is exact-versioned; container digests are recorded in `services/local-research/images.lock.json` before release.
- Write a failing test before each implementation and commit every independently testable task.

---

### Task 1: Introduce a uniform model provider contract and local llama.cpp provider

**Files:**
- Create: `src/lib/ai/model-provider.ts`
- Create: `src/lib/ai/local-llama-provider.ts`
- Modify: `src/lib/ai/ai-provider.ts`
- Modify: `src/lib/ai/openai-compatible.provider.ts`
- Modify: `src/lib/ai/provider-options.ts`
- Modify: `app/api/ai/providers/route.ts`
- Test: `tests/ai-model-provider.test.ts`
- Test: `tests/local-llama-provider.test.ts`

**Interfaces:**
- `ModelProvider.health(signal): Promise<ModelHealth>`
- `ModelProvider.listModels(signal): Promise<ModelDescriptor[]>`
- `ModelProvider.stream(request, signal): AsyncIterable<ModelStreamEvent>`
- `ModelProvider.generateStructured(request, schema, signal): Promise<unknown>`

- [ ] **Step 1: Write failing contract tests** proving OpenAI-compatible providers and local llama.cpp emit the same `token`, `usage`, `done`, and typed error events.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement the interface and environment parser.** Require `LOCAL_LLM_MODEL`; default `LOCAL_LLM_API_KEY=local` and `LOCAL_LLM_TIMEOUT_MS=120000`; normalize the base URL once and never log headers or prompt bodies.

```ts
export type ModelStreamEvent =
  | { type: "token"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; finishReason: string }
  | { type: "error"; code: ModelErrorCode; message: string; resolution: string; retryable: boolean };
```

- [ ] **Step 4: Implement JSON-schema structured output** with one repair attempt and `MODEL_STRUCTURED_OUTPUT_INVALID` after a second schema failure.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 6: Commit:** `git commit -m "feat: add uniform local model provider"`.

---

### Task 2: Add explicit chat modes and research confirmation

**Files:**
- Create: `src/lib/chat/chat-mode-router.ts`
- Create: `components/Chat/ChatModeSelector.tsx`
- Create: `components/Chat/ResearchConfirmationDialog.tsx`
- Modify: `src/lib/chat/chat-mode-policy.ts`
- Modify: `src/lib/chat/chat.types.ts`
- Modify: `components/Chat/ChatView.tsx`
- Modify: `app/api/ai/chat/route.ts`
- Modify: `app/api/ai/chat/stream/route.ts`
- Test: `tests/chat-mode-router.test.ts`
- Test: `tests/chat-mode-ui.test.ts`

**Interfaces:** `ChatMode = "quick" | "local_rag" | "web" | "deep_research"`; auto-routing returns `{ recommendedMode, reasons, estimatedMinutes, estimatedSources, requiresConfirmation }`.

- [ ] **Step 1: Write failing tests** for local/private questions, current-web questions, multi-source research, explicit user overrides, and confirmation refusal.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement deterministic signals first** and use the selected model only to break a tie; the server must reject unconfirmed `deep_research` with `RESEARCH_CONFIRMATION_REQUIRED`.
- [ ] **Step 4: Render four mode controls, the recommendation reason, local service health, and the budget confirmation dialog.** Persist the user's explicit mode per session, not globally.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 6: Commit:** `git commit -m "feat: add explicit chat and research modes"`.

---

### Task 3: Make chat turns resumable, branchable, and partial-safe

**Files:**
- Create: `src/lib/chat/chat-turn-state.ts`
- Create: `src/lib/local-agent/local-chat-client.ts`
- Modify: `src/lib/chat/chat-flow.ts`
- Modify: `src/lib/db/repositories/chat.repository.ts`
- Modify: `app/api/ai/chat/stream/route.ts`
- Create: `components/Chat/ChatMessage.tsx`
- Modify: `components/Chat/ChatView.tsx`
- Test: `tests/chat-turn-state.test.ts`
- Test: `tests/chat-stream-resume.test.ts`

**Interfaces:** statuses are `queued | running | paused | cancelled | failed | completed`; every turn has `turnId`, `parentTurnId`, `revision`, `lastEventSequence`, and `partialText`.

- [ ] **Step 1: Write failing tests** for duplicate retry, transport abort, cancel, resume after event 14, regenerate into a sibling branch, and editing a user turn into a new branch.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Add fenced turn transitions** so stale streams cannot overwrite a resumed execution; retain partial text for cancelled/failed states.
- [ ] **Step 4: Route `local_rag` turns through `LocalAgentClient.request("chat.stream", ...)`;** only encrypted frames and status metadata cross the Relay.
- [ ] **Step 5: Add cancel, continue, regenerate, edit, and branch controls** with an accessible status label.
- [ ] **Step 6: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 7: Commit:** `git commit -m "feat: make AI chat turns resumable"`.

---

### Task 4: Connect chat and research to the unified owner knowledge retriever

**Files:**
- Create: `src/lib/rag/local-agent-rag.ts`
- Modify: `src/lib/memory/owner-knowledge-retriever.ts`
- Modify: `src/lib/memory/memory.types.ts`
- Modify: `src/lib/rag/rag.service.ts`
- Modify: `src/lib/rag/context-builder.ts`
- Modify: `src/lib/memory/approved-memory-context.ts`
- Modify: `app/api/ai/chat/route.ts`
- Modify: `app/api/ai/chat/stream/route.ts`
- Modify: `src/lib/deep-research/research-runner.ts`
- Test: `tests/owner-rag-context.test.ts`

**Interfaces:** extend the blocker plan's `retrieveOwnerKnowledge({ ownerId, query, limit })` with optional `sources`, `mode`, and `signal` fields. It returns bounded, owner-scoped hits from approved memory, knowledge files, CRM, ERP, and local Vault sources with `sourceType`, `sourceId`, `score`, `updatedAt`, and a safe citation label.

- [ ] **Step 1: Write failing tests** showing a customer-name-only query retrieves CRM, a product code retrieves ERP, approved memories and files are included, unapproved candidates are excluded, and one owner's data never reaches another.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement hybrid retrieval** using the production-blockers plan's owner retriever and the Local Agent `rag.search` capability; return explicit degraded-state metadata instead of swallowing errors.
- [ ] **Step 4: Enforce token and per-source caps** while retaining the highest-scoring evidence from each requested source class.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 6: Commit:** `git commit -m "feat: retrieve all owner knowledge for AI"`.

---

### Task 5: Pin and isolate the self-hosted research service stack

**Files:**
- Create: `services/local-research/compose.yml`
- Create: `services/local-research/.env.example`
- Create: `services/local-research/images.lock.json`
- Create: `services/local-research/searxng/settings.yml`
- Create: `services/local-research/trafilatura/Dockerfile`
- Create: `services/local-research/trafilatura/app.py`
- Create: `scripts/lock-local-research-images.mjs`
- Modify: `.gitignore`
- Test: `tests/local-research-compose.test.ts`

**Interfaces:** services bind to `127.0.0.1` only and expose Agent-internal health names `search`, `extract`, `crawl`, `document`, `queue`; llama.cpp is not a Compose service.

- [ ] **Step 1: Write failing manifest tests** requiring SearXNG, Trafilatura, `unclecode/crawl4ai:0.8.5`, Playwright-backed crawl, `quay.io/docling-project/docling-serve:v1.18.0`, Valkey, and the research worker; reject floating tags, host-wide binds, default passwords, and a llama image.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Add the Compose stack** with read-only filesystems where supported, non-root users, named model caches, health checks, memory/CPU limits, no public SearXNG instance, and an internal network without access to the Railway database.
- [ ] **Step 4: Implement `lock-local-research-images.mjs`.** It resolves the configured platform's `RepoDigests` with `docker image inspect`, writes canonical sorted JSON, and exits nonzero if any service lacks a `sha256:` digest.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && docker compose -f services/local-research/compose.yml config`.
- [ ] **Step 6: Commit:** `git commit -m "feat: pin local research service stack"`.

---

### Task 6: Secure search and extraction with a deterministic fallback chain

**Files:**
- Create: `src/lib/deep-research/search-provider.ts`
- Create: `src/lib/deep-research/searxng-provider.ts`
- Create: `src/lib/deep-research/extraction-pipeline.ts`
- Create: `src/lib/deep-research/docling-client.ts`
- Modify: `src/lib/deep-research/safe-fetch.ts`
- Test: `tests/research-search-provider.test.ts`
- Test: `tests/research-extraction-pipeline.test.ts`

**Interfaces:** `search(query, options)` returns normalized results; `extract(url, mimeType, signal)` tries safe HTTP, Trafilatura, Crawl4AI, then Playwright, while PDF/Office documents go to Docling.

- [ ] **Step 1: Write failing tests** for redirect-to-private IP, encoded loopback, DNS rebinding, maximum bytes, robots denial, content-type routing, fallback order, timeout, and source checksum.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement SearXNG normalization** with deduplication by canonical URL and explicit `SEARCH_SERVICE_UNAVAILABLE` resolution text.
- [ ] **Step 4: Implement extraction adapters** that return `{ text, markdown, title, author, publishedAt, language, checksum, method, warnings }` and never return partial binary data as text.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 6: Commit:** `git commit -m "feat: add secure research extraction pipeline"`.

---

### Task 7: Define evidence, claim, source, and contradiction schemas

**Files:**
- Create: `src/lib/deep-research/research-schemas.ts`
- Create: `src/lib/deep-research/source-trust.ts`
- Create: `src/lib/deep-research/claim-verifier.ts`
- Modify: `src/lib/deep-research/deep-research.types.ts`
- Test: `tests/research-evidence-schema.test.ts`
- Test: `tests/research-claim-verifier.test.ts`

**Interfaces:** Zod schemas `ResearchSource`, `EvidenceSpan`, `ResearchClaim`, `Contradiction`, and `Citation`; each claim references retained evidence IDs.

- [ ] **Step 1: Write failing schema and verifier tests** for source provenance, exact character offsets, duplicate sources, temporal mismatch, conflicting numeric claims, unsupported claims, and confidence reduction.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement a transparent trust score** from domain class, publication metadata, recency relevance, corroboration, extraction warnings, and primary-source status; store factors, not just the total.
- [ ] **Step 4: Implement contradiction grouping** and prevent report finalization when a high-impact contradiction is neither resolved nor disclosed.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 6: Commit:** `git commit -m "feat: validate research evidence and claims"`.

---

### Task 8: Replace the in-process runner with a 21-node LangGraph

**Files:**
- Create: `src/lib/deep-research/research-graph.ts`
- Create: `src/lib/deep-research/research-graph-state.ts`
- Create: `src/lib/deep-research/research-nodes.ts`
- Create: `src/lib/deep-research/research-checkpointer.ts`
- Modify: `src/lib/deep-research/research-runner.ts`
- Modify: `src/lib/deep-research/research-budget.ts`
- Test: `tests/research-graph.test.ts`
- Test: `tests/research-checkpoint.test.ts`

**Interfaces:** nodes run in this fixed order with conditional loops: `intake`, `classify`, `confirm`, `load_owner_context`, `clarify`, `plan`, `expand_queries`, `search`, `deduplicate`, `select_sources`, `extract`, `chunk`, `score_sources`, `collect_evidence`, `build_claims`, `detect_gaps`, `gap_search`, `detect_contradictions`, `draft`, `verify_citations`, `finalize`.

- [ ] **Step 1: Write failing graph tests** for all 21 node names, confirmation pause, budget stop, one bounded gap-search loop, cancellation, checkpoint restore, and final citation verification.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement typed state reducers** that append immutable events and persist after every node; large source bodies are referenced by content hash rather than duplicated in state.
- [ ] **Step 4: Implement budgets** for wall time, queries, fetched bytes, sources, model tokens, gap loops, and per-domain concurrency.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 6: Commit:** `git commit -m "feat: build checkpointed deep research graph"`.

---

### Task 9: Run research in BullMQ and stream durable events

**Files:**
- Create: `src/lib/deep-research/research-queue.ts`
- Create: `src/lib/deep-research/research-events.ts`
- Create: `src/lib/deep-research/research-worker-entry.ts`
- Create: `app/api/ai/deep-research/[jobId]/events/route.ts`
- Create: `scripts/run-research-worker.mjs`
- Modify: `src/lib/deep-research/research-worker.ts`
- Modify: `src/lib/deep-research/deep-research.repository.ts`
- Modify: `app/api/ai/deep-research/route.ts`
- Modify: `app/api/ai/deep-research/[jobId]/cancel/route.ts`
- Modify: `app/api/ai/deep-research/[jobId]/resume/route.ts`
- Modify: `package.json`
- Test: `tests/research-queue.test.ts`
- Test: `tests/research-events-route.test.ts`

**Interfaces:** BullMQ job ID equals research job ID; event IDs are monotonically increasing; SSE accepts `Last-Event-ID`; local jobs publish the identical event envelope through Relay.

- [ ] **Step 1: Write failing tests** for idempotent enqueue, stalled-job recovery, heartbeat loss, ordered replay, SSE reconnect, cancel fencing, and resume from checkpoint.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Pin `bullmq=5.80.8`, `ioredis=5.11.1`, and `eventsource-parser=3.1.0`;** add `research:worker` and a dedicated worker entry that does not import Next.js UI code.
- [ ] **Step 4: Store cloud job metadata/events in PostgreSQL and local job payload/events in SQLCipher.** Valkey stores queue coordination only and uses an eviction-disabled database.
- [ ] **Step 5: Return typed stalled causes** including worker offline, service unhealthy, quota exhausted, checkpoint corrupt, and retry time, each with an exact resolution.
- [ ] **Step 6: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 7: Commit:** `git commit -m "feat: run deep research in durable worker"`.

---

### Task 10: Build the research workspace and safe Markdown rendering

**Files:**
- Modify: `components/Chat/SafeMarkdownContent.tsx`
- Modify: `components/Chat/ResearchWorkspace.tsx`
- Create: `components/Chat/ResearchTabs.tsx`
- Modify: `src/lib/chat/safe-markdown.ts`
- Modify: `components/Chat/DeepResearchPanel.tsx`
- Modify: `components/Chat/ChatMessage.tsx`
- Modify: `src/lib/chat/chat-answer-display.ts`
- Modify: `src/lib/deep-research/research-report.ts`
- Modify: `tests/chat-safe-markdown.test.ts`
- Test: `tests/research-workspace.test.ts`

**Interfaces:** tabs are `progress`, `sources`, `evidence`, `claims`, `contradictions`, and `report`; display text permits letters, digits, normal punctuation, emoji, lists, tables, and links while Markdown control tokens are interpreted, not shown as stray decoration.

- [ ] **Step 1: Write failing tests** for headings, emphasis, code fences, citation links, Korean/English text, emoji, raw HTML, scripts, dangerous URLs, malformed Markdown, and plain-text copying.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement a single sanitized renderer** with raw HTML disabled, allowlisted `http/https` links, external-link safety attributes, and a plain-text projection for notifications and previews.
- [ ] **Step 4: Replace the raw `<pre>` report** with the six-tab workspace, live counts, source health, partial report, cancel/resume controls, and citation jump-to-evidence.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 6: Commit:** `git commit -m "feat: add safe research workspace"`.

---

### Task 11: Save research memory only with explicit owner choice

**Files:**
- Create: `src/lib/deep-research/research-memory-proposal.ts`
- Modify: `src/lib/deep-research/research-memory.ts`
- Modify: `app/api/ai/deep-research/[jobId]/approve-memory/route.ts`
- Modify: `components/Chat/ResearchWorkspace.tsx`
- Test: `tests/research-memory-approval.test.ts`

**Interfaces:** completed research creates bounded memory proposals; only an authenticated owner approval writes Markdown and indexes it. Rejection and expiry write no memory content.

- [ ] **Step 1: Write failing tests** for no automatic save, proposal preview, owner isolation, optimistic version conflict, duplicate approval, local Vault write, and index refresh.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement proposal/approve/reject transitions** with checksums and evidence links; local mode invokes `memory.approveResearch` through Relay.
- [ ] **Step 4: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 5: Commit:** `git commit -m "feat: require approval for research memory"`.

---

### Task 12: Verify the complete local AI and research release

**Files:**
- Create: `docs/local-ai-setup.md`
- Create: `docs/deep-research-operations.md`
- Create: `scripts/verify-local-ai-stack.mjs`
- Modify: `.env.example`
- Modify: `README.md`
- Test: `tests/local-ai-release-contract.test.ts`

- [ ] **Step 1: Write the failing release contract** for all four modes, llama.cpp health/model listing, Local Agent status, five local research services, 21 graph nodes, SSE/Relay event replay, and explicit memory approval.
- [ ] **Step 2: Run RED:** `npm.cmd test`.

Expected: FAIL because setup/operations documentation and the stack verifier do not exist.

- [ ] **Step 3: Document exact startup commands** for `llama-server`, model selection, Compose, Agent pairing, data paths, backup/restore, degraded FTS-only mode, and service-specific resolutions.
- [ ] **Step 4: Run GREEN with the complete verification:**

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd --prefix local-agent test
cargo test --manifest-path local-agent/src-tauri/Cargo.toml
docker compose -f services/local-research/compose.yml config
node scripts/verify-local-ai-stack.mjs
```

- [ ] **Step 5: Record evidence** for one quick answer, one local-memory answer, one web answer, one cancelled/resumed research job, cited report navigation, and a user-approved local Markdown memory.
- [ ] **Step 6: Commit:** `git commit -m "docs: verify local AI and deep research stack"`.

## Completion Gate

- All four modes are explicit and auto-research requires confirmation.
- Local raw content exists only in the Agent Vault/SQLCipher store.
- Every research job is cancelable, resumable, event-replayable, and citation-verified.
- SearXNG, extraction, crawling, Docling, Valkey, and worker health failures produce distinct resolutions.
- Markdown control syntax is rendered safely and does not appear as stray characters in chat.
- Tests, typecheck, lint, build, Agent tests, Rust tests, Compose validation, and the local stack verifier all pass.
