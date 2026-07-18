# Railway 운영·PostgreSQL·Polar·PortOne 완성 설계

## 1. Railway 서비스 분리

다음 서비스를 별도 배포한다.

- web: Next.js UI/API
- automation-worker: automation queue lease 실행
- billing-worker: webhook inbox/outbox와 결제 후처리
- local-agent-relay: WSS opaque relay
- scheduler-cron: bounded recovery/cleanup

각 서비스는 별도 Railway config와 최소 환경변수를 가진다. worker는 web build artifact와 schema version 호환성을 heartbeat에 포함한다.

## 2. Worker heartbeat와 queue

- heartbeat: worker ID, version, capabilities, schema version, startedAt, lastSeenAt
- queue lease: PostgreSQL `FOR UPDATE SKIP LOCKED`, fencing token, lease expiry
- graceful shutdown: 새 lease 중단, 현재 작업 checkpoint, lease release
- stale job recovery와 max attempts/dead-letter
- queue 삽입 전 OAuth/Credential/scope/Adapter preflight
- queued UI: position, worker 상태, next retry, blocking reason, recovery action

환경변수 존재만으로 healthy라 하지 않는다. 최근 호환 heartbeat와 작은 실제 DB operation이 있어야 healthy다.

## 3. 실제 PostgreSQL 검증

현재 JSON fallback 단위 테스트와 별개로 실제 PostgreSQL integration suite를 둔다.

- migration up/idempotent
- owner isolation과 foreign key
- concurrent queue claim exactly-once lease
- webhook inbox unique event ID
- outbox retry와 fencing
- billing entitlement transition
- OAuth state/config encryption round trip
- memory migration checksum
- worker heartbeat compatibility

로컬 CI는 disposable PostgreSQL container를 사용한다. production verification script는 read/write 가능한 전용 verification namespace만 사용하고 생성한 행을 종료 시 정리한다. production customer row를 조회하거나 수정하지 않는다.

## 4. Polar

- stored customer/subscription IDs가 source of truth
- webhook inbox에 signature verified raw event hash와 safe parsed fields 저장
- duplicate/out-of-order event 처리
- sandbox와 production entitlement 분리
- no-customer는 checkout, active customer는 portal
- cancel-at-period-end, revoke, refund 상태를 UI 권한에 반영
- access token/product/webhook/app URL 상태를 admin diagnostics에 boolean과 stable code로 표시

## 5. PortOne 국내 결제

### 지원 경로

- KPN V2 일반 결제와 정기 결제
- NHN KCP V1 정기 결제

### 상태 모델

`created → pending_provider → verification_pending → test_succeeded | succeeded | failed | expired`

Sandbox/test 성공은 production entitlement를 만들거나 coupon을 소비하지 않는다. live 성공은 서버에서 PortOne transaction/schedule을 재조회해 amount, currency, store, channel, customer, status를 검증한 뒤에만 entitlement를 갱신한다.

### 데이터

- billing attempts
- subscription schedules
- payment transactions
- webhook inbox
- coupons/redemptions/reservations
- entitlements
- refunds/cancellations
- billing outbox/audit

Webhook은 signature, timestamp/replay window, unique event ID를 검증한다. API 응답만 믿지 않고 provider 조회 결과와 내부 attempt를 대조한다.

### 사용자·관리자 UI

- 사용자는 PG, sandbox/live badge, 결제 단계, 정확한 실패 사유와 해결 방법을 본다.
- 관리자는 설정 상태, webhook 처리, 정체 outbox, transaction lookup, refund/cancel audit를 본다.
- Secret, 카드 정보, billing key 원문은 표시하지 않는다.

## 6. 환경변수 문서

Railway 문서는 다음을 서비스별로 구분한다.

- PostgreSQL과 data encryption keys
- TOTP/MFA security keys
- user-managed OAuth encryption key와 app origin
- Polar access token/product/webhook/server
- PortOne store/API/webhook/channel/PG identifiers
- Firebase server push 설정
- automation/billing worker ID와 poll/lease/heartbeat
- Local Agent Relay signing/session keys와 public origin

각 변수는 이름, 사용 서비스, 발급 위치, sandbox/live 구분, rotation 영향, 누락 시 오류 코드를 포함한다. 실제 값을 예시에 넣지 않는다.

## 7. 운영 오류와 관측성

- 모든 worker/job/payment event에 correlation/request ID
- secret 없는 structured log
- heartbeat age, queue lag, retry/dead-letter, webhook lag, provider latency metric
- 사용자 데이터 없는 synthetic health probe
- 관리자 상태는 `not_configured`, `configured_offline`, `degraded`, `healthy`로 구분
- 오류 카드가 관련 Railway service, 환경변수 이름, provider dashboard, retry action을 정확히 연결

## 8. 테스트와 외부 검증

- provider mock contract와 실제 sandbox smoke를 분리한다.
- KPN/KCP sandbox credentials가 있으면 일반·정기 결제와 webhook을 실제 실행한다.
- Polar sandbox customer 생성, checkout, webhook, portal, cancellation을 검증한다.
- production live charge는 사용자의 명시적 별도 승인 없이 실행하지 않는다.
- 실제 자격증명이 없으면 code/test 완료와 외부 sandbox 미검증을 최종 보고에서 구분한다.
- Railway 배포·환경변수 변경은 저장소 구현 후 사용자의 배포 권한이 있을 때만 수행한다.
