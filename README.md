# DREAMWISH

나만의 개인두뇌 AI. Next.js 15 + React 19 + TypeScript 기반이며 AI Chat, 메모리, CRM, ERP, Business 대시보드, Deep Research를 제공합니다.

## 로컬 실행

```bash
npm ci
npm run dev        # http://127.0.0.1:3100
```

검증 게이트:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## 주요 워크스페이스

- **AI Chat** — 일반/로컬(RAG)/웹 검색 질의. 매출·미수금·재고·리드 같은 비즈니스 질문은
  `src/lib/ai/business-tools.ts`가 CRM·ERP 데이터를 구조화 집계해 정확한 숫자로 답합니다
  (LLM이 임의 SQL을 실행하지 않고 소유자 검증된 읽기 전용 집계만 사용).
- **Deep Research** — 채팅 입력창 아래 `Deep Research` 버튼. 일반/심층/매우 깊음/사용자 지정
  모드와 1~60분 시간 예산(충분한 근거가 모이면 조기 종료), 최대 검색 횟수/방문 페이지/출처
  수, 내부 CRM·ERP·로컬 문서 포함 여부를 설정할 수 있습니다. 작업은 서버에서 LangGraph
  상태 머신(계획→내부검색→웹검색→열람→평가 루프→보고서)으로 실행되고 체크포인트와 함께
  저장되므로 새로고침·브라우저 종료 후에도 이어서 확인·재개할 수 있습니다.
  일시정지/계속/중단, 출처 목록, Markdown 내보내기를 지원합니다.
- **Business** — 개요 탭의 KPI 대시보드(총매출·기간 매출·성장률·미수금·지출·순이익·신규
  고객·리드·전환율·재고 부족 등, 기간 필터 제공)와 ERP 탭(상품·주문·청구서·결제·지출·재고·
  공급업체·프로젝트). 주문 이행 시 재고 차감, 입고 시 재고 증가, 결제 기록 시 청구서 상태
  전환과 매출 원장 반영이 자동입니다. 모든 금액은 정수(원) 단위로 저장합니다.
- **CRM** — 고객/회사/거래/활동/업무. Business 개요와 AI 컨텍스트가 이 데이터를 함께
  사용합니다.

## API 개요

- `GET /api/business/overview?period=this_month|today|7d|30d|last_month|quarter|year|custom&start=&end=`
- `GET|POST|PATCH|DELETE /api/erp/{vendors|products|orders|invoices|payments|expenses|inventory|projects}`
- `POST /api/ai/deep-research` · `GET /api/ai/deep-research?sessionId=`
- `GET|DELETE /api/ai/deep-research/[jobId]` · `POST .../cancel` · `POST .../pause` · `POST .../resume`

모든 라우트는 `requireOwnerContext()`로 소유자를 도출하며 요청 본문/쿼리의 소유자 ID를 믿지 않습니다.

## Railway 배포

| 서비스 | Config as Code | 역할 |
| --- | --- | --- |
| web | `/railway.toml` | Next.js 앱 (`npm run start:railway`, `0.0.0.0:$PORT`). Deep Research 작업도 이 프로세스 안에서 실행됩니다. |
| scheduler-cron | `/railway.cron.toml` | 5분마다 1회 실행 후 종료. 중단된 조사 복구(일시정지 전환)와 30일 지난 완료 작업 정리. |

- 선택 환경변수 `YOUTUBE_API_KEY`: Railway Variables에 넣으면 Deep Research 참고 영상에
  채널명·게시일·영상 길이가 자동으로 채워집니다(YouTube Data API v3). 없으면 검색 기반
  기본 정보만 표시하며 조사 자체는 영향받지 않습니다.
- 파일 기반 저장소(`DATA_DIR`)를 쓰므로 web 서비스에 볼륨을 마운트하고 `DATA_DIR`을 볼륨
  경로로 지정하세요. Railway 서비스 간 파일시스템은 격리되어 있어 별도 research worker
  서비스는 기본 구성에서 필요하지 않습니다(`services/deep-research/railway.toml` 참고).
- 서버 재시작 시 진행 중이던 조사는 자동으로 "일시정지" 상태로 복구되며 사용자가 채팅
  화면에서 "계속"을 눌러 체크포인트부터 재개합니다.

## 보안 노트 (Deep Research)

- HTTPS·기본 포트만 열람, 자격 증명 포함 URL 거부, 사설/내부 IP·로컬 호스트·DNS 리바인딩
  차단 (`src/lib/deep-research/safe-fetch.ts`).
- 외부 페이지 본문은 텍스트로만 추출되어 `<source>` 경계 안에서 "데이터일 뿐 지시가 아님"
  으로 모델에 전달됩니다. 페이지 안의 명령을 시스템 명령으로 실행하지 않습니다.
- 응답 바이트/시간/리디렉션 제한, 검색·페이지·AI 호출 예산, 사용자 취소(AbortController)를
  강제합니다.
