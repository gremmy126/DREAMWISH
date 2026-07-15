# CRM Dashboard and Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 DREAMWISH 전역 사이드바와 상단바를 그대로 유지하면서 CRM을 실제로 전환되는 `대시보드 · 연락처` 두 화면으로 교체하고, 소유자 격리·버전 충돌 방지·수동 ERP 고객 연결을 갖춘 연락처 업무 공간을 만든다.

**Architecture:** 현재 `Customer` 저장 엔터티는 호환성을 위해 유지하되 UI에서는 연락처로 표현하고, 관계 단계·통화·버전·감사 필드를 명시적으로 확장한다. 대시보드는 별도 집계 API를 사용하고 연락처는 페이지네이션된 목록·상세 API를 사용해 검색이 집계값을 바꾸지 않게 한다. ERP 고객 연결은 공용 `src/lib/erp` 읽기 provider를 통해 후보 검색과 정확 ID 재검증을 분리하며, 승인된 연결만 실시간 계정 데이터를 조회한다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Tailwind CSS, Lucide React, local JSON/owner-document repositories, existing authentication and memory lifecycle, Node test harness (`scripts/run-tests.mjs`).

## Global Constraints

- `docs/superpowers/specs/2026-07-15-business-suite-delivery-design.md`가 delivery order, product navigation, installer/local-gateway exclusion, immediate-save semantics에서 우선하고 나머지 CRM 상세 계약은 CRM Dashboard and Contacts design이 소유한다.

- `components/layout/Sidebar.tsx`, `components/layout/AppShell.tsx`, 전역 상단바와 전역 workspace ID를 수정하지 않는다.
- CRM 로컬 탭은 정확히 `대시보드 · 연락처` 두 개이며, 탭 선택은 실제로 서로 다른 컴포넌트를 렌더링한다.
- `거래 · 활동 · 이메일 · 보고서 · 설정` CRM 탭과 `PhoneContactImport`를 렌더링하지 않는다.
- “제거”는 navigation/composition과 해당 화면 fetch를 없앤다는 뜻이다. Dashboard/Contact detail의 bounded activity panel, `email_draft` activity type, compatibility activity/task/deal/audit/phone-candidate data와 API는 별도 파괴적 migration 없이 유지한다.
- `Customer`는 호환 저장 엔터티이고 UI 명칭은 연락처다. 별도 중복 Contact 저장소를 만들지 않는다.
- CRM `expectedValue`는 예측값이며 ERP 매출·미수금으로 덮어쓰지 않는다. `expectedValueCurrency`가 없거나 ERP 통화와 다르면 비교하지 않는다.
- 모든 조회·변경·감사·메모리·매핑은 `requireOwnerContext()`가 확정한 owner만 사용한다. 요청 body/query의 `ownerId`는 무시하거나 거부한다.
- 모든 연락처 변경은 `expectedVersion`을 원자적으로 비교하고 성공 시 version을 1 증가시킨다. 불일치는 `409 VERSION_CONFLICT`다.
- company create/reuse, contact membership/field/version, audit, mutation receipt는 한 owner CRM-store lock과 같은 durable write에서 commit한다. crash/retry는 같은 operation ID와 command hash로 한 번만 적용되며 commit 전에는 `저장됨`을 반환하지 않는다.
- ERP 고객 후보는 자동 연결하지 않는다. 승인 직전 exact connection/site/company/customer ID를 `verifyCustomer`로 다시 확인한다.
- ERP 계정 금액은 개인 채무가 아니라 연결된 고객/회사 계정 수준이라고 표시한다.
- 알 수 없는 ERP 값은 `null`이며 sample 숫자나 0으로 바꾸지 않는다.
- `/api/crm/customers`의 기본 응답을 페이지 계약으로 바꾸는 커밋은 `CRMView`, `BusinessHub`, business-card/device import, account-storage 등 모든 저장소 내부 caller를 함께 전환한다. 임시 query flag나 응답 shape 추측을 추가하지 않는다.
- 연락처 GET 정규화는 순수 함수이고 저장소를 쓰지 않는다. 관계 보드를 활성화하기 전 별도 idempotent CRM v2 migration이 legacy stage/version을 한 번 저장한다.
- `expectedValueCurrency`는 요청 locale이나 임의 body 값을 신뢰하지 않는다. 금액을 입력·변경하는 시점의 검증된 ERP 회사 기준 통화와 일치할 때만 저장하고, 연결이 없으면 `null`이다.
- 사용자가 수정한 `src/lib/ai/errors.ts`, `.superpowers/`, `h origin main`을 건드리거나 커밋하지 않는다.
- 선행 의존성: `docs/superpowers/plans/2026-07-15-business-erp-dashboard.md`의 Tasks 1–7과 전체 release gate를 완료한 뒤 이 계획을 시작한다. ERP stage가 verified company metadata/currency, monthly sales snapshot, exact business provider, final BusinessHub caller shape를 제공하므로 중간 stub이나 미래 모듈 import를 만들지 않는다.
- 기준 명세: `docs/superpowers/specs/2026-07-15-crm-dashboard-contacts-design.md`.

## File Structure

- `src/lib/crm/crm.types.ts`: 연락처, 관계 단계, 버전, 감사, dashboard/page 계약.
- `src/lib/crm/crm-validation.ts`: create/update/query allowlist와 날짜·통화·문자열 검증.
- `src/lib/crm/crm.repository.ts`: owner-scoped migration, CAS, page, 활동, tombstone-first lifecycle.
- `src/lib/crm/crm-contact.service.ts`: 회사 선택, 검증된 ERP 통화, allowlisted contact mutation orchestration.
- `src/lib/crm/crm-contact-lifecycle.service.ts`: tombstone-first delete와 cross-store cleanup retry.
- `src/lib/crm/crm-dashboard.ts`: 부작용 없는 dashboard aggregate 계산.
- `src/lib/account/account-preferences.repository.ts`: owner-scoped IANA time zone과 UTC fallback.
- `src/lib/crm/crm-mapping.repository.ts`: exact connection/site/company/customer mapping persistence.
- `src/lib/crm/crm-mapping.service.ts`: candidate search, exact verification, approval/revoke/context orchestration.
- `app/api/crm/**`: 얇은 인증·파싱·stable error transport.
- `components/CRM/CRMView.tsx`: 두 화면과 공통 헤더만 조정.
- `components/CRM/dashboard/**`: dashboard 표현과 관계 단계 변경.
- `components/CRM/contacts/**`: 페이지 목록, 상세, 폼, timeline, memory, ERP mapping.
- `tests/crm-*.test.ts`: domain, route, mapping, UI, owner isolation 계약.

---

### Task 1: 연락처 v2 계약, 순수 정규화, explicit migration, version CAS와 감사 구현

**Files:**

- Modify: `src/lib/crm/crm.types.ts`
- Create: `src/lib/crm/crm-validation.ts`
- Modify: `src/lib/crm/crm.repository.ts`
- Create: `src/lib/crm/crm-contact.service.ts`
- Create: `src/lib/migrations/crm-v2.ts`
- Create: `src/lib/account/account-preferences.repository.ts`
- Create: `tests/crm-contact-domain.test.ts`
- Create: `tests/account-preferences.test.ts`
- Modify: `tests/crm-owner-lifecycle.test.ts`
- Modify: `src/lib/stage7/stage7.contract.test.ts`
- Modify: `src/lib/stage12/stage12.contract.test.ts`

**Interfaces:**

- Produces: `CustomerRelationshipStage`, versioned `Customer`, canonical action fields `CustomerCreateInput`/`CustomerEditablePatch`, `CustomerListQuery`, `CustomerPage`, `CrmRepositoryError`, `createContact`, `updateContact`, `listCustomerPage`, `getActiveCustomer`, `runCrmV2Migration`.
- Consumes: existing JSON/owner-document CRM store and ERP foundation `loadVerifiedErpCompanyCurrency(ownerId)`.

- [ ] **Step 1: 실패하는 migration·CAS·validation 테스트 작성**

`tests/crm-contact-domain.test.ts`에 아래 계약을 실제 temp `DATA_DIR` fixture로 작성한다.

```ts
test("legacy CRM contacts migrate once and updates compare versions", async () => {
  const created = await createContact({ ownerId: "owner-a", actorId: "owner-a" }, {
    operationId: "contact-create-1",
    name: "김민수",
    email: "minsu@example.com",
    phone: "010-1234-5678",
    companyName: "드림위시",
    position: "이사",
    memo: "첫 상담",
    expectedValue: 3000000
  });
  assert.equal(created.version, 1);
  assert.equal(created.relationshipStage, "new_lead");
  assert.equal(created.relationshipStageSource, "explicit");
  assert.equal(created.expectedValueCurrency, null);

  const updated = await updateContact({ ownerId: "owner-a", actorId: "owner-a" }, created.id, {
    operationId: "contact-update-1",
    expectedVersion: 1,
    patch: { relationshipStage: "contacting" }
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.relationshipStageSource, "explicit");
  await assert.rejects(
    () => updateContact({ ownerId: "owner-a", actorId: "owner-a" }, created.id, {
      operationId: "contact-update-stale",
      expectedVersion: 1,
      patch: { name: "오래된 수정" }
    }),
    (error: unknown) =>
      error instanceof CrmRepositoryError && error.code === "VERSION_CONFLICT"
  );
});
```

같은 파일에 다음 실제 assertion을 추가한다.

- 같은 create/update operation ID와 같은 normalized command hash를 재시도하면 같은 contact/version receipt를 반환하고 mutation/audit를 중복 생성하지 않는다. 같은 ID와 다른 hash는 stable idempotency conflict다.
- company/contact/audit/receipt durable write 직후 response 전 crash를 주입하고 repository를 다시 열어 재시도하면 committed result 한 개만 복구된다.
- pure `normalizeCustomerForRead`는 version 없는 legacy row를 version 1로 보여주지만 원본 파일 revision/mtime을 바꾸지 않는다.
- `runCrmV2Migration(ownerId)`가 legacy `lead → new_lead`, `active → customer`, `paused|inactive → contacting`과 version 1을 한 번 저장하고 source를 `legacy_status`로 남긴다. 두 번째 실행은 store revision을 바꾸지 않는다.
- 이후 status 변경은 persisted relationship stage를 움직이지 않는다.
- `legacy_status` row는 진행 중 집계 대상이 아니다.
- create/edit에서 server-verified `companySelectionId`가 있으면 그 owner의 회사를 사용한다. 선택이 없으면 normalized exact name 0개는 생성, 1개는 재사용, 2개 이상은 `409 COMPANY_MATCH_AMBIGUOUS`이고 contact의 company 변경은 shared Company 이름을 바꾸지 않는다.
- `expectedValue` 입력/변경 시 `loadVerifiedErpCompanyCurrency(ownerId)` 결과와 body currency가 정확히 일치해야 한다. 연결 없음은 currency `null`, 불일치는 `409 CURRENCY_SCOPE_MISMATCH`, 금액 제거는 currency도 `null`이다. 다른 필드만 수정하면 기존 통화를 보존한다.
- ISO 4217 형식이 아닌 통화, invalid email/date, 음수·비유한 expected value, 40개 초과 tag, 허용되지 않은 enum을 거부한다.
- cross-owner get/update/delete는 masked `CONTACT_NOT_FOUND`다.
- audit actor는 server 인자에서 오며 request patch가 actor/owner/version/audit 필드를 설정할 수 없다.
- account time zone은 owner-scoped IANA value와 version만 저장하고 absent/invalid legacy value는 `UTC`로 읽는다. owner B가 owner A preference를 읽거나 CAS 변경할 수 없다.

- [ ] **Step 2: 테스트를 실행해 새 계약 부재로 실패 확인**

Run: `npm.cmd test`

Expected: `crm-contact-domain.test.ts`가 `CustomerRelationshipStage`, `createContact`, `updateContact`, `CrmRepositoryError` export 부재로 실패한다.

- [ ] **Step 3: 타입과 검증 계약 구현**

`src/lib/crm/crm.types.ts`에 다음 핵심 타입을 추가하고 기존 타입이 이를 사용하게 한다.

```ts
export type CustomerRelationshipStage =
  | "new_lead"
  | "contacting"
  | "proposal_review"
  | "customer";

export type RelationshipStageSource = "explicit" | "legacy_status";

export type CrmActivityType =
  | "note"
  | "meeting"
  | "call"
  | "email_draft"
  | "task";

export type CustomerCreateInput = {
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  position?: string;
  memo?: string;
  tags?: string[];
  importance?: CustomerImportance;
  nextContactAt?: string | null;
  expectedValue?: number | null;
  expectedValueCurrency?: string | null;
};

export type CustomerEditablePatch = Partial<Pick<Customer,
  | "name" | "email" | "phone" | "companyName" | "position" | "memo"
  | "tags" | "status" | "relationshipStage" | "importance"
  | "nextContactAt" | "expectedValue" | "expectedValueCurrency"
>>;

export type CustomerListQuery = {
  query: string;
  page: number;
  limit: number;
  status: CustomerStatus | null;
  relationshipStage: CustomerRelationshipStage | null;
  importance: CustomerImportance | null;
  followUp: "due" | "future" | "none" | null;
  erpMapping: "mapped" | "unmapped" | null;
  sort: "updated_desc" | "created_desc" | "name_asc" | "next_contact_asc";
};

export type CustomerPage = {
  items: Customer[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  timeZone: string;
};
```

`Customer`에는 `relationshipStage`, `relationshipStageSource`, `expectedValueCurrency`, `version`, `deletedAt`를 추가하고 existing `expectedValue`를 `number | null`로 정규화한다. legacy missing/invalid amount는 read normalize와 migration에서 `null`, 새 create default도 `null`이다. patch의 explicit `expectedValue: null`은 amount/currency를 함께 지우며 omitted field는 기존 값을 보존한다. 기존 `CrmActivity.type` inline union은 위 `CrmActivityType`을 사용하게 바꿔 activity route와 AI action schema가 같은 allowlist를 소비한다. tombstone 상세는 Task 2의 별도 record가 소유한다. `CrmAuditEvent`에는 `actorId`, `entityType`, `expectedVersion`, `resultVersion`, `metadata`, `outcome`을 추가하되 note/memo 원문은 metadata에 넣지 않는다.

`CustomerCreateInput`과 `CustomerEditablePatch`는 CRM validation/service/후속 AI action schema가 함께 쓰는 유일한 editable field 계약이다. AI layer가 별도 `CrmContact*Fields` 사본을 만들지 않는다. `src/lib/stage7/stage7.contract.test.ts`와 `src/lib/stage12/stage12.contract.test.ts`의 typed/inline `Customer` fixtures도 새 required normalized fields를 명시해 이 Task 커밋 자체가 typecheck를 통과하게 한다.

`crm-validation.ts`는 `parseCustomerCreate`, `parseCustomerPatch`, `parseCustomerListQuery`를 export한다. query 기본값은 page 1, limit 25, `updated_desc`; limit 최대 100이다. 문자열 최대치는 name/company/position 120, email 254, phone 40, memo 4000, tag 40개·각 40자다.

`account-preferences.repository.ts`는 owner-document/locked JSON adapter로 `{ ownerId, timeZone, version, updatedAt }`만 저장한다. `getAccountTimeZone(ownerId)`는 저장값을 다시 IANA 검증하고 없거나 손상되면 `UTC`를 반환한다. `updateAccountTimeZone({ ownerId, timeZone, expectedVersion })`는 version CAS 후 증가시킨다.

- [ ] **Step 4: repository migration과 CAS 구현**

repository mutation은 단일 store lock에서 수행하고, `crm-contact.service.ts`가 회사 선택과 ERP 통화를 검증한 뒤 아래 public signature를 제공한다.

```ts
export function createContact(
  context: { ownerId: string; actorId: string },
  input: CustomerCreateInput & {
    operationId: string;
    companySelectionId?: string | null;
  }
): Promise<Customer>;

export function updateContact(
  context: { ownerId: string; actorId: string },
  contactId: string,
  input: {
    operationId: string;
    expectedVersion: number;
    patch: CustomerEditablePatch;
    companySelectionId?: string | null;
  }
): Promise<Customer>;

export function getActiveCustomer(ownerId: string, contactId: string): Promise<Customer | null>;
export function requireActiveCustomer(ownerId: string, contactId: string): Promise<Customer>;
export function listCustomerPage(
  ownerId: string,
  query: CustomerListQuery,
  context: { timeZone: string; mappedContactIds: ReadonlySet<string> | null }
): Promise<CustomerPage>;
```

`normalizeCustomerForRead`는 legacy stage/version을 반환값에서만 결정하고 unknown enum row는 active list에서 격리한다. `runCrmV2Migration`만 owner store lock에서 derived stage/version을 저장하며 migration marker와 source를 남긴다. 정렬은 요청 sort 후 `id` tie-breaker를 사용한다. CRM의 모든 idempotent 변경은 아래 하나의 canonical receipt를 공유한다.

```ts
export type CrmMutationReceipt = {
  ownerId: string;
  operationId: string;
  commandHash: string;
  kind: "contact_create" | "contact_update" | "activity_create" | "follow_up_update" | "stage_update" | "mapping_approve" | "mapping_revoke";
  resultIds: Record<string, string>;
  resultingVersions: Record<string, number>;
  safeResult: unknown;
};
```

company exact-name reuse/create, contact membership, contact version, audit, and `CrmMutationReceipt` are written in one owner-document mutation. Same operation ID and hash returns the prior safe result; same ID with a different hash fails closed. Activity/task and mapping mutations use this same receipt contract, so the later AI executor does not create a second receipt store. If a future backend splits company and contact storage, it must use a staged recoverable company-membership journal and cannot report success before commit. Existing `createCustomerDraft`, `updateCustomer`, `listCustomers`는 아직 사용 중인 내부 caller를 위해 새 service로 위임하는 얇은 compatibility wrapper로 유지하고 Task 6의 원자적 caller 전환에서 제거한다. 원본 전체 `Customer`를 덮는 `upsertCustomer` bypass는 새 code에서 사용하지 못하게 deprecate하고 Task 7에서 제거하거나 expectedVersion CAS wrapper로 교체한다.

- [ ] **Step 5: domain과 owner lifecycle 테스트 통과 확인**

Run: `npm.cmd test`

Expected: 새 migration/CAS/validation 테스트와 기존 `crm-owner-lifecycle.test.ts`가 모두 통과한다.

Run: `npm.cmd run typecheck`

Expected: CRM type/repository 파일 오류 없음.

- [ ] **Step 6: domain 단위 커밋**

```powershell
git add src/lib/crm/crm.types.ts src/lib/crm/crm-validation.ts src/lib/crm/crm.repository.ts src/lib/crm/crm-contact.service.ts src/lib/migrations/crm-v2.ts src/lib/account/account-preferences.repository.ts src/lib/stage7/stage7.contract.test.ts src/lib/stage12/stage12.contract.test.ts tests/crm-contact-domain.test.ts tests/account-preferences.test.ts tests/crm-owner-lifecycle.test.ts
git commit -m "feat: version CRM contact records"
```

---

### Task 2: 페이지 handler·상세·활동·entity memory·tombstone lifecycle 구현

**Files:**

- Create: `app/api/crm/customers/contact-list-handler.ts`
- Create: `app/api/crm/customers/[id]/route.ts`
- Create: `app/api/crm/customers/[id]/activities/route.ts`
- Create: `app/api/crm/customers/[id]/memories/route.ts`
- Modify: `src/lib/crm/crm.repository.ts`
- Create: `src/lib/crm/crm-contact-lifecycle.service.ts`
- Modify: `src/lib/memory/memory.types.ts`
- Modify: `src/lib/memory/memory-repository.ts`
- Modify: `src/lib/memory/memory-engine.ts`
- Modify: `src/lib/memory/memory-lifecycle.ts`
- Create: `tests/crm-contact-api.test.ts`
- Create: `tests/crm-child-guards.test.ts`
- Modify: `tests/memory-lifecycle.test.ts`

**Interfaces:**

- Consumes: Task 1 `CustomerPage`, CAS functions, `getAccountTimeZone`, and existing `/api/memory/[id]` edit/forget lifecycle.
- Produces: page handler ready for the Task 6 atomic route switch, bounded `CustomerDetailView`/activity/memory routes, `MemoryEntityLink`, active-parent child-write fences, and a durable tombstone cleanup job runner.

- [ ] **Step 1: 실패하는 route·entity-memory·delete 테스트 작성**

`tests/crm-contact-api.test.ts`에서 signed owner cookie와 temp data directory를 사용해 다음을 고정한다.

```ts
const response = await createCustomerListGet(dependencies)(new Request(
  "http://localhost/api/crm/customers?query=kim&page=1&limit=25&sort=name_asc",
  { headers: { cookie: ownerCookie } }
));
const body = await response.json() as { ok: true; data: CustomerPage };
assert.equal(response.status, 200);
assert.equal(body.data.items.every((item) => item.ownerId === "owner-a"), true);
assert.equal(body.data.total, 1);
```

추가 assertion:

- page handler success는 `apiSuccess(CustomerPage)` 즉 `{ ok: true, data: { items, page, limit, total, hasMore, timeZone } }`이며 예전 `{ customers, activities }` shape가 아니다. 이 Task에서는 handler를 직접 시험하고 production collection `GET` export는 Task 6에서 모든 caller와 함께 교체한다.
- GET detail은 active same-owner contact/current version, bounded relationship summary와 allowlisted section links를 반환하고 foreign/deleted ID는 404다.
- activity GET은 reverse chronological page이고 POST는 allowlisted type/title/body만 저장하며 contact version을 증가시킨다.
- entity-linked memory GET은 `entityType=contact`, exact owner/contact ID만 반환하고 legacy `CustomerMemory`는 `legacySummary`로 분리한다.
- delete body `{ expectedVersion, deletionOperationId }`가 contact tombstone을 먼저 쓰며 같은 operation retry는 같은 결과다.
- tombstone 직후 activity와 memory child route가 모두 masked 404이고 internal child queries도 빈 결과다. cleanup 재시도는 내용을 복구하지 않는다. mapping cleanup은 mapping 저장소가 생기는 Task 4에서 lifecycle service에 추가한다.
- `listCrmTasks`, `listCrmDeals`, contact-scoped `listCrmInsights`와 dashboard용 contact-child aggregate reader도 deleted/foreign parent record를 반환하지 않는다. Task 3 dashboard-scoped insight는 별도 scope라 이 guard 대상이 아니다.
- contact child write lease를 claim한 뒤 delete와 memory stage를 교차 실행해도 staged memory는 활성화되지 않는다. delete 후에는 새 lease를 claim할 수 없다.
- cleanup adapter 실패는 durable job을 `retry_wait`로 남기고, 다음 bounded drain이 backoff 후 재실행해 `completed`로 만든다. process restart 후에도 job이 남는다.
- cleanup worker가 job을 `running`으로 claim한 직후 종료되면 lease expiry 뒤 다른 worker가 같은 idempotent adapters로 reclaim하며 stale claim holder의 completion write는 거부된다.
- foreign owner와 stale expectedVersion은 각각 masked 404와 409다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: contact handler/dynamic routes와 `MemoryEntityLink`, `writeContactTombstone`, `cleanupDeletedContact` 부재로 실패한다.

- [ ] **Step 3: canonical entity-linked memory 확장 구현**

`memory.types.ts`에 아래 공용 필드를 candidate와 approved memory에 추가한다. CRM은 이 공용 타입을 import하며 별도 contact-memory 타입을 만들지 않는다.

```ts
export type MemoryEntityLink = {
  entityType: "user" | "contact" | "project";
  entityId: string | null;
};

export type MemoryApprovalMode = "auto_approved" | "user_approved";
```

기존 row normalize는 link 없는 record를 `{ entityType: "user", entityId: null }`로 처리한다. 실제 durable row normalization과 pending/active/revoked 저장·조회 필터는 `memory-repository.ts`에 구현하고, `memory-engine.ts`에는 `listEntityLinkedMemories(ownerId, link, options)`와 `forgetApprovedMemoriesForEntity(ownerId, link, deletionOperationId)`를 추가한다. memory layer는 CRM repository를 import하지 않는다. 연락처 memory route/service가 먼저 `requireActiveCustomer`를 호출하고 exact owner/entity link를 전달한다. approve/reject/correct/forget lifecycle input에는 `expectedEntityLink?`와 injected parent-fence adapter를 추가한다. contact-linked write는 CRM에서 lease를 claim하고 memory store에 `parentFenceState: "pending"`으로 stage한 뒤, 같은 parent version이 아직 active임을 CRM lock에서 확인하고서만 memory CAS로 `active`가 된다. pending/revoked child는 모든 memory query에서 제외한다. stored link가 contact이면 exact link와 active-parent verifier를 항상 요구한다. 기존 manual/external capture의 approval 정책은 바꾸지 않는다.

- [ ] **Step 4: tombstone-first delete와 cleanup 구현**

`crm.repository.ts`와 `crm-contact-lifecycle.service.ts`에 다음을 분리해 구현한다.

```ts
export type ContactTombstone = {
  contactId: string;
  deletionOperationId: string;
  tombstonedAt: string;
  deletedVersion: number;
  cleanupJobId: string;
};

export type ContactChildWriteLease = {
  id: string;
  ownerId: string;
  contactId: string;
  expectedParentVersion: number;
  childKind: "memory" | "erp_mapping";
  operationId: string;
  state: "claimed" | "staged" | "completed" | "cancelled";
  expiresAt: string;
};

export type ContactCleanupJob = {
  id: string;
  ownerId: string;
  contactId: string;
  deletionOperationId: string;
  state: "pending" | "running" | "retry_wait" | "completed";
  attempts: number;
  nextAttemptAt: string;
  lastErrorCode: string | null;
  claimId: string | null;
  leaseExpiresAt: string | null;
  updatedAt: string;
};

export function writeContactTombstone(input: {
  ownerId: string;
  contactId: string;
  expectedVersion: number;
  deletionOperationId: string;
  actorId: string;
}): Promise<ContactTombstone>;

export function cleanupDeletedContact(input: {
  ownerId: string;
  contactId: string;
  deletionOperationId: string;
}): Promise<{ state: "completed" | "retry_wait" }>;

export function claimContactChildWriteLease(input: ClaimContactChildWriteLeaseInput): Promise<ContactChildWriteLease>;
export function markContactChildWriteStaged(input: ContactChildWriteLeaseRef): Promise<ContactChildWriteLease>;
export function confirmContactChildWriteStillActive(input: ContactChildWriteLeaseRef): Promise<void>;
export function completeContactChildWriteLease(input: ContactChildWriteLeaseRef): Promise<void>;
export function runDueContactCleanupJobs(ownerId: string, options: { now: Date; limit: number }): Promise<ContactCleanupRun>;
```

1차 CRM lock에서 contact `deletedAt`, version, authoritative tombstone, durable cleanup job, audit를 원자적으로 저장하며 새 child lease를 즉시 차단한다. child write는 `lease claim → child store pending stage → parent lock 재확인 → child CAS active → lease completed` 순서다. 삭제가 어느 사이에 들어오더라도 cleanup runner가 pending/active child를 취소·forget/revoke하고 child activation CAS가 실패한다. cleanup job은 outstanding lease가 모두 completed/cancelled이거나 만료 후 정리되기 전에는 completed가 될 수 없다.

이후 canonical entity-memory forget/reject cleanup을 호출한다. 모든 activity/task/deal/insight/dashboard/memory child query가 active parent를 먼저 검증하므로 cleanup 실패도 읽기에 노출되지 않는다. adapter 실패는 bounded exponential backoff와 safe error code로 `retry_wait`에 남는다. `runDueContactCleanupJobs`는 store lock에서 pending/retry_wait 또는 lease-expired running job을 random `claimId`와 짧은 `leaseExpiresAt`으로 CAS claim한 뒤 persisted due job을 실행한다. completion/retry update는 같은 claim ID로 fence하며 stale worker는 덮어쓰지 못한다. delete 직후와 모든 authenticated CRM list/detail/dashboard/mutation entry point에서 owner당 최대 5개를 bounded하게 drain한다. process restart/claim 직후 crash 후에도 lease expiry로 같은 idempotent job을 재개하고 동일 deletion operation ID는 cleanup만 이어서 실행한다. 다른 operation ID나 stale version은 `VERSION_CONFLICT`이고 삭제 내용을 되살리지 않는다.

- [ ] **Step 5: 얇은 인증 route 구현**

`contact-list-handler.ts`의 `createCustomerListGet(dependencies)`는 `parseCustomerListQuery(new URL(request.url).searchParams)`, owner time zone, injected `listMappedContactIds`를 사용한다. Task 2 tests는 mapping IDs를 stub하고 production default dependency는 Task 4 mapping service가 생긴 뒤 Task 6에서 wire하므로 future module import를 만들지 않는다. `[id]/route.ts`는 detail GET만 제공한다. 명세대로 collection `POST/PATCH/DELETE`는 기존 경로에 남고 Task 6에서 새 service/CAS body로 원자적으로 교체한다. `[id]/activities`는 limit 기본 25·최대 100, title 200·body 4000을 강제하며 `expectedVersion`으로 contact와 activity/task를 같은 CRM lock에서 쓴다. `[id]/memories`는 active parent를 검증한 뒤 canonical memory와 legacy summary를 별도 key로 반환하며 raw markdown path와 owner ID를 client view에서 제거한다. 각 authenticated CRM entry handler는 injected bounded cleanup drain을 먼저 실행하되 cleanup 오류 때문에 정상 read를 실패시키지 않는다.

`CustomerDetailView`는 `{ contact, version, relationshipSummary, links }`다. 이 Task의 summary는 stage/source, nextContactAt, latest activity timestamp와 open task count만 포함하고 note/memory 본문이나 아직 존재하지 않는 mapping 상태를 넣지 않는다. links는 같은 contact ID로 server가 만든 allowlisted `activities`, `memories`, `erpMapping`, `erpContext` 상대 경로만 제공한다. 각 section의 실제 bounded data는 독립 route에서 로드한다. Task 4가 mapping service를 만든 같은 커밋에서 detail handler에 approved-mapping boolean을 additive하게 연결한다.

기존 `listCrmTasks`, `listCrmDeals`, contact-scoped `listCrmInsights`와 dashboard input reader에는 `requireActiveParent`/active-contact set join을 명시적으로 적용한다. generic owner match만으로 contact child를 반환하는 경로를 남기지 않는다. Task 3이 만드는 dashboard-scope insight repository는 contact-parent join과 분리한다.

```ts
export function addContactActivity(
  context: { ownerId: string; actorId: string },
  contactId: string,
  input: {
    operationId: string;
    expectedVersion: number;
    type: CrmActivityType;
    title: string;
    body: string;
    dueAt?: string | null;
    priority?: CustomerImportance;
  }
): Promise<{ contact: Customer; activity: CrmActivity; task: CrmTask | null }>;
```

Activity, optional task, incremented contact version, audit, and the Task 1 canonical `CrmMutationReceipt` commit in the same CRM-store write. A crash/retry with the same operation ID returns `safeResult` without duplicating the timeline entry.

모든 route는 `readApiResponse`가 이해하는 stable body를 사용한다.

```ts
return NextResponse.json(
  { ok: false, error: { code: error.code, message: safeMessage(error.code) } },
  { status: error.status }
);
```

- [ ] **Step 6: route·memory 회귀 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: 새 contact route, child-reader guard, lease/delete race, cleanup-worker stale claim reclaim/fencing, persisted cleanup retry, 기존 memory lifecycle와 owner isolation 테스트 통과.

Run: `npm.cmd run typecheck`

Expected: dynamic route params, entity link, delete result 타입 오류 없음.

- [ ] **Step 7: contact API 단위 커밋**

```powershell
git add app/api/crm/customers/contact-list-handler.ts app/api/crm/customers/[id] src/lib/crm/crm.repository.ts src/lib/crm/crm-contact-lifecycle.service.ts src/lib/memory/memory.types.ts src/lib/memory/memory-repository.ts src/lib/memory/memory-engine.ts src/lib/memory/memory-lifecycle.ts tests/crm-contact-api.test.ts tests/crm-child-guards.test.ts tests/memory-lifecycle.test.ts
git commit -m "feat: add paginated CRM contact lifecycle"
```

---

### Task 3: owner-scoped CRM dashboard aggregate와 API 구현

**Files:**

- Modify: `src/lib/crm/crm.types.ts`
- Modify: `src/lib/crm/crm.repository.ts`
- Create: `src/lib/crm/crm-dashboard.ts`
- Create: `src/lib/crm/crm-insight.service.ts`
- Create: `app/api/crm/dashboard/handler.ts`
- Create: `app/api/crm/dashboard/route.ts`
- Create: `app/api/crm/insights/route.ts`
- Create: `app/api/account/preferences/route.ts`
- Modify: `components/Business/BusinessHub.tsx`
- Modify: `src/lib/business/business-workspace.ts`
- Create: `tests/crm-dashboard-api.test.ts`
- Modify: `tests/business-hub.test.ts`

**Interfaces:**

- Consumes: Tasks 1–2 contacts/tasks/activities and ERP plan `getOwnerErpMonthlySalesSnapshot`.
- Produces: scope-aware `CrmInsightRecord`, `CrmDashboardSnapshot`, `buildCrmDashboardSnapshot`, authenticated `/api/crm/dashboard`, explicit insight refresh route, stored owner IANA time zone, Business aggregate caller.

- [ ] **Step 1: 실패하는 aggregate·partial ERP 테스트 작성**

`tests/crm-dashboard-api.test.ts`에 pure fixture와 injected route dependencies를 작성한다.

```ts
const snapshot = buildCrmDashboardSnapshot({
  now: new Date("2026-07-15T03:00:00.000Z"),
  timeZone: "Asia/Seoul",
  customers,
  tasks,
  activities,
  monthlySales: {
    value: 0,
    currency: "KRW",
    changePercent: null,
    connectionState: "connected",
    requestState: "available",
    stale: false
  },
  insight: null
});
assert.equal(snapshot.metrics.totalContacts, customers.length);
assert.equal(snapshot.metrics.monthlySales.value, 0);
assert.equal(snapshot.metrics.openTasks, 1);
assert.equal(snapshot.metrics.todayMeetings, 1);
```

추가 assertion:

- `inProgressContacts`는 explicit contacting/proposal_review만 세고 paused/inactive/legacy_status를 제외한다.
- due follow-up은 owner timezone 기준 now 이하이고 deleted contact를 제외한다.
- dashboard input reader는 Task 2 active-parent guard를 거쳐 deleted-contact task/deal/insight/activity를 집계하지 않는다.
- 각 stage list, today follow-up, recent activity, recent contacts가 bounded되고 stable sort를 쓴다.
- ERP 미연결/실패는 CRM 집계를 유지하고 monthlySales만 unavailable이다.
- 명시적 0과 unavailable null이 다르다.
- dashboard GET은 모든 raw 연락처/활동을 반환하지 않는다.
- insight가 24시간 초과 또는 source version 불일치면 null이다.
- legacy contact insight는 `scope: "contact"`로 normalize되고 active parent를 요구한다. dashboard insight는 `scope: "dashboard"`, `contactId: null`이며 contact-parent guard 없이 bounded aggregate source versions로 검증된다.
- dashboard GET은 per-contact ERP 요청을 호출하지 않는다.
- dashboard route는 pure read normalization과 분리된 `runCrmV2Migration(owner.uid)`을 먼저 보장한다. 첫 call만 legacy stage/version을 저장하고 두 번째 call은 store revision을 바꾸지 않는다.
- 저장된 owner time zone이 없으면 `UTC`, 유효한 값이 있으면 그 IANA zone을 due/today 경계와 response `timeZone`에 사용한다. 다른 owner의 preference는 보이지 않는다.
- BusinessHub는 `/api/crm/dashboard`의 `totalContacts`, `dueFollowUps`, `openTasks`, `todayMeetings`만 사용하고 더 이상 raw `/api/crm/customers` 배열을 집계하지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: `crm-dashboard.ts`와 dashboard/insights route 부재로 실패한다.

- [ ] **Step 3: pure snapshot builder 구현**

`crm-dashboard.ts`에 아래 signature와 bound를 구현한다.

```ts
export function buildCrmDashboardSnapshot(input: CrmDashboardInput): CrmDashboardSnapshot;

export const CRM_DASHBOARD_LIMITS = {
  perStage: 12,
  todayFollowUps: 12,
  recentActivity: 12,
  recentContacts: 10
} as const;
```

date boundary는 injected `timeZone`, stable tie-breaker는 ID다. metric count는 전체 active owner dataset에서 계산하고 list만 truncate한다. dashboard insight는 저장된 evidence/version/timestamp를 검증할 때만 포함한다.

`crm.types.ts`/repository의 insight contract를 scope-aware union으로 확장한다.

```ts
export type CrmInsightScope =
  | { kind: "contact"; contactId: string }
  | { kind: "dashboard"; contactId: null };

export type CrmInsightRecord = {
  id: string;
  ownerId: string;
  scope: CrmInsightScope;
  summary: string;
  suggestedAction: string;
  evidence: Array<{ kind: "contact" | "activity" | "task" | "erp_monthly_sales"; id: string; label: string }>;
  sourceVersions: Record<string, number | string>;
  generatedAt: string;
  version: number;
};
```

legacy `CrmInsight.customerId` row는 contact scope로 normalize/migrate한다. contact insight read/write/delete/cleanup은 active parent를 요구하지만 dashboard scope는 contact ID를 허용하지 않고 owner aggregate revision + ERP monthly snapshot `asOf`/state만 bounded sourceVersions로 사용한다. generic `listCrmInsights`가 dashboard row를 contact-parent join으로 버리지 않도록 scope별 repository method를 만든다. evidence/summary 길이와 count를 검증하고 raw provider prompt를 저장하지 않는다.

Task 1 account preference repository를 사용해 authenticated `GET /api/account/preferences`는 current `{ timeZone, version }`, PATCH는 `{ timeZone, expectedVersion }`만 받고 owner ID를 body에서 받지 않으며 성공 시 version을 증가시킨다.

- [ ] **Step 4: owner route와 explicit insight refresh 구현**

`app/api/crm/dashboard/handler.ts`가 `createCrmDashboardGet(dependencies)`와 `defaultDependencies`를 export해 test에서 ERP result를 주입한다. `route.ts`는 `export const GET = createCrmDashboardGet(defaultDependencies)`만 두어 App Router가 허용하지 않는 임의 factory export를 만들지 않는다. 기본 dependency는 `requireOwnerContext`, explicit `runCrmV2Migration(owner.uid)`, CRM repository, `getAccountTimeZone(owner.uid)`, `getOwnerErpMonthlySalesSnapshot(owner.uid)`을 사용한다. ERP 오류는 safe warning code로만 변환하고 success는 `apiSuccess(snapshot)`으로 사용한 `timeZone`을 포함한다.

`POST /api/crm/insights`는 `{ contactId, expectedVersion }` 또는 `{ scope: "dashboard", expectedVersion }`만 받는다. `crm-insight.service.ts`가 exact scope를 만들고 CAS로 저장한다. 자동 dashboard GET에서 provider를 호출하지 않고, source version과 evidence ID를 저장한다. provider 미설정이면 503 stable error를 반환한다.

같은 단계에서 `BusinessHub`와 `business-workspace.ts`를 raw customer/deal arrays 대신 `CrmDashboardSnapshot.metrics`의 네 운영 집계로 전환한다. 이 전환은 ERP plan이 이미 제거한 sales/revenue UI를 되살리지 않고 mail/cards/meetings/reports를 유지한다.

- [ ] **Step 5: aggregate 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: CRM dashboard route·pure aggregate·Business 정적 호환 assertion 통과.

Run: `npm.cmd run typecheck`

Expected: snapshot과 ERP monthly sales state 타입 오류 없음.

- [ ] **Step 6: dashboard backend 커밋**

```powershell
git add src/lib/crm/crm.types.ts src/lib/crm/crm.repository.ts src/lib/crm/crm-dashboard.ts src/lib/crm/crm-insight.service.ts app/api/crm/dashboard/handler.ts app/api/crm/dashboard/route.ts app/api/crm/insights/route.ts app/api/account/preferences/route.ts components/Business/BusinessHub.tsx src/lib/business/business-workspace.ts tests/crm-dashboard-api.test.ts tests/business-hub.test.ts
git commit -m "feat: serve CRM dashboard aggregates"
```

---

### Task 4: 수동 CRM–ERP 고객 mapping과 live 계정 context 구현

**Files:**

- Modify: `src/lib/crm/crm.types.ts`
- Create: `src/lib/crm/crm-mapping.repository.ts`
- Create: `src/lib/crm/crm-mapping.service.ts`
- Modify: `src/lib/crm/crm-contact-lifecycle.service.ts`
- Modify: `app/api/crm/customers/[id]/route.ts`
- Create: `app/api/crm/customers/[id]/erp-candidates/route.ts`
- Create: `app/api/crm/customers/[id]/erp-mapping/route.ts`
- Create: `app/api/crm/customers/[id]/erp-context/route.ts`
- Create: `tests/crm-erp-mapping.test.ts`
- Modify: `tests/crm-contact-api.test.ts`

**Interfaces:**

- Consumes: active contact CAS/child-write lease, free `getBusinessProvider("erpnext")`, `ExactConnectionScope`, `ExactMappedCustomerScope`.
- Produces: `CrmErpCustomerMapping`, candidate search, exact approval, revoke, guarded `listApprovedMappedContactIds`, mapped account context.

- [ ] **Step 1: 실패하는 mapping security·TOCTOU 테스트 작성**

```ts
const candidates = await service.searchCandidates({
  ownerId: "owner-a",
  localContactId: contact.id,
  connectionId: "erp-a",
  query: "드림위시"
});
assert.equal(candidates.length <= 20, true);
assert.equal(await service.getApprovedMapping("owner-a", contact.id, "erpnext"), null);

const mapping = await service.approveMapping({
  operationId: "mapping-approve-1",
  ownerId: "owner-a",
  actorId: "owner-a",
  localContactId: contact.id,
  connectionId: "erp-a",
  externalSiteId: "https://erp.example.com",
  externalCompanyId: "DreamWish Co",
  externalCustomerId: "CUST-0001",
  expectedMappingVersion: 0
});
assert.equal(mapping.status, "approved");
```

fixture provider 호출 기록으로 다음을 확인한다.

- search result만으로 mapping이 생성되지 않는다.
- approve는 저장 직전 `verifyCustomer`를 exact ID로 다시 호출한다.
- approve/revoke는 mapping version, audit, and operation receipt를 한 durable mapping-store write에 commit하며, UI는 그 성공 response 전에는 연결 완료를 표시하지 않는다.
- connection revision/site/company/customer mismatch는 저장하지 않는다.
- `draft_write` capability-only 변경은 mapping의 `connectionRevision`을 바꾸거나 approved mapping을 무효화하지 않는다.
- local contact당 provider별 active mapping은 하나다.
- 동일 ERP customer account를 같은 owner의 여러 연락처에 연결할 수 있다.
- owner B는 owner A contact/connection/mapping ID를 보지 못한다.
- revoke는 expected mapping version을 요구하고 즉시 context를 차단한다.
- deleted contact 또는 disabled/changed connection은 mapping을 사용할 수 없다.
- account context의 0/null, currency, asOf, stale, document list bounds를 유지한다.
- `listApprovedMappedContactIds`는 same owner의 active contact + approved/current identity mapping만 반환하고 pending/revoked/stale/deleted/foreign rows를 제외한다.
- approval/revoke는 actor, prior/result version, connection/site/company/customer exact ID를 포함하되 credential을 제외한 owner-scoped audit event를 쓴다.
- contact tombstone cleanup은 active mapping을 revoke하고 동일 deletion operation retry에 idempotent하다.
- remote `verifyCustomer` 직후 contact delete가 경쟁해도 mapping은 `pending_parent_check`에서 approved로 전환되지 않으며 cleanup job이 정리한다. process가 pending stage 직후 종료되어도 mapping read에는 노출되지 않는다.
- `getCustomerContext` remote read가 진행되는 동안 mapping revoke/contact delete/connection identity change를 commit한 race fixture는 provider 결과를 버리고 `unavailable`을 반환하며 stale amount/document를 노출하지 않는다.
- Task 2 detail response는 Task 4 wiring 뒤 current approved mapping이면 `approvedErpMapping: true`, 없거나 stale/pending/revoked이면 false이고 foreign/deleted contact는 계속 404다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: mapping repository/service/routes 부재로 실패한다.

- [ ] **Step 3: mapping repository 구현**

```ts
export type CrmErpCustomerMapping = {
  id: string;
  ownerId: string;
  provider: "erpnext";
  connectionId: string;
  connectionRevision: number;
  externalSiteId: string;
  externalCompanyId: string;
  localContactId: string;
  externalCustomerId: string;
  externalCustomerLabel: string;
  status: "pending_parent_check" | "approved" | "revoked";
  parentLeaseId: string;
  version: number;
  approvedAt: string | null;
  approvedBy: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

repository에는 `stageMappingCas`, `activateStagedMappingCas`, `readMappingRecord`, owner-scoped `listMappingRecords`, `revokeMappingCas`, `revokeMappingsForDeletedContact`만 JSON lock으로 구현한다. mapping에는 credential이나 token을 저장하지 않는다. pending row는 어떤 candidate/context/list read에도 노출하지 않는다. AI/live caller가 raw repository를 직접 읽지 않도록 service가 아래 guarded contract를 제공한다.

```ts
export function getApprovedMapping(
  ownerId: string,
  localContactId: string,
  provider: "erpnext"
): Promise<{
  mapping: CrmErpCustomerMapping;
  scope: ExactMappedCustomerScope;
} | null>;

export function listApprovedMappedContactIds(
  ownerId: string,
  provider: "erpnext"
): Promise<ReadonlySet<string>>;
```

두 guarded 함수는 active contact와 현재 connection revision/site/company를 검증한다. capability version은 mapping identity가 아니므로 검사하지 않는다. mismatch/pending/revoked/deleted는 context에서 `null`, mapped-ID set에서 제외되고 credential을 반환하지 않는다.

- [ ] **Step 4: service와 route 구현**

`searchCandidates`는 query 2–120자, timeout 8초, 결과 최대 20을 강제하고 `customer_search` capability를 요구한다. `approveMapping`은 stable `operationId`를 요구하고 active contact child-write lease를 먼저 claim하고 exact owner connection을 다시 읽은 뒤 free `getBusinessProvider("erpnext")`의 `verifyCustomer`를 제출된 exact ID로 즉시 호출한다. 그 결과를 mapping store에 `pending_parent_check`로 stage하고 CRM lock에서 same parent version/lease를 재확인한 뒤에만 mapping CAS, audit, Task 1 canonical `CrmMutationReceipt`를 한 durable write에서 approved로 활성화하고 lease를 complete한다. 어느 단계에서든 tombstone/lease conflict가 나면 staged row를 revoke하고 fail closed한다. revoke route도 `{ operationId, expectedMappingVersion }`을 요구하고 mapping, audit, 같은 canonical receipt가 commit된 뒤에만 성공한다.

`getMappedAccountContext`는 guarded `getApprovedMapping` 결과에서 contact version, mapping ID/version/status, connection ID/revision/site/company를 capture한 뒤 provider `getCustomerContext`를 exact scope로 호출한다. remote response 뒤 active contact, exact approved mapping/version과 current connection identity를 모두 다시 읽어 capture와 비교한다. 하나라도 deleted/revoked/pending/stale/changed이면 fetched payload를 즉시 버리고 `unavailable`을 반환한다. 이 post-read authorization fence는 provider warning/partial data에도 적용하고 raw stale payload를 cache/memory/source manifest에 쓰지 않는다.

Task 2의 durable cleanup adapter에 `revokeMappingsForDeletedContact`와 stale pending mapping cancellation을 추가한다. tombstone이 이미 authoritative하므로 revoke 실패는 cleanup job의 `retry_wait`이고 모든 mapping/context read는 active-parent guard로 즉시 차단된다. job은 outstanding mapping lease가 정리될 때까지 completed가 되지 않는다.

route는 owner ID를 body에서 받지 않으며 candidate view에서 외부 ID/label/company/email/phone evidence만 반환한다.

같은 커밋에서 `[id]/route.ts` detail dependency에 guarded `getApprovedMapping`을 주입하고 `CustomerDetailView.relationshipSummary.approvedErpMapping`을 additive하게 추가한다. route가 raw mapping record/external IDs를 detail summary에 넣지 않으며 Task 2의 bounded section links와 masked 404를 유지한다.

Task 6 production `createCustomerListGet(defaultDependencies)`는 이 service를 `listMappedContactIds` dependency로 연결해 `erpMapping=mapped|unmapped` filter가 실제 approved/current mappings만 사용하게 한다.

- [ ] **Step 5: mapping 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: mapping owner isolation, version conflict, revoke, exact verify, capability-only stability, delete/approval race, bounded context 테스트 통과.

Run: `npm.cmd run typecheck`

Expected: shared ERP read provider와 mapping scope 타입이 정확히 일치한다.

- [ ] **Step 6: mapping 단위 커밋**

```powershell
git add src/lib/crm/crm.types.ts src/lib/crm/crm-mapping.repository.ts src/lib/crm/crm-mapping.service.ts src/lib/crm/crm-contact-lifecycle.service.ts app/api/crm/customers/[id]/route.ts app/api/crm/customers/[id]/erp-candidates/route.ts app/api/crm/customers/[id]/erp-mapping/route.ts app/api/crm/customers/[id]/erp-context/route.ts tests/crm-erp-mapping.test.ts tests/crm-contact-api.test.ts
git commit -m "feat: add approved CRM ERP customer mappings"
```

---

### Task 5: CRM dashboard 표현 컴포넌트 구현

**Files:**

- Create: `components/CRM/CrmDashboard.tsx`
- Create: `components/CRM/dashboard/CrmMetricGrid.tsx`
- Create: `components/CRM/dashboard/CrmRelationshipBoard.tsx`
- Create: `components/CRM/dashboard/CrmCustomerInsight.tsx`
- Create: `components/CRM/dashboard/CrmTodayFollowUps.tsx`
- Create: `components/CRM/dashboard/CrmRecentActivity.tsx`
- Modify: `tests/crm-dashboard-design.test.ts`

**Interfaces:**

- Consumes: Task 3 `CrmDashboardSnapshot` and a typed stage-change callback prop.
- Produces: independently testable responsive CRM dashboard presentation; collection mutation wiring and `CRMView` integration are deferred until Task 6's atomic route switch.

- [ ] **Step 1: 실패하는 dashboard 표현 계약 작성**

`crm-dashboard-design.test.ts`에 4 KPI, 4 stage, AI insight, 오늘 후속 연락, 최근 활동, 최근 연락처, skeleton/error/empty, `readApiResponse`, `grid-cols-1`, desktop columns, keyboard stage menu를 고정한다. 하드코딩 고객명·매출값·활동 percentage가 없음을 확인하고 현재 `CRMView`는 이 Task에서 import하지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: dashboard component 파일 부재로 새 표현 계약이 실패한다.

- [ ] **Step 3: dashboard panels와 stage-change presentation 구현**

`CrmDashboard`는 `/api/crm/dashboard`를 독립 fetch하고 refresh 중 이전 snapshot을 유지한다. `CrmMetricGrid`는 전체 연락처·진행 중·이번 달 매출·후속 연락 필요 네 카드만 표시한다. ERP unavailable은 `ERP 연결 후 표시`/`데이터 없음`이며 explicit 0만 0이다.

`CrmRelationshipBoard`는 four stage columns와 keyboard stage menu를 제공하고 `{ customerId, expectedVersion, relationshipStage }`를 typed `onRequestStageChange` callback에 전달한다. 이 Task에서는 아직 legacy collection PATCH를 호출하지 않는다. optimistic/409 behavior는 injected callback fixture로 표현만 검증하며 실제 body/wiring은 Task 6에서 route migration과 동시에 추가한다. `legacy_status` card는 `검토 필요` badge를 표시한다.

- [ ] **Step 4: dashboard tests와 타입 검사**

Run: `npm.cmd test`

Expected: dashboard layout, no fake data, stage labels, accessibility contracts 통과.

Run: `npm.cmd run typecheck`

Expected: dashboard props와 snapshot 타입 오류 없음.

- [ ] **Step 5: dashboard UI 커밋**

```powershell
git add components/CRM/CrmDashboard.tsx components/CRM/dashboard tests/crm-dashboard-design.test.ts
git commit -m "feat: redesign CRM dashboard"
```

---

### Task 6: 연락처 UI와 두 화면 shell을 만들고 collection API/caller를 원자적으로 전환

**Files:**

- Rewrite: `components/CRM/CRMView.tsx`
- Create: `components/CRM/CrmContacts.tsx`
- Create: `components/CRM/contacts/CrmContactList.tsx`
- Create: `components/CRM/contacts/CrmContactDetail.tsx`
- Create: `components/CRM/contacts/CrmContactForm.tsx`
- Create: `components/CRM/contacts/CrmContactTimeline.tsx`
- Create: `components/CRM/contacts/CrmContactMemories.tsx`
- Create: `components/CRM/contacts/CrmErpCustomerMapping.tsx`
- Modify: `app/api/crm/customers/route.ts`
- Modify: `app/api/business/cards/[cardId]/approve/route.ts`
- Modify: `app/api/devices/contact-candidates/route.ts`
- Modify: `src/lib/crm/crm.service.ts`
- Modify: `src/lib/storage/account-storage.ts`
- Modify: `src/lib/stage10/stage10.contract.test.ts`
- Create: `tests/stage10-crm-contract.test.ts`
- Modify: `tests/crm-ui-contract.test.ts`
- Modify: `tests/client-api-resilience.test.ts`
- Modify: `tests/business-hub.test.ts`
- Modify: `tests/device-pairing.test.ts`

**Interfaces:**

- Consumes: Tasks 2 and 4 routes.
- Produces: responsive paginated contacts workflow, exactly two real CRM screens, and one atomic switch to the final collection API with every internal caller migrated.

- [ ] **Step 1: 실패하는 contacts UI contract 작성**

다음을 정적 source contract로 고정한다.

- search query는 `encodeURIComponent`, AbortController와 request ID로 stale response를 무시한다.
- filters는 relationship/status/importance/follow-up/mapping, sorts는 네 allowlist만 전송한다.
- table headers와 mobile cards가 동일 contact identity/state를 제공한다.
- list, detail, activities, memories, ERP context가 각각 독립 loading/error/retry state다.
- create/edit payload에 stable `operationId`, expectedVersion, allowlisted fields만 있고 실패 시 optimistic 값을 rollback한다. 재시도는 같은 operation ID를 사용한다.
- delete confirm에 contact name이 있고 operation ID를 `crypto.randomUUID()`로 생성한다.
- memory edit/forget은 existing expectedVersion route를 사용한다.
- mapping candidate 선택 후 별도 confirm 없이는 POST하지 않는다.
- responsive one-column/detail view와 focus restore가 있다.
- `CRMView`에는 정확히 `대시보드 · 연락처` 두 tab만 있고 active tab이 `<CrmDashboard>` 또는 `<CrmContacts>` 하나만 렌더링한다.
- `/api/crm/customers` default GET과 all internal callers use `CustomerPage`; source에 legacy `{ customers, activities }` shape 선택 flag/heuristic가 없다.
- collection `POST/PATCH/DELETE`는 owner-derived context, allowlist, `expectedVersion`, stable API wrapper를 사용하고 `[id]`에는 detail GET만 있다.
- dashboard stage change는 `{ customerId, expectedVersion, patch: { relationshipStage } }`만 보내며 성공 뒤 반영하고 409에서는 prior card와 reload 안내를 유지한다.
- BusinessHub는 이미 `/api/crm/dashboard`만 사용하며 collection route response에 의존하지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: contacts component 파일 부재로 실패한다.

- [ ] **Step 3: contacts query와 list 구현**

`CrmContacts`는 `{ query, filters, sort, page }`를 URLSearchParams로 만들고 `/api/crm/customers`를 호출한다. query state는 dashboard와 공유하지 않는다. `CrmContactList`는 desktop semantic table과 mobile cards를 같은 `items`에서 렌더링하고 선택은 component state에만 저장한다.

- [ ] **Step 4: detail/form/timeline/memory 구현**

선택 시 profile, activities, memories를 병렬이 아닌 독립 request로 로드해 한 section 실패가 나머지를 숨기지 않게 한다. `CrmContactForm`은 create/edit 공통 field validation과 company selection을 사용한다. activity form은 실제 title/body/type을 받으며 기존 자동 영어 follow-up draft를 만들지 않는다.

memory panel은 `auto_approved`, `user_approved`, `pending`, legacy summary를 label로 구분하고 existing edit/forget/approve/reject route를 사용한다.

- [ ] **Step 5: mapping UI 구현**

connection 선택 후 2자 이상 query일 때 candidate endpoint를 호출한다. candidate card에는 exact ERP label/site/company evidence를 표시한다. confirm dialog가 submitted external ID를 다시 보여준 뒤에만 approve POST를 수행한다. mapped state에는 account-level badge, freshness, bounded orders/invoices/payments/receivables와 revoke control을 제공한다.

- [ ] **Step 6: 두 화면 shell과 collection route/caller를 한 번에 전환**

`CRMView`는 `crmTabs` 두 개, active tab, 공통 search/create action만 가진다. dashboard search result 선택은 contacts tab과 selected ID state로 이동하고 화면별 server state를 공유 배열로 두지 않는다.

```tsx
{activeTab === "dashboard" ? (
  <CrmDashboard onOpenContact={openContact} />
) : (
  <CrmContacts selectedContactId={selectedContactId} onSelectedContactChange={setSelectedContactId} />
)}
```

mount 시 browser IANA zone을 검증해 `/api/account/preferences`에 현재 version과 함께 동기화하고, 실패하면 화면은 서버가 보고한 `UTC`/stored zone으로 계속 동작한다. 전역 Settings/Sidebar는 변경하지 않는다.

`app/api/crm/customers/route.ts`의 GET은 Next App Router named export `export const GET = createCustomerListGet(defaultDependencies)`로 Task 2 handler를 연결하고, POST/PATCH/DELETE는 Task 1 service와 Task 2 lifecycle service를 사용한다. POST body는 `{ operationId, companySelectionId?, ...allowlistedCreateFields }`, PATCH body는 `{ operationId, customerId, expectedVersion, patch, companySelectionId? }`, DELETE body는 `{ customerId, expectedVersion, deletionOperationId }`다. activity creation은 `[id]/activities`에서 `{ operationId, expectedVersion, type, title, body, dueAt?, priority? }`만 받는다. UI는 `apiSuccess` 이후에만 `저장됨`을 표시한다. 같은 커밋에서 `CrmDashboard` stage callback은 정확히 `{ operationId, customerId, expectedVersion, patch: { relationshipStage } }`를 PATCH하도록 wire한다.

business-card/device import와 compatibility wrapper는 새 random ID를 매 retry마다 만들지 않고 source card/candidate ID와 operation kind에서 안정적으로 파생한 operation ID로 `createContact`를 호출한다. `crm.service.ts`의 whole-record `upsertCustomer` bypass를 제거하고 explicit expectedVersion update로 바꾼다. `account-storage.ts`는 authenticated owner export 전용 `listCustomersForAccountExport(ownerId, { includeDeleted: true })`를 사용하며 일반 list 경계를 우회하지 않는다. Typecheck-only `src/lib/stage10/stage10.contract.test.ts`를 새 signature로 갱신하고, 실제 `npm.cmd test` discovery 아래 `tests/stage10-crm-contract.test.ts`에 create/list/update runtime contract를 추가한다. owner/device/business tests도 새 signature로 갱신한다.

- [ ] **Step 7: UI·caller tests와 타입 검사**

Run: `npm.cmd test`

Expected: two-screen shell, contacts workflow, safe parsing, manual mapping, atomic page response migration, Business/device/account-storage compatibility, responsive contracts 통과.

Run: `npm.cmd run typecheck`

Expected: contact forms, filter unions, route response props 오류 없음.

- [ ] **Step 8: contacts UI와 API 전환 커밋**

```powershell
git add components/CRM/CRMView.tsx components/CRM/CrmDashboard.tsx components/CRM/CrmContacts.tsx components/CRM/contacts app/api/crm/customers/route.ts app/api/business/cards/[cardId]/approve/route.ts app/api/devices/contact-candidates/route.ts src/lib/crm/crm.service.ts src/lib/storage/account-storage.ts src/lib/stage10/stage10.contract.test.ts tests/stage10-crm-contract.test.ts tests/crm-ui-contract.test.ts tests/client-api-resilience.test.ts tests/business-hub.test.ts tests/device-pairing.test.ts
git commit -m "feat: switch CRM to dashboard and contacts"
```

---

### Task 7: legacy CRM 표면 제거와 전체 검증

**Files:**

- Delete: `components/CRM/CrmPipelineBoard.tsx`
- Delete: `components/CRM/PhoneContactImport.tsx`
- Modify: `tests/device-pairing.test.ts`
- Modify: `tests/business-hub.test.ts`
- Verify: `components/layout/Sidebar.tsx`
- Verify: `components/layout/AppShell.tsx`

**Interfaces:**

- Consumes: Tasks 3 and 6 completed caller migration.
- Produces: no obsolete CRM imports/files and verified end-to-end CRM/Business behavior.

- [ ] **Step 1: 회귀 테스트를 최종 계약으로 변경**

`device-pairing.test.ts`에서 device repository 자체 테스트는 유지하되 CRM이 `PhoneContactImport`를 import/render하지 않고 파일도 없음을 확인한다. `business-hub.test.ts`는 Task 3 전환대로 Business가 `/api/crm/dashboard`를 사용하고 `/api/crm/customers` response shape에 의존하지 않음을 최종 확인한다.

```ts
assert.match(businessSource, /fetch\("\/api\/crm\/dashboard"\)/u);
assert.doesNotMatch(businessSource, /fetch\("\/api\/crm\/customers"\)/u);
assert.equal(fs.existsSync("components/CRM/PhoneContactImport.tsx"), false);
assert.equal(fs.existsSync("components/CRM/CrmPipelineBoard.tsx"), false);
```

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: legacy files가 아직 남아 있어 파일 부재 assertion이 실패한다.

- [ ] **Step 3: legacy 파일 제거와 dangling import 검사**

CRMView와 다른 source에 import가 없음을 확인한 뒤 두 legacy presentation component만 삭제한다. Domain records, activity/task/deal/audit repositories, activity routes, and phone-candidate APIs/data are not deleted or migrated. BusinessHub는 이미 CRM dashboard의 `totalContacts`, `dueFollowUps`, `openTasks`, `todayMeetings`만 Business Overview/Reports에 전달하므로 이 단계에서는 계약을 다시 바꾸지 않는다. `business-workspace.ts`의 pure formatter가 아래 input만 받는지 검증한다.

```ts
export type BusinessOperationalSummary = {
  customerCount: number;
  followUpCustomerCount: number;
  openTaskCount: number;
  todayMeetingCount: number;
};
```

- [ ] **Step 4: 자동 검증**

Run: `npm.cmd test`

Expected: CRM, Business, memory, device, navigation 전체 테스트 통과.

Run: `npm.cmd run lint`

Expected: lint 통과.

Run: `npm.cmd run typecheck`

Expected: Tasks 1–7 changed files에는 오류가 없다. 현재 사용자 변경 `src/lib/ai/errors.ts:99-100`의 baseline `AIErrorCode` 오류가 남아 있으면 정확히 분리 보고하고 CRM 작업에서 수정하지 않는다.

Run: `npm.cmd run build`

Expected: production build 통과. 환경 변수 부재이면 코드 오류와 분리해 정확한 message를 기록한다.

- [ ] **Step 5: 브라우저 검증**

Run `npm.cmd run dev` through the shell tool with an early yield. `http://127.0.0.1:3100`이 응답한 뒤 in-app browser로 다음을 확인하고 정확한 running cell을 종료한다.

- 전역 DREAMWISH sidebar/topbar가 이전과 동일하다.
- CRM tab은 두 개이고 실제 화면이 바뀐다.
- dashboard 1440px/768px/375px layout과 연락처 table/card/detail가 overflow 없이 동작한다.
- search 후 dashboard로 돌아와도 metric이 바뀌지 않는다.
- keyboard만으로 tabs, stage menu, modal, filters, mapping confirm/revoke를 사용할 수 있다.
- ERP 미연결에서 fake 매출/미수금이 없고 manual mapping 전 계정 context가 없다.

- [ ] **Step 6: 최종 범위 확인과 커밋**

Run: `git status --short`

Expected: 계획 파일 외 기존 사용자 변경 `src/lib/ai/errors.ts`, `.superpowers/`, `h origin main`만 별도로 남는다.

```powershell
git add tests/device-pairing.test.ts tests/business-hub.test.ts
git add -u components/CRM/CrmPipelineBoard.tsx components/CRM/PhoneContactImport.tsx
git commit -m "refactor: retire legacy CRM surfaces"
```

---

## Completion Checklist

- [ ] 전역 sidebar/topbar 변경 없음.
- [ ] CRM은 실제 `대시보드 · 연락처` 두 화면만 제공.
- [ ] dashboard metric과 contacts search state 완전 분리.
- [ ] 관계 단계 migration/source 표시와 version CAS 동작.
- [ ] contact create/edit/delete/activity/timeline/memory owner isolation.
- [ ] tombstone 직후 모든 child context 차단과 idempotent cleanup.
- [ ] exact connection/site/company/customer 수동 mapping만 live ERP context 허용.
- [ ] mapped ERP provider 응답 뒤 contact/mapping version/connection identity 재검증과 stale payload 폐기.
- [ ] CRM forecast와 ERP account actual/currency 분리.
- [ ] PhoneContactImport, legacy pipeline, 제거된 tab label 부재.
- [ ] BusinessHub가 CRM aggregate contract 사용.
- [ ] test/lint/typecheck/build와 375/768/1440 브라우저 검증 통과.
