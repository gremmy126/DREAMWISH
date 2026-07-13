# Obsidian형 지식 네트워크와 타임라인 설계

## 1. 목표

사용자가 제공한 두 번째 이미지의 정보 구조를 기준으로 지식·기억·문서·사람·회사·프로젝트·회의·메시지의 실제 관계를 Obsidian처럼 탐색할 수 있는 통합 지식 화면을 만든다. 하단 지식 타임라인에서 기간이나 사건을 선택하면 중앙 네트워크가 해당 시점의 관계로 필터링되고 재배치되어야 한다.

기존 고정 사이드바의 항목·순서·스타일은 변경하지 않는다. 현재 사이드바의 지식·기억 항목을 통해 통합 화면을 열고 이미지에 포함된 별도 중첩 사이드바와 요금제 UI는 추가하지 않는다.

## 2. 지식 누적 정책

선택한 정책은 다음과 같다.

- 로그인 사용자의 채팅, 문서, 파일, CRM, 고객, 회사, 회의, 일정, Gmail, Slack, 자동화 결과를 계정별 비공개 지식 그래프에 자동 누적한다.
- 자동 누적 원본과 추출 관계는 검색·네트워크·관련 문서 근거로 사용할 수 있다.
- AI의 장기 기억 프롬프트에는 사용자가 승인한 기억만 포함한다.
- 자동 누적되었다는 이유만으로 민감한 원문이 장기 기억으로 승격되지 않는다.
- 원본 삭제나 연결 해제 시 파생 노드·관계의 출처를 다시 계산한다.

## 3. 화면 구조

### 3.1 상단

- 제목: 지식 네트워크
- 설명: 모든 지식과 아이디어의 연결 탐색
- 검색: 노트, 태그, 링크
- 작업: 필터, 새 노트, 더보기
- 탭: 네트워크, 그래프, 메뉴, 리스트

### 3.2 네트워크 영역

넓은 화면에서 네트워크 영역은 세 열이다.

1. 좌측 필터 190px
   - 태그와 개수
   - 노트 상태
   - 연결 강도
   - 날짜 범위와 초기화
2. 중앙 그래프 `minmax(0, 1fr)`
   - 실제 노드와 실제 edge endpoint
   - 확대·축소, 이동, 화면 맞춤, 미니맵
   - 노드 선택, 드래그, 이웃 강조
   - 유형과 상태를 색상·모양·텍스트로 함께 표현
3. 우측 상세 280px
   - 선택 노드의 기본 정보, 관계, 배경, 속성
   - 출처와 승인 상태
   - 노트 열기, 새 노트 연결, 삭제

### 3.3 지식 타임라인

- 중앙 네트워크 아래에 가로 타임라인을 둔다.
- 월·주·연 단위 전환과 기간 필터를 제공한다.
- 각 시점은 생성·수정·연결·승인·자동화 결과 사건을 표시한다.
- 시점을 선택하면 그 시점까지 존재한 노드와 관계로 그래프를 필터링한다.
- 기간을 선택하면 시작·종료 사이의 신규·변경 노드를 강조한다.
- 타임라인 아래의 작은 추세 그래프는 기간별 노드·관계 증가량을 보여준다.

## 4. 반응형과 글자 넘침 방지

- 1440px 이상: `190px / minmax(0, 1fr) / 280px`
- 1024~1439px: 우측 상세를 접이식 패널로 전환
- 1024px 미만: 필터와 상세를 드로어로 전환하고 네트워크·타임라인을 세로 배치
- 모든 Grid와 Flex 자식에 `min-width: 0`을 적용한다.
- 제목·태그는 말줄임, 본문은 줄 수 제한과 `overflow-wrap: anywhere`를 사용한다.
- 그래프 텍스트는 노드 경계 안에 들어오도록 길이 기반으로 축약하고 전체 값은 상세·툴팁에 표시한다.
- SVG 선은 고정 좌표가 아니라 계산된 source·target 위치를 사용한다.
- 전체 페이지는 가로 스크롤하지 않으며 그래프만 pan·zoom한다.

## 5. 통합 그래프 모델

현재 세 가지 그래프 표현을 하나의 owner-scoped 모델로 통합한다.

### 5.1 노드 유형

- memory, document, file, chat, message
- person, customer, company
- project, meeting, event, schedule
- agent, automation, idea, tag

### 5.2 관계 유형

- mentions, references, related_to
- works_on, belongs_to, participant_of
- created, updated, decided_in
- sent_to, replied_to
- triggered, produced, depends_on

### 5.3 PostgreSQL 레코드

- `knowledge_sources`
  - id, owner_id, source_type, source_record_id, title, occurred_at, deleted_at, fingerprint
- `knowledge_nodes`
  - id, owner_id, entity_type, canonical_label, normalized_key, metadata_json, first_seen_at, last_seen_at
- `knowledge_edges`
  - id, owner_id, source_node_id, target_node_id, relation_type, weight, first_seen_at, last_seen_at
- `knowledge_evidence`
  - id, owner_id, edge_id, source_id, excerpt, confidence, created_at
- `knowledge_timeline_events`
  - id, owner_id, source_id, node_id, event_type, occurred_at, metadata_json

기존 승인 기억 레코드는 계속 별도 상태를 유지한다. `knowledge_nodes`는 승인 여부를 표시할 수 있지만 승인 자체의 원본은 기존 memory repository의 `approved` 상태이다.

## 6. 누적 데이터 흐름

1. 채팅·문서·CRM·회의·연동 동작이 저장된다.
2. 저장 성공 후 `KnowledgeIngestionEvent`를 발행한다.
3. 수집기가 fingerprint로 중복 이벤트를 제거한다.
4. 엔티티 추출기가 유형·정규화 키·신뢰도를 만든다.
5. resolver가 기존 노드와 병합하거나 새 노드를 만든다.
6. 관계와 근거를 upsert한다.
7. 타임라인 사건을 기록한다.
8. 화면은 GraphSnapshot API에서 필터된 노드·관계·사건을 읽는다.

수집 실패가 원본 저장을 롤백하지 않는다. 실패 이벤트는 재처리 큐에 남고 화면에는 마지막 인덱싱 시각과 오류 상태를 표시한다.

## 7. 그래프 렌더링

- `d3-force` 기반 owner 그래프 레이아웃을 사용한다.
- 서버는 노드·관계·필터 결과만 반환하고 브라우저가 표시 좌표를 계산한다.
- 선택·드래그 좌표는 화면 세션 동안 유지하고 사용자 고정 좌표만 별도 저장한다.
- 노드 수가 많으면 중요도·필터에 따라 단계적으로 로드한다.
- 기본 화면은 상위 120개 노드와 300개 관계로 제한하고 확대·검색·이웃 확장으로 추가 로드한다.
- 화면 갱신 때 전체가 깜빡이지 않도록 이전 좌표에서 새 force layout으로 이동한다.
- 연결 강도는 선 투명도·굵기로, 유형은 색상과 라벨로 함께 표현한다.

## 8. 컴포넌트 경계

- `KnowledgeWorkspace`: 화면 수준 데이터와 탭
- `KnowledgeToolbar`: 검색·필터·새 노트
- `KnowledgeFilterPanel`: 태그·상태·강도·기간
- `KnowledgeGraphCanvas`: force graph, pan·zoom, 미니맵
- `KnowledgeNodeRenderer`: 노드 유형·선택·승인 상태
- `KnowledgeInspector`: 정보·관계·출처·작업
- `KnowledgeTimeline`: 사건·기간 선택·추세
- `KnowledgeListView`: 접근 가능한 표·리스트 대체 화면
- `KnowledgeIngestionStatus`: 마지막 인덱싱과 실패 재시도

현재 `KnowledgeView`, `MemoryView`, `KnowledgeNetworkPanel`, `ContextMap`의 중복 그래프 UI는 공통 `GraphSnapshot` DTO를 사용하도록 합치고, 화면별로 별도의 노드·edge 모델을 만들지 않는다.

## 9. API

- `GET /api/knowledge/graph`
  - 검색, 유형, 태그, 상태, 연결 강도, 시작·종료 시각, 중심 노드, 깊이
- `GET /api/knowledge/nodes/[nodeId]`
- `GET /api/knowledge/nodes/[nodeId]/neighbors`
- `PATCH /api/knowledge/nodes/[nodeId]`
- `DELETE /api/knowledge/nodes/[nodeId]`
- `GET /api/knowledge/timeline`
- `POST /api/knowledge/reindex`
- 기존 note·file·memory API는 저장 후 수집 이벤트를 기록

모든 경로는 `requireOwnerContext`와 `owner_id` 조건을 사용한다. 응답은 다른 소유자의 노드·관계·근거 개수를 포함하지 않는다.

## 10. 선택 노드와 삭제

- 상세 패널에서 노드의 모든 직접 관계와 근거 출처를 확인한다.
- 자동 추출 노드의 라벨·유형 수정은 정규화 병합 규칙을 다시 실행한다.
- 노드 삭제는 해당 사용자 그래프에서 숨기는 tombstone을 만든다.
- 원본 삭제는 그 원본만 근거로 가진 관계를 제거하고 여러 원본이 뒷받침한 관계는 유지한다.
- 승인 기억 삭제·거절은 장기 기억 사용에서 즉시 제외한다.

## 11. 새로고침 인증 화면

현재 `AuthGate`는 `loading === true`이고 아직 `access`가 없을 때도 `GuestChatHome`을 렌더링하므로, 로그인 사용자가 새로고침하면 “무엇을 도와드릴까요” 공개 화면이 잠깐 나타난다.

변경 후 동작은 다음과 같다.

- 세션 복원 중에는 `GuestChatHome`을 렌더링하지 않는다.
- 세션 복원 중에는 기존 사이드바 폭과 앱 배경을 유지한 최소 로딩 셸만 표시한다.
- 로딩 셸에는 “무엇을 도와드릴까요”, 예시 질문, 광고, 로그인 버튼을 표시하지 않는다.
- 인증 성공 후 마지막 앱 화면 또는 기본 AI Chat을 바로 표시한다.
- 세션 복원이 끝나고 실제 비로그인 상태가 확인된 경우에만 공개 `GuestChatHome`과 로그인 모달을 표시한다.
- 공개 홈의 SEO·AdSense와 비로그인 로그인 유도 구조는 유지한다.

## 12. 오류·빈 상태

- 그래프가 비어 있으면 중앙에 새 노트·파일 추가 동작을 표시한다.
- 인덱싱 중에는 기존 그래프를 유지하고 상태만 갱신한다.
- 일부 출처 로드 실패는 전체 그래프를 지우지 않고 출처별 경고를 표시한다.
- 선택한 노드가 필터로 사라지면 상세 패널을 안전하게 초기화한다.
- 잘못된 edge endpoint는 서버 DTO 검증에서 제외하고 진단 로그를 남긴다.
- 120개 제한을 넘으면 더 보기 또는 중심 노드 확장을 사용한다.

## 13. 테스트

### 13.1 단위 테스트

- 엔티티 정규화·병합·중복 제거
- 실제 source·target endpoint에 대한 관계 생성
- 여러 근거를 가진 관계의 삭제 재계산
- 승인 기억과 자동 누적 원본의 분리
- 타임라인 기간 필터와 증가량 집계
- owner 격리

### 13.2 API·통합 테스트

- 채팅·문서·CRM·회의 저장 후 수집 이벤트 생성
- 중복 이벤트 idempotency
- 검색·태그·유형·기간·관계 깊이 필터
- 다른 사용자 노드·관계·근거 접근 차단
- 원본 삭제·연결 해제 후 관계 재계산
- 재인덱싱 실패와 재시도

### 13.3 UI 테스트

- 사용자 이미지 기준의 좌측 필터·중앙 그래프·우측 상세·하단 타임라인
- 노드 선택·드래그·pan·zoom·이웃 확장
- 시점 선택 시 그래프와 상세 수치 갱신
- 긴 한글·영문·URL이 화면 밖으로 나오지 않음
- 1024px·1440px 경계에서 패널 전환
- 키보드와 리스트 대체 화면 접근
- 로그인 사용자의 새로고침 중 `GuestChatHome` 문구가 나타나지 않음
- 실제 비로그인 사용자는 공개 홈과 로그인 모달을 계속 볼 수 있음

## 14. 완료 기준

- 제공 이미지와 같은 정보 구조로 지식 네트워크와 타임라인을 탐색할 수 있다.
- 모든 연결선이 실제 노드 ID의 source·target 위치를 잇는다.
- 시간·태그·상태·강도 필터가 그래프와 상세·타임라인에 일관되게 적용된다.
- 채팅·문서·CRM·회의·Gmail·Slack·자동화 결과가 계정별 그래프에 누적된다.
- 승인된 기억만 AI 장기 기억 프롬프트에 들어간다.
- 기존 사이드바는 변경되지 않고 모든 지원 너비에서 텍스트가 레이아웃 밖으로 나오지 않는다.
- 로그인 사용자가 새로고침할 때 “무엇을 도와드릴까요” 공개 화면이 나타나지 않는다.
