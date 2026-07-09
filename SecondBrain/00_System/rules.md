---
type: system-rule
status: active
created: 2026-07-06
updated: 2026-07-06
tags:
  - rules
  - governance
  - safety
related:
  - "[[README]]"
  - "[[ai-instructions]]"
  - "[[update-log]]"
---

# SecondBrain 운영 규칙

## 목적
이 문서는 로컬 지식 저장소를 안전하고 일관되게 운영하기 위한 최상위 규칙을 정의한다.

## 핵심 내용
- 기존 문서는 삭제하지 않는다.
- 수정이 필요하면 기존 내용을 보존하고 업데이트 기록을 남긴다.
- 모든 문서는 YAML frontmatter와 내부 링크를 포함한다.
- 모든 데이터는 UTF-8 Markdown으로 저장한다.

## 요약
규칙의 핵심은 데이터 소유권, 변경 추적, AI 친화적 구조, 문서 간 연결 유지다.

## 세부 내용
- Local First: 데이터 원본은 사용자 PC 안의 파일이다.
- Markdown First: 문서 자체가 데이터베이스다.
- AI First: 문서 구조는 AI가 빠르게 읽고 판단할 수 있어야 한다.
- Graph First: 고립 문서는 허용하지 않는다.
- Evolution: 지식은 덮어쓰기보다 누적과 기록을 기준으로 성장한다.

## 연결된 문서
- [[README]]
- [[ai-instructions]]
- [[update-log]]

## AI 메모
AI는 파일을 수정하기 전에 백업 필요 여부와 링크 유지 여부를 먼저 점검한다.

## AI가 알아야 할 규칙
같은 파일명이 이미 있으면 수정 전에 `파일명.backup.YYYYMMDD-HHmm.md` 형식의 백업을 만든다.

## 다음 행동
- 새 문서 생성 시 품질 검사 항목을 적용한다.
- 변경 사항은 [[update-log]]에 기록한다.

## 업데이트 기록
- 2026-07-06: 최초 생성
