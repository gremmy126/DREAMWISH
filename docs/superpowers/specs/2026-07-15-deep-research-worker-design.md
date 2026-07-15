# Deep Research Worker and Report Panel Design

## Status

Approved in conversation on 2026-07-15.

## Goal

Upgrade AI Chat with an explicit, durable Deep Research mode that researches a user question beyond one request-response cycle and produces a Korean report with explanations, direct links, evidence, uncertainty, and relevant videos.

The feature must:

- run in the background for a user-selected 5, 15, or 30 minute budget;
- survive browser refreshes and worker restarts;
- show progress in chat and the full report in the right panel;
- use free and already available search primitives without requiring a paid research framework;
- use the existing configured Gemini, Groq, or OpenRouter provider path and failover;
- isolate every job and report by authenticated owner and chat session; and
- fail safely when sufficient evidence is unavailable.

“Free” means that this feature adds no mandatory paid research framework, crawler, search API, or separate hosted model. Calls to Gemini, Groq, or OpenRouter still use the account and quota the user or operator configured; DREAMWISH cannot guarantee that an external provider will keep a free tier or unlimited quota.

## Scope

Included:

- explicit Deep Research entry in AI Chat;
- duration selection;
- authenticated job creation, polling, cancellation, resumption, and deletion;
- dedicated Postgres job and report persistence;
- an always-on private TypeScript worker;
- a one-shot Railway cron recovery and cleanup process;
- multi-query search, safe page reading, synthesis, evidence verification, and video discovery;
- structured report, source, video, and progress views;
- Markdown copy/export; and
- desktop right panel and mobile drawer presentation.

Excluded:

- silently turning ordinary chat questions into long-running jobs;
- cloning or running GPT Researcher;
- a mandatory Jina API, SearXNG, Tavily, Serper, or other paid search service;
- Crawl4AI or a Python sidecar;
- browser automation as the default reader;
- Railway Ollama or GPU inference;
- Docker or Ollama installation buttons;
- arbitrary tool execution, local shell execution, or unrestricted URL fetching;
- background CRM or ERP access that bypasses the AI business-context relevance and owner policy.

## Selected Approach

### DREAMWISH-native TypeScript worker — selected

Build a bounded research loop using the repository’s existing AI provider failover and web-search service, plus a new safe page reader, durable Postgres queue, report model, and UI.

This keeps authentication, provider configuration, logging, deployment, and source presentation inside DREAMWISH. It avoids operating a second Python stack or requiring another paid API.

The design may take architectural inspiration from the Apache-2.0 Jina node-deepresearch project. No upstream source is copied by default. If implementation later copies or adapts upstream code, it must preserve the required Apache-2.0 notices and record the exact source and commit.

### External Python research service — rejected

GPT Researcher, Crawl4AI, and comparable Python stacks add a separate runtime, configuration surface, queue contract, and security boundary. They also do not automatically share DREAMWISH owner isolation or AI provider settings.

### Research inside the web request — rejected

A 5–30 minute job cannot reliably remain inside a browser request or serverless response. It would be lost on refresh, deployment, timeout, or instance restart.

## High-Level Architecture

The feature contains five bounded units:

1. Web API: authenticates the owner, validates the request, creates an idempotent job, and returns immediately.
2. Postgres queue and report store: persists job state, lease, checkpoint, sources, videos, and final report.
3. Deep Research worker: continuously claims eligible jobs and runs the bounded research phases.
4. Scheduler cron: every five minutes recovers expired leases and deletes expired intermediate material, then exits.
5. AI Chat UI: creates jobs, resumes status after refresh, cancels jobs, and displays the final structured report.

The worker has no public domain. It communicates only with Postgres and approved outbound AI, search, and public HTTPS sources.

## Repository Boundaries

Planned boundaries:

- src/lib/deep-research/deep-research.types.ts: public job, progress, report, source, and video contracts.
- src/lib/deep-research/deep-research.schema.ts: versioned Postgres schema and advisory-lock migration.
- src/lib/deep-research/deep-research.repository.ts: Postgres schema, transactional enqueue, claim, heartbeat, checkpoint, completion, cancellation, and deletion.
- src/lib/deep-research/research-budget.ts: immutable 5/15/30-minute resource ceilings.
- src/lib/deep-research/research-planner.ts: bounded sub-question planning.
- src/lib/deep-research/research-search.ts: multi-query search and canonical URL deduplication.
- src/lib/deep-research/safe-reader.ts: DNS-pinned, bounded public-page retrieval and text extraction.
- src/lib/deep-research/research-synthesizer.ts: structured report drafting.
- src/lib/deep-research/research-verifier.ts: citation coverage, contradiction, and unsupported-claim checks.
- src/lib/deep-research/research-videos.ts: safe YouTube and Vimeo discovery and ID normalization.
- src/lib/deep-research/deep-research.service.ts: phase orchestration and checkpoint policy.
- scripts/deep-research-worker.ts: always-on claim loop and graceful shutdown.
- scripts/run-schedulers.ts: one-shot lease recovery and retention cleanup.
- scripts/migrate-research.ts: idempotent schema migration entrypoint.
- app/api/ai/deep-research/jobs/route.ts: authenticated create and owner-scoped list/resume.
- app/api/ai/deep-research/jobs/[id]/route.ts: authenticated status and deletion.
- app/api/ai/deep-research/jobs/[id]/cancel/route.ts: idempotent cancellation request.
- app/api/ai/deep-research/jobs/[id]/report/route.ts: bounded structured report projection.
- components/Chat/DeepResearchButton.tsx: explicit entry and duration selector.
- components/Chat/DeepResearchJobCard.tsx: resumable status card.
- components/Chat/DeepResearchPanel.tsx: report, sources, videos, and progress tabs.
- services/deep-research/railway.toml: worker Config as Code.
- railway.cron.toml: one-shot scheduler Config as Code.

The main ChatView orchestrates these components but does not contain the research state machine or page-reading logic.

## Durable Data Model

Deep Research uses dedicated Postgres tables rather than the local JSON fallback. A multi-process durable lease cannot rely on an in-memory lock or a filesystem shared by only one Railway service.

Schema creation runs through one versioned idempotent migration guarded by a Postgres advisory lock. The web, worker, and scheduler may all verify the expected schema version, but concurrent deploys cannot execute incompatible DDL or observe a half-created schema. A worker or scheduler with a code/schema mismatch exits before claiming work.

The initial schema contains dedicated `deep_research_jobs`, `deep_research_operations`, `deep_research_reports`, `deep_research_sources`, `deep_research_videos`, `deep_research_usage`, and `deep_research_cleanup_outbox` tables. Queue and lease correctness never depend on the existing JSON owner-document table.

### Research job

A research job stores:

- job ID;
- owner ID;
- chat session ID;
- client-generated turn ID;
- immutable request hash;
- normalized question;
- duration budget;
- selected or default provider preference;
- lifecycle status;
- current phase and progress counts;
- cancellation timestamp;
- attempt count;
- next eligible time;
- lease owner, random lease token, and lease expiry;
- bounded JSON checkpoint;
- warning and stable public error codes;
- created, started, updated, and finished timestamps.

The unique key is owner ID, session ID, and turn ID. Retrying the exact same request returns the existing job. Reusing the turn ID with a different question, duration, session, or provider returns 409 and does not mutate the job.

The normalized question is 1–4,000 characters. A report is capped at 60,000 Unicode characters, a retained citation excerpt at 800 characters, and a source URL at 2,048 characters.

Lifecycle status is one of:

- queued
- running
- completed
- partial
- failed
- cancelled

The phase is one of:

- planning
- searching
- reading
- synthesizing
- verifying
- persisting

### Report

The final report is stored separately from the queue row and contains:

- title;
- executive summary;
- detailed sections;
- verified facts and their citation IDs;
- contradictions, uncertainty, and missing evidence;
- recommended next actions;
- direct links;
- relevant videos;
- as-of time;
- source count;
- selected budget and actual elapsed time;
- completion quality and warnings; and
- report schema version.

Report sections and citations are structured JSON. A bounded Markdown representation may be generated from that structure for copy/export. Raw model HTML is never stored or rendered as trusted markup.

### Sources and intermediate material

Retained report evidence stores only the normalized URL, title, publisher/domain, publication date when available, accessed time, bounded citation excerpt, source type, and citation relationship.

Search candidates, fetched page text, planning scratch state, and verification scratch state are intermediate material. They expire seven days after the job finishes. The final report, curated citations, videos, and audit metadata remain until the owner deletes the report.

The existing Railway volume is not deleted as part of this change, but it is not canonical job storage. Scratch files, if any, must be disposable and reconstructable.

Research is added as an explicit category in account storage and usage accounting. Default owner limits are 100 MiB of combined final and intermediate research storage, 60 selected research minutes per UTC day, and 600 selected research minutes per rolling 30-day window. Queued jobs reserve their selected minutes; cancellation before first claim releases the reservation. Limits are configurable downward or upward by the operator, but the API always exposes the effective limit and returns a stable quota error before enqueueing.

## Job Creation and Concurrency

POST /api/ai/deep-research/jobs accepts:

- sessionId;
- turnId;
- question;
- durationMinutes equal to 5, 15, or 30; and
- an optional supported configured provider preference.

The route:

1. authenticates the owner;
2. verifies that the session belongs to the owner;
3. validates and bounds all strings;
4. performs the idempotency check;
5. enforces per-owner concurrency in one transaction; and
6. returns 202 with the safe job projection.

One owner may have at most one running job and two queued jobs. Enqueue, claim, and recovery use the same owner advisory lock. A partial unique index enforces at most one running job, and the locked queued count enforces at most two queued jobs across every web replica and worker. A third queued request returns 429 with a stable limit code and does not create a row.

The API does not execute research and never waits for the selected duration.

## Claim, Lease, and Recovery

The worker selects eligible rows with database time and `FOR UPDATE SKIP LOCKED`, then claims under the same owner advisory lock. Recovery returns an expired job to queued with a future next-eligible time; there is no undeclared retryable lifecycle status. The worker must not claim a second job for an owner who already has a running lease.

The always-on worker polls Postgres with bounded jitter while idle. It does not require Redis for this initial concurrency level and it never keeps a database transaction open while waiting or performing network work.

Each claim creates a random lease token and a 120-second lease using database time. The worker sends a heartbeat every 30 seconds. Every checkpoint, progress update, completion, failure, and cancellation transition includes the current lease token in its compare-and-swap condition. A stale worker cannot write after another worker reclaims the job.

The worker checkpoints after every phase and after each bounded source batch. Before every external search, page read, or physical AI attempt, it durably reserves one operation and its budget unit; after the call it records the fenced outcome. A checkpoint contains only the minimum data needed to resume without repeating completed operations or treating the same source as new.

The scheduler takes a global advisory lock, uses database time, and runs every five minutes. In bounded batches it:

- returns expired running leases to the eligible queue with bounded backoff;
- increments the recovery count, which excludes the initial claim;
- permanently fails a job after three recoveries, for at most four total claims;
- removes intermediate material older than seven days;
- drains a bounded number of stale cleanup records; and
- closes database connections and exits.

The worker also recovers expired jobs while claiming, so correctness does not depend on cron timing.

Recovery never resets the original started-at deadline or any operation counter. If the deadline has passed, recovery deterministically finalizes an evidence-only partial from successfully read persisted sources, or fails with `NO_USABLE_SOURCES` when none exist.

## Duration Budgets

The selected duration is a work budget, not an artificial sleep and not a guarantee that every external provider remains available for that long. The worker continues useful work until the evidence converges, the resource ceilings are met, cancellation is requested, or the deadline is reached.

| Budget | Sub-questions | Search candidates | Page fetch attempts | Video candidates | Physical AI attempts |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5 minutes | 3 | 12 | 8 | 4 | 6 |
| 15 minutes | 6 | 30 | 20 | 8 | 14 |
| 30 minutes | 10 | 50 | 35 | 12 | 24 |

These are global hard maximums per job, not per sub-question and not minimum promises. A search candidate is one canonical deduplicated URL. A page read is one unique fetch attempt whether it succeeds or fails. A video candidate is one validated link card and is not treated as read evidence. One AI call is one physical provider HTTP attempt, including a timeout or failed failover attempt. Deduplication, inaccessible pages, sufficient evidence, provider limits, or cancellation may yield fewer successful items.

The tier also caps cumulative intermediate extracted text at 500,000, 1,500,000, and 3,000,000 characters respectively. Model input/output token ceilings are 30,000/12,000, 100,000/36,000, and 200,000/64,000 respectively. When a provider omits usage metadata, the research adapter applies a conservative tokenizer estimate before reserving the next attempt.

Each external request has its own timeout and shares one job-level abort signal. The hard deadline is measured from the first successful claim, not enqueue time. The final 15 percent of the selected budget and at least one physical AI attempt are reserved for synthesis. Deterministic citation verification and durable persistence do not require an AI call; the acquisition phases cannot consume their time reserve.

## Research Phases

### 1. Planning

The planner converts the question into the tier’s bounded number of distinct sub-questions and identifies likely primary-source categories, recency requirements, disputed points, and video value.

The plan is structured and schema-validated. It cannot create arbitrary tools or change the job’s permissions.

### 2. Searching

The search phase calls a research adapter over the existing web-search boundary for each sub-question and selected primary-source refinements. The adapter adds the job abort signal, remaining-deadline timeout, response-size limit, and physical-operation accounting that the current synchronous search helper lacks. Results are normalized, canonicalized, deduplicated, and ranked for relevance, source authority, recency, and viewpoint diversity.

The current DuckDuckGo/Bing search path remains the free default. Deep Research does not require a new API key. Search failure records a warning and allows other queries to continue.

Video discovery uses bounded searches restricted to YouTube and Vimeo. It does not require a YouTube API key.

### 3. Reading

The safe reader retrieves only public HTTPS pages on port 443 that pass the network policy. URLs containing credentials or more than 2,048 characters are rejected. HTTP search results may remain visible as links but are not fetched. Private or reserved network destinations are always rejected.

It:

- resolves and pins approved public addresses;
- disables automatic redirects and validates at most three manual redirect hops;
- limits each decompressed response to 2 MiB and extracted text to 120,000 characters;
- initially accepts only `text/html` and `text/plain`;
- limits DNS/connect/TLS establishment to five seconds and the total request to 15 seconds, with abort propagation;
- sends a fixed user agent and no cookies, authorization, or user-supplied headers;
- permits at most two active fetches per origin and at least 500 milliseconds between starts for the same origin;
- respects a disallowing robots policy and records the page as unavailable;
- parses HTML with a maintained standards-based parser dependency rather than regular expressions;
- removes scripts, styles, forms, hidden controls, and markup;
- stores normalized text only as expiring intermediate material; and
- never executes page JavaScript or browser actions.

Blocked, paywalled, PDF, binary, malformed, dynamic-JavaScript-only, or failed pages are marked unavailable and do not fail the whole job. PDF reading is not claimed until a separately reviewed parser is added.

### 4. Synthesis

The synthesizer receives bounded structured evidence blocks, not raw HTML. Retrieved text is explicitly delimited as untrusted data.

The Korean report contains:

1. 핵심 요약
2. 조사 범위와 기준 시점
3. 상세 설명
4. 확인된 사실과 근거
5. 상반된 주장·불확실성·자료 한계
6. 권장 다음 행동
7. 참고 링크
8. 관련 동영상

Every externally verifiable factual claim must point to one or more citation IDs from successfully fetched and extracted evidence. Search snippets, video link cards, or the model’s prior knowledge cannot support a factual report claim. Unsupported claims are removed or labelled as analysis or uncertainty.

### 5. Verification

Verification checks:

- citation IDs exist and link to retained source records;
- important claims have direct support;
- dates, amounts, names, and current-status statements agree with their evidence;
- duplicate or circular sources are not counted as independent confirmation;
- conflicting reputable sources are surfaced;
- stale information is labelled with its as-of date; and
- links and video IDs pass final normalization.

Verification is deterministic for citation existence, URL/source mapping, read-success state, and claim-to-source references. An optional AI critic attempt counts against the same physical-call and token budgets. If that critic is unavailable, the report sets `verificationStatus: "incomplete"` and cannot label the report fully verified. Verification may revise or remove a claim. It cannot invent a citation.

## Progress Contract

The job card exposes stable Korean phase labels:

- 대기 중
- 조사 계획 수립
- 웹 검색
- 자료 읽기
- 내용 종합
- 근거 검증
- 보고서 저장
- 완료

The safe progress projection includes:

- status and phase;
- completed and budgeted sub-questions, searches, reads, videos, and AI calls;
- elapsed time;
- selected budget;
- source count;
- warnings safe for the owner;
- cancellation availability; and
- report availability.

Progress is based on committed checkpoints, not fabricated percentages. The UI may derive a coarse visual percentage from phase and committed counts.

## AI Chat and Right-Panel Presentation

### Entry

AI Chat displays a clear “심층 조사” button near the normal send controls. Clicking it opens a 5, 15, or 30 minute selector and a short explanation that the task continues in the background.

Creating the job adds a chat job card with:

- current phase;
- committed resource counts;
- elapsed time;
- “백그라운드에서 계속” status;
- cancel action; and
- “보고서 열기” when available.

Reloading the session queries owner-scoped jobs and rehydrates the card. Client polling uses bounded backoff and stops for terminal jobs.

The current right column explicitly switches between “컨텍스트” and “조사 보고서”; it does not replace ConnectedContextWorkspace. The Research view includes a job selector when the session has multiple reports. Polling begins at two seconds, backs off to five seconds for unchanged state, and reconnects only from durable API state.

Reports are canonical Postgres records independent of the existing chat JSON repository. The worker never appends or edits a chat message. The authenticated web route may persist only a bounded job-reference card through the existing chat service, while reload and report access always work from the durable job API.

### Report panel

Desktop uses the existing right-side workspace. Mobile uses a full-height drawer. The panel contains four tabs:

1. 보고서
2. 출처
3. 동영상
4. 진행 기록

The chat message contains only a compact summary and report action. The full report remains in the panel.

The report supports safe copy and Markdown export. Source links open with safe external-link attributes. The UI shows publication date, accessed date, domain, citation use, and source warnings where available.

### Videos

Only validated YouTube and Vimeo IDs are accepted. The panel initially renders a thumbnail, title, channel/domain evidence, and direct link. DREAMWISH presents these as related link cards; it does not claim that a video was watched, transcribed, or used as factual evidence.

Playback loads only after the user clicks. YouTube uses the privacy-enhanced youtube-nocookie.com player. Invalid or unverified video URLs remain ordinary source links and are never embedded.

## Cancellation and Terminal Behavior

Cancellation is an idempotent durable request. A queued job becomes cancelled immediately. A running worker observes cancellation between calls and through the shared abort signal, checkpoints safe progress, releases the lease, and marks the job cancelled.

A cancelled job does not claim to have a completed report. Retained citations and progress may be shown as incomplete work until the owner deletes the job.

Terminal outcomes:

- completed: verification passed with sufficient evidence;
- partial: useful evidence exists but a deadline, provider failure, or important coverage gap remains;
- failed: no defensible report could be produced or the job exceeded three recoveries;
- cancelled: the owner requested cancellation.

No successfully fetched and extracted sources means `failed/NO_USABLE_SOURCES`, not a model-only report. If usable evidence exists but synthesis cannot run before the deadline, the worker emits an evidence-only partial with source summaries and no invented narrative.

## Provider Failure and Cost Control

Research uses exactly the configured intersection of Gemini, OpenRouter, and Groq. Hugging Face and Cloudflare remain available to ordinary chat but are excluded from Deep Research. An explicit supported preference may be tried first, followed by the remaining configured research providers in the server-defined order.

A dedicated research AI adapter wraps the existing provider implementations and accepts an AbortSignal, remaining wall-clock deadline, input/output token caps, and an output schema. It returns the physical provider, model, usage or conservative estimate, and classified outcome. The generic ordinary-chat failover helper is not called directly because it cannot currently enforce a job deadline or physical-attempt budget.

- Authentication, rate-limit, timeout, transport, and invalid-response failures are classified. Failover occurs only for the explicitly retryable provider-specific classes and never for a cancelled job, exhausted budget, invalid research plan, or deterministic validation failure.
- Rate limits use bounded retry-after handling within the same job deadline.
- Timeouts and empty responses count as failed AI attempts.
- Every physical retry and failover attempt is durably reserved before dispatch and counts toward the tier’s maximum AI calls.
- Provider errors exposed to the user contain no key, raw upstream body, or internal prompt.
- If no provider is configured, job creation fails before queueing with the existing provider-configuration guidance.

The worker does not use Ollama on Railway.

## Security and Privacy

- All routes derive owner identity from authentication.
- Session, turn, job, report, source, and cancellation IDs are verified against that owner.
- Worker claims use stored owner identity and never accept an owner from the model or fetched content.
- Web content, CRM data, ERP data, memories, and documents are untrusted prompt data, not control instructions.
- The reader rejects loopback, link-local, private, reserved, metadata, and rebinding destinations before and after redirects.
- Outbound bodies, redirects, content types, compressed size, decompressed size, extracted text, and request time are bounded.
- Model output is schema-validated and rendered as escaped structured content.
- Questions, page bodies, credentials, provider keys, raw prompts, and model reasoning are not logged.
- Audit logs contain owner-safe identifiers, state transitions, phase timings, counts, provider labels, and stable error codes.
- Reports are visible only to their owner and remain until that owner deletes them.
- Deletion removes the report, curated source excerpts, videos, checkpoints, and intermediate data through an idempotent cleanup job. Minimal non-content audit metadata may remain.

Deleting a chat session is an explicit deletion of its linked research records and enqueues the same cascade cleanup. A report is never orphaned merely because the chat JSON disappears. Bucket or volume cleanup uses the durable cleanup outbox so a non-atomic object deletion can retry without restoring database visibility.

## Railway Deployment

The same repository is deployed as three services:

Package metadata pins Node 22.x and documents every research variable in `.env.example` without secret values. The exact scripts are `migrate:research`, `worker:deep-research`, and `cron:schedulers`.

### Web

The existing DREAMWISH web service serves authenticated APIs and UI. It shares DATABASE_URL and only the provider variables required for chat and job validation.

### deep-research

An always-on worker service uses repository root as its Railway Root Directory and the custom Config as Code path /services/deep-research/railway.toml.

The file sets:

- Railpack as builder;
- a deterministic clean dependency install and typecheck;
- `npm run migrate:research` as the pre-deploy schema command;
- `npm run worker:deep-research` as the start command;
- ON_FAILURE restart policy with bounded retries; and
- no health check or public domain.

The `worker:deep-research` script is backed by `tsx scripts/deep-research-worker.ts`, and `tsx` is a production runtime dependency so the start command exists in a clean Railway image. The worker handles SIGTERM by aborting current network work, checkpointing if its lease remains valid, stopping new claims, and closing Postgres before exit.

The worker shares DATABASE_URL and configured AI provider variables. It does not receive ERP credentials, OAuth client secrets, or unrelated integration variables unless a later approved business-context feature proves they are required.

### scheduler-cron

The scheduler service uses repository root as its Railway Root Directory and /railway.cron.toml.

The file sets:

- Railpack as builder;
- a deterministic clean dependency install and typecheck;
- `npm run migrate:research` as the pre-deploy schema command;
- `npm run cron:schedulers` as the one-shot start command;
- cronSchedule to every five minutes, the Railway minimum frequency;
- NEVER restart policy; and
- no public domain.

The package adds the exact `cron:schedulers` script, backed by `tsx scripts/run-schedulers.ts`. The scheduler closes Postgres and exits after each bounded run. If one execution is still active, Railway may skip the next schedule, so the task must not contain a persistent timer or open server.

The scheduler region is changed from the invalid legacy region to the same currently supported region as the web and worker services.

The worker’s default global concurrency is two jobs, configurable from one through eight. The services share DATABASE_URL through Railway private networking plus only the required provider keys and explicit research-limit variables. DATABASE_PUBLIC_URL is not used for service-to-database traffic.

## Testing

### Repository and lease tests

- idempotent enqueue and request-hash mismatch;
- one running plus two queued jobs per owner;
- cross-owner status, cancel, report, and delete rejection;
- transactional claim and same-owner concurrency;
- heartbeat extension and lease-token fencing;
- expired lease recovery and three-attempt terminal failure;
- cancellation before claim, during fetch, and during AI call;
- checkpoint resumption without duplicated AI calls or sources;
- intermediate retention and owner deletion cleanup.

### Budget and orchestration tests

- exact immutable 5/15/30 budget ceilings;
- physical retries and failover count against AI call limits;
- token, intermediate-byte, final-report, daily, monthly, storage, and global-concurrency limits;
- deadline reserve leaves time to persist a terminal result;
- no-source failure;
- partial report behavior;
- search and source deduplication;
- verification cannot introduce a citation;
- unsupported factual claims are removed or labelled.

### Network security tests

- HTTPS fetch enforcement and non-fetched HTTP-link presentation;
- private, loopback, link-local, metadata, reserved, IPv6, DNS-rebinding, and redirect targets fail closed;
- response and decompression limits;
- abort and timeout propagation;
- unsupported content types;
- scripts and raw HTML never reach the report renderer.

### API and UI tests

- unauthenticated requests fail;
- session and job owner scope;
- provider-not-configured behavior;
- duration validation and queue limit;
- reload rehydrates a running job;
- progress is based on committed state;
- cancel is idempotent;
- terminal report opens in the panel;
- report, source, video, and progress tabs;
- safe external links and privacy video embeds;
- responsive desktop and mobile presentation;
- accessible keyboard and screen-reader behavior.

### Railway and regression verification

- validate both Config as Code files against the current Railway schema;
- run the versioned migration twice to prove idempotency and reject a schema-version mismatch;
- package scripts exist and terminate as expected;
- worker gracefully handles SIGTERM and releases or expires its lease safely;
- cron performs one bounded pass and exits with no open handles;
- full test, typecheck, lint, and production build pass;
- existing normal chat, provider failover, memory, RAG, CRM, ERP, and authentication behavior remains functional.

After deployment, run one authenticated five-minute smoke job and verify:

1. web enqueue returns 202;
2. the private worker claims and heartbeats;
3. progress survives browser refresh;
4. a structured report or honest partial outcome is stored;
5. sources and safe videos render;
6. the cron service completes and exits; and
7. no service exposes secrets or a worker public domain.

## Acceptance Criteria

- Deep Research starts only through an explicit user action.
- The user can select 5, 15, or 30 minutes.
- The API returns immediately with a durable, idempotent job.
- One owner cannot exceed one running and two queued jobs.
- The worker survives restarts through checkpointed, fenced leases.
- Search, page reading, AI calls, retries, report size, and duration are bounded.
- A completed or partial report clearly separates evidence, analysis, uncertainty, links, and videos.
- No-source jobs fail honestly.
- The right panel resumes after refresh and remains usable on mobile.
- Reports and retained evidence are owner-scoped and deletable.
- Intermediate material expires after seven days.
- No paid research framework, SearXNG, Jina API, Crawl4AI, Python sidecar, or Railway Ollama is required.
- The web, deep-research, and scheduler-cron Railway services build and run successfully.
