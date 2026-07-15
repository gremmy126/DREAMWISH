# Business ERP Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 DREAMWISH 사이드바와 상단바를 그대로 유지하면서 비즈니스에 실제 ERPNext 데이터만 표시하는 반응형 `ERP 대시보드` 탭을 추가하고, 기존 `영업·매출` 및 비즈니스 휴대폰 매출 UI를 제거한다.

**Architecture:** `BusinessHub`는 탭과 기존 비즈니스 기능만 조정하고, ERP 화면은 독립된 React 컴포넌트 묶음으로 분리한다. 서버는 소유자별로 암호화 저장된 검증 완료 ERPNext 자격증명을 읽고, 읽기 전용 Frappe REST 호출을 정규화된 단일 스냅샷으로 변환한다. 연결 없음·부분 실패·오류·오래된 데이터 상태를 명시적으로 표현하며, 알 수 없는 금액을 `0`으로 만들지 않는다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Lucide React, native SVG, Node test harness (`scripts/run-tests.mjs`), existing encrypted credential repository.

## Global Constraints

- `components/layout/Sidebar.tsx`, `components/layout/AppShell.tsx`, 전역 상단바는 수정하지 않는다.
- `src/lib/ai/errors.ts`의 기존 사용자 변경과 현재 추적되지 않은 파일은 건드리거나 커밋하지 않는다.
- ERPNext iframe, 두 번째 사이드바, 샘플 매출·회계 숫자, 새 차트 라이브러리를 추가하지 않는다.
- 연결되지 않은 상태에서는 금액 자리에 `연결 후 표시`, 연결되었지만 값이 없는 상태에서는 `데이터 없음`을 표시한다. 확인된 `0`만 `₩0`으로 표시한다.
- ERPNext 토큰은 서버에만 머물고 React props, 응답 JSON, 브라우저 저장소, 로그, 오류 메시지에 포함하지 않는다.
- 서버 연결은 공개 HTTPS 루트 URL만 허용한다. 사용자 정보, 쿼리, 프래그먼트, localhost, 사설·링크 로컬·멀티캐스트 주소를 거부한다. 로컬 HTTP 연결은 후속 Local Helper 프로젝트 범위다.
- 기존 `/api/business/revenue`, revenue repository, mobile-companion 참고 코드는 삭제하지 않는다. 비즈니스 UI에서만 제거한다.
- 모든 새 한국어 소스는 UTF-8로 저장한다.
- 기준 명세: `docs/superpowers/specs/2026-07-15-business-erp-dashboard-design.md`.
- Frappe 호출은 공식 REST 계약을 따른다: `https://docs.frappe.io/framework/user/en/api/rest`. 회계 의미는 공식 ERPNext 보고서 정의를 따른다: `https://docs.frappe.io/erpnext/accounting-reports`.

---

### Task 1: 정규화된 ERP 대시보드 계약을 테스트로 고정

**Files:**

- Create: `src/lib/erp/erp-dashboard.types.ts`
- Create: `src/lib/erp/erp-dashboard.service.ts`
- Create: `src/lib/erp/erp-dashboard-format.ts`
- Create: `src/lib/erp/erp-links.ts`
- Create: `tests/erp-dashboard-normalization.test.ts`

- [ ] **Step 1: 실패하는 계약·정규화 테스트 작성**

`tests/erp-dashboard-normalization.test.ts`에 다음 동작을 먼저 고정한다.

```ts
test("ERP dashboard keeps verified zero distinct from an unavailable value", () => {
  const snapshot = normalizeErpDashboardSnapshot({
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

- `notConfiguredErpDashboardSnapshot()`의 모든 금액은 `null`이고 배열은 비어 있다.
- 음수가 허용되는 값은 순이익뿐이다.
- 매출·매입·미수금·미지급금·재고 가치의 음수와 `NaN`/`Infinity`는 거부한다.
- 비교값이 없으면 `changePercent`와 `comparisonLabel`을 모두 `null`로 만든다.
- 일부 섹션 경고가 있으면 상태가 `degraded`가 된다.
- `asOf`가 15분보다 오래되면 `stale: true`가 된다.
- 미연결/error snapshot은 숫자가 없으므로 표시용 기본 통화 `KRW`를 사용할 수 있지만, 연결된 snapshot의 통화 코드가 없거나 잘못되면 정상 snapshot을 만들지 않고 `ERP_RESPONSE_INVALID`로 실패한다.
- quick action과 record 링크는 검증된 ERPNext origin, 고정 route ID, 인코딩된 document name으로만 만들어진다.

- [ ] **Step 2: 전체 테스트를 실행해 새 모듈 부재로 실패 확인**

Run: `npm.cmd test`

Expected: `erp-dashboard-normalization.test.ts`가 새 ERP 모듈을 찾지 못하거나 새 export가 없어 실패한다.

- [ ] **Step 3: 전체 타입 계약 구현**

`src/lib/erp/erp-dashboard.types.ts`에 아래 타입을 완성한다.

```ts
export type ErpDashboardStatus = "not_configured" | "connected" | "degraded" | "error";
export type ErpDashboardSource = "server" | "local" | null;

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

export type ErpDashboardSection = "sales" | "purchases" | "profit" | "receivables" | "payables" | "inventory" | "activity";
export type ErpDashboardWarningCode =
  | "SALES_UNAVAILABLE" | "PURCHASES_UNAVAILABLE" | "PROFIT_UNAVAILABLE"
  | "RECEIVABLES_UNAVAILABLE" | "PAYABLES_UNAVAILABLE"
  | "INVENTORY_UNAVAILABLE" | "ACTIVITY_UNAVAILABLE" | "DATA_TRUNCATED";
export type ErpDashboardErrorCode =
  | "ERP_AUTH_FAILED" | "ERP_CONNECTION_INVALID" | "ERP_RATE_LIMITED"
  | "ERP_UNAVAILABLE" | "ERP_RESPONSE_INVALID";

export type ErpDashboardSnapshot = {
  status: ErpDashboardStatus;
  source: ErpDashboardSource;
  asOf: string | null;
  stale: boolean;
  currency: string;
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
```

- [ ] **Step 4: 정규화·포맷 구현**

`erp-dashboard.service.ts`에서 다음을 구현한다.

- `notConfiguredErpDashboardSnapshot(currency = "KRW")`
- `errorErpDashboardSnapshot(code: ErpDashboardErrorCode, currency = "KRW")`
- `normalizeErpDashboardSnapshot(input: unknown, options?: { now?: Date; expectedBaseUrl?: URL | null })`
- `calculateChangePercent(current, previous)`; 이전 값이 `0` 또는 알 수 없으면 `null`.
- 상태 계산: 경고 없음 `connected`, 일부 섹션 실패 `degraded`, 치명 오류 `error`.
- 최대 배열 크기: 추이 12, 구분 8, 최근 활동 12, 미수금 5, 재고 5, 바로가기 11.
- `warning`은 upstream 문자열을 받지 않고 `warningCodes`의 고정 한국어 문구로만 만든다.
- row identity는 확인되지만 금액이 누락된 경우 row를 버리거나 0으로 바꾸지 않고 해당 금액을 `null`로 유지한다. 하나라도 불완전한 raw row가 합계에 포함되면 그 합계도 `null`이다.
- `erpLaunchUrl`은 `options.expectedBaseUrl`의 정규화된 HTTPS root origin과 정확히 일치할 때만 유지하고, provider payload나 document field에서 받은 URL은 무시한다. 미연결 snapshot만 `expectedBaseUrl: null`을 사용한다.

`erp-dashboard-format.ts`에는 브라우저와 서버에서 동일하게 쓰는 아래 함수를 구현한다.

```ts
export function formatErpMoney(value: number | null, currency: string, unavailable: string) {
  if (value === null) return unavailable;
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
git add src/lib/erp/erp-dashboard.types.ts src/lib/erp/erp-dashboard.service.ts src/lib/erp/erp-dashboard-format.ts src/lib/erp/erp-links.ts tests/erp-dashboard-normalization.test.ts
git commit -m "feat: define ERP dashboard contract"
```

---

### Task 2: 소유자별 검증 완료 ERPNext 연결 추가

**Files:**

- Modify: `src/lib/automation/app-registry.ts`
- Modify: `src/lib/integrations/credential-verifier.ts`
- Create: `src/lib/erp/erpnext-url.ts`
- Create: `src/lib/erp/erpnext-http.ts`
- Create: `src/lib/erp/erp-connection.service.ts`
- Create: `public/automation-icons/erpnext.svg`
- Create: `tests/erpnext-connection.test.ts`
- Modify: `tests/integration-credential-verification.test.ts`

- [ ] **Step 1: 실패하는 URL·연결 격리 테스트 작성**

다음을 먼저 테스트한다.

- `https://erp.example.com`은 정규화되어 `https://erp.example.com/`이 된다.
- HTTP, 사용자 정보 포함 URL, 쿼리, 프래그먼트, 하위 경로, localhost, `.local`, 사설 IPv4/IPv6를 거부한다.
- DNS 조회 결과 중 하나라도 사설 주소이면 서버 연결을 거부한다. resolver는 테스트에서 주입한다.
- pinned HTTPS transport의 `lookup` callback은 검증한 공개 IP만 같은 요청에 사용하고 원래 hostname을 TLS SNI/certificate 검증에 유지한다.
- `verifyIntegrationCredential("erpnext", { baseUrl, company, timezone, apiKey, apiSecret }, fetcher, dependencies)`가 `Authorization: token apiKey:apiSecret`으로 `/api/method/frappe.auth.get_logged_user`와 지정 회사 문서를 확인한다.
- ERP credential 검증의 401, 429, 5xx, timeout fixture가 각각 기존 `PROVIDER_*` code로 정규화되고 raw body/token을 노출하지 않는다.
- owner A가 저장한 `erpnext` credential은 owner B의 `loadOwnerErpNextConnection`에서 보이지 않는다.
- 반환 연결 객체에는 `apiKey`/`apiSecret`이 서버 내부에만 존재하고 공개 credential 메타데이터에는 암호문도 없다.
- app registry의 `/automation-icons/erpnext.svg`가 실제 파일로 존재하고 credential UI에서 깨진 이미지를 만들지 않는다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: `erpnext` 앱 정의, URL validator, owner connection loader가 없어 실패한다.

- [ ] **Step 3: 앱 레지스트리와 검증 구현**

`app-registry.ts`에 정확히 한 개의 서버 연결 앱을 추가한다.

```ts
token("erpnext", "ERPNext", "#2490EF", [
  field("baseUrl", "ERPNext URL", false, "https://erp.example.com"),
  field("company", "Company", false),
  field("timezone", "Company timezone", false, "Asia/Seoul"),
  field("apiKey", "API Key"),
  field("apiSecret", "API Secret")
], "공개 HTTPS ERPNext 주소를 연결합니다. DREAMWISH는 GET 요청만 수행하며 ERPNext에서는 최소 조회 권한 API 사용자를 별도로 만드세요.")
```

`public/automation-icons/erpnext.svg`는 48×48 viewBox, 파란 rounded square, 흰색 `E` path만 포함하는 자체 아이콘으로 만들고 외부 이미지나 runtime font에 의존하지 않는다.

`erpnext-url.ts`에 `normalizeServerErpNextUrl`, IANA timezone validator, 공개 IP 판별을 구현한다. Node `dns/promises.lookup(host, { all: true, verbatim: true })` 결과의 모든 주소를 검사한다.

`erpnext-http.ts`에는 Node `https.request` 기반 `ErpNextTransport`를 구현한다. resolver로 공개 주소를 한 번 확정한 뒤 같은 request의 custom `lookup` callback이 그 주소만 반환하게 해 DNS 검사와 연결 사이의 재해석을 막는다. 원래 hostname은 `servername`에 사용하고 `rejectUnauthorized: true`, redirect 미지원, JSON content-type 확인, 2MB response byte limit, parent AbortSignal을 적용한다. HTTP status와 timeout/network 원인을 보존하되 body는 보존하지 않는 `ErpNextTransportError`를 사용한다. 테스트는 transport를 주입하므로 실제 DNS나 네트워크를 사용하지 않는다.

`verifyIntegrationCredential`에는 기존 호출과 호환되는 네 번째 optional dependencies 객체를 추가한다.

```ts
type ErpNextTransport = (
  url: URL,
  options: { headers: Record<string, string>; signal?: AbortSignal }
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
```

`verifyIntegrationCredential(appId, values, fetcher = fetch, dependencies = {})`가 dependencies를 선택된 verifier에 전달한다. 기존 app verifier는 세 번째 인자를 사용하지 않으므로 호출 계약과 기존 테스트는 유지된다.

`credential-verifier.ts`의 `VERIFY`에 `erpnext` 분기를 추가한다. URL·timezone 검증 후 검증 전용 8초 AbortController와 pinned transport로 아래 두 GET만 수행하고 redirect는 거부한다. Company 응답의 `default_currency`가 유효한 ISO 4217 형식인지도 검증하지만 credential metadata나 label 외부에 토큰을 포함하지 않는다. `finally`에서 timer를 정리하고 `ErpNextTransportError`를 기존 `IntegrationCredentialError`로 매핑한다: 401/403→`PROVIDER_AUTH_FAILED`, 429→`PROVIDER_RATE_LIMITED`, timeout/network/5xx→`PROVIDER_UNAVAILABLE`, malformed JSON/schema→`PROVIDER_RESPONSE_INVALID`. upstream body와 토큰은 message에 넣지 않는다.

```ts
const headers = { Authorization: `token ${values.apiKey}:${values.apiSecret}` };
const request = dependencies.erpTransport || createPinnedErpNextTransport(dependencies.resolveAddresses);
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 8_000);
const user = await request(new URL("/api/method/frappe.auth.get_logged_user", base), { headers, signal: controller.signal });
const company = await request(new URL(`/api/resource/Company/${encodeURIComponent(values.company)}`, base), { headers, signal: controller.signal });
clearTimeout(timer);
return identity(`${values.company} · ${String(user.message)}`, String(user.message));
```

실제 구현은 위 두 request와 `clearTimeout`을 `try/catch/finally`로 감싸 timer 정리와 typed error mapping을 보장한다.

회사 문서가 없거나 권한이 없으면 검증에 실패하고 credential을 저장하지 않는다.

- [ ] **Step 4: owner-scoped credential loader 구현**

`erp-connection.service.ts`에서 `listCredentials(ownerId)` 중 최신 `appId === "erpnext"`, `verificationStatus === "verified"` 항목만 선택한 뒤 같은 owner ID로 `revealCredential`한다. JSON을 필드별로 다시 검증하고 아래 서버 전용 타입으로 반환한다.

```ts
export type ErpNextConnection = {
  credentialId: string;
  baseUrl: URL;
  company: string;
  timezone: string;
  apiKey: string;
  apiSecret: string;
  accountLabel: string;
  verifiedAt: string;
};
```

자격증명 JSON이 손상되었거나 검증 메타데이터가 없으면 연결 없음으로 가장하지 말고 `code: "ERP_CONNECTION_INVALID"`, `status: 409`만 가진 typed `ErpConnectionError`를 발생시킨다. 오류 message에는 credential JSON이나 복호화 원인을 넣지 않는다.

- [ ] **Step 5: 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: URL, 검증, owner 격리 테스트 및 기존 credential 테스트 통과.

Run: `npm.cmd run typecheck`

Expected: 새 ERP 연결 파일에서 오류 없음.

- [ ] **Step 6: 연결 단위 커밋**

```powershell
git add src/lib/automation/app-registry.ts src/lib/integrations/credential-verifier.ts src/lib/erp/erpnext-url.ts src/lib/erp/erpnext-http.ts src/lib/erp/erp-connection.service.ts public/automation-icons/erpnext.svg tests/erpnext-connection.test.ts tests/integration-credential-verification.test.ts
git commit -m "feat: add verified owner ERPNext connections"
```

---

### Task 3: 읽기 전용 ERPNext provider와 Business API route 구현

**Files:**

- Create: `src/lib/erp/erpnext-client.ts`
- Create: `src/lib/erp/erp-dashboard.provider.ts`
- Create: `app/api/business/erp/dashboard/route.ts`
- Create: `tests/erpnext-dashboard-provider.test.ts`
- Create: `tests/erp-dashboard-route.test.ts`

- [ ] **Step 1: 실패하는 provider fixture 테스트 작성**

fetcher를 주입한 테스트 fixture로 다음을 고정한다.

- 모든 요청은 `GET`, `Accept: application/json`, token 인증, pinned HTTPS transport, 개별 5초 timeout과 route 전체 12초 AbortSignal을 사용한다.
- Company 문서를 먼저 읽어 검증된 `default_currency`를 얻고 모든 후속 쿼리에 정확한 `connection.company` 필터를 넣는다.
- Sales Invoice는 두 dataset으로 분리한다. 최근 6개월 `docstatus = 1`, `company = connection.company`, posting date 범위 dataset은 월 매출·추이·territory 구분만 만든다. 별도의 `docstatus = 1`, 같은 company, `outstanding_amount > 0` dataset은 날짜 하한 없이 총 미수금·aging만 만든다.
- Purchase Invoice도 두 dataset으로 분리한다. 이번 달과 이전 달 posting date 범위, `docstatus = 1`, 같은 company dataset은 월 매입만 만든다. 별도의 `docstatus = 1`, 같은 company, `outstanding_amount > 0` dataset은 날짜 하한 없이 총 미지급금만 만든다.
- fixture에는 7개월 전에 발행됐지만 아직 outstanding인 invoice를 포함하고 총 미수/미지급에는 들어가되 6개월 매출 추이에는 들어가지 않음을 검증한다.
- Warehouse를 `company = connection.company`, `is_group = 0`으로 먼저 제한한 뒤 그 warehouse 이름만 chunked `in` filter로 `/api/resource/Bin`에서 조회한다. 다른 회사 warehouse의 Bin은 합계에 들어갈 수 없다.
- Profit and Loss Statement report에 `company`, `from_date`, `to_date`, periodicity를 강제로 전달하고 `Net Profit` 행으로 이번 달·이전 달 순이익을 만든다. report 권한/버전 문제만 있으면 순이익은 `null`, 전체 상태는 `degraded`다.
- 날짜 제한 없는 같은 회사 outstanding Sales Invoice의 `outstanding_amount`와 `due_date`를 고객별로 묶어 미수금 상위 5개 및 30일/60일 연체를 만든다.
- Quotation, Sales Invoice, Purchase Order, Payment Entry, Material Request 각각에 `company = connection.company`와 `limit_page_length = 3`을 적용하고 합쳐 최신 12개 활동을 만든다.
- provider가 반환한 upstream HTML·stack trace·credential 문자열은 snapshot warning에 들어가지 않는다.
- 명시적 0은 유지하고, 누락 필드는 `null`, 불완전·잘린 페이지는 해당 합계/차트/표를 `null`/빈 배열로 만들고 `degraded` 처리한다.
- 12초 전체 budget을 넘으면 진행 중 요청을 모두 abort하고 UI가 기존 snapshot을 stale 상태로 보존할 수 있는 typed timeout을 반환한다.

- [ ] **Step 2: 실패하는 route 테스트 작성**

route factory에 dependency를 주입해 다음을 직접 호출한다.

```ts
const GET = createErpDashboardGet({
  requireOwner: async () => ({ uid: "owner-a", email: "a@example.com", role: "user" }),
  loadConnection: async (ownerId) => {
    assert.equal(ownerId, "owner-a");
    return null;
  },
  loadSnapshot: async () => { throw new Error("must not run"); }
});
const response = await GET(new Request("http://localhost/api/business/erp/dashboard"));
```

테스트 항목:

- route factory 직접 호출에서 세션 없음은 `401 AUTH_REQUIRED`(`OwnerContextError`)다. 실제 HTTP 경계에서는 기존 `middleware.ts`가 먼저 `401 UNAUTHORIZED`를 반환하므로 두 계층을 각각 테스트하고 middleware code를 변경하지 않는다.
- owner ID는 request body/query가 아니라 `requireOwner` 결과만 사용한다.
- 연결 없음은 200 `not_configured` snapshot.
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
runReport(report: "Profit and Loss Statement", filters: Record<string, unknown>): Promise<unknown>
```

요구사항:

- doctype과 report 이름은 문자열 allowlist union으로 제한한다.
- query는 `URLSearchParams`와 JSON.stringify로 만들고 임의 path를 받지 않는다.
- 재무 dataset은 페이지 크기 200, 최대 5페이지로 제한하고 최근 활동은 doctype당 3개만 한 번 요청한다. 한도 도달 시 `truncated: true`로 반환한다. provider는 잘린 섹션의 합계·차트·표에 부분값을 노출하지 않고 `null`/빈 배열과 `DATA_TRUNCATED`를 사용한다.
- 응답 `data`/`message`가 예상 구조가 아니면 `ERP_RESPONSE_INVALID`.
- 401/403, 429, 5xx, timeout을 typed provider error로 매핑한다.
- 모든 outbound는 Task 2의 pinned transport를 사용한다.

- [ ] **Step 5: provider 집계 구현**

날짜 계산은 테스트 가능한 `now` 인자와 연결 시 검증한 IANA `connection.timezone`을 사용해 월 경계를 `YYYY-MM-DD`로 만든다. 매출·매입은 회사 기준 금액 필드(`base_net_total`)와 Company의 검증된 `default_currency`를 사용한다. Company 통화가 없거나 invalid이면 정상 snapshot을 만들지 않고 typed `ERP_RESPONSE_INVALID`를 반환한다. 값을 계산하기 위해 사용한 raw 행이 누락되면 0으로 보정하지 않고 해당 섹션 경고를 남긴다.

Company, invoices, warehouses/Bin, P&L, recent activity dataset은 최대 동시성 4로 병렬 실행하며 하나의 12초 parent AbortSignal을 공유한다. 동일 dataset 안의 pagination만 순차 실행한다.

미수금·재고 top 5는 검증된 숫자 행을 금액 내림차순으로 먼저 정렬하고 `null` 행은 이름순으로 뒤에 둔다. 어떤 raw 행의 금액이 누락되어 해당 customer/item 합계를 확정할 수 없으면 그 row와 전체 metric을 `null`로 유지한다.

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

provider의 마지막 단계는 `normalizeErpDashboardSnapshot(raw, { now, expectedBaseUrl: connection.baseUrl })`를 호출해 launch origin을 연결 credential과 대조한다.

- [ ] **Step 6: 인증된 route 구현**

`route.ts`는 `createErpDashboardGet`을 export하고 기본 `GET`을 생성한다. `OwnerContextError`는 HTTP 401, `ERP_CONNECTION_INVALID`는 HTTP 409, ERP provider error는 위에서 고정한 502/503/429와 `apiFailure` body로 변환한다. 응답에는 credential 필드가 절대 없어야 한다.

- [ ] **Step 7: 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: provider fixture, route, 기존 owner 격리 테스트 통과.

Run: `npm.cmd run typecheck`

Expected: 새 provider와 route에서 오류 없음.

- [ ] **Step 8: 데이터 경계 단위 커밋**

```powershell
git add src/lib/erp/erpnext-client.ts src/lib/erp/erp-dashboard.provider.ts app/api/business/erp/dashboard/route.ts tests/erpnext-dashboard-provider.test.ts tests/erp-dashboard-route.test.ts
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
- 미수금 표에 `고객명`, `미수금`, `30일 이상`, `60일 이상`의 `<th>`가 있다.
- 비어 있는 값이 숫자 0으로 하드코딩되지 않는다.
- 바로가기는 `<a target="_blank" rel="noopener noreferrer">`이며 `buildErpQuickActionHref`와 typed action ID만 사용한다.
- 최근 활동 링크는 `buildErpRecordHref`, typed document type, 인코딩된 document name만 사용한다.
- 모바일 `grid-cols-1`, 데스크톱 다중 열, `overflow-x-auto`가 있다.

- [ ] **Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: 새 컴포넌트 파일 부재로 UI 계약 테스트 실패.

- [ ] **Step 3: metric grid와 공통 empty state 구현**

`ErpMetricGrid`는 `SurfaceCard`, Lucide icon, `formatErpMoney`를 사용한다. 현재 상태가 `not_configured`이면 `연결 후 표시`, 연결 상태의 `null`이면 `데이터 없음`을 사용한다. 비교값이 `null`이면 badge 자체를 렌더링하지 않는다.

- [ ] **Step 4: native SVG 차트 구현**

`ErpSalesTrend`는 고정 viewBox와 계산된 polyline/path를 사용한다. `null` point는 0으로 그리지 않고 선을 끊으며 해당 기간을 `데이터 없음`으로 표시한다. 데이터가 없으면 빈 SVG 축을 꾸미지 않고 명시적 empty panel을 렌더링한다. 스크린리더용 목록으로 `기간: 금액 또는 데이터 없음`을 함께 제공한다.

`ErpSalesBreakdown`은 SVG circle의 `strokeDasharray`/`strokeDashoffset`으로 donut을 만든다. 하나라도 `null` segment면 부분 donut을 진짜 합계처럼 그리지 않고 unavailable state를 표시한다. 합계가 검증된 0이면 0을 표시하고, 배열이 비었으면 `데이터 없음`을 표시한다.

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
- `not_configured`는 숫자 없이 `설치 및 연결` 버튼과 공식 문서 안내를 표시한다.
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
- 미연결 시 `설치 및 연결` 버튼. 버튼은 자동 설치를 주장하지 않고 같은 화면의 안내 panel을 펼친다.
- 안내 panel의 `연결 관리 열기` 버튼은 `dreamwish:navigate` event의 `{ view: "integrations", connectorId: "erpnext" }`를 dispatch한다. 기존 AppShell의 `pendingConnectorId`와 IntegrationCenter의 `selectedConnectorId` 계약을 그대로 사용해 ERPNext credential 입력 panel을 바로 열고 URL/company/timezone/API key/secret을 검증·저장한다. AppShell 자체는 수정하지 않는다.
- 안내 panel 링크: ERPNext GitHub, Frappe Docker Getting Started. 향후 Local Helper가 필요하다는 문구를 포함한다.

페이지 구성:

```tsx
<ErpMetricGrid status={snapshot.status} currency={snapshot.currency} metrics={snapshot.metrics} />
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
- Modify: `tests/business-hub.test.ts`
- Modify: `tests/mobile-revenue-bridge.test.ts`
- Modify: `tests/device-pairing.test.ts`

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

`mobile-revenue-bridge.test.ts`는 mobile companion parser/API 자체 테스트를 유지하되 BusinessHub가 revenue route를 사용해야 한다는 assertion을 반대로 바꾼다. `device-pairing.test.ts`는 CRM 연락처 가져오기 테스트를 유지하고 BusinessHub에서 `DeviceConnectionPanel`이 사라졌음을 확인한다.

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

CRM과 integration status의 기존 병렬 로딩, mail/cards/meetings 기능, `readApiResponse`는 유지한다.

- [ ] **Step 4: 탭과 overview/report 통합**

탭 순서를 정확히 다음과 같이 만든다.

```ts
const sections = [
  { id: "overview", label: "개요" },
  { id: "dashboard", label: "ERP 대시보드" },
  { id: "mail", label: "메일" },
  { id: "cards", label: "명함" },
  { id: "meetings", label: "회의" },
  { id: "reports", label: "리포트" }
] as const;
```

`renderSection("dashboard")`에서 `<ErpDashboard />`를 렌더링한다. overview는 `customerCount`, `followUpCustomerCount`, `openTaskCount`, `todayMeetingCount` 4개 카드만 표시한다. reports도 같은 운영 지표만 사용한다. Business 소개 문구에서 매출을 제거한다.

- [ ] **Step 5: 회귀 테스트와 타입 검사**

Run: `npm.cmd test`

Expected: BusinessHub, mobile revenue, device pairing 및 기존 mail/card/meeting 테스트 포함 전체 통과.

Run: `npm.cmd run typecheck`

Expected: 사용하지 않는 import/props와 ERP 타입 오류 없음. 선행 사용자 변경 오류가 있다면 ERP 변경과 무관함을 파일별로 기록한다.

- [ ] **Step 6: 통합 단위 커밋**

```powershell
git add components/Business/BusinessHub.tsx tests/business-hub.test.ts tests/mobile-revenue-bridge.test.ts tests/device-pairing.test.ts
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
git diff d540459 -- components/layout/Sidebar.tsx components/layout/AppShell.tsx
```

Expected: 출력 없음.

- [ ] **Step 3: 전체 자동 검증**

Run: `npm.cmd test`

Expected: 전체 테스트 통과.

Run: `npm.cmd run lint`

Expected: lint 통과.

Run: `npm.cmd run typecheck`

Expected: 변경 파일 오류 없음. 저장소의 선행 오류가 있으면 정확히 분리 보고.

Run: `npm.cmd run build`

Expected: production build 통과. 환경 변수 부재로 실패하면 오류가 코드 문제가 아닌지 확인하고 재현 명령과 메시지를 기록한다.

- [ ] **Step 4: 로컬 브라우저 검증**

Run `npm.cmd run dev` through the shell tool with an early yield, keep the returned running-cell ID, wait only until `http://127.0.0.1:3100` responds, and terminate that exact cell after browser verification. Do not start an untracked visible terminal or leave the dev server running.

브라우저에서 다음을 확인한다.

- 기존 DREAMWISH 사이드바·상단바가 전과 동일하다.
- 비즈니스 탭 순서가 `개요 · ERP 대시보드 · 메일 · 명함 · 회의 · 리포트`다.
- 연결 없음에서 재무 숫자가 표시되지 않는다.
- 375px에서 단일 열, 표 가로 스크롤, 44px 이상 버튼을 확인한다.
- 768px과 1440px에서 카드/패널이 2~3열로 자연스럽게 변한다.
- 키보드만으로 탭, 새로고침, 설치 안내, 외부 링크를 사용할 수 있다.
- 검증된 test ERPNext가 있으면 실제 0과 null이 구분되고 외부 상세 링크가 올바른 origin으로 열린다.

- [ ] **Step 5: 최종 상태와 변경 범위 확인**

Run: `git status --short`

Expected: 이 계획의 파일 외 기존 사용자 변경만 남고, `src/lib/ai/errors.ts` 및 기존 untracked 파일은 커밋에 포함되지 않았다.

Run: `git show -s --oneline d540459`

Expected: 기준 설계 커밋 `d540459`가 보인다.

Run: `git log --oneline --reverse d540459..HEAD`

Expected: 계획 커밋 뒤에 Tasks 1-6의 작은 단위 커밋이 순서대로 보인다. 다른 기존 커밋이 있으면 경로별 `git show --stat <commit>`으로 이 기능 커밋만 구분한다.

---

## Completion Checklist

- [ ] 글로벌 sidebar/topbar 변경 없음.
- [ ] Business `sales` 탭과 revenue/device UI 제거.
- [ ] `ERP 대시보드` 탭과 6 metrics, 3 middle panels, 3 lower panels 구현.
- [ ] 연결 없음에서 fake 금액 없음; 확인된 0만 0으로 표시.
- [ ] owner-scoped verified ERPNext credential과 read-only REST provider 구현.
- [ ] 선택 company/currency/timezone 강제, 다른 회사 invoice/warehouse/activity 혼입 없음.
- [ ] 12초 전체 budget, 동시성 4, truncation 시 부분 합계 비노출.
- [ ] partial failure는 degraded, refresh failure는 stale snapshot 유지.
- [ ] pinned HTTPS transport, 외부 URL/quick action/record allowlist와 credential 비노출 검증.
- [ ] mail/cards/meetings/reports 및 CRM 분리 회귀 통과.
- [ ] test/lint/typecheck/build 결과 기록.
