# Multi-Provider AI Chat and Total Memory Design

## Goal

DREAMWISH connects the free-tier AI providers already represented in the codebase, lets the user choose a configured provider per chat, permanently preserves every conversation, builds a traceable knowledge graph from the full history, and mirrors the data into the user's browser for local-first access.

## Scope

- Providers: Gemini, OpenRouter, Groq, Hugging Face, and Cloudflare AI.
- Provider credentials and model identifiers remain server-side environment variables.
- The chat UI exposes only providers that are configured and healthy; it never returns API keys or secret headers.
- Every user and assistant message is retained as immutable source history.
- Derived memories and graph relationships remain after a chat is hidden or removed from the visible session list.
- Railway persistent storage is the authoritative data store.
- Browser IndexedDB is an automatic local replica, not the authoritative store.
- Users can export the complete archive as JSON and Markdown.
- The AI Chat "recommended connections" panel is removed.

## Architecture

### Provider registry and selection

The server builds a public provider catalog from its environment configuration. Each catalog entry contains only the provider ID, display name, configured/available state, and selected model name. Chat requests accept a provider ID from this catalog. The server validates that selection and constructs the corresponding provider adapter with credentials read directly from `process.env`.

Provider selection is explicit. A request failure does not silently fall back to another provider because that would change the user's chosen model and potentially send data to a provider they did not select. The UI reports configuration, authentication, quota, rate-limit, and provider-availability errors and prompts the user to select another configured model.

The chosen provider is stored on the chat session so reopening a session restores the same selection. A new session starts with the first configured provider, preferring Gemini when available.

### Authoritative conversation archive

Every user and assistant message is appended to the authoritative chat archive on the Railway persistent volume. Records include stable IDs, timestamps, session ID, role, content, chosen provider, model, and optional answer metadata.

Visible deletion is implemented as archival. It removes the session from the active chat list but does not delete source messages, derived memories, entities, or relationships. No user-facing operation physically deletes permanent memory in this feature.

Storage paths are rooted under a configurable `DATA_DIR`. Railway sets `DATA_DIR` to its mounted volume. Local development defaults to the existing project-local data directory.

### Total-memory capture

After each completed exchange, the system stores a source-linked memory record even when the exchange has low inferred importance. This guarantees full coverage rather than saving only selected facts.

Memory processing has two layers:

1. A lossless source record containing the complete user message and assistant response.
2. Structured facts extracted from the exchange, including people, preferences, goals, projects, events, ideas, decisions, documents, and general knowledge.

Each structured item retains the source session and message IDs. Extraction failure never blocks chat or removes the lossless source record. Failed extraction is recorded as pending and can be retried.

### Knowledge graph

The graph contains typed entities and typed relationships. Entity identity uses normalized type and name, while aliases preserve original wording. Relationships include source IDs, creation and update timestamps, confidence, and observation count.

Repeated observations merge into the same entity or relationship while adding provenance. Conflicting facts are not overwritten silently; both observations remain available with their sources and timestamps.

The Knowledge Network view provides search, entity-type filtering, relationship filtering, neighbor expansion, and a visual connection map. Selecting a node or edge reveals the source memories and originating chat records.

### Memory retrieval for AI

Before sending a new prompt to the selected provider, the server retrieves a bounded context set from memories and graph neighbors. Ranking combines textual relevance, entity overlap, recency, and repeated observation. The context payload contains source labels and is separated from the user's current message in the system prompt.

The full archive is not sent on every request. This keeps requests within provider context limits and limits unnecessary disclosure while still allowing the system to recall relevant history.

### Browser-local replica

After initial load and after successful mutations, the client synchronizes chat sessions, messages, memories, entities, and relationships into versioned IndexedDB stores. Synchronization is incremental using a server revision/cursor and is safe to repeat.

Railway remains authoritative. IndexedDB supports faster reloads and gives the user's current browser a local copy, but clearing browser data removes that replica. The UI displays last synchronized time, pending state, and synchronization errors.

### Export

An authenticated export endpoint produces a complete JSON archive and a Markdown representation containing chat history, memories, entities, relationships, and provenance. The browser downloads the generated archive to a user-selected location through normal browser download behavior.

## User Interface

- Add a model selector to AI Chat populated from the server's public provider catalog.
- Restore the provider saved on the active session.
- Display provider configuration/health without exposing credentials.
- Display permanent-memory capture and local-replica synchronization status.
- Remove the recommended-connections area from AI Chat.
- Keep graph exploration in the Knowledge Network view.
- Add an export action in settings or the memory area for JSON and Markdown backups.

## Data Safety and Privacy

- Secrets never enter client bundles, API responses, logs, chat records, memory records, exports, or IndexedDB.
- All persistence and export APIs require the existing authenticated user context and scope records by account.
- Because total-memory mode intentionally retains all conversations, the UI must clearly state that hiding a chat does not erase its permanent memory.
- Atomic writes or a transactional repository prevent partially written archives.
- Exports contain sensitive personal history and require an explicit user action.

## Error Handling

- Reject unknown or unconfigured provider IDs before calling an external API.
- Return stable client error codes for missing configuration, authentication failure, quota/rate limits, provider downtime, and invalid responses.
- Persist the user message before provider execution; mark an interrupted exchange so it can be retried without losing history.
- Preserve source history when memory extraction or graph updates fail and queue the derived work for retry.
- Retain the last valid IndexedDB snapshot if synchronization fails.

## Testing

- Verify the public provider catalog exposes no credentials and includes only server-configured providers.
- Verify the selected provider is honored and persisted per session without automatic fallback.
- Verify all messages are appended to the authoritative archive with provider/model metadata.
- Verify visible session deletion archives rather than physically deleting source history or derived memory.
- Verify every completed exchange creates a lossless memory record regardless of importance.
- Verify entity/relationship merging preserves provenance and conflicting observations.
- Verify relevant memory and graph context is bounded and injected into later AI requests.
- Verify IndexedDB synchronization is incremental, repeatable, and keeps the last valid snapshot on failure.
- Verify JSON and Markdown exports contain the complete archive and exclude credentials.
- Verify AI Chat no longer renders recommended connections.

## Success Criteria

The user can select any configured provider in AI Chat, continue a session with that provider, and see clear errors without silent provider switching. Every exchange survives visible chat deletion, becomes searchable permanent memory, contributes traceable knowledge-graph data, and is mirrored to the current browser. The user can export the entire retained history while all provider secrets remain server-only.
