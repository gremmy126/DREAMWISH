---
type: development
status: active
created: 2026-07-06
updated: 2026-07-06
tags:
  - api
  - interface
  - contracts
related:
  - "[[architecture]]"
  - "[[tech-stack]]"
  - "[[tasks]]"
---

# API

## 목적
이 문서는 향후 앱 내부 API와 인터페이스 계약을 정리하기 위한 기준 문서다.

## 핵심 내용
- 현재 단계에서는 API를 구현하지 않는다.
- 향후 API는 로컬 파일 읽기, 문서 쓰기, 링크 분석, 검색, 요약 기능을 분리해야 한다.
- API는 Markdown 원본을 손상시키지 않는 방향으로 설계한다.

## 요약
API 문서는 앱 내부 모듈 간 계약을 기록하는 장소다.

## 세부 내용
### 후보 인터페이스
- `readNote(path)`: Markdown 파일 읽기
- `writeNote(path, content)`: 백업 후 Markdown 파일 쓰기
- `parseNote(content)`: frontmatter와 본문 분석
- `findLinks(content)`: 내부 링크 추출
- `suggestLinks(note)`: 관련 문서 추천
- `appendUpdateLog(entry)`: 변경 로그 추가

## 연결된 문서
- [[architecture]]
- [[tech-stack]]
- [[tasks]]

## AI 메모
AI는 API를 제안할 때 구현보다 계약과 데이터 손상 방지 기준을 먼저 정의한다.

## AI가 알아야 할 규칙
문서 쓰기 API는 백업, UTF-8 저장, `updated` 갱신, 업데이트 로그 기록을 기본 동작으로 포함해야 한다.

## 다음 행동
- 파일 엔진 구현 단계에서 실제 함수 시그니처를 확정한다.
- 오류 처리와 권한 처리 정책을 추가한다.

## 업데이트 기록
- 2026-07-06: 최초 생성
