# `D:\DREAMWISH-Companion` 완성 설계

## 1. 현재 판정

`D:\DREAMWISH-Companion`은 현재 React Native 0.86 기본 앱 위에 pairing 화면, device contract, API client, 기본 offline queue가 추가된 상태다. Android NotificationListener, Keystore native module, WorkManager, Firebase Messaging, iOS Keychain/App Group/Share Extension, 실제 revenue review flow가 없어 완성 상태가 아니다.

`D:\gremmy\mobile-companion`에는 이 기능의 더 진행된 구현이 있으므로 이를 참고하되 `D:\DREAMWISH-Companion`을 배포 기준 별도 Git 저장소로 유지한다. 파일을 덮어쓰기 전에 두 구현의 기능·native project 설정·package version을 비교한다.

## 2. 공통 앱 구조

- QR/App/Universal Link pairing
- P-256 key pair와 signed device request
- connection status, permissions, last sync, pending count, disconnect
- encrypted offline queue와 exponential retry
- allowlisted contact/calendar explicit sync
- FCM token registration/rotation/revoke
- pending revenue list, detail, confirm/expense/personal/duplicate/reject actions
- privacy, permission rationale, data deletion

앱은 password, Firebase login token, social OAuth token, integration token, TOTP secret을 받거나 저장하지 않는다.

## 3. Pairing과 Links

- 웹 QR은 `https://dreamwish.co.kr/companion/pair?...` HTTPS link를 사용한다.
- Android App Links와 iOS Universal Links가 앱을 열고 `dreamwish://`를 fallback으로 둔다.
- domain association 파일은 exact package/bundle/team identifiers로 생성한다.
- token은 owner-bound, 10분 만료, one-time이며 로그·clipboard에 남기지 않는다.
- 앱은 P-256 key를 Android Keystore/iOS Keychain에서 생성하고 public key만 등록한다.
- signed envelope는 monotonic sequence, timestamp, body hash, device ID를 포함한다.

## 4. Android

- `NotificationListenerService`는 사용자가 설정에서 고른 package allowlist만 처리한다.
- SMS, 통화 기록, accessibility 권한은 요청하지 않는다.
- 계좌·카드 패턴을 기기에서 마스킹하고 금액, 방향, 상대방 hint, event time, confidence만 queue에 넣는다.
- private key와 queue key는 Android Keystore에서 non-exportable로 관리한다.
- Room/Encrypted file queue와 WorkManager가 network constraint, retry, reboot resume를 처리한다.
- FCM permission, token refresh, signed registration, invalid token revoke를 구현한다.
- notification access가 꺼졌거나 OEM background 제한이 있으면 정확한 설정 화면 action을 제공한다.

## 5. iPhone

iPhone 앱은 다른 앱의 알림을 자동으로 읽을 수 있다고 설명하지 않는다.

- Share Extension이 사용자가 직접 공유한 text만 받는다.
- extension은 size/type을 검사하고 최소 구조화 payload만 App Group에 쓴다.
- main app은 Keychain AES-GCM key로 App Group pending item을 암호화하고 signed upload한다.
- background retry, expiration, duplicate import, empty/oversized rejection을 처리한다.
- Universal Link, FCM/APNs registration, pending revenue deep link를 구현한다.

## 6. 서버와 매출 검토

- 같은 event ID, sequence, body hash 재전송은 idempotent하게 처리하고 replay는 거부한다.
- 수신 이벤트는 즉시 확정 매출에 합산하지 않고 `pending review`로 저장한다.
- 사용자 confirm 또는 명시적으로 신뢰한 고신뢰 source만 매출 KPI에 반영한다.
- correction/cancellation/duplicate 관계를 보존한다.
- push에는 candidate ID와 안전한 deep link만 포함하고 금액·계좌·원문을 넣지 않는다.
- device disconnect 시 public key, push token, outstanding session을 폐기한다.

## 7. 외부 준비와 완료 정의

필수 외부 파일:

- Android `google-services.json`
- iOS `GoogleService-Info.plist`
- Android release keystore와 Play signing 설정
- Apple Team, App Group, APNs, provisioning profile
- 실제 Firebase project와 FCM HTTP v1 server credential

이 값은 저장소에 커밋하지 않는다. 코드가 있어도 다음 증거 없이는 “완료”로 주장하지 않는다.

- Android 실제 기기의 App Link, notification allowlist, offline/reboot retry, FCM
- macOS/Xcode의 iOS build/archive, Universal Link, Share Extension, App Group, push
- 서버의 replay rejection과 disconnect revoke

## 8. 테스트

- TypeScript/Jest: contract canonicalization, redaction, parser, queue, retry
- Android unit/instrumentation: Keystore, link parsing, allowlist, WorkManager, permissions
- iOS XCTest: Keychain, Universal Link, Share Extension, App Group encryption, duplicate
- server integration: signature, sequence, owner isolation, idempotency, revenue status
- build: RN config, typecheck/lint/test, Gradle compile/APK; iOS는 macOS CI
