# DREAMWISH Mobile Revenue Companion

This folder contains native reference modules for the cross-platform revenue bridge. It is not an Expo Go project because both collection paths require native platform extensions.

## Android

Android can collect selected bank/payment notifications through `NotificationListenerService` only after the user grants notification access. The user must explicitly choose `allowedPackages`; notifications from every other app are ignored on-device. The host app must encrypt and sign each event after device pairing before uploading it to `/api/business/revenue`.

## iPhone

iPhone apps cannot automatically read other apps' notifications. iOS therefore uses the Share Extension for copied transaction text or a shared screenshot, plus manual/CSV import or verified Gmail transaction alerts. The UI must never describe iPhone collection as automatic bank-push access.

## Revenue safety

Every captured signal is provisional. The Business Hub user confirms or rejects the amount before it enters confirmed revenue. Open Banking remains disabled until an approved Korean provider contract and consent flow are configured. Bank passwords and screen scraping are never used.
