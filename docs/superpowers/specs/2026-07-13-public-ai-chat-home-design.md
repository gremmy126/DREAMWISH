# 공개 AI Chat 홈과 계정별 개인두뇌 설계

**작성일:** 2026-07-13  
**상태:** 승인됨  
**대상:** Next.js 15, React 19, TypeScript, Firebase Auth 기반 DREAMWISH 웹 앱

## 1. 배경

현재 `/`는 `AppShell`을 렌더링하지만 `AuthGate`가 비로그인 사용자에게 전체 화면 로그인 페이지를 보여준다. 이 때문에 검색엔진과 신규 방문자는 제품의 핵심인 AI Chat을 볼 수 없다. 또한 보호 API는 인증 여부뿐 아니라 `paid` 상태까지 검사해 미결제 사용자에게 `402 Payment Required`를 반환한다.

개편 후 `/`는 누구나 볼 수 있는 읽기 전용 AI Chat 홈이 된다. 사용자가 로그인하면 URL 변경이나 새로고침 없이 기존 사이드바 기반 작업 화면과 실제 AI Chat이 활성화된다. 결제 기능은 제거하고 비로그인 공개 화면의 Google AdSense로 수익화한다.

## 2. 목표

- `/`에서 비로그인 사용자에게 실제 제품과 닮은 읽기 전용 AI Chat을 보여준다.
- Email, Google, GitHub 로그인을 페이지 위 모달로 제공한다.
- 로그인 성공 직후 같은 `/`에서 기존 사이드바와 모든 앱 기능을 활성화한다.
- Chat, Memory, Knowledge, Files, Projects, CRM, Calendar, Automation, Integrations 데이터를 Firebase `uid`별로 격리한다.
- AI가 현재 계정에 속한 승인된 기억과 지식만 답변 컨텍스트로 사용하게 한다.
- 결제, Pricing, 업그레이드, `paid` 기반 실행 권한, `402` 응답을 제거한다.
- 비로그인 공개 화면에만 AdSense 광고를 렌더링한다.
- 공개 홈을 서버 렌더링하고 metadata, Open Graph, JSON-LD, robots, sitemap을 제공한다.

## 3. 비목표

- 하단 기능 소개, Docs/Blog 미리보기, Pricing, FAQ 같은 마케팅 섹션을 만들지 않는다.
- 비로그인 사용자를 위해 실제 Chat 세션이나 임시 AI 응답을 생성하지 않는다.
- 익명 사용자 데이터를 로그인 계정으로 병합하지 않는다.
- 자동 광고를 사용하지 않는다.
- 기존 사이드바 기능의 정보 구조나 개별 도구 화면을 재설계하지 않는다.

## 4. 핵심 아키텍처

### 4.1 하나의 URL, 두 개의 셸

`/`는 인증 상태에 따라 두 화면 중 하나를 렌더링한다.

1. **Guest Shell**
   - 서버 렌더링된 공개 홈이다.
   - 로고, Login 버튼, 읽기 전용 Chat, 예시 질문, 수동 AdSense 광고 단위, 최소 Footer만 포함한다.
   - 실제 `ChatView`를 마운트하지 않으므로 보호 API를 호출하지 않는다.

2. **Authenticated App Shell**
   - 현재 `AppShell`, `Sidebar`, `Topbar`, `ChatView`와 모든 기존 도구 화면을 유지한다.
   - 로그인 성공 시 Guest Shell을 같은 React 트리 안에서 즉시 교체한다.
   - 광고와 공개 홈 DOM은 제거된다.

인증 상태는 전용 `AuthProvider`가 `loading`, `guest`, `authenticated`로 관리한다. 서버는 유효한 서명 세션 쿠키가 있으면 인증 화면을 초기 상태로 전달한다. 클라이언트는 Firebase 상태를 복원하고 서버 세션을 갱신한다. 세션 쿠키가 없거나 만료되었어도 공개 홈의 서버 HTML은 항상 검색엔진에 제공된다.

### 4.2 라우팅

| 경로 | 동작 |
| --- | --- |
| `/` | Guest Shell 또는 Authenticated App Shell |
| `/chat` | `/`로 영구 리다이렉트 |
| `/login` | `/?login=1`로 리다이렉트하고 로그인 모달을 연 뒤 `history.replaceState`로 주소를 `/`로 정리한다 |
| `/pricing` | `/`로 리다이렉트 |
| `/payment/success` | `/`로 리다이렉트 |
| `/billing/success` | `/`로 리다이렉트 |
| `/settings/billing` | `/`로 리다이렉트 |

브라우저 주소는 로그인 전후 모두 `/`로 유지한다. 로그아웃도 페이지 이동 없이 Guest Shell로 전환한다.

## 5. 공개 AI Chat 홈

### 5.1 화면 구성

- 상단에는 DREAMWISH 로고와 Login 버튼만 둔다.
- 중앙에는 제품의 실제 Chat UI와 시각적으로 일치하는 읽기 전용 Chat 패널을 둔다.
- 입력창 placeholder는 `로그인 후 AI를 사용할 수 있습니다.`로 고정한다.
- 예시 질문은 다음 다섯 개를 제공한다.
  - 오늘 일정을 정리해줘
  - 회의를 요약해줘
  - 프로젝트를 생성해줘
  - Gmail을 확인해줘
  - CRM 고객을 찾아줘
- Footer에는 Privacy, Cookies, Terms, Cookie settings만 제공한다.
- 기능 소개, Docs, Blog, Pricing, FAQ 섹션은 렌더링하지 않는다.

### 5.2 잠금 동작

메시지 입력, 전송, 파일 첨부, 이미지 첨부, 음성 입력, 예시 질문은 AI 기능을 수행하지 않는다. 모든 상호작용은 로그인 모달을 연다. 클릭이 필요한 컨트롤에는 네이티브 `disabled` 대신 `aria-disabled="true"`와 명확한 잠금 설명을 사용해 로그인 동작과 키보드 접근성을 모두 유지한다.

Guest Shell은 다음 API를 포함해 어떤 보호 API도 호출하지 않는다.

- `/api/ai/*`
- `/api/files`
- `/api/memory/*`
- `/api/knowledge/*`
- `/api/crm/*`
- `/api/automation/*`
- `/api/projects/*`
- `/api/integrations/*`
- `/api/local/*`

## 6. 로그인 모달과 세션

### 6.1 지원 방식

- Email 및 비밀번호 로그인
- Email 회원가입
- Email 비밀번호 재설정
- Google 로그인
- GitHub 로그인

기존 Firebase 인증 함수와 오류 매핑을 재사용한다. 기존 전체 화면 `LoginShell`의 폼 책임을 재사용 가능한 모달 콘텐츠로 분리하고 `AuthGate`의 인증 부수 효과를 `AuthProvider`로 이동한다.

### 6.2 로그인 데이터 흐름

1. 사용자가 Guest Shell의 잠긴 컨트롤 또는 Login 버튼을 누른다.
2. `AuthProvider`가 접근 가능한 Dialog를 연다.
3. Firebase 클라이언트가 선택한 방식으로 사용자를 인증한다.
4. 클라이언트가 Firebase ID 토큰을 `/api/auth/login`에 보낸다.
5. 서버가 Firebase ID 토큰의 서명과 canonical `uid`, email, name을 검증한다.
6. 서버가 HMAC 서명된 `HttpOnly`, `Secure`(production), `SameSite=Lax` 세션 쿠키를 발급한다.
7. 클라이언트가 인증 상태를 `authenticated`로 변경하고 모달을 닫는다.
8. 같은 `/`에서 Authenticated App Shell과 실제 `ChatView`를 마운트한다.

페이지 새로고침, `/login` 이동, `window.location` 재할당은 로그인 성공 흐름에서 사용하지 않는다.

### 6.3 로그아웃과 만료

로그아웃은 Firebase 사용자, 서버 세션 쿠키, 클라이언트 인증 캐시를 함께 제거한다. 보호 API가 `401`을 반환하면 만료된 상태를 정리하고 Guest Shell로 전환한 뒤 로그인 모달을 연다. 진행 중이던 AI 요청은 자동 재전송하지 않는다.

## 7. 계정별 개인두뇌와 보안

### 7.1 소유자 경계

Firebase 토큰에서 검증한 `uid`가 유일한 소유자 키다. 이메일, 요청 본문의 `ownerId`, 헤더의 사용자 정보는 소유권 판정에 사용하지 않는다.

다음 데이터는 모든 읽기, 쓰기, 검색, 삭제에서 `uid` 범위를 강제한다.

- Chat sessions and messages
- Memory candidates and approved memories
- Knowledge notes and network data
- Files and document context
- Projects and session links
- CRM customers and activities
- Calendar events
- Automation and workflow data
- Integrations, OAuth sessions, tokens, sync data

각 사용자 데이터 API는 전역 middleware의 인증 검사 후에도 route handler에서 `requireOwnerContext(request)`를 호출한다. 저장소 함수는 검증된 `owner.uid`를 명시적으로 첫 인자로 받으며, 다른 사용자의 식별자를 전달해도 결과를 반환하지 않는다.

### 7.2 AI 기억 사용

- Chat 요청은 검증된 `owner.uid`로 현재 사용자의 승인된 Memory와 Knowledge만 검색한다.
- pending, rejected, forgotten, 다른 사용자의 기억은 프롬프트에 포함하지 않는다.
- 대화에서 추출된 새로운 기억은 현재처럼 pending 후보로 저장한다.
- 사용자가 승인한 기억만 이후 답변에 사용한다.
- Chat 기록과 기억 검색 결과는 정해진 개수와 크기로 제한해 프롬프트 경계를 유지한다.

### 7.3 API 정책

공개 API는 인증 세션 생성·복원·종료에 필요한 최소 경로로 제한한다. OAuth callback은 서명된 state와 route-level owner 검증을 통과해야 한다. 그 외 모든 `/api` 경로는 유효한 세션이 없으면 JSON `401 UNAUTHORIZED`를 반환한다.

`checkout` 접근 클래스, `PAYMENT_REQUIRED`, `402` 응답은 삭제한다. 인증된 일반 사용자와 관리자는 모두 보호 API를 사용할 수 있다. 관리자 전용 API의 role 검사는 유지한다.

## 8. 결제 기능 제거

- Pricing 페이지와 모든 Pricing 내비게이션을 제거한다.
- Sidebar의 업그레이드 버튼과 결제 상태 복원 코드를 제거한다.
- 결제 필요 전체 화면과 checkout 시작 동작을 제거한다.
- Polar checkout, checkout lookup, webhook route와 더 이상 사용되지 않는 결제 서비스 코드를 제거한다.
- 결제 성공 페이지와 billing 설정 진입점을 `/`로 리다이렉트한다.
- `AccessState`와 세션 실행 권한에서 `paid`, `requiresPayment`, `canUseApp` 기반 paywall 판정을 제거한다.
- 기존 로컬 계정 JSON에 남아 있는 `paid` 필드는 마이그레이션 안전성을 위해 읽을 수는 있지만 실행 권한에 사용하지 않고 새 코드에서 쓰지 않는다.
- 관리자 role과 관리자 전용 API 권한은 결제와 독립적으로 유지한다.

## 9. SEO

공개 홈 콘텐츠는 Client Component의 로딩 화면에 의존하지 않고 initial HTML에 포함한다.

Root metadata에는 다음을 포함한다.

- `metadataBase: https://dreamwish.co.kr`
- canonical `/`
- 한국어 title과 description
- Open Graph title, description, URL, site name, locale, image
- Twitter card
- `robots`와 `googleBot` index/follow 지시
- Google AdSense account meta
- Naver site verification meta

Open Graph 이미지는 `app/opengraph-image.tsx`에서 DREAMWISH 로고, 제품명, 개인두뇌 AI 설명을 포함한 정적 이미지를 생성한다.

홈 본문에는 `SoftwareApplication` JSON-LD를 서버에서 렌더링한다. `applicationCategory`는 `BusinessApplication`, `operatingSystem`은 `Web`으로 명시한다. 무료 서비스이므로 `offers.price`는 `0`, `priceCurrency`는 `KRW`로 명시한다.

`app/robots.ts`는 공개 페이지 크롤링을 허용하고 `/api/`를 제외하며 sitemap URL을 제공한다. `app/sitemap.ts`는 `/`, `/privacy`, `/cookies`, `/terms`만 포함한다. 리다이렉트 경로와 인증 작업 화면은 포함하지 않는다.

참고:

- https://nextjs.org/docs/app/getting-started/metadata-and-og-images
- https://developers.google.com/search/docs/appearance/structured-data/software-app

## 10. AdSense

현재 게시자 ID `ca-pub-5650931082151367`과 account meta를 유지한다. 자동 광고는 사용하지 않고 공개 홈 안의 명시적 광고 단위만 사용한다.

- `NEXT_PUBLIC_ADSENSE_SLOT_ID`를 `.env.example`과 production 환경에 정의한다.
- `PublicAdSlot`은 Guest Shell에서만 광고 스크립트와 `<ins class="adsbygoogle">`를 렌더링하고 초기화한다.
- 슬롯 ID가 없으면 스크립트, 광고 요청, 빈 광고 컨테이너를 만들지 않는다.
- 로그인 성공 시 Guest Shell과 광고 DOM을 함께 언마운트한다.
- Authenticated App Shell에는 광고 컴포넌트를 import하지 않는다.
- 동일 URL이 인증 전후에 사용되므로 AdSense 대시보드에서 dreamwish.co.kr의 Auto ads를 비활성화하고 수동 ad unit만 사용한다.
- 기존 Consent Mode와 Cookie settings 동작은 유지한다.

참고:

- https://support.google.com/adsense/answer/7037624?hl=en
- https://support.google.com/adsense/answer/7584263?hl=en

## 11. 오류 처리

- 인증 복원 중에도 공개 홈 레이아웃을 유지하고 작은 진행 상태만 표시한다.
- 로그인과 회원가입 오류는 안전한 한국어 메시지로 Dialog 안에 표시한다.
- Firebase 또는 서버 세션 복원이 실패하면 Guest Shell로 되돌아간다.
- `401`은 세션 만료로 처리하되 실패한 쓰기 요청과 AI 요청은 자동 반복하지 않는다.
- AI 오류는 기존 안정적인 오류 코드와 다국어 메시지를 유지한다.
- AdSense 로딩 실패나 누락된 slot 설정은 제품 UI에 오류를 표시하지 않는다.
- Dialog는 focus trap, Escape 닫기, 배경 클릭 정책, 제목/설명 연결, 로그인 중 닫기 방지를 제공한다.

## 12. 테스트 전략

구현은 테스트 우선 순서로 진행한다.

### 12.1 라우팅과 공개 HTML

- `/`의 서버 HTML에 공개 Chat 제목, placeholder, 예시 질문, SEO 텍스트가 포함되는지 검증한다.
- `/chat`, `/login`, `/pricing`, 결제 성공 경로의 리다이렉트를 검증한다.
- robots와 sitemap이 공개 URL만 노출하는지 검증한다.
- metadata, canonical, Open Graph, JSON-LD의 필수 필드를 검증한다.

### 12.2 Guest Shell

- Guest Shell 마운트가 보호 API를 호출하지 않는지 검증한다.
- Login, 입력, 전송, 첨부, 음성, 예시 질문이 모두 같은 로그인 Dialog를 여는지 검증한다.
- Guest Shell에 실제 세션, 사용자 데이터, 광고 이외의 개인화 데이터가 없는지 검증한다.

### 12.3 인증 전환

- Email, Google, GitHub 인증 성공이 Dialog를 닫고 새로고침 없이 App Shell을 활성화하는지 검증한다.
- 로그인 실패가 Guest Shell을 유지하고 Dialog 안에 오류를 표시하는지 검증한다.
- 로그아웃과 세션 만료가 Guest Shell로 안전하게 전환되는지 검증한다.

### 12.4 API와 소유자 격리

- 익명 보호 API 요청은 모두 `401`을 반환한다.
- 인증된 일반 사용자는 결제 없이 보호 API를 통과하며 `402`가 반환되지 않는다.
- 관리자 전용 API는 role 검사를 계속 수행한다.
- 서로 다른 `uid`의 Chat, Memory, Knowledge, Files, Projects, CRM, OAuth 데이터가 교차 노출되지 않는다.
- AI Chat이 현재 사용자의 승인된 기억만 사용한다.

### 12.5 AdSense

- Guest Shell과 유효한 slot 설정이 있을 때만 광고 DOM이 존재한다.
- slot 설정이 없으면 광고 스크립트와 빈 영역이 없다.
- 로그인 전환 후 광고 DOM이 제거되고 App Shell에는 광고 import가 없다.

### 12.6 완료 검증

- `npm.cmd test`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- 비로그인 `/` 브라우저 스모크 테스트
- Email 또는 소셜 로그인 후 동일 `/`에서 Chat과 사이드바 활성화 스모크 테스트
- 로그아웃 후 Guest Shell과 공개 광고 영역 복원 스모크 테스트

## 13. 완료 기준

- dreamwish.co.kr 접속 시 로그인 페이지가 아닌 공개 AI Chat이 첫 화면에 보인다.
- 비로그인 사용자는 제품 UI를 볼 수 있지만 어떤 AI 또는 개인 데이터 API도 사용할 수 없다.
- 잠긴 기능을 사용하려 하면 페이지 이동 없이 로그인 Dialog가 열린다.
- 로그인 성공 후 같은 `/`에서 기존 사이드바와 실제 Chat이 즉시 활성화된다.
- 로그인한 사용자는 결제 없이 모든 일반 기능을 사용할 수 있다.
- AI는 해당 Firebase `uid`의 승인된 기억만 사용한다.
- 광고는 Guest Shell에서만 표시되고 로그인 후 작업 화면에는 표시되지 않는다.
- 공개 홈은 Googlebot이 로그인 없이 읽을 수 있고 metadata, JSON-LD, robots, sitemap이 유효하다.
- 전체 자동 검증과 프로덕션 build가 통과한다.
