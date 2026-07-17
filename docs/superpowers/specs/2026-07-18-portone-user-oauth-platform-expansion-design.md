# PortOne, 사용자별 OAuth, Automation Diagnostics 확장 설계

## 1. 목적

기존 DREAMWISH의 인증, 자동화, 연동, 결제, Business 기능을 다음 원칙으로 확장한다.

1. 기존 Polar 구독을 유지하면서 PortOne을 통한 국내 결제를 병행한다.
2. 신규 국내 월간 구독은 KPN V2 정기결제를 기본 채널로 사용하고 NHN KCP V1 정기결제를 관리자 전환용 예비 채널로 제공한다.
3. 일반 사용자도 사이드바 결제 화면에서 국내 테스트 결제를 실행할 수 있지만, 테스트 결제는 실제 구독 권한이나 매출을 생성하지 않는다.
4. 모든 외부 앱 연결은 하나의 선언형 `IntegrationRegistry`와 검증된 연결 상태를 사용한다.
5. OAuth 앱은 DREAMWISH 공용 Client ID/Secret이 아니라 사용자별 Bring Your Own OAuth App 방식으로 구성한다.
6. Automation 실행 전 연결, Scope, 입력값, Adapter, Worker 상태를 검증하고 `queued` 또는 `부분 완료`의 정확한 원인과 해결 방법을 제공한다.
7. Google Authenticator 호환 TOTP, QR 기반 Companion 기기 연결, 모바일 매출 후보 수집을 기존 승인 설계대로 완성한다.

이 문서는 2026-07-17에 승인된 다음 문서들을 대체하지 않고 결제와 사용자별 OAuth 범위를 추가한다.

- `2026-07-17-authenticator-companion-automation-diagnostics-design.md`
- `2026-07-17-automation-registry-approval-oauth-engine-design.md`
- `2026-07-17-admin-coupons-social-auth-automation-guide-design.md`

충돌하는 항목이 있으면 이 문서의 결제 Provider 선택, 공개 테스트 결제, 사용자별 OAuth 정책을 우선한다.

## 2. 확정된 제품 결정

### 2.1 결제

- Polar, KPN, NHN KCP를 병행 운영한다.
- 기존 Polar 구독자는 Polar에서 계속 관리한다.
- 신규 국내 결제 화면에서는 PG사 이름을 사용자에게 선택지로 노출하지 않는다.
- 사용자는 카드, 계좌이체 등 결제수단만 선택한다.
- KPN V2를 신규 국내 일반결제 및 정기결제의 기본 Adapter로 사용한다.
- NHN KCP V1 정기결제는 관리자가 명시적으로 기본 채널을 전환할 때만 사용한다.
- 실패한 KPN 결제를 KCP로 자동 재청구하지 않는다. 교차 Provider 자동 재시도는 중복 청구 위험 때문에 금지한다.
- 플랫폼 오류 등 환불 정책상 허용된 경우만 관리자가 환불할 수 있다.
- 구독 해지는 다음 결제를 중단하고 결제된 기간 종료일까지 접근 권한을 유지한다.

### 2.2 공개 테스트 결제

- `BILLING_PUBLIC_SANDBOX_ENABLED=true`일 때 로그인한 일반 사용자는 사이드바의 결제 버튼에서 PortOne 테스트 결제를 실행할 수 있다.
- 화면 상단과 결제 버튼 주변에 `테스트 결제 - 실제 청구 및 구독 활성화 없음`을 표시한다.
- 테스트 결제 성공은 `test_succeeded`로 저장한다.
- 테스트 결제는 유료 Entitlement, 확정 매출, 환불 가능 잔액, 운영 구독을 생성하지 않는다.
- 테스트 결제와 운영 결제는 DB 필드, 결제 ID 접두사, Channel Key, Webhook Secret, 관리자 필터로 구분한다.
- 운영 전환은 환경 설정과 관리자 준비 상태 검증을 모두 통과해야 한다.
- 일반 사용자의 테스트 결제는 현재 기본 국내 채널인 KPN V2 Sandbox를 사용한다. KCP V1 Sandbox의 개별 검증은 관리자 결제 테스트 화면에서 수행한다.
- `BILLING_DOMESTIC_MODE=live`와 `BILLING_PUBLIC_SANDBOX_ENABLED=true`를 동시에 설정하면 서버가 결제를 비활성화하고 설정 오류를 표시한다. 한 배포 환경에서 공개 Sandbox와 운영 결제를 혼합하지 않는다.

### 2.3 사용자별 OAuth 앱

- 각 사용자는 공급자 개발자 콘솔에서 자신의 OAuth 앱을 생성한다.
- DREAMWISH는 앱별 정확한 Redirect URI, 필요한 Scope, Client ID/Secret 발급 위치를 안내한다.
- Client ID와 Client Secret을 서버에 제출하면 Secret은 즉시 암호화하여 저장한다.
- 사용자별 OAuth 앱 설정을 다른 사용자나 워크스페이스가 사용할 수 없다.
- Client Secret, Access Token, Refresh Token은 저장 후 다시 평문으로 반환하지 않는다.
- API Key, Bot Token, Service Account 방식 앱도 사용자별 Credential로 저장하고 공급자 API로 검증한다.

### 2.4 구현 순서

1. 인증과 기기 연결 기반 완성
2. 전체 앱 OAuth/API Key 연결 통합
3. Automation preflight, Queue 진단, 실행 가이드
4. PortOne 결제와 관리자 테스트 도구
5. 매출 알림과 Business 개요 연동

각 단계는 테스트와 코드 검토를 통과한 후 다음 단계로 이동한다.

## 3. 전체 아키텍처

기존 Next.js 애플리케이션과 PostgreSQL을 유지하는 모듈형 단일 서버 구조를 사용한다.

### 3.1 도메인 경계

#### Security

- TOTP 등록, 검증, 복구 코드, MFA Challenge
- QR 기기 연결과 기기 서명 검증
- Secret 암호화와 keyed digest

#### Integration

- 선언형 `IntegrationRegistry`
- 사용자별 OAuth 앱 설정
- OAuth/API Key/Service Account 연결
- Credential 검증, 갱신, 버전 관리

#### Automation

- 선언형 `ActionRegistry`
- 공통 실행 파이프라인과 앱별 Server Adapter
- Preflight, Preview, Approval, Queue, Worker, 실행 진단

#### Billing

- 공통 `BillingGateway`
- Polar, PortOne KPN V2, PortOne NHN KCP V1 Adapter
- 결제 시도, Billing Method, 구독, Webhook Inbox, Entitlement

#### Notification

- 앱 내부, 이메일, Slack, 브라우저, 모바일 Push Outbox
- 수신 Inbox와 idempotency

#### Revenue

- 검증된 운영 결제의 확정 매출 반영
- 모바일/Gmail 매출 후보의 검토 및 확정
- 중복, 취소, 개인 거래 분류

#### Admin

- 결제 Provider와 환경 준비 상태
- 사용자, 구독, 쿠폰, 매출
- Worker, Queue, DLQ, 감사 로그
- 연결 실패 통계

### 3.2 공통 Adapter 계약

결제, OAuth, Queue, Notification은 구체 구현과 호출자를 분리한다.

```ts
interface BillingGateway {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  issueBillingMethod(input: IssueBillingMethodInput): Promise<BillingMethodResult>;
  charge(input: ChargeInput): Promise<ChargeResult>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<CancelResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifiedPayment>;
}

interface OAuthProviderAdapter {
  buildAuthorizationUrl(input: OAuthAuthorizationInput): Promise<string>;
  exchangeCode(input: OAuthCodeExchangeInput): Promise<OAuthTokenSet>;
  refresh(input: OAuthRefreshInput): Promise<OAuthTokenSet>;
  verifyConnection(input: OAuthConnectionVerificationInput): Promise<ConnectionIdentity>;
}

interface CredentialVerifier {
  verify(input: CredentialVerificationInput): Promise<CredentialVerificationResult>;
}
```

Adapter는 Secret의 저장 위치를 알지 못한다. 공통 서비스가 소유권을 검증하고 실행 직전에 복호화된 값을 최소 범위로 Adapter에 전달한다.

## 4. Billing 설계

### 4.1 Provider Adapter

#### Polar

- 기존 Checkout, Webhook, Customer Portal 코드를 재사용한다.
- 기존 Polar 구독의 Provider를 변경하거나 자동 이전하지 않는다.
- Polar 구독 해지는 기존 Portal 흐름을 유지한다.

#### PortOne V2 KPN

- 일반결제는 PortOne Browser SDK V2 `requestPayment`를 사용한다.
- 빌링키 발급은 `requestIssueBillingKey`를 사용한다.
- 정기 청구는 서버에서 고유 `paymentId`와 idempotency key를 생성하고 빌링키 결제 API를 호출한다.
- 카드번호, CVC, 생년월일, 카드 비밀번호는 DREAMWISH UI나 API가 직접 수집하지 않는다.
- KPN API 빌링키 기능의 사전 계약 완료 여부를 관리자 준비 상태에서 확인하도록 안내한다.

공식 문서: <https://developers.portone.io/opi/ko/integration/pg/v2/kpn?v=v2>

#### PortOne V1 NHN KCP

- PortOne V1 SDK `IMP.request_pay`와 `channelKey`를 사용한다.
- `pg` 파라미터는 deprecated이므로 새 코드에서 사용하지 않는다.
- 빌링키 발급 시 `customer_uid`를 DREAMWISH가 충돌 없이 생성한다.
- 즉시 청구는 `/subscribe/payments/again`, 예약 청구는 `/subscribe/payments/schedule`을 서버에서 호출한다.
- KCP V1은 관리자 설정으로 전환된 경우에만 신규 정기결제에 사용한다.

공식 문서:

- <https://developers.portone.io/opi/ko/integration/pg/v1/nhn-kcp/readme>
- <https://developers.portone.io/opi/ko/integration/start/v1/non-auth>

### 4.2 결제 데이터 흐름

1. 로그인 사용자와 구독 상태를 확인한다.
2. 서버가 요금제, 쿠폰, 금액, 통화, 결제 목적, 환경을 검증한다.
3. 서버가 불변 예상 금액과 고유 결제 ID를 포함한 `billing_payment_attempt`를 생성한다.
4. 공개 가능한 Store ID, Channel Key, 결제 ID만 클라이언트에 반환한다.
5. 클라이언트가 PortOne 호스팅 결제창을 실행한다.
6. 브라우저 Callback은 결과 조회를 시작하는 신호로만 사용한다.
7. 서버가 PortOne API에서 Provider 결제 상태, 금액, 통화, 결제 ID를 재조회한다.
8. 예상 값과 Provider 값이 모두 일치할 때만 성공 처리한다.
9. 운영 결제만 구독 Entitlement와 확정 매출을 생성한다.
10. Webhook은 동일한 검증 경로를 호출하며 Inbox에서 중복을 제거한다.

### 4.3 Webhook

- V2 Webhook은 `@portone/server-sdk`로 Signature를 검증한다.
- V2 테스트와 운영 Webhook Secret을 구분한다.
- V1 Webhook은 `imp_uid`와 `merchant_uid`를 신뢰하지 않고 V1 REST API로 결제를 다시 조회한다.
- Provider 이벤트 ID가 있으면 이를 Inbox idempotency key로 사용한다.
- 이벤트 ID가 없으면 Provider, 환경, 결제 ID, 상태, 발생 시각의 정규화 해시를 사용한다.
- Webhook 처리 실패는 재시도 가능 상태로 저장하고 Entitlement를 먼저 부여하지 않는다.

공식 V2 Webhook 문서: <https://developers.portone.io/opi/ko/integration/webhook/readme-v2?v=v2>

### 4.4 결제 영속 모델

새 테이블을 만들거나 동일한 책임의 기존 PostgreSQL 모델을 확장한다.

#### `billing_payment_attempts`

- `id`, `owner_id`, `provider`, `environment`, `purpose`
- `provider_payment_id`, `provider_transaction_id`
- `idempotency_key`, `order_name`
- `expected_amount`, `verified_amount`, `currency`
- `coupon_redemption_id`
- `status`, `failure_code`, `safe_failure_message`
- `created_at`, `verified_at`, `completed_at`

#### `billing_methods`

- `id`, `owner_id`, `provider`, `environment`
- 암호화된 Provider billing reference
- 마스킹된 카드 브랜드/끝 네 자리 등 Provider가 안전하게 반환한 메타데이터
- `status`, `created_at`, `revoked_at`

#### `billing_subscriptions`

- `id`, `owner_id`, `provider`, `environment`, `billing_method_id`
- `status`, `current_period_start`, `current_period_end`
- `next_charge_at`, `cancel_at_period_end`, `cancelled_at`
- `provider_subscription_id`, `last_payment_attempt_id`

#### `billing_webhook_inbox`

- `provider`, `environment`, `event_key` unique
- `payload_hash`, `received_at`, `processed_at`
- `status`, `failure_code`, `retry_count`

#### `billing_events`

- Append Only
- 상태 변경, 검증, 취소, 환불, Provider 전환, 관리자 작업 기록

### 4.5 쿠폰

- 할인형 쿠폰은 서버에서 예약하고 결제 직전 최종 금액을 계산한다.
- 결제 검증 실패 시 쿠폰 예약을 안전하게 해제한다.
- 결제 성공 후에만 할인형 쿠폰을 사용 완료로 변경한다.
- 이용권형 쿠폰은 PG 결제를 만들지 않고 별도 Entitlement를 생성한다.
- 테스트 결제에 입력한 쿠폰은 운영 사용 횟수를 소비하지 않는다.

## 5. Integration 설계

### 5.1 단일 Registry

`IntegrationRegistry`는 다음 화면과 서버 로직의 단일 기준이다.

- 자동화 앱 목록과 앱 선택 화면
- 자동화 Canvas Node와 Inspector
- 연동 페이지
- 실행 내역과 승인 Preview
- Workflow Template
- 사용가이드와 채팅 실행 안내

각 `IntegrationDefinition`은 다음 정보를 포함한다.

- `id`, `name`, `logoPath`, `category`
- 지원 `authModes`
- 사용자 입력 Credential field 정의
- OAuth authorization/token/refresh endpoint 식별자
- 고정 Callback path와 표시용 Redirect URI 생성기
- 기본 Scope와 Action별 필수 Scope
- Adapter key와 구현 상태
- 연결 검증 방식
- 공식 키 발급 문서 URL과 단계별 안내

### 5.2 사용자별 OAuth 앱 저장

`integration_oauth_app_configs`를 추가하거나 동일한 책임의 기존 저장소를 확장한다.

- `id`, `owner_id`, `integration_id`, `provider`
- `client_id`
- 암호화된 `client_secret`
- `redirect_uri`, `config_version`
- `status`, `last_verified_at`, `last_error_code`
- `created_at`, `updated_at`, `revoked_at`

Client Secret을 변경하면 기존 연결을 무조건 성공으로 간주하지 않는다. 공급자 정책상 기존 Refresh Token이 새 Client Secret에서 사용할 수 없는 경우 연결을 `reauthorization_required`로 전환한다.

### 5.3 OAuth 흐름

1. 사용자가 앱별 연결 가이드에서 Redirect URI를 복사한다.
2. 공급자 개발자 콘솔에서 OAuth 앱을 만든다.
3. Client ID/Secret을 DREAMWISH에 입력한다.
4. 서버가 Secret을 암호화하고 설정 버전을 저장한다.
5. `state`, nonce, PKCE 지원 Provider의 code verifier, 만료 시간을 DB에 저장한다.
6. 공급자 로그인/동의 화면으로 이동한다.
7. Callback에서 소유자, Provider, 설정 버전, state, 만료를 검증한다.
8. 토큰을 교환하고 암호화 저장한다.
9. 실제 사용자 정보와 부여 Scope를 조회한다.
10. 검증된 경우만 연결을 `connected`로 변경한다.

### 5.4 대상 Provider

- 기존 Google 계열: Gmail, Sheets, Calendar, Drive, YouTube
- Slack, Notion, GitHub, Discord
- 신규 Microsoft OAuth: Outlook, Microsoft Teams, OneDrive
- 신규 Dropbox OAuth
- OAuth 또는 사용자 Token을 공식 지원하는 앱: HubSpot, Salesforce, Shopify, WordPress, Facebook, Instagram, X, LinkedIn
- 직접 Credential을 공식 지원하는 앱: Telegram Bot Token, Discord Bot/Webhook, OpenAI API Key, Stripe Secret Key, Airtable PAT, Trello API Key/Token, Jira API Token, Linear Personal API Key, Notion Integration Token, GitHub PAT, Google Sheets Service Account
- 그 밖의 현재 Registry 앱은 공급자 공식 인증 방식이 확인된 경우에만 해당 Adapter를 등록한다.

Provider가 지원하지 않는 인증 방식을 임의로 만들지 않는다. 각 앱은 공식적으로 지원되는 OAuth, API Key, Bot Token, Service Account 중 하나 이상을 명시한다.

### 5.5 연결 검증과 UI

- 공급자 API로 검증된 경우만 `connected`를 표시한다.
- 자동화 페이지와 연동 페이지는 같은 `VerifiedConnectionService`를 호출한다.
- 자동화 노드에서 소유자가 보유한 연결 계정을 선택한다.
- Scope 부족, Credential 만료, Client Secret 변경은 연결 상태에 반영한다.
- 연결 실패 화면에는 오류 코드, 안전한 Provider 메시지, 필요한 필드, 공식 발급 위치, 재연결 버튼을 제공한다.
- Secret, Access Token, Refresh Token, API Key는 화면, 로그, 채팅, DLQ에서 마스킹한다.

## 6. Automation 실행과 진단

### 6.1 Preflight

Queue에 Job을 넣기 전에 다음을 검증한다.

- Workflow graph, 순환 참조, 연결되지 않은 Node
- 고정된 ActionDefinition/Adapter version
- 필수 입력값과 이전 Node 출력 매핑
- 선택된 Connection 소유권과 존재 여부
- Credential 상태, 만료, 필수 Scope
- Adapter 구현 여부
- 실행 모드와 승인 정책
- 호환 Worker heartbeat

구조적 오류는 실행 요청을 거절한다. 수정 가능한 연결 오류는 영속 `waiting_connection`으로 저장하되 Queue Job은 생성하지 않는다.

### 6.2 Queue와 Worker

- PostgreSQL Queue Adapter를 기본으로 사용한다.
- Worker는 lease/lock을 사용하고 `locked_until`, `worker_id`를 저장한다.
- 동일 Job은 동시에 두 Worker가 실행하지 못한다.
- Worker heartbeat를 DB에 기록한다.
- 오래된 `queued` 실행에 호환 Worker가 없으면 저장 상태를 임의 변경하지 않고 `WORKER_OFFLINE` 진단을 표시한다.
- Lease 만료 Job은 idempotency 정책을 확인한 뒤 회수한다.
- 재시도 한도를 넘은 Job은 DLQ로 이동한다.

### 6.3 실행 내역

실행 상세는 다음을 표시한다.

- 실패한 앱, Node, Action, Step
- 오류 코드와 안전한 원인
- 누락 입력, Scope, Connection
- 재시도 가능 여부와 다음 시각
- Provider API Request ID
- Rate Limit, Adapter latency, retry count
- Preview, 입력/출력의 마스킹된 값
- 연결 수정, 입력값 수정, 새 실행 링크

`queued`는 `실행 예정`, `승인 대기`, `Worker 대기`, `재시도 예정`의 구체 원인을 표시한다. Filter가 false이면 `skipped`이다.

### 6.4 Node 출력 매핑

Gmail 수신 -> AI 분석 -> Notion 저장과 같은 흐름에서 사용자가 Node ID나 JSON 경로를 개발자 도구로 찾지 않도록 한다.

- Inspector에 이전 Node 출력 선택기를 제공한다.
- 필드별로 호환 가능한 출력 값을 검색하고 삽입한다.
- AI 분석 결과의 `text`, 구조화 JSON, 원문 요약을 명명된 출력으로 제공한다.
- Notion 제목/본문/속성 입력에 이전 출력 칩을 사용할 수 있다.
- 누락된 매핑은 Preview에서 실행 전 차단한다.

### 6.5 Adapter 준비 상태

- Registry 정의만 있고 실제 Adapter가 없는 Action은 선택 목록에서 비활성화한다.
- Provider API 호출과 오류 매핑까지 구현된 Action만 준비 완료로 표시한다.
- 모든 앱의 Action을 한 번에 허위 구현하지 않는다.
- 공식 API와 필요한 권한이 있는 Action부터 Adapter 계약 테스트와 함께 순차적으로 준비 완료 처리한다.

## 7. Authenticator, Companion, Revenue

### 7.1 TOTP

- Settings에서 `otpauth://` QR과 수동 키를 표시한다.
- Google Authenticator 등 표준 TOTP 앱으로 스캔한다.
- 6자리 코드를 검증한 후에만 활성화한다.
- 이미 사용된 counter를 재사용하지 못한다.
- 복구 코드 평문은 한 번만 표시하고 keyed hash만 저장한다.

### 7.2 Companion 기기 연결

- 웹사이트가 10분 만료, 1회용 QR 연결 세션을 만든다.
- 휴대폰 일반 카메라가 HTTPS App Link/Universal Link를 연다.
- Companion은 기기 개인 키를 Android Keystore 또는 iOS Keychain에 만든다.
- 휴대폰에 6자리 확인 코드를 표시하고 사용자가 웹사이트에 입력한다.
- 서버는 소유자, 세션, 코드 해시, 만료, 실패 횟수, 사용 여부를 검증한다.
- 이후 동기화는 기기 서명, 단조 증가 sequence, event ID, timestamp를 검증한다.

### 7.3 Companion 프로젝트

- 별도 bare React Native 저장소: `D:\DREAMWISH-Companion`
- Android: Notification Listener, 선택 패키지 allowlist, Play AAB
- iPhone: Share Extension, Keychain, TestFlight 준비
- iPhone은 다른 앱 Push를 자동으로 읽는다고 안내하지 않는다.
- iPhone 빌드와 서명은 macOS/Xcode 또는 macOS CI에서 검증한다.

### 7.4 Revenue

- 검증된 PortOne 운영 결제는 확정 매출로 반영한다.
- PortOne 테스트 결제는 매출에서 제외한다.
- Android 알림, iPhone 공유, Gmail 거래 알림은 먼저 `provisional` 매출 후보로 저장한다.
- 사용자는 매출, 지출, 개인 거래, 중복, 취소, 잘못된 값으로 검토한다.
- 확정 수입만 Business 총매출과 순이익에 반영한다.
- 중복 fingerprint와 취소 원거래 연결로 이중 집계를 막는다.

## 8. 관리자와 일반 사용자 UI 경계

### 8.1 일반 사용자

- 사이드바 결제 버튼
- 공개 테스트 결제와 명확한 Sandbox 배너
- 자신의 구독과 해지
- 자신의 OAuth 앱 설정과 연결 계정
- 자동화 실행 내역과 수정 가능한 오류 해결 링크
- 기기 연결과 매출 후보 검토

### 8.2 관리자

- 프로필 메뉴의 관리자 페이지 링크
- 결제 Provider 준비 상태와 KPN/KCP 수동 전환
- 테스트/운영 Channel Key 상태
- 결제 시도, Webhook 실패, 구독, 환불
- 쿠폰 생성과 사용 현황
- Worker heartbeat, Queue, DLQ, 재실행
- 감사 로그와 연결 실패 통계

일반 Automation 페이지에서는 감사 로그와 관리자 DLQ 메뉴를 제거한다.

## 9. 오류 계약

모든 외부 연동 오류는 안정적인 코드, 안전한 메시지, 영향, 해결 단계, deep link를 가진다.

- `CONNECTION_REQUIRED`
- `CONNECTION_NOT_FOUND`
- `CREDENTIAL_INVALID`
- `SCOPE_INSUFFICIENT`
- `ADAPTER_UNAVAILABLE`
- `PROVIDER_AUTH_FAILED`
- `WORKER_OFFLINE`
- `RATE_LIMITED`
- `PAYMENT_CONFIG_MISSING`
- `PAYMENT_MODE_CONFLICT`
- `PAYMENT_PROVIDER_UNAVAILABLE`
- `PAYMENT_VERIFICATION_FAILED`
- `PAYMENT_AMOUNT_MISMATCH`
- `WEBHOOK_SIGNATURE_INVALID`
- `DEVICE_PAIRING_EXPIRED`

Provider의 원문 응답 전체를 사용자나 로그에 저장하지 않는다. Request ID와 허용된 오류 코드만 보존한다.

## 10. Railway 설정 계약

실제 값은 저장소에 커밋하지 않는다. 아래 이름은 구현 후 `.env.example`과 운영 문서의 단일 기준으로 사용한다.

### 10.1 Billing 모드

```env
BILLING_DOMESTIC_MODE="sandbox"
BILLING_PUBLIC_SANDBOX_ENABLED="true"
BILLING_DOMESTIC_PRIMARY_PROVIDER="portone_kpn_v2"
BILLING_DOMESTIC_FALLBACK_PROVIDER="portone_kcp_v1"
```

### 10.2 PortOne V2 / KPN

```env
PORTONE_V2_STORE_ID=""
PORTONE_V2_API_SECRET=""
PORTONE_KPN_TEST_GENERAL_CHANNEL_KEY=""
PORTONE_KPN_TEST_BILLING_CHANNEL_KEY=""
PORTONE_KPN_LIVE_GENERAL_CHANNEL_KEY=""
PORTONE_KPN_LIVE_BILLING_CHANNEL_KEY=""
PORTONE_V2_WEBHOOK_SECRET_TEST=""
PORTONE_V2_WEBHOOK_SECRET_LIVE=""
```

- Store ID, V2 API Secret, Channel Key는 PortOne Console의 결제 연동 영역에서 발급한다.
- Webhook Secret은 PortOne Console에서 V2 및 테스트/실연동 모드를 각각 선택해 발급한다.
- KPN 빌링키 기능은 KPN 사전 계약 완료 후 운영 활성화한다.

### 10.3 PortOne V1 / NHN KCP

```env
PORTONE_V1_IMP_CODE=""
PORTONE_V1_API_KEY=""
PORTONE_V1_API_SECRET=""
PORTONE_KCP_V1_TEST_BILLING_CHANNEL_KEY=""
PORTONE_KCP_V1_LIVE_BILLING_CHANNEL_KEY=""
```

- `IMP_CODE`, V1 REST API Key, V1 REST API Secret은 PortOne Console의 V1 API 식별 정보에서 확인한다.
- Channel Key는 PortOne Console의 KCP 채널 관리에서 확인한다.
- V1 API Secret은 브라우저에 전달하지 않는다.

### 10.4 기존 Polar

```env
POLAR_ACCESS_TOKEN=""
POLAR_PRODUCT_ID=""
POLAR_WEBHOOK_SECRET=""
POLAR_SERVER="production"
```

### 10.5 Security, Integration, Device, Revenue

```env
AUTH_TOTP_ENCRYPTION_KEY=""
AUTH_SECURITY_HASH_KEY=""
AUTH_MFA_CHALLENGE_SECRET=""
DEVICE_PAIRING_HASH_SECRET=""
REVENUE_DATA_ENCRYPTION_KEY=""
INTEGRATION_TOKEN_ENCRYPTION_KEY=""
OAUTH_TOKEN_ENCRYPTION_KEY=""
AUTOMATION_CREDENTIAL_ENCRYPTION_KEY=""
```

사용자별 앱 Client ID/Secret은 Railway 공용 환경변수가 아니라 암호화된 사용자 데이터로 저장한다. Kakao/Naver 로그인 등 DREAMWISH 자체 로그인 Provider의 플랫폼 키는 기존 Railway 설정을 유지한다.

## 11. 보안 원칙

- 카드 데이터를 직접 수집하지 않고 PortOne/PG 호스팅 UI를 사용한다.
- 결제 Callback 결과만으로 구독을 활성화하지 않는다.
- 운영 결제 금액과 통화를 서버가 독립 검증한다.
- OAuth `state`, PKCE, 만료, owner binding, 설정 버전을 검증한다.
- Secret은 목적별 독립 암호화 키를 사용한다.
- Webhook, Queue, Notification은 idempotency를 적용한다.
- 감사 이벤트는 Append Only로 저장한다.
- 테스트와 운영 Provider 설정을 혼용하지 않는다.
- Credential Secret이나 Provider 원문 Payload는 DLQ에 저장하지 않는다.

## 12. 검증 전략

### 12.1 자동 테스트

- BillingGateway 및 Provider Adapter 계약 테스트
- 예상 금액/Provider 금액 불일치 차단 테스트
- 테스트 결제의 Entitlement/Revenue 불변 테스트
- Webhook Signature, Inbox idempotency, 재시작 테스트
- OAuth state/PKCE/만료/소유권/Scope 테스트
- 사용자별 OAuth Secret 격리와 암호화 테스트
- Automation preflight와 `waiting_connection` 테스트
- Queue lease, Worker heartbeat, 중복 실행, DLQ 테스트
- TOTP replay, 복구 코드, 기기 연결 replay 테스트
- Revenue 중복/취소/검토 상태 테스트

### 12.2 통합 테스트

- PortOne KPN V2 테스트 일반결제
- PortOne KPN V2 테스트 빌링키 발급과 정기 청구
- PortOne KCP V1 테스트 빌링키 발급과 예약/반복 청구
- Google, Microsoft, Dropbox 등 사용자별 OAuth 연결
- Gmail -> AI 분석 -> Notion 저장 시나리오
- Worker/서버 재시작 후 Queue와 승인 복원

실제 운영 결제는 자동 테스트에서 실행하지 않는다.

### 12.3 UI 및 빌드 검증

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- Android `testDebugUnitTest`, `assembleDebug`, 서명 입력이 있을 때 `bundleRelease`
- iOS 정적 검증, 이후 macOS에서 `xcodebuild`와 TestFlight 검증

## 13. 완료 기준

다음 조건을 모두 만족해야 전체 구현을 완료로 보고한다.

1. 기존 Polar 구독이 회귀 없이 유지된다.
2. 일반 사용자가 공개 Sandbox 결제를 실행하고 테스트 성공 상태를 확인할 수 있다.
3. Sandbox 결제가 운영 Entitlement나 매출을 만들지 않는다.
4. KPN V2 일반/정기 테스트와 KCP V1 정기 테스트가 서버 재검증을 통과한다.
5. 사용자별 OAuth 앱으로 Registry의 OAuth 앱을 연결할 수 있다.
6. API Key 앱은 실제 공급자 검증 후에만 연결 상태가 된다.
7. 자동화/연동 페이지가 동일한 연결 상태를 사용한다.
8. 연결 실패와 `queued` 상태가 정확한 원인 및 해결 방법을 제공한다.
9. 선택 가능한 모든 Action은 실제 Adapter가 존재한다.
10. TOTP, QR 기기 연결, 모바일 매출 후보 검토가 승인 설계대로 동작한다.
11. 전체 lint, typecheck, test, build가 성공한다.
12. 최종 보고에 변경 파일, 미구현/외부 계약 필요 항목, Railway 변수 이름과 발급 위치를 포함한다.

## 14. 비목표 및 외부 의존성

- KPN/NHN KCP 가맹 계약, PortOne Console 채널 생성, 운영 심사를 코드로 대신하지 않는다.
- 실제 결제 Secret, 카드 데이터, Play signing key, Apple certificate를 저장소에 생성하거나 커밋하지 않는다.
- Windows 환경에서 iPhone 앱을 서명하거나 TestFlight에 업로드했다고 보고하지 않는다.
- 공급자가 제공하지 않는 API 또는 Scope를 임의 구현하지 않는다.
- 모든 Provider 실패를 다른 PG로 자동 재청구하지 않는다.
- 사용자가 입력한 OAuth Client Secret을 채팅 결과에 다시 표시하지 않는다.
