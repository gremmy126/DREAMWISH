# Automation Connection Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 연결 관리에 검증된 계정이 있으면 자동화 시나리오의 미바인딩 노드를 안전하게 연결해 `연결 필요`가 사라지게 하고, 다중 계정·만료·삭제 상태는 추측 없이 정확히 표시하며 실행 직전 서버에서도 같은 연결을 검증한다.

**Architecture:** 암호화 credential과 OAuth token을 secret-free `AutomationConnectionCandidate`로 합치는 owner-scoped service를 만든다. 시나리오 노드는 exact typed binding과 version을 저장하고 서버 CAS reconcile로 단일 후보만 자동 선택한다. UI는 resolution state를 렌더링하고, run route는 exact owner/app/status를 다시 검증해 화면과 실행 의미를 일치시킨다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, owner-document/JSON repositories, AES-256-GCM credential store, OAuth token repository, Node test harness.

## Global Constraints

- 전역 sidebar/topbar, Automation tab 순서, canvas/templates/run-history/guide는 유지한다.
- 연결 여부를 `credentialId` truthiness로 판단하지 않는다.
- `pending-${appId}` 같은 가짜 ID를 만들거나 허용하지 않는다.
- 단일 verified candidate만 자동 선택한다. 다중 계정은 사용자가 exact account를 선택해야 한다.
- 기존 explicit binding이 stale이면 다른 계정으로 자동 fallback하지 않는다.
- owner ID와 secret/token은 request body, public response, React props, browser storage, log, safe error에 포함하지 않는다.
- scenario GET은 쓰지 않는다. 모든 자동 바인딩은 명시적 PATCH와 version CAS로 저장한다.
- run route는 브라우저 상태와 무관하게 current durable connection을 재검증한다.
- 환경변수 전용 token은 owner-specific durable ID가 없으므로 자동 바인딩 후보가 아니다.
- 사용자가 수정한 `src/lib/ai/errors.ts`, `.superpowers/`, `h origin main`을 수정하거나 커밋하지 않는다.
- ERP 계획보다 이 계획을 먼저 실행한다. ERPNext integration-only 연결 추가가 기존 typed binding과 exact resolver를 그대로 사용해야 하기 때문이다.
- 기준 명세: `docs/superpowers/specs/2026-07-15-automation-connection-binding-design.md`.
- `scripts/run-tests.mjs`는 filename 인자를 무시하므로 모든 `npm.cmd test`는 전체 suite다. baseline typecheck의 `src/lib/ai/errors.ts` 오류는 별도 사용자 변경 debt이며 이 계획에서 고치지 않는다.

## File Structure

- `src/lib/automation/scenario-connection-binding.ts`: typed binding, safe candidate, pure resolution/reconcile.
- `src/lib/automation/automation-connection.service.ts`: owner-scoped credential/OAuth candidate 목록과 exact server-only handle resolution.
- `src/lib/automation/scenario-designer.ts`: versioned scenario/node contract와 connection-aware validation input.
- `src/lib/automation/scenario.repository.ts`: legacy normalize, version CAS, binding patch persistence.
- `app/api/automation/connections/route.ts`: same-owner safe candidate GET.
- `app/api/automation/scenarios/[scenarioId]/route.ts`: versioned PUT/status와 binding PATCH.
- `app/api/automation/scenarios/[scenarioId]/run/route.ts`: current exact binding gate.
- `components/Automation/AutomationView.tsx`: candidate load, reconcile, conflict recovery, node state.
- `components/Automation/AutomationSecondaryViews.tsx`: truthful verified connection state.

---

### Task 1: unified safe connection candidates와 exact server resolver 구현

**Files:**

- Create: `src/lib/automation/scenario-connection-binding.ts`
- Create: `src/lib/automation/automation-connection.service.ts`
- Modify: `src/lib/automation/credential.repository.ts`
- Modify: `src/lib/repositories/oauth-token.repository.ts`
- Modify: `src/lib/oauth/token.service.ts`
- Modify: `src/lib/integrations/verified-connection.service.ts`
- Create: `app/api/automation/connections/route.ts`
- Create: `tests/automation-connection-binding.test.ts`
- Modify: `tests/verified-connection-state.test.ts`
- Modify: `tests/credential-persistence.test.ts`
- Modify: `tests/oauth-owner-scope.test.ts`

**Interfaces:**

- Produces: `ScenarioConnectionBinding`, `AutomationConnectionCandidate`, `ScenarioConnectionResolution`, `listAutomationConnectionCandidates`, `resolveExactAutomationConnection`.
- Consumes: verified encrypted credential rows, exact OAuth token rows, app registry `oauthTarget`.

- [ ] **Step 1: 실패하는 candidate·resolution·secret-isolation 테스트 작성**

`tests/automation-connection-binding.test.ts`에 pure resolution과 temp data store fixtures를 만든다.

```ts
const result = resolveNodeConnection(nodeWithoutBinding, [
  verifiedCandidate({ kind: "credential", id: "cred-a" }, "notion")
]);
assert.equal(result.state, "connected");
assert.deepEqual(result.autoBinding, { kind: "credential", id: "cred-a" });
```

추가 assertion:

- verified 후보 0개는 `needs_connection`, 2개는 `needs_selection`이며 autoBinding이 없다.
- valid explicit selection은 후보가 늘어도 그대로 유지된다.
- needs-reconnect/deleted/expired/revoked candidate와 app mismatch는 `needs_reconnect`다.
- 다른 owner credential/OAuth record는 candidate와 exact resolver 모두에서 보이지 않는다.
- Gmail/Calendar/Drive는 같은 Google provider라도 declared service와 exact token ID가 다른 후보이다.
- 동일 app의 OAuth 계정 두 개를 첫 항목으로 자동 선택하지 않는다.
- 환경변수 token은 candidate가 아니다.
- public candidate JSON에 `ciphertext`, `authTag`, access/refresh token, decrypted secret, owner ID가 없다.
- exact credential resolver는 verified same-owner/app ID만 복호화한다.
- exact OAuth resolver는 active·verified·no-error same-owner/app token ID만 받으며 access token이 unexpired이거나 그 exact row가 refreshable일 때만 연결로 인정한다. expired/non-refreshable 또는 exact refresh 실패는 `needs_reconnect`이고 다른 token으로 fallback하지 않는다.
- concurrent exact OAuth refresh/save/revoke는 `oauth-tokens.json`의 `withJsonStoreLock` mutation을 사용해 서로의 account row를 잃지 않는다.
- 기존 first-match `getActiveAccessToken`을 scenario execution에서 사용하지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: binding type/service/route와 exact OAuth accessor 부재로 실패한다.

- [ ] **Step 3: pure binding contract와 resolution 구현**

```ts
export type ScenarioConnectionBinding =
  | { kind: "credential"; id: string }
  | { kind: "oauth"; id: string };

export type AutomationConnectionCandidate = {
  binding: ScenarioConnectionBinding;
  appId: string;
  label: string;
  accountLabel: string | null;
  masked: string | null;
  state: "verified" | "needs_reconnect";
  verifiedAt: string | null;
};

export type ScenarioConnectionResolution = {
  nodeId: string;
  state: "not_required" | "connected" | "needs_connection" | "needs_selection" | "needs_reconnect";
  binding: ScenarioConnectionBinding | null;
  candidates: AutomationConnectionCandidate[];
  autoBinding: ScenarioConnectionBinding | null;
};
```

`resolveNodeConnection(node, candidates)`는 app ID가 같은 safe candidates만 사용한다. current exact verified binding을 먼저 유지하고, binding이 없을 때 verified 후보가 정확히 하나인 경우만 `autoBinding`을 반환한다. stale explicit binding에는 다른 후보가 하나뿐이어도 autoBinding을 반환하지 않는다. `requiresCredential === false`는 binding을 비우고 `not_required`다.

candidate/binding ID는 빈 문자열·`pending-*`·과도한 길이를 거부한다. resolution은 label/masked를 count/length 제한하며 secret field를 받을 타입 자체가 없다.

- [ ] **Step 4: credential·OAuth candidate와 exact accessor 구현**

`automation-connection.service.ts`는 app registry를 기준으로 credential과 OAuth row를 합친다. 현재 app은 모두 scenario-enabled로 간주하되 registry가 `automationAvailable: false`를 제공하면 candidate에서 제외한다. 후속 ERP plan은 이 flag로 ERPNext를 Integration/Connection 화면에는 유지하고 scenario palette/candidate에서는 제외한다.

```ts
export function listAutomationConnectionCandidates(
  ownerId: string
): Promise<AutomationConnectionCandidate[]>;

export function resolveExactAutomationConnection(input: {
  ownerId: string;
  appId: string;
  binding: ScenarioConnectionBinding;
}): Promise<
  | { kind: "credential"; values: Record<string, string> }
  | { kind: "oauth"; accessToken: string }
>;
```

credential repository에는 same-owner/app/id를 검증하고 `verificationStatus === "verified"`, `verifiedAt`을 요구하는 server-only accessor를 추가한다. public `listCredentials`는 기존 secret-free 계약을 유지한다.

OAuth repository에는 exact ID read와 exact ID status update를 추가하고 기존 save/revoke/refresh mutation도 `oauth-tokens.json`의 `withJsonStoreLock` 안에서 수행하게 바꾼다. `token.service.ts`의 `getAccessTokenForBinding(ownerId, appId, tokenId)`는 app의 `oauthTarget` provider/service, token owner, active/verified/error와 expiry/refreshability를 모두 검증한다. unexpired access token은 그대로 사용하고, expired access token은 non-empty exact refresh token과 provider refresh support가 있을 때만 verified candidate로 유지한 뒤 exact token ID/account만 갱신한다. non-refreshable/refresh failure는 `needs_reconnect`로 갱신하며 provider/service first-match fallback을 사용하지 않는다. refresh 후 ID가 같음을 검증한다.

`verified-connection.service.ts`는 기존 connector summary와 새 candidate mapping이 서로 다른 connected 의미를 만들지 않도록 공용 status predicate를 사용한다. API route는 `requireOwnerContext` 후 safe candidates만 반환한다.

- [ ] **Step 5: candidate 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: candidate 0/1/N, OAuth service/account 구분, exact owner/app resolver, secret-isolation 회귀 통과.

Run: `npm.cmd run typecheck`

Expected: 새 binding/candidate files에 오류 없음. 기존 `src/lib/ai/errors.ts` baseline 오류만 있으면 별도 기록한다.

- [ ] **Step 6: connection foundation 커밋**

```powershell
git add src/lib/automation/scenario-connection-binding.ts src/lib/automation/automation-connection.service.ts src/lib/automation/credential.repository.ts src/lib/repositories/oauth-token.repository.ts src/lib/oauth/token.service.ts src/lib/integrations/verified-connection.service.ts app/api/automation/connections/route.ts tests/automation-connection-binding.test.ts tests/verified-connection-state.test.ts tests/credential-persistence.test.ts tests/oauth-owner-scope.test.ts
git commit -m "feat: unify automation connection candidates"
```

---

### Task 2: versioned scenario binding과 실행 전 server enforcement 구현

**Files:**

- Modify: `src/lib/automation/scenario-designer.ts`
- Modify: `src/lib/automation/scenario.repository.ts`
- Modify: `app/api/automation/scenarios/route.ts`
- Modify: `app/api/automation/ai-draft/route.ts`
- Modify: `app/api/automation/scenarios/[scenarioId]/route.ts`
- Modify: `app/api/automation/scenarios/[scenarioId]/run/route.ts`
- Modify: `tests/automation-connection-binding.test.ts`
- Modify: `tests/automation-scenario.test.ts`

**Interfaces:**

- Consumes: Task 1 candidate/resolution/exact resolver.
- Produces: versioned normalized scenarios, CAS save/status/binding patch, exact run-time connection gate.

- [ ] **Step 1: 실패하는 legacy·CAS·run gate 테스트 작성**

temp owner store에서 다음을 고정한다.

- legacy scenario without version reads as version 1.
- legacy `pending-notion` becomes unbound and does not pass validation.
- a real legacy credential ID becomes typed credential binding and resolves normally.
- new prompt drafts and `createScenarioNode` start with `connectionBinding: null`; fake pending ID가 없다.
- `/api/automation/ai-draft`도 legacy `saveScenario`를 직접 호출하지 않고 owner-derived explicit create API로 version 1/null bindings를 저장한다.
- reconcile with one candidate stores the binding and increments version once; identical retry is no-op with same version.
- two concurrent writes with expectedVersion 1: first succeeds, second is 409 and returns current safe scenario.
- JSON fallback에서도 `withJsonStoreLock` 때문에 같은 expectedVersion의 concurrent writes가 둘 다 성공하지 않는다.
- user-selected candidate must be same-owner, same-app, verified; arbitrary/cross-owner ID is 422 and never persists.
- valid explicit selection remains when multiple candidates exist.
- deleted/revoked/stale binding blocks run with safe `CONNECTION_RECONNECT_REQUIRED` issue.
- missing and ambiguous connections block run with different safe codes.
- server run revalidates after the browser loaded candidates; a later revoke still blocks.
- run response and validation issues contain no secret/token/provider body.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: scenario version/CAS/binding PATCH와 server resolver gate 부재로 실패한다.

- [ ] **Step 3: scenario type와 pure validation 전환**

`ScenarioNode.credentialId`를 `connectionBinding: ScenarioConnectionBinding | null`로 교체하고 `AutomationScenario.version: number`를 추가한다. read normalizer만 legacy fields를 typed shape로 바꾸며 GET 중 store를 쓰지 않는다. `pending-*`는 null이다. new scenario/version은 1이다.

repository는 create와 update 경계를 분리한다. `createScenario(ownerId, draft)`는 서버가 owner/version/normalized bindings를 정해 새 ID만 저장하고, 기존 ID에는 사용할 수 없다. collection POST와 `/api/automation/ai-draft`는 이 create API만 사용한다. existing scenario update/status/reconcile만 expectedVersion CAS API를 사용하며 old unrestricted `saveScenario` export는 제거한다.

`validateScenario`는 structural validation과 `ScenarioConnectionResolution[]`를 함께 받아 issue code를 확장한다.

```ts
type ScenarioValidationIssueCode =
  | "NO_TRIGGER"
  | "DISCONNECTED_NODE"
  | "EMPTY_SCENARIO"
  | "CONNECTION_REQUIRED"
  | "CONNECTION_SELECTION_REQUIRED"
  | "CONNECTION_RECONNECT_REQUIRED";
```

단순 non-null binding으로 valid 처리하지 않는다.

- [ ] **Step 4: repository version CAS와 binding patch 구현**

```ts
export function saveScenarioCas(
  ownerId: string,
  scenario: AutomationScenario,
  expectedVersion: number,
  candidates: AutomationConnectionCandidate[]
): Promise<AutomationScenario>;

export function patchScenarioConnections(input: {
  ownerId: string;
  scenarioId: string;
  expectedVersion: number;
  patch:
    | { mode: "reconcile" }
    | { mode: "select"; nodeId: string; binding: ScenarioConnectionBinding }
    | { mode: "clear"; nodeId: string };
}): Promise<{ scenario: AutomationScenario; changed: boolean; resolutions: ScenarioConnectionResolution[] }>;
```

모든 compare/increment는 scenario owner-document lock 안에서 한다. JSON fallback의 `mutateDocument`도 반드시 `withJsonStoreLock("automation-scenarios.json", ...)`로 전체 read/compare/write를 감싸 CAS가 실제로 원자적이게 한다. reconcile은 current scenario와 current candidates를 server-side로 읽고 truly unbound + exactly-one 후보만 바꾼다. no-op은 version을 올리지 않는다. `select`는 verified exact candidate를 요구한다. PUT에서 기존 binding을 변경할 때도 같은 검증을 적용한다. status update와 run count update도 expectedVersion/current version을 사용해 stale whole-object overwrite를 막는다.

route body:

- PUT `{ scenario, expectedVersion }` 또는 `{ status, expectedVersion }`.
- PATCH `{ expectedVersion, mode, nodeId?, binding? }`.
- 409 `{ error: { code: "SCENARIO_VERSION_CONFLICT", message }, scenario }`.
- 422 stable connection/binding validation error.

body의 ownerId/appId/account label/verification state는 신뢰하지 않는다.

- [ ] **Step 5: run-time exact resolver gate 구현**

run route는 owner scenario를 읽은 뒤 current candidates로 resolution하고 structural+connection validation을 통과해야 run을 기록한다. 각 bound node는 `resolveExactAutomationConnection({ ownerId, appId, binding })`으로 current secret/token handle을 확인한다. 현재 mock step은 handle을 response에 넣지 않고 즉시 버린다. 후속 real executor가 생기면 이 exact handle만 dependency로 전달한다.

active scenario toggle도 unresolved connection이 있으면 422로 거부한다. draft save는 unresolved 상태를 허용하되 arbitrary changed binding은 허용하지 않는다.

- [ ] **Step 6: scenario tests와 타입 검사**

Run: `npm.cmd test`

Expected: legacy migration, idempotent reconcile, version conflict, manual exact select, stale run rejection 통과.

Run: `npm.cmd run typecheck`

Expected: scenario route/repository/binding 타입 오류 없음. 별도 baseline AI error만 기록한다.

- [ ] **Step 7: versioned binding 커밋**

```powershell
git add src/lib/automation/scenario-designer.ts src/lib/automation/scenario.repository.ts app/api/automation/scenarios/route.ts app/api/automation/ai-draft/route.ts app/api/automation/scenarios/[scenarioId]/route.ts app/api/automation/scenarios/[scenarioId]/run/route.ts tests/automation-connection-binding.test.ts tests/automation-scenario.test.ts
git commit -m "feat: bind automation scenarios with version checks"
```

---

### Task 3: Automation UI를 truthful connection state로 전환

**Files:**

- Modify: `components/Automation/AutomationView.tsx`
- Modify: `components/Automation/AutomationSecondaryViews.tsx`
- Modify: `tests/automation-connection-binding.test.ts`
- Modify: `tests/automation-scenario.test.ts`
- Modify: `tests/client-api-resilience.test.ts`

**Interfaces:**

- Consumes: safe candidates, scenario version/PATCH, resolution state.
- Produces: automatic unique binding UX, multiple-account selection, reconnect state, 409-safe reload.

- [ ] **Step 1: 실패하는 UI behavior 테스트 작성**

runtime/pure helper fixture와 UI contract test로 다음을 고정한다.

- workspace load는 scenarios와 `/api/automation/connections` safe candidates를 병렬로 읽는다.
- active unbound node + one verified candidate는 reconcile PATCH 후 connected label을 표시하고 `연결 필요`를 숨긴다.
- two candidates는 PATCH로 임의 선택하지 않고 `계정 선택 필요`를 표시한다.
- inspector selection은 exact typed binding만 PATCH한다.
- stale selection은 `다시 연결 또는 계정 선택`이며 다른 계정으로 자동 교체하지 않는다.
- `연결됨`은 verified candidate일 때만 표시하고 needs-reconnect credential row는 연결됨으로 표시하지 않는다.
- connection save 후 candidate reload → active scenario reconcile이 실행된다.
- PATCH 409는 returned/latest scenario를 reload하고 unsaved local state를 성공으로 가장하지 않는다.
- response parse 실패나 network 실패는 기존 canvas를 지우지 않고 safe notice를 표시한다.
- node/account labels에는 safe account label/mask만 있고 secret/token이 없다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: UI가 아직 credential list와 `credentialId` truthiness를 사용해 실패한다.

- [ ] **Step 3: workspace load와 reconciliation 구현**

`AutomationView`는 scenarios, safe connections를 함께 읽고 active scenario를 선택한 뒤 pure resolution을 계산한다. autoBinding이 있는 active scenario에만 `{ mode: "reconcile", expectedVersion }` PATCH를 한 번 보낸다. success면 returned scenario/candidate state로 canvas를 교체한다. no-op/re-render loop를 만들지 않는다.

credential save success는 raw credential을 local array에 prepend하지 않고 safe connections를 다시 읽은 뒤 active reconcile을 호출한다. OAuth 연결 화면에서 돌아온 경우 initial load의 같은 flow가 동작한다.

save/status/run은 current `scenario.version`을 보낸다. 409는 최신 server scenario를 적용하고 사용자가 다시 편집하도록 안내한다. save가 끝나기 전에 run을 시작하지 않는다.

- [ ] **Step 4: inspector·node·connection manager 상태 구현**

node badge와 inspector는 `ScenarioConnectionResolution.state`만 사용한다.

- `connected`: safe account label, amber badge 없음.
- `needs_connection`: `연결 필요`.
- `needs_selection`: `계정 선택 필요`와 verified candidates selector.
- `needs_reconnect`: `다시 연결 또는 계정 선택`.
- `not_required`: 기존 내부 실행 안내.

select value는 JSON string을 직접 신뢰하지 않고 kind/id allowlist parser로 typed binding을 만들고 server PATCH 결과만 적용한다. Connection Manager의 `연결됨`도 safe verified candidate presence로 계산한다.

- [ ] **Step 5: UI 회귀·타입·전체 검증**

Run: `npm.cmd test`

Expected: 자동 단일 연결, 다중 선택, stale reconnect, 409 recovery, 기존 canvas/tabs/templates tests 통과.

Run: `npm.cmd run typecheck`

Expected: Automation 변경 파일 오류 없음. 별도 baseline AI error만 있으면 기록한다.

Run: `git diff --check`

Expected: whitespace 오류 없음.

- [ ] **Step 6: UI 커밋**

```powershell
git add components/Automation/AutomationView.tsx components/Automation/AutomationSecondaryViews.tsx tests/automation-connection-binding.test.ts tests/automation-scenario.test.ts tests/client-api-resilience.test.ts
git commit -m "fix: reconcile verified automation connections"
```

---

## Completion Checklist

- [ ] connection management의 verified credential/OAuth가 safe candidate로 보인다.
- [ ] 단일 verified candidate는 unbound node에 CAS로 자동 저장된다.
- [ ] 연결 후 node의 `연결 필요`가 사라진다.
- [ ] 다중 계정은 자동 선택하지 않고 `계정 선택 필요`다.
- [ ] stale explicit binding은 다른 계정으로 fallback하지 않는다.
- [ ] fake `pending-*` ID가 제거되고 legacy row가 안전하게 normalize된다.
- [ ] scenario save/status/binding이 version CAS를 사용한다.
- [ ] arbitrary/cross-owner/app-mismatched binding을 저장할 수 없다.
- [ ] run 직전 current exact credential/OAuth가 다시 검증된다.
- [ ] public API/UI/log에 secret, token, owner ID가 없다.
- [ ] 기존 Automation canvas/tabs/templates/run-history/guide가 유지된다.
- [ ] 전체 tests 통과, 변경 파일 typecheck clean, unrelated dirty files 미포함.
