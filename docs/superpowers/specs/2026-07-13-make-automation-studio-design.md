# Make형 자동화 스튜디오 설계

## 1. 목표

현재 이름·트리거·액션 문자열만 저장하는 자동화 목록을 사용자가 제공한 자동화 페이지 이미지와 같은 시나리오 편집 환경으로 교체한다. 사용자는 앱과 도구 모듈을 캔버스에 놓아 연결하거나 AI 채팅 명령으로 초안을 만들고, 직접 연결한 OAuth 계정 또는 API 키로 테스트·실행·활성화할 수 있어야 한다.

기존 248px 고정 사이드바의 항목·순서·스타일은 변경하지 않는다. 이미지의 사이드바, 업그레이드 카드, 요금제 UI는 구현하지 않는다.

## 2. 범위 분리

이 명세는 다음을 하나의 자동화 구현 단위로 다룬다.

- 사용자가 제공한 이미지 기준의 자동화 화면
- 시나리오와 노드·연결선 영속화
- 수동 실행, 테스트 실행, 활성화·일시정지, 삭제, 복제
- 일정, Webhook, 연동 앱 이벤트 트리거
- 필터, 라우터, 코드, 지연, 반복 도구
- OAuth 및 사용자 입력 API 키 연결
- 실행 이력, 단계별 로그, 재시도와 오류 상태
- AI 채팅 명령에서 자동화 초안 생성

결제·구독·업그레이드 기능은 범위에서 제외한다.

## 3. 화면 구조

### 3.1 상단

- 제목: `Automation`
- 보조 설명: 업무 자동화와 시간 절약
- 작업: 가이드 보기, 새 시나리오
- 탭: 시나리오, 템플릿, 실행 내역, 연결 관리, 사용 가이드

### 3.2 시나리오 편집기

데스크톱 넓은 화면에서 편집기는 세 열이다.

1. 좌측 모듈 팔레트
   - 검색
   - 앱: Gmail, Google Sheets, Slack, Notion, Discord, Telegram, Calendar, Google Drive, GitHub, Firebase, Local Files
   - 범용 연결: Webhook, HTTP 요청, Custom API
   - 도구: 라우터, 필터, 코드, 지연, 반복
2. 중앙 캔버스
   - 드래그 배치, 노드 연결, 이동, 확대·축소, 화면 맞춤
   - 실행, 테스트, 저장, 더보기
   - 노드 번호와 단계 상태 표시
   - 연결선은 실제 `edge.sourceNodeId`와 `edge.targetNodeId`를 따라 렌더링
3. 우측 시나리오 정보와 API 관리
   - 이름, 설명, 활성화 상태, 마지막·다음 실행, 실행 횟수, 성공률
   - 선택한 모듈의 입력·출력 매핑
   - OAuth 연결과 API 키 목록, 연결 테스트, 수정, 폐기

추천 템플릿은 편집기 아래에 배치한다. 템플릿을 사용하면 독립 복사본이 생성되며 즉시 실행되지 않는다.

### 3.3 반응형과 글자 넘침 방지

- 1440px 이상: `180px / minmax(0, 1fr) / 320px`
- 1024~1439px: 팔레트 160px, 우측 정보는 접을 수 있는 패널
- 1024px 미만: 팔레트와 정보 패널을 각각 드로어로 전환하고 캔버스가 전체 너비 사용
- 모든 Grid 자식에 `min-width: 0`을 적용한다.
- 앱·노드·키 이름은 한 줄 말줄임, 설명은 최대 두 줄로 제한한다.
- 노드 내부 텍스트는 고정 폭 안에서 줄바꿈하고 캔버스 바깥으로 넘치지 않는다.
- 화면 자체는 가로 스크롤하지 않으며 캔버스만 pan·zoom한다.
- 노드 좌표는 캔버스 좌표계에 저장하고 CSS 퍼센트 위치로 저장하지 않는다.

## 4. 사용자 흐름

### 4.1 직접 만들기

1. 새 시나리오를 누른다.
2. 트리거 모듈을 추가한다.
3. 앱 액션과 도구 모듈을 추가하고 연결한다.
4. 각 모듈에서 계정 또는 API 키를 선택하고 필드를 매핑한다.
5. 테스트 실행으로 단계별 입력·출력을 확인한다.
6. 저장 후 활성화한다.

### 4.2 AI 채팅으로 만들기

1. 사용자가 AI Chat에서 자연어로 자동화를 요청한다.
2. 서버의 자동화 플래너가 실행 가능한 `ScenarioDraft`를 만든다.
3. 채팅은 요약과 `자동화에서 열기` 동작을 표시한다.
4. 사용자가 캔버스에서 노드·연결·자격증명·필드 매핑을 검토한다.
5. 저장·테스트·활성화 후에만 실제 자동 실행이 시작된다.

AI는 활성화된 시나리오를 몰래 수정하거나 직접 실행하지 않는다. AI 수정으로 실행 의미가 바뀌면 기존 활성화 승인은 무효화되고 다시 테스트·활성화해야 한다.

## 5. 데이터 모델

자동화 데이터는 기존 `automation.json` 문자열 레코드에서 PostgreSQL 기반 그래프 모델로 이전한다. 현재 연결된 PostgreSQL을 사용하며 모든 테이블은 `owner_id`를 필수로 가진다.

### 5.1 핵심 레코드

- `automation_scenarios`
  - id, owner_id, name, description, status, version, active_version, created_at, updated_at
- `automation_nodes`
  - id, scenario_id, owner_id, kind, connector_id, operation, position_x, position_y, config_json, credential_id, timeout_ms, retry_policy_json
- `automation_edges`
  - id, scenario_id, owner_id, source_node_id, source_handle, target_node_id, target_handle, condition_json
- `automation_runs`
  - id, scenario_id, owner_id, version, trigger_type, status, started_at, finished_at, idempotency_key, error_code
- `automation_step_runs`
  - id, run_id, node_id, owner_id, attempt, status, input_preview_json, output_preview_json, error_code, started_at, finished_at
- `automation_credentials`
  - id, owner_id, connector_id, label, auth_type, encrypted_secret, secret_version, metadata_json, last_verified_at, revoked_at
- `automation_webhooks`
  - id, owner_id, scenario_id, encrypted_signing_secret, enabled, last_received_at

`config_json`과 실행 미리보기에는 비밀 값을 저장하지 않는다. 실행 로그는 기본적으로 본문 전체가 아니라 크기 제한된 마스킹 미리보기만 저장한다.

### 5.2 편집 버전

- 저장은 시나리오 버전을 증가시킨다.
- 활성화는 특정 버전의 불변 스냅샷을 가리킨다.
- 편집 중인 초안은 실행 중인 활성 버전을 변경하지 않는다.
- 활성 버전이 변경될 때 필드 매핑·권한·자격증명을 다시 검증한다.

## 6. 캔버스와 컴포넌트 경계

`AutomationView` 한 파일에 상태와 UI를 계속 추가하지 않는다.

- `AutomationStudio`: 페이지 수준 데이터 로딩과 탭
- `ScenarioToolbar`: 실행·테스트·저장·활성화
- `ModuleCatalog`: 앱과 도구 검색·선택
- `ScenarioCanvas`: 노드·연결선·pan·zoom·선택
- `ModuleNode`: 공통 노드 프레임
- `ModuleInspector`: 모듈 입력·출력·매핑
- `ScenarioInspector`: 상태·통계·일정
- `CredentialManager`: OAuth·API 키 관리
- `RunHistory`: 실행과 단계별 로그
- `TemplateGallery`: 추천 템플릿
- `AiScenarioDraftBanner`: 채팅에서 생성한 초안 검토

캔버스는 React 19와 호환되는 `@xyflow/react`를 사용한다. 캔버스 라이브러리는 표시와 편집만 담당하며 실행 의미는 서버의 정규화된 시나리오 모델이 담당한다.

## 7. 앱 카탈로그와 자격증명

### 7.1 지원 방식

- OAuth: Google Drive, Gmail, Google Sheets, Calendar, Slack, GitHub, Notion, Discord
- API 키 또는 Bot Token: OpenAI, Anthropic, Gemini, Telegram, Firebase 서비스 설정
- 범용: HTTP 요청, Webhook, Custom REST API
- 로컬 권한: Browser, Local Files

앱 로고만 등록하고 실행 어댑터가 없는 가짜 연결 상태는 만들지 않는다. 카탈로그 항목은 `triggerDefinitions`, `actionDefinitions`, `credentialSchema`, `permissionSchema`, `executor`를 가진 경우에만 실행 가능하다. 실행 어댑터가 없는 항목은 `준비 중`으로 명확히 표시한다.

### 7.2 사용자 입력 키

- API 키·토큰·Secret 입력은 비밀번호 필드로 받는다.
- 서버 전송 후 AES-256-GCM으로 계정별 암호화 저장한다.
- 저장한 원문은 다시 클라이언트에 반환하지 않는다.
- 수정은 새 값을 덮어쓰는 방식이며 기존 원문 조회 기능은 제공하지 않는다.
- 운영 환경에서 `INTEGRATION_TOKEN_ENCRYPTION_KEY`가 없으면 저장을 거부한다. 개발 기본 키로 운영 저장을 허용하지 않는다.
- 연결 테스트 결과에는 제공자 응답 본문이나 비밀 값을 노출하지 않는다.

### 7.3 OAuth 리다이렉트

연동 관리 화면에는 제공자별 복사 가능한 정확한 콜백을 표시한다.

- Google: `https://dreamwish.co.kr/api/integrations/google/callback`
- Slack: `https://dreamwish.co.kr/api/integrations/slack/callback`
- GitHub: `https://dreamwish.co.kr/api/integrations/github/callback`
- Notion: `https://dreamwish.co.kr/api/integrations/notion/callback`
- Discord: `https://dreamwish.co.kr/api/integrations/discord/callback`

## 8. 실행 엔진

### 8.1 검증

- 정확히 하나 이상의 트리거가 있어야 한다.
- 일반 연결은 순환할 수 없다.
- 반복은 최대 횟수와 최대 실행 시간을 가진 전용 반복 노드로만 허용한다.
- 모든 연결 핸들·필드 매핑·자격증명·권한을 활성화 전에 검증한다.
- 시나리오 한 실행에 최대 노드 수, 병렬 분기 수, 실행 시간을 제한한다.

### 8.2 실행

- 수동 실행, 테스트 실행, 일정, Webhook, 연동 앱 이벤트를 지원한다.
- DB 기반 실행 큐와 원자적 claim으로 중복 실행을 방지한다.
- 각 단계는 idempotency key를 사용한다.
- 재시도는 노드별 지수 백오프 정책을 따른다.
- 라우터는 분기 조건을 평가하고, 필터는 false 경로를 `skipped`로 기록한다.
- 외부 쓰기는 활성화할 때 승인된 정확한 노드 구성과 권한 범위 안에서만 자동 실행한다.
- 외부 수신자·삭제 대상·권한 범위가 바뀌는 편집은 기존 승인을 무효화한다.

일정 실행은 웹 요청 생명주기와 분리된 worker에서 처리한다. worker는 같은 PostgreSQL 실행 큐를 사용하며 복수 인스턴스에서도 한 실행만 claim한다.

## 9. API

- `GET/POST /api/automation/scenarios`
- `GET/PATCH/DELETE /api/automation/scenarios/[scenarioId]`
- `POST /api/automation/scenarios/[scenarioId]/test`
- `POST /api/automation/scenarios/[scenarioId]/run`
- `POST /api/automation/scenarios/[scenarioId]/activate`
- `POST /api/automation/scenarios/[scenarioId]/pause`
- `GET /api/automation/runs`
- `GET /api/automation/runs/[runId]`
- `GET/POST/PATCH/DELETE /api/automation/credentials`
- `POST /api/automation/credentials/[credentialId]/test`
- `GET /api/automation/catalog`
- `POST /api/automation/ai-draft`
- `POST /api/automation/hooks/[hookId]`

모든 사용자 API는 `requireOwnerContext`를 통과하고 쿼리·변경 대상의 `owner_id`를 다시 확인한다. Webhook은 소유자 세션 대신 회전 가능한 서명 Secret, timestamp, replay 방지를 사용한다.

## 10. 오류 처리

- 저장 실패는 캔버스의 로컬 편집 상태를 잃지 않고 재시도 동작을 제공한다.
- 연결 끊김·권한 만료·필드 불일치는 활성화 전에 차단한다.
- 실행 실패는 실패 노드, 시각, 재시도 횟수, 안전하게 마스킹된 원인을 보여준다.
- 부분 성공은 성공·실패·건너뜀 단계를 구분한다.
- 삭제는 확인 후 soft delete하고 실행 중 시나리오는 새 실행만 막는다.
- 비밀 복호화 실패는 재연결을 요구하며 로그에 원문을 남기지 않는다.

## 11. 테스트

### 11.1 단위 테스트

- 시나리오 스키마와 그래프 검증
- 라우터·필터·반복·재시도
- 버전 스냅샷과 승인 무효화
- 자격증명 암복호화와 마스킹
- idempotency와 owner 격리
- AI 명령에서 안전한 초안 생성

### 11.2 API·통합 테스트

- 인증 없는 CRUD·실행·키 저장 차단
- 다른 소유자의 시나리오·실행·자격증명 접근 차단
- OAuth 연결 상태와 API 키 연결 테스트
- 수동·일정·Webhook 실행과 중복 방지
- 실행 로그에 Secret이 포함되지 않음

### 11.3 UI 테스트

- 이미지 기준 세 열 레이아웃
- 노드 추가·이동·연결·삭제·저장
- 실행·테스트·활성화·일시정지·삭제
- 앱 선택과 자격증명 패널
- 1024px·1440px 경계에서 글자·패널이 바깥으로 넘치지 않음
- 키보드로 주요 작업 가능

## 12. 완료 기준

- 사용자가 이미지와 같은 정보 구조에서 시나리오를 만들고 저장할 수 있다.
- Gmail → 분석 → Google Sheets → Slack → Notion 예시 흐름이 테스트·실행된다.
- AI Chat 명령으로 같은 구조의 초안을 만들 수 있다.
- 사용자 API 키는 암호화 저장되고 다시 노출되지 않는다.
- 실행·삭제·일시정지·이력·오류 재시도가 실제 API와 연결된다.
- 기존 사이드바는 변경되지 않고 모든 지원 너비에서 텍스트가 레이아웃 밖으로 나오지 않는다.
