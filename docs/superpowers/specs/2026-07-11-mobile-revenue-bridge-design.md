# Cross-Platform Mobile Revenue Bridge Design

## Objective

Collect bank transaction signals from Android and iPhone without claiming capabilities the platforms do not provide. Convert signals into provisional Business Hub revenue entries, require confirmation, and leave a future integration boundary for an approved Korean Open Banking provider.

## Platform strategy

### Android

A native companion app uses `NotificationListenerService` only after explicit notification-access approval. The user chooses allowed bank/payment apps. The listener extracts the minimum package name, notification timestamp, title, and text needed for local parsing. Non-allowlisted notifications never leave the device.

### iPhone

An ordinary iOS app cannot automatically read another bank app’s push notifications. The companion therefore supports:

- Share Extension import of a notification screenshot or copied transaction text;
- Gmail-based bank transaction alert ingestion through the verified Gmail connector;
- manual/CSV transaction import;
- a future approved Open Banking provider adapter.

The UI clearly labels iPhone collection as share/email/import rather than automatic bank-push capture.

## Companion application

Create a bare React Native workspace with a Kotlin Android notification-listener module and a Swift iOS Share Extension. Expo Go is not sufficient for these native capabilities. The companion pairs to one signed-in Business Hub owner using a short-lived QR challenge. Pairing creates a revocable device public key; no Firebase password or OAuth provider token is copied to the phone.

## Secure ingestion

The device builds a signed envelope containing device id, monotonic sequence, event id, platform, source app, captured timestamp, locally redacted text, parser version, and ciphertext payload. The Next.js ingestion route verifies owner/device pairing, signature, timestamp window, replay/idempotency key, payload size, and rate limit before storing an encrypted raw event.

## Parsing and reconciliation

Bank-specific parsers run locally where possible and return amount, direction, account hint, counterparty hint, balance hint, and confidence. The server stores a provisional revenue candidate with evidence. The user confirms income/expense, business/personal classification, customer/deal association, tax/currency, and duplicate handling. Confirmed entries enter revenue reports; rejected personal transactions are deleted according to retention policy.

Bank push messages are hints, not bank statements. Duplicate alerts, canceled transactions, delayed pushes, and ambiguous transfers remain unresolved until reconciliation.

## Open Banking boundary

Define a provider-neutral adapter for consent, account discovery, transaction sync, refresh, and revocation. Production use is disabled until an approved financial institution or intermediary contract and required consent/compliance controls exist. No screen-scraping, credential collection, or bank-password storage is permitted.

## Privacy and controls

Users can pause collection, choose allowed apps/accounts, inspect every captured event, correct parser results, revoke a device, delete raw payloads, export confirmed revenue, and configure retention. Sensitive notification content is never sent to an AI provider by default. Audit events cover pairing, ingestion, parsing, confirmation, deletion, export, and reconciliation.

## Testing

Tests cover Android allowlisting and permission state, iOS share import, signed pairing, replay rejection, parser fixtures, duplicate detection, personal-transaction rejection, owner/device isolation, provisional-to-confirmed transitions, retention deletion, and Open Banking adapter disabled-by-default behavior.
