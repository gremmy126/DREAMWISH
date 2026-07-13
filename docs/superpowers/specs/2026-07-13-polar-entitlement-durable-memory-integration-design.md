# Polar 결제 권한과 영구 메모리 통합 설계

## 1. 목표

기존 자동화 스튜디오와 지식 네트워크 명세에 Polar 구독 권한, 관리자 무료 사용, 사이드바 업그레이드 동작, PostgreSQL 기반 영구 메모리를 추가한다. AI Chat에서 자연어로 자동화 초안을 만들고 메모리 화면에서 지식 네트워크와 타임라인을 탐색하도록 화면 간 흐름도 연결한다.

과거 사라진 JSON 메모리는 복구하거나 임의로 재생성하지 않는다. 새 저장 구조가 적용된 이후 생성되는 계정별 메모리·지식·결제 상태만 PostgreSQL에 영구 저장한다.

## 2. 현재 원인과 교체 범위

- 메모리와 지식은 현재 `DATA_DIR` 또는 `.local-db`의 `memory.json`, `knowledge.json`에 저장된다.
- Railway 영구 볼륨이 없으면 배포 파일시스템의 JSON은 재배포 때 사라질 수 있다.
- `readJsonStore`는 파일 없음뿐 아니라 JSON 손상·권한·입출력 오류까지 모두 빈 fallback으로 바꾼다. 그 결과 저장소 오류가 빈 메모리 화면으로 보인다.
- 현재 Polar 런타임은 삭제되었지만 `AccountRecord.paid`, 세션 `paid`, `AccessState`는 남아 있다.
- 현재 `buildAccessState`와 `decideApiAccess`는 결제 여부와 상관없이 로그인 사용자에게 앱과 보호 API를 허용한다.

다음 저장소는 PostgreSQL을 정본으로 전환한다.

- 계정과 구독 권한
- Polar 웹훅 수신 이력과 idempotency
- 승인 메모리, 후보, 변경 이력, 임베딩 메타데이터
- 지식 원본, 노드, 관계, 근거, 타임라인 사건
- 자동화 시나리오, 노드, 연결, 실행, 자격증명 메타데이터

기존 JSON 기반 CRM·파일·메시지 저장소는 이번 전환 중에도 읽을 수 있지만, 메모리와 지식으로 수집된 결과는 PostgreSQL에 기록한다.

## 3. Polar 구독 권한

### 3.1 신뢰 경계

- Checkout 생성은 로그인 세션의 `owner.uid`, `owner.email`, `owner.name`만 사용한다.
- 클라이언트가 보낸 이메일이나 외부 고객 ID는 신뢰하지 않는다.
- Polar `external_customer_id`에는 Firebase uid를 사용한다.
- Checkout 성공 리다이렉트나 localStorage만으로 사용 권한을 부여하지 않는다.
- 서명이 검증된 Polar 웹훅과 필요 시 Polar Customer State 조회만 구독 상태의 근거로 사용한다.
- 웹훅 Secret이 없거나 서명 검증이 실패하면 운영 환경에서 fail closed 한다.

공식 Polar Next.js SDK의 Checkout과 Webhooks 어댑터를 사용한다. 웹훅은 `subscription.active`, `subscription.uncanceled`, `subscription.canceled`, `subscription.past_due`, `subscription.updated`, `customer.state_changed`, 환불·삭제 상태를 idempotent하게 반영한다.

### 3.2 권한 상태

`billing_entitlements`는 다음 상태를 가진다.

- `none`: 결제 이력 없음
- `checkout_pending`: Checkout은 생성되었지만 활성 구독이 확인되지 않음
- `active`: 활성 구독이며 앱 사용 가능
- `past_due`: 결제 실패로 사용 차단
- `canceled`: 구독 종료 또는 종료 시점 도달 후 사용 차단
- `revoked`: 환불·관리자 회수·고객 삭제로 사용 차단

`active`만 일반 사용자의 `canUseApp=true`가 된다. 관리자 우회는 구독 레코드와 별개이며, 서버가 검증한 Firebase 이메일이 관리자 allowlist에 있을 때만 적용한다.

기본 관리자 allowlist는 환경 변수 `ADMIN_EMAILS=kara111131@naver.com`이다. 현재 이메일 상수는 기본값으로만 남길 수 있지만, 클라이언트에서 이메일 문자열을 비교해 우회하지 않는다. 이메일은 소문자와 trim으로 정규화한다.

### 3.3 화면 흐름

- 비로그인: 공개 AI Chat 홈을 읽을 수 있고 AI 기능 사용 시 로그인 모달을 연다.
- 로그인·미결제: 기존 앱 셸과 사이드바를 보여주되 작업 영역은 결제 안내로 잠근다. 인증·로그아웃·Checkout·웹훅·구독 상태 확인 외 API는 402로 차단한다.
- 로그인·결제 완료: 새로고침 없이 구독 상태를 다시 읽고 앱을 활성화한다.
- 관리자: 결제 없이 전체 앱과 API를 사용한다.
- 사이드바: 기존 항목·순서·폭은 유지하고 로컬 저장소 상태 카드 바로 위에 `업그레이드` 버튼을 둔다. 미결제 상태에서는 Checkout을 열고, 결제 사용자는 `구독 관리`로 Polar Customer Portal을 열며, 관리자는 버튼을 숨긴다.

결제 안내 화면은 AI Chat 홈으로 페이지 이동시키지 않는다. Checkout만 Polar로 이동하고 성공 후 `/billing/success?checkout_id={CHECKOUT_ID}`로 돌아온다. 성공 화면은 서버 권한 확인이 완료될 때까지 `결제 확인 중`으로 표시한다.

### 3.4 API 차단

공개 또는 제한적으로 허용되는 경로는 다음뿐이다.

- `/api/auth/login`, `/api/auth/session`, `/api/auth/logout`
- `/api/billing/checkout`, `/api/billing/status`, `/api/billing/portal`
- `/api/webhooks/polar`
- 연동 OAuth callback은 인증 state와 owner binding을 자체 검증하는 기존 흐름을 유지한다.

그 밖의 AI, 업로드, 메모리, 지식, CRM, 자동화, 일정, 파일, 연동 API는 `paid || admin`이 아니면 402를 반환한다. 미들웨어와 각 민감 route의 `requireEntitledOwnerContext`를 함께 사용해 우회 경로를 막는다.

## 4. 영구 메모리와 지식

### 4.1 보존 규칙

- 새 메모리 후보, 승인 메모리, 수정 이력, 지식 원본, 노드, 관계, 근거, 타임라인 사건은 PostgreSQL 트랜잭션으로 저장한다.
- 앱의 일반 수정은 append-only 이력을 남기며 기존 행을 물리 삭제하지 않는다.
- 사용자가 명시적으로 삭제하면 `deleted_at` 또는 `forgotten_at` tombstone을 기록하고 AI recall과 기본 화면에서 제외한다.
- 승인 전 지식 누적 원본과 승인된 장기 기억을 분리한다. AI 프롬프트에는 승인된 기억만 들어간다.
- 모든 테이블은 `owner_id`를 필수로 가지며 복합 unique key와 조회 조건으로 계정 격리를 보장한다.
- 같은 채팅 메시지나 외부 이벤트가 다시 처리되어도 fingerprint/idempotency key로 중복 생성하지 않는다.

### 4.2 실패 처리

- 파일·DB 읽기 오류를 빈 데이터로 바꾸지 않는다.
- PostgreSQL 연결 또는 쿼리가 실패하면 API는 안정적인 오류 코드와 5xx를 반환한다.
- UI는 마지막 성공 snapshot을 유지하면서 저장 실패와 재시도 동작을 표시한다.
- 원본 저장 후 지식 수집이 실패하면 `knowledge_ingestion_jobs`에 실패 상태와 재시도 시각을 남긴다.
- 메모리 승인과 승인 기억 저장은 한 트랜잭션으로 처리한다.

### 4.3 백업과 운영

코드는 데이터의 물리 삭제를 방지하고 PostgreSQL을 정본으로 사용한다. 저장장치 전체 장애까지 대비하려면 운영 Railway PostgreSQL의 자동 백업 또는 point-in-time recovery를 활성화하고 복구 절차를 문서화한다. 애플리케이션은 백업 상태를 추정해 성공으로 표시하지 않는다.

## 5. AI Chat·자동화·메모리 화면 연결

### 5.1 AI Chat

- 사용자가 자동화를 요청하면 채팅 응답은 `ScenarioDraft`를 생성하고 `자동화에서 열기` 동작을 제공한다.
- 승인 버튼은 초안을 저장만 하며 외부 작업을 즉시 실행하지 않는다.
- 사용자가 자동화 스튜디오에서 연결 계정·API 키·필드 매핑을 검토하고 테스트한 후 활성화한다.
- 채팅에서 메모리나 지식 저장을 요청하면 후보 또는 지식 노트를 생성하고 저장 결과를 해당 owner의 네트워크와 타임라인에 즉시 반영한다.
- AI 답변 본문에는 `관련도` 섹션을 넣지 않고 관련 문서는 기존 우측 패널에서만 표시한다.

### 5.2 자동화 화면

기존 자동화 설계 이미지의 상단 탭, 왼쪽 모듈 카탈로그, 중앙 Make형 캔버스, 오른쪽 시나리오·API 키 패널, 하단 템플릿을 구현한다. 저장·테스트·실행·활성화·일시정지·복제·삭제는 실제 API와 연결한다.

### 5.3 메모리 화면

메모리 페이지의 기본 화면을 지식 네트워크와 지식 타임라인으로 통합한다.

- 상단: 검색, 필터, 새 노트, 네트워크·그래프·리스트 보기
- 좌측: 태그·상태·강도·기간 필터
- 중앙: Obsidian형 실제 관계 그래프
- 우측: 선택 노드의 속성·출처·관계·승인 상태
- 하단: 생성·수정·승인·자동화 사건 타임라인과 증가 추세

기존 승인 대기·승인 기억 목록은 `메모리` 탭 또는 우측 상세의 승인 상태에서 계속 접근할 수 있다. 네트워크 노드 선택은 같은 페이지에서 상세를 열며 별도 페이지로 이동하지 않는다.

## 6. 새로고침과 공개 홈

- Firebase 세션 복원 중에는 공개 `GuestChatHome`을 렌더링하지 않는다.
- 복원 중에는 사이드바 폭과 앱 배경을 유지한 로딩 셸만 표시한다.
- 실제 비로그인으로 확인된 후에만 공개 AI Chat 홈과 광고를 표시한다.
- 로그인·결제 사용자의 작업 화면에는 AdSense 광고를 표시하지 않는다.
- 공개 AI Chat 홈은 robots, sitemap, metadata, Open Graph, Schema.org를 계속 제공한다.

## 7. 테스트와 완료 기준

### 7.1 결제와 보안

- 다른 사용자의 이메일·uid를 Checkout payload로 위조할 수 없음
- 웹훅 Secret 누락·잘못된 서명·중복 event 차단
- 활성 구독만 일반 사용자에게 앱과 API 허용
- 취소·연체·환불 후 API가 402 반환
- 관리자 Firebase 이메일은 결제 없이 허용하고 위조 header/body는 거부
- localStorage 변경만으로 권한을 얻을 수 없음

### 7.2 영구 보존

- 새 메모리·지식이 프로세스 재시작 후 PostgreSQL에서 다시 조회됨
- 읽기 오류가 빈 배열로 바뀌지 않음
- 명시적 삭제가 tombstone과 감사 이력을 남김
- 승인 기억만 AI recall에 포함됨
- 다른 owner의 메모리·노드·관계·타임라인에 접근할 수 없음
- 중복 수집 이벤트가 중복 노드·관계를 만들지 않음

### 7.3 화면 통합

- 업그레이드 버튼이 로컬 저장소 카드 바로 위에 표시됨
- 미결제 작업 영역은 잠기고 Checkout을 열 수 있음
- AI Chat 자동화 명령이 자동화 스튜디오 초안으로 연결됨
- 메모리 페이지에서 네트워크·타임라인·승인 기억을 함께 탐색함
- 긴 한글·영문·URL이 패널과 노드 밖으로 넘치지 않음
- 로그인 사용자의 새로고침 중 공개 질문 화면과 광고가 나타나지 않음

## 8. 운영 설정

- `DATABASE_URL`
- `ADMIN_EMAILS=kara111131@naver.com`
- `POLAR_ACCESS_TOKEN`
- `POLAR_PRODUCT_ID`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_SERVER=production` 또는 로컬 테스트의 `sandbox`
- `NEXT_PUBLIC_APP_URL=https://dreamwish.co.kr`
- Polar webhook URL: `https://dreamwish.co.kr/api/webhooks/polar`
- Polar success URL: `https://dreamwish.co.kr/billing/success?checkout_id={CHECKOUT_ID}`

Polar 대시보드에는 구독·고객 상태·환불 이벤트를 활성화하고 웹훅 Secret을 Railway 환경 변수와 일치시킨다.
