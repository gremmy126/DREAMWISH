# Railway 운영 검증

web, automation-worker, billing-worker는 같은 저장소와 같은 PostgreSQL을 사용하되 서비스별로 필요한 Secret만 전달합니다. 파일 기반 로컬 fallback은 개발용이며 Railway 운영 권한의 기준이 아닙니다.

## 서비스 구성

| 서비스 | Config File Path | 시작 명령 |
| --- | --- | --- |
| web | `/railway.toml` | `npm run start:railway` |
| automation-worker | `/railway.automation-worker.toml` | `npm run automation:worker` |
| billing-worker | `/railway.billing-worker.toml` | `npm run billing:worker` |

세 서비스 모두 Railway PostgreSQL의 private `DATABASE_URL`, 동일한 `APP_URL`, 배포 버전을 사용합니다. Worker에는 web의 `PORT`나 HTTP health check를 붙이지 않고 관리자 시스템 상태의 PostgreSQL heartbeat로 확인합니다.

## web 필수 변수

- 인증: `AUTH_SESSION_SECRET`, `AUTH_SECURITY_HASH_KEY`, `AUTH_TOTP_ENCRYPTION_KEY`, `AUTH_MFA_CHALLENGE_SECRET`
- 기기·매출: `DEVICE_PAIRING_HASH_SECRET`, `REVENUE_DATA_ENCRYPTION_KEY`
- OAuth/푸시 토큰 암호화: `INTEGRATION_TOKEN_ENCRYPTION_KEY`, `OAUTH_TOKEN_ENCRYPTION_KEY`
- 링크: `ANDROID_APP_PACKAGE`, `ANDROID_APP_SHA256_CERT_FINGERPRINT`, `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID`
- FCM: `FIREBASE_SERVICE_ACCOUNT_JSON` 또는 `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`
- PortOne: `docs/railway-portone-billing.md`의 sandbox/live 분리 변수

Secret은 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. JSON 서비스 계정은 Railway 변수 한 개에 원문 JSON으로 넣을 수 있고, 기존 Firebase 3개 변수 방식을 쓰면 `FIREBASE_PRIVATE_KEY`의 줄바꿈을 `\\n`으로 보관해도 서버가 복원합니다.

## 배포 순서

1. 새 PostgreSQL에 web 이미지를 배포하되 트래픽 전환 전 `npm run postgres:verify-production`을 일회성 Railway command로 실행합니다.
2. 출력이 `tables=... append_only=... rollback=ok`인지 확인합니다. 이 명령은 검증 행을 transaction rollback하므로 운영 데이터가 남지 않습니다.
3. automation-worker를 배포하고 관리자 시스템 상태에서 30초 안에 heartbeat와 capability 호환을 확인합니다.
4. billing-worker를 배포하고 PortOne sandbox 공급자 readiness와 heartbeat를 확인합니다.
5. Android/iPhone 실제 기기를 QR로 연결해 서명 동기화, 푸시 토큰 회전, 연결 해제를 확인합니다.
6. PortOne KPN V2 일반·정기결제와 NHN KCP V1 정기결제를 테스트 카드로 완료하고 Webhook Inbox, 구독, 권한, 환불을 관리자 화면에서 확인합니다.

## 장애 판별

- `DATABASE_URL is required`: Railway PostgreSQL Reference Variable이 해당 서비스에 연결되지 않았습니다.
- Worker `설정됐지만 오프라인`: 같은 DB를 보지 않거나 프로세스가 재시작 중입니다. Worker 로그와 heartbeat 테이블을 확인합니다.
- 자동화 `queued` 장기 정체: 실행 상세의 원인 코드에 따라 연결 Credential, OAuth scope, Worker capability/version을 고친 뒤 안전 재시도를 누릅니다.
- FCM `FCM_UNCONFIGURED`: 서비스 계정 변수가 web/automation-worker에 없습니다. 영구 폐기된 기기 토큰은 Worker가 자동으로 revoke합니다.
- 결제 Webhook 정체: Webhook Secret/URL, 공급자 API 조회, `billing_webhook_inbox` 오류 코드를 확인합니다. 전달 payload만으로 결제 성공을 확정하지 않습니다.
