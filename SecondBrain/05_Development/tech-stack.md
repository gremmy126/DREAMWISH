---
type: development
status: active
created: 2026-07-06
updated: 2026-07-06
tags:
  - tech-stack
  - development
  - architecture
related:
  - "[[architecture]]"
  - "[[database]]"
  - "[[api]]"
---

# 기술 스택

## 목적
이 문서는 제2의 두뇌 AI비서의 기술 선택 후보와 기준을 정리한다.

## 핵심 내용
- 1단계에서는 실제 기술 구현보다 파일 구조와 문서 규칙을 우선한다.
- 향후 데스크톱 앱, 로컬 파일 엔진, Markdown 파서, 로컬 임베딩 저장소가 필요하다.
- 기술 선택은 Local First와 Markdown First를 훼손하지 않아야 한다.

## 요약
기술 스택은 로컬 파일을 원본으로 유지하는 방향으로 선택한다.

## 세부 내용
- 데스크톱 후보: Electron, Tauri, 또는 로컬 웹앱
- UI 후보: React 기반 대시보드
- 파서 후보: Markdown AST 파서와 YAML frontmatter 파서
- 로컬 저장 후보: 파일 시스템 우선, 인덱스는 보조 캐시
- AI 연결 후보: 후속 단계에서 로컬/원격 모델 선택 가능

## 연결된 문서
- [[architecture]]
- [[database]]
- [[api]]

## AI 메모
AI는 기술 선택을 제안할 때 데이터 원본이 Markdown 파일인지 먼저 확인한다.

## AI가 알아야 할 규칙
DB, 검색 인덱스, 임베딩 저장소는 원본이 아니라 재생성 가능한 파생 데이터로 취급한다.

## 다음 행동
- 3단계에서 로컬 파일 읽기/쓰기 엔진 후보를 결정한다.
- 4단계에서 Markdown 파서 라이브러리를 평가한다.

## 업데이트 기록
- 2026-07-06: 최초 생성
