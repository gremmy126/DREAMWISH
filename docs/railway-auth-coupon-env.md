# Railway 로그인·쿠폰 배포 설정

이 문서는 DREAMWISH 운영 환경에서 이메일 로그인, Kakao·Naver 로그인, 관리자, 이용권형·할인형 쿠폰을 활성화하는 기준입니다. 아래 값은 Railway의 Next.js web 서비스 Variables에 등록합니다. Worker를 별도 서비스로 실행한다면 DB와 암호화·해시 관련 서버 Secret은 web과 같은 값을 사용해야 합니다.

## 필수 서버 변수

```text
APP_URL=https://dreamwish.co.kr
NEXT_PUBLIC_APP_URL=https://dreamwish.co.kr
DATABASE_URL=<Railway PostgreSQL reference>
AUTH_SESSION_SECRET=<32자 이상 무작위 값>
AUTH_OAUTH_STATE_SECRET=<서로 다른 32자 이상 무작위 값>
COUPON_HASH_SECRET=<서로 다른 32자 이상 무작위 값>
ADMIN_EMAILS=<관리자 이메일을 쉼표로 구분>

KAKAO_CLIENT_ID=<Kakao REST API key>
KAKAO_CLIENT_SECRET=<Kakao Client Secret>
KAKAO_REDIRECT_URI=https://dreamwish.co.kr/api/auth/oauth/kakao/callback

NAVER_CLIENT_ID=<Naver Client ID>
NAVER_CLIENT_SECRET=<Naver Client Secret>
NAVER_REDIRECT_URI=https://dreamwish.co.kr/api/auth/oauth/naver/callback

POLAR_ACCESS_TOKEN=<Polar organization access token>
POLAR_PRODUCT_ID=<월간 구독 product id>
POLAR_WEBHOOK_SECRET=<Polar webhook secret>
POLAR_SERVER=production
```

`KAKAO_CLIENT_SECRET`, `NAVER_CLIENT_SECRET`, `AUTH_SESSION_SECRET`, `AUTH_OAUTH_STATE_SECRET`, `COUPON_HASH_SECRET`, `POLAR_ACCESS_TOKEN`은 절대 `NEXT_PUBLIC_` 변수로 만들지 않습니다. Railway 변수 변경 뒤에는 web과 Worker를 모두 재배포합니다.

## Kakao Developers 설정

1. Kakao Developers에서 애플리케이션을 만들고 Kakao Login을 활성화합니다.
2. Web 플랫폼 사이트 도메인에 `https://dreamwish.co.kr`을 등록합니다.
3. Redirect URI를 `https://dreamwish.co.kr/api/auth/oauth/kakao/callback`으로 정확히 등록합니다.
4. 동의 항목에서 카카오계정 이메일과 닉네임을 요청합니다. 사용자가 이메일 제공에 동의하지 않거나 검증된 이메일이 제공되지 않으면 DREAMWISH는 계정을 만들지 않습니다.
5. 앱의 **REST API 키**를 `KAKAO_CLIENT_ID`에 넣습니다. JavaScript 키가 아닙니다.
6. 보안 설정의 Client Secret을 활성화하고 `KAKAO_CLIENT_SECRET`에 넣습니다.

## Naver Developers 설정

1. Naver Developers에서 네이버 로그인용 Web 애플리케이션을 등록합니다.
2. 서비스 URL을 `https://dreamwish.co.kr`로 설정합니다.
3. Callback URL을 `https://dreamwish.co.kr/api/auth/oauth/naver/callback`으로 정확히 등록합니다.
4. 제공 정보에서 이메일과 이름을 요청합니다. 이메일 제공 동의가 없으면 로그인은 안전하게 중단됩니다.
5. 발급된 Client ID와 Client Secret을 각각 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`에 넣습니다.

## Firebase 이메일 로그인

Firebase Authentication에서는 Email/Password만 활성화합니다. 기존 로그인 화면의 Google·GitHub 버튼은 제거되어 있으며 해당 제공자는 회원 로그인에 사용하지 않습니다. `NEXT_PUBLIC_FIREBASE_*` Web 설정과 서버의 `FIREBASE_WEB_API_KEY`는 기존 Firebase 프로젝트 값으로 유지합니다.

## Polar 할인형 쿠폰

할인형 쿠폰을 만들려면 `POLAR_ACCESS_TOKEN`이 해당 Organization의 **Discount 생성·조회(쓰기) 권한**을 가져야 합니다. Polar Dashboard에서 대상 월간 상품을 확인하고 `POLAR_PRODUCT_ID`를 동일한 상품으로 설정합니다. 할인형 쿠폰은 관리자 페이지가 Polar Discount를 만든 뒤 Checkout에 해당 `discountId`를 전달합니다. Webhook은 결제가 완료된 경우에만 예약된 사용을 최종 사용 처리합니다.

이용권형 쿠폰은 Polar 결제를 만들지 않고 PostgreSQL `access_grants`에 만료 시각이 있는 접근권한을 생성합니다. 할인형과 이용권형 모두 코드 원문은 생성 직후 한 번만 표시되고, 이후에는 `COUPON_HASH_SECRET`을 이용한 HMAC 해시와 일부 힌트만 저장됩니다.

## Secret 생성과 교체

각 Secret은 예를 들어 `openssl rand -hex 32`로 독립 생성합니다. 같은 값을 여러 용도에 재사용하지 않습니다.

- `AUTH_SESSION_SECRET` 교체: 기존 로그인 세션이 모두 무효화됩니다.
- `AUTH_OAUTH_STATE_SECRET` 교체: 진행 중인 Kakao·Naver 로그인 요청이 무효화됩니다.
- `COUPON_HASH_SECRET` 교체: 기존 쿠폰 코드를 새 해시로 조회할 수 없으므로 운영 중 임의 교체하지 않습니다. 교체가 필요하면 기존 쿠폰 폐기·재발급 또는 별도 마이그레이션 계획을 먼저 수행합니다.
- 제공자 Client Secret 교체: Kakao·Naver Console과 Railway 값을 함께 바꾸고 두 로그인 흐름을 다시 검증합니다.

## 배포 확인

1. 이메일 회원가입·로그인·비밀번호 재설정을 확인합니다.
2. Kakao와 Naver에서 이메일 동의 허용/거절 흐름을 각각 확인합니다.
3. 로그인 화면의 쿠폰 코드가 이메일 로그인과 두 소셜 로그인에서 동일하게 처리되는지 확인합니다.
4. 이용권형 쿠폰으로 결제 없이 기간형 접근권한이 생기는지 확인합니다.
5. 할인형 쿠폰이 Polar Checkout 할인에 적용되고 결제 완료 뒤 사용 처리되는지 확인합니다.
6. 관리자 이메일 계정에서만 프로필 메뉴의 관리자 페이지가 보이는지 확인합니다.
7. 브라우저 URL, Storage, 쿠키, 서버 응답과 로그에 OAuth Access Token, Client Secret, 쿠폰 원문이 노출되지 않는지 확인합니다.
