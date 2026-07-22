# DreamWish Design System

> The single design contract for every DreamWish surface. All pages, components,
> and AI-generated artifacts inherit this file. When a rule here conflicts with a
> local style, this file wins.
>
> Document structure inspired by the DESIGN.md contract of
> [nexu-io/open-design](https://github.com/nexu-io/open-design) (Apache-2.0).
> All content is DreamWish-original.

## 1. Brand

- **Product name:** DreamWish
- **Concept:** Better Decisions Powered by AI
- **Personality:** intelligent, calm, trustworthy, premium
- **Primary audience:** founders, teams, knowledge workers
- **Core experience:** think → remember → compare → decide → execute
- **Voice:** 명확하고 차분한 한국어 우선. 과장·유행어·가짜 수치 금지.
  영어·일본어 병기 시에도 톤을 유지한다.

## 2. Color

Light mode first, dark mode fully supported. Tokens live in
`app/globals.css` (`:root` / `:root[data-theme="dark"]`) and are mapped in
`tailwind.config.ts` as `app-*` utilities.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--primary` | `#6d5df6` | `#8b7cff` | Refined violet. CTA, active states, links |
| `--primary-strong` | `#5a49e8` | `#a094ff` | Hover/pressed emphasis |
| `--primary-soft` | `#eeecfe` | `#2a2653` | Tinted chips, selected backgrounds |
| `--secondary` | `#3b74e0` | `#6ea1ff` | Restrained blue. Informational accents |
| `--background` | `#f8fafc` | `#101418` | App canvas (warm white / near-black) |
| `--card` | `#ffffff` | `#171d23` | Surfaces |
| `--border` | `#e8eaf2` | `#2c3440` | Hairline borders |
| `--text` | `#111827` | `#eef2f7` | Body text |
| `--muted` | `#667085` | `#a7b0bd` | Secondary text (never below AA on card) |
| `--success` | `#15803d` | `#4ade80` | Positive state |
| `--warning` | `#b45309` | `#fbbf24` | Caution state |
| `--danger` | `#dc2626` | `#f87171` | Destructive state |
| `--info` | `#0369a1` | `#38bdf8` | Neutral information |

Rules:

- 과도한 gradient 금지 — hero 배경 등 큰 면에서만 절제된 2-stop gradient 허용.
- 본문 텍스트에 낮은 대비 금지: body는 `--text`, 보조 텍스트도 AA(4.5:1) 이상.
- 상태(성공/경고/위험)는 색상만으로 구분하지 않는다 — 아이콘·레이블 병행.
- Semantic 색은 배경 tint(`*-soft`)와 함께 사용해 카드 안에서 과하지 않게.

## 3. Typography

- **Families:** Inter + Apple SD Gothic Neo / Noto Sans KR (system stack).
  숫자·표는 `font-variant-numeric: tabular-nums` 정렬.
- **Scale (rem):** 11 / 12 / 13(caption) · 14(body-sm) · 16(body) ·
  18(section) · 22(title) · 28(page) · 40+(display, clamp).
- 제목 계층은 페이지당 h1 하나, 섹션은 h2, 카드 제목은 h3.
- 고밀도 화면(Admin, 표)은 13–14px 본문까지 허용하되 행간 1.5 이상.
- 한국어, 영어, 일본어 모두 word-break를 존중한다 (`keep-all` 권장).

## 4. Spacing

- 4px 기반 scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 96.
- 카드 내부 여백: 데스크톱 20–24px, 모바일 16px.
- 섹션 간격: 마케팅 화면 64–96px, 워크스페이스 화면 16–24px.
- 고밀도 화면(표, Admin)은 8/12px 리듬을 유지하며 여백을 임의로 없애지 않는다.

## 5. Radius

| Token | Value | Use |
| --- | --- | --- |
| `--radius-sm` | 8px | Chips, small buttons, inputs inside tables |
| `--radius-md` | 12px | Buttons, inputs, selects |
| `--radius-lg` | 16px | Small cards, dropdowns, tooltips |
| `--radius-xl` | 18px | Cards, dialogs, drawers (`rounded-app`) |
| `--radius-full` | 999px | Pills, avatars, scrollbar thumbs |

## 6. Shadow

미세한 경계 중심. 과도한 입체감 금지.

| Token | Use |
| --- | --- |
| `--shadow-soft` | Resting cards (`shadow-soft`) |
| `--shadow-app` | Elevated cards, popovers (`shadow-app`) |
| `--shadow-overlay` | Dialogs, drawers |

- Hover는 그림자보다 border/배경 tint 변화로 표현하고, lift는 2px 이내.
- 선택 상태는 `--primary` border + `--primary-soft` 배경으로 구분한다.

## 7. Motion

- 기준 시간: 150–250ms. 토큰: `--motion-fast: 150ms`, `--motion-base: 200ms`,
  `--motion-slow: 250ms`, easing `--ease-standard: cubic-bezier(0.2, 0, 0, 1)`.
- 목적 없는 애니메이션 금지. 페이지 전환·Drawer·Dialog·로딩 상태에만 사용.
- `prefers-reduced-motion: reduce`에서 모든 전환·애니메이션을 비활성화한다
  (globals.css에 전역 규칙 존재).

## 8. Components

- **Buttons:** primary(`--primary` 배경/white), secondary(card 배경+border),
  ghost(투명+hover tint), danger. 높이 36–40px, radius `--radius-md`,
  최소 터치 영역 44px(모바일은 패딩으로 확보).
- **Inputs:** card 배경, `--border`, focus 시 `--primary` ring 2px.
  브라우저 기본 스타일 금지.
- **Cards:** `--card` + `--border` + `--shadow-soft`, radius `--radius-xl`.
- **Dialogs/Drawers:** `--shadow-overlay`, backdrop `rgba(15,23,42,0.4)`,
  focus trap + Escape 닫기 필수.
- **Empty states:** 아이콘 + 한 줄 설명 + 다음 행동 버튼. 빈 화면을 그냥 두지 않는다.
- **Loading:** spinner + 무엇을 하는 중인지 한 줄 설명. skeleton은 목록·카드에.

## 9. Accessibility

- WCAG AA 대비, 키보드 탐색 전체 지원, `:focus-visible` ring 필수.
- Dialog는 ARIA role/label + focus trap. 상태 메시지는 텍스트로도 제공.
- 최소 터치 영역 44px. 색상만으로 상태를 구분하지 않는다.

## 10. Responsive

- Mobile-first. 브레이크포인트: 640(sm) / 768(md) / 1024(lg) / 1280(xl).
- 모바일: 하단/햄버거 내비, Drawer 기반 패널, 가로 스크롤 잘림 금지.
- 표·코드 등 넓은 콘텐츠는 자체 `overflow-x-auto` 컨테이너에 넣는다.

## 11. AI-generated artifacts

DreamWish Design Engine과 Design Agent가 생성하는 모든 결과물은 이 파일을
컨텍스트로 받아야 하며, 다음을 지킨다:

- 위 토큰(색·radius·간격·모션)을 기본값으로 사용한다. 사용자가 다른 브랜드를
  명시한 경우에만 벗어날 수 있다.
- 실제 동작하는 콘텐츠만 생성한다 — lorem ipsum, 가짜 버튼, 가짜 수치 금지.
- 결과물은 sandboxed preview에서 먼저 검토되고, 승인 후에만 저장·적용된다.
