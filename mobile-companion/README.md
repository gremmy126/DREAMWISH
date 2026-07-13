# DREAMWISH Mobile Companion 참조 모듈

이 폴더는 Android와 iPhone에서 DREAMWISH 계정에 휴대폰을 페어링하고, 사용자가 허용한 연락처·캘린더·매출 신호를 동기화하기 위한 네이티브 참조 모듈입니다. 스토어에서 설치 가능한 완성 앱이 아닙니다. 실제 배포에는 Android application ID, Apple bundle ID, 앱 아이콘, Gradle/Xcode 프로젝트, 서버 base URL, 사용자 소유 서명 인증서와 provisioning profile이 필요합니다.

## 6자리 코드 입력 위치

1. 웹의 비즈니스 페이지에서 `Android 연결` 또는 `iPhone 연결`을 눌러 6자리 코드를 만듭니다.
2. 휴대폰에서 DREAMWISH Companion을 열고 `설정 → DREAMWISH 연결 → 웹 코드 입력`으로 이동합니다.
3. 웹에 표시된 숫자 6자리를 휴대폰 앱의 `페어링 코드` 입력칸에 입력합니다.
4. 휴대폰에서 `연결`을 누른 후 웹에서 연결된 기기와 권한을 확인합니다.

코드는 웹사이트 입력칸에 쓰는 값이 아닙니다. Android 구현 진입점은 `mobile-companion/android/PairingActivity.kt`, iPhone 구현 진입점은 `mobile-companion/ios/PairingView.swift`입니다.

## Android

- `PairingActivity.kt`: 6자리 코드 검증, `/api/devices/pair` 호출, 기기 비밀값 보관
- `SignedEnvelope.kt`: Android Keystore 암호화 보관과 `Device <secret>` 동기화 요청
- `ContactSyncWorker.kt`: 사용자가 연락처 권한을 허용한 경우 연락처 후보 업로드
- `CalendarSyncWorker.kt`: 사용자가 캘린더 권한을 허용한 경우 일정 후보 업로드
- `AndroidManifest.xml`: 인터넷, 연락처, 캘린더, 선택 앱 알림 권한 선언

Android can collect selected bank/payment notifications through `NotificationListenerService` only after the user grants notification access. The user must explicitly choose `allowedPackages`; notifications from every other app are ignored on-device. SMS and call history are not requested.

## iPhone

- `PairingView.swift`: SwiftUI 6자리 입력 화면과 `/api/devices/pair` 호출
- `SignedEnvelope.swift`: Keychain 보관과 단조 증가 sequence를 포함한 기기 동기화 요청
- `ContactSyncService.swift`: 사용자 승인 후 연락처 후보 생성
- `CalendarSyncService.swift`: 사용자 승인 후 일정 후보 생성
- `ShareViewController.swift`: 사용자가 명시적으로 공유한 매출 텍스트 수집

iPhone apps cannot automatically read other apps' notifications. iOS therefore uses the Share Extension for text explicitly shared by the user, plus manual/CSV import or verified Gmail transaction alerts. The UI must never describe iPhone collection as automatic bank-push access.

## 서버 계약과 보안

- 페어링: `POST /api/devices/pair` with `challengeId`, `code`, `platform`, `name`
- 동기화: `POST /api/devices/{deviceId}/sync` with `Authorization: Device <deviceSecret>` and a monotonically increasing `sequence`
- 페어링 코드는 짧은 만료시간과 1회 사용 정책을 따릅니다.
- 기기 비밀값은 Android Keystore 또는 iOS Keychain 밖으로 노출하지 않습니다.
- 연락처와 캘린더는 사용자가 OS 권한을 허용한 뒤에만 읽습니다.
- 모든 매출 신호는 임시 후보이며 웹에서 승인되기 전에는 확정 매출이 아닙니다.
- Open Banking은 승인된 국내 제공자 계약과 동의 흐름이 구성되기 전까지 비활성화됩니다.
