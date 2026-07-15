# Business ERP Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 DREAMWISH 사이드바와 상단바를 그대로 유지하면서 비즈니스에 실제 ERPNext 데이터만 표시하는 반응형 `ERP` 탭을 추가하고, 기존 `영업·매출`·비즈니스 휴대폰 매출 UI와 캘린더의 `휴대폰에서 가져오기` UI를 제거한다.

**Architecture:** `BusinessHub`는 탭과 기존 비즈니스 기능만 조정하고, ERP 화면은 독립된 React 컴포넌트 묶음으로 분리한다. 서버는 암호화 credential과 분리된 owner-scoped connection identity/revision/capability record를 exact scope로 해석한 뒤, 읽기 전용 Frappe REST provider를 dashboard·CRM·AI가 공유할 정규화 경계로 노출한다. 연결 없음·부분 실패·오류·오래된 데이터 상태를 명시적으로 표현하며, 알 수 없는 금액을 `0`으로 만들지 않는다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Lucide React, native SVG, Node test harness (`scripts/run-tests.mjs`), existing encrypted credential repository.

## Global Constraints

- `docs/superpowers/specs/2026-07-15-business-suite-delivery-design.md`가 delivery order, product navigation, installer/local-gateway exclusion, immediate-save semantics에서 우선하고 나머지 ERP 상세 계약은 Business ERP design이 소유한다.

- `components/layout/Sidebar.tsx`, `components/layout/AppShell.tsx`, 전역 상단바는 수정하지 않는다.
- `src/lib/ai/errors.ts`의 기존 사용자 변경과 현재 추적되지 않은 파일은 건드리거나 커밋하지 않는다.
- ERPNext iframe, 두 번째 사이드바, 샘플 매출·회계 숫자, 새 차트 라이브러리를 추가하지 않는다.
- 연결되지 않은 상태에서는 금액 자리에 `연결 후 표시`, 연결되었지만 값이 없는 상태에서는 `데이터 없음`을 표시한다. 확인된 `0`만 `₩0`으로 표시한다.
- ERPNext 토큰은 서버에만 머물고 React props, 응답 JSON, 브라우저 저장소, 로그, 오류 메시지에 포함하지 않는다.
- 서버 연결은 공개 HTTPS 루트 URL만 허용한다. 사용자 정보, 쿼리, 프래그먼트, localhost, 사설·링크 로컬·멀티캐스트 주소를 거부한다. 로컬 게이트웨이와 설치 도우미는 승인된 범위에서 제외한다.
- 공유 필드명은 `connectionState`와 `connectionMode`다. mode는 `server | null`이며 `local`, `local_gateway`, `status`, `source` alias를 만들지 않는다. freshness는 별도 `stale` flag다.
- connection record는 endpoint/credential identity용 `connectionRevision`과 권한 변경용 `capabilityVersion`을 분리하고 `customer_search`, `customer_read`, `draft_write` capability를 가진다. 처음 두 read capability는 true, `draft_write`는 false이며 request body가 arbitrary capability를 부여하지 못한다. capability-only 변경은 CRM mapping을 무효화하지 않는다.
- 이 increment는 owner당 active ERPNext connection을 하나만 허용한다. 재연결은 기존 ERPNext credential/identity를 원자적 replace workflow로 교체하고 default 선택 ambiguity를 만들지 않는다.
- 모든 CRM/AI customer/item read는 `ExactConnectionScope` 또는 `ExactMappedCustomerScope`를 사용한다. ERP layer는 CRM/AI를 import하지 않는다.
- 기존 `/api/business/revenue`, revenue repository, mobile-companion 참고 코드는 삭제하지 않는다. 비즈니스 UI에서만 제거한다.
- 기존 device/calendar candidate API와 저장 데이터는 삭제하지 않고 `CalendarView`의 휴대폰 가져오기 button/modal/fetch state만 제거한다.
- 선행 의존성: `docs/superpowers/plans/2026-07-15-automation-connection-binding.md`를 먼저 완료한다. ERPNext credential route를 확장할 때 typed scenario binding, unified safe candidates, exact owner/app resolver를 보존한다. 같은 canonical `erpnext` credential을 두 번째 secret store에 복사하지 않으며, `appId === "erpnext"` 연결이 필요한 호환 노드에만 safe candidate projection을 노출한다.
- 모든 새 한국어 소스는 UTF-8로 저장한다.
- 기준 명세: `docs/superpowers/specs/2026-07-15-business-erp-dashboard-design.md`.
- Frappe 호출은 공식 REST 계약을 따른다: `https://docs.frappe.io/framework/user/en/api/rest`. 회계 의미는 공식 ERPNext 보고서 정의를 따른다: `https://docs.frappe.io/erpnext/accounting-reports`.
- `scripts/run-tests.mjs`는 현재 filename 인자를 무시하므로 이 계획의 `npm.cmd test`는 모두 전체 suite 실행이다. 현재 baseline typecheck의 `src/lib/ai/errors.ts` 오류는 사용자 변경 debt로 분리하고 ERP 작업에서 수정하지 않는다.

## File Structure

- `src/lib/erp/erp-connection.types.ts`: provider ID, connection health/mode, identity revision, capability version, exact scopes.
- `src/lib/erp/erp-connection.repository.ts`: credential과 분리된 owner-scoped connection metadata.
- `src/lib/erp/erp-connection.service.ts`: verified connection registration, default/exact resolution, server-only secret join.
- `src/lib/erp/erp-provider-errors.ts`: safe typed provider/capability/scope errors.
- `src/lib/erp/erp-dashboard.types.ts`: normalized dashboard and monthly-sales contracts.
- `src/lib/erp/erp-dashboard.provider.ts`: provider-neutral dashboard interface.
- `src/lib/erp/erp-business-provider.ts`: exact customer/item read interface consumed by CRM/AI.
- `src/lib/erp/erp-provider-registry.ts`: provider ID to typed dashboard/business provider resolution.
- `src/lib/erp/erpnext-*.ts`: secure ERPNext transport, client, and provider implementations.
- `components/Business/erp/**`: read-only responsive presentation.
- `app/api/business/erp/**`: thin authenticated transports; no credential fields.

---

### Task 1: 공유 ERP connection/provider와 dashboard 계약을 테스트로 고정

**Files:**

- Create: `src/lib/erp/erp-connection.types.ts`
- Create: `src/lib/erp/erp-provider-errors.ts`
- Create: `src/lib/erp/erp-dashboard.types.ts`
- Create: `src/lib/erp/erp-dashboard.provider.ts`
- Create: `src/lib/erp/erp-business-provider.ts`
- Create: `src/lib/erp/erp-provider-registry.ts`
- Create: `src/lib/erp/erp-dashboard.service.ts`
- Create: `src/lib/erp/erp-dashboard-format.ts`
- Create: `src/lib/erp/erp-links.ts`
- Create: `tests/erp-provider-contract.test.ts`
- Create: `tests/erp-dashboard-normalization.test.ts`

- [ ] **Step 1: 실패하는 계약·정규화 테스트 작성**

`tests/erp-provider-contract.test.ts`와 `tests/erp-dashboard-normalization.test.ts`에 다음 동작을 먼저 고정한다.

```ts
test("ERP dashboard keeps verified zero distinct from an unavailable value", () => {
  const snapshot = normalizeErpDashboardSnapshot({
    company: { externalId: "DreamWish Co", name: "DreamWish Co" },
    accountingPeriod: { start: "2026-07-01", end: "2026-07-31", label: "2026년 7월" },
    currency: "KRW",
    asOf: "2026-07-15T03:00:00.000Z",
    metrics: {
      monthlySales: { value: 0, changePercent: null, comparisonLabel: null },
      monthlyPurchases: { value: null, changePercent: null, comparisonLabel: null }
    }
  }, { now: new Date("2026-07-15T03:01:00.000Z"), expectedBaseUrl: null });

  assert.equal(snapshot.metrics.monthlySales.value, 0);
  assert.equal(snapshot.metrics.monthlyPurchases.value, null);
  assert.equal(formatErpMoney(0, "KRW", "데이터 없음"), "₩0");
  assert.equal(formatErpMoney(null, "KRW", "데이터 없음"), "데이터 없음");
});
```

같은 파일에 다음 경우를 추가한다.

- `notConfiguredErpDashboardSnapshot()`과 `notConfiguredErpDashboardSnapshot("disconnected")`의 모든 금액·비교·company·accountingPeriod·currency·asOf는 `null`이고 배열과 ERP link는 비어 있다.
- signed return까지 반영한 월 매출·매입과 순이익은 음수일 수 있다.
- 미수금·미지급금·재고 가치의 음수와 모든 `NaN`/`Infinity`는 거부한다.
- 비교값이 없으면 `changePercent`와 `comparisonLabel`을 모두 `null`로 만든다.
- 일부 섹션 경고가 있으면 `connectionState`가 `degraded`가 된다. sales metric, trend, breakdown warning은 독립되어 breakdown 실패가 검증된 monthly-sales metric을 지우지 않는다.
- `asOf`가 15분보다 오래되면 `stale: true`가 된다.
- 미연결/error snapshot은 통화를 추측하지 않고 `currency: null`이다. 연결된 snapshot의 통화 코드가 없거나 잘못되면 정상 snapshot을 만들지 않고 `ERP_RESPONSE_INVALID`로 실패한다.
- quick action과 record 링크는 검증된 ERPNext origin, 고정 route ID, 인코딩된 document name으로만 만들어진다.
- connection defaults는 `connectionMode: "server"`, `connectionRevision: 1`, `capabilityVersion: 1`, `customer_search: true`, `customer_read: true`, `draft_write: false`이고 disconnected state의 mode는 `null`이다.
- `ExactConnectionScope`는 owner/connection/revision/site/company를 모두 요구하며 `ExactMappedCustomerScope`만 mapping/version/customer ID를 추가한다.
- dashboard/business provider interface에는 arbitrary path, generic request, raw payload method가 없다.

- [ ] **Step 2: 전체 테스트를 실행해 새 모듈 부재로 실패 확인**

Run: `npm.cmd test`

Expected: `erp-dashboard-normalization.test.ts`가 새 ERP 모듈을 찾지 못하거나 새 export가 없어 실패한다.

- [ ] **Step 3: 전체 타입 계약 구현**

`erp-connection.types.ts`와 provider-neutral files에 아래 공유 계약을 먼저 완성한다.

```ts
export type ErpProviderId = "erpnext";
export type ErpConnectionState =
  | "not_configured"
  | "disconnected"
  | "connected"
  | "degraded"
  | "error";
export type ErpConnectionMode = "server" | null;
export type ActiveErpConnectionMode = Exclude<ErpConnectionMode, null>;
export type ErpCapability = "customer_search" | "customer_read" | "draft_write";

export type ErpConnectionIdentity = {
  ownerId: string;
  provider: ErpProviderId;
  connectionId: string;
  connectionRevision: number;
  capabilityVersion: number;
  connectionMode: ActiveErpConnectionMode;
  externalSiteId: string;
  externalCompanyId: string;
  companyCurrency: string;
  companyTimezone: string;
  accountLabel: string;
  capabilities: Readonly<Record<ErpCapability, boolean>>;
  verifiedAt: string;
};

export type ExactConnectionScope = Pick<ErpConnectionIdentity,
  | "ownerId" | "connectionId" | "connectionRevision"
  | "externalSiteId" | "externalCompanyId"
>;

export type ExactMappedCustomerScope = ExactConnectionScope & {
  mappingId: string;
  mappingVersion: number;
  externalCustomerId: string;
};
```

`erp-dashboard.types.ts`는 위 contract를 import하고 아래 normalized types를 정의한다.

```ts

export type ErpMetricValue = {
  value: number | null;
  changePercent: number | null;
  comparisonLabel: string | null;
};

export type ErpActivity = {
  id: string;
  documentType: "sales_invoice" | "purchase_order" | "payment_entry" | "material_request" | "quotation";
  documentName: string;
  label: string;
  amount: number | null;
  statusLabel: string | null;
  occurredAt: string;
};

export type ErpReceivable = {
  customerId: string;
  customerName: string;
  outstanding: number | null;
  overdue30: number | null;
  overdue60: number | null;
};

export type ErpInventoryItem = {
  itemCode: string;
  itemName: string;
  value: number | null;
};

export type ErpQuickActionId =
  | "quotation" | "sales_order" | "sales_invoice" | "payment_entry"
  | "material_request" | "purchase_order" | "purchase_invoice"
  | "item" | "warehouse" | "stock_balance" | "reports";

export type ErpQuickAction = {
  id: ErpQuickActionId;
  label: string;
};

export type ErpDashboardSection =
  | "sales_metric" | "sales_trend" | "sales_breakdown"
  | "purchases" | "profit" | "receivables" | "payables"
  | "inventory" | "activity";
export type ErpDashboardWarningCode =
  | "SALES_METRIC_UNAVAILABLE" | "SALES_TREND_UNAVAILABLE"
  | "SALES_BREAKDOWN_UNAVAILABLE" | "PURCHASES_UNAVAILABLE" | "PROFIT_UNAVAILABLE"
  | "RECEIVABLES_UNAVAILABLE" | "PAYABLES_UNAVAILABLE"
  | "INVENTORY_UNAVAILABLE" | "ACTIVITY_UNAVAILABLE" | "DATA_TRUNCATED";
export type ErpDashboardErrorCode =
  | "ERP_AUTH_FAILED" | "ERP_CONNECTION_INVALID" | "ERP_RATE_LIMITED"
  | "ERP_UNAVAILABLE" | "ERP_RESPONSE_INVALID";

export type ErpDashboardSnapshot = {
  connectionState: ErpConnectionState;
  connectionMode: ErpConnectionMode;
  company: { externalId: string; name: string } | null;
  accountingPeriod: {
    start: string;
    end: string;
    label: string;
  } | null;
  asOf: string | null;
  stale: boolean;
  currency: string | null;
  metrics: {
    monthlySales: ErpMetricValue;
    monthlyPurchases: ErpMetricValue;
    monthlyNetProfit: ErpMetricValue;
    receivables: ErpMetricValue;
    payables: ErpMetricValue;
    inventoryValue: ErpMetricValue;
  };
  salesTrend: Array<{ period: string; value: number | null }>;
  salesBreakdown: Array<{ label: string; value: number | null }>;
  recentActivity: ErpActivity[];
  receivables: ErpReceivable[];
  inventory: ErpInventoryItem[];
  quickActions: ErpQuickAction[];
  erpLaunchUrl: string | null;
  warningCodes: ErpDashboardWarningCode[];
  unavailableSections: ErpDashboardSection[];
  warning: string | null;
};

export type ErpMonthlySalesSnapshot = {
  connectionState: ErpConnectionState;
  connectionMode: ErpConnectionMode;
  company: ErpDashboardSnapshot["company"];
  accountingPeriod: ErpDashboardSnapshot["accountingPeriod"];
  value: number | null;
  currency: string | null;
  changePercent: number | null;
  asOf: string | null;
  stale: boolean;
  warningCodes: ErpDashboardWarningCode[];
};
```

`erp-dashboard.provider.ts`는 `getDashboardSnapshot(scope, options)`와 `getMonthlySalesSnapshot(scope, options)`만 가진 `ErpDashboardProvider`를 정의한다. `erp-business-provider.ts`는 다음 read boundary와 bounded DTO를 소유한다.

```ts
export interface ErpBusinessReadProvider {
  searchCustomers(input: ExactConnectionScope & { query: string }): Promise<ErpCustomerCandidate[]>;
  verifyCustomer(input: ExactConnectionScope & { externalCustomerId: string }): Promise<ErpCustomerIdentity>;
  getCustomerContext(input: ExactMappedCustomerScope): Promise<ErpCustomerContext>;
  searchItems(input: ExactConnectionScope & { query: string }): Promise<ErpItemCandidate[]>;
}

export type ErpCustomerCandidate = {
  externalCustomerId: string;
  label: string;
  company: string | null;
  email: string | null;
  phone: string | null;
};

export type ErpCustomerIdentity = ErpCustomerCandidate & { modifiedAt: string };
```

`ErpCustomerContext`는 connection/request state, exact connection/site/company/customer/mapping identifiers, currency/asOf/stale, receivables, overdue receivables, open orders/invoices, recent payments, allowlisted warnings를 포함한다. 문서는 각각 amount/currency/modifiedAt을 가지며 orders/invoices 10, payments 5, warnings 8이 최대다. `ErpItemCandidate`는 exact item code/label/modifiedAt과 bounded verified UOM/price choices만 포함한다. `erp-provider-registry.ts`는 `getDashboardProvider(provider)`와 `getBusinessProvider(provider)`만 노출하고 unsupported provider/capability/scope는 `erp-provider-errors.ts`의 safe typed error로 fail closed한다. Draft methods는 AI plan이 이 read interface를 확장하되 기본 `draft_write: false`를 바꾸지 않는다.

- [ ] **Step 4: 정규화·포맷 구현**

`erp-dashboard.service.ts`에서 다음을 구현한다.

- `notConfiguredErpDashboardSnapshot(state?: "not_configured" | "disconnected")`
- `errorErpDashboardSnapshot(code: ErpDashboardErrorCode)`
- `normalizeErpDashboardSnapshot(input: unknown, options?: { now?: Date; expectedBaseUrl?: URL | null })`
- `calculateChangePercent(current, previous)`는 `(current - previous) / Math.abs(previous) * 100`; 이전 값이 `0` 또는 알 수 없으면 `null`.
- 상태 계산: 경고 없음 `connected`, 일부 섹션 실패 `degraded`, 치명 오류 `error`; mode는 연결 없음/error factory에서 `null`, server provider snapshot에서 `server`다.
- `not_configured`와 `disconnected` factory는 모든 metric/comparison, company, accountingPeriod, currency, asOf를 `null`로 만들고 모든 배열과 ERP link를 비운다. disconnect 또는 identity revision 변경은 이전 cache를 지우며 temporary fetch failure만 원래 `asOf`를 보존한 `stale: true` snapshot을 렌더링할 수 있다.
- 최대 배열 크기: 추이 12, 구분 8, 최근 활동 12, 미수금 5, 재고 5, 바로가기 11.
- `warning`은 upstream 문자열을 받지 않고 `warningCodes`의 고정 한국어 문구로만 만든다.
- row identity는 확인되지만 금액이 누락된 경우 row를 버리거나 0으로 바꾸지 않고 해당 금액을 `null`로 유지한다. 하나라도 불완전한 raw row가 합계에 포함되면 그 합계도 `null`이다.
- `erpLaunchUrl`은 `options.expectedBaseUrl`의 정규화된 HTTPS root origin과 정확히 일치할 때만 유지하고, provider payload나 document field에서 받은 URL은 무시한다. 미연결 snapshot만 `expectedBaseUrl: null`을 사용한다.

`erp-dashboard-format.ts`에는 브라우저와 서버에서 동일하게 쓰는 아래 함수를 구현한다.

```ts
export function formatErpMoney(value: number | null, currency: string | null, unavailable: string) {
  if (value === null || currency === null) return unavailable;
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}
```

`erp-links.ts`에는 외부에서 받은 임의 href 대신 union ID로만 URL을 만드는 `buildErpQuickActionHref(baseUrl, id)`와 `buildErpRecordHref(baseUrl, documentType, documentName)`를 구현한다. 두 함수는 공개 HTTPS root origin을 다시 검증하고, 고정 path map과 `encodeURIComponent(documentName)`만 사용하며 query/fragment를 만들지 않는다.

- [ ] **Step 5: 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: 새 정규화 테스트를 포함한 전체 테스트 통과.

Run: `npm.cmd run typecheck`

Expected: ERP 파일에서 오류 없음. 기존 사용자 변경에서 선행 오류가 있으면 정확한 파일과 오류만 기록하고 이 작업의 오류와 구분한다.

- [ ] **Step 6: 계약 단위 커밋**

```powershell
git add src/lib/erp/erp-connection.types.ts src/lib/erp/erp-provider-errors.ts src/lib/erp/erp-dashboard.types.ts src/lib/erp/erp-dashboard.provider.ts src/lib/erp/erp-business-provider.ts src/lib/erp/erp-provider-registry.ts src/lib/erp/erp-dashboard.service.ts src/lib/erp/erp-dashboard-format.ts src/lib/erp/erp-links.ts tests/erp-provider-contract.test.ts tests/erp-dashboard-normalization.test.ts
git commit -m "feat: define ERP dashboard contract"
```

---

### Task 2: 소유자별 검증 완료 ERPNext 연결 추가

**Files:**

- Modify: `src/lib/automation/app-registry.ts`
- Modify: `src/lib/automation/action-registry.ts`
- Modify: `src/lib/automation/scenario-designer.ts`
- Modify: `src/lib/automation/automation-connection.service.ts`
- Modify: `src/lib/automation/credential.repository.ts`
- Modify: `src/lib/integrations/credential-verifier.ts`
- Create: `src/lib/integrations/verified-credential.service.ts`
- Create: `src/lib/erp/erpnext-url.ts`
- Create: `src/lib/erp/erpnext-http.ts`
- Create: `src/lib/erp/erp-connection.repository.ts`
- Create: `src/lib/erp/erp-connection.service.ts`
- Modify: `app/api/automation/credentials/route.ts`
- Modify: `app/api/automation/credentials/[credentialId]/route.ts`
- Modify: `app/api/integrations/credentials/[connectorId]/route.ts`
- Modify: `app/api/integrations/[connectorId]/disconnect/route.ts`
- Create: `public/automation-icons/erpnext.svg`
- Create: `tests/erpnext-connection.test.ts`
- Create: `tests/verified-credential-recovery.test.ts`
- Modify: `tests/integration-credential-verification.test.ts`
- Modify: `tests/automation-app-registry.test.ts`
- Modify: `tests/verified-connection-state.test.ts`

- [ ] **Step 1: 실패하는 URL·연결 격리 테스트 작성**

다음을 먼저 테스트한다.

- `https://erp.example.com`은 정규화되어 `https://erp.example.com/`이 된다.
- HTTP, 사용자 정보 포함 URL, 쿼리, 프래그먼트, 하위 경로, localhost, `.local`, 사설 IPv4/IPv6를 거부한다.
- DNS 조회 결과 중 하나라도 사설 주소이면 서버 연결을 거부한다. resolver는 테스트에서 주입한다.
- pinned HTTPS transport의 `lookup` callback은 검증한 공개 IP만 같은 요청에 사용하고 원래 hostname을 TLS SNI/certificate 검증에 유지한다.
- transport 기본/GET 요청은 body가 없고, allowlisted POST만 256KB 이하 JSON object를 받는다. GET+body, unsupported method, oversized/non-object body, redirect, non-JSON response는 bytes 전송 또는 응답 수용 전에 거부한다.
- `verifyIntegrationCredential("erpnext", { baseUrl, company, apiKey, apiSecret }, fetcher, dependencies)`가 `Authorization: token apiKey:apiSecret`으로 logged-user, 지정 Company, System Settings 문서를 확인한다.
- ERP credential 검증의 401, 429, 5xx, timeout fixture가 각각 기존 `PROVIDER_*` code로 정규화되고 raw body/token을 노출하지 않는다.
- owner A가 저장한 `erpnext` credential/metadata는 owner B의 `loadDefaultOwnerErpConnection`/`resolveExactErpNextConnection`에서 보이지 않는다.
- 반환 연결 객체에는 `apiKey`/`apiSecret`이 서버 내부에만 존재하고 공개 credential 메타데이터에는 암호문도 없다.
- verified save는 exact canonical credential ID를 참조하는 `connectionRevision: 1`, `capabilityVersion: 1` identity metadata를 만들고 secret을 복제하지 않는다. read capabilities는 true, `draft_write`는 false다. reconnect/site/company/credential 변경은 `connectionRevision`을 증가시키고 안전하게 `draft_write: false`로 되돌리면서 `capabilityVersion`도 증가시킨다. capability-only 변경은 `connectionRevision`을 건드리지 않는다. disconnect는 metadata를 revoke한다.
- Company document의 `default_currency`와 `time_zone` 또는 System Settings의 검증된 IANA zone을 metadata로 저장하며 request body가 이 verified 결과를 덮지 못한다.
- ERP verifier의 normalized URL/site/company/currency/timezone은 typed server-only metadata channel로 두 credential save route에서 registration service까지 전달되고 public response에서는 제거된다.
- Automation safe-candidate API와 Business connection-status GET은 같은 canonical credential ID의 secret-free projection이며 별도 ERP credential row를 만들지 않는다.
- app registry의 `/automation-icons/erpnext.svg`가 실제 파일로 존재하고 credential UI에서 깨진 이미지를 만들지 않는다.
- ERPNext는 Integration/Connection catalog에는 나타나지만 Automation scenario palette에는 나타나지 않고 `listAutomationActions("erpnext")`가 generic create/update/delete/custom-request를 반환하지 않는다.
- automation app registry count/coverage test는 새 integration-only entry를 포함하되 selectable actions requirement를 automation-enabled apps에만 적용한다.
- per-credential DELETE로 ERPNext credential을 지워도 matching connection metadata가 같은 owner workflow에서 revoke되어 stale dashboard connection을 남기지 않는다.
- owner당 active ERPNext credential/connection은 0 또는 1개다. reconnect는 sole active pair를 교체하고 disconnect 뒤 다른 legacy credential로 자동 fallback하지 않는다.
- reconnect/save/delete/disconnect workflow의 각 durable phase 직후 process crash fixture를 재시작하면 recovery가 old committed generation 또는 fully staged new generation 중 하나만 노출하고 credential/identity half-state를 공개하지 않는다.
- 같은 owner/provider의 concurrent reconnect 두 개는 generation fence로 하나만 commit하며 stale recovery/compensation이 newer generation을 덮어쓰지 않는다.
- future `dispatching` ERP draft attempt가 있으면 reconnect, per-credential delete와 bulk disconnect가 같은 connection-store barrier에서 409로 차단되고 credential을 먼저 지우지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: `erpnext` 앱 정의, URL validator, owner connection loader가 없어 실패한다.

- [ ] **Step 3: 앱 레지스트리와 검증 구현**

`app-registry.ts`에 `automationAvailable: boolean`을 추가하고 기존 앱은 true로 normalize한다. 정확히 한 개의 integration-only 서버 연결 앱을 false로 추가한다.

```ts
token("erpnext", "ERPNext", "#2490EF", [
  field("baseUrl", "ERPNext URL", false, "https://erp.example.com"),
  field("company", "Company", false),
  field("apiKey", "API Key"),
  field("apiSecret", "API Secret")
], "공개 HTTPS ERPNext 주소를 연결합니다. 기본 연결은 조회 전용이며 ERPNext에서는 최소 조회 권한 API 사용자를 별도로 만드세요. AI 초안 쓰기는 별도 기능에서 명시적으로 켤 때만 허용됩니다.", { automationAvailable: false })
```

`public/automation-icons/erpnext.svg`는 48×48 viewBox, 파란 rounded square, 흰색 `E` path만 포함하는 자체 아이콘으로 만들고 외부 이미지나 runtime font에 의존하지 않는다.

`scenario-designer.ts`는 `automationAvailable` apps만 module catalog에 넣는다. 선행 Automation plan의 `automation-connection.service.ts`도 false app을 scenario binding candidate에서 제외하되 Integration/Connection UI용 verified state에는 유지한다. `action-registry.ts`는 false app에 빈 action list를 반환해 common fallback의 create/update/delete/custom-request를 절대 노출하지 않는다. `tests/automation-app-registry.test.ts`의 count를 새 registry와 맞추고 action 최소 개수 assertion을 enabled apps에만 적용하며 ERPNext zero-action/integration-visible/no-binding-candidate contract를 별도로 고정한다.

`erpnext-url.ts`에 `normalizeServerErpNextUrl`, IANA timezone validator, 공개 IP 판별을 구현한다. Node `dns/promises.lookup(host, { all: true, verbatim: true })` 결과의 모든 주소를 검사한다.

`erpnext-http.ts`에는 Node `https.request` 기반 `ErpNextTransport`를 구현한다. resolver로 공개 주소를 한 번 확정한 뒤 같은 request의 custom `lookup` callback이 그 주소만 반환하게 해 DNS 검사와 연결 사이의 재해석을 막는다. 원래 hostname은 `servername`에 사용하고 `rejectUnauthorized: true`, redirect 미지원, JSON content-type 확인, 2MB response byte limit, parent AbortSignal을 적용한다. transport method는 `GET | POST`만 허용하고 기본값은 `GET`이다. `GET`은 body를 거부하며 `POST`는 provider가 만든 256KB 이하 JSON object만 직렬화하고 `Content-Type: application/json`을 강제한다. URL/path와 body는 transport가 아니라 상위 allowlisted provider가 만들며 사용자 입력 URL·doctype·method를 그대로 전달하지 않는다. HTTP status와 timeout/network 원인을 보존하되 body는 보존하지 않는 `ErpNextTransportError`를 사용한다. 테스트는 transport를 주입하므로 실제 DNS나 네트워크를 사용하지 않는다.

`verifyIntegrationCredential`에는 기존 호출과 호환되는 네 번째 optional dependencies 객체를 추가한다.

```ts
type ErpNextTransport = (
  url: URL,
  options: {
    method?: "GET" | "POST";
    headers: Record<string, string>;
    body?: Record<string, unknown>;
    signal?: AbortSignal;
  }
) => Promise<Record<string, unknown>>;

type CredentialVerifierDependencies = {
  erpTransport?: ErpNextTransport;
  resolveAddresses?: ResolveAddresses;
};

type CredentialVerifier = (
  values: Record<string, string>,
  fetcher: Fetcher,
  dependencies: CredentialVerifierDependencies
) => Promise<CredentialVerificationResult>;

type ErpNextVerifiedServerMetadata = {
  kind: "erpnext";
  normalizedBaseUrl: string;
  externalSiteId: string;
  externalCompanyId: string;
  companyCurrency: string;
  companyTimezone: string;
};

type CredentialVerificationResult = {
  accountLabel: string;
  providerAccountId: string | null;
  serverMetadata: ErpNextVerifiedServerMetadata | null;
};
```

`verifyIntegrationCredential(appId, values, fetcher = fetch, dependencies = {})`가 dependencies를 선택된 verifier에 전달한다. 기존 app verifier는 세 번째 인자를 사용하지 않으므로 호출 계약과 기존 테스트는 유지된다.

`credential-verifier.ts`의 `VERIFY`에 `erpnext` 분기를 추가한다. URL 검증 후 검증 전용 8초 AbortController와 pinned transport로 logged-user, exact Company, System Settings를 GET하고 redirect는 거부한다. Company `default_currency`와 system `time_zone`을 ISO 4217/IANA로 검증하며 request body의 통화·timezone을 사용하지 않는다. `finally`에서 timer를 정리하고 `ErpNextTransportError`를 기존 `IntegrationCredentialError`로 매핑한다: 401/403→`PROVIDER_AUTH_FAILED`, 429→`PROVIDER_RATE_LIMITED`, timeout/network/5xx→`PROVIDER_UNAVAILABLE`, malformed JSON/schema→`PROVIDER_RESPONSE_INVALID`. upstream body와 토큰은 message에 넣지 않는다.

```ts
const headers = { Authorization: `token ${values.apiKey}:${values.apiSecret}` };
const request = dependencies.erpTransport || createPinnedErpNextTransport(dependencies.resolveAddresses);
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 8_000);
const user = await request(new URL("/api/method/frappe.auth.get_logged_user", base), { headers, signal: controller.signal });
const company = await request(new URL(`/api/resource/Company/${encodeURIComponent(values.company)}`, base), { headers, signal: controller.signal });
const systemSettings = await request(new URL("/api/resource/System%20Settings/System%20Settings", base), { headers, signal: controller.signal });
clearTimeout(timer);
return {
  accountLabel: `${values.company} · ${String(user.message)}`,
  providerAccountId: String(user.message),
  serverMetadata: {
    kind: "erpnext",
    normalizedBaseUrl: base.href,
    externalSiteId: base.origin,
    externalCompanyId: values.company,
    companyCurrency: parsedCompanyCurrency,
    companyTimezone: parsedCompanyTimezone
  }
};
```

실제 구현은 위 세 request와 `clearTimeout`을 `try/catch/finally`로 감싸 timer 정리와 typed error mapping을 보장한다.

회사 문서가 없거나 권한이 없으면 검증에 실패하고 credential을 저장하지 않는다.

- [ ] **Step 4: durable connection metadata와 server-only secret resolution 구현**

두 credential POST route는 공용 `persistVerifiedIntegrationCredential` service만 호출한다. service가 verifier 결과를 메모리에서 받아 `serverMetadata.kind === "erpnext"`이면 owner/provider-scoped durable staged workflow를 시작한다. in-process rollback만으로 두 store 원자성을 주장하지 않는다.

connection owner document가 workflow journal과 monotonic `connectionGeneration`, `identityMutationOperationId`를 함께 소유한다. 한 owner/provider에는 한 workflow만 진행할 수 있다. replace/delete/disconnect는 먼저 같은 connection-store lock에서 active ERP draft dispatch가 없음을 확인하고 operation ID/generation barrier를 기록한다. 이후 credential store에는 prior active row를 유지한 채 new row를 `{ lifecycle: "pending", workflowOperationId, generation }`로 stage하고, connection store에는 matching staged identity를 기록한다. 둘 다 exact ID/verified metadata hash로 확인된 뒤 connection-store lock에서 journal을 `committed`로 바꾸고 sole visible generation을 전환한다. public credential list/default/exact resolver는 committed generation과 matching staged/active pair만 노출하므로 어느 phase에서도 credential A + identity B를 조합하지 않는다. 마지막 finalize가 new credential을 active, prior pair를 retired/revoked로 바꾸고 barrier를 지운다.

delete/disconnect도 credential을 먼저 물리 삭제하지 않고 retiring credential + staged revoke를 journal에 기록한 뒤 committed disconnected generation으로 전환하고 cleanup한다. journal에는 operation/generation/record IDs, phase와 verified metadata hash만 저장하고 plaintext secret, verifier metadata body, rollback snapshot을 넣지 않는다. 모든 ERP credential list/save/delete, integration disconnect, `loadDefaultOwnerErpConnection`과 `resolveExactErpNextConnection` entry에서 bounded recovery를 먼저 실행한다. `planned`, `credential_staged`, `both_staged`, `committed` phase를 exact operation ID로 resume/abort/finalize하고 stale worker write는 generation CAS로 거부한다. 두 durable sides가 불일치해 deterministic recovery가 불가능하면 아무 pair도 노출하지 않고 `ERP_CONNECTION_INVALID`로 fail closed한다.

기존 per-credential DELETE와 bulk integration disconnect route도 `deleteVerifiedIntegrationCredential`/`disconnectVerifiedIntegrationCredentials` service로 변경한다. service는 same-owner app ID를 server-side 해석하고 위 journal/barrier를 거친 뒤 public result만 반환한다. 기존 정적 `deleteCredentialsByApp` 직접-call test는 공용 verified-delete workflow와 ERP metadata revoke/dispatch barrier 계약으로 갱신한다.

verified credential workflow에서 `stageVerifiedErpNextConnection`은 exact normalized URL/site/company/currency/timezone을 request body가 아니라 typed verifier metadata에서만 복사한다. committed reconnect/update는 `connectionRevision`을 증가시키고 `draft_write`를 false로 되돌린 새 `capabilityVersion`을 저장한다. 단순 capability toggle은 후속 AI plan의 별도 CAS에서 `capabilityVersion`만 증가시킨다. credential disconnect/delete route는 같은 owner committed generation을 revoked로 전환해 default/exact resolver에서 즉시 제외한다.

모든 identity mutation은 direct repository write가 아니라 `beginErpIdentityMutation`/stage/commit/finalize API를 사용한다. Task 7이 draft attempt를 같은 connection owner document에 추가하면 `beginErpIdentityMutation`은 active `dispatching` attempt를 `409 DRAFT_DISPATCH_IN_FLIGHT`로 거부한다. identity mutation barrier가 먼저 commit되면 `beginErpDraftDispatch`는 fail closed하고, dispatch가 먼저 commit되면 reconnect/delete/disconnect가 credential 변경 전에 409를 반환한다.

`loadDefaultOwnerErpConnection`은 sole active record만 반환한다. legacy multiple-active metadata가 발견되면 newest verified credential ID와 exact matching metadata가 하나인 경우만 idempotent reconciliation로 나머지를 revoke하고, 동률/불일치면 `ERP_CONNECTION_INVALID`로 fail closed해 사용자가 재연결하게 한다. default를 최근 항목으로 조용히 바꾸거나 disconnect 후 다른 회사로 fallback하지 않는다. `listOwnerErpConnections`는 이 increment에서 0/1 active public identities만 반환한다.

```ts
export function registerVerifiedErpNextConnection(input: RegisterVerifiedErpNextConnectionInput): Promise<ErpConnectionIdentity>;
export function listOwnerErpConnections(ownerId: string): Promise<ErpConnectionIdentity[]>;
export function getOwnerErpConnectionStatus(ownerId: string): Promise<"not_configured" | "disconnected" | "connected" | "invalid">;
export function loadDefaultOwnerErpConnection(ownerId: string): Promise<ErpConnectionIdentity | null>;
export function resolveExactErpNextConnection(scope: ExactConnectionScope): Promise<ResolvedErpNextServerConnection>;
export function loadVerifiedErpCompanyCurrency(ownerId: string): Promise<{
  scope: ExactConnectionScope;
  currency: string;
} | null>;
```

`ResolvedErpNextServerConnection`만 `credentialId`, normalized `baseUrl`, `apiKey`, `apiSecret`을 포함하고 server module 밖으로 export/serialize하지 않는다. public identity에는 secret/ciphertext가 없다. 자격증명 JSON이 손상되었거나 metadata/revision/site/company가 불일치하면 연결 없음으로 가장하지 말고 `ERP_CONNECTION_INVALID` typed error를 발생시킨다.

- [ ] **Step 5: 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: URL, 검증, owner 격리 테스트 및 기존 credential 테스트 통과.

Run: `npm.cmd run typecheck`

Expected: 새 ERP 연결 파일에서 오류 없음.

- [ ] **Step 6: 연결 단위 커밋**

```powershell
git add src/lib/automation/app-registry.ts src/lib/automation/action-registry.ts src/lib/automation/scenario-designer.ts src/lib/automation/automation-connection.service.ts src/lib/automation/credential.repository.ts src/lib/integrations/credential-verifier.ts src/lib/integrations/verified-credential.service.ts src/lib/erp/erpnext-url.ts src/lib/erp/erpnext-http.ts src/lib/erp/erp-connection.repository.ts src/lib/erp/erp-connection.service.ts app/api/automation/credentials/route.ts app/api/automation/credentials/[credentialId]/route.ts app/api/integrations/credentials/[connectorId]/route.ts app/api/integrations/[connectorId]/disconnect/route.ts public/automation-icons/erpnext.svg tests/erpnext-connection.test.ts tests/verified-credential-recovery.test.ts tests/integration-credential-verification.test.ts tests/automation-app-registry.test.ts tests/verified-connection-state.test.ts
git commit -m "feat: add verified owner ERPNext connections"
```

---

### Task 3: 읽기 전용 ERPNext provider와 Business API route 구현

**Files:**

- Create: `src/lib/erp/erpnext-client.ts`
- Create: `src/lib/erp/erpnext-dashboard.provider.ts`
- Create: `src/lib/erp/erpnext-business.provider.ts`
- Create: `src/lib/erp/erp-owner.service.ts`
- Modify: `src/lib/erp/erp-provider-registry.ts`
- Create: `app/api/business/erp/dashboard/handler.ts`
- Create: `app/api/business/erp/dashboard/route.ts`
- Create: `tests/erpnext-dashboard-provider.test.ts`
- Create: `tests/erpnext-business-provider.test.ts`
- Create: `tests/erp-dashboard-route.test.ts`

- [ ] **Step 1: 실패하는 provider fixture 테스트 작성**

fetcher를 주입한 테스트 fixture로 다음을 고정한다.

- 모든 요청은 `GET`, `Accept: application/json`, token 인증, pinned HTTPS transport, 개별 5초 timeout과 route 전체 12초 AbortSignal을 사용한다.
- Company/System Settings를 먼저 다시 읽어 connection metadata의 base currency/timezone/site/company와 일치하는지 확인하고 모든 후속 요청에 exact `externalCompanyId`를 강제한다.
- Sales Invoice 최근 6개월 dataset은 `docstatus = 1`, exact company, inclusive posting-date range와 `base_net_total`, `is_return`, `return_against`, territory를 읽는다. normal row는 finite nonnegative, return/credit row는 finite nonpositive여야 하며 signed `base_net_total`을 한 번만 합산한다. 이미 음수인 return을 다시 `abs()`/subtract하지 않는다.
- Purchase Invoice도 동일 submitted/company/date/signed return 규칙으로 이번 달·이전 달 net purchase를 계산한다. return 반영 뒤 월 매출·매입은 음수일 수 있다.
- 총 미수금/aging과 미지급금은 invoice `outstanding_amount`를 임의 합산하지 않고 allowlisted ERPNext `Accounts Receivable`/`Accounts Payable` query report를 exact company, report date, base currency로 호출해 journal entry, credit, payment가 반영된 결과를 사용한다.
- Warehouse를 `company = connection.externalCompanyId`, `is_group = 0`으로 먼저 제한한 뒤 그 warehouse 이름만 chunked `in` filter로 `/api/resource/Bin`에서 조회한다. 다른 회사 warehouse의 Bin은 합계에 들어갈 수 없다.
- Profit and Loss Statement report에 `company`, `from_date`, `to_date`, periodicity를 강제로 전달하고 report의 numeric `primitive_summary`와 summary currency를 검증해 순이익을 만든다. localized `Net Profit` label 문자열 매칭이나 sales-purchases 근사는 금지하며 primitive/currency 파싱 불가면 순이익 `null`과 warning이다.
- Accounts Receivable report의 customer·outstanding·age buckets를 검증해 미수금 상위 5개 및 30일/60일 연체를 만든다. 부분/truncated report는 확정 합계로 표시하지 않는다.
- Quotation, Sales Invoice, Purchase Order, Payment Entry, Material Request 각각에 `company = connection.externalCompanyId`와 `limit_page_length = 3`을 적용하고 합쳐 최신 12개 활동을 만든다.
- provider가 반환한 upstream HTML·stack trace·credential 문자열은 snapshot warning에 들어가지 않는다.
- 명시적 0은 유지하고, 누락 필드는 `null`, 불완전·잘린 페이지는 영향받은 합계/차트/표만 `null`/빈 배열로 만든다. `sales_metric`, `sales_trend`, `sales_breakdown` warning을 분리해 breakdown 실패가 verified total을 지우지 않는다.
- 12초 전체 budget을 넘으면 진행 중 요청을 모두 abort하고 UI가 기존 snapshot을 stale 상태로 보존할 수 있는 typed timeout을 반환한다.
- business provider의 `searchCustomers`는 exact connection/site/company와 `customer_search` capability를 확인하고 2–120자 query, 8초 timeout, 최대 20 bounded evidence만 반환한다.
- `verifyCustomer`는 exact external customer ID를 같은 scope에서 다시 GET하고 ID/label/company/email/phone/modified만 반환한다. `getCustomerContext`는 approved mapping scope와 `customer_read` capability를 요구하며 account-level receivables, open orders/invoices 최대 10, recent payments 최대 5, warnings 최대 8을 반환한다.
- `searchItems`는 exact item code/label, verified UOM/price choices, modified time만 최대 20개 반환하고 arbitrary doctype/path를 허용하지 않는다. read provider에는 POST/PUT/DELETE가 없다.

- [ ] **Step 2: 실패하는 route 테스트 작성**

`handler.ts`의 route factory에 dependency를 주입해 다음을 직접 호출한다. Next App Router의 `route.ts`에서는 임의 factory를 export하지 않는다.

```ts
const GET = createErpDashboardGet({
  requireOwner: async () => ({ uid: "owner-a", email: "a@example.com", role: "user" }),
  getOwnerSnapshot: async (ownerId) => {
    assert.equal(ownerId, "owner-a");
    return notConfiguredErpDashboardSnapshot();
  }
});
const response = await GET(new Request("http://localhost/api/business/erp/dashboard"));
```

테스트 항목:

- route factory 직접 호출에서 세션 없음은 `401 AUTH_REQUIRED`(`OwnerContextError`)다. 실제 HTTP 경계에서는 기존 `middleware.ts`가 먼저 `401 UNAUTHORIZED`를 반환하므로 두 계층을 각각 테스트하고 middleware code를 변경하지 않는다.
- owner ID는 request body/query가 아니라 `requireOwner` 결과만 사용한다.
- 연결 없음은 200 `not_configured` snapshot.
- never-configured와 committed-disconnected를 구분하는 owner connection-status projection을 사용하며, 명시적으로 끊은 연결은 200 `disconnected` snapshot이다. 두 상태 모두 currency/company/accountingPeriod/asOf가 null이고 배열과 link가 비어 있다.
- 정상 연결은 `apiSuccess({ snapshot })`.
- 손상된 owner credential은 409 `ERP_CONNECTION_INVALID`이며 다시 연결 안내만 노출한다.
- ERP 401/403은 HTTP 502 `ERP_AUTH_FAILED`, timeout/5xx는 HTTP 503 `ERP_UNAVAILABLE`, rate limit은 HTTP 429 `ERP_RATE_LIMITED`의 안전한 한국어 메시지로 변환하고 upstream body를 숨긴다.
- 손상되었거나 검증 메타데이터가 불완전한 저장 credential은 HTTP 409 `ERP_CONNECTION_INVALID`와 `ERPNext 연결 정보를 다시 저장해 주세요`로 변환한다.

- [ ] **Step 3: 실패 확인**

Run: `npm.cmd test`

Expected: client/provider/route exports가 없어 새 테스트 실패.

- [ ] **Step 4: 안전한 ERPNext client 구현**

`erpnext-client.ts`는 다음 공개 메서드만 제공한다.

```ts
type ErpListResult<T> = {
  items: T[];
  truncated: boolean;
};

listDocuments<T>(doctype: ErpReadableDoctype, query: ErpListQuery): Promise<ErpListResult<T>>
runReport(
  report: "Profit and Loss Statement" | "Accounts Receivable" | "Accounts Payable",
  filters: Record<string, unknown>
): Promise<unknown>
```

요구사항:

- doctype과 report 이름은 문자열 allowlist union으로 제한한다.
- `runReport`는 고정 `/api/method/frappe.desk.query_report.run` method path와 allowlisted report name/filter schema만 사용하고 response `result/columns/report_summary/primitive_summary`를 report별로 검증한다.
- query는 `URLSearchParams`와 JSON.stringify로 만들고 임의 path를 받지 않는다.
- 재무 dataset은 페이지 크기 200, 최대 5페이지로 제한하고 최근 활동은 doctype당 3개만 한 번 요청한다. 한도 도달 시 `truncated: true`로 반환한다. provider는 잘린 섹션의 합계·차트·표에 부분값을 노출하지 않고 `null`/빈 배열과 `DATA_TRUNCATED`를 사용한다.
- 응답 `data`/`message`가 예상 구조가 아니면 `ERP_RESPONSE_INVALID`.
- 401/403, 429, 5xx, timeout을 typed provider error로 매핑한다.
- 모든 outbound는 Task 2의 pinned transport를 사용한다.

- [ ] **Step 5: provider 집계 구현**

날짜 계산은 테스트 가능한 `now` 인자와 verified `connection.companyTimezone`을 사용해 inclusive `YYYY-MM-DD` 월 경계를 만든다. 매출·매입은 signed `base_net_total`과 `connection.companyCurrency`를 사용하고 provider가 Company/System Settings를 재검증한다. currency/timezone/company가 metadata와 다르거나 raw row가 semantic validation을 통과하지 못하면 0으로 보정하지 않고 영향받은 섹션 warning을 남긴다.

Company, invoices, warehouses/Bin, P&L, recent activity dataset은 최대 동시성 4로 병렬 실행하며 하나의 12초 parent AbortSignal을 공유한다. 동일 dataset 안의 pagination만 순차 실행한다.

report 기반 미수금·재고 top 5는 검증된 숫자 행을 금액 내림차순으로 먼저 정렬하고 `null` 행은 이름순으로 뒤에 둔다. 어떤 raw 행의 금액이 누락되어 해당 customer/item 합계를 확정할 수 없으면 그 row와 전체 metric을 `null`로 유지한다.

바로가기는 ERPNext 응답에서 받지 않는다. `erp-links.ts`가 아래 allowlist를 export하고 provider는 이 목록의 action ID/label만 snapshot에 넣는다.

```ts
const ERP_ACTION_PATHS = {
  quotation: "/app/quotation",
  sales_order: "/app/sales-order",
  sales_invoice: "/app/sales-invoice",
  payment_entry: "/app/payment-entry",
  material_request: "/app/material-request",
  purchase_order: "/app/purchase-order",
  purchase_invoice: "/app/purchase-invoice",
  item: "/app/item",
  warehouse: "/app/warehouse",
  stock_balance: "/app/query-report/Stock%20Balance",
  reports: "/app/query-report/Profit%20and%20Loss%20Statement"
} as const;
```

snapshot에는 이 path에서 조립한 href를 넣지 않고 action ID와 검증된 `erpLaunchUrl`만 넣는다. 활동도 document type/name만 반환한다. UI는 Task 1의 link builder로만 외부 링크를 만든다. `ERP_ACTION_PATHS`는 provider에서 다시 선언하지 않고 `erp-links.ts`의 단일 정의를 사용한다.

`erpnext-dashboard.provider.ts`는 Task 1 `ErpDashboardProvider`, `erpnext-business.provider.ts`는 `ErpBusinessReadProvider`를 구현하고 registry에 `erpnext`로 등록한다. 두 provider 모두 매 호출 `resolveExactErpNextConnection(scope)`로 owner/revision/site/company/capability를 재검증한다. dashboard provider의 마지막 단계는 `normalizeErpDashboardSnapshot(raw, { now, expectedBaseUrl: connection.baseUrl })`를 호출해 launch origin을 연결 credential과 대조한다.

`erp-owner.service.ts`는 HTTP self-fetch 없이 서버 caller가 직접 쓰는 아래 함수를 제공한다. CRM은 두 번째 함수만 사용하고 raw dashboard route나 credential repository를 import하지 않는다.

```ts
export function getOwnerErpDashboardSnapshot(
  ownerId: string,
  options?: { now?: Date; signal?: AbortSignal }
): Promise<ErpDashboardSnapshot>;

export function getOwnerErpMonthlySalesSnapshot(
  ownerId: string,
  options?: { now?: Date; signal?: AbortSignal }
): Promise<ErpMonthlySalesSnapshot>;
```

- [ ] **Step 6: 인증된 route 구현**

`handler.ts`가 `createErpDashboardGet`과 `defaultDependencies`를 export한다. `route.ts`는 `export const GET = createErpDashboardGet(defaultDependencies)`만 두어 Next App Router가 허용하지 않는 임의 named export를 만들지 않는다. handler는 `OwnerContextError`를 HTTP 401, `ERP_CONNECTION_INVALID`를 HTTP 409, ERP provider error를 위에서 고정한 502/503/429와 `apiFailure` body로 변환한다. 응답에는 credential 필드가 절대 없어야 한다.

- [ ] **Step 7: 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: provider fixture, route, 기존 owner 격리 테스트 통과.

Run: `npm.cmd run typecheck`

Expected: 새 provider와 route에서 오류 없음.

- [ ] **Step 8: 데이터 경계 단위 커밋**

```powershell
git add src/lib/erp/erpnext-client.ts src/lib/erp/erpnext-dashboard.provider.ts src/lib/erp/erpnext-business.provider.ts src/lib/erp/erp-owner.service.ts src/lib/erp/erp-provider-registry.ts app/api/business/erp/dashboard/handler.ts app/api/business/erp/dashboard/route.ts tests/erpnext-dashboard-provider.test.ts tests/erpnext-business-provider.test.ts tests/erp-dashboard-route.test.ts
git commit -m "feat: serve owner scoped ERP dashboard data"
```

---

### Task 4: ERP 대시보드 표현 컴포넌트 구현

**Files:**

- Create: `components/Business/erp/ErpMetricGrid.tsx`
- Create: `components/Business/erp/ErpSalesTrend.tsx`
- Create: `components/Business/erp/ErpSalesBreakdown.tsx`
- Create: `components/Business/erp/ErpRecentActivity.tsx`
- Create: `components/Business/erp/ErpReceivablesTable.tsx`
- Create: `components/Business/erp/ErpInventoryValue.tsx`
- Create: `components/Business/erp/ErpQuickActions.tsx`
- Create: `tests/erp-dashboard-ui.test.ts`

- [ ] **Step 1: 실패하는 UI 계약 테스트 작성**

프로젝트의 현재 정적 UI 테스트 방식으로 다음 소스 계약을 검사한다.

- 6개 metric label: `총 매출 (이번 달)`, `총 매입 (이번 달)`, `순이익 (이번 달)`, `미수금 (총)`, `미지급금 (총)`, `재고 가치 (현재)`.
- 추이 SVG에 `role="img"`, `<title>`, 데이터 텍스트 대체가 있다.
- donut SVG에 title과 legend가 있다.
- signed return 때문에 trend가 음수인 fixture는 zero baseline과 negative Y range를 사용하고, breakdown segment가 음수이거나 total이 0 이하이면 donut 대신 accessible signed list를 표시한다.
- 미수금 표에 `고객명`, `미수금`, `30일 이상`, `60일 이상`의 `<th>`가 있다.
- 비어 있는 값이 숫자 0으로 하드코딩되지 않는다.
- 바로가기는 `<a target="_blank" rel="noopener noreferrer">`이며 `buildErpQuickActionHref`와 typed action ID만 사용한다.
- 최근 활동 링크는 `buildErpRecordHref`, typed document type, 인코딩된 document name만 사용한다.
- 모바일 `grid-cols-1`, 데스크톱 다중 열, `overflow-x-auto`가 있다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: 새 컴포넌트 파일 부재로 UI 계약 테스트 실패.

- [ ] **Step 3: metric grid와 공통 empty state 구현**

`ErpMetricGrid`는 `SurfaceCard`, Lucide icon, `formatErpMoney`를 사용한다. 현재 상태가 `not_configured` 또는 `disconnected`이면 `연결 후 표시`, 연결 상태의 `null`이면 `데이터 없음`을 사용한다. 비교값이 `null`이면 badge 자체를 렌더링하지 않는다.

- [ ] **Step 4: native SVG 차트 구현**

`ErpSalesTrend`는 고정 viewBox와 계산된 polyline/path를 사용한다. signed range에 0을 포함하고 zero baseline을 그리며 negative point도 보존한다. `null` point는 0으로 그리지 않고 선을 끊으며 해당 기간을 `데이터 없음`으로 표시한다. 데이터가 없으면 빈 SVG 축을 꾸미지 않고 명시적 empty panel을 렌더링한다. 스크린리더용 목록으로 `기간: 금액 또는 데이터 없음`을 함께 제공한다.

`ErpSalesBreakdown`은 모든 segment가 nonnegative이고 total이 양수일 때만 SVG circle의 `strokeDasharray`/`strokeDashoffset`으로 donut을 만든다. signed return으로 음수 segment가 있거나 total이 0 이하이면 donut을 숨기고 label/value의 accessible signed list를 표시한다. 하나라도 `null` segment면 부분 donut을 진짜 합계처럼 그리지 않고 unavailable state를 표시한다. 합계가 검증된 0이면 0을 표시하고, 배열이 비었으면 `데이터 없음`을 표시한다.

- [ ] **Step 5: 활동·표·바로가기 구현**

- recent activity는 `<ol>`과 `<time dateTime>` 사용.
- receivables와 inventory는 의미 있는 `<table>`/header 또는 label-value bar list 사용.
- quick action은 44px 이상 터치 영역과 allowlisted link builder 결과만 사용.
- 모든 카드에 DREAMWISH `app-*` token과 `SurfaceCard`를 사용한다.

- [ ] **Step 6: 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: 새 UI 계약 테스트 통과.

Run: `npm.cmd run typecheck`

Expected: 새 표현 컴포넌트 오류 없음.

- [ ] **Step 7: 표현 계층 단위 커밋**

```powershell
git add components/Business/erp tests/erp-dashboard-ui.test.ts
git commit -m "feat: build responsive ERP dashboard panels"
```

---

### Task 5: dashboard container와 정직한 연결·새로고침 상태 구현

**Files:**

- Create: `components/Business/ErpDashboard.tsx`
- Modify: `tests/erp-dashboard-ui.test.ts`

- [ ] **Step 1: 실패하는 상태 전이 테스트 추가**

`ErpDashboard.tsx` 소스 계약과 export한 `reduceErpDashboardViewState`를 함께 검사한다.

- 최초 로딩은 고정 높이 skeleton.
- 수동 새로고침 중에는 이전 snapshot을 유지하고 `aria-busy="true"`.
- 실패했지만 이전 snapshot이 있으면 `stale: true`로 유지한다.
- refresh 실패 code는 snapshot의 section warning과 섞지 않고 `refreshErrorCode`에 저장하며 다음 성공에서 지운다.
- 최초 실패는 `error` state와 재시도 버튼.
- `not_configured`와 `disconnected`는 숫자·차트·ERP 링크 없이 `ERPNext 연결` 버튼을 표시한다.
- `연결 관리 열기`는 `dreamwish:navigate` detail `{ view: "integrations", connectorId: "erpnext" }`로 기존 Integration Center의 ERPNext 입력 panel을 바로 연다.
- 연결된 경우에만 `ERPNext 열기`가 보인다.
- raw upstream 오류 문자열을 화면에 출력하지 않는다.
- 새 요청이 시작되면 이전 AbortController를 취소하고, 늦게 도착한 이전 request ID의 성공/실패 action은 reducer가 무시한다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: container/helper가 없어 실패.

- [ ] **Step 3: container 구현**

다음 상태와 action을 그대로 사용한다.

```ts
export type ErpDashboardViewState = {
  phase: "idle" | "loading" | "refreshing" | "ready" | "error";
  snapshot: ErpDashboardSnapshot | null;
  requestId: number;
  refreshErrorCode: ErpDashboardErrorCode | null;
};

export type ErpDashboardViewAction =
  | { type: "request"; requestId: number }
  | { type: "success"; requestId: number; snapshot: ErpDashboardSnapshot }
  | { type: "failure"; requestId: number; code: ErpDashboardErrorCode };
```

`reduceErpDashboardViewState`는 현재 request ID와 다른 success/failure를 무시한다. `request`는 snapshot이 있으면 `refreshing`, 없으면 `loading`; `success`는 `refreshErrorCode: null`; `failure`는 snapshot이 있으면 snapshot의 section warning을 변경하지 않고 `stale: true`, `refreshErrorCode: code`, `phase: "ready"`로 만든다. snapshot이 없으면 `errorErpDashboardSnapshot(code)`, `refreshErrorCode: code`, `phase: "error"`가 된다. UI의 refresh 오류 banner는 `refreshErrorCode`의 고정 한국어 map만 사용한다.

초기 mount와 `새로고침`에서 `/api/business/erp/dashboard`를 호출하고 `readApiResponse<{ snapshot: ErpDashboardSnapshot }>`를 사용한다. 새 요청 전에 이전 controller를 abort하고 unmount에서도 취소한다.

헤더는 다음 요소를 제공한다.

- `ERP 대시보드` 제목.
- 연결/일부 데이터/연결 필요/오류 pill.
- `asOf`와 오래됨 표시.
- `새로고침` 버튼.
- 연결 시 `ERPNext 열기` 외부 링크.
- 미연결 시 `ERPNext 연결` 버튼. 이 버튼은 기존 Connection Management의 ERPNext 입력 panel을 바로 연다.
- 안내 panel의 `연결 관리 열기` 버튼은 `dreamwish:navigate` event의 `{ view: "integrations", connectorId: "erpnext" }`를 dispatch한다. 기존 AppShell의 `pendingConnectorId`와 IntegrationCenter의 `selectedConnectorId` 계약을 그대로 사용해 ERPNext credential 입력 panel을 바로 열고 URL/company/API key/secret을 검증·저장한다. Company currency/timezone은 server verification에서 읽으며 AppShell 자체는 수정하지 않는다.
- 설치 안내 panel, Docker 링크 중심 CTA, Local Helper 문구는 만들지 않는다. 공식 ERPNext 문서는 연결 panel의 보조 도움말 링크로만 허용한다.

페이지 구성:

```tsx
<ErpMetricGrid connectionState={snapshot.connectionState} currency={snapshot.currency} metrics={snapshot.metrics} />
<div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
  <ErpSalesTrend currency={snapshot.currency} data={snapshot.salesTrend} />
  <ErpSalesBreakdown currency={snapshot.currency} data={snapshot.salesBreakdown} />
  <ErpRecentActivity currency={snapshot.currency} erpLaunchUrl={snapshot.erpLaunchUrl} activities={snapshot.recentActivity} />
</div>
<div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
  <ErpReceivablesTable currency={snapshot.currency} rows={snapshot.receivables} />
  <ErpInventoryValue currency={snapshot.currency} items={snapshot.inventory} />
  <ErpQuickActions erpLaunchUrl={snapshot.erpLaunchUrl} actions={snapshot.quickActions} />
</div>
```

- [ ] **Step 4: 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: loading/refresh/disconnected/error 계약 통과.

Run: `npm.cmd run typecheck`

Expected: container와 child props 오류 없음.

- [ ] **Step 5: container 단위 커밋**

```powershell
git add components/Business/ErpDashboard.tsx tests/erp-dashboard-ui.test.ts
git commit -m "feat: add ERP dashboard loading and connection states"
```

---

### Task 6: BusinessHub에 통합하고 레거시 영업·매출 UI 제거

**Files:**

- Modify: `components/Business/BusinessHub.tsx`
- Modify: `components/Calendar/CalendarView.tsx`
- Modify: `src/lib/business/business-workspace.ts`
- Modify: `tests/business-hub.test.ts`
- Modify: `tests/mobile-revenue-bridge.test.ts`
- Modify: `tests/device-pairing.test.ts`
- Modify: `tests/calendar-mobile-import.test.ts`

- [ ] **Step 1: 실패하도록 회귀 테스트를 새 요구사항으로 변경**

`tests/business-hub.test.ts`에서 section 계약을 아래처럼 바꾼다.

```ts
for (const section of ["overview", "dashboard", "mail", "cards", "meetings", "reports"]) {
  assert.match(source, new RegExp(`id: "${section}"`, "u"));
}
assert.doesNotMatch(source, /id: "sales"/u);
assert.match(source, /ErpDashboard/u);
assert.doesNotMatch(source, /\/api\/business\/revenue/u);
assert.doesNotMatch(source, /DeviceConnectionPanel|ManualRevenueImport/u);
```

추가 assertion:

- overview에 고객, 후속 연락, 미완료 업무, 오늘 회의만 있다.
- overview와 reports에 회사·확정 매출·예상 매출·가중 파이프라인이 없다.
- mail/cards/meetings/reports 탭은 유지된다.
- sidebar 파일에는 ERPNext 내부 메뉴를 추가하지 않는다.
- CalendarView에 `휴대폰에서 가져오기`, `/api/devices/calendar-candidates`, phone-import modal/state가 없고 일반 일정 생성·월/주/일 전환은 유지된다.

`mobile-revenue-bridge.test.ts`는 mobile companion parser/API 자체 테스트를 유지하되 BusinessHub가 revenue route를 사용해야 한다는 assertion을 반대로 바꾼다. `device-pairing.test.ts`는 이 단계에서는 CRM 연락처 가져오기 backend 테스트를 유지하고 BusinessHub에서 `DeviceConnectionPanel`, CalendarView에서 phone calendar import UI가 사라졌음을 확인한다. `calendar-mobile-import.test.ts`의 기존 positive UI 계약은 button/modal/fetch가 없음을 확인하는 negative UI 계약으로 바꾸되 candidate API의 parse·owner-scope·저장 테스트는 유지한다. device/calendar candidate route 자체는 삭제하지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: 현재 `sales`, revenue fetch, DeviceConnectionPanel 때문에 수정한 테스트 실패.

- [ ] **Step 3: BusinessHub 데이터 로딩 정리**

다음을 삭제한다.

- `RevenueCandidate` import/type/state.
- `/api/business/revenue` GET/PATCH/POST 호출.
- `upsertRevenueCandidate`, `transitionRevenue`.
- `Sales`, `ManualRevenueImport`, company/sales 전용 render helper.
- `DeviceConnectionPanel` import와 사용.

`business-workspace.ts`의 sales/revenue arithmetic를 제거하고 고객·후속 연락·미완료 업무·오늘 회의만 받는 `BusinessOperationalSummary` formatter로 축소한다. 이 ERP 단계에서는 현재 CRM collection caller를 유지하되, 후속 CRM plan Task 3이 `/api/crm/dashboard` aggregate로 전환한다.

CRM과 integration status의 기존 병렬 로딩, mail/cards/meetings 기능, `readApiResponse`는 유지한다.

`CalendarView.tsx`에서는 `MobileCalendarCandidate`, phone-import state/handlers, `휴대폰에서 가져오기` button과 검토 modal만 제거한다. 일반 calendar event fetch/create, 공용 `Modal`, month/week/day UI는 그대로 둔다.

- [ ] **Step 4: 탭과 overview/report 통합**

탭 순서를 정확히 다음과 같이 만든다.

```ts
const sections = [
  { id: "overview", label: "개요" },
  { id: "dashboard", label: "ERP" },
  { id: "mail", label: "메일" },
  { id: "cards", label: "명함" },
  { id: "meetings", label: "회의" },
  { id: "reports", label: "리포트" }
] as const;
```

`renderSection("dashboard")`에서 `<ErpDashboard />`를 렌더링한다. overview는 `customerCount`, `followUpCustomerCount`, `openTaskCount`, `todayMeetingCount` 4개 카드만 표시한다. reports도 같은 운영 지표만 사용한다. Business 소개 문구에서 매출을 제거한다.

- [ ] **Step 5: 회귀 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: BusinessHub, calendar phone-import removal, mobile revenue, device pairing 및 기존 mail/card/meeting 테스트 포함 전체 통과.

Run: `npm.cmd run typecheck`

Expected: 사용하지 않는 import/props와 ERP 타입 오류 없음. 선행 사용자 변경 오류가 있다면 ERP 변경과 무관함을 파일별로 기록한다.

- [ ] **Step 6: 통합 단위 커밋**

```powershell
git add components/Business/BusinessHub.tsx components/Calendar/CalendarView.tsx src/lib/business/business-workspace.ts tests/business-hub.test.ts tests/mobile-revenue-bridge.test.ts tests/device-pairing.test.ts tests/calendar-mobile-import.test.ts
git commit -m "feat: replace business sales tab with ERP dashboard"
```

---

### Task 7: 최종 시각·보안·회귀 검증

**Files:**

- Verify only: `components/layout/Sidebar.tsx`
- Verify only: `components/layout/AppShell.tsx`
- Verify all files changed in Tasks 1-6

- [ ] **Step 1: placeholder와 금지 패턴 검사**

Run:

```powershell
Get-ChildItem src\lib\erp,components\Business\erp -Recurse -File | Select-String -Pattern 'TODO|TBD|FIXME|sample|mock data'
Select-String -Path components\Business\BusinessHub.tsx -Pattern '/api/business/revenue|DeviceConnectionPanel|ManualRevenueImport|id: "sales"'
Select-String -Path components\Business\ErpDashboard.tsx,components\Business\erp\*.tsx -Pattern 'apiSecret|apiKey|Authorization|iframe'
```

Expected: 모두 일치 항목 없음.

- [ ] **Step 2: sidebar 불변 확인**

Run:

```powershell
git diff 2da2243 -- components/layout/Sidebar.tsx components/layout/AppShell.tsx
```

Expected: 출력 없음.

- [ ] **Step 3: 전체 자동 검증**

Run: `npm.cmd test`

Expected: 전체 테스트 통과.

Run: `npm.cmd run lint`

Expected: lint 통과.

Run: `npm.cmd run typecheck`

Expected: Tasks 1–6 changed files에는 오류가 없다. 현재 사용자 변경 `src/lib/ai/errors.ts:99-100`의 baseline `AIErrorCode` 오류가 남아 있으면 정확히 분리 보고하고 ERP 작업에서 수정하지 않는다.

Run: `npm.cmd run build`

Expected: production build 통과. 환경 변수 부재로 실패하면 오류가 코드 문제가 아닌지 확인하고 재현 명령과 메시지를 기록한다.

- [ ] **Step 4: 로컬 브라우저 검증**

Run `npm.cmd run dev` through the shell tool with an early yield, keep the returned running-cell ID, wait only until `http://127.0.0.1:3100` responds, and terminate that exact cell after browser verification. Do not start an untracked visible terminal or leave the dev server running.

브라우저에서 다음을 확인한다.

- 기존 DREAMWISH 사이드바·상단바가 전과 동일하다.
- 비즈니스 탭 순서가 `개요 · ERP · 메일 · 명함 · 회의 · 리포트`다.
- 연결 없음에서 재무 숫자가 표시되지 않는다.
- 375px에서 단일 열, 표 가로 스크롤, 44px 이상 버튼을 확인한다.
- 768px과 1440px에서 카드/패널이 2~3열로 자연스럽게 변한다.
- 키보드만으로 탭, 새로고침, ERPNext 연결, 외부 링크를 사용할 수 있다.
- 검증된 test ERPNext가 있으면 실제 0과 null이 구분되고 외부 상세 링크가 올바른 origin으로 열린다.

- [ ] **Step 5: 최종 상태와 변경 범위 확인**

Run: `git status --short`

Expected: 이 계획의 파일 외 기존 사용자 변경만 남고, `src/lib/ai/errors.ts` 및 기존 untracked 파일은 커밋에 포함되지 않았다.

Run: `git show -s --oneline 2da2243`

Expected: 통합 설계 커밋 `2da2243`가 보인다.

Run: `git log --oneline --reverse 2da2243..HEAD`

Expected: 계획 커밋 뒤에 Tasks 1-6의 작은 단위 커밋이 순서대로 보인다. 다른 기존 커밋이 있으면 경로별 `git show --stat <commit>`으로 이 기능 커밋만 구분한다.

---

## Completion Checklist

- [ ] 글로벌 sidebar/topbar 변경 없음.
- [ ] Business `sales` 탭과 revenue/device UI 제거.
- [ ] Calendar phone-import button/modal/fetch state 제거, 일반 일정 기능 유지.
- [ ] `ERP` 탭과 6 metrics, 3 middle panels, 3 lower panels 구현.
- [ ] 연결 없음에서 fake 금액 없음; 확인된 0만 0으로 표시.
- [ ] owner-scoped verified ERPNext credential과 read-only REST provider 구현.
- [ ] durable connection identity/revision/capabilities, exact scopes, disconnect revoke 구현.
- [ ] reconnect/save/delete/disconnect durable journal recovery와 monotonic generation fence 구현.
- [ ] credential/identity half-state 비노출, stale recovery/compensation의 newer generation overwrite 차단.
- [ ] future ERP draft dispatch와 모든 identity mutation이 같은 connection-store barrier 사용.
- [ ] CRM/AI용 bounded customer search·exact verify·mapped account context·item search provider 구현.
- [ ] 선택 company/currency/timezone 강제, 다른 회사 invoice/warehouse/activity 혼입 없음.
- [ ] submitted signed return/credit-note net sales/purchases와 report 기반 AR/AP/P&L semantics 검증.
- [ ] 12초 전체 budget, 동시성 4, truncation 시 부분 합계 비노출.
- [ ] partial failure는 degraded, refresh failure는 stale snapshot 유지.
- [ ] pinned HTTPS transport, 외부 URL/quick action/record allowlist와 credential 비노출 검증.
- [ ] mail/cards/meetings/reports 및 CRM 분리 회귀 통과.
- [ ] test/lint/typecheck/build 결과 기록.
