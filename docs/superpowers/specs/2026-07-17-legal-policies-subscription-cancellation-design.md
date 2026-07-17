# DREAMWISH legal policies and subscription cancellation design

Date: 2026-07-17
Status: Approved

## Objective

Replace the incomplete and mojibake-affected legal pages with Korean-language documents that reflect DREAMWISH's actual service and data flows, add a refund and cancellation policy, and expose a safe self-service monthly subscription cancellation entry point in Settings.

This implementation is an operational policy draft based on the current product and applicable public legal guidance. It must not claim to replace review by a qualified Korean legal professional.

## Confirmed operator information

- Business name: 드림위시
- Representative: 김동현
- Business registration number: 147-07-03187
- Mail-order business report number: 제 2026-부산사상구-0185
- Business address: 부산광역시 사상구 덕상로 8-37, 202동 2504호
- Telephone: 051-916-1222
- Email: adveryhyeon@gmail.com

These values are defined once and reused by all policy pages.

## Confirmed commercial model

- DREAMWISH is available to individual consumers as well as business users.
- The only paid product is a monthly recurring subscription.
- There is no free plan or free trial.
- Paid access begins immediately after checkout succeeds.
- Cancellation stops future renewal and does not, by itself, refund the already-paid billing period.

## Policy architecture

Create a shared policy layout and shared operator metadata. Preserve the existing site colors, typography, card treatment, and overall visual language.

Routes:

- `/privacy`: 개인정보 처리방침
- `/terms`: 서비스 이용약관
- `/refunds`: 환불 및 구독 해지 정책
- `/cookies`: 쿠키 정책, rewritten to remove mojibake and match the implemented consent system

Each route includes:

- Korean metadata and canonical URL
- effective and last-updated date
- readable headings and anchor-friendly sections
- shared policy navigation
- operator and contact details where relevant
- links to related policies

The global footer and sitemap include all four policy routes.

## Privacy policy content

The privacy policy describes the product as implemented, including:

- account and authentication information handled through Firebase
- billing entitlement and payment-related identifiers handled through Polar
- user-created chat, memory, file, project, CRM, ERP, automation, audit, and integration data
- OAuth connection identifiers, account labels, granted scopes, token lifecycle, and encrypted credential storage
- technical logs, security records, device/browser information, IP address where received, and service diagnostics
- optional Google Analytics, Google Tag Manager, Google Ads, and AdSense processing controlled through Consent Mode
- AI inputs and outputs sent to the configured provider, including Gemini, OpenRouter, Groq, Hugging Face, Cloudflare, and explicitly connected OpenAI automation actions where applicable
- user-directed transfers to connected services such as Google, Microsoft, Slack, GitHub, Notion, Discord, Dropbox, and other integration adapters
- processing purposes, legal basis, retention and deletion principles, processors/overseas recipients, data subject rights, minors, safeguards, cookies, policy changes, and the privacy contact

Secrets, access tokens, refresh tokens, API keys, and passwords are never displayed in the policy UI. The policy explains that connection secrets are encrypted or otherwise protected and retrieved only when required for execution.

Where exact third-party retention periods or processing regions depend on the user's selected provider or provider contract, the document states that dependency and links the processing to the provider's applicable policy rather than inventing a fixed value.

## Terms content

The terms cover:

- purpose, definitions, formation, eligibility, and account security
- service features and changes
- AI limitations and the user's obligation to verify consequential output
- user content ownership and the limited license required to provide the service
- connected accounts, OAuth scopes, automation actions, previews, approvals, and high-risk execution responsibilities
- prohibited conduct and third-party rights
- monthly billing, automatic renewal, payment failure, cancellation, and access at period end
- reference to the refund and cancellation policy
- suspension and termination
- service interruptions, maintenance, and reasonable limits of liability subject to mandatory law
- notices, governing law, dispute resolution, and operator details

The terms do not waive liability or statutory consumer rights in a way that would be invalid under mandatory law.

## Refund and cancellation policy

The policy uses the strictest business-friendly wording that remains compatible with consumer law:

- DREAMWISH does not offer discretionary refunds merely because a user changed their mind or did not use the service.
- Checkout immediately starts access to the digital service.
- Subscription cancellation prevents the next renewal and normally leaves access active through the paid period.
- Cancellation is not the same as a refund.
- Explicit refund cases include duplicate or erroneous charges, material platform error, material non-provision, or service delivery that materially differs from the contract.
- Statutory withdrawal, termination, and refund rights under mandatory law are not excluded, even where the company's voluntary policy would otherwise deny a refund.
- Approved refunds are returned through the original payment method, with the company initiating the required action within the applicable legal period and the card/payment provider possibly requiring additional processing time.
- Requests use the published email and include account email, payment date, amount, reason, and evidence where relevant.

The public copy must not state that digital services are categorically non-refundable or that payment alone counts as use. Those statements would conflict with the service's availability to individual consumers and current consumer guidance.

## Subscription cancellation experience

Add a `구독 및 결제` card to Settings.

### Display

- current billing status
- current paid-period end date or next renewal date when known
- scheduled cancellation state when known
- links to the refund/cancellation policy and billing management

### Active subscription

- show a visually distinct but consistent `구독 해지` button
- button has at least a 44px touch target
- clicking opens an accessible confirmation dialog
- dialog explains that future renewal stops, access continues to the period end, and cancellation does not automatically refund the current charge
- confirmation creates an authenticated Polar customer session and redirects to Polar's hosted customer portal for the final action
- loading state prevents duplicate requests; API failures are shown inline without losing page state

### Scheduled or completed cancellation

- scheduled cancellation shows `해지 예정` and the expected access end date
- completed cancellation shows the ended state and does not present an active cancellation action
- users may manage or reverse a scheduled cancellation through Polar before the period ends when Polar permits it

### Billing state model

Extend the local entitlement projection only as needed to represent Polar state accurately, including a cancel-at-period-end flag and relevant cancellation/end timestamps. Polar webhook events remain the source for durable local entitlement updates. Existing status values continue to gate paid access; scheduling cancellation must not remove access before the paid period ends.

The portal return URL points back to Settings. Returning to Settings refreshes billing status.

## Error handling and security

- Billing portal sessions require the authenticated owner context.
- No card data is collected or stored by DREAMWISH.
- Portal URLs are returned only to the authenticated requesting user.
- Cancellation actions are not inferred from client state; authoritative state comes from Polar events.
- Buttons handle loading, success/redirect, stale state, and service errors.
- Policy and Settings pages remain usable on mobile layouts.

## Testing and verification

Add or update tests for:

- policy routes, Korean headings, operator details, and cross-links
- absence of placeholder or mojibake content in the rewritten policy files
- sitemap and global footer inclusion of `/refunds`
- billing event normalization and persistence of scheduled cancellation fields
- Settings subscription-state rendering and portal request behavior where the existing test stack supports component tests
- portal return URL and API error behavior

Before completion run:

- targeted tests
- full test suite
- lint
- typecheck
- production build
- `git status`

Only commit and push to `main` after all required verification succeeds.

