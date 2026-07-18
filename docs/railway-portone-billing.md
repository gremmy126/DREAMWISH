# Railway PortOne 국내 결제 운영 가이드

이 문서는 DREAMWISH의 PortOne KPN V2 일반·정기결제, NHN KCP V1 정기결제, Webhook,
Billing Worker를 Railway에 배포하는 절차입니다. 카드번호·CVC·비밀번호는 DREAMWISH 입력란이나
환경변수에 넣지 않습니다. 결제창은 PortOne/KPN/NHN KCP가 호스팅하고 서버는 공급자 식별자만
암호화해 보관합니다.

## 1. 공통 모드

Railway web 서비스와 billing-worker 서비스에 같은 `DATABASE_URL`, `APP_URL`,
`INTEGRATION_TOKEN_ENCRYPTION_KEY`(또는 `OAUTH_TOKEN_ENCRYPTION_KEY`)를 설정합니다.

- `BILLING_DOMESTIC_MODE`: `sandbox` 또는 `live`
- `BILLING_PUBLIC_SANDBOX_ENABLED`: 사용자 테스트 결제를 열 때만 `true`; `live`에서는 반드시 `false`
- `BILLING_DOMESTIC_PRIMARY_PROVIDER`: `portone_kpn_v2` 또는 `portone_kcp_v1`
- `BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW`: 서버가 소유하는 월 결제 금액

`BILLING_DOMESTIC_MODE=live`와 `BILLING_PUBLIC_SANDBOX_ENABLED=true` 조합은 애플리케이션이
기동 중 거부합니다. 공급자 전환은 신규 구독에만 적용하며 기존 구독은 최초 공급자로 계속 청구합니다.

## 2. PortOne Console에서 가져올 값

V2 공통:

- `PORTONE_V2_STORE_ID`: 상점 ID
- `PORTONE_V2_API_SECRET`: 서버 API Secret
- `PORTONE_KPN_TEST_GENERAL_CHANNEL_KEY`: KPN 테스트 일반결제 Channel Key
- `PORTONE_KPN_TEST_BILLING_CHANNEL_KEY`: KPN 테스트 빌링키 Channel Key
- `PORTONE_KPN_LIVE_GENERAL_CHANNEL_KEY`: KPN 운영 일반결제 Channel Key
- `PORTONE_KPN_LIVE_BILLING_CHANNEL_KEY`: KPN 운영 빌링키 Channel Key
- `PORTONE_V2_WEBHOOK_SECRET_TEST`: 테스트 Webhook Secret
- `PORTONE_V2_WEBHOOK_SECRET_LIVE`: 운영 Webhook Secret

V1 NHN KCP:

- `PORTONE_V1_IMP_CODE`: 고객사 식별코드
- `PORTONE_V1_API_KEY`: V1 REST API Key
- `PORTONE_V1_API_SECRET`: V1 REST API Secret
- `PORTONE_KCP_V1_TEST_BILLING_CHANNEL_KEY`: KCP 테스트 정기결제 Channel Key
- `PORTONE_KCP_V1_LIVE_BILLING_CHANNEL_KEY`: KCP 운영 정기결제 Channel Key

KPN과 NHN KCP의 정기결제 계약 및 빌링키 기능이 PortOne Console에서 승인된 뒤 사용합니다.
테스트/운영 Channel Key를 서로 복사하지 마세요. API Secret과 Webhook Secret은 Railway의
sealed Variable로만 저장하고 브라우저 응답·로그·Git에 남기지 않습니다.

## 3. Webhook

공개 HTTPS 기준 URL을 PortOne Console에 각각 등록합니다.

- V2: `https://dreamwish.co.kr/api/webhooks/portone/v2`
- V1: `https://dreamwish.co.kr/api/webhooks/portone/v1`

V2는 원문 request body를 `PORTONE_V2_WEBHOOK_SECRET_TEST` 또는
`PORTONE_V2_WEBHOOK_SECRET_LIVE`로 먼저 검증합니다. V1 알림은 전달 값을 신뢰하지 않고
V1 REST API로 결제 건을 다시 조회합니다. 두 경로 모두 PostgreSQL Inbox의 event key로 중복을 막습니다.

## 4. Railway 서비스

1. web 서비스는 `/railway.toml`을 사용합니다.
2. 같은 저장소로 Billing Worker 서비스를 추가하고 Config File Path를
   `/railway.billing-worker.toml`로 지정합니다.
3. 두 서비스가 같은 `DATABASE_URL`과 위 결제·암호화 변수를 사용하도록 Railway Reference Variable을 설정합니다.
4. Billing Worker에는 public domain이나 health-check path가 필요하지 않습니다.
5. 배포 후 관리자 **시스템 연결 상태**에서 Domestic Billing과 Billing Worker가 정상인지 확인합니다.

## 5. 검증 순서

1. `BILLING_DOMESTIC_MODE=sandbox`, `BILLING_PUBLIC_SANDBOX_ENABLED=true`로 배포합니다.
2. 일반 사용자 화면에서 KPN 일반결제와 KPN 빌링키 발급·1,000원 테스트 청구를 수행합니다.
3. 관리자 결제 화면에서 NHN KCP V1 빌링키 발급·1,000원 테스트 청구를 수행합니다.
4. 테스트 기록이 `test_succeeded`이고 구독·이용권·매출·쿠폰 사용으로 반영되지 않았는지 확인합니다.
5. `npm run billing:verify-postgres`로 schema, FK/index, transaction rollback을 실제 Railway PostgreSQL에서 확인합니다.
6. 운영 Channel 및 계약 확인 뒤 `BILLING_PUBLIC_SANDBOX_ENABLED=false`,
   `BILLING_DOMESTIC_MODE=live`로 바꾸고 재배포합니다.
7. 소액 운영 결제·구독·Webhook·해지 예약·관리자 환불을 승인된 테스트 계정으로 확인합니다.

저장소에 실결제 ID, 카드정보, API Secret을 증빙으로 커밋하지 않습니다. 외부 계약/Channel이 없으면
해당 실결제 검증은 실패로 꾸미지 말고 “외부 설정 대기”로 기록합니다.
