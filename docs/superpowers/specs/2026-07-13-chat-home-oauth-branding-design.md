# AI Chat 홈, OAuth Callback, 브랜드 이미지 설계

## 목표

- `https://dreamwish.co.kr/`은 로그인 여부와 관계없이 AI Chat을 홈으로 표시한다.
- 비즈니스 화면에서 AI Chat으로 돌아오면 브라우저 주소도 `/`로 복원되어 새로고침 후 비즈니스가 다시 열리지 않게 한다.
- Google Drive부터 Gmail, Calendar, Slack, GitHub, Notion, Discord 순서로 OAuth 연결을 검증하고, 모든 인증 요청과 callback 복귀가 공개 도메인만 사용하게 한다.
- 첨부된 보라색 DREAMWISH 디자인을 기반으로 링크 공유용 Open Graph 이미지를 개선한다.
- 뇌 모양 브랜드 마크를 사이드바, 파비콘, 앱 아이콘, 공유 이미지에서 공통 사용한다.

## 확인된 원인

### AI Chat 홈

`AppShell`의 초기 뷰는 이미 `chat`이다. 그러나 `/business/...`에서 사이드바의 AI Chat을 선택해도 `activeView`만 변경되고 주소는 `/business/...`로 남는다. 이 상태에서 새로고침하면 경로 기반 초기화가 다시 `business`를 선택한다.

### OAuth callback

배포된 callback 경로를 직접 호출했을 때 서버는 다음과 같은 응답을 반환했다.

```text
Location: https://0.0.0.0:8080/?view=integrations&error=oauth_failed&...
```

Railway 프록시 뒤에서 `request.url`의 origin이 내부 주소 `https://0.0.0.0:8080`으로 전달되는데, callback 성공·실패 복귀 URL이 이 값을 직접 사용한다. 또한 배포 환경에 `APP_URL`이 누락되면 OAuth 인증 요청의 `redirect_uri`도 같은 내부 주소를 사용할 수 있다.

## 선택한 접근

하나의 공개 origin 해석기를 OAuth 인증 요청, callback 성공 복귀, callback 실패 복귀에서 공통 사용한다.

우선순위는 다음과 같다.

1. `APP_URL`, `NEXT_PUBLIC_APP_URL`, `PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `SITE_URL` 중 유효한 공개 URL
2. 호스팅 환경에서는 코드의 canonical `SITE_URL`, 즉 `https://dreamwish.co.kr`
3. 로컬 개발에서만 현재 요청 origin

호스팅 환경의 localhost, loopback, unspecified 주소(`0.0.0.0`, `[::]`)는 공개 origin으로 인정하지 않는다. 공급자별 `*_REDIRECT_URI`는 진단용으로만 비교하며 실제 인증 요청은 canonical builder가 만든 값을 사용한다.

환경변수에만 의존하는 방식은 누락 시 다시 내부 주소가 노출되므로 사용하지 않는다. `X-Forwarded-Host`만 신뢰하는 방식도 임의 헤더와 프록시 설정 차이 때문에 선택하지 않는다.

## 정확한 Redirect URI

| 공급자/서비스 | 공급자 콘솔에 등록할 URI |
| --- | --- |
| Google Drive | `https://dreamwish.co.kr/api/integrations/google/callback` |
| Gmail | `https://dreamwish.co.kr/api/integrations/google/callback` |
| Google Calendar | `https://dreamwish.co.kr/api/integrations/google/callback` |
| Slack | `https://dreamwish.co.kr/api/integrations/slack/callback` |
| GitHub | `https://dreamwish.co.kr/api/integrations/github/callback` |
| Notion | `https://dreamwish.co.kr/api/integrations/notion/callback` |
| Discord | `https://dreamwish.co.kr/api/integrations/discord/callback` |

Google Drive, Gmail, Calendar는 하나의 Google OAuth 앱과 callback URI를 공유한다. 서비스 구분은 서버가 보관하는 OAuth 세션의 `service` 필드로 처리한다.

## 홈 라우팅 설계

`AppShell`에 뷰 전환 전용 함수를 둔다.

- `chat` 선택: `activeView`를 `chat`으로 설정하고 주소를 `/`로 바꾼다.
- 그 외 사이드바 선택: 주소를 `/?view=<view>`로 바꾼다.
- `/business/<section>` 직접 접근: 기존과 같이 해당 비즈니스 섹션을 연다.
- `dreamwish:navigate` 이벤트: 동일한 전환 함수를 사용한다.
- OAuth callback의 `/?view=integrations` 복귀: 연동 화면을 연다.

주소 변경은 페이지 새로고침 없이 `history.replaceState`를 사용한다. 인증 성공 쿼리인 `connected`, 실패 쿼리인 `error`, `provider`, `reason`은 연동 화면이 처리한 뒤 정리한다.

## 연동 페이지 UX

연동 카드에 서버가 계산한 `expectedRedirectUri`를 표시하고 다음 상태를 구분한다.

- 일치: 공개 callback URI와 복사 버튼
- 불일치: 공급자 콘솔과 배포 환경의 값을 다시 확인하라는 경고
- 연결 불가: Client ID/Secret 누락 안내
- callback 실패: 공급자 이름과 안전하게 정규화된 오류 이유 표시

복사 버튼은 브라우저 Clipboard API를 사용하며 성공 여부를 짧은 상태 문구로 표시한다. API 키나 Client Secret은 화면이나 로그에 출력하지 않는다.

## 공유 이미지와 로고

### 공유 이미지

첨부 이미지는 디자인 참고 이미지로 사용한다. 최종 공유 이미지는 1200×630 비율이며 다음 구조를 사용한다.

- 짙은 네이비에서 보라색으로 이어지는 우주형 배경
- 오른쪽의 AI Chat 제품 화면과 발광하는 지식 네트워크
- 중앙 하단의 빛나는 뇌 오브젝트
- 왼쪽의 DREAMWISH 뇌 마크와 짧은 핵심 문구
- 작은 크기에서 읽히지 않는 기능 목록과 긴 설명은 제거

이미지 생성 도구는 배경 비주얼을 제작한다. 브랜드명과 한글 문구는 Next.js `ImageResponse`가 코드로 합성해 오탈자와 크롭 문제를 방지한다. Open Graph와 Twitter가 동일한 렌더러를 사용한다.

표시 문구는 다음으로 고정한다.

```text
DREAMWISH
당신의 모든 지식과 업무를 하나로.
나만의 기억과 연결되는 개인두뇌 AI
```

### 뇌 로고

로고는 단색에서도 식별되는 SVG로 만든다.

- 둥근 좌우 뇌 윤곽
- 중앙 연결선과 아래쪽 작은 연결 노드
- 기본 색상은 DREAMWISH 보라색
- 사이드바에서는 보라색 배경 위 흰색 마크
- 파비콘과 앱 아이콘에서는 여백이 있는 정사각형 구성

적용 위치는 `app/icon.svg`, 사이드바 브랜드 버튼, Open Graph 이미지이다. 로고에는 래스터 이미지나 외부 URL을 사용하지 않는다.

## 오류 처리와 보안

- callback 성공·실패 복귀 URL은 반드시 공개 origin builder를 사용한다.
- 인증 요청에서 만든 redirect URI를 OAuth 세션에 저장하고 token 교환에서 동일한 값을 재사용한다.
- 공급자가 반환한 오류는 허용된 영숫자와 구분자만 남기고 최대 길이를 제한한다.
- OAuth state, PKCE, 소유자 검증은 기존 동작을 유지한다.
- 공급자별 Client Secret, token, API key는 클라이언트 응답과 UI에 포함하지 않는다.
- 공개 origin 설정이 잘못된 경우 인증 공급자로 보내기 전에 안전한 서버 오류를 반환한다.

## 테스트

- 호스팅 환경에서 `request.url`이 `https://0.0.0.0:8080`이어도 Google callback URI가 `https://dreamwish.co.kr/api/integrations/google/callback`인지 확인한다.
- callback 성공·실패 응답의 `Location`이 `https://dreamwish.co.kr`인지 확인한다.
- Google Drive, Gmail, Calendar가 같은 callback과 서로 다른 service 값을 사용하는지 확인한다.
- Slack, GitHub, Notion, Discord가 각 canonical callback을 사용하는지 확인한다.
- 사이드바에서 비즈니스 후 AI Chat을 선택하면 뷰와 주소가 모두 홈으로 바뀌는지 확인한다.
- `/` 새로고침 시 로그인 사용자는 AI Chat, 비로그인 사용자는 공개 AI Chat을 보는지 확인한다.
- 연동 카드에 정확한 URI와 복사 컨트롤이 노출되는지 확인한다.
- Open Graph/Twitter 이미지가 1200×630이고 공통 브랜드 렌더러와 뇌 로고를 사용하는지 확인한다.
- 전체 테스트, TypeScript 검사, 린트, Next.js production build를 실행한다.

## 완료 기준

- Google Drive 연결 요청에 들어가는 `redirect_uri`가 공급자 콘솔 등록값과 정확히 일치한다.
- callback 후 브라우저가 `0.0.0.0`, localhost 또는 Railway 내부 주소로 이동하지 않는다.
- 나머지 OAuth 공급자도 같은 기준을 통과한다.
- `/`와 사이드바 로고는 AI Chat을 연다.
- DREAMWISH 링크 공유 시 새 브랜드 이미지가 표시되고 뇌 아이콘이 사이트 로고로 사용된다.

