# Stage 1 감사 보고서 — 드림위시(DREAMWISH) AI 의사결정 플랫폼 전환

작성일: 2026-07-21. 이 문서는 코드 수정 전에 실제 코드베이스를 조사한 결과다.

## 1. 기술 스택 감사

| 항목 | 확인 결과 |
| --- | --- |
| 프레임워크 | Next.js 15 (App Router) + React 19 + TypeScript 5.7 |
| 스타일 | Tailwind CSS 3.4 — CSS 변수 기반 토큰(`app.bg/card/border/primary/hover/text/muted/soft`, `rounded-app`, `shadow-app/soft`), framer-motion, lucide-react |
| 라우팅 | 단일 페이지 셸: `app/page.tsx` → `components/layout/AppShell.tsx`가 클라이언트 상태(`ViewId`)로 뷰 전환. 실제 URL 라우트는 `/`, `/admin`, `/business/[[...section]]`, `/chat`, `/login`, `/pricing`, `/settings/billing`, 법률 페이지 등 소수 |
| 데이터베이스 | 이중 모드: (a) 파일 기반 JSON 저장소 `src/lib/local-db/json-store.ts` (`DATA_DIR`, 기본 `.local-db/`), (b) PostgreSQL(`postgres` npm) — `durable_owner_documents` (owner_id, namespace, revision, payload JSONB) 문서 저장소 `src/lib/db/owner-document-store.ts`. `hasPostgresStorage()`로 분기. **Supabase 아님 → RLS 불가, 애플리케이션 계층 권한으로 대체** |
| ORM | 없음(직접 SQL + JSON 문서 저장소). 별도 마이그레이션 프레임워크 없음(`src/lib/migrations/owner-v1.ts` 커스텀) |
| 인증 | 자체 세션 쿠키(`dreamwish-session`, HMAC 토큰) + Kakao/Naver OAuth + TOTP MFA. `requireOwnerContext()` → `{uid, email, role: "admin"\|"user"}`. Firebase 클라이언트 로그인 보조 |
| 조직/워크스페이스/팀 | **조직·워크스페이스·팀·멤버 테이블 없음.** 계정 단위 소유(ownerId=uid) 데이터 격리. 관리자(`ADMIN_EMAILS`, role=admin)가 계정 관리(`src/lib/admin`). → 설문의 organization_id는 소유자 uid로 매핑, 대상자는 이메일 목록으로 지정 |
| AI 호출 | `src/lib/ai/ai.service.ts` — `chatWithAI(messages)` 멀티 프로바이더(gemini/openrouter/groq/huggingface/cloudflare) 페일오버. 딥리서치는 LangGraph(`src/lib/deep-research`) |
| 테스트 | 커스텀 러너 `scripts/run-tests.mjs` (sucrase, 전역 `test()`), `tests/*.test.ts` 약 200개 파일 |
| 백그라운드 작업 | Railway 워커: automation-worker, billing-worker, scheduler-cron (`scripts/run-*.mjs`) |
| 환경변수 | `.env.example` — AI 키, Firebase, 세션/암호화 키, PortOne/Polar 결제, OAuth 연동 키, `DATA_DIR` 등. 서비스 키는 전부 서버 전용(NEXT_PUBLIC 미노출) 규칙 유지 |

## 2. 라우트/기능 감사 표

뷰(View)는 `components/layout/types.ts`의 `SIDEBAR_NAV_ORDER`가 정의하며 URL은 항상 `/`.

| 기존 라우트/뷰 | 기능명 | 유지 | 제거 | 이전 | 공용 의존성 | 관련 데이터 저장소(namespace/파일) | 관련 API | 제거 위험 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view=chat` | AI 채팅 + 딥리서치 | ✅ (Canvas에서 진입) | | 사이드바 직접 노출 → Canvas 내부 진입으로 | ChatView, DeepResearchPanel, ai.service | `chat-sessions`, deep-research 스토어 | `/api/ai/*` | 낮음 — 삭제 없음 |
| `view=memory` | 메모리(승인/후보/네트워크) | ✅ 사이드바 유지 | | | MemoryView, memory-* | `memory-state`/`memory.json` | `/api/memory/*` | 없음 |
| `view=business` | 비즈니스(KPI·ERP·매출·미팅·명함) | | ✅ 메뉴 제거 | 목표/우선순위/위험 → 메모리(전략 목표·의사결정 원칙), 사업자 정보 → 설정>조직 설정 | BusinessHub 외 8개 컴포넌트, ai/business-tools | `business-plan.json`, revenue, meetings, erp 스토어 | `/api/business/*`, `/api/erp/*` | 중간 — AI business-tools가 CRM/ERP 읽음 → **읽기는 유지, 쓰기만 차단** |
| `view=crm` | CRM(고객·거래·활동·업무) | | ✅ 메뉴 제거 | 데이터는 읽기 전용 보존(백업 export 문서화) | CRMView, crm.repository | `crm` 스토어 | `/api/crm/*` | 중간 — storage usage 계산이 CRM 읽음 → 코드 삭제 금지, 쓰기 차단만 |
| `view=automation` | 자동화(워크플로·큐·승인) | | ✅ 메뉴 제거 | | AutomationView 외 다수, automation-worker | automation 스토어 다수 | `/api/automation/*`, `/api/webhooks/automation/*` | 중간 — 워커/테스트 다수 → 코드 보존, 신규 실행·쓰기 차단 |
| `view=calendar` | 캘린더 | | ✅ 메뉴 제거 | | CalendarView, calendar-event.repository | calendar 스토어 | `/api/calendar/events` | 낮음 |
| `view=integrations` | 연동(OAuth 연결 관리) | | ✅ 메뉴 제거 | | integrations/* 20개 컴포넌트 | integration/oauth 스토어 | `/api/integrations/*`, `/api/oauth/*` | 중간 — OAuth 콜백 라우트는 공개 경로로 등록됨 → 쓰기 차단으로 신규 연결 불가 처리 |
| `view=files` | 파일(문서·지식) | ✅ (Canvas 빠른 링크) | | 사이드바 직접 노출 제거 | FilesView, KnowledgeView | files/knowledge 스토어 | `/api/files/*`, `/api/knowledge/*` | 낮음 |
| `view=settings` | 설정(구독·MFA·언어) | ✅ (Topbar 프로필 메뉴로 이동) | | 사이드바 → Topbar | SettingsView | settings 스토어 | `/api/auth/*`, `/api/billing/*` | 낮음 — 결제/MFA 필수 기능이므로 삭제 불가 |
| `/admin` | 사이트 관리자 | ✅ | | | AdminShell | admin 스토어 | `/api/admin/*` | 없음 |
| `/business/[[...section]]` | 비즈니스 딥링크 | | ✅ | `/`로 redirect | — | — | — | 없음 |
| `/pricing`, `/login`, 법률, `/companion/pair`, 결제 성공 | 공개/결제/컴패니언 | ✅ | | | — | — | `/api/billing/*`, `/api/devices/*` | 없음 |

## 3. 최종 사이드바 (사용자 확정: AI CHAT / MEMORY / TEAM)

1. **AI Chat** — 의사결정 파트너. AI가 질문(인터뷰)하고, 딥리서치 설정·실행 → 시뮬레이션 자동 실행 → 조직 의견 반영 → 1~2문장 핵심 결론 + 반대 의견 고려 결과를 우측 "AI 분석 보고서" 패널에 실시간 작성. 최종 승인은 사람이 수행. 기존 자유 대화(ChatView)는 "자유 대화" 토글로 보존.
2. **Memory** — 기존 메모리 뷰 유지 + 히어로/통계 디자인 업그레이드. 결정 기록이 자산으로 축적.
3. **Team** — 구성원 관리(역할: organization_owner/admin/member) + 결정 연결 익명 설문 관리 + 내 설문 응답.

설정은 Topbar 프로필 메뉴, 파일(문서·지식)은 숨김 뷰로 보존(기능 삭제 없음). 디자인 기준: `docs/design/ai-chat-design.svg`, `memory-design.svg`, `team-design.svg` (흰 바탕, 브랜드 바이올렛).

## 4. 제거 절차 준수 사항

- DB DROP 없음. 모든 스토어 파일/네임스페이스 보존.
- 신규 쓰기 차단: 미들웨어 정책에서 자동화·연동·비즈니스·CRM·캘린더 API의 POST/PUT/PATCH/DELETE를 410(FEATURE_RETIRED)으로 차단. GET은 읽기 전용 export 용도로 유지.
- 백업/Export: `GET /api/crm/customers|deals|tasks`, `GET /api/erp/{entity}`, `GET /api/business/overview` 등 GET 응답(JSON)을 저장하면 전체 백업 가능. `DATA_DIR`의 `crm*.json`, `business-*.json`, `erp*.json`, Postgres `durable_owner_documents`의 해당 namespace 스냅샷도 백업 수단.
- 다른 기능 참조 확인: `src/lib/ai/business-tools.ts`(AI 채팅), `src/lib/storage/account-storage.ts`(용량 계산)가 CRM/ERP/자동화 저장소를 **읽기**로 참조 → 관련 lib/repository 코드는 삭제하지 않는다. UI 메뉴와 쓰기 경로만 제거.

## 5. 설문 MVP 데이터 모델 매핑

기존에 유사 테이블 없음(신규). 기존 명명 규칙(문서 저장소 + camelCase TS 타입)에 따라 `survey-state` namespace 하나에 surveys/invites(private)/responses/answers/signals를 저장해 **단일 트랜잭션(파일 락 또는 pg advisory lock)** 으로 응답 제출을 처리한다. 응답·답변 레코드에는 사용자 식별자(uid/email/invite id/token/IP/UA)를 절대 저장하지 않으며, 시간은 일 단위 버킷만 저장한다. 초대 레코드는 어떤 API 응답에도 직렬화되지 않는다.
