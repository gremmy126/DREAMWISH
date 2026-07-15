# DREAMWISH Business Suite Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Automation connection binding, native ERPNext-backed Business dashboard, CRM Dashboard and Contacts workspace, AI Chat CRM/ERP work context, and durable Deep Research report flow to `main` without changing the global sidebar or shipping installer controls.

**Architecture:** This is an execution manifest over five independently testable implementation plans. Each stage consumes only the stable interfaces produced by the previous stage, passes its focused and full verification gates, and lands as reviewable commits before the next stage begins. Implementation occurs in an isolated worktree so the existing user modification in `src/lib/ai/errors.ts` and untracked workspace files remain untouched.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Tailwind CSS, existing owner-document/Postgres storage, Frappe REST, existing AI providers, PostgreSQL research queue, Railpack/Railway, Node test harness.

## Global Constraints

- Authoritative design: `docs/superpowers/specs/2026-07-15-business-suite-delivery-design.md`.
- Stage order is fixed: Automation → Business ERP → CRM → AI business context → Deep Research.
- Preserve the current global DREAMWISH sidebar, top bar, authentication shell, Mail, Business Cards, and Meetings.
- Business tabs are exactly `개요 · ERP · 메일 · 명함 · 회의 · 리포트`.
- CRM product screens are exactly `대시보드 · 연락처`.
- Remove the Sales and phone-import presentations without deleting compatibility-only backend records.
- Support an already-running ERPNext instance; do not create Docker, ERPNext, Dolibarr, Twenty, Frappe CRM, Ollama, local-gateway, or phone developer-mode installer controls.
- Never render sample ERP financial values. A disconnected snapshot contains null values and empty collections.
- Important CRM, approved-memory, approved-action, and research records report success only after durable persistence.
- Derive owner identity only from authenticated server context.
- Preserve the user-owned `src/lib/ai/errors.ts` working-tree change unless the user separately asks to integrate it.
- The repository test command always runs the full suite even when a test filename follows it.
- Use focused commits and inspect the staged path list before every commit.

---

### Task 1: Create an isolated execution worktree and prove the baseline

**Files:**
- Read: `docs/superpowers/plans/2026-07-15-automation-connection-binding.md`
- Read: `docs/superpowers/plans/2026-07-15-business-erp-dashboard.md`
- Read: `docs/superpowers/plans/2026-07-15-crm-dashboard-contacts.md`
- Read: `docs/superpowers/plans/2026-07-15-ai-crm-erp-context.md`
- Read: `docs/superpowers/plans/2026-07-15-deep-research-worker.md`
- Do not modify: `D:/gremmy/src/lib/ai/errors.ts`

**Interfaces:**
- Consumes: committed design and plan documents at `2da2243` or its descendant.
- Produces: isolated branch `codex/business-suite-implementation` with a clean baseline.

- [ ] **Step 1: Invoke the worktree skill**

Read and follow `superpowers:using-git-worktrees`. Resolve `GIT_DIR`, `GIT_COMMON`, and the current branch before creating anything.

- [ ] **Step 2: Create the isolated worktree**

Run from `D:/gremmy`:

```powershell
git worktree add D:/gremmy/.worktrees/business-suite -b codex/business-suite-implementation
```

Expected: a clean worktree whose HEAD contains the committed specs and plans and whose `git status --short` is empty.

- [ ] **Step 3: Install the existing locked dependencies**

Run:

```powershell
npm.cmd ci
```

Expected: exit 0 without modifying `package-lock.json`.

- [ ] **Step 4: Run the baseline gates**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: every command exits 0. If a baseline command fails, use `superpowers:systematic-debugging` and record whether the failure exists on the original committed HEAD before changing product code.

---

### Task 2: Execute Automation connection binding

**Files:**
- Plan: `docs/superpowers/plans/2026-07-15-automation-connection-binding.md`
- Primary code: `src/lib/automation/**`, `app/api/automation/**`, `components/Automation/**`
- Tests: Automation connection and scenario tests named by the subordinate plan.

**Interfaces:**
- Consumes: existing encrypted credential and OAuth repositories.
- Produces: `ScenarioConnectionBinding`, `AutomationConnectionCandidate`, owner-scoped candidate resolution, scenario CAS, and run-time exact connection enforcement.

- [ ] **Step 1: Execute subordinate Tasks 1–3 in order**

Use `superpowers:subagent-driven-development`. For each task, require the implementer to follow every red/green/commit step in `2026-07-15-automation-connection-binding.md`.

- [ ] **Step 2: Run the stage gate**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
```

Expected: exit 0; one verified compatible connection reconciles durably, multiple candidates require selection, and stale/cross-owner bindings fail closed.

- [ ] **Step 3: Inspect stage commits**

Run:

```powershell
git log --oneline --decorate -8
git status --short
```

Expected: only Automation stage paths changed and the worktree is clean.

---

### Task 3: Execute the native Business ERP dashboard

**Files:**
- Plan: `docs/superpowers/plans/2026-07-15-business-erp-dashboard.md`
- Primary code: `src/lib/erp/**`, `app/api/business/erp/**`, `components/Business/**`, `components/Calendar/CalendarView.tsx`
- Tests: ERP provider, API, Business UI, Calendar cleanup, and regression tests named by the subordinate plan.

**Interfaces:**
- Consumes: Automation’s canonical encrypted-credential authority, safe-candidate service, and exact resolver. ERP Task 2 registers the one `erpnext` credential/identity projection.
- Produces: one canonical `ErpConnectionIdentity`, `ErpDashboardSnapshot`, read-only `ErpProvider`, Business ERP API, and responsive ERP screen.

- [ ] **Step 1: Apply the current plan corrections before product code**

Ensure the subordinate plan uses:

```ts
type ErpDashboardSnapshot = {
  connectionState:
    | "not_configured"
    | "disconnected"
    | "connected"
    | "degraded"
    | "error";
  connectionMode: "server" | null;
  asOf: string | null;
  stale: boolean;
  company: { externalId: string; name: string } | null;
  accountingPeriod: { start: string; end: string; label: string } | null;
  currency: string | null;
};
```

The unconnected action is `ERPNext 연결` and routes to existing Connection Management. No local gateway or installation panel is created.

- [ ] **Step 2: Execute subordinate Tasks 1–7 in order**

Use a fresh implementer and two-stage review for each task. Do not let the ERP layer import CRM or AI.

- [ ] **Step 3: Run the stage gate**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: exit 0; Business has `개요 · ERP · 메일 · 명함 · 회의 · 리포트`, Sales and Calendar phone import are absent, and disconnected ERP never renders demo values or links.

---

### Task 4: Execute CRM Dashboard and Contacts

**Files:**
- Plan: `docs/superpowers/plans/2026-07-15-crm-dashboard-contacts.md`
- Primary code: `src/lib/crm/**`, `app/api/crm/**`, `components/CRM/**`
- Tests: CRM v2, dashboard, contacts, mapping, UI, and lifecycle tests named by the subordinate plan.

**Interfaces:**
- Consumes: exact ERP connection identity, read-only customer search/verify/context methods, nullable ERP currency and monthly sales.
- Produces: versioned CRM v2 records, dashboard snapshot, paginated contacts, activities, immediate durable writes, tombstone cleanup, and approved CRM–ERP mapping.

- [ ] **Step 1: Execute subordinate Tasks 1–7 in order**

Require one owner-store lock and one idempotent operation ID for company reuse/create plus contact membership. A response cannot say `저장됨` until contact, version/history, and audit are durable.

- [ ] **Step 2: Verify removal semantics**

Confirm the CRM shell renders only:

```ts
const tabs = [
  { id: "dashboard", label: "대시보드" },
  { id: "contacts", label: "연락처" }
] as const;
```

Recent activity and activity creation remain bounded sections inside Dashboard or Contact detail; no legacy Activity, Deals, Email, Reports, Settings, or phone-import screen remains navigable.

- [ ] **Step 3: Run the stage gate**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: exit 0; search does not change dashboard totals, important values survive refresh, version conflicts do not overwrite, and only approved exact mappings enable live ERP customer context.

---

### Task 5: Execute AI Chat CRM/ERP context and approval-gated work

**Files:**
- Plan: `docs/superpowers/plans/2026-07-15-ai-crm-erp-context.md`
- Primary code: `src/lib/ai/**`, `src/lib/chat/**`, `app/api/ai/**`, `components/Chat/**`
- Tests: turn idempotency, owner context, immediate memory, normal/stream parity, actions, sources, and UI tests named by the subordinate plan.

**Interfaces:**
- Consumes: CRM dashboard/contact adapters, approved mapping, exact live ERP provider, canonical memory lifecycle, owner-aware knowledge/file search.
- Produces: bounded `PersonalContext`, source manifest, immediate safe-memory results, versioned action proposals, one-time approval, CRM CAS actions, and opt-in ERP draft actions.

- [ ] **Step 1: Execute subordinate Tasks 1–9 in order**

Use fresh implementer and reviewers. Do not modify the user-owned uncommitted `src/lib/ai/errors.ts` from the original worktree; the isolated branch may add separate action/context error modules where needed.

- [ ] **Step 2: Verify immediate-memory semantics**

Run tests proving:

```ts
expect(result.memoryStatus).toBe("failed");
expect(recall).not.toContain(uncommittedCandidate);
```

Expected: the answer may complete when memory persistence fails, but the UI never reports `즉시 저장됨` and recall never sees the uncommitted record.

- [ ] **Step 3: Run the stage gate**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: normal and streaming chat enforce identical owner, relevance, freshness, mapping, and approval policies.

---

### Task 6: Execute durable Deep Research

**Files:**
- Plan: `docs/superpowers/plans/2026-07-15-deep-research-worker.md`
- Primary code: `src/lib/deep-research/**`, `scripts/deep-research-worker.ts`, `scripts/run-schedulers.ts`, `app/api/ai/deep-research/**`, `components/Chat/DeepResearch*.tsx`
- Deployment: `services/deep-research/railway.toml`, `railway.cron.toml`

**Interfaces:**
- Consumes: authenticated chat-session ownership, configured Gemini/OpenRouter/Groq runtime settings, safe owner storage accounting, Postgres, current right-side Context workspace.
- Produces: durable research queue, fenced worker, five-minute recovery cron, 5/15/30 budgets, structured report, citations, videos, polling API, and Context/Research right-panel switch.

- [ ] **Step 1: Execute subordinate Tasks 1–9 in order**

Use a fresh implementer and two-stage review for every task. Physical provider attempts, failed fetches, token use, deadlines, and byte limits must be durably reserved before dispatch.

- [ ] **Step 2: Run local worker and one-shot scheduler contracts**

Run:

```powershell
npm.cmd run migrate:research
npm.cmd run migrate:research
npm.cmd run cron:schedulers
```

Expected: both migrations exit 0, the scheduler performs one bounded pass, closes Postgres, and exits 0.

- [ ] **Step 3: Run the stage gate**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: exit 0; job ownership, queue limits, lease fencing, safe fetch, evidence-only partial, right-panel resume, and Railway config tests pass.

---

### Task 7: Integrated verification, commit audit, and main delivery

**Files:**
- Verify: all changed product, test, package, environment example, and Railway config files.
- Do not stage: user-owned files outside the isolated worktree.

**Interfaces:**
- Consumes: all five completed stage interfaces.
- Produces: verified commit range ready for `origin/main` and Railway smoke validation.

- [ ] **Step 1: Run every local gate from a clean worktree**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check origin/main...HEAD
git status --short
```

Expected: all commands exit 0 and status is clean.

- [ ] **Step 2: Review the complete commit range**

Run:

```powershell
git log --oneline --reverse origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
```

Expected: every file maps to an approved stage; no installer, local gateway, generated secret, data file, or unrelated user file appears.

- [ ] **Step 3: Validate Railway configuration against the current schema**

Run the repository Railway-config contract test and confirm:

```text
deep-research: npm run worker:deep-research, private, ON_FAILURE
scheduler-cron: npm run cron:schedulers, */5 * * * *, NEVER
```

Expected: Config as Code paths exist and both package scripts resolve in a clean install.

- [ ] **Step 4: Push the verified commit range to main**

Because the user explicitly requested `main`, push only after every gate passes:

```powershell
git push origin HEAD:main
```

Expected: remote `main` advances to the verified HEAD without force.

- [ ] **Step 5: Perform deployment smoke checks**

Verify the Railway web, `deep-research`, and `scheduler-cron` deployments build from the pushed commit. Run one authenticated five-minute job and confirm enqueue, claim, heartbeat, refresh resume, report/partial, sources/videos, and cron exit.

- [ ] **Step 6: Report evidence**

Report the exact remote commit SHA; the observed test count and exit code; typecheck, lint, and build exit codes; the Railway web, worker, and cron deployment statuses tied to that SHA; the authenticated five-minute research job ID and terminal state; and every known limitation. Cite command or deployment output for each claim and never infer runtime success from configuration alone.
