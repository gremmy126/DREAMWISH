# Stage 1 구현 계획 — AI 의사결정 플랫폼 전환 + 익명 설문 MVP

## 원칙
- 기존 프레임워크(Next.js 15)/저장소(JSON 문서 스토어 이중 모드)/인증(자체 세션)/디자인 토큰(`app-*`) 유지. 신규 라이브러리 도입 없음.
- 제거 대상(자동화·연동·비즈니스·CRM·캘린더)은 **메뉴 제거 + 쓰기 차단 + 읽기 전용**. 코드·데이터 삭제 없음.

## 단계

### A. 내비게이션 (components/layout, src/lib/navigation, src/lib/i18n)
- `SIDEBAR_NAV_ORDER = ["canvas","scenario","recommendation","simulation","memory"]`
- 숨김 뷰(사이드바 미노출, 기능 유지): `chat`, `files`, `settings`
- 제거 뷰: `business`, `crm`, `automation`, `calendar`, `integrations` — ViewId에서 삭제, `?view=` 접근 시 canvas로 정규화
- Topbar 프로필 메뉴에 "설정" 추가, OAuth 리턴은 settings로, billing 리턴은 settings 유지
- `app/business/[[...section]]` → `redirect("/")`
- i18n(ko/en/ja) nav 라벨 추가

### B. 은퇴 API 가드 (src/lib/auth/api-access-policy.ts + middleware.ts)
- `decideApiRequestAccess(pathname, method, claims)`: `/api/automation|integrations|crm|erp|business|calendar|oauth|workflow|webhooks/automation` 의 쓰기 메서드 → 410 `FEATURE_RETIRED`
- GET 유지(백업/조회), 문서화

### C. 결정(Decision) 모듈 (src/lib/decisions, app/api/decisions)
- Decision: title/objective/constraints/criteria(가중치)/riskTolerance/status/scenarios(낙관·기준·비관)/simulation(매트릭스)/recommendation/finalDecision/executionPlan/retrospective/employeeSignalWeight(0.15, max 0.30)
- Brief 조립: 조직 의견 섹션 포함(설문 대상·응답자·응답률·Employee Signal·찬성·우려·소수 의견·실행 장애물·AI 해석·외부 근거와의 충돌 표시)
- 조직 설정(organization profile) 스토어 + 비즈니스 플랜(goals/risks/priorities) → 메모리(전략 목표·의사결정 원칙) 가져오기 API

### D. 익명 설문 MVP (src/lib/surveys, app/api/surveys)
- 저장: `survey-state` 단일 문서(원자 변경). invites는 비공개 배열 — 어떤 API에도 직렬화 금지
- 토큰: 32바이트 random → base64url, 저장은 SHA-256 해시만. 미사용 토큰 재발급은 회전(rotate)
- 제출: POST body 토큰, 8단계 트랜잭션(해시→만료→사용→활성→응답 저장→답변 저장→redeem→커밋), 실패 시 redeem 없음, 로그 금지
- 집계: `((avg-1)/4)*100`, negative 역산, decision_criterion 가중 평균 = Employee Signal, 합의도(1-정규화 표준편차) 결정론 수식, confidence(응답률·표본), 최소 공개 인원(기본 5) 게이팅, 그룹<5 비공개, 주관식 무작위 순서
- 비식별: 정규식 기반(이메일/한국 전화/사번/URL/SNS/이름 추정) 인터페이스 + 실패 시 needs_review. Python(Presidio)은 현 아키텍처(Node 단일 서비스)에 과중 → 인터페이스만 설계
- AI: 초안 5문항(동의/효과/실행가능성 1–5, 위험 복수선택, 주관식) — 자동 게시 금지, 요약은 구조화 스키마 + 실패해도 통계 유지
- 멤버 API(결제 게이트 없이 로그인만): 내 설문 목록/응답 시작(자격 확인+토큰 발급)/제출

### E. UI (components/Canvas·Scenario·Recommendation·Simulation·Surveys)
- 기존 토큰·공용 컴포넌트(SurfaceCard, SectionHeader, SegmentedControl, EmptyState, ProgressBar) 재사용
- CanvasView: 결정 목록/생성 + 8탭 + 내 설문 세그먼트 + AI 채팅·문서 빠른 실행 + 히어로 SVG(신규 디자인 자산)
- 설문 빌더(문항 5종, 순서 변경, 미리보기, 임시저장, 게시/종료), 응답 러너(한 화면 한 문항, 진행률, 익명 안내, 모바일), 결과(점수 카드, Likert 분포, 위험 순위, AI 요약, 대기 상태)

### F. 테스트/게이트
- 신규: 내비 제거, 410 가드, 설문 생명주기/익명성/집계/비식별/AI 폴백, 결정 Brief
- 수정: workspace-view-navigation
- 게이트: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`

## 이번 단계에서 하지 않는 것
문항 조건 분기·파일 업로드·결제 연동 설문·외부 고객 설문·반복 자동화·템플릿 마켓·익명 토론·부서/직급 분석·Presidio 서비스·DB DROP·조직 다중 멤버십 모델 전면 도입
