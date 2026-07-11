# AI Reliability, Memory Stability, and CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore reliable non-OpenAI chat and web search, prevent JSON response crashes, stabilize Memory, and deliver an owner-scoped useful CRM.

**Architecture:** Reuse the existing API response envelope, provider adapters, Firebase owner context, local JSON stores, and UI tokens. Add small focused orchestration helpers for provider failover and CRM domain logic rather than expanding view components with business rules.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase session auth, local JSON persistence, Node test harness.

## Global Constraints

- OpenAI must not be used by chat generation.
- Configured supported-provider credentials enable external AI unless explicitly denied or local-only.
- All CRM records and mutations are server-derived owner scoped.
- External CRM execution remains approval-first and draft-only.
- All new behavior is test-first.

---

### Task 1: Safe client API reads

**Files:**
- Modify: `src/lib/api/api-response.ts`
- Modify: `components/Chat/ChatView.tsx`
- Modify: `components/Memory/MemoryView.tsx`
- Modify: `components/CRM/CRMView.tsx`
- Test: `tests/client-api-resilience.test.ts`

- [ ] Write failing tests for empty bodies and view usage of `readApiResponse`.
- [ ] Run `npm.cmd test` and confirm the new contract fails.
- [ ] Add safe text-first decoding and update the three views with error/finally/retry handling.
- [ ] Run tests and TypeScript until green.

### Task 2: Configured-provider privacy and failover

**Files:**
- Modify: `src/lib/privacy/privacy.config.ts`
- Modify: `src/lib/ai/config.ts`
- Modify: `src/lib/ai/ai.service.ts`
- Test: `tests/ai-provider-failover.test.ts`

- [ ] Write failing tests for implicit connected-provider permission, explicit deny, provider ordering, chat failover, and pre-token stream failover.
- [ ] Run tests and confirm expected failures.
- [ ] Implement deterministic configured-provider attempt ordering and safe aggregate failure.
- [ ] Run tests and TypeScript until green.

### Task 3: Web-search degradation

**Files:**
- Create: `src/lib/web-search/web-search-outcome.ts`
- Modify: `app/api/ai/chat/route.ts`
- Modify: `app/api/ai/chat/stream/route.ts`
- Test: `tests/web-search-degradation.test.ts`

- [ ] Write failing tests for a degraded search outcome and chat route usage.
- [ ] Run tests and confirm failures.
- [ ] Convert search exceptions into bounded warnings and generate a clearly unverified general answer.
- [ ] Run tests and TypeScript until green.

### Task 4: Owner-scoped CRM domain

**Files:**
- Modify: `src/lib/crm/crm.types.ts`
- Modify: `src/lib/crm/crm.repository.ts`
- Modify: `src/lib/crm/crm-workspace.ts`
- Modify: `app/api/crm/customers/route.ts`
- Test: `tests/crm-owner-lifecycle.test.ts`

- [ ] Write failing owner-isolation, validation, lifecycle, task/deal, soft-delete, and audit tests.
- [ ] Run tests and confirm failures.
- [ ] Implement owner-scoped repository operations, legacy migration, validated route actions, and deterministic insights.
- [ ] Run tests and TypeScript until green.

### Task 5: CRM workspace UI

**Files:**
- Modify: `components/CRM/CRMView.tsx`
- Modify: `src/lib/i18n/translations.ts`
- Test: `tests/crm-ui-contract.test.ts`

- [ ] Write failing contracts for search/filter, timeline, deal/task controls, insight evidence, delete confirmation, retry, and responsive layout.
- [ ] Run tests and confirm failures.
- [ ] Implement the UI using real APIs and existing design tokens.
- [ ] Run tests and TypeScript until green.

### Task 6: Full verification

**Files:**
- Review all modified files above.

- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd run build`.
- [ ] Review the final diff for secrets, unrelated changes, and owner-scope regressions.
