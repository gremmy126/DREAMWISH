# DREAMWISH 서비스 전면 업그레이드 프로그램 설계

## 1. 목적

이 문서는 다음 다섯 작업의 공통 경계와 구현 순서를 정의한다.

1. 설정·연동·자동화·메모리·결제의 즉시 서비스 장애 수정
2. 사용자 PC에서 실행되는 DREAMWISH Local Agent와 로컬 저장소 구축
3. 무료 로컬 AI 채팅과 서비스 수준 Deep Research 구축
4. `D:\DREAMWISH-Companion` 모바일 앱 완성
5. Railway Worker, PostgreSQL, Polar·PortOne 운영 검증 완성

첨부 프롬프트 두 개는 SHA-256
`879E5BC36614C7068F3000704EC8466FBB9313AAA17C9E351DD9C40630FB358B`로 동일하다. 따라서 하나의 요구사항으로 취급한다.

## 2. 고정 결정

- Ollama와 Open Deep Research를 설치하거나 복제하지 않는다.
- 기본 AI는 사용자의 PC에서 외부 `llama.cpp` `llama-server`로 실행한다.
- Railway는 계정, 요금제, OAuth 메타데이터, 연결 상태, 최소 감사 로그만 영속화한다.
- 로컬 모드의 채팅·연구·문서·승인 메모리 원문은 사용자 PC에 저장한다.
- Local Agent는 외부에 포트를 공개하지 않고 Railway Relay에 아웃바운드 WSS로 연결한다.
- 브라우저와 Local Agent 사이의 원문 프레임은 종단 간 암호화한다. Relay는 내용을 해독하거나 저장하지 않는다.
- 기존 클라우드 AI, OAuth, CRM, ERP, 자동화, 결제 기능은 유지하고 점진적으로 어댑터 뒤에 둔다.
- 사용자 소유 데이터는 모든 계층에서 `ownerId`로 격리한다.
- 메모리 검색 대상은 승인된 메모리, Knowledge 노트, 사용자가 연결한 파일, 해당 사용자의 CRM·ERP이다. pending, rejected, forgotten, deleted 데이터는 제외한다.
- Markdown은 안전한 구조로 렌더링하여 `*`, `#`, 백틱 같은 제어 문자가 최종 채팅 화면에 원문으로 노출되지 않게 한다. URL, 인용 번호, 코드 내용에 필요한 문자는 삭제하지 않는다.
- 공급자 키, OAuth Secret, 로컬 DB 키, 기기 개인키, TOTP Secret은 로그·클라이언트 번들·API DTO에 포함하지 않는다.

## 3. 작업 분해와 의존성

### A. 즉시 서비스 장애

독립적으로 먼저 배포할 수 있다. MFA, OAuth, 자동화 진단, 통합 검색, Polar, Markdown 표시를 수정한다.

상세 명세:
`2026-07-18-production-blockers-integrations-retrieval-design.md`

### B. Local Agent와 로컬 저장소

로컬 AI와 로컬 Deep Research의 선행 조건이다. Tauri 앱, 암호화 Relay, Markdown Vault, SQLite 인덱스를 제공한다.

상세 명세:
`2026-07-18-dreamwish-local-agent-storage-design.md`

### C. AI 채팅과 Deep Research

B의 저장·실행 계약 위에서 네 가지 모드, 로컬 RAG, 웹 조사, 21단계 연구 그래프와 근거 UI를 제공한다.

상세 명세:
`2026-07-18-local-ai-deep-research-design.md`

### D. 컴패니언 앱

웹의 공개키 기반 휴대폰 연결 프로토콜을 사용한다. D 드라이브의 별도 저장소를 기준 앱으로 완성한다.

상세 명세:
`2026-07-18-companion-completion-design.md`

### E. 운영·결제 검증

Railway 서비스 분리, heartbeat, 실제 PostgreSQL 계약 검증, Polar·PortOne 상태 전이를 완성한다.

상세 명세:
`2026-07-18-production-operations-billing-design.md`

구현 순서는 A → B → C이며 D와 E는 B 이후 서로 독립적으로 진행할 수 있다. 각 단계는 자체 테스트와 커밋을 가진다.

## 4. 공통 오류 계약

모든 사용자 조치 가능 오류는 다음 안전한 구조를 사용한다.

```ts
type ActionableError = {
  code: string;
  title: string;
  reason: string;
  solution: string[];
  action: { kind: string; href?: string; label: string } | null;
  fieldPath?: string;
  provider?: string;
  providerStatus?: number;
  retryable: boolean;
  retryAt?: string;
  requestId: string;
};
```

공급자의 원문 응답은 서버 로그에도 토큰·본문을 제거한 뒤 기록한다. 사용자에게는 실패한 단계, 안전한 실제 원인, 정확한 수정 위치, 재시도 가능 여부를 보여준다. 알 수 없는 오류도 요청 ID와 관리자 진단 위치를 제공하며 단순히 “확인하세요”로 끝내지 않는다.

## 5. 공통 완료 기준

- 루트 lint, TypeScript typecheck, 전체 테스트, Next production build가 성공한다.
- Local Agent는 Windows x64에서 설치·실행·재연결·로컬 저장을 실제 검증하고 macOS/Linux는 CI 빌드와 저장 엔진 계약 테스트를 통과한다.
- PostgreSQL 통합 테스트는 임시 실제 PostgreSQL 인스턴스에서 schema, owner isolation, queue leasing, webhook idempotency를 검증한다.
- 공급자 자격증명이 없는 테스트는 mock으로 계약을 검증하고, 실계정 검증 여부를 최종 보고에서 별도로 표시한다.
- Android는 Gradle compile/test와 가능한 APK 빌드를 통과한다. iOS archive/TestFlight는 macOS, Apple Team, provisioning이 없으면 완료로 주장하지 않는다.
- `D:\DREAMWISH-Companion`의 누락 항목과 외부 준비 항목을 최종 보고에 구분한다.
- Railway와 로컬 설치 문서에 변수명, 발급 위치, 진단 방법을 포함하되 실제 비밀 값은 포함하지 않는다.

## 6. 비범위

- Ollama 설치 또는 Ollama 전용 API
- Open Deep Research 코드 복제
- 공개 SearXNG 인스턴스를 기본값으로 사용
- iPhone에서 다른 앱 알림을 자동으로 읽는 기능
- 사용자 승인 없는 장기 메모리 저장
- 자격증명·개인정보·원문 프롬프트를 분석 로그나 PostgreSQL에 저장
