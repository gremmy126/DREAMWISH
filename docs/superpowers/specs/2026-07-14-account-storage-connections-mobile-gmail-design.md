# 계정별 저장공간·연결 안정성·모바일 페어링·Gmail 대화 설계

**Date:** 2026-07-14
**Status:** 사용자 승인 완료, 구현 계획 작성 전 검토 단계

## 1. 목표

DREAMWISH에서 계정과 무관하게 보이던 브라우저 저장공간 표시를 실제 로그인 사용자 데이터 기준으로 바꾸고, 자동화 직접 토큰의 검증 후 암호화 저장 실패를 해결한다. GitHub·Notion·Slack OAuth 콜백과 연결 상태를 정확히 안내하며, Android·iPhone 연결 모달과 컴패니언 앱에 6자리 코드 입력 위치를 명시한다. 비즈니스의 Gmail 화면은 연결된 계정에 저장된 대화가 없을 때 최초 동기화를 한 번 실행하고, 실패 원인을 숨기지 않는다.

## 2. 범위

- 사이드바와 설정의 저장공간을 로그인 사용자 소유 데이터 기준으로 표시
- 신규 사용자는 저장된 데이터가 없으면 `0 B`로 시작
- Notion을 포함한 직접 토큰 앱의 검증 성공 후 AES-256-GCM 저장 복구
- 직접 토큰 앱 전체가 공유하는 암호화 키 계약과 안전한 저장 오류 코드
- GitHub·Notion·Slack OAuth 콜백 URI, 운영자 설정 상태, 사용자 연결 상태 표시
- Notion API 검증 버전 갱신
- Android·iPhone 연결 모달의 6자리 코드 입력 위치 안내
- Android Kotlin과 iPhone Swift 컴패니언 페어링 입력 화면의 소스 경로 제공
- Gmail 전용 OAuth 토큰 선택, 최초 자동 동기화, 동기화 오류 표시, 스레드 묶기
- 관련 사용자 소유권·회귀 테스트

## 3. 제외 범위

- Google Play 또는 App Store에 DREAMWISH 컴패니언 앱을 대신 배포하지 않는다.
- 사용자 소유 Apple Developer·Google Play 서명 자격증명을 저장소에 넣지 않는다.
- 사용자가 제공한 Notion·GitHub 등 외부 토큰을 로그나 브라우저 저장소에 기록하지 않는다.
- 페이지를 열 때마다 Gmail 전체를 다시 동기화하지 않는다.
- 브라우저 origin 전체의 `navigator.storage.estimate()` 값을 사용자 저장 용량으로 표시하지 않는다.
- 외부 공급자의 실제 사용자 승인을 자동으로 대신 완료하지 않는다.

## 4. 확인된 원인

### 4.1 저장공간이 계정마다 같음

현재 `StorageStatus`는 같은 origin의 모든 `localStorage` 키 크기와 `navigator.storage.estimate()` 값을 합산한다. 두 값 모두 브라우저 origin 단위이므로 같은 브라우저에서 계정을 바꾸면 동일하게 보인다. 서버의 `ownerId`와 연결되지 않아 신규 계정도 기존 브라우저 사용량을 보게 된다.

### 4.2 검증된 Notion 토큰 저장 실패

직접 토큰 검증은 성공한 뒤 `saveVerifiedCredential`에서 암호화한다. 운영 환경에서는 `AUTOMATION_CREDENTIAL_ENCRYPTION_KEY`만 찾지만 기존 OAuth 운영 문서와 Railway 설정은 `INTEGRATION_TOKEN_ENCRYPTION_KEY`를 기준으로 한다. 자동화 전용 키가 없으면 검증 직후 `AUTOMATION_CREDENTIAL_ENCRYPTION_KEY is required.`가 발생하고 API가 `CREDENTIAL_SAVE_FAILED` 500을 반환한다.

이 경로는 Notion뿐 아니라 GitHub, Discord, Telegram, Airtable, Trello, Asana, Jira, Linear, HubSpot, Salesforce, Stripe, Shopify, WordPress, Facebook, Instagram, X, LinkedIn, OpenAI 직접 키 연결이 공유한다.

### 4.3 Gmail은 연결되었지만 목록이 없음

비즈니스 메시지 화면의 첫 요청은 저장된 캐시만 읽고 Gmail 동기화를 실행하지 않는다. 수동 동기화가 실패해도 API는 동기화 결과를 무시하고 빈 대화를 200으로 반환한다. 또한 동기화 엔진이 Google provider만 지정하고 `gmail` service를 지정하지 않아 Drive 또는 Calendar 토큰을 선택할 수 있다. 같은 Gmail thread의 메시지 ID도 상세 조회마다 덮어써져 스레드가 분리될 수 있다.

### 4.4 모바일 코드 입력 위치가 없음

웹은 6자리 challenge를 생성하지만 현재 컴패니언 폴더는 Android 알림 수집과 iOS 공유 확장의 참고 코드만 포함한다. 실제 `PairingActivity.kt`와 `PairingView.swift` 입력 화면이 없고, 웹 모달도 사용자가 앱의 어느 메뉴에 코드를 입력하는지 알려주지 않는다.

## 5. 계정별 저장공간 설계

### 5.1 서버 사용량이 정본

인증된 `GET /api/storage/usage`를 추가한다.

```ts
type AccountStorageUsage = {
  usageBytes: number;
  quotaBytes: number | null;
  breakdown: {
    files: number;
    memories: number;
    knowledge: number;
    chat: number;
    business: number;
    automation: number;
  };
  measuredAt: string;
};
```

- API는 `requireOwnerContext`로 확인한 `owner.uid` 데이터만 계산한다.
- 파일 원본은 저장된 `size` 합계로 계산한다.
- 메모리·지식·채팅·비즈니스·자동화 텍스트 레코드는 UTF-8 직렬화 바이트로 계산한다.
- 다른 사용자의 레코드와 브라우저 origin 전체 사용량은 포함하지 않는다.
- 데이터가 없는 신규 사용자는 모든 항목과 합계가 `0`이다.
- 제품 저장 한도가 서버에 정의되지 않은 동안 `quotaBytes`는 `null`이며 가짜 브라우저 quota를 표시하지 않는다.
- 기존 카드 제목은 `로컬 스토리지`에서 `내 저장공간`으로 바꾸고 마지막 측정 시각과 합계를 표시한다.
- 브라우저 캐시가 필요하면 설정 화면의 별도 진단 항목으로만 표시하며 계정 저장 용량과 합산하지 않는다.

### 5.2 오류와 갱신

- 로그인 직후와 파일·메모리·지식 변경 이벤트 후 사용량을 다시 조회한다.
- 측정 실패 시 이전 값을 사용자 데이터처럼 확정하지 않고 `사용량 확인 실패`와 다시 시도를 표시한다.
- 저장공간 API는 인증되지 않은 요청을 401로 거부한다.

## 6. 직접 토큰 암호화 저장 설계

### 6.1 키 선택 계약

자동화 자격증명은 다음 우선순위로 서버 전용 키를 선택한다.

1. `AUTOMATION_CREDENTIAL_ENCRYPTION_KEY`
2. `INTEGRATION_TOKEN_ENCRYPTION_KEY`
3. `OAUTH_TOKEN_ENCRYPTION_KEY`
4. 개발 환경 전용 고정 fallback

운영 환경에서 1~3이 모두 없으면 저장을 거부한다. `AUTH_SESSION_SECRET`은 목적이 다른 키이므로 fallback으로 사용하지 않는다. 기존에 자동화 전용 키로 암호화된 레코드는 우선순위 1을 유지해 계속 복호화한다. 운영 문서와 `.env.example`에는 권장 루트 키와 선택적 자동화 전용 키를 함께 명시한다.

새 credential에는 `keyId: "automation" | "integration" | "oauth"`를 저장한다. 복호화는 현재 우선순위가 아니라 레코드의 `keyId`가 가리키는 키를 사용한다. 따라서 처음에는 integration 키로 저장했다가 나중에 자동화 전용 키를 추가해도 기존 레코드가 깨지지 않는다. `keyId`가 없는 기존 레코드는 기존 동작과 호환되도록 자동화 전용 키를 먼저 시도하며, 성공한 레코드는 다음 저장 시 현재 schema로 승격한다.

### 6.2 안전한 오류 계약

저장소는 비밀값을 포함하지 않는 typed error를 반환한다.

```ts
type CredentialPersistenceCode =
  | "CREDENTIAL_ENCRYPTION_NOT_CONFIGURED"
  | "CREDENTIAL_DATABASE_UNAVAILABLE"
  | "CREDENTIAL_WRITE_FAILED";
```

- 암호화 키 누락: 운영자 서버 설정이 필요하다는 메시지
- PostgreSQL 또는 영구 저장소 실패: 입력값을 다시 보내기 전 재시도 안내
- 공급자 검증 실패: 기존 provider error code 유지
- 서버 로그에는 code, app id, owner hash, 단계만 남기고 토큰과 원문을 남기지 않는다.
- 제공자 검증이 실패한 값은 절대 저장하지 않는다.

### 6.3 제공자 검증

- Notion 직접 토큰은 `GET https://api.notion.com/v1/users/me`로 검증하고 `Notion-Version: 2026-03-11`을 사용한다.
- 나머지 직접 토큰 앱은 기존 앱 registry의 provider identity 요청을 유지한다.
- 모든 직접 토큰 앱은 같은 검증 → 암호화 → owner-scoped 저장 계약을 사용한다.

## 7. GitHub·Notion·Slack OAuth 설계

운영 콜백은 다음 값으로 고정한다.

```text
https://dreamwish.co.kr/api/integrations/github/callback
https://dreamwish.co.kr/api/integrations/notion/callback
https://dreamwish.co.kr/api/integrations/slack/callback
```

- 서버는 `APP_URL=https://dreamwish.co.kr`과 provider registry의 callback path로 실제 `redirect_uri`를 생성한다.
- env에 설정한 redirect 값과 계산값이 다르면 연결 버튼 옆에 불일치 경고를 표시한다.
- Client ID와 Client Secret은 운영자 서버 설정이며 일반 사용자 입력창에 표시하지 않는다.
- OAuth callback은 authorization code 교환 후 GitHub `/user`, Notion `/users/me`, Slack `auth.test`로 계정을 검증한다.
- 검증 성공과 `verifiedAt`이 모두 있어야 `연결됨`을 표시한다.
- 토큰은 사용자 `ownerId`별 암호화 저장소에 보관하며 브라우저 localStorage에 넣지 않는다.
- 현재 로그인 사용자에게 저장된 token record가 없는 경우 `서버 준비됨`과 `내 계정 연결됨`을 구분한다.

## 8. 모바일 6자리 페어링 안내와 소스 경로

### 8.1 웹 연결 모달

`Android 연결` 또는 `iPhone 연결` 버튼을 누르면 모달에 다음 순서를 표시한다.

1. 휴대폰에서 `DREAMWISH Companion` 앱을 연다.
2. 앱의 `설정 → DREAMWISH 연결 → 웹 코드 입력`으로 이동한다.
3. 화면의 `페어링 코드` 입력칸에 웹에 표시된 6자리를 입력한다.
4. 앱에서 `연결`을 누른다.
5. 웹에서 기기 이름과 연결 상태를 확인하고 연락처·캘린더 권한을 선택한다.

모달은 `6자리 코드는 웹사이트 입력창이 아니라 휴대폰 컴패니언 앱의 페어링 코드 입력칸에 입력합니다.`를 눈에 띄게 표시한다. challenge 만료 시 새 코드 생성 버튼을 제공하고, 연결 완료 전 모달을 닫아도 서버의 만료 정책을 유지한다.

스토어 배포 앱이 없는 개발 환경에서는 같은 모달의 `개발 빌드 경로 보기`에 아래 경로와 사실을 표시한다.

### 8.2 Android

- Android 소스 루트(현재 참고 모듈): `mobile-companion/android/`
- 6자리 입력 화면: `mobile-companion/android/PairingActivity.kt`
- 서버 pairing 요청과 서명 envelope: `mobile-companion/android/SignedEnvelope.kt`
- 연락처 동기화: `mobile-companion/android/ContactSyncWorker.kt`
- 캘린더 동기화: `mobile-companion/android/CalendarSyncWorker.kt`
- 권한·서비스 선언: `mobile-companion/android/AndroidManifest.xml`

`PairingActivity`는 `challengeId`, 6자리 `code`, `apiBaseUrl`, 기기 공개키를 `/api/devices/pair`로 전송한다. 성공 후 반환된 기기 id를 Android Keystore의 개인키와 연결한다. 사용자가 입력하지 않은 코드를 자동 추측하거나 재사용하지 않는다.

### 8.3 iPhone

- iPhone 소스 루트(현재 참고 모듈): `mobile-companion/ios/`
- 6자리 입력 화면: `mobile-companion/ios/PairingView.swift`
- 서버 pairing 요청과 서명 envelope: `mobile-companion/ios/SignedEnvelope.swift`
- 연락처 동기화: `mobile-companion/ios/ContactSyncService.swift`
- 캘린더 동기화: `mobile-companion/ios/CalendarSyncService.swift`
- 공유 확장 입력: `mobile-companion/ios/ShareViewController.swift`
- 권한 문구: `mobile-companion/ios/Info.plist`

`PairingView`는 `설정 → DREAMWISH 연결 → 웹 코드 입력` 화면을 제공하고 숫자 6자리만 허용한다. 성공 후 개인키는 Keychain/Secure Enclave 가능한 범위에 보관한다. iPhone이 다른 앱 알림을 자동 수집한다고 안내하지 않는다.

### 8.4 배포 경계

저장소에는 페어링 입력 화면과 네트워크 계약의 참조 구현, 개발 경로, 빌드 안내를 제공한다. 실제 설치 가능한 앱 서명에는 사용자 소유 Android application id, Apple bundle id, 인증서와 provisioning profile이 필요하다. 이 값이 없으면 웹에서 `앱 설치 완료`나 `스토어 사용 가능`으로 표시하지 않는다.

## 9. Gmail 대화 목록 설계

### 9.1 읽기와 동기화 API 분리

- `GET /api/business/messages?provider=gmail`은 연결 상태와 저장된 대화만 읽는다.
- `POST /api/business/messages/sync`는 provider를 받아 실제 공급자 동기화를 실행한다.
- 동기화 응답은 `status`, `readCount`, `normalizedCount`, `message`, `ranAt`과 최신 대화를 반환한다.
- 인증 만료·scope 부족은 재연결 오류로, 공급자 429·5xx는 일시 오류로 구분한다.
- 기존 `GET ...&sync=1`은 호환 기간 동안 새 sync service를 호출하되 UI는 새 POST 경로를 사용한다.

### 9.2 최초 자동 동기화

1. 비즈니스 Gmail 탭이 cached conversation과 연결 상태를 조회한다.
2. `connected`이고 대화가 0개이며 이번 화면 세션에서 자동 동기화를 시도하지 않았다면 최근 30일·최대 50개를 한 번 동기화한다.
3. 동기화 성공 후 최신 대화를 다시 표시한다.
4. 이후 화면 진입은 캐시를 즉시 표시하고 사용자가 `동기화`를 누를 때만 갱신한다.
5. 자동 동기화 실패 후 반복 요청하지 않고 오류와 `다시 시도`를 표시한다.

### 9.3 Gmail 전용 토큰과 스레드

- 동기화는 `getActiveAccessToken(ownerId, "google", "gmail")`을 사용한다.
- Gmail token에 `gmail.readonly` scope가 없으면 재연결을 요구한다.
- 상세 메시지를 모두 가져온 뒤 `threadId`로 그룹화하고 thread별 전체 `messageIds`를 한 번에 upsert한다.
- 대화는 각 스레드의 최신 메시지 시각으로 정렬하며 본문은 시간순으로 표시한다.
- 단독 메시지는 유실하지 않고 별도 대화로 유지한다.
- 답장 성공 후 해당 Gmail thread를 우선 다시 동기화하고 목록을 갱신한다.

### 9.4 화면 상태

- `연결됨`, `동기화 중`, `마지막 동기화`, `재연결 필요`, `일시 오류`를 구분한다.
- 빈 상태는 `연결했지만 아직 동기화하지 않음`, `최근 30일 메일 없음`, `동기화 실패`로 구분한다.
- 공급자 오류가 있을 때 단순히 `동기화된 대화가 없습니다`만 표시하지 않는다.
- 저장된 대화가 있으면 새 동기화가 실패해도 기존 대화는 계속 볼 수 있다.

## 10. 보안과 사용자 격리

- 저장공간, 자동화 credential, OAuth token, Gmail message와 thread는 모두 `ownerId`로 필터링한다.
- API 입력의 owner id를 신뢰하지 않고 인증 세션의 owner를 사용한다.
- 다른 사용자의 파일 크기, 계정 label, 연결 상태, 메시지 존재 여부를 노출하지 않는다.
- 토큰 원문·암호문·IV·auth tag는 클라이언트 응답에 포함하지 않는다.
- 모바일 challenge는 짧은 만료시간과 1회 사용을 유지한다.
- 기기 연결 성공 전 연락처·캘린더 sync API를 허용하지 않는다.

## 11. 오류 처리

- 저장공간 측정 실패: 이전 수치를 새 사용자 값처럼 표시하지 않고 재시도 제공
- 암호화 키 누락: `CREDENTIAL_ENCRYPTION_NOT_CONFIGURED`
- credential DB 실패: `CREDENTIAL_DATABASE_UNAVAILABLE`
- OAuth redirect 불일치: 기대 URI를 복사할 수 있는 운영자 경고
- 모바일 코드 만료: 새 6자리 코드 생성
- 모바일 코드 오류: 남은 횟수를 노출하지 않고 새 코드 요청 안내
- Gmail scope 부족: Gmail 읽기 권한으로 재연결
- Gmail API 429·5xx·timeout: 기존 캐시 유지와 다시 시도
- Gmail 최근 데이터 없음: 오류가 아닌 명확한 빈 상태

## 12. 테스트

### 12.1 계정 저장공간

- 다른 owner의 파일·메모리·지식·채팅 크기가 합계에 섞이지 않는다.
- 신규 owner는 `0 B`다.
- API가 browser origin quota를 반환하지 않는다.
- 비인증 요청을 거부한다.

### 12.2 직접 토큰 저장

- 운영 환경에서 자동화 전용 키가 없어도 `INTEGRATION_TOKEN_ENCRYPTION_KEY`로 검증된 credential을 저장·복호화한다.
- 1~3번 키가 모두 없으면 typed error로 fail closed한다.
- integration 키로 저장한 뒤 자동화 전용 키를 추가해도 `keyId`에 따라 기존 credential을 복호화한다.
- provider 검증 실패 값은 저장하지 않는다.
- 직접 토큰 앱 전체가 검증기와 공통 저장 계약을 가진다.
- 저장 응답에 secret, ciphertext, iv, auth tag가 없다.

### 12.3 OAuth

- GitHub·Notion·Slack 기대 callback이 운영 URI와 정확히 일치한다.
- callback token 검증 실패 시 연결됨으로 저장하지 않는다.
- provider 준비 상태와 사용자 연결 상태가 구분된다.
- OAuth token이 owner별로 격리된다.

### 12.4 모바일

- Android·iPhone 연결 모달이 휴대폰 앱의 코드 입력 메뉴를 안내한다.
- 두 모달 모두 `웹이 아닌 휴대폰 앱에 입력` 문구를 표시한다.
- Android `PairingActivity`와 iOS `PairingView`가 숫자 6자리만 허용한다.
- 만료·재사용 challenge가 거부된다.
- 잘못된 owner의 기기 상태를 조회하지 못한다.

### 12.5 Gmail

- 연결됨·캐시 없음 상태에서 최초 자동 동기화를 정확히 한 번 실행한다.
- cached conversation이 있으면 화면 진입만으로 다시 동기화하지 않는다.
- Gmail sync가 Gmail service token만 선택한다.
- sync 실패 결과가 UI에 전달되고 기존 캐시는 유지된다.
- 같은 thread의 여러 message id가 덮어써지지 않고 한 대화로 묶인다.
- 답장 성공 후 해당 thread가 갱신된다.
- 다른 owner의 Gmail message와 thread를 읽지 않는다.

### 12.6 전체 회귀

- `npm.cmd test`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- 사이드바 Upgrade 버튼이 `내 저장공간` 바로 위에 유지된다.
- 기존 AI Chat, Memory, Files, CRM, OAuth, Polar 기능이 계속 동작한다.

## 13. 배포

- 코드 변경만으로 Railway 변수 편집을 가장하지 않는다.
- Railway에 `INTEGRATION_TOKEN_ENCRYPTION_KEY` 또는 `AUTOMATION_CREDENTIAL_ENCRYPTION_KEY` 중 하나 이상이 있는지 배포 체크리스트에서 확인한다.
- 환경 변수 변경 후 재배포가 필요함을 문서화한다.
- 기존 OAuth token 암호화 형식은 변경하지 않는다.
- 구현과 검증이 끝난 뒤 사용자 소유 미추적 파일을 제외하고 main에 커밋·푸시한다.
