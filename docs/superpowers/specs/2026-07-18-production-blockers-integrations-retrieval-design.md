# 설정·연동·자동화·검색·Polar 즉시 장애 설계

## 1. 범위

다음 사용자가 직접 겪는 장애를 먼저 해결한다.

- 인증기 설정의 일반 오류 문구
- Gmail 이외 OAuth 연결 실패와 앱별 키 혼동
- 자동화 검증·실행 실패의 모호한 안내
- AI 채팅과 Deep Research의 메모리·CRM·ERP 회상 누락
- Polar 결제 관리 버튼 실패
- 채팅과 보고서에 Markdown 제어 문자가 그대로 표시되는 문제

## 2. MFA 설정 진단

### 현재 원인

`AUTH_TOTP_ENCRYPTION_KEY` 또는 `AUTH_SECURITY_HASH_KEY`가 없으면
`AUTH_SECURITY_KEY_NOT_CONFIGURED`가 발생하지만 API 오류 매핑에 이 코드가 없어 일반 문구로 바뀐다. 저장소나 schema 오류도 같은 문구에 합쳐질 수 있다.

### 설계

- TOTP 서비스는 `CONFIG_MISSING`, `STORAGE_UNAVAILABLE`, `ENROLLMENT_EXPIRED`, `CODE_INVALID`, `RATE_LIMITED`, `ALREADY_ACTIVE`를 안정 코드로 구분한다.
- `AUTH_SECURITY_KEY_NOT_CONFIGURED`는 관리자에게 누락된 변수 이름을, 일반 사용자에게는 “서버 보안 키가 구성되지 않아 관리자가 조치해야 함”과 재시도 불가 상태를 보여준다.
- 관리자 시스템 상태 API는 세 보안 변수의 존재 여부만 boolean으로 반환한다.
- 키를 자동 생성하거나 기존 암호화 키를 자동 교체하지 않는다. Railway 문서에 안전한 생성 명령과 무중단 회전 절차를 둔다.
- status 조회 실패와 enrollment mutation 실패를 UI에서 별도 표시한다.

## 3. 앱별 OAuth와 Credential 통합

### 현재 원인

기존 `connectorRegistry`에 있는 Gmail, Drive, Calendar, Slack, Notion, GitHub, Discord는 새 사용자별 OAuth 설정 패널에서 필터링된다. 기존 연결 버튼은 플랫폼 공용 OAuth만 호출하므로 Gmail만 구성된 환경에서 다른 앱이 실패한다.

### 설계

`IntegrationCenter`는 모든 앱을 하나의 목록과 하나의 상태 모델로 렌더링한다. 기존 커넥터 카드는 호환 보기로 남기되 연결 생성·재연결은 새 `AppConnectionPanel`만 사용한다.

앱 정의는 `authCapabilities`를 가진다.

```ts
type AuthCapability = {
  id: string;
  kind: "oauth2" | "oauth1" | "api_key" | "token" | "service_account";
  fields: CredentialField[];
  requiredScopes: string[];
  supportsActions: string[];
  setupUrl: string;
  redirectPath?: string;
};
```

주요 앱별 입력은 다음처럼 명시한다.

- Google: OAuth Client ID, Client Secret; Gmail·Drive·Sheets·Calendar·YouTube별 최소 scope
- Microsoft: Application (client) ID, Client Secret, Tenant ID 또는 `common`; Outlook·Teams·OneDrive scope
- Slack: Client ID, Client Secret, Signing Secret(이벤트 사용 시); bot/user scope 분리
- Notion: OAuth Client ID/Secret 또는 Internal Integration Token
- GitHub: OAuth App Client ID/Secret 또는 Fine-grained PAT
- Discord: Application ID/Client Secret은 사용자 OAuth, Bot Token은 메시지 Action용으로 분리
- Dropbox: App key, App secret과 앱 권한 유형
- X: OAuth 1.0a API Key/Secret, Access Token/Secret
- 나머지 앱은 현재 registry의 PAT·API key·도메인·계정 ID 필드를 유지하되 공급자 공식 명칭을 사용한다.

OAuth Client Secret과 직접 Credential은 `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`로 서버에서 암호화한다. Redirect URI는 저장된 문자열이 아니라 승인된 앱 origin과 provider registry에서 계산한다. OAuth 시작 전에 client config, redirect URI, required scope, action capability를 검사한다. 연결 후에는 identity probe와 scope probe를 실행한다.

OAuth만으로 Action 권한이 충족되지 않는 앱은 Bot Token/PAT 모드를 권장하고, 지원하지 않는 인증 모드로 해당 Action을 선택할 수 없게 한다. Adapter가 없는 Action은 catalog에서 `available: false`이며 실행·활성화·queue 삽입을 모두 차단한다.

기존 연결은 읽기 호환을 유지하고 사용자가 재연결할 때 새 모델로 마이그레이션한다.

## 4. 자동화 정확한 오류와 해결 방법

### 현재 원인

현재 진단 카드가 존재하지만 `ACTION_FAILED` 등 미분류 오류는 원래 필드와 공급자 사유를 버리고 일반 catalog 문구로 축약한다. 시나리오 실행·활성화 route도 issues를 반환하면서 상단 메시지는 “설정을 확인하세요”이다.

### 설계

- Zod/워크플로 검증 오류는 노드 ID, Action ID, `fieldPath`, 기대 형식, 안전하게 요약한 받은 값, 수정 예시를 반환한다.
- queue 삽입 전 OAuth 설정, connection 존재, credential 검증 시각, scope, Adapter 버전을 모두 검사한다.
- 공급자 오류는 `AUTH_REJECTED`, `SCOPE_MISSING`, `RESOURCE_NOT_FOUND`, `INVALID_FIELD`, `RATE_LIMITED`, `PROVIDER_5XX`, `NETWORK_TIMEOUT`으로 분류한다.
- provider request ID, HTTP status, retry-after, rate-limit remaining을 보존한다.
- 공급자 응답 본문은 allowlist 필드만 사용하고 토큰·이메일 본문·고객 원문은 제거한다.
- 실행 상세 UI는 실패 노드를 열고 잘못된 필드를 focus하는 버튼을 제공한다.
- queued 30초 이후에는 Worker heartbeat, queue position, lease owner, 다음 시도, 예상 원인을 보여준다.
- 재시도 불가능한 입력 오류에는 자동 재시도를 제공하지 않는다.

## 5. 통합 소유자 검색

### 현재 원인

채팅은 승인 메모리 최대 6개와 협소한 키워드로 감지된 CRM·ERP 요약만 사용한다. Knowledge 노트와 파일 검색은 별도 API에 있고 Deep Research는 승인 메모리를 읽지 않는다. 검색 실패는 빈 context로 조용히 무시된다.

### 설계

`OwnerKnowledgeRetriever`를 Chat과 Deep Research가 공동 사용한다.

```ts
type OwnerKnowledgeSource = "approved_memory" | "knowledge" | "file" | "crm" | "erp";
type RetrievalIntent = "focused" | "inventory" | "entity" | "business";
```

- `focused`: lexical, vector, recency, importance로 관련 항목을 순위화
- `inventory`: “무엇을 기억해?”, “모든 저장 정보” 같은 질문에서 유형별 목록과 페이지 정보를 반환
- `entity`: 고객명, 회사명, 프로젝트명, 청구서 번호를 exact match 우선으로 검색
- `business`: CRM·ERP 집계와 필요한 상세 레코드를 구조화 계산

모든 결과는 owner scope와 현재 상태를 다시 검사한다. 승인된 메모리만 포함하고 pending/rejected/forgotten/deleted는 제외한다. 컨텍스트 한도를 넘으면 유형별 요약과 다음 페이지를 제공하며 “모두 가져왔다”고 거짓 주장하지 않는다.

검색 엔진 장애는 `degradedSources`로 노출한다. 한 소스가 실패해도 다른 소스 결과를 유지하지만, 사용자에게 어떤 데이터가 검색되지 않았는지 알려준다. Chat과 Deep Research source manifest에 `memory://`, `knowledge://`, `file://`, `crm://`, `erp://` 참조를 추가한다.

기존 메모리 위치:

- PostgreSQL 사용 시 `durable_owner_documents`, namespace `memory-state`
- 로컬 fallback은 `${DATA_DIR}/memory.json`
- 승인 Markdown은 `${DATA_DIR}/memory-markdown/<owner-hash>/...md`

Local Agent 도입 후 신규 로컬 모드 원문은 PC Vault로 이동한다. 기존 서버 메모리는 checksum 검증을 거친 사용자 승인 마이그레이션을 제공한다.

## 6. Polar Portal

### 현재 원인

현재 버튼은 provider가 `null`인 사용자에게도 보이고, 항상 `externalCustomerId`로 session을 만든다. Access token 누락, sandbox 불일치, 고객 없음, 잘못된 app origin이 모두 502 일반 문구가 된다.

### 설계

- 실제 `polarCustomerId` 또는 Polar entitlement가 있는 사용자에게만 Portal 버튼을 표시한다.
- 고객이 없으면 Portal 대신 요금제/결제 시작 버튼을 보여준다.
- session 생성은 저장된 `polarCustomerId`를 우선하고 검증된 external ID를 fallback으로 사용한다.
- `POLAR_CONFIG_MISSING`, `POLAR_CUSTOMER_NOT_FOUND`, `POLAR_ENVIRONMENT_MISMATCH`, `POLAR_UNAUTHORIZED`, `POLAR_UNAVAILABLE`, `APP_ORIGIN_INVALID`를 구분한다.
- 앱 origin은 production allowlist와 Railway custom domain을 검증하고 `www` 사용 여부를 명시적으로 지원한다.
- UI는 오류 코드, 해결 방법, 결제 상태 새로고침 버튼을 보여준다.

## 7. 채팅 표시 정규화

문자 삭제 정규식으로 전체 텍스트를 훼손하지 않는다. Chat과 Deep Research 모두 공통 safe Markdown parser를 사용한다.

- heading, paragraph, ordered/unordered list, blockquote, inline code, fenced code, link, citation을 구조화 렌더링
- `*`, `#`, `_`, 백틱은 문법 표식으로 소비되어 화면에 그대로 보이지 않음
- 코드 블록과 URL 내부 문자는 보존
- raw HTML, script, event handler, `javascript:` URL 차단
- 스트리밍 중 미완성 Markdown도 안정적으로 표시하고 완료 시 재파싱
- 내보내기에서는 원본 Markdown을 유지

## 8. 테스트

- MFA 구성 누락·만료·잘못된 코드·저장소 오류별 API/UI 테스트
- 앱별 field label, auth capability, redirect URI, scope preflight, secret masking 테스트
- adapter 없는 Action이 편집·활성화·queue 모두에서 차단되는 테스트
- Zod field path와 공급자 오류가 비밀 없이 진단 카드에 도달하는 테스트
- 승인/삭제 상태와 owner isolation을 포함한 통합 검색 테스트
- “내가 기억하라고 한 모든 것”, 고객명 단독 질문, CRM/ERP 혼합 질문 회귀 테스트
- Polar no-customer/config/sandbox/active-customer 테스트
- Markdown XSS, 미완성 stream, 코드·URL 보존, 제어 표식 미노출 테스트
