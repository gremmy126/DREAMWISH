# 로컬 AI 채팅과 Deep Research 서비스 수준 설계

## 1. 목표와 모드

AI 입력창은 네 가지 실행 모드를 제공한다.

1. 빠른 답변: 로컬 모델만 사용
2. 로컬 지식 검색: 승인 메모리·문서·CRM·ERP RAG
3. 웹 검색: self-hosted SearXNG와 출처 기반 답변
4. Deep Research: 장기 실행 연구 그래프

자동 모드는 질문을 분류해 권장 모드를 설명한다. 웹 검색이나 Deep Research로 비용·시간·외부 통신이 늘어나는 경우 시작 전에 사용자 승인을 받는다.

## 2. ModelProvider 계약

기존 Gemini, OpenRouter, Groq, Hugging Face, Cloudflare 구현과 새 Local LLM을 같은 추상화 뒤에 둔다.

```ts
interface ModelProvider {
  id: string;
  health(signal?: AbortSignal): Promise<ProviderHealth>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<ModelEvent>;
  structured<T>(request: StructuredRequest<T>, signal: AbortSignal): Promise<T>;
}
```

Local provider 환경변수:

- `LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1`
- `LOCAL_LLM_MODEL`
- `LOCAL_LLM_API_KEY=local`
- `LOCAL_LLM_TIMEOUT_MS`

Agent는 base URL을 local allowlist로 검증한다. Local Agent token은 브라우저 번들이나 Railway에 전달하지 않는다. `health`는 TCP 연결, `/models`, 작은 completion을 구분해 진단한다.

## 3. 채팅 실행과 로컬 영속성

Local mode chat session, message, branch, partial answer는 Agent SQLCipher DB와 Markdown에 저장한다. 각 assistant run은 다음 상태를 가진다.

`queued → retrieving/searching → generating → completed | cancelled | failed | partial`

지원 기능:

- token streaming과 명시적 중단
- 중단·오류까지 생성된 partial 보존
- 같은 질문 regenerate
- message edit 후 새 branch
- branch 전환과 이전 결과 보존
- provider/model/mode/status 표시
- source citation과 retrieval diagnostics
- Agent 재시작 후 resume 가능한 Deep Research

클라우드 provider를 선택해도 Local Agent가 provider request를 실행하도록 구성할 수 있다. 사용자가 명시적으로 cloud history sync를 켜지 않는 한 Railway에 prompt/answer를 저장하지 않는다.

## 4. 통합 RAG

Local RAG pipeline:

1. query intent와 entity 추출
2. owner-scoped approved memory 및 server CRM·ERP retrieval
3. SQLite FTS5 BM25 검색
4. Transformers.js embedding 생성
5. sqlite-vec cosine 검색
6. path, recency, source authority, pinned memory 가중치 결합
7. duplicate/near-duplicate 제거
8. context budget에 맞춘 chunk selection
9. answer generation
10. citation completeness 검증

`sqlite-vec` 실패 시 FTS5 결과만 사용하고 “벡터 검색을 사용하지 못함”을 source diagnostics에 표시한다. 빈 결과를 메모리가 없다고 단정하지 않는다.

## 5. 웹 검색과 추출

- 검색은 사용자가 설치한 self-hosted SearXNG만 기본으로 사용한다.
- 공개 SearXNG endpoint는 기본값으로 넣지 않는다.
- 검색 결과는 title, URL, snippet, engine, rank, publishedAt의 정규화 구조로 변환한다.
- URL은 DNS rebinding을 포함한 SSRF 방어를 적용하고 private/metadata host를 차단한다.
- 읽기 단계는 HTTP fetch → Trafilatura → Crawl4AI → Playwright 순으로 fallback한다.
- robots 정책, timeout, 최대 크기, content type, redirect 수, per-domain concurrency를 제한한다.
- 로그인, 구매, 댓글, 업로드, form submit 같은 mutation은 수행하지 않는다.
- PDF/Office는 Docling Serve가 heading, table, page 정보를 보존한 Markdown을 반환한다.

모든 서비스는 exact image/package version과 checksum을 lock manifest에 기록한다. llama.cpp는 GPU·OS 차이 때문에 compose 밖의 external endpoint로 유지한다.

## 6. Deep Research 21단계 그래프

LangGraph.js custom graph는 다음 노드를 명시적으로 가진다.

1. 요청 검증
2. 연구 모드·예산 결정
3. 사용자 데이터 사용 동의 확인
4. 질문 정규화
5. 핵심 주장 후보 추출
6. 하위 질문 생성
7. 검색 전략 생성
8. 로컬 지식 검색
9. CRM·ERP 구조화 조회
10. 웹 검색
11. 검색 결과 정규화·중복 제거
12. source trust 사전 평가
13. 문서 fetch
14. 구조화 extraction
15. evidence chunk 생성
16. claim-evidence 연결
17. 모순·정보 공백 탐지
18. 추가 검색 loop 결정
19. 보고서 초안
20. citation·수치·coverage 검증
21. 최종 보고서와 사용자 선택 메모리 저장

각 단계는 입력·출력 Zod schema, timeout, retry policy, checkpoint를 가진다. `maxDurationMs`, query/page/source/AI call 예산을 강제하며 evidence가 충분하면 조기 종료한다.

## 7. Queue와 Worker

- BullMQ와 Valkey를 local compose에서 실행한다.
- research worker는 web/Agent UI process와 분리한다.
- job payload에는 local owner key, query reference, settings, encrypted checkpoint ID만 포함한다.
- 원문은 Valkey에 장기 보관하지 않는다. Agent DB가 source of truth이다.
- heartbeat, lease, idempotency, retry backoff, dead-letter 상태를 제공한다.
- Agent UI와 웹은 Relay event stream으로 progress를 받는다.

Valkey가 없으면 Deep Research 시작을 차단하고 exact setup action을 표시한다. 빠른 답변과 Local RAG는 계속 사용할 수 있다.

## 8. 근거 모델과 보고서

```ts
type Source = {
  id: string; url?: string; title: string; type: "web" | "local" | "crm" | "erp";
  fetchedAt: string; publishedAt?: string; trust: number; extraction: string;
};
type Evidence = { id: string; sourceId: string; excerpt: string; locator?: string; hash: string };
type Claim = {
  id: string; text: string; evidenceIds: string[]; confidence: number;
  status: "supported" | "partial" | "contradicted" | "unsupported";
};
```

trust는 official domain, primary/secondary source, recency, author/publisher, extraction quality로 계산한다. 동일 도메인 반복은 독립 출처 수로 과대 계산하지 않는다. 수치·날짜·고유명사는 최소 한 근거를 요구한다. 모순은 숨기지 않고 별도 표시한다.

최종 보고서는 요약, 주요 발견, 근거별 분석, 모순/한계, 결론, 다음 조사로 구성한다. 모든 citation은 source panel의 안정 ID와 연결된다.

## 9. UI

오른쪽 Research panel 탭:

- 진행: 현재 단계, elapsed/budget, query/page/source 수, cancel/pause/resume
- 계획: 하위 질문과 검색 전략
- 출처: 신뢰도, 접근 시각, extraction 상태, 링크
- 주장: supported/partial/contradicted/unsupported
- 보고서: safe structured Markdown과 citation jump
- 진단: 로컬 서비스, fallback, retry, degraded source

AI 채팅은 원시 Markdown을 `<pre>`로 표시하지 않는다. 공통 parser가 heading/list/code/link/citation을 React element로 렌더링한다. export는 원본 Markdown을 제공한다.

## 10. 메모리 저장

Deep Research 완료 후 자동으로 전체를 장기 메모리에 넣지 않는다. 사용자는 다음 중 하나를 선택한다.

- 전체 보고서 저장
- 요약만 저장
- 선택한 주장만 저장
- 저장하지 않음

저장 시 표준 Markdown 원본, source/claim manifest 연결, approved 상태를 Agent Vault에 기록한다. 이후 검색은 즉시 incremental index에 반영한다.

## 11. 오류와 테스트

주요 오류는 `LOCAL_LLM_OFFLINE`, `MODEL_NOT_FOUND`, `MODEL_CONTEXT_LIMIT`, `EMBEDDING_CACHE_MISSING`, `FTS_QUERY_INVALID`, `SQLITE_VEC_UNAVAILABLE`, `SEARXNG_OFFLINE`, `FETCH_BLOCKED`, `EXTRACTION_FAILED`, `DOCLING_OFFLINE`, `VALKEY_OFFLINE`, `RESEARCH_BUDGET_EXHAUSTED`로 구분하고 해결 명령·설정 위치를 제공한다.

테스트:

- provider health/list/stream/structured/cancel contract
- UTF-8 streaming, abort, timeout, partial preservation
- Korean/English FTS/vector/hybrid ranking golden set
- approved/deleted memory와 CRM/ERP owner isolation
- SSRF, redirect, oversized body, unsafe action 차단
- extraction fallback 순서와 Docling structure
- 21-node graph checkpoint/resume/budget/contradiction
- citation이 실제 evidence에 연결되는지 검증
- Valkey/worker restart와 duplicate job idempotency
- raw Markdown 표식 미노출, XSS 차단, export 원문 보존
