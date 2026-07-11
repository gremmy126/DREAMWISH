# AI Chat Context Workspace and Storage Precision Design

## Goal

Keep real AI streaming answers working while adding a query-synchronized knowledge workspace to the right side of AI Chat and displaying local storage usage to exactly two decimal places.

## Scope and delivery order

This is phase 1 of the supplied Personal AI OS prompt. It covers AI answer generation, the chat-side knowledge network and related context search, and storage precision. Later phases will be designed and implemented independently in this order: Memory, Security, then CRM. The broad prompt's unrelated viewers, model-comparison features, memory taxonomy migration, security architecture changes, and CRM expansion are not bundled into this phase.

## Architecture and data flow

The existing `/api/ai/chat/stream` flow remains responsible for generating the answer from the configured AI provider. Sending a message records the submitted, project-aware query in `lastQuery` and begins streaming the answer immediately.

In parallel, the right-side `ConnectedContextWorkspace` receives only the last submitted query. It calls the authenticated `/api/local/context/query` endpoint, which already runs local hybrid document search, owner-scoped conversation search, connection suggestions, conditional web search, and knowledge-network construction. Draft input must not trigger searches on every keystroke. Loading or switching an existing chat uses its latest user message as the context query.

The two operations are failure-isolated: context search errors clear or mark the side panel without interrupting the AI response stream, and an AI provider error does not discard already found context. External web search remains conditional on explicit web/current-information intent; ordinary questions remain local-first.

## User interface

The current three-column desktop layout is retained: sessions on the left, AI conversation in the center, and connected context on the right. The right column renders the existing knowledge network, conversation matches, related documents, projects, notes, files, suggested links, and selected-result preview. Empty and loading states use the existing context translations and design system.

The panel appears as soon as a submitted question becomes the current context query, so results can load while the answer streams. URLs open in a new tab with `noopener noreferrer`. The panel does not execute external actions or write connections without the existing explicit approval flow.

## Storage percentage

`calculateStoragePercent` clamps the numeric percentage to the range 0 through 100 and always formats its label with `toFixed(2)`: `0.00%`, `12.34%`, and `100.00%`. The progress bar retains a minimum one-percent visual width for non-zero values below one percent, while the label remains numerically accurate to two decimals.

## Security and privacy

The right panel reuses the authenticated context API and owner-scoped conversation repository. It never trusts a client-supplied owner ID, never exposes another user's chat history, and does not send local context to web search unless the query matches the existing explicit web-search policy. Search failures remain sanitized in API responses.

## Testing and verification

Tests are written before implementation and prove that:

- `ChatView` renders `ConnectedContextWorkspace` in the third column;
- only `lastQuery`, not draft `input`, drives the context workspace;
- message submission and loaded sessions update `lastQuery`;
- the existing streaming AI endpoint remains wired;
- storage labels use exactly two decimals for zero, fractional, ordinary, and over-quota usage;
- sub-one-percent non-zero usage retains a visible progress width;
- the context API continues to require authenticated owner context.

Completion requires the full test suite, TypeScript typecheck, lint, production build, and a local browser check of the three-column chat view and storage label.
