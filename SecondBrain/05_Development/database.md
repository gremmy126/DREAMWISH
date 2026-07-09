---
type: development
status: active
created: 2026-07-06
updated: 2026-07-06
tags:
  - database
  - markdown-database
  - storage
related:
  - "[[architecture]]"
  - "[[tech-stack]]"
  - "[[memory-rules]]"
---

# 데이터베이스

## 목적
이 문서는 이 프로젝트에서 데이터베이스가 무엇을 의미하는지 정의한다.

## 핵심 내용
- 진짜 데이터베이스는 사용자 컴퓨터 안의 Markdown 파일이다.
- 별도 DB는 검색, 캐시, 임베딩 같은 파생 데이터 저장에만 사용한다.
- DB가 없어도 Markdown 파일만으로 지식은 유지되어야 한다.

## 요약
Markdown이 원본 데이터베이스이고, 다른 저장소는 보조 인덱스다.

## 세부 내용
- 원본 데이터: `.md` 파일
- 메타데이터: YAML frontmatter
- 관계 데이터: `[[문서명]]` 내부 링크
- 변경 이력: 문서별 업데이트 기록과 [[update-log]]
- 파생 데이터 후보: 검색 인덱스, 임베딩 벡터, 링크 그래프 캐시

## 연결된 문서
- [[architecture]]
- [[tech-stack]]
- [[memory-rules]]

## AI 메모
AI는 데이터베이스라는 단어를 사용할 때 원본과 캐시를 명확히 구분해야 한다.

## AI가 알아야 할 규칙
파생 데이터는 언제든 삭제하고 Markdown에서 재생성할 수 있어야 한다.

## 다음 행동
- 6단계에서 로컬 임베딩 저장 위치와 재생성 전략을 정의한다.
- 문서 ID와 파일명 규칙을 구체화한다.

## 업데이트 기록
- 2026-07-06: 최초 생성
