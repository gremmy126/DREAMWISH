# Deep Research Worker and Report Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI Chat에 명시적으로 시작하는 5·15·30분 심층 조사를 추가하고, 소유자별 durable Postgres queue와 private worker가 재시작·새로고침 뒤에도 조사를 이어가며 근거·링크·관련 동영상이 포함된 한국어 구조화 보고서를 오른쪽 패널에 표시하게 한다.

**Architecture:** authenticated web route는 세션과 quota를 검증해 job만 원자적으로 enqueue하고 즉시 반환한다. 전용 Postgres repository는 idempotency, owner concurrency, operation reservation, fenced lease, checkpoint, report, retention을 소유한다. private TypeScript worker는 bounded planner/search/safe-reader/synthesizer/verifier를 단계별로 실행하고, one-shot scheduler는 expired lease와 retention을 복구한다. Chat UI는 durable API만 polling하며 기존 일반 채팅 pipeline과 `ConnectedContextWorkspace`를 보존한다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, `postgres`, Zod 4, Node 22 DNS/TLS primitives, Undici, Cheerio, `ipaddr.js`, `robots-parser`, existing Gemini/OpenRouter/Groq providers and DuckDuckGo/Bing search boundary, `tsx`, Tailwind CSS, Lucide React, Railway Railpack.

## Global Constraints

- 선행 의존성은 Automation → Business ERP → CRM → AI business context의 모든 task와 release gate다. 이 계획은 그 다음 Stage 5이며 앞 단계를 병렬로 수정하지 않는다.
- 기준 명세는 `docs/superpowers/specs/2026-07-15-deep-research-worker-design.md`이고, 전체 제품 우선순위는 `docs/superpowers/specs/2026-07-15-business-suite-delivery-design.md`가 소유한다.
- GPT Researcher, Crawl4AI, Jina API, SearXNG, Python sidecar, browser automation, Ollama, Docker installer를 추가하지 않는다.
- research provider는 현재 구성된 Gemini, OpenRouter, Groq의 교집합만 사용한다. Hugging Face와 Cloudflare ordinary chat 동작은 유지하지만 심층 조사에는 사용하지 않는다.
- search는 기존 무료 DuckDuckGo/Bing 경계를 사용한다. search snippet과 video card는 factual evidence가 아니며 성공적으로 읽은 HTTPS source만 citation을 뒷받침한다.
- worker는 채팅 메시지를 쓰거나 수정하지 않는다. report와 job의 canonical storage는 Postgres이고 chat JSON과 독립적이다.
- 모든 route는 `requireOwnerContext()`의 owner를 사용하고 body/query의 owner ID를 받지 않는다. session/job/report/source/video를 모두 같은 owner로 검증한다.
- private page, credential URL, HTTP fetch, port 443 외 URL, private/reserved IP, DNS rebinding, unbounded redirect/body/text, raw HTML과 page JavaScript를 fail closed한다.
- job lease는 DB time, random lease token, CAS fencing을 사용한다. network call 중 transaction을 열어 두지 않으며 stale worker는 어떤 checkpoint나 terminal state도 덮지 못한다.
- 외부 search/read/physical AI call 전에 operation과 budget unit을 durable reserve한다. timeout·retry·failover도 physical attempt로 센다.
- 5·15·30분은 유용한 작업 상한이지 sleep이나 완료 보장이 아니다. 첫 claim 시각의 original deadline, counter, selected-minute reservation은 recovery에서 reset하지 않는다.
- final report와 curated evidence는 owner delete 전까지 보존하고 intermediate material은 terminal 시점 7일 뒤 삭제한다.
- 기존 `src/lib/ai/errors.ts` 사용자 변경을 수정하거나 커밋하지 않는다. research retry metadata가 필요하면 별도 adapter type을 사용한다.
- `scripts/run-tests.mjs`가 filename 인자를 무시하므로 이 계획의 `npm.cmd test`는 매번 전체 suite다.

## File Structure

- `src/lib/deep-research/deep-research.types.ts`: public/private job, phase, progress, report, source, video, operation contracts.
- `src/lib/deep-research/deep-research.schema.ts`: schema version, advisory-lock migration SQL, schema assertion.
- `src/lib/deep-research/deep-research.repository.ts`: enqueue, quota, claim, lease, checkpoint, operation, report, cleanup transactions.
- `src/lib/deep-research/research-budget.ts`: immutable tier ceilings and reservation guards.
- `src/lib/deep-research/research-ai-adapter.ts`: configured provider attempts with abort/deadline/schema/token accounting.
- `src/lib/deep-research/research-planner.ts`: bounded structured plan.
- `src/lib/deep-research/research-search.ts`: bounded query execution and canonical deduplication.
- `src/lib/deep-research/safe-reader.ts`: DNS-pinned public HTTPS reader and normalized extraction.
- `src/lib/deep-research/research-videos.ts`: YouTube/Vimeo discovery and safe normalization.
- `src/lib/deep-research/research-synthesizer.ts`: evidence-only Korean report drafting.
- `src/lib/deep-research/research-verifier.ts`: deterministic citation and unsupported-claim verification.
- `src/lib/deep-research/deep-research.service.ts`: phase orchestration, cancellation, checkpoint and partial behavior.
- `scripts/migrate-research.ts`, `scripts/deep-research-worker.ts`, `scripts/run-schedulers.ts`: migration, private worker, one-shot scheduler entrypoints.
- `app/api/ai/deep-research/**`: authenticated create/list/status/cancel/delete/report routes.
- `components/Chat/DeepResearch*.tsx`: entry, selector, job card, right-panel/drawer report presentation.
- `services/deep-research/railway.toml`, `railway.cron.toml`: Railway worker and scheduler config.

---

### Task 1: runtime, immutable budgets, durable schema 계약

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `src/lib/db/postgres.ts`
- Create: `src/lib/deep-research/deep-research.types.ts`
- Create: `src/lib/deep-research/research-budget.ts`
- Create: `src/lib/deep-research/deep-research.schema.ts`
- Create: `scripts/migrate-research.ts`
- Create: `tests/deep-research-budget.test.ts`
- Create: `tests/deep-research-schema.test.ts`

**Interfaces:**

- Consumes: `DATABASE_URL`, existing singleton Postgres client.
- Produces: Node 22 runtime contract, exact resource tiers, schema v1 migration and clean shutdown API.

- [ ] **Step 1: failing budget and schema tests 작성**

```ts
assert.deepEqual(getResearchBudget(5), {
  durationMinutes: 5,
  maxSubQuestions: 3,
  maxSearchCandidates: 12,
  maxPageFetchAttempts: 8,
  maxVideoCandidates: 4,
  maxPhysicalAiAttempts: 6,
  maxInputTokens: 30_000,
  maxOutputTokens: 12_000,
  maxIntermediateChars: 500_000,
  synthesisTimeReserveRatio: 0.15,
  synthesisAiAttemptReserve: 1
});
assert.throws(() => getResearchBudget(10));
```

15분은 `6/30/20/8/14`, `100_000/36_000`, `1_500_000`; 30분은 `10/50/35/12/24`, `200_000/64_000`, `3_000_000`으로 고정한다. question 1–4,000자, report 60,000자, citation excerpt 800자, URL 2,048자 제한도 test한다.

schema test는 migration SQL에 advisory lock, version table과 아래 일곱 전용 table이 있으며 두 번 실행해도 같은 version이고 higher code/schema mismatch가 fail closed하는지 검증한다.

```text
deep_research_jobs
deep_research_operations
deep_research_reports
deep_research_sources
deep_research_videos
deep_research_usage
deep_research_cleanup_outbox
```

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: deep-research modules와 migration script가 없어 실패한다.

- [ ] **Step 3: runtime dependency와 public/private types 구현**

`package.json`에 `engines.node: "22.x"`, production dependencies `tsx`, `cheerio`, `undici`, `ipaddr.js`, `robots-parser`를 추가하고 lockfile을 package manager로 갱신한다. 이 dependencies는 worker의 clean production install에 있어야 하며 devDependencies로 두지 않는다.

```json
{
  "migrate:research": "tsx scripts/migrate-research.ts",
  "worker:deep-research": "tsx scripts/deep-research-worker.ts",
  "cron:schedulers": "tsx scripts/run-schedulers.ts"
}
```

types는 lifecycle `queued | running | completed | partial | failed | cancelled`, phase `planning | searching | reading | synthesizing | verifying | persisting`, duration `5 | 15 | 30`, stable public error/warning code, safe progress, structured claim/citation/report/source/video와 private lease/checkpoint를 분리한다. report renderer가 arbitrary HTML을 받는 field를 만들지 않는다.

- [ ] **Step 4: schema v1과 migration 구현**

`deep_research_jobs`의 unique `(owner_id, session_id, turn_id)`, request hash, one-running-per-owner partial unique index, lease token/expiry/recovery count/original deadline/counters/checkpoint JSON을 만든다. operations는 `(job_id, operation_key)` unique reservation, reports/sources/videos는 job+owner FK, usage는 selected minute/storage reservation, cleanup outbox는 idempotent key를 가진다. session deletion cascade를 호출할 수 있는 owner/session index를 둔다.

`getPostgres()`는 유지하고 `closePostgres()`를 production script에서도 호출할 수 있게 export한다. `migrate-research.ts`는 migrate, expected schema assert, close, nonzero error exit만 수행한다.

- [ ] **Step 5: 환경 계약 기록**

`.env.example`에 secret 값 없이 아래 exact key/default를 기록하고 runtime parser도 같은 상수를 사용한다.

```dotenv
DATABASE_URL=""
DEEP_RESEARCH_GLOBAL_CONCURRENCY="2"
DEEP_RESEARCH_DAILY_MINUTES="60"
DEEP_RESEARCH_ROLLING_30D_MINUTES="600"
DEEP_RESEARCH_STORAGE_BYTES="104857600"
DEEP_RESEARCH_WORKER_POLL_MIN_MS="750"
DEEP_RESEARCH_WORKER_POLL_MAX_MS="2000"
DEEP_RESEARCH_LEASE_SECONDS="120"
DEEP_RESEARCH_HEARTBEAT_SECONDS="30"
DEEP_RESEARCH_INTERMEDIATE_RETENTION_DAYS="7"
DEEP_RESEARCH_RECOVERY_BATCH="50"
DEEP_RESEARCH_CLEANUP_BATCH="100"
```

범위는 concurrency 1–8, poll min ≤ max, lease 120초, heartbeat 30초, retention 7일을 validation한다. 잘못된 값은 service 시작 전에 stable configuration error로 fail closed하며 서로 다른 web/worker/cron default를 만들지 않는다.

- [ ] **Step 6: green 확인 및 커밋**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

Expected: budget/schema tests와 기존 suite 통과, type error 없음.

```powershell
git add package.json package-lock.json .env.example src/lib/db/postgres.ts src/lib/deep-research/deep-research.types.ts src/lib/deep-research/research-budget.ts src/lib/deep-research/deep-research.schema.ts scripts/migrate-research.ts tests/deep-research-budget.test.ts tests/deep-research-schema.test.ts
git commit -m "feat: define durable deep research schema"
```

---

### Task 2: transactional queue, quota, fenced lease와 retention repository

**Files:**

- Create: `src/lib/deep-research/deep-research.repository.ts`
- Create: `src/lib/deep-research/deep-research-errors.ts`
- Create: `tests/deep-research-repository.test.ts`
- Create: `tests/deep-research-recovery.test.ts`

**Interfaces:**

```ts
export function enqueueResearchJob(input: EnqueueResearchJobInput): Promise<DeepResearchJobPrivate>;
export function listResearchJobs(ownerId: string, sessionId: string, limit?: number): Promise<DeepResearchJobView[]>;
export function getResearchJob(ownerId: string, jobId: string): Promise<DeepResearchJobView | null>;
export function getResearchReport(ownerId: string, jobId: string): Promise<DeepResearchReportView | null>;
export function claimNextResearchJob(workerId: string): Promise<DeepResearchLease | null>;
export function heartbeatResearchJob(jobId: string, leaseToken: string): Promise<boolean>;
export function reserveResearchOperation(input: ResearchOperationReservation): Promise<ResearchOperation>;
export function checkpointResearchJob(input: FencedResearchCheckpoint): Promise<DeepResearchJobPrivate>;
export function requestResearchCancellation(ownerId: string, jobId: string): Promise<DeepResearchJobView>;
export function deleteResearchJob(ownerId: string, jobId: string, operationId: string): Promise<boolean>;
export function deleteResearchForSession(ownerId: string, sessionId: string, operationId: string): Promise<number>;
export function persistResearchTerminal(input: FencedResearchTerminalWrite): Promise<DeepResearchJobPrivate>;
export function recoverExpiredResearchJobs(limit: number): Promise<ResearchRecoverySummary>;
export function cleanupExpiredResearchMaterial(limit: number): Promise<ResearchCleanupSummary>;
```

- [ ] **Step 1: failing transaction and concurrency tests 작성**

Postgres test dependency를 주입해 다음 경쟁을 실제 transaction 순서로 고정한다.

- same owner/session/turn + same hash는 same job; different hash는 `409 RESEARCH_IDEMPOTENCY_CONFLICT`.
- owner당 one running + two queued만 허용하고 third queued는 `429 RESEARCH_QUEUE_LIMIT`.
- owner advisory lock과 partial unique index가 concurrent enqueue/claim에서도 규칙을 유지한다.
- claim은 DB time + `FOR UPDATE SKIP LOCKED`, 120초 random lease, first started/deadline 보존이다.
- heartbeat/checkpoint/terminal write는 exact lease token을 요구하고 stale token은 no-op/conflict다.
- operation은 external call 전에 commit되고 같은 key retry는 count를 증가시키지 않는다.
- queued cancellation은 즉시 terminal이며 first claim 전 selected minutes를 release한다.
- running cancellation은 durable timestamp만 기록하고 worker의 fenced terminal이 lease를 정리한다.
- owner daily UTC 60 selected minutes, rolling 30-day 600 minutes, combined storage 100MiB를 enqueue 전에 원자적으로 강제한다.
- recovery count는 initial claim 제외 3회까지만 requeue하고 네 번째 claim 이후 permanently failed다.
- recovery는 original deadline/counters를 reset하지 않으며 deadline passed + persisted source가 있으면 evidence-only partial 후보, 없으면 `NO_USABLE_SOURCES`다.
- intermediate older than 7 days만 bounded batch cleanup하고 final report/source/video/audit는 보존한다.
- cross-owner list/status/cancel/report/delete는 not-found projection으로 막는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: repository exports 부재로 실패한다.

- [ ] **Step 3: enqueue, quota와 owner lock 구현**

모든 owner concurrency/usage 변경 transaction에서 stable advisory-lock key를 얻는다. request hash는 normalized `{sessionId, turnId, question, durationMinutes, providerPreference}` canonical JSON으로 만든다. idempotency row를 quota보다 먼저 확인해 safe retry가 quota를 재예약하지 않게 한다. provider-not-configured는 route/service가 enqueue 이전에 거부한다.

- [ ] **Step 4: claim, lease, operation, checkpoint fencing 구현**

network work 전 transaction을 닫는다. 모든 mutation은 `WHERE id = $job AND lease_token = $token AND status = 'running'` fence를 사용한다. operation kind/key/unit, state `reserved | succeeded | failed | cancelled`, bounded outcome metadata만 저장하며 raw prompt/body를 저장하지 않는다.

- [ ] **Step 5: report/delete/cleanup와 safe projection 구현**

terminal persistence는 job/report/curated sources/videos/usage/intermediate expiry를 한 transaction에 commit한다. owner delete는 즉시 DB visibility를 없애고 cleanup outbox를 쓰며 idempotent drain이 content를 제거한다. session delete용 `deleteResearchForSession(ownerId, sessionId, operationId)`를 제공한다.

- [ ] **Step 6: green 확인 및 커밋**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

```powershell
git add src/lib/deep-research/deep-research.repository.ts src/lib/deep-research/deep-research-errors.ts tests/deep-research-repository.test.ts tests/deep-research-recovery.test.ts
git commit -m "feat: add fenced research queue"
```

---

### Task 3: deadline-aware research AI adapter

**Files:**

- Modify: `src/lib/ai/ai-provider.ts`
- Modify: `src/lib/ai/gemini.provider.ts`
- Modify: `src/lib/ai/openai-compatible.provider.ts`
- Create: `src/lib/deep-research/research-ai-adapter.ts`
- Create: `src/lib/deep-research/research-token-estimate.ts`
- Create: `tests/deep-research-ai-adapter.test.ts`
- Modify: `tests/ai-provider-failover.test.ts`

**Interfaces:**

```ts
export type ResearchAiAttemptRequest<T> = {
  messages: AIMessage[];
  schema: z.ZodType<T>;
  signal: AbortSignal;
  deadlineAt: Date;
  maxInputTokens: number;
  maxOutputTokens: number;
  preferredProvider?: "gemini" | "openrouter" | "groq";
  reserveAttempt(provider: string, model: string): Promise<{ operationId: string }>;
};

export function runResearchAiAttempt<T>(input: ResearchAiAttemptRequest<T>): Promise<ResearchAiResult<T>>;
```

- [ ] **Step 1: failing adapter tests 작성**

- only configured Gemini/OpenRouter/Groq are candidates; unsupported preference and no configured provider fail before enqueue/dispatch.
- each physical timeout, retry and provider failover calls `reserveAttempt` exactly once before bytes are sent.
- shared AbortSignal and remaining deadline reach provider fetch; cancellation does not fail over.
- authentication/invalid schema/deterministic validation do not fail over; retryable rate/timeout/transport failures may fail over within remaining budget.
- retry-after is bounded by deadline and no raw provider body/key/prompt appears in safe error.
- output is schema parsed; usage includes physical provider/model and provider usage or conservative input/output token estimate.
- input/output ceiling and the reserved final synthesis attempt cannot be crossed.
- ordinary `chat()`/`streamChat()` behavior and provider contracts remain unchanged.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: research adapter와 abortable provider method 부재로 실패한다.

- [ ] **Step 3: additive provider request contract 구현**

ordinary `AIProvider` contract를 깨지 말고 research 전용 optional request path 또는 adapter-owned direct transport를 추가한다. Gemini와 OpenAI-compatible transport는 injected signal, per-call timeout, output token cap, structured JSON request, usage metadata를 반환한다. existing `src/lib/ai/errors.ts`는 수정하지 않고 adapter에서 stable failure class와 optional retry-after를 소유한다.

- [ ] **Step 4: exact failover와 token accounting 구현**

provider order는 explicit configured preference 먼저, 나머지 configured research providers의 server-defined order다. estimated tokens는 다음 attempt 예약 전에 누적 ceiling과 synthesis reserve를 검사한다. empty/timeout도 physical attempt다.

- [ ] **Step 5: green 확인 및 커밋**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

```powershell
git add src/lib/ai/ai-provider.ts src/lib/ai/gemini.provider.ts src/lib/ai/openai-compatible.provider.ts src/lib/deep-research/research-ai-adapter.ts src/lib/deep-research/research-token-estimate.ts tests/deep-research-ai-adapter.test.ts tests/ai-provider-failover.test.ts
git commit -m "feat: add bounded research AI adapter"
```

---

### Task 4: bounded search, DNS-pinned safe reader와 video normalization

**Files:**

- Modify: `src/lib/web-search/web-search.service.ts`
- Modify: `src/lib/web-search/web-search.types.ts`
- Create: `src/lib/deep-research/research-search.ts`
- Create: `src/lib/deep-research/safe-reader.ts`
- Create: `src/lib/deep-research/research-videos.ts`
- Create: `tests/deep-research-search.test.ts`
- Create: `tests/deep-research-safe-reader.test.ts`
- Create: `tests/deep-research-videos.test.ts`
- Modify: `tests/web-search-degradation.test.ts`

**Interfaces:**

```ts
export function searchResearchQueries(input: ResearchSearchInput): Promise<ResearchSearchBatch>;
export function readPublicResearchPage(input: SafeReaderInput): Promise<SafeReaderResult>;
export function normalizeResearchVideo(url: string): ResearchVideoCandidate | null;
```

- [ ] **Step 1: failing search and network-policy tests 작성**

Search tests는 signal/deadline/response bound 전달, canonical URL dedup, current DDG→Bing fallback 유지, per-job candidate limit, failed-query warning을 고정한다. Reader tests는 injected DNS/transport/clock으로 아래를 검증한다.

- fetch는 public HTTPS port 443만; HTTP result는 link로 남지만 읽지 않는다.
- username/password, URL >2,048, loopback/private/link-local/multicast/reserved/metadata IPv4·IPv6를 거부한다.
- DNS A/AAAA를 모두 검증·pin하고 connect 직전/redirect마다 정책을 재검증한다.
- auto redirect off, manual redirect maximum 3.
- DNS/connect/TLS establishment 5초, total 15초와 job abort propagation.
- compressed wire body와 decompressed body를 각각 2MiB에서 중단하고, extracted text는 120,000자, content type은 `text/html | text/plain`만 허용한다.
- cookies/auth/user headers 없이 fixed user agent.
- per-origin active 2, start interval 500ms.
- robots disallow는 unavailable; script/style/form/hidden controls/raw markup은 extracted text에 없다.
- binary/PDF/paywall/malformed/JS-only page는 unavailable이고 whole job을 throw하지 않는다.

Video tests는 validated YouTube/Vimeo ID, canonical direct URL, safe thumbnail metadata만 반환하며 playlist/query spoof, other origin, malformed ID는 ordinary link로 downgrade한다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: research search/reader/video modules 부재로 실패한다.

- [ ] **Step 3: existing search boundary를 additive하게 확장**

ordinary caller 기본값은 유지하면서 `{ signal, deadlineAt, maxResponseBytes }` options를 추가한다. result canonicalization은 fragment/tracking parameters를 제거하되 semantic query는 보존하고 maximum URL/count를 강제한다.

- [ ] **Step 4: safe reader 구현**

Cheerio로 standards-based HTML parsing 후 main/article/title/body text를 정규화한다. raw HTML은 반환/저장하지 않는다. DNS-pinned connection을 transport dependency로 격리해 tests가 실제 private endpoint를 건드리지 않게 한다. robots cache도 bounded TTL/size이며 disallow와 fetch failure를 구분한다.

- [ ] **Step 5: video link card normalization 구현**

YouTube/Vimeo는 search link card로만 발견하고 read evidence/citation count에 넣지 않는다. embed URL은 UI click 뒤에만 생성할 수 있는 normalized provider+ID를 반환한다.

- [ ] **Step 6: green 확인 및 커밋**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

```powershell
git add src/lib/web-search/web-search.service.ts src/lib/web-search/web-search.types.ts src/lib/deep-research/research-search.ts src/lib/deep-research/safe-reader.ts src/lib/deep-research/research-videos.ts tests/deep-research-search.test.ts tests/deep-research-safe-reader.test.ts tests/deep-research-videos.test.ts tests/web-search-degradation.test.ts
git commit -m "feat: add safe research acquisition"
```

---

### Task 5: planner, synthesis와 evidence verification

**Files:**

- Create: `src/lib/deep-research/research-planner.ts`
- Create: `src/lib/deep-research/research-synthesizer.ts`
- Create: `src/lib/deep-research/research-verifier.ts`
- Create: `src/lib/deep-research/research-markdown.ts`
- Create: `tests/deep-research-planner.test.ts`
- Create: `tests/deep-research-synthesis.test.ts`
- Create: `tests/deep-research-verification.test.ts`

**Interfaces:**

```ts
export function createResearchPlan(input: ResearchPlanInput): Promise<ResearchPlan>;
export function synthesizeResearchReport(input: ResearchSynthesisInput): Promise<DeepResearchReportDraft>;
export function verifyResearchReport(input: ResearchVerificationInput): DeepResearchVerifiedReport;
export function renderResearchReportMarkdown(report: DeepResearchReportView): string;
```

- [ ] **Step 1: failing structured-output tests 작성**

- plan sub-question/primary-source/recency/dispute/video flags가 tier limit을 넘지 않고 arbitrary tool/instruction을 포함하지 않는다.
- fetched evidence blocks는 untrusted delimiter와 source ID를 갖고 raw HTML/search snippet/video card/model prior knowledge는 citation evidence가 아니다.
- Korean report section은 정확히 핵심 요약, 조사 범위와 기준 시점, 상세 설명, 확인된 사실과 근거, 상반된 주장·불확실성·자료 한계, 권장 다음 행동, 참고 링크, 관련 동영상이다.
- every externally verifiable claim has existing read-success citation IDs; unknown ID, duplicate/circular independence, unsupported amount/date/name/current-status claim is removed or labelled analysis/uncertainty.
- conflicting reputable evidence is surfaced; stale source has as-of label.
- optional AI critic consumes same budget; if absent `verificationStatus: "incomplete"` and never `fully_verified`.
- no usable sources yields `NO_USABLE_SOURCES`; synthesis unavailable with usable sources yields evidence-only `partial` without invented prose.
- structured report and Markdown stay under 60,000 chars; no trusted HTML or javascript URL is rendered.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: planner/synthesizer/verifier modules 부재로 실패한다.

- [ ] **Step 3: Zod plan/report schema와 prompts 구현**

AI output은 parse 전에 bounded JSON extraction을 거치고 exact schema를 통과해야 한다. source content는 instructions가 아닌 quoted data라고 system boundary에 명시한다. plan failure는 deterministic minimal fallback sub-question을 사용하되 factual answer를 만들지 않는다.

- [ ] **Step 4: deterministic verifier와 Markdown 구현**

verified fact는 claim ID/text/citationIds/analysis label을 구조화한다. verifier는 source table의 read status와 citation relation만 신뢰하며 citation을 생성하지 않는다. Markdown은 escaped fields와 normalized HTTPS links만 조합한다.

- [ ] **Step 5: green 확인 및 커밋**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

```powershell
git add src/lib/deep-research/research-planner.ts src/lib/deep-research/research-synthesizer.ts src/lib/deep-research/research-verifier.ts src/lib/deep-research/research-markdown.ts tests/deep-research-planner.test.ts tests/deep-research-synthesis.test.ts tests/deep-research-verification.test.ts
git commit -m "feat: synthesize verified research reports"
```

---

### Task 6: resumable orchestration, private worker와 scheduler

**Files:**

- Create: `src/lib/deep-research/deep-research.service.ts`
- Create: `src/lib/deep-research/deep-research-worker.ts`
- Create: `src/lib/deep-research/deep-research-scheduler.ts`
- Create: `scripts/deep-research-worker.ts`
- Create: `scripts/run-schedulers.ts`
- Create: `tests/deep-research-orchestration.test.ts`
- Create: `tests/deep-research-worker.test.ts`
- Create: `tests/deep-research-scheduler.test.ts`

**Interfaces:**

```ts
export function runLeasedResearchJob(lease: DeepResearchLease, dependencies: ResearchDependencies): Promise<void>;
export function runDeepResearchWorker(options?: WorkerOptions): Promise<void>;
export function runResearchSchedulersOnce(options?: SchedulerOptions): Promise<ResearchSchedulerSummary>;
```

- [ ] **Step 1: failing state-machine and shutdown tests 작성**

- phase order와 Korean label은 committed checkpoint에서만 진전한다.
- checkpoint resume은 completed operation/source/AI attempt를 반복하지 않는다.
- heartbeat every 30s, idle poll bounded jitter, global concurrency default 2/range 1–8.
- acquisition은 final 15%와 one physical AI attempt를 보존하고 deadline/counter/cancellation 사이에서 새 call을 시작하지 않는다.
- cancellation between calls and during fetch/AI aborts shared signal, checkpoints, terminal `cancelled` and releases lease.
- source batch 후 checkpoint; temporary source/provider failure는 warning으로 계속한다.
- deadline + usable sources는 verified/evidence-only partial; no sources는 failed.
- expired recovery is also invoked during claim; scheduler uses one global advisory lock, bounded batches, cleanup outbox and closes DB/exits.
- SIGTERM stops claims, aborts network, current fence가 유효할 때 checkpoint하고 DB를 닫는다.
- worker와 scheduler는 question/page body/raw prompt/provider response를 log하지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: orchestration/entrypoint 부재로 실패한다.

- [ ] **Step 3: phase orchestrator 구현**

planner → search → read batches → synthesize → verify → persist를 checkpoint에서 재개한다. operation reservation callback을 search/reader/AI adapter에 의무 주입하고 unreserved external call을 type/API상 만들기 어렵게 한다. counters와 progress는 repository committed values만 사용한다.

- [ ] **Step 4: worker lifecycle 구현**

main worker는 schema assertion 후 N개의 bounded claim loop를 실행하고 no-job 때 jitter timer만 사용한다. signal handler는 idempotent shutdown promise를 호출한다. reusable module은 tests에 clock/sleep/repository를 주입하고 script는 production dependencies만 조립한다.

- [ ] **Step 5: one-shot scheduler 구현**

`runResearchSchedulersOnce`는 recover, expire intermediate, drain outbox의 bounded summary를 반환한다. script는 timer를 만들지 않고 `finally`에서 `closePostgres()` 후 exit code를 설정한다.

- [ ] **Step 6: green 확인 및 커밋**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

```powershell
git add src/lib/deep-research/deep-research.service.ts src/lib/deep-research/deep-research-worker.ts src/lib/deep-research/deep-research-scheduler.ts scripts/deep-research-worker.ts scripts/run-schedulers.ts tests/deep-research-orchestration.test.ts tests/deep-research-worker.test.ts tests/deep-research-scheduler.test.ts
git commit -m "feat: run resumable deep research jobs"
```

---

### Task 7: authenticated session bridge와 job/report API

**Files:**

- Modify: `app/api/ai/sessions/route.ts`
- Modify: `app/api/ai/sessions/[id]/route.ts`
- Modify: `src/lib/db/repositories/chat.repository.ts`
- Modify: `src/lib/storage/account-storage.ts`
- Create: `app/api/ai/deep-research/jobs/handler.ts`
- Create: `app/api/ai/deep-research/jobs/route.ts`
- Create: `app/api/ai/deep-research/jobs/[id]/handler.ts`
- Create: `app/api/ai/deep-research/jobs/[id]/route.ts`
- Create: `app/api/ai/deep-research/jobs/[id]/cancel/route.ts`
- Create: `app/api/ai/deep-research/jobs/[id]/report/route.ts`
- Create: `tests/deep-research-api.test.ts`
- Modify: `tests/owner-scoped-chat.test.ts`
- Modify: `tests/account-storage-usage.test.ts`

**Interfaces:**

- `POST /api/ai/sessions`: empty-chat research를 위한 authenticated idempotent session creation.
- `POST /api/ai/deep-research/jobs`: validate/enqueue 후 202 safe projection.
- `GET /api/ai/deep-research/jobs?sessionId=...`: owner/session bounded resume list.
- `GET|DELETE /api/ai/deep-research/jobs/:id`: owner-safe status/delete.
- `POST /api/ai/deep-research/jobs/:id/cancel`: idempotent cancellation.
- `GET /api/ai/deep-research/jobs/:id/report`: bounded structured report projection.

- [ ] **Step 1: failing route tests 작성**

- unauthenticated 401; auth/storage failure를 401로 오인하지 않는다.
- session owner mismatch, unknown job, cross-owner status/cancel/report/delete는 safe 404.
- create body는 exact `sessionId`, client `turnId`, 1–4,000 question, duration 5/15/30, optional supported configured provider만 허용한다.
- no provider configured fails before enqueue with stable guidance; valid create returns 202.
- same request returns same job; hash mismatch 409; queue/quota errors stable 429.
- list is bounded, stable sort and session filter mandatory; secrets/private checkpoint/internal error absent.
- cancel is idempotent, delete cascades report/source/video/intermediate visibility.
- report exposes structured safe fields/Markdown only for terminal report availability.
- POST session works before any ordinary chat send and same client session operation replays one owner session.
- deleting session invokes durable research cascade and does not orphan report.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: POST session과 research routes 부재로 실패한다.

- [ ] **Step 3: idempotent session creation bridge 구현**

body는 `{ operationId, title? }`만 받으며 owner ID는 auth에서 얻는다. chat repository lock에서 operation ID receipt와 new empty session을 같이 commit한다. 기존 GET/list와 normal chat-created session behavior를 유지한다.

- [ ] **Step 4: dependency-injected route handlers 구현**

각 App Router `route.ts`는 허용된 HTTP export만 두고 test factory는 `handler.ts`에 둔다. `readApiResponse`와 호환되는 stable envelope/error를 사용한다. create는 research를 실행하거나 network를 호출하지 않는다.

- [ ] **Step 5: account storage/lifecycle 연결**

research final/intermediate bytes와 selected-minute usage를 account category에 표시하고 account delete/export/session delete가 owner-scoped repository method를 호출한다. report content export는 bounded Markdown/JSON이며 credential/checkpoint/raw page body를 포함하지 않는다.

- [ ] **Step 6: green 확인 및 커밋**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

```powershell
git add app/api/ai/sessions/route.ts app/api/ai/sessions/[id]/route.ts app/api/ai/deep-research src/lib/db/repositories/chat.repository.ts src/lib/storage/account-storage.ts tests/deep-research-api.test.ts tests/owner-scoped-chat.test.ts tests/account-storage-usage.test.ts
git commit -m "feat: expose owner scoped research jobs"
```

---

### Task 8: Chat job card와 right-panel/mobile report UX

**Files:**

- Modify: `components/Chat/ChatView.tsx`
- Modify: `components/context/ConnectedContextWorkspace.tsx`
- Modify: `src/lib/i18n/translations.ts`
- Create: `components/Chat/DeepResearchButton.tsx`
- Create: `components/Chat/DeepResearchJobCard.tsx`
- Create: `components/Chat/DeepResearchPanel.tsx`
- Create: `components/Chat/deep-research-client.ts`
- Create: `tests/deep-research-ui.test.ts`
- Create: `tests/chat-view-workspace.test.ts`

**Interfaces:**

- Consumes: safe research job/report API, existing current session and right-side workspace.
- Produces: explicit duration selector, resumable cards, Context/Research panel switch, report/source/video/progress views and mobile drawer.

- [ ] **Step 1: failing static/component-policy tests 작성**

- normal send control remains and `심층 조사` is a separate explicit button.
- selector has only 5/15/30 and says background work continues; start never silently calls ordinary chat.
- empty chat first creates an authenticated session, then posts job with stable `turnId`; failure preserves question and does not fabricate card.
- reload lists session jobs and renders cards; polling starts 2s, backs off to 5s on unchanged state, stops terminal/unmount, resumes only from API.
- card shows stable Korean phase, committed counts, elapsed/selected budget, background status, cancel and report action.
- right column keeps `ConnectedContextWorkspace` and switches `컨텍스트 | 조사 보고서`; multiple reports have selector.
- desktop panel tabs are `보고서 | 출처 | 동영상 | 진행 기록`; mobile is full-height accessible drawer.
- report is escaped structured React, source links use `target="_blank" rel="noopener noreferrer"`.
- video initially link card/thumbnail only; click uses normalized YouTube `youtube-nocookie.com` or Vimeo embed; invalid URL never iframe.
- copy/Markdown export uses server-safe Markdown and no raw HTML.
- keyboard focus, labels, status live region, reduced-motion and responsive layout pass.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: DeepResearch components/client 부재로 실패한다.

- [ ] **Step 3: isolated client state and entry components 구현**

`deep-research-client.ts`가 fetch envelope, polling state, unchanged fingerprint/backoff, abort on unmount를 소유한다. `ChatView`에는 current session/question/start/open callbacks만 연결하고 research state machine을 넣지 않는다.

- [ ] **Step 4: job card와 report panel 구현**

progress percent는 phase + committed counts에서 coarse하게만 계산하고 fake linear timer를 사용하지 않는다. cancellation/partial/failed states와 warnings를 명확히 구분한다. report panel은 source citation relation, publisher/domain, published/accessed time, uncertainty, video evidence limitation을 표시한다.

- [ ] **Step 5: right workspace composition과 translations 구현**

기존 오른쪽 너비/ConnectedContextWorkspace 동작을 보존하는 작은 shell에서 view를 switch한다. global sidebar/topbar는 수정하지 않는다. 한국어 기본 문구와 existing locale fallback을 추가한다.

- [ ] **Step 6: green 확인 및 커밋**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

```powershell
git add components/Chat/ChatView.tsx components/Chat/DeepResearchButton.tsx components/Chat/DeepResearchJobCard.tsx components/Chat/DeepResearchPanel.tsx components/Chat/deep-research-client.ts components/context/ConnectedContextWorkspace.tsx src/lib/i18n/translations.ts tests/deep-research-ui.test.ts tests/chat-view-workspace.test.ts
git commit -m "feat: show durable research reports in chat"
```

---

### Task 9: Railway config, full regression과 deployed smoke gate

**Files:**

- Create: `services/deep-research/railway.toml`
- Create: `railway.cron.toml`
- Modify: `README.md`
- Create: `tests/deep-research-railway-config.test.ts`

**Interfaces:**

- Produces: deterministic Railpack worker/scheduler services and evidence-backed release record.

- [ ] **Step 1: failing config tests 작성**

Worker config path는 repo root 기준 `/services/deep-research/railway.toml`이고 아래 exact supported keys를 사용한다.

```toml
[build]
builder = "RAILPACK"
buildCommand = "npm ci && npm run typecheck"

[deploy]
preDeployCommand = "npm run migrate:research"
startCommand = "npm run worker:deep-research"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

[deploy.multiRegionConfig]
"asia-southeast1-eqsg3a" = { numReplicas = 1 }
```

Scheduler `/railway.cron.toml`은 아래 exact keys를 사용한다.

```toml
[build]
builder = "RAILPACK"
buildCommand = "npm ci && npm run typecheck"

[deploy]
preDeployCommand = "npm run migrate:research"
startCommand = "npm run cron:schedulers"
cronSchedule = "*/5 * * * *"
restartPolicyType = "NEVER"

[deploy.multiRegionConfig]
"asia-southeast1-eqsg3a" = { numReplicas = 1 }
```

Config as Code에 unsupported domain/health-check placeholder를 넣지 않는다. public domain 없음은 service provisioning 상태에서 별도로 확인하고 test/release evidence에 기록한다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: Config as Code files 부재로 실패한다.

- [ ] **Step 3: Railway configs와 operator docs 구현**

두 service는 `DATABASE_URL` private networking과 research provider/limit variables만 공유한다. worker에 ERP/OAuth unrelated secrets나 domain을 주지 않고 `DATABASE_PUBLIC_URL`을 사용하지 않는다. README는 web/worker/cron service 생성, Config path, variable reference, migrate/rollback-safe deploy와 five-minute smoke 순서를 기록한다.

- [ ] **Step 4: clean install과 versioned migration 검증**

Run: `npm.cmd ci`

Run: `npm.cmd run migrate:research`

Run again: `npm.cmd run migrate:research`

Expected: clean dependency install, migration first/second invocation success; incompatible schema fixture는 nonzero.

- [ ] **Step 5: full local release gate**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run lint`

Run: `npm.cmd run build`

Expected: all exit 0. Also run the worker SIGTERM harness and `npm.cmd run cron:schedulers`; cron performs one bounded pass, closes Postgres and exits with no open handles.

Run:

```powershell
rg -n "gpt-researcher|crawl4ai|jina api|searxng|ollama|DATABASE_PUBLIC_URL|NEXT_PUBLIC_.*KEY|dangerouslySetInnerHTML" src app components scripts services railway.cron.toml package.json .env.example
```

Expected: no forbidden runtime/deployment path or unsafe report renderer. Documentation-only rejection statements are outside this scan.

- [ ] **Step 6: commit and master delivery gate**

```powershell
git add services/deep-research/railway.toml railway.cron.toml README.md tests/deep-research-railway-config.test.ts
git commit -m "chore: deploy deep research workers"
```

Follow the master plan Task 7. Push verified `HEAD:main` only after every earlier suite stage and this full gate pass. Verify Railway web, private worker and one-shot cron build from that exact SHA, then run one authenticated five-minute job and record enqueue 202, claim/heartbeat, refresh resume, completed or honest partial report, source/video rendering, cron exit and absence of a worker public domain.
