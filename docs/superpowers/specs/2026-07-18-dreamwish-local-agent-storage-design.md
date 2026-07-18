# DREAMWISH Local Agent와 사용자 PC 저장소 설계

## 1. 목표

`dreamwish.co.kr` 사용자가 자신의 PC에서 무료 로컬 AI와 로컬 지식 검색을 사용하게 한다. Railway는 사용자 PC의 `127.0.0.1`에 직접 접근할 수 없으므로 설치형 Local Agent가 외부 공개 포트 없이 중계 서비스로 아웃바운드 연결한다.

## 2. 기술 선택

### 선택

- Tauri 2: 설치 파일, tray, autostart, updater, 최소 WebView UI
- Rust core: process supervisor, crypto, local storage, signed relay protocol
- SQLCipher Community Edition `4.16.0`: 암호화 SQLite
- `rusqlite 0.40.1`: SQLCipher bundled build
- `sqlite-vec 0.1.9`: 안정 릴리스 고정, pre-v1 schema adapter 뒤에 격리
- SQLite FTS5: keyword/BM25 검색
- Transformers.js: `multilingual-e5-small` 호환 ONNX 임베딩과 파일 캐시
- Tauri Stronghold: Local Agent private key와 DB key 저장
- 표준 Markdown: 채팅, 승인 메모리, 연구 결과의 source of truth

SQLCipher와 sqlite-vec의 결합은 Windows x64, macOS, Linux CI에서 extension load를 검증한다. sqlite-vec가 실패하면 FTS5-only로 시작하고 상태 화면에 원인과 해결 방법을 표시한다.

### 기각한 대안

- 순수 Node Windows service: 기존 TypeScript 재사용은 쉽지만 installer, tray, autostart, 키 저장, native SQLCipher 배포의 운영 부담이 더 크다.
- 전체 Next 앱 로컬 실행: 개인정보 보호는 강하지만 Railway OAuth·결제·CRM과 UI가 분리되고 업데이트가 어렵다.

## 3. 설치와 저장 위치

Windows 기본 경로:

```text
%LOCALAPPDATA%\DREAMWISH\LocalAgent\
  vault\<owner-hash>\
    chats\
    memory\
    research\
    documents\
  index\dreamwish.db
  models\multilingual-e5-small\
  checkpoints\
  services\
  logs\
```

macOS는 `~/Library/Application Support/DREAMWISH/LocalAgent`, Linux는 XDG data directory를 사용한다. 경로는 Agent 내부에서 OS API로 계산하고 웹이나 Railway에서 임의 절대 경로를 전달하지 않는다.

Markdown 원본은 사용자가 직접 백업·열람할 수 있는 표준 UTF-8 파일이다. 디렉터리는 현재 OS 사용자만 접근하도록 권한을 설정한다. 인덱스, entity mapping, embeddings, 연구 체크포인트, relay outbox는 SQLCipher DB에 저장한다. DB key는 Stronghold 밖으로 내보내지 않는다.

## 4. 로컬 데이터 모델

핵심 테이블:

- `documents`: path, checksum, mime, modifiedAt, source type, indexing status
- `chunks`: documentId, ordinal, heading path, text range, token count
- `chunks_fts`: contentless FTS5 index
- `chunk_vectors`: sqlite-vec vector table
- `chat_sessions`, `chat_messages`, `chat_branches`
- `memories`: approved state, Markdown path, pinned weight, checksum
- `research_jobs`, `research_checkpoints`, `sources`, `claims`, `evidence`
- `relay_outbox`: idempotency key, encrypted envelope, sequence, retry metadata
- `migrations`: schema version and checksum

DB schema는 migration으로만 변경한다. sqlite-vec virtual table DDL은 adapter module 한 곳에만 둔다. extension 버전과 embedding model revision이 바뀌면 전체 DB를 버리지 않고 vector index만 재생성한다.

## 5. 문서 수집과 임베딩

- 사용자가 선택한 폴더만 watch한다.
- symlink escape, hidden system directory, oversized file을 기본 거부한다.
- 텍스트/Markdown은 heading-aware chunking을 사용한다.
- PDF, Office 문서는 Docling Serve 결과를 구조화 Markdown으로 저장한다.
- `query:`와 `passage:` prefix를 모델 규칙에 맞게 사용한다.
- 모델은 최초 사용자 승인 시 내려받고 revision과 SHA-256을 manifest에 고정한다.
- 이후 `allowRemoteModels=false`로 오프라인 로딩한다.
- cache가 손상되면 정확한 파일과 재다운로드 버튼을 표시한다.

## 6. Agent Pairing과 Relay

### Pairing

1. 로그인 사용자가 웹 설정에서 Local Agent 연결을 시작한다.
2. 서버는 만료 10분, 일회용, owner-bound pairing token을 만든다.
3. Agent가 링크를 열고 P-256 signing/ECDH key pair를 생성한다.
4. 공개키, Agent version, capability만 서버에 등록한다.
5. 웹은 연결된 Agent fingerprint를 사용자에게 보여준다.

개인키, SQLCipher key, 로컬 AI token은 PC를 떠나지 않는다.

### Relay

- 별도 Railway `local-agent-relay` 서비스가 WSS upgrade를 처리한다.
- Agent는 짧은 수명의 signed challenge로 인증하고 20초 heartbeat를 보낸다.
- 브라우저는 현재 로그인 session과 Agent public key로 ephemeral ECDH session을 만든다.
- query, context request, delta, status, cancel은 AES-GCM encrypted frames로 전달한다.
- 각 frame은 owner, agent, session, monotonic sequence, idempotency key에 바인딩된다.
- Relay는 active socket routing map만 메모리에 두고 payload를 PostgreSQL·로그·queue에 저장하지 않는다.
- 연결이 끊기면 Agent의 SQLCipher checkpoint가 source of truth이며 재연결 후 resume한다.

브라우저가 닫혀도 Deep Research는 Agent에서 계속된다. 다시 접속한 브라우저는 encrypted snapshot을 요청한다.

## 7. 로컬 서비스 관리

Agent는 다음 외부 서비스를 health check하고 시작 방법을 안내한다.

- llama.cpp `llama-server`: `http://127.0.0.1:8080/v1`
- SearXNG
- Trafilatura extraction worker
- Crawl4AI
- Playwright fallback
- Docling Serve
- Valkey
- research worker

llama.cpp는 compose에 넣지 않는다. 나머지는 별도 pinned Docker Compose를 제공하되 사용자가 Docker 사용을 원하지 않으면 quick/local RAG 모드는 Agent 단독으로 동작한다. 서비스 process 실행은 allowlist command와 fixed arguments만 허용하며 웹에서 임의 shell command를 전달할 수 없다.

## 8. 서버 데이터와 로컬 메모리

CRM·ERP는 현재 서버 owner store가 source of truth이다. Agent는 owner-bound device credential로 필요한 read-only retrieval endpoint를 호출한다. Local mode의 prompt와 응답은 서버에 저장하지 않는다.

기존 PostgreSQL 메모리는 다음 마이그레이션을 제공한다.

1. 웹에서 대상 개수와 범위를 표시한다.
2. 사용자가 승인하면 E2E channel로 approved memory를 Agent에 전달한다.
3. Agent가 Markdown과 index를 쓰고 checksum manifest를 반환한다.
4. 서버와 Agent가 개수·checksum을 비교한다.
5. 사용자가 서버 원문 삭제를 별도로 승인한다.

실패 시 서버 원문을 삭제하지 않는다. forgotten/deleted/pending memory는 이관하지 않는다.

## 9. 오류와 복구

- `AGENT_OFFLINE`: 마지막 heartbeat, 재시작 방법, 재연결 버튼
- `LLM_UNREACHABLE`: URL, connection refused/timeout, `llama-server` 실행 예시
- `MODEL_NOT_FOUND`: 현재 model name과 `/models` 결과
- `VAULT_LOCKED`: Stronghold unlock 또는 계정 재연결
- `SQLCIPHER_OPEN_FAILED`: DB 경로가 아닌 안전한 오류 코드와 backup 복구
- `SQLITE_VEC_LOAD_FAILED`: OS/arch/version, FTS5 fallback 상태
- `MODEL_CACHE_INCOMPLETE`: 누락 파일과 checksum repair
- `RELAY_VERSION_MISMATCH`: 서버 최소 버전과 updater action

로그는 구조화하고 14일 순환 보관한다. prompt, document text, credential, decrypted frame은 기록하지 않는다.

## 10. 테스트와 배포

- Rust unit tests: crypto envelope, replay rejection, path confinement, migration
- storage integration: SQLCipher header가 plaintext SQLite signature가 아닌지, reopen, FTS5, vector search, fallback
- OS matrix: Windows x64 primary, macOS arm64/x64, Linux x64 build/load tests
- relay tests: cross-owner routing 차단, expired token, duplicate sequence, disconnect/resume
- installer smoke: install, autostart, tray, updater rollback
- data tests: Markdown round trip, Korean search, file change/delete, model cache offline restart
- release manifest에 dependency version, artifact hash, SBOM, license notices 포함
