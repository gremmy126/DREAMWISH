# AI Chat CRM and ERP Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI Chat이 owner-scoped CRM·ERP·memory·문서 문맥을 필요한 경우에만 불러오고, 중요한 안전 정보는 같은 요청에서 보존하며, allowlisted CRM 변경과 ERPNext draft 생성을 exact preview·승인·재검증 후 실행하게 한다.

**Architecture:** 먼저 idempotent chat turn 저장 경계와 owner-aware context builder를 만든 뒤 normal/stream route를 하나의 prepare/execute/finalize pipeline으로 통합한다. Memory auto-save는 기존 pending lifecycle을 변경하지 않고 별도 server-only deterministic policy로 제한한다. Business actions는 model Markdown과 분리된 discriminated proposal repository를 사용하며, one-time token과 exact precondition을 통과한 요청만 CRM CAS 또는 opt-in ERP draft provider에 전달한다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, existing AI providers/LangGraph/RAG, local JSON repositories, native Web Streams/SSE, Node crypto, Tailwind CSS, Lucide React, Node test harness.

## Global Constraints

- `docs/superpowers/specs/2026-07-15-business-suite-delivery-design.md`가 delivery order, product navigation, installer/local-gateway exclusion, immediate-save semantics에서 우선하고 나머지 AI context/action 상세 계약은 AI CRM and ERP Context design이 소유한다.

- 현재 user message가 사용자 의도·출력 방식의 최우선이다. memory/CRM/ERP/document text는 data이며 instruction이 아니다.
- `POST /api/ai/chat`의 기존 `{ ok: true, data: AiChatResult }` wrapper와 그 안의 `answer`, `sources`, `confidence`, `verification`, `sessionId`, `memoryStatus`, `memoryCandidates`를 유지하고 additive metadata만 `data` 안에 넣는다.
- stream의 기존 `status`, `session`, `sources`, `delta`, `done`, `error` event와 `done.answer/memoryStatus/memoryCandidates`를 유지하고 metadata만 추가한다.
- 일반 대화에서는 CRM, ERP, document를 읽지 않는다. `crmMode`, `erpMode`, `needsDocuments`가 명시적으로 선택한 source만 조회한다.
- personal context는 현재 owner 없는 `hybridSearch(message, limit)`를 호출하지 않는다.
- 고객별 ERP 조회는 approved exact mapping만 사용한다. dashboard aggregate로 특정 고객 금액을 답하지 않는다.
- CRM `expectedValue`와 ERP actual은 통화가 정확히 같을 때만 비교한다.
- live ERP amount/status/inventory/mapping은 long-term memory와 conversation summary에 저장하지 않는다.
- auto-save는 `importance >= 0.80`, `confidence >= 0.85`, allowlisted kind, `deterministic_explicit | verified_action`을 모두 만족해야 한다. model candidate는 점수와 무관하게 pending이다.
- secrets와 민감 식별자는 approved/pending content 모두에 저장하지 않는다.
- read는 즉시 실행할 수 있지만 mutation은 exact proposal과 explicit approval 전에는 실행하지 않는다.
- 초기 ERP write는 opt-in `draft_write`의 unsubmitted quotation/sales order만 허용한다. invoice/payment/submit/cancel/delete/stock/accounting은 거부한다.
- text `응` 자체는 승인이 아니다. 같은 session의 active proposal ID와 raw one-time approval token을 client가 함께 보낼 때만 승인이다.
- 결과가 불명인 ERP write는 자동 재전송하지 않고 `outcome_unknown`으로 reconciliation한다.
- ERP identity의 `connectionRevision`과 permission의 `capabilityVersion`을 분리한다. capability-only toggle은 CRM mapping을 무효화하지 않으며 proposal execution은 두 version을 각각 재검증한다.
- 중요한 inbound memory는 lease와 memory-store receipt로 crash-recoverable하다. action mutation은 provider/repository에 durable operation ID를 전달해 mutation commit과 action-result commit 사이 장애를 재조정한다.
- 기존 `src/lib/agent/approval.ts`는 비실행 계획 preview이며 business authorization에 사용하지 않는다.
- 사용자가 수정한 `src/lib/ai/errors.ts`, `.superpowers/`, `h origin main`을 건드리거나 커밋하지 않는다.
- 선행 의존성: Automation connection binding, ERP dashboard/provider와 CRM dashboard/contacts/mapping 계획 전체를 완료한 뒤 이 AI 계획을 시작한다. 특히 Task 4의 contact-linked memory가 CRM child-write lease를 직접 사용하므로 부분 CRM 구현 위에서 실행하지 않는다.
- Deep Research는 별도 Stage 5이며 이 계획의 Tasks 1–9와 전체 AI release gate가 모두 끝난 뒤에만 시작한다. 이 계획은 research job, worker, crawling, duration selector를 구현하지 않고 Chat의 stable source/right-panel 확장점만 제공한다.
- 기준 명세: `docs/superpowers/specs/2026-07-15-ai-crm-erp-context-design.md`.
- `scripts/run-tests.mjs`는 filename 인자를 무시하므로 이 계획의 `npm.cmd test`는 모두 전체 suite다. 현재 baseline typecheck의 `src/lib/ai/errors.ts` 두 code 오류는 사용자 변경 debt로 기록하고 이 계획에서 수정하지 않는다.

## File Structure

- `src/lib/db/repositories/chat.repository.ts`: locked session/message/summary store primitives와 stable ordinal.
- `src/lib/db/repositories/chat-turn.repository.ts`: owner/turn idempotency, request hash, completion replay, turn status.
- `src/lib/ai/chat-turn.types.ts`: request, turn, prepared/final result, additive response types.
- `src/lib/ai/chat-turn.service.ts`: shared prepare/execute/finalize orchestration.
- `src/lib/ai/context/**`: relevance, recent conversation, summary, memory, CRM, ERP, document, budget, source manifest.
- `src/lib/memory/auto-memory-policy.ts`: sensitivity, deterministic kinds, threshold, dedup decision.
- `src/lib/memory/capture-inbound-user-memory.ts`: server-only immediate persistence boundary.
- `src/lib/ai/actions/**`: proposal schema, repository, approval token, executor, audit, reconciliation.
- `app/api/ai/chat/**`, `app/api/ai/actions/**`: thin authenticated transports.
- `components/Chat/**`: additive source/context drawer, memory result, proposal approval, execution result.

---

### Task 1: idempotent chat turn·ordinal·completion repository 구현

**Files:**

- Modify: `src/lib/chat/chat.types.ts`
- Create: `src/lib/ai/chat-turn.types.ts`
- Modify: `src/lib/db/repositories/chat.repository.ts`
- Create: `src/lib/db/repositories/chat-turn.repository.ts`
- Create: `tests/chat-turn-idempotency.test.ts`
- Modify: `tests/owner-scoped-chat.test.ts`

**Interfaces:**

- Produces: locked chat-store primitives, `beginTurn`, `beginApprovalTurn`, `completeTurn`, `failTurn`, `getTurnStatus`, stable message ordinal and `(ownerId, turnId)` uniqueness.
- Consumes: existing session/message JSON and owner-scoped chat methods.

- [ ] **Step 1: 실패하는 new-session retry·completion 테스트 작성**

```ts
test("same owner turn creates one new session and one user message", async () => {
  const first = await beginTurn({
    ownerId: "owner-a",
    sessionId: undefined,
    turnId: "11111111-1111-4111-8111-111111111111",
    message: "이번 달 매출을 알려줘"
  });
  if (first.kind !== "started") throw new Error("expected started turn");
  const retry = await beginTurn({
    ownerId: "owner-a",
    sessionId: undefined,
    turnId: first.turn.turnId,
    message: "이번 달 매출을 알려줘"
  });
  if (retry.kind !== "in_progress") throw new Error("expected in-progress replay");
  assert.equal(retry.turn.sessionId, first.turn.sessionId);
  assert.equal(retry.turn.userMessageId, first.turn.userMessageId);
  assert.equal((await getSession("owner-a", first.turn.sessionId))?.messages.length, 1);
});
```

추가 assertion:

- same turn ID에 다른 message/session/request hash를 보내면 `TURN_REQUEST_MISMATCH`다.
- owner B는 owner A turn을 보지 못한다.
- generating retry는 `TURN_IN_PROGRESS`, completed retry는 persisted final snapshot을 반환한다.
- failed retry는 같은 user message로 attempt만 증가시킨다.
- active execution lease가 있는 generating retry는 `TURN_IN_PROGRESS`지만, heartbeat가 끊겨 lease가 만료된 generating turn은 같은 user message/ordinal을 유지한 채 새 fenced lease와 증가한 attempt로 reclaim된다.
- complete 두 번은 assistant message를 하나만 저장한다.
- 이전 lease holder가 reclaim 뒤 늦게 complete/fail/heartbeat를 호출하면 `TURN_LEASE_LOST`이고 새 attempt를 덮지 못한다.
- message ordinal은 timestamp 동률에도 1,2,3 순서를 유지한다.
- archived/foreign session에 begin할 수 없다.
- `beginApprovalTurn`은 distinct approval turn ID를 같은 owner/session/proposal turn/version에 묶고 stale proposal version을 거부하며 raw approval token을 message나 turn metadata에 저장하지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: turn types/repository exports 부재로 실패한다.

- [ ] **Step 3: turn과 message 타입 구현**

```ts
export type ChatTurnState = "generating" | "completed" | "failed";

export type ChatTurnRecord = {
  ownerId: string;
  sessionId: string;
  turnId: string;
  ordinal: number;
  userMessageId: string;
  assistantMessageId: string | null;
  requestHash: string;
  source: "chat" | "action_approval";
  actionApprovalRef: {
    proposalId: string;
    proposalTurnId: string;
    proposalVersion: number;
  } | null;
  state: ChatTurnState;
  attempt: number;
  executionLease: {
    leaseId: string;
    expiresAt: string;
    heartbeatAt: string;
  } | null;
  inboundCapture: {
    state: "not_started" | "claimed" | "completed" | "retryable_failure";
    leaseId: string | null;
    leaseExpiresAt: string | null;
    outcomeReceiptId: string | null;
  };
  finalResult: PersistedChatTurnResult | null;
  createdAt: string;
  updatedAt: string;
};

export type AiChatRequest = {
  message: string;
  sessionId?: string;
  turnId: string;
  selectedContactId?: string;
  actionApproval?: { proposalId: string; proposalVersion: number; approvalToken: string };
  provider?: string;
  model?: string;
  mode?: "ask" | "plan" | "agent";
  projectId?: string;
};

export type BeginApprovalTurnInput = {
  ownerId: string;
  sessionId: string;
  approvalTurnId: string;
  proposalId: string;
  proposalTurnId: string;
  proposalVersion: number;
};

export type MemoryCandidateSummary = {
  id: string;
  title: string;
  content: string;
  preview: string;
  version: number;
  category?: string;
  importance: number;
  recency: number;
  frequency: number;
  confidence: number;
};

export type PersistedChatTurnResult = {
  answer: string;
  sources: SourceDocument[];
  confidence: AnswerConfidence;
  verification: AnswerVerification;
  sessionId: string;
  turnId: string;
  memoryStatus: string;
  memoryCandidates: MemoryCandidateSummary[];
};
```

`ChatMessageRecord`에는 `ordinal`, `turn_id`, `volatile_source_json`, `volatile_summary`를 추가하고 legacy row는 session 내 `(created_at,id)` 순으로 ordinal을 한 번 backfill한다.

- [ ] **Step 4: atomic turn repository 구현**

`chat.repository.ts`의 기존 session/message API를 유지하면서 `readChatStore`/`mutateChatStore` locked primitive로 내부 구현을 통합한다. `chat-turn.repository.ts`는 같은 store transaction 위에 아래 signature를 구현한다.

```ts
export function beginTurn(input: BeginTurnInput): Promise<BeginTurnResult>;
export function beginApprovalTurn(input: BeginApprovalTurnInput): Promise<BeginTurnResult>;
export function heartbeatTurnExecution(ownerId: string, turnId: string, leaseId: string, now: Date): Promise<void>;
export function completeTurn(input: CompleteTurnInput): Promise<ChatTurnRecord>;
export function failTurn(ownerId: string, turnId: string, leaseId: string, errorCode: string): Promise<ChatTurnRecord>;
export function getTurnStatus(ownerId: string, turnId: string): Promise<ChatTurnStatusView | null>;
export function listRecentSessionMessages(ownerId: string, sessionId: string, limit?: number): Promise<ChatMessageRecord[]>;
```

`listRecentSessionMessages`는 omitted limit을 20으로 default하고 1–20만 허용한다. new session 생성과 turn/user message 저장은 같은 lock/write다. immutable `requestHash`가 message/requested session과 함께 저장되어 같은 turn ID의 다른 request는 `409 TURN_REQUEST_MISMATCH`다. `beginTurn`은 `started | completed | in_progress` discriminated result를 반환한다. 새/failed attempt는 random execution lease를 갖고, generating retry는 unexpired lease면 in-progress, expired lease면 같은 session/user message/ordinal을 보존하고 attempt+새 lease로 `started` reclaim된다. route/service는 30초 heartbeat로 2분 lease를 연장한다. `heartbeatTurnExecution`, `completeTurn`, `failTurn`은 current lease ID를 CAS해 stale worker를 fence한다. failed retry는 같은 session/user message/ordinal을 재사용하고 attempt만 증가시킨다. inbound memory 재실행 여부는 irreversible attempted boolean이 아니라 Task 4의 persisted lease/outcome state가 결정한다. normal turn은 `actionApprovalRef: null`; `beginApprovalTurn`은 raw token 없이 `{ proposalId, proposalTurnId, proposalVersion }` binding과 token-free control message를 같은 transaction에 만들고 current proposal version과 approval/proposal turn 구분을 검증한다. complete는 expected `generating` state, current lease와 assistant message 부재를 확인한 뒤 message와 finalResult를 같이 쓰고 lease를 비운다. partial token은 repository에 쓰지 않는다.

- [ ] **Step 5: turn tests와 타입 검사**

Run: `npm.cmd test`

Expected: new-session retry, stale-generating reclaim/fencing, completed replay, owner isolation, stable ordinal 테스트 통과.

Run: `npm.cmd run typecheck`

Expected: chat record legacy normalize와 turn input 타입 오류 없음.

- [ ] **Step 6: turn repository 커밋**

```powershell
git add src/lib/chat/chat.types.ts src/lib/ai/chat-turn.types.ts src/lib/db/repositories/chat.repository.ts src/lib/db/repositories/chat-turn.repository.ts tests/chat-turn-idempotency.test.ts tests/owner-scoped-chat.test.ts
git commit -m "feat: add idempotent AI chat turns"
```

---

### Task 2: relevance policy, owner document search와 conversation summary 구현

**Files:**

- Create: `src/lib/ai/context/personal-context.types.ts`
- Create: `src/lib/ai/context/relevance-policy.ts`
- Create: `src/lib/ai/context/owner-document-search.ts`
- Create: `src/lib/ai/context/conversation-summary.ts`
- Modify: `src/lib/ai/question-classifier.ts`
- Modify: `src/lib/db/repositories/chat.repository.ts`
- Create: `tests/ai-context-foundation.test.ts`
- Modify: `tests/question-classifier.test.ts`

**Interfaces:**

- Consumes: Task 1 turn/message ordinal, `listKnowledgeNotes(ownerId)`, `listFileRecords(ownerId)`.
- Produces: `classifyContextNeeds`, `AiContextState`, `searchOwnerDocuments`, summary read/update job and safe volatile-history handling.

- [ ] **Step 1: 실패하는 relevance·owner isolation·summary 테스트 작성**

```ts
assert.deepEqual(classifyContextNeeds("안녕하세요", null), {
  crmMode: "none",
  erpMode: "none",
  needsDocuments: false
});
assert.equal(classifyContextNeeds("이번 달 매출은?", null).erpMode, "dashboard");
assert.equal(classifyContextNeeds("김민수 미수금", null).erpMode, "customer");
assert.equal(classifyContextNeeds("후속 연락 필요한 고객 수", null).crmMode, "aggregate");
```

추가 assertion:

- verified selectedContactId는 contact mode지만 owner 검증 전에는 ID를 context에 넣지 않는다.
- owner A document search에 owner B note/file가 없다.
- personal search 구현 source에 `hybridSearch(` import/call이 없다.
- 20 recent messages는 ordinal 순이고 current user message가 한 번만 있다.
- 30 messages 이하에는 summary job이 없다. 초과 후 completed turn마다 10-message batch만 처리한다.
- volatile ERP answer는 exact amount/status 대신 `ERP live data was discussed; refresh required.` topic marker만 summary input에 들어간다.
- summary update conflict는 previous version을 보존한다.
- 기존 `tests/question-classifier.test.ts`의 exact execution-plan fixture는 additive `personalContext: { crmMode, erpMode, needsDocuments }`를 포함하도록 갱신하고 기존 web/mode classification assertion은 유지한다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: context foundation modules 부재로 실패한다.

- [ ] **Step 3: context mode와 source 타입 구현**

```ts
export type ContextNeeds = {
  crmMode: "none" | "aggregate" | "contact";
  erpMode: "none" | "dashboard" | "customer";
  needsDocuments: boolean;
};

export type AiContextState = {
  crm: "aggregate" | "resolved" | "ambiguous" | "not_found" | "unavailable" | "not_requested";
  erp: "dashboard" | "available" | "not_configured" | "not_mapped" | "unavailable" | "not_requested";
};

export type AiContextSource = SourceDocument & {
  id: string;
  kind: "web" | "memory" | "crm" | "erp" | "knowledge" | "file" | "conversation_summary";
  sourceId: string;
  section: string | null;
  asOf: string | null;
  stale: boolean | null;
  authority: "live_erp" | "crm" | "approved_memory" | "conversation" | "document" | "web";
};

export type ConversationSummary = {
  ownerId: string;
  sessionId: string;
  summary: string;
  throughMessageId: string;
  throughOrdinal: number;
  sourceMessageCount: number;
  version: number;
  updatedAt: string;
};
```

`classifyContextNeeds`는 server-owned allowlisted patterns와 selected contact presence만 사용한다. CRM/ERP temporal wording을 기존 generic current/today web 분류보다 먼저 판정하고 `getChatExecutionPlan`에 `personalContext`를 additive하게 붙인다. 이 분류는 읽기 최소화 gate이며 mutation permission을 부여하지 않는다. `AiContextSource`는 기존 `SourceDocument` fields를 유지하므로 기존 source renderer가 깨지지 않는다.

- [ ] **Step 4: owner document search 구현**

`searchOwnerDocuments(ownerId, query, limit = 8)`는 두 owner-scoped repository를 병렬 읽고 normalized token overlap을 계산한다. 반환 excerpt는 title 200, preview 800, 전체 8개로 제한한다. raw file path/storage key/owner ID를 반환하지 않는다.

- [ ] **Step 5: summary repository와 post-turn job 구현**

`getConversationSummary`와 `updateConversationSummaryCas`를 chat store에 추가한다. `scheduleConversationSummaryUpdate`는 completed turn 뒤에만 실행하고 summarizer dependency를 주입한다. system prompt는 explicit facts만 compress하고 live ERP value/mapping/action permission을 금지한다. volatile message는 `volatile_summary`만 전달한다.

- [ ] **Step 6: foundation tests와 타입 검사**

Run: `npm.cmd test`

Expected: relevance, owner document isolation, recent window, summary version tests 통과.

Run: `npm.cmd run typecheck`

Expected: context source/summary 타입 오류 없음.

- [ ] **Step 7: context foundation 커밋**

```powershell
git add src/lib/ai/context src/lib/ai/question-classifier.ts src/lib/db/repositories/chat.repository.ts tests/ai-context-foundation.test.ts tests/question-classifier.test.ts
git commit -m "feat: add owner aware AI context foundation"
```

---

### Task 3: CRM·ERP·memory adapter와 bounded personal context builder 구현

**Files:**

- Create: `src/lib/ai/context/crm-context.ts`
- Create: `src/lib/ai/context/erp-context.ts`
- Create: `src/lib/ai/context/document-context.ts`
- Create: `src/lib/ai/context/context-budget.ts`
- Create: `src/lib/ai/context/build-personal-context.ts`
- Modify: `src/lib/memory/approved-memory-context.ts`
- Create: `tests/ai-personal-context.test.ts`

**Interfaces:**

- Consumes: CRM dashboard/contact/mapping services, ERP dashboard/read provider, approved memories, Task 2 owner docs.
- Produces: side-effect-free `buildPersonalContext` shared by both chat transports.

- [ ] **Step 1: 실패하는 aggregate/contact/mapping/budget 테스트 작성**

```ts
const context = await buildPersonalContext({
  ownerId: "owner-a",
  sessionId: "session-a",
  turnId: "turn-a",
  message: "김민수 고객의 미수금",
  selectedContactId: null,
  now: new Date("2026-07-15T03:00:00.000Z")
}, dependencies);
assert.equal(context.state.crm, "resolved");
assert.equal(context.state.erp, "available");
assert.equal(context.erpCustomer?.mappingVersion, 3);
assert.equal(context.sources.some((source) => source.kind === "erp"), true);
```

추가 fixture assertions:

- general question은 CRM/ERP/document dependency call count가 0이다.
- CRM aggregate와 ERP dashboard question은 contact를 만들거나 추측하지 않는다.
- duplicate name은 choices를 반환하고 mapping/ERP call count가 0이다.
- CRM repository/service failure는 `state.crm = "unavailable"`과 safe warning으로 degrade하고 CRM current fact나 mutation proposal을 만들지 않는다.
- selected contact, exact email/phone, exact name+company만 contact resolve 가능하다.
- no mapping/revoked/wrong connection revision은 `not_mapped`/`unavailable`이고 exact ERP call이 없다.
- live context에는 mapping ID/version, connection revision, site/company/customer ID, currency/asOf/stale/warning이 있다.
- orders/invoices 10, payments 5, warnings 8 max다.
- approved same-owner/entity memory만 최대 6개·2400 chars다.
- total retrieved context 16000 chars, structural envelope 2000 chars를 넘지 않는다.
- trim order와 필수 ID/currency/asOf/warning 보존을 확인한다.
- delimiter-like note content가 JSON untrusted block 밖으로 나오지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: CRM/ERP adapters와 builder export 부재로 실패한다.

- [ ] **Step 3: CRM과 ERP adapter 구현**

`crm-context.ts`는 mode별로 `CrmDashboardSnapshot` 또는 bounded contact projection을 반환한다. ambiguity는 safe `{ id, name, companyName }` choices만 제공한다.

`erp-context.ts`는 dashboard mode에서 `ErpDashboardSnapshot`, customer mode에서 `getMappedAccountContext`만 호출한다. customer financial source title은 `연결된 ERP 고객 계정`이고 개인 채무로 표현하지 않는다. `expectedValueCurrency` mismatch면 comparison field를 null로 둔다.

- [ ] **Step 4: budget와 serialization 구현**

```ts
export const PERSONAL_CONTEXT_BUDGET = {
  total: 16000,
  envelope: 2000,
  recentConversation: 6000,
  summary: 2000,
  memories: 2400,
  crm: 3000,
  erp: 3000,
  documents: 4000
} as const;
```

각 block을 schema object로 먼저 trim한 뒤 `JSON.stringify`한다. trim order는 낮은 document, summary가 대표하는 오래된 recent message, 낮은 memory, 오래된 ERP list row다. system/current message/answer reserve 25%는 provider adapter가 별도로 확보한다.

- [ ] **Step 5: personal context builder 구현**

```ts
export function buildPersonalContext(
  input: BuildPersonalContextInput,
  dependencies?: PersonalContextDependencies
): Promise<PersonalContext>;
```

순서: authorize된 IDs 입력 → recent/summary → approved memories → relevance-selected CRM → selected ERP branch → owner documents → bounded JSON blocks/source manifest. 함수는 summary update, memory save, action proposal 같은 side effect를 만들지 않는다.

- [ ] **Step 6: context tests와 타입 검사**

Run: `npm.cmd test`

Expected: relevance call counts, ambiguity, mapping, zero/null, owner scope, budget, injection tests 통과.

Run: `npm.cmd run typecheck`

Expected: CRM/ERP shared type와 context state 오류 없음.

- [ ] **Step 7: personal context 커밋**

```powershell
git add src/lib/ai/context src/lib/memory/approved-memory-context.ts tests/ai-personal-context.test.ts
git commit -m "feat: build CRM and ERP AI context"
```

---

### Task 4: deterministic immediate memory policy 구현

**Files:**

- Modify: `src/lib/memory/memory.types.ts`
- Create: `src/lib/memory/auto-memory-policy.ts`
- Create: `src/lib/memory/capture-inbound-user-memory.ts`
- Modify: `src/lib/memory/memory-repository.ts`
- Modify: `src/lib/memory/memory-lifecycle.ts`
- Modify: `src/lib/ai/chat-turn.types.ts`
- Modify: `src/lib/db/repositories/chat-turn.repository.ts`
- Modify: `tests/memory-lifecycle.test.ts`
- Create: `tests/immediate-memory-policy.test.ts`

**Interfaces:**

- Consumes: Task 3 resolved entity, Task 1 user message ID, CRM plan's canonical `MemoryEntityLink`, `claimContactChildWriteLease`/parent recheck/completion fence.
- Produces: `captureInboundUserMemory`, `captureVerifiedActionMemory`, `MemoryCaptureOutcome` without weakening existing pending/manual lifecycle.

- [ ] **Step 1: 실패하는 threshold·sensitivity·dedup 테스트 작성**

```ts
const outcome = await captureInboundUserMemory({
  ownerId: "owner-a",
  sessionId: "session-a",
  turnId: "turn-a",
  userMessageId: "message-a",
  message: "앞으로 보고서는 항상 한국어로 작성해줘",
  resolvedEntity: { entityType: "user", entityId: null }
});
assert.equal(outcome.status, "auto_saved");
assert.equal(outcome.items[0].autoSaveKind, "user_preference");
```

추가 assertion:

- importance 0.79 또는 confidence 0.84는 pending이다.
- `model_candidate`는 0.99/0.99여도 pending이다.
- API key, password, 주민/카드/계좌 식별자는 pending content에도 없다.
- live ERP amount와 mapping approval은 not_saved다.
- unresolved contact fact는 pending이다.
- inbound follow-up은 intended obligation이지 CRM `nextContactAt` fact가 아니다.
- relationship change는 verified action result에서만 auto saved다.
- same owner/entity/predicate/value duplicate는 no-op/frequency update다.
- same predicate different value는 pending conflict이고 기존 approved를 덮지 않는다.
- auto approval actor는 policy version이며 owner ID가 아니다.
- edit/forget 후 stale embedding/Markdown이 recall되지 않는다.
- same turn retry가 memory를 중복하지 않는다.
- capture lease claim 뒤 memory write 전 process가 종료되면 lease 만료 후 같은 turn retry가 capture를 다시 수행한다.
- memory record/receipt commit 뒤 turn outcome 저장 전 process가 종료되면 같은 idempotency key가 기존 receipt를 반환하고 turn을 completed로 마무리한다.
- contact-linked capture를 memory store에 pending stage한 직후 contact가 삭제되면 parent recheck/activation이 실패하고 cleanup job이 staged memory를 forget한다. 어떤 AI memory read에도 노출되지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: immediate policy/capture exports와 metadata fields 부재로 실패한다.

- [ ] **Step 3: memory metadata와 result type 구현**

```ts
export type MemoryAutoSaveKind =
  | "user_preference" | "long_term_goal" | "confirmed_decision"
  | "customer_commitment" | "follow_up"
  | "relationship_change" | "meeting_conclusion";
export type MemoryExtractionMethod =
  | "deterministic_explicit" | "model_candidate" | "verified_action";

export type MemoryCaptureOutcome = {
  status: "auto_saved" | "pending" | "not_saved" | "failed";
  items: Array<{
    memoryId: string | null;
    autoSaveKind: MemoryAutoSaveKind | null;
    reasonCode: string;
  }>;
};

export type InboundMemoryCapture = {
  state: "not_started" | "claimed" | "completed" | "retryable_failure";
  leaseId: string | null;
  leaseExpiresAt: string | null;
  outcomeReceiptId: string | null;
  outcome: MemoryCaptureOutcome | null;
};
```

기존 `MemoryEntityLink`/`MemoryApprovalMode`를 재정의하지 않고 candidate/memory에 `normalizedPredicate`, `normalizedValue`, `approvalActor`, `policyVersion`, `autoSaveKind`, `extractionMethod`를 추가한다. Legacy manual approval은 `user_approved`, actor owner로 normalize한다. user/project link는 normal receipt path를 쓰고, contact link capture는 CRM child-write lease와 memory `parentFenceState: "pending"` stage를 반드시 사용한다. active-parent 단일 precheck만으로 저장하지 않는다.

- [ ] **Step 4: deterministic policy 구현**

Sensitivity filter를 extraction보다 먼저 실행한다. explicit Korean/English preference, long-term goal, confirmed decision, promise, follow-up obligation, meeting conclusion patterns만 deterministic kind로 반환한다. score는 server rule로 계산하고 LLM score를 auto approval 경계에 사용하지 않는다.

dedup key는 SHA-256 of `{ ownerId, entityType, entityId, normalizedPredicate, normalizedValue }`다. conflict는 value를 key에서 제외한 predicate lookup으로 감지하되 자동 overwrite하지 않는다.

- [ ] **Step 5: server-only capture와 policy approval 구현**

`captureInboundUserMemory`는 user message provenance를 검증한다. `chat-turn.types.ts`의 `ChatTurnRecord.inboundCapture`를 위 typed state로 확장하고 repository에 `claimInboundMemoryCapture`, `completeInboundMemoryCapture`, `failInboundMemoryCaptureRetryably`를 추가한다. claim은 random lease ID/short expiry를 CAS로 저장한다. active lease는 중복 worker를 막지만 expired `claimed`와 `retryable_failure`는 같은 turn이 다시 claim할 수 있다.

memory repository는 `{ ownerId, turnId, userMessageId }` idempotency key의 `MemoryCaptureReceipt`를 canonical memory record/history mutation과 같은 lock/write에 저장한다. receipt state는 `staged | completed | cancelled`다. user/project candidate 생성 또는 policy approval은 바로 completed receipt와 commit되고, same key 재호출은 bounded stored outcome만 반환한다.

resolved entity가 contact이면 capture는 `claimContactChildWriteLease(expectedParentVersion, operationId)` → memory/receipt `staged` commit → `markContactChildWriteStaged` → `confirmContactChildWriteStillActive` → memory/receipt CAS `completed`/`parentFenceState: "active"` → lease complete 순서다. tombstone/lease conflict는 staged memory를 forgot/cancelled로 바꾸며 `completed` 전에는 recall/list에 절대 포함하지 않는다. verified-action memory도 contact link라면 같은 sequence를 쓴다. CRM cleanup job은 outstanding lease와 staged receipt adapter를 함께 정리한다.

embedding/Markdown은 completed receipt의 canonical memory/version을 기준으로 별도 idempotent derived rebuild를 수행하므로 core commit gap을 만들지 않는다. 따라서 crash가 memory commit 뒤 turn completion 전에 나도 retry가 receipt를 회수해 parent fence를 끝내거나 cancel한 뒤 `completeInboundMemoryCapture`를 마무리하고, claim 뒤 write 전에 나면 lease 만료 뒤 실제 capture를 수행한다. `approvedBy`는 `policy:auto-memory:v1`, `approvalActor`도 policy로 기록한다. 기존 `captureConversationMemory`와 external/MCP/manual route는 계속 pending만 만든다.

`captureVerifiedActionMemory`는 succeeded action ID와 audited result만 provenance로 허용한다.

- [ ] **Step 6: memory tests와 타입 검사**

Run: `npm.cmd test`

Expected: immediate safe save, pending conflict, secret exclusion, retry idempotency와 기존 pending/manual lifecycle 테스트 통과.

Run: `npm.cmd run typecheck`

Expected: memory normalization/history/embedding 타입 오류 없음.

- [ ] **Step 7: immediate memory 커밋**

```powershell
git add src/lib/memory src/lib/ai/chat-turn.types.ts src/lib/db/repositories/chat-turn.repository.ts tests/memory-lifecycle.test.ts tests/immediate-memory-policy.test.ts
git commit -m "feat: save important safe memory immediately"
```

---

### Task 5: shared prepare·execute·finalize pipeline으로 normal/stream route 통합

**Files:**

- Create: `src/lib/ai/chat-turn.service.ts`
- Create: `src/lib/ai/chat-execution.service.ts`
- Modify: `src/lib/ai/chat-turn.types.ts`
- Modify: `src/lib/ai/graph/chat-graph.ts`
- Modify: `app/api/ai/chat/route.ts`
- Modify: `app/api/ai/chat/stream/route.ts`
- Create: `app/api/ai/turns/[turnId]/route.ts`
- Modify: `components/Chat/ChatView.tsx`
- Modify: `src/lib/ai/prompts.ts`
- Modify: `tests/chat-flow.test.ts`
- Modify: `tests/chat-mode-server.test.ts`
- Modify: `tests/owner-scoped-chat.test.ts`
- Modify: `tests/client-api-resilience.test.ts`
- Modify: `tests/auth-and-ui-contract.test.ts`
- Modify: `tests/approved-memory-recall.test.ts`
- Modify: `tests/web-search-degradation.test.ts`
- Create: `tests/ai-chat-turn-pipeline.test.ts`

**Interfaces:**

- Consumes: Tasks 1–4 turn/context/memory services and existing provider/web/quality/mode branches.
- Produces: one shared semantic execution path with non-stream JSON and stream SSE adapters.

- [ ] **Step 1: 실패하는 parity·compatibility·retry 테스트 작성**

dependency-injected pipeline fixture로 같은 request의 normal/stream result를 비교한다.

```ts
assert.equal(normal.answer, streamed.done.answer);
assert.deepEqual(normal.sources, streamed.done.sources);
assert.deepEqual(normal.contextState, streamed.done.contextState);
assert.equal(streamed.events.some((event) => event.name === "delta"), true);
assert.equal("memoryCandidates" in streamed.done, true);
```

추가 assertion:

- missing/invalid UUID turnId는 400이다.
- same completed turn retry는 provider call 없이 persisted answer를 반환한다.
- stream disconnect가 second assistant message나 memory capture를 만들지 않는다.
- memory persistence 실패도 answer/done을 반환하고 `memoryResult.status=failed`다.
- summary job은 completed 후에만 schedule된다.
- web/quality/ask/plan/agent mode가 기존 source/confidence behavior를 유지한다.
- personal local path는 ownerless hybridSearch를 호출하지 않는다.
- raw ERP/context text가 system instruction으로 연결되지 않는다.
- production `ChatView`는 최초 send에 UUID turnId를 넣고 failed network/server retry에는 같은 turnId를 재사용한다. 새 사용자 의도에는 새 ID를 쓴다.
- 기존 auth/UI source contract는 route-local `ensureSession`/`saveAssistantExchange` 호출 대신 shared `prepareChatTurn`/`finalizeChatTurn` 사용을 검증한다.
- 기존 `approved-memory-recall.test.ts`와 `web-search-degradation.test.ts`가 route 파일 내부 helper/import 문자열에 직접 결합되지 않고 shared execution service의 approved-memory 주입과 web 실패 degradation 결과를 runtime으로 검증한다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: shared turn services 부재와 route parity assertion으로 실패한다.

- [ ] **Step 3: prepare/finalize 구현**

이 단계에서 Task 1의 기존 field 묶음을 `PersistedChatTurnBaseResult`로 rename하고 persisted safe result 자체를 아래처럼 원자적으로 확장한다. `AiChatResult`를 같은 shape의 alias로 두며 `completeTurn.finalResult`, completed replay와 turn-status GET이 모두 context/freshness/memory/warnings를 보존한다. Task 6은 이 token-free persisted shape에 safe `actionProposal`/`actionResult`만 추가한다.

```ts
export type PersistedChatTurnResult = PersistedChatTurnBaseResult & {
  sources: AiContextSource[];
  contextState: AiContextState;
  memoryResult: MemoryCaptureOutcome;
  warnings: string[];
};

export type AiChatResult = PersistedChatTurnResult;
```

```ts
export function prepareChatTurn(
  input: { owner: OwnerContext; request: AiChatRequest; transport: "json" | "sse" },
  dependencies?: ChatTurnDependencies
): Promise<PreparedChatTurn | CompletedChatTurn | InProgressChatTurn>;

export function finalizeChatTurn(
  prepared: PreparedChatTurn,
  generated: GeneratedChatTurn,
  dependencies?: ChatTurnDependencies
): Promise<AiChatResult>;

export function failPreparedChatTurn(
  prepared: PreparedChatTurn,
  error: unknown,
  dependencies?: ChatTurnDependencies
): Promise<void>;
```

prepare는 body validate → begin/reclaim turn → completed/in-progress replay check → side-effect-free context → sensitivity precheck와 inbound-capture lease claim → mode/intent execution input 순서다. `PreparedChatTurn`은 current execution lease ID를 가지며 service는 finalize/fail까지 30초 heartbeat를 유지한다. 모든 turn write는 그 lease로 fence되고 heartbeat를 잃은 old worker의 late write는 거부된다. claim된 `captureInboundUserMemory` promise는 model generation과 독립적으로 즉시 시작하고 transport AbortSignal에 묶지 않는다. normal response와 stream `done`은 capture outcome을 기다리며 stream은 완료 즉시 `memory_result`를 emit한다. 따라서 client가 stream을 끊어도 현재 process가 살아 있는 동안 중요한 safe 정보 저장은 계속되고 model/finalize 성공에 의존하지 않는다. process failure 뒤 same-turn retry는 stale execution lease를 reclaim한 다음 Task 4의 expired memory lease/retryable state와 memory receipt로 안전하게 resume한다. capture failure는 typed `memoryResult.status="failed"`로 기록하되 answer generation은 계속한다. completed receipt가 있으면 다시 추출하지 않고, 미완료 lease만 recovery policy에 따라 재개한다. finalize는 assistant message/metadata와 complete token-free snapshot을 current execution lease로 한 번 저장한 뒤 summary job과 기존 model-based `captureConversationMemory` pending-only job을 turn ID idempotency key로 schedule한다. response의 `memoryCandidates`는 즉시 inbound capture에서 생긴 safe pending items를 포함하고, post-completion model candidates는 Memory 화면에 나중에 나타나며 자동 승인되지 않는다. transport abort/exception은 current lease의 `failPreparedChatTurn`으로 same turn을 failed로 남기며 partial assistant text를 저장하거나 memory evidence로 쓰지 않는다.

- [ ] **Step 4: shared generation service 구현**

`executePreparedChatTurn(prepared, { onStatus, onDelta })`가 quality/web/local/general/mode branch를 단일 구현한다. normal은 callback 없이 결과를 받고, stream은 기존 event names로 callback을 serialize한다. `runChatGraph`는 already-built messages/sources를 받고 더 이상 ownerless `hybridSearch`나 prompt/context rebuild를 하지 않는다. model input은 structured untrusted context block을 `prompts.ts`의 한 함수로만 추가한다.

- [ ] **Step 5: 두 route를 thin transport로 변경**

normal response는 기존 `apiSuccess` wrapper와 data fields를 유지하고 `turnId`, `contextState`, `memoryResult`, `warnings`를 `data`에 추가한다. stream은 `context`, `memory_result` event를 추가하되 `delta`와 `done` payload를 유지한다. action proposal metadata/event는 typed action contract가 생기는 Task 6에서 additive하게 연결한다. error body/event는 `toClientAIError` stable code만 사용한다. `GET /api/ai/turns/[turnId]`는 owner-scoped safe status/completed result만 반환하고 partial text/internal errors는 반환하지 않는다.

같은 커밋에서 유일한 production caller `ChatView`가 request마다 required `turnId`를 보내도록 최소 request/retry state를 변경한다. 새 send는 `crypto.randomUUID()`, 동일 failed turn retry는 기존 ID를 재사용한다. Task 8까지 기다리는 compatibility hole을 두지 않으며, 이 단계에서는 오른쪽 panel/action UI를 추가하지 않는다. owner-scoped chat request fixtures와 removed route-local persistence를 검사하던 auth/UI contract도 shared pipeline 계약으로 함께 전환한다. `approved-memory-recall.test.ts`와 `web-search-degradation.test.ts`는 더 이상 `route.ts`의 private helper를 import하거나 source 문자열로 찾지 않고 `chat-execution.service.ts`의 public dependency-injected pipeline을 실행해 같은 사용자-visible behavior를 검증한다.

- [ ] **Step 6: pipeline tests와 타입 검사**

Run: `npm.cmd test`

Expected: normal/stream parity, completed replay, existing answer/delta/done contracts 통과.

Run: `npm.cmd run typecheck`

Expected: route body, callback, final result 타입 오류 없음.

- [ ] **Step 7: shared chat pipeline 커밋**

```powershell
git add src/lib/ai/chat-turn.types.ts src/lib/ai/chat-turn.service.ts src/lib/ai/chat-execution.service.ts src/lib/ai/prompts.ts src/lib/ai/graph/chat-graph.ts app/api/ai/chat/route.ts app/api/ai/chat/stream/route.ts app/api/ai/turns/[turnId]/route.ts components/Chat/ChatView.tsx tests/chat-flow.test.ts tests/chat-mode-server.test.ts tests/owner-scoped-chat.test.ts tests/client-api-resilience.test.ts tests/auth-and-ui-contract.test.ts tests/approved-memory-recall.test.ts tests/web-search-degradation.test.ts tests/ai-chat-turn-pipeline.test.ts
git commit -m "refactor: unify AI chat turn execution"
```

---

### Task 6: CRM business action proposal·approval·execution 구현

**Files:**

- Create: `src/lib/ai/actions/action.types.ts`
- Create: `src/lib/ai/actions/action.schemas.ts`
- Create: `src/lib/ai/actions/action.repository.ts`
- Create: `src/lib/ai/actions/action-policy.ts`
- Create: `src/lib/ai/actions/action.service.ts`
- Modify: `src/lib/crm/crm.types.ts`
- Modify: `src/lib/crm/crm.repository.ts`
- Modify: `src/lib/crm/crm-contact.service.ts`
- Create: `src/lib/crm/crm-idempotent-mutation.service.ts`
- Modify: `src/lib/db/repositories/chat-turn.repository.ts`
- Modify: `src/lib/ai/chat-turn.types.ts`
- Modify: `src/lib/ai/chat-turn.service.ts`
- Modify: `src/lib/ai/chat-execution.service.ts`
- Create: `app/api/ai/actions/[id]/approve/route.ts`
- Create: `app/api/ai/actions/[id]/cancel/route.ts`
- Create: `app/api/ai/actions/[id]/approval-token/route.ts`
- Create: `app/api/ai/actions/[id]/route.ts`
- Create: `tests/ai-crm-actions.test.ts`
- Modify: `tests/ai-chat-turn-pipeline.test.ts`

**Interfaces:**

- Consumes: CRM Task 1 CAS/create/activity methods and Task 5 chat turns.
- Produces: discriminated proposals, one-time token approval, CRM execution audit and verified-action memory input.

- [ ] **Step 1: 실패하는 no-mutation-before-approval·replay 테스트 작성**

```ts
const proposed = await proposeAction({
  ownerId: "owner-a",
  sessionId: "session-a",
  proposalTurnId: "turn-proposal",
  action: {
    kind: "crm.follow_up.set",
    nextContactAt: "2026-07-17T01:00:00.000Z",
    timeZone: "Asia/Seoul"
  },
  target: { localContactId: contact.id },
  preconditions: { contactVersion: contact.version }
});
assert.equal((await getActiveCustomer("owner-a", contact.id))?.nextContactAt, null);
```

추가 assertion:

- raw token은 create response에만 있고 repository에는 SHA-256 hash만 있다.
- persisted chat turn/final result와 SSE `done`에는 raw token이 없고 initial JSON response 또는 `action_proposal` event의 transient field로 한 번만 전달된다. completed replay는 token 대신 rotation action을 제공한다.
- owner/session/token/expiry/contact version mismatch는 no mutation이다.
- proposal turn과 approval turn은 다르고 같은 owner/session이어야 한다.
- same approval retry는 one execution result를 반환한다.
- concurrent double approval은 하나만 executing/succeeded다.
- token rotation은 old token을 무효화하고 audit한다.
- create/update/activity/follow-up/stage allowlist만 통과한다.
- CRM delete와 arbitrary fields/URL/method/script는 proposal 단계에서 거부한다.
- text `응` without attached actionApproval metadata는 실행하지 않는다.
- succeeded action만 verified action memory provenance가 된다.
- CRM mutation이 commit된 직후 action result 저장 전에 process가 종료되어도 retry는 같은 operation receipt를 회수하고 contact/activity를 중복 생성하지 않는다.
- proposal이 `executing` lease를 얻은 직후 mutation/ERP attempt 전 process가 종료되면 expired lease recovery가 CRM은 같은 operation ID로 재개하고 ERP는 attempt state에 따라 safe branch를 선택한다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: action repository/service/routes 부재로 실패한다.

- [ ] **Step 3: discriminated action 계약 구현**

```ts
export type CrmAiAction =
  | { kind: "crm.contact.create"; fields: CustomerCreateInput }
  | { kind: "crm.contact.update"; fields: CustomerEditablePatch }
  | { kind: "crm.activity.create"; activityType: CrmActivityType; title: string; body: string }
  | { kind: "crm.follow_up.set"; nextContactAt: string; timeZone: string }
  | { kind: "crm.relationship_stage.set"; relationshipStage: CustomerRelationshipStage };

export type AiActionStatus =
  | "proposed" | "approved" | "executing" | "succeeded"
  | "failed" | "outcome_unknown" | "expired" | "cancelled";

export type AiActionKind = CrmAiAction["kind"]
  | "erp.quotation.create_draft"
  | "erp.sales_order.create_draft";

export type AiActionExecutionLease = {
  leaseId: string;
  attempt: number;
  expiresAt: string;
  heartbeatAt: string;
};

export type AiActionProposalView = {
  id: string;
  version: number;
  kind: AiActionKind;
  status: AiActionStatus;
  summary: string;
  preview: Array<{ label: string; value: string }>;
  warnings: string[];
  expiresAt: string;
  canApprove: boolean;
  canRotateToken: boolean;
};

export type AiActionResultView = {
  proposalId: string;
  kind: AiActionKind;
  status: Extract<AiActionStatus,
    "succeeded" | "failed" | "outcome_unknown" | "expired" | "cancelled">;
  summary: string;
  entityRefs: Array<{ kind: "crm_contact" | "crm_activity" | "erp_draft"; id: string }>;
  completedAt: string | null;
  needsManualReview: boolean;
};

export type TransientActionApproval = {
  proposalId: string;
  proposalVersion: number;
  approvalToken: string;
};

export type AiChatTransportResult = PersistedChatTurnResult & {
  transientActionApproval: TransientActionApproval | null;
};
```

Zod discriminated schema는 CRM plan이 export한 canonical `CustomerCreateInput`/`CustomerEditablePatch` validator를 조합하며 정확히 CRM create/update/activity/follow-up/stage와 ERP quotation/sales-order draft의 일곱 kind만 표현한다. 별도 editable-field 사본을 만들지 않는다. Task 6 executor는 먼저 CRM 다섯 kind만 활성화하고 ERP 두 kind는 Task 7 capability/preflight 전까지 fail closed한다. proposal repository는 owner/session/proposalTurnId/approvalTurnId/action/target/preconditions/permission/idempotencyKey/tokenHash/status/timestamps, monotonic `version`과 execution attempt lease를 typed field로 저장하고 arbitrary record payload를 받지 않는다. 모든 proposal status/token rotation/cancel/approval transition은 expected proposal version CAS이고 성공 시 version을 증가시킨다. safe view의 `preview`, `warnings`, `entityRefs`는 count/문자 길이를 제한하고 owner ID, token/hash, raw provider body, internal error, credential·connection secret을 절대 포함하지 않는다.

- [ ] **Step 4: token과 exact precondition executor 구현**

`randomBytes(32).toString("base64url")` raw token을 한 번 반환하고 `timingSafeEqual`로 hash를 검증한다. approval에서 contact version을 다시 읽고 하나라도 다르면 proposal을 expired로 만든다. action repository는 CAS로 one `AiActionExecutionLease`를 먼저 저장하고 current lease ID로 every status/result write를 fence한다. active lease의 double approval은 in-progress result를 반환한다. expired `executing` lease는 `recoverExpiredActionExecution`이 reclaim한다: CRM action은 receipt가 있으면 finalize하고, 없으면 같은 operation ID/hash로 safe executor를 재개한다. ERP action은 Task 7 attempt가 absent/`prepared`면 재개할 수 있지만 `dispatching`이면 즉시 `outcome_unknown`으로 전환하고 send하지 않는다. status GET과 approval retry가 이 recovery를 실행하므로 proposal이 영구 `executing`에 고착되지 않는다.

CRM executor는 proposal idempotency key를 durable `operationId`로 CRM 계획이 구현한 canonical `executeCrmMutationOnce`에 넘긴다. 이 service와 canonical `CrmMutationReceipt`는 validated normalized command의 create/update/activity/follow-up/stage mutation, audit, safe result를 같은 CRM store lock/write에 commit한다. AI 계층은 별도 receipt type이나 store를 정의하지 않는다. 같은 operation ID+hash retry는 mutation을 다시 호출하지 않고 canonical receipt를 반환하며 hash가 다르면 fail closed한다. action success 저장 전에 process가 죽어도 다음 approval/status recovery가 그 receipt를 읽어 proposal/result/audit를 완성한다.

audit에는 before/after bounded fields와 두 turn ID를 남긴다. shared chat pipeline은 Task 5 persisted token-free result를 `actionProposal: AiActionProposalView | null`, `actionResult: AiActionResultView | null`로 넓힌다. proposal을 처음 만든 non-stream response만 `AiChatTransportResult.transientActionApproval`을 채운다. stream은 `action_proposal` event payload를 정확히 `{ proposal: AiActionProposalView; transientActionApproval: TransientActionApproval }`로 한 번 emit한다. persisted `completeTurn.finalResult`, assistant metadata, logs, SSE `done`, turn-status와 completed replay에는 `transientActionApproval`/raw token이 없고 safe proposal view만 있다. rotation endpoint만 새 `TransientActionApproval`을 한 번 반환한다.

chat request에 valid `actionApproval`이 있으면 `prepareChatTurn`은 ordinary `beginTurn`을 호출하지 않는다. stored proposal을 owner/session/proposal ID/version으로 먼저 읽고 request `turnId`를 distinct `approvalTurnId`로 사용해 `beginApprovalTurn({ ownerId, sessionId, approvalTurnId: request.turnId, proposalId, proposalTurnId, proposalVersion })`을 호출한다. 그 fenced approval turn이 만들어진 뒤에만 token/status/precondition executor를 model generation 전에 실행한다. direct approve route도 같은 repository API를 사용한다. text만 있는 `응`은 아무 mutation도 하지 않는다.

- [ ] **Step 5: authenticated action routes 구현**

approve body는 `{ sessionId, approvalTurnId, approvalToken, expectedVersion }`, cancel/rotate는 `{ sessionId, expectedVersion }`를 받는다. direct approve route는 Task 1 repository의 `beginApprovalTurn`로 별도 turn을 owner/session/proposal/version에 bind하고 `proposalTurnId !== approvalTurnId`를 검증한다. 모든 route는 authenticated owner와 stored session을 검증한다. status/token transition은 expectedVersion CAS이고 409 응답에 latest safe proposal view를 포함한다. GET은 `sessionId` query를 요구하고 expired execution lease recovery를 먼저 실행한 뒤 raw token/hash/internal error를 제거한 versioned view만 반환한다.

- [ ] **Step 6: CRM action tests와 타입 검사**

Run: `npm.cmd test`

Expected: no-before-approval, replay, concurrent approval, post-lease/pre-mutation crash reclaim, post-mutation crash receipt recovery, stale lease fencing, CAS expiry, owner isolation 테스트 통과.

Run: `npm.cmd run typecheck`

Expected: discriminated switch exhaustiveness와 route params 타입 오류 없음.

- [ ] **Step 7: CRM actions 커밋**

```powershell
git add src/lib/ai/actions src/lib/ai/chat-turn.types.ts src/lib/ai/chat-turn.service.ts src/lib/ai/chat-execution.service.ts src/lib/db/repositories/chat-turn.repository.ts src/lib/crm/crm.types.ts src/lib/crm/crm.repository.ts src/lib/crm/crm-contact.service.ts src/lib/crm/crm-idempotent-mutation.service.ts app/api/ai/actions tests/ai-crm-actions.test.ts tests/ai-chat-turn-pipeline.test.ts
git commit -m "feat: add approved CRM AI actions"
```

---

### Task 7: opt-in ERPNext draft actions와 reconciliation 구현

**Files:**

- Modify: `src/lib/erp/erp-connection.repository.ts`
- Modify: `src/lib/erp/erp-connection.service.ts`
- Modify: `src/lib/erp/erp-business-provider.ts`
- Modify: `src/lib/erp/erpnext-business.provider.ts`
- Modify: `src/lib/erp/erp-provider-registry.ts`
- Create: `app/api/business/erp/connections/route.ts`
- Create: `app/api/business/erp/connections/[id]/capabilities/route.ts`
- Create: `src/lib/erp/erpnext-draft.provider.ts`
- Create: `src/lib/erp/erp-draft-execution.repository.ts`
- Modify: `components/integrations/IntegrationCenter.tsx`
- Modify: `components/integrations/KeyCredentialPanel.tsx`
- Modify: `src/lib/ai/actions/action.types.ts`
- Modify: `src/lib/ai/actions/action.service.ts`
- Create: `src/lib/ai/actions/action-reconciliation.ts`
- Create: `tests/ai-erp-draft-actions.test.ts`
- Create: `tests/erp-capability-settings.test.ts`

**Interfaces:**

- Consumes: ERP exact scopes/items/provider, CRM approved mapping, Task 6 proposal/token executor.
- Produces: versioned `draft_write` toggle, exact quotation/sales-order draft payload, unknown-outcome reconciliation.

- [ ] **Step 1: 실패하는 capability·item ambiguity·unknown outcome 테스트 작성**

다음 fixture를 고정한다.

- new connection은 `draft_write` false다.
- capability PATCH는 authenticated owner와 expected capability version을 요구하고 `capabilityVersion`만 증가시킨다. `connectionRevision`과 기존 CRM mapping은 그대로다.
- disabled capability, capability version change 또는 connection identity revision change는 proposal/execution을 거부한다.
- ambiguous free-text item은 choices만 반환하고 proposal을 만들지 않는다.
- itemCode, quantity, UOM, unit price, currency, price list, company, tax template, warehouse, valid/delivery date가 모두 exact preview에 있다.
- proposal builder는 public `getDraftPreflight` read method만 사용하고 internal ERPNext client를 import하지 않으며 create method가 expected fingerprint를 다시 검증한다.
- 1–50 items, quantity > 0, price >= 0, verified currency/UOM을 강제한다.
- mapping/contact/connection/customer/item/default fingerprint 하나라도 바뀌면 expire한다.
- quotation/sales order는 `docstatus=0` draft만 생성한다.
- invoice/payment/submit/cancel/delete/stock/accounting action은 schema 단계에서 거부한다.
- timeout after transmission은 `outcome_unknown`, 같은 payload를 다시 POST하지 않는다.
- draft POST는 ERP plan Task 2의 pinned `ErpNextTransport`에 `{ method: "POST", body }`로만 전달되며 GET-only provider와 동일한 DNS pinning/TLS/redirect/size/abort 경계를 사용한다. direct `fetch`나 사용자 제공 method/path는 없다.
- `dispatching` attempt 저장 뒤 process가 종료되거나 success response 뒤 result commit 전에 종료되어도 stale attempt는 `outcome_unknown`으로 전환되고 POST를 재전송하지 않는다.
- verified ERP custom field `custom_dreamwish_proposal_id`가 target doctype에 존재하고 write/query 가능할 때만 그 exact integration reference로 one found result를 succeeded로 reconcile한다. field가 없으면 unknown outcome은 manual review이고 arbitrary remarks/title에 marker를 숨기지 않는다.
- Integration Center는 connected ERPNext connection에서만 `AI 초안 작성 허용` toggle을 보여주고 explicit risk confirmation 후 `expectedCapabilityVersion`과 `draftWrite`만 PATCH한다.
- authenticated connection GET은 secret/owner ID 없이 connection ID, account label, connection/capability versions와 capability flags를 반환해 `KeyCredentialPanel`이 실제 current value로 toggle을 렌더링한다.
- capability disable과 `prepared → dispatching`을 barrier로 교차 실행한다. disable이 먼저 commit되면 dispatch가 fail closed하고, dispatch가 먼저 commit되면 disable은 `409 DRAFT_DISPATCH_IN_FLIGHT`로 대기해 성공한 disable 뒤 새 bytes가 전송되지 않는다.
- reconnect, per-credential delete와 bulk disconnect도 ERP plan Task 2 identity-mutation journal/barrier를 사용한다. mutation barrier가 먼저면 dispatch가 fail closed하고, dispatch가 먼저면 세 identity mutation 모두 credential을 건드리기 전에 409다.
- current dispatch fence가 있는 success/authoritative failure/outcome-unknown terminal transition만 `dispatching`을 끝낼 수 있고 stale fence나 old worker는 terminal result를 덮지 못한다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: capability route/draft provider/action variants 부재로 실패한다.

- [ ] **Step 3: owner-scoped capability revision 구현**

```ts
export function updateErpConnectionCapabilities(input: {
  ownerId: string;
  connectionId: string;
  expectedCapabilityVersion: number;
  draftWrite: boolean;
  actorId: string;
}): Promise<ErpConnectionIdentity>;
```

ERP foundation의 `ErpCapability`를 재정의하지 않는다. `GET /api/business/erp/connections`는 Automation/ERP 계획의 exact canonical credential·identity 위에 놓인 authenticated owner의 GET-only safe projection이다. credential, owner ID, endpoint authority, base token/header를 제거하며 POST/save/secret/company 변경 권한을 갖지 않는다. save/reconnect/delete는 Connection Management의 공통 verified-credential workflow만 수행한다. capabilities route GET은 one same-owner safe view, PATCH는 `{ expectedCapabilityVersion, draftWrite, riskConfirmed }`만 받고 owner ID를 body에서 받지 않는다. connection repository/service는 capability CAS와 `capabilityVersion` 증가만 수행하며 `connectionRevision`을 바꾸지 않고 AI를 import하지 않는다. reconnect/site/company/credential 변경만 identity revision을 증가시키고 `draft_write`를 false로 reset한다. route orchestration은 disable 성공 후 action service의 해당 connection unexecuted ERP proposals를 expire한다.

`erp-draft-execution.repository.ts`는 connection repository의 같은 owner-document schema와 locked store primitive를 사용해 secret-free `ErpDraftDispatchAttempt`를 보관한다. `prepareErpDraftAttempt`는 `prepared`, `beginErpDraftDispatch`는 exact owner/connection revision/capability version/`draft_write`와 ERP plan Task 2의 `identityMutationOperationId === null`을 재검증하면서 같은 transaction에서 `dispatching`과 random dispatch fence를 저장한다. capability disable과 reconnect/delete/disconnect workflow 시작도 같은 store lock을 사용한다. active non-expired dispatching attempt가 있으면 모두 `409 DRAFT_DISPATCH_IN_FLIGHT`; stale dispatching은 current fence로 먼저 `outcome_unknown` terminal transition을 commit한다. 따라서 permission/identity mutation이 먼저면 begin dispatch가 실패하고, dispatch commit이 먼저면 mutation은 credential/identity 변경 전에 실패한다. prepared proposal/attempt는 disable/reconnect/delete할 수 있으며 이후 dispatch exact revision/capability check가 차단한다.

```ts
export function completeErpDraftAttemptSucceeded(input: {
  ownerId: string;
  attemptId: string;
  dispatchFence: string;
  externalDocType: "Quotation" | "Sales Order";
  externalDocumentId: string;
  docstatus: 0;
}): Promise<ErpDraftDispatchAttempt>;

export function completeErpDraftAttemptFailed(input: {
  ownerId: string;
  attemptId: string;
  dispatchFence: string;
  safeErrorCode: string;
}): Promise<ErpDraftDispatchAttempt>;

export function markErpDraftAttemptOutcomeUnknown(input: {
  ownerId: string;
  attemptId: string;
  dispatchFence: string;
  reasonCode: "TIMEOUT_AFTER_SEND" | "NETWORK_AFTER_SEND" | "STALE_DISPATCH" | "RESPONSE_COMMIT_GAP";
}): Promise<ErpDraftDispatchAttempt>;
```

세 transition은 current `dispatching` state와 exact fence를 같은 lock에서 CAS하고 terminal record를 immutable하게 만든다. `failed`는 bytes 전송 전 실패 또는 ERP가 문서 미생성을 authoritative하게 보장한 거부에만 사용한다. bytes가 전송된 뒤 2xx schema parse 실패, timeout/network 또는 process crash는 `outcome_unknown`이다.

- [ ] **Step 4: exact draft action payload와 preflight 구현**

`action.types.ts`의 이미 schema-locked quotation/sales-order variants에 `ErpDraftLine`과 exact preconditions를 완성한다. proposal은 `connectionRevision`과 `capabilityVersion`을 별도 저장해 approval 때 둘 다 재검증한다. `erp-business-provider.ts`는 `ErpBusinessProvider extends ErpBusinessReadProvider`로 narrow read `getDraftPreflight(scope, request)`와 두 create method를 추가하고 `erpnext-business.provider.ts`가 internal `erpnext-draft.provider.ts`에 위임한다. AI action layer는 internal ERPNext client/provider를 직접 import하지 않는다.

`ErpDraftPreflightRequest`는 draft kind, exact customer, selected item codes/quantities와 local date만 받고 arbitrary query/path가 없다. `ErpDraftPreflight`는 Company defaults/price list/tax/warehouse, verified currency/UOM/unit prices, customer/item/default modified timestamps, optional verified `custom_dreamwish_proposal_id` capability, warnings와 `draftConfigurationFingerprint`만 bounded하게 반환한다. proposal builder는 item search 후 exact code를 골라 이 read method로 preview/preconditions를 만든다. 두 create method는 expected fingerprint와 same exact fields를 받아 immediately re-run the same preflight normalization before dispatch; mismatch면 POST 전 expire한다. DocType metadata에서 optional custom field의 type/write/query capability를 검증해 precondition에 기록하고, 없으면 preview에 `자동 조정 불가` warning을 넣는다. `draftConfigurationFingerprint`는 normalized exact fields SHA-256다.

create는 allowlisted Frappe resource path 하나에만 ERP plan Task 2의 pinned transport `POST`를 사용한다. transport에는 normalized JSON object만 넘기고 direct `fetch`, arbitrary method/path/content-type을 사용하지 않는다. verified custom reference field가 있을 때만 proposal ID를 그 field에 넣고, 없으면 remarks/title/UTM/other business field에 marker를 넣지 않는다. response docstatus가 0이 아니면 success로 취급하지 않는다.

- [ ] **Step 5: unknown outcome와 reconciliation 구현**

provider request 전 connection store에 execution attempt를 `prepared`로 저장하고, bytes 전송 직전에 `beginErpDraftDispatch`가 capability/identity-mutation check와 `dispatching` fence/lease를 한 atomic mutation으로 저장한다. only `prepared` attempt와 returned current dispatch fence만 send할 수 있다. provider response를 받으면 action result를 쓰기 전에 위 fenced terminal API 중 하나를 먼저 commit한다. timeout/network after bytes sent, expired `dispatching` lease, 또는 success response와 terminal-attempt commit 사이 process death는 모두 `outcome_unknown`이며 automatic retry를 막는다. terminal success 뒤 action-result commit 전에 죽으면 recovery가 attempt의 bounded safe result를 읽어 action result를 완성하고 POST하지 않는다. action status/reconciliation/capability-disable/identity-mutation path는 stale dispatching attempt를 current fence로 먼저 unknown terminal로 전환한다. generic action lease가 attempt 생성 전 만료되면 absent branch, attempt 생성 뒤 만료되면 prepared branch만 safe resume한다.

reconciliation은 preflight에서 verified된 exact custom reference가 있을 때만 equality query를 수행해 one matching draft면 succeeded로 바꾼다. 이 read-only query는 current `draft_write` 값이나 capability-only version에 의존하지 않는다. current active connection의 provider/site/company가 attempt와 같으면 새 credential로 조회할 수 있고, site/company identity가 달라졌으면 manual review다. field 없음, none, multiple은 manual review 상태를 유지하고 POST를 재전송하지 않는다.

`IntegrationCenter`는 safe connection GET을 로드해 existing connector selection을 `KeyCredentialPanel`에 전달한다. 실제 connected credential panel이 current `draft_write`와 `capabilityVersion`을 표시하고, 명시적 위험 확인 뒤 PATCH하며 409에서는 최신 safe view를 reload한다.

- [ ] **Step 6: ERP draft tests와 타입 검사**

Run: `npm.cmd test`

Expected: capability, exact preview, draft-only, stale precondition, unknown outcome tests 통과.

Run: `npm.cmd run typecheck`

Expected: read provider와 draft extension/action union 타입 오류 없음.

- [ ] **Step 7: ERP actions 커밋**

```powershell
git add src/lib/erp/erp-connection.repository.ts src/lib/erp/erp-connection.service.ts src/lib/erp/erp-business-provider.ts src/lib/erp/erpnext-business.provider.ts src/lib/erp/erpnext-draft.provider.ts src/lib/erp/erp-draft-execution.repository.ts src/lib/erp/erp-provider-registry.ts app/api/business/erp/connections/route.ts app/api/business/erp/connections/[id]/capabilities/route.ts components/integrations/IntegrationCenter.tsx components/integrations/KeyCredentialPanel.tsx src/lib/ai/actions tests/ai-erp-draft-actions.test.ts tests/erp-capability-settings.test.ts
git commit -m "feat: add approved ERP draft actions"
```

---

### Task 8: AI Chat source/context 오른쪽 panel과 action approval UI 구현

**Files:**

- Modify: `components/Chat/ChatView.tsx`
- Create: `components/Chat/AiContextPanel.tsx`
- Create: `components/Chat/AiSourceList.tsx`
- Create: `components/Chat/AiMemoryResult.tsx`
- Create: `components/Chat/AiActionPreviewCard.tsx`
- Create: `components/Chat/AiActionResultCard.tsx`
- Create: `src/lib/chat/chat-stream-events.ts`
- Modify: `tests/chat-answer-display.test.ts`
- Modify: `tests/client-api-resilience.test.ts`
- Create: `tests/ai-chat-business-ui.test.ts`

**Interfaces:**

- Consumes: Tasks 5–7 additive metadata/events/action routes.
- Produces: desktop right panel/mobile drawer, contact selector, memory result, explicit approve/cancel and free-text approval metadata.

- [ ] **Step 1: 실패하는 additive UI/SSE contract 작성**

정적·pure parser tests로 다음을 고정한다.

- Task 5의 send/retry turn ID contract를 그대로 보존한다: 새 send는 `crypto.randomUUID()`, retry는 failed turn ID 재사용이다.
- optional contact selector sends verified selectedContactId only.
- existing `delta` appends token and `done` finalizes answer unchanged.
- new `context`, `memory_result`, `action_proposal` events update metadata without replacing answer.
- `action_proposal` parser accepts exactly `{ proposal, transientActionApproval }`; `done`/completed replay reject or ignore any raw-token field and keep only the safe versioned proposal.
- source panel shows CRM/ERP/memory/document source, asOf/stale/warning.
- memory result labels four Korean states.
- approval button sends new approvalTurnId + proposal ID + proposal version + raw token.
- one active proposal and text `응` attaches versioned actionApproval; zero/multiple proposal never does.
- raw approval token is not rendered in Markdown/localStorage/log text.
- raw approval token is kept only in an in-memory React ref keyed by proposal ID+version; serializable message/UI state stores only the safe proposal view.
- 1440px right panel, 375px drawer, focus restore, keyboard buttons are present.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: new UI/parser files와 event handlers 부재로 실패한다.

- [ ] **Step 3: stream parser를 독립 모듈로 추출**

`chat-stream-events.ts`에 typed union과 `parseChatSseEvent`를 구현한다. `action_proposal`은 `{ proposal: AiActionProposalView; transientActionApproval: TransientActionApproval }`, `action_result`는 safe `AiActionResultView`만 허용한다. malformed JSON은 existing onError contract를 유지한다. `done` validation은 answer empty string도 valid completion으로 처리하고 sources/confidence/verification/sessionId를 검증하며 approval token/transient field를 serializable done state에 받지 않는다. non-stream parser도 initial `data.transientActionApproval`만 in-memory callback으로 넘긴다.

- [ ] **Step 4: turn/contact/source panel state 구현**

Task 5에서 이미 required `turnId`를 보내는 ChatView request/retry state를 보존하면서 selectedContactId와 optional `{ proposalId, proposalVersion, approvalToken }` actionApproval만 additive하게 붙인다. 새 의도/approval은 새 turn ID를 만들고 failed retry만 기존 ID를 쓴다. contact selector는 `/api/crm/customers?query=<encoded>&page=1&limit=20&sort=name_asc`를 사용하고 owner response만 표시한다. panel은 resolved contact 근거, mapping/account label, freshness, sources, warnings를 section별로 렌더링한다.

- [ ] **Step 5: memory/action cards 구현**

`AiMemoryResult`는 status와 reason code만 표시하고 secret/raw candidate를 표시하지 않는다. `AiActionPreviewCard`는 discriminated action fields를 label-value로 렌더링하며 approve/cancel route를 `expectedVersion`과 함께 호출한다. proposal create response/event의 `TransientActionApproval`은 `useRef<Map<string, { proposalVersion: number; approvalToken: string }>>`에만 보관하고 key도 proposal ID+version으로 구성한다. renderable state, chat message, localStorage, console에는 token을 넣지 않는다. proposal version이 바뀌면 old ref를 즉시 제거한다. completed replay/reload에서 ref가 비었으면 자동 승인하지 않고 사용자가 누르는 `승인 토큰 다시 받기`가 current expectedVersion으로 rotation endpoint를 호출하고 returned transient version/token만 저장한다. 성공/failed/outcome_unknown 결과는 `AiActionResultCard`와 audit reference로 표시한다.

- [ ] **Step 6: UI tests와 타입 검사**

Run: `npm.cmd test`

Expected: existing answer rendering, delta/done parsing, new context/memory/action UI contracts 통과.

Run: `npm.cmd run typecheck`

Expected: SSE union, UiMessage metadata, action view 타입 오류 없음.

- [ ] **Step 7: AI Chat UI 커밋**

```powershell
git add components/Chat src/lib/chat/chat-stream-events.ts tests/chat-answer-display.test.ts tests/client-api-resilience.test.ts tests/ai-chat-business-ui.test.ts
git commit -m "feat: show AI business context and approvals"
```

---

### Task 9: 보안·회귀·브라우저 최종 검증

**Files:**

- Verify all files changed in Tasks 1–8
- Verify only: `components/layout/Sidebar.tsx`
- Verify only: `components/layout/AppShell.tsx`

- [ ] **Step 1: 금지 패턴과 placeholder 검사**

```powershell
Get-ChildItem src\lib\ai\context,src\lib\ai\actions -Recurse -File | Select-String -Pattern 'TODO|TBD|FIXME|ownerId.*body|hybridSearch\('
Select-String -Path components\Chat\*.tsx -Pattern 'approvalToken.*localStorage|apiSecret|apiKey|Authorization'
Select-String -Path app\api\ai\chat\route.ts,app\api\ai\chat\stream\route.ts -Pattern 'addMessage\(|captureConversationMemory\('
```

Expected: direct route persistence, ownerless search, token/credential exposure, placeholder 일치 항목 없음.

- [ ] **Step 2: 전체 자동 검증**

Run: `npm.cmd test`

Expected: 전체 테스트 통과.

Run: `npm.cmd run lint`

Expected: lint 통과.

Run: `npm.cmd run typecheck`

Expected: Tasks 1–8 changed files에는 오류가 없다. 현재 사용자 변경 `src/lib/ai/errors.ts:99-100`의 baseline `AIErrorCode` 오류가 그대로 있으면 정확히 분리 보고하고 이 계획에서 수정하지 않는다.

Run: `npm.cmd run build`

Expected: production build 통과. 환경 변수 부재 실패는 코드 오류와 분리해 기록한다.

- [ ] **Step 3: 브라우저 업무 흐름 검증**

Run `npm.cmd run dev` with an early yield, wait until `http://127.0.0.1:3100` responds, use the in-app browser, and terminate the exact running cell afterward.

다음을 확인한다.

- 일반 인사에서 CRM/ERP source가 없고 기존 답변/stream UX가 유지된다.
- `이번 달 매출`은 ERP dashboard source/asOf를 표시한다.
- 동명 연락처는 선택을 요구하고 mapping 전 미수금을 추측하지 않는다.
- approved mapping 고객 미수금은 계정 수준·currency·asOf로 표시된다.
- 중요 명시적 preference가 즉시 저장됨으로 보이고 secret은 저장되지 않는다.
- follow-up 변경은 preview 전 미변경, approve 후 한 번만 변경된다.
- ERP draft_write off에서 draft가 차단되고 on에서 quotation draft만 생성된다.
- unknown outcome은 재전송 버튼이 없고 reconciliation 안내만 보인다.
- 375/768/1440px에서 source panel/drawer와 approval card가 usable하다.

- [ ] **Step 4: sidebar 불변과 commit 범위 확인**

Run: `git diff fe64c1e -- components/layout/Sidebar.tsx components/layout/AppShell.tsx`

Expected: 출력 없음.

Run: `git status --short`

Expected: 이 계획 외 기존 사용자 변경만 남고 `src/lib/ai/errors.ts`, `.superpowers/`, `h origin main`은 어떤 feature commit에도 포함되지 않는다.

---

## Completion Checklist

- [ ] `(ownerId, turnId)` idempotency와 new-session retry 보장.
- [ ] recent 20 + older summary, stable ordinal, volatile ERP summary exclusion.
- [ ] relevance-gated CRM aggregate/contact와 ERP dashboard/customer context.
- [ ] owner-aware document search와 16000-char bounded untrusted JSON context.
- [ ] deterministic/action-only immediate memory, sensitive/live ERP exclusion, conflict pending.
- [ ] normal/stream shared semantic pipeline과 기존 answer/delta/done 호환.
- [ ] CRM unavailable degradation과 current CRM fact/action proposal 비노출.
- [ ] versioned CRM action proposal, `beginApprovalTurn`, transient one-time token, preconditions/replay protection.
- [ ] persisted result/SSE done/status/replay/log에는 approval token 없음.
- [ ] opt-in draft_write quotation/sales order only, fenced terminal attempt와 outcome_unknown no resend.
- [ ] capability disable/reconnect/delete/disconnect와 dispatch의 공용 identity barrier.
- [ ] right source/context panel, memory result, approval/result cards responsive.
- [ ] owner isolation, partial failure, stale data, source freshness 표시.
- [ ] test/lint/typecheck/build와 end-to-end browser checks 통과.
