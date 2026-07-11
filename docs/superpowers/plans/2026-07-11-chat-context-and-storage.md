# AI Chat Context Workspace and Storage Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep real AI streaming answers active while showing query-synchronized knowledge context to the right of AI Chat and formatting storage usage to exactly two decimal places.

**Architecture:** Reuse the existing authenticated context-query API and `ConnectedContextWorkspace` as the independent right column. Drive it from the last submitted or loaded user query so draft typing does not cause searches. Keep the existing streaming chat route unchanged and update only the pure storage percentage formatter for precision.

**Tech Stack:** Next.js 15, React 19, TypeScript, existing local hybrid search and knowledge network services, Node/Sucrase test runner.

## Global Constraints

- Preserve existing authentication, payment, memory, chat streaming, and unrelated working-tree changes.
- Use the authenticated owner-scoped `/api/local/context/query` route; never accept client-supplied ownership.
- Ordinary queries remain local-first; web search stays conditional on explicit web/current-information intent.
- Context search failure must not stop the AI answer stream.
- Do not create implementation commits that could capture unrelated dirty files.

---

### Task 1: Chat Context Query Contract

**Files:**
- Modify: `tests/auth-and-ui-contract.test.ts`
- Modify: `components/Chat/ChatView.tsx`

**Interfaces:**
- Consumes: `ConnectedContextWorkspace({ query: string })`
- Produces: a third-column workspace driven by `lastQuery.trim()`.
- Preserves: `fetch("/api/ai/chat/stream")` answer generation.

- [ ] **Step 1: Write a failing source contract test**

Assert that `ChatView` imports and renders `ConnectedContextWorkspace`, passes `contextQuery`, defines `contextQuery` from `lastQuery.trim()` without draft `input`, updates `lastQuery` on send and session load, and retains `/api/ai/chat/stream`.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: FAIL because the current contract explicitly omits the context workspace.

- [ ] **Step 3: Implement the minimal right-column connection**

Import `ConnectedContextWorkspace`, replace `const contextQuery = input.trim() || lastQuery` with `const contextQuery = lastQuery.trim()`, and render `<ConnectedContextWorkspace query={contextQuery} />` after the central chat card and before the project modal.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: all tests pass and the streaming endpoint remains present.

### Task 2: Storage Percentage Precision

**Files:**
- Modify: `tests/storage-status.test.ts`
- Modify: `src/lib/storage/storage-metrics.ts`

**Interfaces:**
- Preserves: `calculateStoragePercent(usageBytes, quotaBytes): StoragePercent | null`
- Produces: labels formatted with exactly two decimal places.

- [ ] **Step 1: Write failing precision tests**

Add exact expectations for `0.00%`, `0.05%`, `12.34%`, and clamped `100.00%`. Preserve a width of `1` for a non-zero percentage below one.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: FAIL because zero and percentages above one are currently integer labels.

- [ ] **Step 3: Implement two-decimal formatting**

Clamp the raw percentage to `[0, 100]`, format `label` as `${clamped.toFixed(2)}%`, and set `widthPercent` to zero for no usage, one for non-zero values below one, otherwise the clamped numeric value.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: all tests pass.

### Task 3: Full Verification

**Files:**
- Verify: `components/Chat/ChatView.tsx`
- Verify: `components/context/ConnectedContextWorkspace.tsx`
- Verify: `src/lib/storage/storage-metrics.ts`

- [ ] **Step 1: Check the scoped diff and secret boundaries**

Run: `git diff --check` and inspect the scoped diff. Confirm no authentication or unrelated memory changes were overwritten.

- [ ] **Step 2: Run the complete verification suite**

Run: `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build`.

Expected: zero failures and exit code 0 for every command.

- [ ] **Step 3: Verify the local UI in a browser**

Open AI Chat, submit or load a question, and verify the center answer area and right knowledge workspace render independently. Open a surface containing `StorageStatus` and verify a two-decimal label. Confirm there are no browser console errors.
