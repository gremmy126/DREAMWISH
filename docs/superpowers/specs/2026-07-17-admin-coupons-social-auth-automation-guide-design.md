# DREAMWISH 관리자·쿠폰·소셜 로그인·자동화 가이드 설계

**작성일:** 2026-07-17  
**상태:** 사용자 화면 설계 승인 완료  
**대상 브랜치:** `main`

## 1. 목표

이 설계는 다음 네 기능을 하나의 운영 구조로 통합한다.

1. 자동화 페이지의 감사 로그와 관리자 DLQ를 관리자 전용 공간으로 이동하고, 사용자·구독·쿠폰·자동화를 전체 제어할 수 있는 `/admin` 페이지를 제공한다.
2. 할인형과 이용권형 쿠폰을 관리자가 발급하고 사용자가 로그인 화면에서 입력할 수 있게 한다.
3. 로그인 화면에서 Google·GitHub 로그인을 제거하고 Railway 환경변수를 사용하는 Kakao·Naver 서버 OAuth 로그인을 제공한다.
4. 선언형 Action Registry에 등록된 모든 앱과 내부 도구의 실행 작업을 검색하고, 사용 시점·입력값·예시·값 획득 위치·권한·위험도·출력 매핑을 확인할 수 있는 상세 자동화 가이드를 제공한다.

기존 DREAMWISH의 밝은 배경, 보라색 강조, 둥근 카드, 폰트, 간격 체계를 유지한다. 기존 정상 동작 중인 이메일·비밀번호 로그인, Polar 월간 구독, 자동화 실행·승인·Queue 기능은 재사용한다.

## 2. 범위 분리와 구현 순서

전체 기능은 독립적으로 검증 가능한 네 전달 단위로 구현한다.

1. **관리자 운영 공간**: 관리자 라우트 보호, 프로필 진입점, 대시보드, 사용자·구독·자동화·DLQ·감사 로그·시스템 상태.
2. **쿠폰과 접근 권한**: 쿠폰 발급·검증·사용·회수, 기간 이용권, Polar 할인 연결, 유효 접근 권한 계산.
3. **Kakao·Naver 인증**: OAuth 시작·콜백·계정 연결·세션 발급, 로그인 UI 교체, Railway 설정 진단.
4. **Registry 기반 상세 가이드**: 가이드 계약 확장, 전체 앱·Action 검색, 입력 필드 출처와 매핑 예시.

각 전달 단위는 별도 테스트 사이클과 커밋을 갖되, 최종적으로 하나의 관리자·인증·결제 권한 모델을 사용한다.

## 3. 선택한 아키텍처

기존 시스템을 확장하는 모듈형 구조를 채택한다.

- 이메일·비밀번호 인증은 Firebase를 계속 사용한다.
- Kakao·Naver는 DREAMWISH 서버가 OAuth Authorization Code 흐름을 직접 처리한다.
- 로그인 공급자와 관계없이 DREAMWISH가 서명한 동일한 서버 세션 쿠키를 발급한다.
- PostgreSQL을 사용자 운영 상태, 외부 로그인 신원, 쿠폰, 사용 기록, 접근 이용권의 운영 기준 저장소로 사용한다.
- 개발 환경은 Repository 인터페이스 아래에서 기존 JSON 저장소와 호환할 수 있지만 운영 관리자 기능은 PostgreSQL을 기본으로 한다.
- Polar는 실제 월간 구독과 할인 결제의 기준이며, DREAMWISH는 결제수단 원문을 저장하지 않는다.
- 자체 기간 이용권은 Polar 구독과 별도로 저장하고 최종 접근 권한 계산에서 합성한다.
- Action Registry의 최종 `ActionDefinition`이 UI와 서버 및 사용 가이드의 단일 실행 계약이다.

## 4. 관리자 권한과 진입

### 4.1 관리자 판별

- 기존 `ADMIN_EMAILS` 및 서명된 세션의 `role: "admin"` 판별을 유지한다.
- 클라이언트의 localStorage, 쿼리 문자열, 임의 헤더만으로 관리자 UI나 API를 허용하지 않는다.
- `/admin` 페이지는 서버에서 세션을 검사하고 일반 사용자는 앱 홈으로 이동시킨다.
- 모든 `/api/admin/*` 라우트는 Middleware 검사와 라우트 내부 `requireOwnerContext` 역할 검사를 모두 수행한다.

### 4.2 프로필 메뉴

- `Topbar`는 `/api/auth/me`에서 현재 세션의 이메일·역할·상태를 조회한다.
- 관리자로 확인된 경우에만 프로필 메뉴에 `관리자 페이지` 항목을 표시한다.
- 항목을 선택하면 `/admin`으로 이동한다.
- 일반 사용자에게 관리자 링크를 숨기는 것은 편의 기능이며, 실제 보안은 서버가 담당한다.

## 5. 관리자 페이지 정보 구조

`/admin`은 일반 작업 공간과 분리된 반응형 운영 화면이다.

### 5.1 메뉴

- 대시보드
- 사용자
- 구독·이용권
- 쿠폰 코드
- 자동화 실행
- DLQ
- 감사 로그
- 연결 상태
- 환경 설정 상태

### 5.2 대시보드

- 전체·활성·정지·삭제 예약 사용자 수
- 활성 구독·과거 미납·해지 예정 수
- 활성 이용권과 쿠폰 사용 수
- 실행 중·승인 대기·실패·DLQ 자동화 수
- PostgreSQL, Polar, OAuth 공급자, Worker의 설정·운영 상태
- Secret 값은 표시하지 않고 `configured`, `missing`, `degraded` 상태만 표시한다.

### 5.3 사용자 전체 제어

- 이메일·이름·로그인 공급자·가입일·최근 로그인·역할·접근 상태 검색과 필터
- 사용자 상세에서 로그인 신원, 구독, 이용권, 쿠폰 사용, 최근 자동화 실행 조회
- 정지·복구·강제 로그아웃
- 관리자 승격·해제
- 이용권 부여·연장·회수
- 구독 해지 요청
- 계정 삭제 예약·삭제 예약 취소·최종 삭제

자기 계정 정지·삭제, 마지막 관리자 해제, 마지막 관리자 삭제는 차단한다. 계정 삭제는 기본 7일 유예 후 처리하며 유예 중 복구할 수 있다. 법적 보존이 필요한 결제·감사 기록은 계정 개인정보와 분리해 보존한다.

### 5.4 위험 작업

- 정지: `SUSPEND`
- 권한·이용권 회수: `REVOKE`
- 구독 해지: `CANCEL`
- 계정 최종 삭제: `DELETE`

위험 작업은 대상, 현재 값, 변경 후 값, 영향 범위, 되돌리기 가능 여부를 Preview로 표시한 뒤 확인 문구를 정확히 입력해야 한다. 모든 결과는 Append Only 감사 이벤트로 남긴다.

## 6. 사용자·신원·세션 데이터

### 6.1 `user_accounts`

- `id`
- `email`
- `normalized_email`
- `name`
- `role`: `admin | user`
- `status`: `active | suspended | deletion_pending | deleted`
- `session_version`
- `created_at`
- `last_login_at`
- `suspended_at`, `suspended_by`, `suspension_reason`
- `deletion_scheduled_at`, `deleted_at`

### 6.2 `auth_identities`

- `id`
- `user_id`
- `provider`: `password | kakao | naver`
- `provider_subject`
- `provider_email`
- `email_verified`
- `profile_name`
- `connected_at`
- `last_login_at`

`provider + provider_subject`는 고유하다. Kakao·Naver Access Token과 Refresh Token은 로그인 완료 뒤 저장하지 않는다.

### 6.3 세션

- 세션에 `uid`, `email`, `role`, `entitled`, `sessionVersion`, 발급·만료 시각을 포함한다.
- 계정 정지·역할 변경·강제 로그아웃 시 `session_version`을 증가시킨다.
- 보호 API는 서명뿐 아니라 계정 상태와 세션 버전을 검사한다.
- 기존 `paid` 클레임은 호환 기간 동안 읽되 신규 접근 판정은 `entitled`를 사용한다.

## 7. Kakao·Naver 로그인

### 7.1 공통 흐름

1. 로그인 화면에서 공급자를 선택한다.
2. 서버가 높은 엔트로피의 `state`와 만료 시각을 생성해 HttpOnly·Secure·SameSite=Lax 일회용 쿠키에 저장한다.
3. 사용자를 공급자 승인 화면으로 이동한다.
4. 콜백에서 오류, `state`, 만료, 일회 사용 여부를 검증한다.
5. Authorization Code를 서버에서 토큰으로 교환한다.
6. 공급자 사용자 정보 API에서 사용자 식별값과 동의받은 이메일을 조회한다.
7. 검증된 이메일이 없으면 로그인을 중단하고 이메일 제공 재동의를 안내한다.
8. 기존 검증 이메일 계정이 있으면 외부 신원을 연결하고, 없으면 새 계정을 생성한다.
9. 일회용 OAuth 상태와 공급자 토큰을 폐기하고 DREAMWISH 세션을 발급한다.
10. 대기 중인 쿠폰이 있으면 같은 사용자 문맥에서 검증·사용한다.

Kakao는 공식 Authorization, Token, User Information API를 사용한다. Naver는 공식 Authorization Code, Token, 사용자 프로필 API를 사용한다.

### 7.2 Railway 환경변수

- `KAKAO_CLIENT_ID`
- `KAKAO_CLIENT_SECRET`
- `KAKAO_REDIRECT_URI=https://<서비스도메인>/api/auth/oauth/kakao/callback`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `NAVER_REDIRECT_URI=https://<서비스도메인>/api/auth/oauth/naver/callback`
- `AUTH_OAUTH_STATE_SECRET`
- 기존 `AUTH_SESSION_SECRET`

키는 서버 환경변수에서만 읽고 `NEXT_PUBLIC_*`로 노출하지 않는다. 관리자 시스템 상태에는 값이 아니라 설정 여부만 표시한다.

### 7.3 로그인 UI

- 이메일·비밀번호 로그인과 회원가입을 유지한다.
- Google·GitHub 버튼, 이벤트 핸들러, 불필요한 공급자 활성화 판정을 제거한다.
- Kakao 공식 색상과 Naver 공식 색상을 사용하되 현재 버튼 크기·모서리·간격을 유지한다.
- 선택 입력인 `쿠폰 코드`와 `적용` 버튼을 추가한다.
- OAuth 시작 전에 쿠폰 원문을 URL에 넣지 않고 서버에 일회용 대기 상태로 저장한다.

## 8. 쿠폰과 접근 권한

### 8.1 쿠폰 종류

- `access_duration`: 지정 일수의 DREAMWISH 전체 이용권
- `percentage_discount`: Polar 구독 정률 할인
- `fixed_discount`: Polar 구독 정액 할인

할인형은 `once`, `months`, `forever` 기간을 지원한다. 관리자는 대상 상품, 통화, 할인값, 적용 개월을 지정한다.

### 8.2 `coupon_codes`

- `id`
- `code_hash`
- `code_hint`
- `name`
- `type`
- `value`
- `currency`
- `access_days`
- `discount_duration`
- `discount_months`
- `polar_discount_id`
- `product_ids`
- `max_redemptions`
- `per_user_limit`
- `starts_at`, `expires_at`
- `active`
- `created_by`, `created_at`, `disabled_at`

코드 원문은 생성 응답에서 한 번만 보여주고 DB에는 정규화한 코드의 keyed hash와 화면용 일부 힌트만 저장한다.

### 8.3 `coupon_redemptions`

- `id`
- `coupon_id`
- `user_id`
- `status`: `reserved | redeemed | voided | expired`
- `polar_checkout_id`
- `polar_order_id`
- `reserved_at`, `redeemed_at`, `voided_at`

### 8.4 `access_grants`

- `id`
- `user_id`
- `source`: `coupon | admin`
- `source_id`
- `starts_at`, `ends_at`
- `status`: `active | revoked | expired`
- `granted_by`, `revoked_by`, `reason`

### 8.5 검증과 사용

- 코드 비교는 상수 시간 hash 비교를 사용한다.
- IP·세션·이메일 기준 속도 제한을 적용한다.
- 총 사용 횟수와 사용자당 제한은 PostgreSQL 트랜잭션과 row lock으로 검사한다.
- 이용권형은 로그인 완료 후 즉시 `access_grants`를 생성한다.
- 할인형은 사용자에게 예약한 뒤 checkout 생성 시 Polar Discount ID를 적용한다.
- Polar checkout 생성 실패 시 예약을 유지하지 않고 안전하게 해제한다.
- 결제 webhook 성공 시 할인형 사용을 `redeemed`로 확정한다.

최종 서비스 접근 권한은 `관리자 OR 활성 Polar 구독 OR 유효한 access_grant`로 계산한다.

## 9. 자동화 화면 변경

- `AutomationTab`에서 `audit`, `dlq`를 제거한다.
- `AutomationView`에서 `AuditLogView`, `AdminDlqView` 렌더링과 import를 제거한다.
- 감사 로그와 DLQ 컴포넌트는 관리자 페이지의 자동화 운영 메뉴로 이동하거나 관리자 전용 컴포넌트로 재구성한다.
- 일반 사용자의 자동화 페이지에는 시나리오, 템플릿, 실행 내역, 승인 센터, 연결 관리, 사용 가이드만 남긴다.

## 10. Registry 기반 자동화 상세 가이드

### 10.1 단일 기준

`ActionDefinition`에 다음 가이드 계약을 추가한다.

- `guide.useWhen`
- `guide.summary`
- `guide.setupSteps`
- `guide.inputNotes`
- `guide.outputMappings`

각 `ActionFieldDefinition`에는 다음 정보를 제공한다.

- `help`: 무엇을 입력하는지
- `example`: Secret이 아닌 안전한 예시
- `valueSource`: 값을 어디에서 구하는지
- `mappingExample`: 이전 단계 출력으로 입력하는 예시

공통 필드 지식은 Registry 내부의 중앙 필드 사전에서 생성하되, 최종 `ActionDefinition`에 완성된 가이드 정보가 포함되어 UI와 서버가 동일 계약을 사용한다. 앱별·Action별 예외는 identity 기반 override로 관리한다.

### 10.2 사용 가이드 UI

- 앱·도구·Action 통합 검색
- 카테고리와 위험도 필터
- 앱별 Action 수와 연결 방식 표시
- Action 카드에서 사용 시점, 설정 절차, 입력 필드 표, 값 출처, 예시, 출력 매핑, Scope, 위험도, 승인 절차 표시
- 모든 `ACTION_DEFINITIONS`를 순회하므로 새 Action이 추가되면 가이드에 자동 포함
- Adapter 미구현 Action은 `준비 중`으로 표시하고 실행 가능한 안내를 제공하지 않음
- Secret, Token, API Key는 예시값을 표시하지 않고 발급 위치만 설명

### 10.3 노드 ID 사용성

- Inspector에 내부 노드 ID를 읽기 전용으로 표시하고 복사 버튼을 제공한다.
- 이전 단계 출력 선택기를 제공해 사용자가 `{{steps.<nodeId>.<field>}}`를 직접 조합하지 않아도 한다.
- 선택기는 연결된 선행 노드의 `outputSchema`만 노출한다.
- Trigger 출력은 `{{trigger.*}}`로 구분해 표시한다.

## 11. 관리자 API

모든 라우트는 관리자 역할 확인, CSRF 검사, 입력 검증, 민감정보 마스킹, 감사 이벤트 기록을 수행한다.

- `GET /api/admin/overview`
- `GET /api/admin/users`
- `GET /api/admin/users/[userId]`
- `POST /api/admin/users/[userId]/suspend`
- `POST /api/admin/users/[userId]/restore`
- `POST /api/admin/users/[userId]/role`
- `POST /api/admin/users/[userId]/force-logout`
- `POST /api/admin/users/[userId]/deletion`
- `POST /api/admin/users/[userId]/access-grants`
- `POST /api/admin/users/[userId]/subscription/cancel`
- `GET|POST /api/admin/coupons`
- `GET|PATCH /api/admin/coupons/[couponId]`
- `GET /api/admin/subscriptions`
- 기존 DLQ 재실행 API를 `/api/admin/automation/dlq`로 정리
- 감사 로그 API는 내부에서도 관리자 역할을 다시 검사
- `GET /api/admin/system/status`

관리자 목록 API는 페이지네이션과 서버 검색을 사용하며 무제한 전체 Payload를 반환하지 않는다.

## 12. 오류 처리

- OAuth 설정 누락: 로그인 버튼을 비활성화하고 관리자 시스템 상태에 누락된 환경변수 이름만 표시
- OAuth 사용자 취소: 로그인 화면으로 돌아와 공급자별 취소 안내
- 이메일 동의 누락: 재동의가 필요한 이유와 공급자 설정 경로 안내
- 중복 외부 신원: 자동 병합하지 않고 충돌 이벤트를 감사 로그에 남겨 관리자 확인
- 쿠폰 오류: 존재 여부 추측을 줄이는 통합 오류 문구를 사용하고 속도 제한 시 재시도 시간을 표시
- Polar 할인 생성 실패: 로컬 쿠폰을 활성화하지 않고 생성 작업을 실패 처리
- 정지 계정: 모든 보호 API에서 `ACCOUNT_SUSPENDED` 반환 후 클라이언트 세션 정리
- 관리자 위험 작업 실패: 부분 성공을 숨기지 않고 단계별 결과와 복구 가능 여부를 표시

## 13. 테스트 전략

### 13.1 단위 테스트

- 쿠폰 정규화·hash·기간·횟수·사용자당 제한
- 유효 접근 권한 계산
- OAuth state 생성·만료·일회 사용·불일치
- 검증 이메일 계정 연결과 공급자 충돌
- 세션 버전 무효화
- 마지막 관리자와 자기 계정 보호
- Action 가이드 완전성: 모든 실행 가능한 Action과 필수 필드에 가이드 정보 존재

### 13.2 API 테스트

- 일반 사용자의 모든 관리자 API 403
- 쿠폰 동시 사용 시 한 건만 성공
- 이용권 적용과 할인 checkout 전달
- 관리자 위험 작업의 확인 문구·CSRF·감사 이벤트
- OAuth callback의 누락·위조·재사용 state 차단
- Secret 및 Token 미노출

### 13.3 UI 테스트

- 관리자에게만 프로필 관리자 링크 노출
- Google·GitHub 버튼 부재, Kakao·Naver 버튼 존재
- 로그인 쿠폰 입력과 공급자 이동 후 유지
- 자동화 탭에서 감사 로그·DLQ 부재
- 관리자 페이지의 대시보드·사용자·쿠폰·DLQ·감사 로그 접근
- 가이드 검색·필터·Action 펼침·노드 ID 복사·출력 매핑 선택
- 모바일 메뉴, 포커스 복귀, ESC, Focus Trap, 44px 터치 영역

### 13.4 전체 검증

- `git diff --check`
- `npm.cmd test`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run build`

검증이 모두 성공하기 전에는 `main`에 push하지 않는다.

## 14. 데이터 마이그레이션과 호환성

- 기존 계정과 Billing Repository 데이터를 읽어 최초 접근 시 PostgreSQL 사용자·구독 레코드로 idempotent하게 이전한다.
- 기존 Firebase UID를 `user_accounts.id`로 유지한다.
- 기존 자동화 owner ID는 변경하지 않는다.
- 기존 세션의 `paid`는 전환 기간 동안 허용하되 신규 로그인부터 `entitled`와 `sessionVersion`을 포함한다.
- 마이그레이션은 원본을 바로 삭제하지 않으며 완료 marker와 감사 이벤트를 남긴다.

## 15. 완료 조건

- 관리자로 로그인하면 프로필에서 `/admin`으로 이동할 수 있고 일반 사용자는 접근할 수 없다.
- 관리자 페이지에서 사용자·구독·이용권·쿠폰·자동화·DLQ·감사 로그·시스템 상태를 관리할 수 있다.
- 사용자 위험 작업에 Preview, 확인 문구, 감사 로그, 자기·마지막 관리자 보호가 적용된다.
- 이용권형과 할인형 쿠폰을 생성하고 로그인에서 입력할 수 있다.
- Kakao·Naver 로그인은 Railway 환경변수와 정확히 일치하는 Redirect URI로 동작한다.
- Google·GitHub 로그인 UI와 실행 경로가 제거된다.
- 자동화 페이지에서 감사 로그와 관리자 DLQ가 제거된다.
- 사용 가이드에서 모든 Registry Action의 사용 시점, 설정값, 안전한 예시와 값 출처를 확인할 수 있다.
- 노드 ID를 개발자 도구 없이 확인·복사하고 이전 단계 출력을 선택해 매핑할 수 있다.
- 전체 테스트, lint, typecheck, build가 성공한다.

## 16. 공식 구현 참고

- Kakao Login REST API: https://developers.kakao.com/docs/en/kakaologin/rest-api
- Kakao Login prerequisites: https://developers.kakao.com/docs/en/kakaologin/prerequisite
- Naver Login developer terms and identity constraints: https://developers.naver.com/products/terms/
- Polar Discounts: https://polar.sh/docs/features/discounts
- Polar Checkout Session: https://polar.sh/docs/api-reference/checkouts/create-session
