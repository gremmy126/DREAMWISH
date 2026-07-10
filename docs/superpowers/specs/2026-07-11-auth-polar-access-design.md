# Authenticated Paid Access and Polar Entitlement Design

## Goal

Only the configured administrator may use DREAMWISH without payment. Every other user must authenticate through Firebase and have a server-verified Polar entitlement before any protected application API can be used.

## Security invariants

- Request-body email, localStorage, and client-supplied headers never establish identity or administrator status.
- A Firebase ID token is required at login/session refresh and is verified server-side.
- The server issues a signed `HttpOnly`, `Secure` in production, `SameSite=Lax` session cookie with a short expiry.
- All application APIs are denied with `401` without a valid session and `402` without paid/admin access.
- Only authentication, checkout creation/verification, OAuth callbacks, and the Polar webhook are public exceptions; each exception enforces its own binding or signature.
- The Polar webhook fails closed when `POLAR_WEBHOOK_SECRET` is missing or invalid.
- `checkout.created` and other creation events never grant access.
- Only explicit paid/active events grant entitlement; refunded/revoked/past-due events revoke it.
- Webhook event IDs are idempotent and timestamps outside the allowed window are rejected.
- Checkout customer identity is derived from the verified session, never the request body.

## Authentication flow

The client authenticates with Firebase and sends the ID token to `/api/auth/login` or `/api/auth/session`. Firebase lookup returns the canonical UID, email, display name, and providers. The account repository resolves administrator and entitlement state. The response sets a signed session cookie containing UID, normalized email, role, entitlement state, issued-at, and expiry.

Session refresh repeats Firebase verification and reads current entitlement, ensuring a Polar webhook change is reflected without trusting stale localStorage. Logout clears the server cookie and Firebase client session.

## API enforcement

Next middleware verifies the signed cookie before protected `/api/**` handlers execute. It returns stable JSON errors: `401 AUTH_REQUIRED` for missing/invalid sessions and `402 PAYMENT_REQUIRED` for authenticated users without active entitlement. `/api/admin/**` additionally requires the signed administrator role; the old client header bypass is removed.

The session claim is deliberately short-lived. Payment success refreshes the session via the verified Firebase user. Later phases will add workspace IDs to individual repositories before expanding integrations and CRM.

## Polar flow

Checkout creation requires an authenticated unpaid user. The server supplies `customer_email`, `customer_name`, `external_customer_id` (Firebase UID), customer IP, and metadata. The current product ID remains the only accepted product.

Checkout verification requires the same authenticated user and checks the returned external customer ID/email and product ID before changing entitlement. The webhook is authoritative and uses Standard Webhooks signature headers, a bounded timestamp, explicit event allowlists, event-ID idempotency, product validation, and user identity from `customer.external_id` or trusted metadata.

Entitlements use states `inactive`, `active`, `past_due`, `revoked`, and `refunded` instead of a permanent boolean. Existing account records migrate safely: administrators remain active; existing paid users remain active until a later Polar event changes their state.

## Compatibility

- Firebase email/password and Google login continue working.
- Unpaid authenticated users can reach pricing and create a Polar checkout.
- The administrator email remains the only free bypass.
- OAuth callbacks and Polar webhook delivery are not blocked by general API middleware.
- Existing UI receives the same `AccessState` fields while gaining entitlement metadata.

## Testing

- Token/session unit tests cover valid, expired, tampered, admin, paid, and unpaid claims.
- Route contract tests prove body-email and admin-header spoofing fail.
- Middleware policy tests cover public exceptions and protected API status codes.
- Polar tests cover identity-bound payloads, explicit grant/revoke events, missing/invalid secret, stale signatures, duplicate event IDs, wrong product, and legitimate paid access.
- Full tests, lint, typecheck, and production build must pass before commit and push.

