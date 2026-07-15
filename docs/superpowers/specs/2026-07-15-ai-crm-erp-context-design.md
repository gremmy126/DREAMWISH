# AI Chat CRM and ERP Context Design

## Goal

Upgrade AI Chat so an authenticated user can ask questions about their CRM relationships and live ERP business data, receive source-aware answers, and perform a small allowlisted set of business actions through an explicit preview-and-approval flow. The same design also upgrades conversation memory so important, safe, high-confidence information is saved immediately while sensitive, ambiguous, inferred, or live financial data is not silently retained.

This design depends on:

- [CRM Dashboard and Contacts Design](./2026-07-15-crm-dashboard-contacts-design.md) for owner-scoped contacts and manually approved CRM-to-ERP mappings.
- [Business ERP Dashboard Design](./2026-07-15-business-erp-dashboard-design.md) for normalized ERP connections and read-only dashboard data.

The Business ERP dashboard remains read-only. This design adds a separate, opt-in `draft_write` provider capability for narrowly scoped AI-created ERP drafts; it does not turn the dashboard connector into a general write channel.

## Scope

In scope:

- Build one shared personal-context orchestrator used by both normal and streaming AI Chat routes.
- Include recent conversation, an older-conversation summary, relevant approved memories, a resolved CRM contact, a manually approved ERP mapping, live bounded ERP customer data, and relevant knowledge documents.
- Keep every lookup owner-scoped and preserve source/provenance metadata.
- Resolve ambiguous customer references by asking the user rather than guessing.
- Answer read-only questions immediately.
- Save important safe information immediately when it meets the approved importance, confidence, category, and sensitivity rules.
- Keep ambiguous or lower-confidence information as a visible pending memory candidate.
- Support preview, approval, execution, audit, and idempotency for allowlisted CRM changes and opt-in ERP draft creation.
- Show sources, live-data freshness, memory-save results, and proposed actions in AI Chat.

Out of scope for this increment:

- Automatically approving CRM-to-ERP customer mappings.
- Storing ERP invoice totals, receivables, inventory, payments, or other live financial state as long-term memory.
- Letting the model directly submit invoices, post payments, cancel records, delete ERP records, adjust inventory, or perform accounting entries.
- Autonomous actions without an authenticated user approval.
- General browser automation or arbitrary API/tool execution.
- Installing or selecting a deep-research GitHub worker, crawling the public web, or adding long-running web/video research. That work can later use the source panel and reporting contracts defined here, but is a separate approved design and implementation increment.
- Sending data to a provider that is not already selected and permitted by the user or workspace policy.

## Preserved Follow-up Requirements

The user's earlier Docker, ERPNext/Dolibarr, Ollama installation buttons and long-running free research report with links and videos are not discarded. They require separate designs because a hosted DREAMWISH server cannot reach Docker services at the user's `localhost` without a trusted local gateway, and installation has operating-system and privilege consequences. The current provider boundary starts with ERPNext to match the selected ERP dashboard reference and leaves a future Dolibarr adapter possible. No implementation plan may claim those installer or deep-research requirements complete from this CRM/ERP context work alone.

## Design Principles

1. **Owner scope first.** Resolve the authenticated owner before reading a conversation, memory, CRM record, mapping, ERP connection, document, or action.
2. **Source systems keep authority.** CRM owns relationship data; ERP owns operational and financial truth; memory owns stable user-approved facts and preferences.
3. **No identity guesses.** Similar names generate choices, not an automatic customer mapping.
4. **Read before write.** Read and summarize immediately; present an exact mutation preview before changing state.
5. **Fresh state at execution.** Approval authorizes a bounded proposal, not an unrestricted future command.
6. **Safe immediate memory.** Important information should not be lost, but sensitivity and uncertainty gates run before auto-approval.
7. **Partial failure is useful.** A temporary ERP failure should not suppress available CRM, memory, or document context.
8. **Structured bounded context.** The model receives labeled, size-limited blocks rather than an uncontrolled data dump.

## Architecture

```text
Authenticated AI Chat request
        │
        ▼
Owner and session authorization
        │
        ▼
Personal Context Builder
├── recent 20 messages
├── older conversation summary
├── relevant approved memories
├── owner-scoped CRM entity resolution
├── approved CRM ↔ ERP mapping
├── live bounded ERP customer context
└── relevant knowledge/file excerpts
        │
        ▼
Structured prompt + source manifest
        │
        ▼
Answer or action proposal
        │
        ├── source/freshness metadata → AI Chat UI
        ├── approved action → fresh-state execution + audit
        └── verified action result → safe memory policy
```

Both `POST /api/ai/chat` and `POST /api/ai/chat/stream` must call the same context builder, entity resolver, memory policy, and action-proposal validation. Streaming changes only transport; it must not have broader data or action permissions.

Immediate inbound memory capture runs once after the user message is durably saved and independently of model generation. The current message already supplies its facts to the current answer; a newly captured memory is used from the next turn onward to prevent self-reinforcement.

## Idempotent Chat Turns

Normal and streaming requests share a durable turn record:

```ts
type ChatTurn = {
  ownerId: string;
  sessionId: string;
  turnId: string;
  ordinal: number;
  userMessageId: string;
  assistantMessageId: string | null;
  state: "generating" | "completed" | "failed";
  attempt: number;
  createdAt: string;
  updatedAt: string;
};
```

The two chat transports share this request envelope:

```ts
type AiChatRequest = {
  message: string;
  sessionId?: string;
  turnId: string;
  selectedContactId?: string;
  actionApproval?: {
    proposalId: string;
    approvalToken: string;
  };
  provider?: string;
  model?: string;
};
```

`beginTurn` uses `(ownerId, turnId)` as the unique key. When `sessionId` is absent, it creates the session and binds it to that turn in the same locked operation; a retry with the same turn ID therefore returns the same session instead of creating another one. When `sessionId` is present, it first verifies owner scope and then binds the turn. It allocates one session ordinal and stores the user message once. `completeTurn` stores one final assistant message and the safe final response snapshot. A repeated completed turn returns that saved result. A repeated generating turn returns `409 TURN_IN_PROGRESS` and can be observed through an owner-scoped turn-status endpoint instead of creating another message. A failed turn can retry under the same record and increment `attempt` without repeating inbound memory capture. Partial assistant text is not persisted as a completed answer or used as memory evidence. The post-turn conversation-summary job runs only after `completed`.

## Source Ownership and Precedence

The current user message is always the highest-priority expression of the user's present intent. Recent messages and the older summary clarify that intent; no retrieved memory, CRM text, ERP text, or document can override it or act as an instruction.

For factual conflicts, the answer follows this authority order and explains a material conflict:

1. Live ERP data for invoices, orders, payments, receivables, inventory, and accounting amounts.
2. Current CRM fields for contact identity, relationship stage, next follow-up, activity, and forecast.
3. Approved entity-linked or user memory for stable preferences, commitments, and prior decisions.
4. Conversation summary and recent messages for conversational intent.
5. Knowledge and file excerpts for supporting reference material.

An old memory must not override a current CRM field or live ERP amount. CRM `expectedValue` is labeled as forecast and is never presented as booked sales or receivables. It is compared with ERP actuals only when `expectedValueCurrency` and the ERP amount currency match exactly; automatic exchange-rate conversion is outside this scope. A current user instruction may request a future change but does not make that change a current CRM or ERP fact before approved execution succeeds.

## Personal Context Assembly

The builder runs the following fixed sequence.

### 1. Authorize owner and session

- Call the existing authentication boundary and derive `ownerId` from it.
- Verify the requested session belongs to that owner.
- Require a client-generated UUID `turnId` and enforce uniqueness on `(ownerId, sessionId, turnId)`.
- Accept an optional `selectedContactId`; when present, verify it belongs to the owner before treating it as authoritative UI context.
- Ignore or reject any request-supplied owner identity.
- Create no side effects during context assembly.

Before source retrieval, a server policy computes `crmMode: "none" | "aggregate" | "contact"`, `erpMode: "none" | "dashboard" | "customer"`, and `needsDocuments`. All default to no retrieval. CRM aggregate mode serves totals, stages, and due-follow-up questions; contact mode requires a verified selected contact or explicit contact reference. ERP dashboard mode serves owner/company-wide sales, purchases, profit, payables, receivables, inventory, and recent-document questions through the normalized Business snapshot. ERP customer mode requires one resolved contact plus an approved mapping. Document retrieval is enabled only for a knowledge/file question. General conversation therefore does not read or disclose CRM, ERP, or document data unnecessarily.

### 2. Load recent conversation

- Load the last 20 messages for the authorized session, in stable persisted session-ordinal order.
- Include roles and bounded text only.
- Exclude internal tool payloads, secrets, raw credentials, and oversized attachments.
- Ensure the current user message appears exactly once.

### 3. Load the older-conversation summary

Add a separate repository record:

```ts
type ConversationSummary = {
  ownerId: string;
  sessionId: string;
  summary: string;
  throughMessageId: string;
  sourceMessageCount: number;
  throughOrdinal: number;
  version: number;
  updatedAt: string;
};
```

The summary covers only messages older than the recent window. The context builder only reads the latest summary. After a completed turn leaves a session above 30 messages, a separate versioned job updates the summary in bounded batches of 10 messages. A conversation summary helps continuity but is not an approved long-term memory and is not returned by general memory search.

Summary generation may compress explicit conversation content but cannot introduce new facts, approvals, mappings, or action permissions. It excludes exact live ERP amounts, balances, inventory counts, document statuses, and mapping identifiers; it may retain only that a topic was discussed and that live data must be queried again. A failed summary update leaves the prior summary usable and does not block chat.

### 4. Retrieve relevant approved memories

- Search only memories owned by the authenticated owner.
- Use existing local embedding/token-overlap ranking.
- Include at most six relevant approved records within the memory budget.
- Prefer entity-linked memories when a CRM contact is resolved.
- Preserve memory ID, category, source, confidence, approval mode, and current version in the source manifest.
- Pending, rejected, deleted, superseded, or sensitivity-blocked memories do not enter the model context.

### 5. Resolve the CRM entity

Entity resolution searches owner-scoped contacts using explicit identifiers and bounded normalized matches.

For `crmMode === "aggregate"`, the builder loads only the bounded CRM dashboard projection and skips entity resolution. The rules below apply to `crmMode === "contact"`.

- An exact selected contact ID from the UI is authoritative after owner verification.
- A unique exact email or phone match may resolve the contact.
- A unique exact full-name and company match may resolve the contact.
- A name-only or multiple match returns an ambiguity result with safe display choices.
- The model must ask the user which contact they mean before reading ERP data or proposing a mutation.
- The resolver never creates or approves an ERP mapping.

The resolved CRM context is bounded to necessary fields: identity, company, relationship stage, operational status, importance, next follow-up, expected-value forecast, recent activities, relevant approved contact memories, and version.

### 6. Load the approved ERP mapping

- For `erpMode === "dashboard"`, skip contact mapping and use the owner-scoped normalized Business ERP snapshot.
- The remaining mapping rules apply only to `erpMode === "customer"`.
- Query the mapping repository by owner, local contact ID, provider, and `status === "approved"`.
- Do not use candidate matches or revoked mappings.
- Re-verify that the exact mapped connection belongs to the same owner and still targets the mapped site and company.
- If no approved mapping exists, set `requestState = "not_mapped"`; do not guess by company name.

### 7. Load live ERP customer context

Only an approved mapping allows an exact provider request for the mapped `externalCustomerId`.

An ERP dashboard request uses the existing read-only `ErpDashboardSnapshot`, including its company, currency, accounting period, connection state, freshness, and warnings. It never substitutes aggregate top-five records for a customer context. A customer request uses the exact type below.

```ts
type ErpContextWarning =
  | "stale"
  | "partial_orders"
  | "partial_invoices"
  | "partial_payments"
  | "currency_unverified"
  | "provider_timeout"
  | "provider_authentication"
  | "mapping_changed";

type ErpDocumentSummary = {
  id: string;
  documentType: "sales_order" | "sales_invoice" | "payment_entry";
  status: string;
  postingDate: string;
  modifiedAt: string;
  amount: number | null;
  currency: string | null;
};

type ErpCustomerContext = {
  connectionState: ErpConnectionState;
  requestState: "not_requested" | "available" | "not_mapped" | "unavailable";
  provider: "erpnext" | null;
  connectionId: string | null;
  externalSiteId: string | null;
  externalCompanyId: string | null;
  externalCustomerId: string | null;
  mappingId: string | null;
  mappingVersion: number | null;
  connectionRevision: number | null;
  customerLabel: string | null;
  currency: string | null;
  asOf: string | null;
  stale: boolean;
  receivables: number | null;
  overdueReceivables: number | null;
  openOrders: Array<ErpDocumentSummary>;
  openInvoices: Array<ErpDocumentSummary>;
  recentPayments: Array<ErpDocumentSummary>;
  warnings: ErpContextWarning[];
};
```

Every amount is `number | null`; zero means the provider explicitly returned zero, and `null` means unknown or unavailable. Receivable aggregates use the verified ERP company base currency. Every document summary carries its own amount and currency instead of inheriting a possibly incorrect global currency. `openOrders` and `openInvoices` contain at most 10 items each, `recentPayments` at most 5, and warnings are an allowlisted enum capped at 8. Because the mapped ERP customer can be a company account shared by several CRM contacts, every financial answer labels the amount as account-level data rather than the person's private debt. The provider must not answer a specific customer's financial question using the dashboard's top-five aggregate data.

The AI integration extends the ERP boundary through a narrow typed capability, not through arbitrary REST calls:

```ts
type ErpCapability = "customer_search" | "customer_read" | "draft_write";

interface ErpBusinessProvider {
  searchCustomers(input: ExactConnectionScope & { query: string }): Promise<ErpCustomerCandidate[]>;
  verifyCustomer(input: ExactConnectionScope & { externalCustomerId: string }): Promise<ErpCustomerIdentity>;
  getCustomerContext(input: ExactMappedCustomerScope): Promise<ErpCustomerContext>;
  searchItems(input: ExactConnectionScope & { query: string }): Promise<ErpItemCandidate[]>;
  createDraftQuotation(input: ExactMappedCustomerScope & DraftQuotationInput): Promise<ErpDraftResult>;
  createDraftSalesOrder(input: ExactMappedCustomerScope & DraftSalesOrderInput): Promise<ErpDraftResult>;
}
```

The provider and connection/capability contracts live in the independent `src/lib/erp` layer. Business, CRM mapping, and AI context consume that layer; the ERP layer never imports CRM or AI. `ExactConnectionScope` contains authenticated `ownerId`, `connectionId`, `connectionRevision`, `externalSiteId`, and `externalCompanyId`. `ExactMappedCustomerScope` adds the approved mapping ID, mapping version, and external customer ID. `verifyCustomer` performs an exact identifier lookup within that connection/site/company and returns a bounded identity; mapping approval calls it immediately before compare-and-swap persistence and never relies on an earlier ranked search result. Each method checks `customer_search`, `customer_read`, or `draft_write` as appropriate; unsupported operations fail closed. There is no generic method, arbitrary endpoint, or pass-through provider payload.

Connection capabilities are stored owner-scoped with a revision and default `draft_write` to disabled. Enabling it requires an authenticated connection-settings confirmation and increments the revision. The request body cannot grant capabilities. CRM write permission comes from server-side owner/role authorization; until role-based access is introduced, only the authenticated owner has `crm_write`.

`PATCH /api/business/erp/connections/:id/capabilities` accepts an expected connection revision and an explicit `draft_write` boolean from the authenticated owner. It shows and records the risk confirmation, never accepts `ownerId`, and returns the incremented revision. Disabling the capability invalidates every unexecuted ERP proposal for that connection.

### 8. Retrieve relevant documents

- Use a new owner-aware document-search adapter built on `listKnowledgeNotes(ownerId)` and `listFileRecords(ownerId)`.
- Return bounded excerpts with document ID, title, section, and relevance.
- Do not include an entire file when only an excerpt is relevant.
- Never call the current global `hybridSearch(message, limit)` path from personal context because it has no owner parameter.
- Never use documents to override fresher CRM or ERP state.

### 9. Build a bounded structured prompt

Use explicit blocks such as `RECENT_CONVERSATION`, `CONVERSATION_SUMMARY`, `APPROVED_MEMORY`, `CRM_AGGREGATE`, `CRM_CONTACT`, `ERP_DASHBOARD`, `ERP_LIVE_CONTEXT`, and `KNOWLEDGE_EXCERPTS`. Include only the blocks selected by the relevance policy. Serialize them as schema-validated JSON inside untrusted-data blocks; control characters and delimiter-like text are escaped and cannot terminate a block. Treat every retrieved value as data, not as a system instruction.

Persisted assistant messages can contain ERP values previously shown to the user. Those messages carry volatile-source metadata with `asOf`, and the prompt labels them non-authoritative history. A customer financial follow-up always attempts a fresh exact ERP read; a value from chat history cannot satisfy a live-data question. If refresh fails, the assistant can refer to the earlier discussion only as unverified historical context and must not repeat the old amount as current.

Initial budgets:

- Recent conversation: up to 20 messages and 6,000 characters.
- Conversation summary: up to 2,000 characters.
- Approved memories: up to 6 items and 2,400 characters.
- CRM context: up to 3,000 characters.
- ERP live context: up to 3,000 characters.
- Knowledge/file excerpts: up to 4,000 characters.
- Combined retrieved context: up to 16,000 characters, including a reserved 2,000-character structural envelope for identifiers, currency, freshness, and warnings.

If the combined limit is exceeded, trim complete structured fields rather than slicing serialized text: remove the lowest-ranked document excerpts first, then older recent messages already represented in the summary, then lower-ranked memories, then the oldest ERP list items. Never silently trim the resolved contact ID, mapping ID/version, connection revision, action target, amount currency, freshness timestamp, or warnings needed for a safe answer. The provider adapter also reserves its system prompt, current user message, and at least 25% of the model context window for the answer; if 16,000 characters do not fit, it reduces retrieved blocks through the same order.

### 10. Produce the answer and source manifest

The answer must distinguish:

- Current CRM facts.
- Live or stale ERP facts and their `asOf` time.
- Approved remembered information.
- Model suggestions or drafts.

The response metadata contains safe sources that the AI Chat UI can display without exposing provider credentials or raw internal prompts.

## AI Chat Presentation

The main answer remains readable prose. A companion panel or expandable drawer displays:

- Resolved CRM contact and why it was selected.
- ERP mapping and live-data freshness state.
- Source cards for CRM, ERP, memory, and documents.
- Memory result: `즉시 저장됨`, `검토 대기`, `저장하지 않음`, or `저장 실패` with a short reason.
- Any proposed action with exact target, field changes, draft payload, warnings, and approval controls.
- Executed action result and audit reference.

The source panel is also the extension point for a future long-running research/report feature, but this increment does not claim to crawl the web or provide researched links and videos.

The existing bounded web-answer path and its verified source links remain available. This design neither removes it nor represents it as the future long-running research worker.

## Important Memory: Immediate Safe Save

### Memory categories allowed for automatic approval

Only the following categories can be saved immediately:

- User preference.
- Long-term user goal.
- Explicit confirmed decision.
- Explicit customer promise or commitment.
- Explicit follow-up obligation or date.
- Confirmed relationship-status change.
- Important confirmed meeting conclusion.

These are auto-save decision kinds, distinct from the existing broad `MemoryCategory` navigation groups. The implementation adds:

```ts
type MemoryAutoSaveKind =
  | "user_preference"
  | "long_term_goal"
  | "confirmed_decision"
  | "customer_commitment"
  | "follow_up"
  | "relationship_change"
  | "meeting_conclusion";
```

Each kind maps to an existing `MemoryCategory` and signal set while remaining available in audit metadata, so the UI grouping contract does not need to be repurposed.

Automatic approval requires both:

- `importance >= 0.80`
- `confidence >= 0.85`

The information must be explicit in the current user message or a verified action result. Automatic approval additionally requires `extractionMethod === "deterministic_explicit" | "verified_action"`; a model-extracted candidate remains `pending` regardless of its model-assigned scores. Model-generated speculation, a suggestion in the assistant answer, or a conclusion inferred only from tone cannot qualify.

An inbound explicit follow-up can be saved immediately only as a user obligation or intended date; it does not claim that `Customer.nextContactAt` changed. A confirmed relationship-stage change is auto-approved only from a successful version-checked CRM action result. The CRM record remains authoritative for operational state.

### Information that is never automatically saved

- Passwords, API keys, access tokens, recovery codes, connection strings, and credentials.
- Government identifiers, payment-card data, bank-account data, private authentication data, or other high-risk sensitive identifiers.
- AI guesses, uncertain entity matches, unconfirmed plans, and ambiguous statements.
- Live ERP amounts, balances, inventory, receivables, invoices, payments, or order status.
- CRM-to-ERP mapping candidates or approvals.
- Data belonging to another owner or an unresolved contact.

Sensitivity filtering runs before scoring. A blocked item is not persisted as a pending candidate containing the secret; only a safe audit classification may be recorded.

### Memory data extension

Extend the existing lifecycle rather than creating a duplicate memory system:

```ts
type MemoryEntityLink = {
  entityType: "user" | "contact" | "project";
  entityId: string | null;
};

type MemoryApprovalMode = "auto_approved" | "user_approved";

type MemoryExtractionMethod =
  | "deterministic_explicit"
  | "model_candidate"
  | "verified_action";
```

Each saved record preserves source message or action ID, session ID, extraction method, category, auto-save kind, confidence, importance, entity link, approval mode, approval actor, policy version, timestamps, version, and history. For automatic approval, the actor is the named server policy version, never the owner; `approvedBy` must not falsely imply a manual user click.

The existing pending-only capture lifecycle remains unchanged for manual, model-based, external, and MCP capture. A separate server-only `captureInboundUserMemory` boundary is the only inbound path allowed to invoke this auto-save policy.

The client receives a distinct result rather than overloading the existing capture-job type:

```ts
type MemoryCaptureOutcome = {
  status: "auto_saved" | "pending" | "not_saved" | "failed";
  items: Array<{
    memoryId: string | null;
    autoSaveKind: MemoryAutoSaveKind | null;
    reasonCode: string;
  }>;
};
```

### Save and deduplication flow

1. Durably store the user message through the idempotent turn boundary.
2. Build side-effect-free context and resolve any referenced CRM entity.
3. Extract candidate facts from that user message only; do not treat assistant prose as evidence.
4. Apply sensitivity and entity-resolution gates.
5. Classify extraction method, auto-save kind, broad category, importance, and confidence.
6. Normalize and compare only memories with the same owner, entity, normalized predicate, and normalized value.
7. An exact same-value duplicate is a no-op or frequency/version update. A different value for the same predicate becomes a visible conflict candidate and never overwrites the approved value automatically.
8. If it is allowlisted, deterministic or action-verified, and passes both thresholds, store it in the same request as `approved` with `approvalMode = "auto_approved"`.
9. If it is safe but ambiguous, model-extracted, below threshold, conflicting, or outside the auto-approval categories, store it as a visible `pending` candidate.
10. If it is sensitive, live ERP state, or unsupported, do not store the content.
11. Generate the answer independently and in parallel only after step 2; the new memory is excluded from the current turn's context. Report the capture outcome without failing the answer if persistence fails.
12. After an approved action succeeds, run the same policy once more using the verified action result as provenance.

An immediately saved memory is visible, editable, and deletable as soon as the request completes. Edits and deletes create history, invalidate stale embeddings, and prevent superseded text from entering later context.

Manual capture, external connectors, and MCP memory mutations keep their existing explicit preview-and-approval behavior. The auto-approval exception applies only to the bounded inbound user-message and verified-action-result paths defined above.

## AI Business Actions

### Read-only work

The assistant may perform authenticated reads without a separate mutation approval:

- Find and summarize CRM contacts, activities, due follow-ups, and approved memories.
- Read live ERP customer orders, invoices, payments, and receivables through an approved mapping.
- Compare CRM forecast with clearly labeled ERP actuals.
- Draft text, meeting preparation, follow-up language, and suggested next steps without saving them.

### Initial allowlisted mutations

CRM actions after preview and user approval:

- Create a contact.
- Update allowlisted contact fields.
- Add a note or activity.
- Set or change a follow-up date.
- Change relationship stage.

ERP actions after preview and user approval, only when the connection explicitly enables `draft_write`:

- Create a draft quotation.
- Create a draft sales order.

Draft documents must remain unsubmitted. The execution response includes the created draft identifier and a safe link for review in ERPNext.

### Excluded high-impact actions

The initial executor cannot submit or cancel an ERP document, create or post an invoice, record a payment, delete a record, change accounting configuration, or adjust stock. These actions require a separate capability design with stronger confirmation and policy controls. The model may explain that limitation and prepare a non-executable draft plan.

### Proposal contract

```ts
type ErpDraftLine = {
  itemCode: string;
  quantity: number;
  uom: string;
  unitPrice: number;
};

type AiActionPayload =
  | { kind: "crm.contact.create"; fields: CrmContactCreateFields }
  | { kind: "crm.contact.update"; fields: CrmContactUpdateFields }
  | { kind: "crm.activity.create"; activityType: CrmActivityType; title: string; body: string }
  | { kind: "crm.follow_up.set"; nextContactAt: string; timeZone: string }
  | { kind: "crm.relationship_stage.set"; relationshipStage: CustomerRelationshipStage }
  | {
      kind: "erp.quotation.create_draft";
      currency: string;
      priceList: string;
      taxTemplate: string | null;
      warehouse: string | null;
      validUntil: string;
      items: ErpDraftLine[];
    }
  | {
      kind: "erp.sales_order.create_draft";
      currency: string;
      priceList: string;
      taxTemplate: string | null;
      warehouse: string | null;
      deliveryDate: string;
      items: ErpDraftLine[];
    };

type AiActionProposal = {
  id: string;
  ownerId: string;
  sessionId: string;
  proposalTurnId: string;
  action: AiActionPayload;
  target: {
    localContactId: string | null;
    mappingId: string | null;
    provider: "erpnext" | null;
    connectionId: string | null;
    externalSiteId: string | null;
    externalCompanyId: string | null;
    externalCustomerId: string | null;
  };
  preconditions: {
    contactVersion: number | null;
    mappingVersion: number | null;
    connectionRevision: number | null;
    erpCustomerModifiedAt: string | null;
    items: Array<{ itemCode: string; modifiedAt: string }>;
  };
  permission: "crm_write" | "draft_write";
  idempotencyKey: string;
  approvalTokenHash: string;
  status:
    | "proposed"
    | "approved"
    | "executing"
    | "succeeded"
    | "failed"
    | "outcome_unknown"
    | "expired"
    | "cancelled";
  expiresAt: string;
  approvedAt: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

`CrmContactCreateFields` and `CrmContactUpdateFields` contain only the CRM edit allowlist from the CRM design and enforce the same length, enum, currency, and date validation. An ERP draft has 1–50 exact item codes, finite quantity greater than zero, verified UOM and non-negative unit price, one verified company currency and price list, and explicit nullable tax-template and warehouse defaults. Ambiguous free-text items produce choices and no proposal. The persisted action is a discriminated schema-validated payload, never arbitrary executable instructions.

Relative dates such as `금요일` resolve in the authenticated owner's stored IANA time zone, falling back to UTC. The proposal always displays the exact local date/time, time zone, and stored ISO instant before approval.

### Approval and execution flow

1. Detect that the request contains a mutation.
2. Resolve the exact owner, contact, mapping, provider, and relevant current state.
3. Resolve exact ERP item codes, quantities, UOM, prices, currency, price list, company, tax template, warehouse, dates, and provider modified timestamps before building an ERP proposal. Any ambiguity blocks the proposal.
4. Build a validated proposal with the exact field diff or ERP draft payload and a precondition for every mutable dependency.
5. Return the proposal plus a cryptographically random one-time approval token to the authenticated client; persist only its hash.
6. Display the proposal and warnings. Do not mutate yet.
7. The authenticated user explicitly approves that exact proposal, and the client sends proposal ID plus the raw one-time token.
8. Verify the proposal belongs to the owner and session, is unexpired, has a valid token, and has not already executed. Record the new approval turn separately from the proposal-creation turn.
9. Re-read the contact version, mapping version, connection revision/capability, ERP customer modification time, item modification times, and all draft defaults.
10. If any recorded precondition differs, expire the proposal and return a new preview instead of applying stale intent.
11. Execute through an allowlisted service method with the idempotency key.
12. Record success, safe failure, or unknown outcome in the audit log and return the result.

Free-text responses such as `응` approve only when the AI Chat client has one active proposal and attaches `actionApproval: { proposalId, approvalToken }` to the new approval turn. The proposal stores `proposalTurnId`; execution records the distinct `approvalTurnId`. They must share the same authenticated owner and session but must not be equal. The server validates the metadata; the model never decides that text alone is authorization. Without valid metadata, `응` changes nothing and the assistant asks the user to use or refresh the approval card. The raw token is returned only on proposal creation, kept in current client state, consumed once, and never written to chat text or logs. An owner-scoped token-rotation endpoint can replace a lost token while the proposal is still unexpired and `proposed`; rotation invalidates the old hash and is audited. Approval never grants a reusable broad permission.

Each execution creates an attempt record before contacting ERP. Successful results are cached by proposal and idempotency key. When the provider times out after transmission and creation cannot be disproved, the proposal becomes `outcome_unknown`; it is never automatically sent again. Reconciliation queries the provider by the safe integration reference or requires manual review. ERPNext does not provide a universal exactly-once guarantee, so this design guarantees no blind resend rather than claiming upstream exactly-once behavior.

### Example

For `김민수 고객의 미수금을 확인하고 다음 연락 일정을 금요일로 잡아줘`:

1. Resolve the owner-scoped `김민수` contact; if multiple contacts match, ask the user to choose.
2. Load the approved mapping and live ERP receivables.
3. Answer the receivable amount with currency, `asOf`, and freshness state, or explain that mapping/live data is unavailable.
4. Build a CRM follow-up proposal showing the exact interpreted date and current value.
5. After approval, re-read the contact version and save the follow-up date.
6. Audit the change and evaluate the confirmed follow-up as a possible immediate safe memory with provenance.

The read occurs immediately; only the follow-up mutation waits for approval.

## Service and Repository Boundaries

- `src/lib/ai/context/personal-context.types.ts`: context blocks, sources, warnings, and budgets.
- `src/lib/ai/context/build-personal-context.ts`: shared orchestration for normal and streaming chat.
- `src/lib/ai/chat-turn.service.ts`: shared `prepareChatTurn` and `finalizeChatTurn` path for classification, idempotent message persistence, context, sources, memory result, proposal validation, and final response.
- `src/lib/db/repositories/chat-turn.repository.ts`: unique turn, ordinal, attempt, and completion persistence.
- `src/lib/ai/context/crm-context.ts`: owner-scoped contact resolution and bounded CRM projection.
- `src/lib/ai/context/erp-context.ts`: approved-mapping lookup and exact live provider read.
- `src/lib/ai/context/document-context.ts`: bounded owner-aware knowledge/file excerpts.
- `src/lib/ai/context/conversation-summary.ts`: summary creation and versioned update policy.
- `src/lib/erp/erp-business-provider.ts`: shared exact-scope customer/item read and draft-write provider contract.
- `src/lib/erp/erp-connection.types.ts`: owner-scoped connection identity, revision, and capabilities.
- `src/lib/ai/actions/action.types.ts`: proposal and execution contracts.
- `src/lib/ai/actions/action.repository.ts`: owner/session-scoped proposal persistence and idempotency.
- `src/lib/ai/actions/action.service.ts`: proposal validation, approval, fresh-state check, and allowlisted dispatch.
- `src/lib/memory/auto-memory-policy.ts`: sensitivity, category, threshold, entity, and dedup decisions.
- `src/lib/memory/capture-inbound-user-memory.ts`: server-only deterministic immediate-save boundary.
- Existing memory lifecycle and repositories: approval, history, provenance, embeddings, edit, and delete.

The two chat routes become thin transport layers around `prepareChatTurn` and `finalizeChatTurn`. They must not independently classify the request, reconstruct prompts, resolve contacts, approve memory, save final messages, or execute actions. This removes the current normal/stream divergence rather than sharing only one helper.

Action routes are also thin authenticated transports:

- `POST /api/ai/actions/:id/approve` accepts a new client-generated `approvalTurnId` and the raw one-time approval token, verifies the one active proposal, and moves it through fresh-state execution.
- `POST /api/ai/actions/:id/cancel` cancels an owner/session-scoped unexecuted proposal.
- `POST /api/ai/actions/:id/approval-token` rotates a lost token for an unexpired proposed action and invalidates the old token.
- `GET /api/ai/actions/:id` returns a safe proposal/result view without secrets or internal policy fields.

The existing `src/lib/agent/approval.ts` preview is a non-executing planning helper and is not reused as authorization for business mutations.

AI Chat presentation components are separated into a source/context drawer, memory-result notice, action-preview card, and execution-result card so action approval never depends on parsing rendered assistant Markdown.

## Response and Streaming Contract

The non-streaming route returns the answer plus additive metadata:

```ts
type AiChatResult = {
  answer: string;
  sources: AiContextSource[];
  confidence: AnswerConfidence;
  verification: AnswerVerification;
  sessionId: string;
  turnId: string;
  memoryStatus: string;
  memoryCandidates: ExistingMemoryCandidateSummary[];
  contextState: {
    crm: "aggregate" | "resolved" | "ambiguous" | "not_found" | "not_requested";
    erp: "dashboard" | "available" | "not_configured" | "not_mapped" | "unavailable" | "not_requested";
  };
  memoryResult: MemoryCaptureOutcome;
  actionProposal: AiActionProposalView | null;
  warnings: string[];
};
```

This preserves the existing top-level `answer`, `sources`, `confidence`, `verification`, `sessionId`, `memoryStatus`, and `memoryCandidates` fields and adds new metadata.

The streaming route preserves existing `status`, token-chunk `delta`, and terminal `done` behavior. It adds `context`, `memory_result`, `sources`, and `action_proposal` events; the `done` payload retains its existing `answer`, `memoryStatus`, and `memoryCandidates` fields and adds `turnId`, context, and action metadata. The inbound memory pass runs once from the saved user message, and any later verified-action pass has its own source ID. The server saves one final assistant message but never extracts auto-approved facts from assistant prose. Reconnect or retry must not duplicate assistant messages, memory records, or actions.

## Failure Behavior

- CRM ambiguity: return choices and do not query ERP or propose a contact mutation.
- CRM unavailable: answer from permitted conversation, memory, and documents with a warning; do not claim current relationship state.
- No ERP mapping: explain that the contact must be manually linked; do not guess.
- ERP timeout or authentication failure: continue with CRM/memory context and label live financial data unavailable.
- Stale ERP response: include the value only with its `asOf` time and stale warning.
- Memory persistence failure: return the answer and show `저장 실패`; a retry uses idempotency to prevent duplicates.
- Action conflict: make no change and generate a refreshed proposal.
- Action timeout or unknown provider result: mark the execution for safe reconciliation; do not blindly retry a write without the same idempotency key.
- Streaming disconnect: no action executes without a separately verified approval request.

## Security and Privacy

- All context and action services require authenticated owner context.
- Session IDs, contact IDs, mapping IDs, memory IDs, document IDs, and action IDs are verified against that owner.
- Retrieved CRM, ERP, memory, and document text is untrusted data and cannot override system or action policy.
- Provider credentials, cookies, authorization headers, raw upstream errors, and internal prompts are absent from model-visible context and client metadata.
- ERP reads use the exact approved external customer ID and allowlisted provider methods.
- ERP draft writes default to disabled and require both an owner-scoped connection capability and an action-level permission.
- Proposal payloads are schema validated and size limited; arbitrary URLs, methods, scripts, and provider commands are rejected.
- Approval-token hash, expiration, exact preconditions, turn identity, and idempotency key prevent replay and stale execution.
- Every mutation records actor, owner, proposal, target, before/after or created identifier, timestamp, and outcome.
- Logs redact customer-sensitive free text where possible and never contain credentials or full context prompts.

## Testing

### Context unit tests

- Recent messages are chronological, limited to 20, and include the current message once.
- CRM, ERP, and document gates default to `not_requested`; general chat performs none of those reads, while aggregate business questions use bounded CRM or ERP dashboard modes without inventing a contact.
- `selectedContactId` is owner-verified in both normal and streaming requests.
- Conversation summary covers only messages outside the recent window and updates idempotently.
- Approved memory retrieval is owner-scoped, ranked, bounded, and excludes pending/deleted records.
- Exact contact resolution succeeds; ambiguous names produce choices and no ERP lookup.
- Only an approved same-owner mapping enables live ERP context.
- Explicit ERP zero differs from unavailable/null.
- Context budget trimming preserves identifiers, currency, timestamps, and warnings.
- Retrieved text cannot inject system instructions or tools.
- Personal document search cannot return another owner's notes or files and never uses the global ownerless search path.

### Memory policy tests

- Every approved auto-save category passes only at `importance >= 0.80`, `confidence >= 0.85`, and an allowed deterministic or verified-action extraction method.
- A model-scored candidate remains pending even above both numeric thresholds.
- An explicit follow-up obligation can save as intent, while CRM schedule state and relationship changes auto-approve only from verified action results.
- A confirmed customer promise is immediately approved with policy actor and provenance.
- A safe ambiguous fact becomes pending.
- Secrets and sensitive identifiers are neither approved nor stored as pending content.
- Live ERP amounts and mapping decisions are never auto-saved.
- Exact same-predicate/same-value duplicates create a no-op or version/frequency update; conflicting values remain pending.
- Auto-approved memories are immediately visible, editable, deletable, and excluded after deletion.
- A memory failure does not fail or duplicate the chat answer.

### Action tests

- Reads do not require mutation approval.
- Every CRM mutation creates a preview and changes nothing before approval.
- ERP draft actions fail closed when `draft_write` is absent or the connection revision changed.
- Submit, invoice, payment, delete, cancel, accounting, and stock actions are rejected by the initial allowlist.
- `응` approves only one unique active same-session proposal.
- Owner, session, turn, approval token, expiry, every exact precondition, and idempotency checks reject replay and cross-owner execution.
- Proposal and approval turn IDs are distinct, belong to the same owner/session, and are both preserved in audit.
- Fresh-state changes expire the proposal without partial mutation.
- Successful execution produces one audit event and one result even after a retry.
- An ambiguous item cannot create a proposal, and an unknown ERP outcome is never blindly retransmitted.

### Route and integration tests

- Normal and streaming routes produce equivalent context sources and permissions.
- Both routes use shared prepare/finalize turn services, context builder, and memory policy while preserving existing `answer`, `delta`, and `done` client contracts.
- ERP failure degrades only financial context.
- Global CRM and ERP questions use their bounded dashboard snapshots without requiring or guessing a contact mapping.
- CRM and ERP source labels and freshness reach the client safely.
- The example receivables-plus-follow-up request reads immediately and mutates only after approval.
- Session retry and stream reconnect do not duplicate messages, memories, proposals, or actions.
- Reusing one `turnId` returns the completed result, reports an in-progress turn, or retries a failed attempt without adding a second user message.
- Retrying a brand-new session request with the same owner and `turnId` returns the originally created session rather than creating a second session.

### Regression verification

- Existing provider selection, chat graph, RAG, memory lifecycle, memory history, and owner-isolation tests continue to pass.
- CRM and Business ERP focused tests pass before cross-feature AI tests.
- Full TypeScript checking, the complete test suite, and the production build run before completion.

## Acceptance Criteria

- AI Chat can resolve and summarize an authenticated user's CRM contact data.
- AI Chat can answer owner-scoped aggregate CRM and ERP dashboard questions without exposing full raw collections.
- AI Chat reads customer-specific ERP data only through a manual approved CRM-to-ERP mapping.
- Answers identify source type and live-data freshness and do not confuse CRM forecasts with ERP actuals.
- Recent conversation, older summary, approved memory, CRM, ERP, and documents enter one bounded shared context path.
- Important safe explicit information is saved immediately at the approved thresholds with provenance and visible controls.
- Sensitive, inferred, ambiguous, live ERP, and mapping information is never silently auto-approved.
- Read-only work happens immediately; every mutation shows an exact preview and requires explicit approval.
- Initial ERP writes are limited to opt-in draft quotation and draft sales order creation.
- Strong financial, destructive, and inventory actions cannot execute in this increment.
- Partial ERP or memory failure still yields a useful, accurately qualified answer.
- Normal and streaming chat enforce the same owner scope, source rules, memory policy, and action permissions.
