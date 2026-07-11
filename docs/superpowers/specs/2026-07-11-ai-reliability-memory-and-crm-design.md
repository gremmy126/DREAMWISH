# AI Reliability, Memory Stability, and CRM Design

## Goal

Make the existing Personal AI OS reliable without replacing its current Next.js, local JSON storage, Firebase authentication, design tokens, or i18n architecture. The work covers resilient client API reads, memory-page recovery, configured non-OpenAI AI providers, web-search degradation, and the first production-usable CRM slice.

## Confirmed constraints

- Do not use OpenAI for chat generation.
- Use only configured Gemini, OpenRouter, Groq, Hugging Face, and Cloudflare credentials.
- `PRIVACY_LOCAL_ONLY=true` always disables external AI.
- A configured supported-provider credential counts as intentional external-AI connection when no explicit deny is present.
- Customer, activity, deal, task, insight, and audit data must be owner scoped on the server.
- External actions remain approval-first; CRM may create drafts but must not send email or create remote calendar events automatically.
- Preserve the current UI language system and responsive visual style.

## API response reliability

Client views use `readApiResponse` rather than calling `Response.json()` directly. Parallel dashboard requests are decoded independently, surface a localized error, always leave loading state, and offer retry without crashing the entire view. Project and integration failures do not discard a completed AI answer.

## AI provider runtime

The runtime builds an ordered list from the requested provider followed by every other configured provider. Non-streaming generation tries each provider until one succeeds. Streaming generation may fail over only before emitting the first token, preventing duplicated mixed-provider answers. Final errors contain safe provider names and stable error codes, never keys or raw credentials.

The privacy gate accepts external AI when explicitly enabled or when a supported provider credential is configured and external AI was not explicitly disabled. Explicit local-only or explicit false remains authoritative.

## Web search

Search adapters remain bounded and sanitize URLs/text. Search failure is represented as a degraded result, not an exception that destroys chat generation. When search returns usable context, the answer includes references. When search is unavailable, the selected AI provider gives a clearly labeled general answer without claiming current web verification.

## Memory page

Dashboard and knowledge-note requests are parsed safely and fail independently. Mutations expose busy, failure, and retry state. Existing owner-scoped pending/approved lifecycle semantics remain unchanged.

## CRM architecture

The existing local CRM store is migrated on read to owner-scoped records. Core entities are customers, activities, follow-up tasks, deals, AI insights, and audit events. Every repository method requires `ownerId`; routes derive it from the signed session and never accept ownership from client input.

The first usable UI includes:

- summary metrics and filterable customer list;
- create, edit, soft-delete, and restore-safe persistence;
- customer detail with company/contact/tags/status/importance;
- activity timeline and follow-up task creation/completion;
- deal stage, expected value, probability, and next-contact date;
- deterministic AI-style customer summary, risk, contract probability, recommended next action, and evidence bullets;
- draft-only email/task actions requiring explicit user approval for external execution.

## Error handling and security

All route inputs are normalized and validated. Cross-owner reads and mutations return masked not-found responses. CRM deletes are soft deletes and create audit entries. UI errors do not expose stack traces, provider response bodies, credentials, or customer-sensitive model payloads.

## Verification

Add unit and source-contract tests for empty API responses, privacy decisions, provider ordering/failover, degraded web search, owner isolation, CRM lifecycle, insights, and UI wiring. Finish with the full test suite, TypeScript, lint, and production build.
