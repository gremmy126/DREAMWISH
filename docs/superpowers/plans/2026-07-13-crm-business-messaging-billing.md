# CRM Business Messaging Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved CRM dashboard, simplified Business hub, business-card and meeting input, real Gmail/Slack conversations, a correct Polar button, no authenticated refresh guest flash, and a Calendar phone-import entry point.

**Architecture:** Add CRM as its own workspace view and split CRM/dashboard detail components. Keep provider tokens server-side and expose owner-scoped messaging routes over existing synchronized repositories. Business cards and meetings use dedicated owner-scoped repositories; phone calendar import consumes mobile candidates defined by the mobile plan.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind, Firebase Auth, Polar, Google Gmail API, Slack Web API, Node tests.

## Global Constraints

- Refresh remains AI Chat home; authenticated users must never flash GuestChatHome while Firebase restores.
- Logged-out SEO/public behavior remains available after auth resolves.
- Remove Business customer, company, and task tabs.
- CRM has no company tab; company fields remain on contacts and deals.
- External send occurs only after the user presses the send confirmation button.
- Never stage `.superpowers/` or `h origin main`.

---

### Task 1: Auth restore screen and independent CRM navigation

**Files:**
- Modify: `components/auth/AuthGate.tsx`
- Create: `components/auth/AuthRestoringScreen.tsx`
- Modify: `components/layout/types.ts`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `components/layout/AppShell.tsx`
- Modify: `src/lib/navigation/workspace-view.ts`
- Test: `tests/auth-refresh-no-guest-flash.test.ts`
- Test: `tests/crm-ui-contract.test.ts`

**Interfaces:**
- Produces `ViewId = ... | "crm"` and `AuthRestoringScreen`.

- [ ] **Step 1: Write failing refresh and navigation tests**

```ts
assert.match(authGateSource, /if \(loading\) return <AuthRestoringScreen/u);
assert.doesNotMatch(workspaceViewSource, /value === "crm"\) return "business"/u);
assert.match(sidebarSource, /id: "crm"/u);
```

- [ ] **Step 2: Run tests**

Run: `node --import tsx --test tests/auth-refresh-no-guest-flash.test.ts tests/crm-ui-contract.test.ts`

Expected: FAIL.

- [ ] **Step 3: Render a neutral restore screen before GuestChatHome**

```tsx
if (loading) return <AuthRestoringScreen />;
if (!access) return <GuestExperience ... />;
```

The restore screen contains the brand mark and accessible `로그인 상태 확인 중` text, but none of the hero title, suggested cards, guest composer, public footer, or Login button shown in the reported screenshot.

- [ ] **Step 4: Add CRM ViewId and sidebar item**

Render `<CRMView />` directly for `crm`, remove CRM-to-Business normalization, and keep `resolveWorkspaceView` refresh default as `chat`.

- [ ] **Step 5: Run tests and commit**

Commit: `fix: prevent guest home flash on session restore`

---

### Task 2: CRM screenshot-based dashboard

**Files:**
- Modify: `components/CRM/CRMView.tsx`
- Create: `components/CRM/CrmDashboard.tsx`
- Create: `components/CRM/CrmPipeline.tsx`
- Create: `components/CRM/CrmContactTable.tsx`
- Create: `components/CRM/CrmContactDrawer.tsx`
- Modify: `src/lib/crm/crm.types.ts`
- Modify: `src/lib/crm/crm.repository.ts`
- Modify: `app/api/crm/customers/route.ts`
- Test: `tests/crm-dashboard-design.test.ts`

**Interfaces:**
- Produces CRM tabs: dashboard, contacts, deals, activities, email, reports, settings.

- [ ] **Step 1: Test approved tabs and dashboard regions**

Assert the source includes KPI cards, five pipeline stages, activity summary, recent contacts, and a contact detail drawer, and excludes a CRM company tab.

- [ ] **Step 2: Extend contact and deal presentation types**

Add optional profile image, address, website, description, email metrics, last activity, and approved pipeline stages without breaking existing persisted records.

- [ ] **Step 3: Build responsive dashboard and drawer**

Use `minmax(0,1fr)` main content, a 360px desktop drawer, and a fixed mobile drawer. Apply violet active state, white cards, thin slate borders, and two-line overflow rules from the supplied image.

- [ ] **Step 4: Wire search, creation, deal moves, activities, and selected contact**

Only show real repository values; empty data remains a designed empty state rather than demo contacts.

- [ ] **Step 5: Run tests and commit**

Commit: `feat: redesign CRM workspace`

---

### Task 3: Simplified Business tabs, business cards, and meetings

**Files:**
- Modify: `components/Business/BusinessHub.tsx`
- Create: `components/Business/BusinessCardImport.tsx`
- Create: `components/Business/MeetingManager.tsx`
- Create: `src/lib/business/business-card.repository.ts`
- Create: `src/lib/business/meeting.repository.ts`
- Create: `app/api/business/cards/route.ts`
- Create: `app/api/business/cards/[cardId]/approve/route.ts`
- Create: `app/api/business/meetings/route.ts`
- Test: `tests/business-inputs.test.ts`

**Interfaces:**
- Produces owner-scoped card import and meeting records.

- [ ] **Step 1: Test tab removal and action buttons**

```ts
assert.doesNotMatch(source, /id: "companies"|id: "customers"|id: "tasks"/u);
assert.match(source, /명함 추가/u);
assert.match(source, /회의 추가/u);
```

- [ ] **Step 2: Add owner-scoped repositories and route validation**

Card status is `uploaded | analyzed | approved | rejected`; meeting fields include customerId, dealId, attendees, start/end, notes, decisions, followUps, calendarEventId.

- [ ] **Step 3: Add image preview and reviewed extraction form**

Upload via existing file patterns, preserve the source file, accept analysis results only as editable suggestions, and create a CRM contact only in the approve route.

- [ ] **Step 4: Add meeting modal and optional calendar creation**

External calendar creation runs only when the checkbox is selected; otherwise the local meeting persists independently.

- [ ] **Step 5: Run tests and commit**

Commit: `feat: add business card and meeting inputs`

---

### Task 4: Gmail and Slack real conversation routes

**Files:**
- Create: `src/lib/integrations/gmail-message.service.ts`
- Create: `src/lib/integrations/slack-message.service.ts`
- Create: `app/api/business/messages/accounts/route.ts`
- Create: `app/api/business/messages/gmail/threads/route.ts`
- Create: `app/api/business/messages/gmail/threads/[threadId]/route.ts`
- Create: `app/api/business/messages/gmail/send/route.ts`
- Create: `app/api/business/messages/slack/channels/route.ts`
- Create: `app/api/business/messages/slack/channels/[channelId]/route.ts`
- Create: `app/api/business/messages/slack/send/route.ts`
- Test: `tests/business-messaging.test.ts`

**Interfaces:**
- Produces normalized `ConversationSummary`, `ConversationMessage`, and send results backed by provider responses.

- [ ] **Step 1: Test owner isolation and missing-scope errors**

Verify owner A cannot read owner B threads and send returns `reconnect_required` without Gmail compose/send or Slack `chat:write`.

- [ ] **Step 2: Implement Gmail thread listing and send**

Use encrypted owner token, Gmail threads/messages endpoints, RFC 2822 base64url payloads, `threadId` for replies, and provider success as the only success signal.

- [ ] **Step 3: Implement Slack channel/thread listing and send**

Use `conversations.list`, `conversations.history`, `conversations.replies`, and `chat.postMessage`; keep channel and thread IDs owner-scoped.

- [ ] **Step 4: Normalize safe API responses**

Do not return OAuth tokens, raw Authorization headers, or unbounded message history.

- [ ] **Step 5: Run tests and commit**

Commit: `feat: add Gmail and Slack conversation APIs`

---

### Task 5: Three-column message UI

**Files:**
- Create: `components/Business/MessageWorkspace.tsx`
- Create: `components/Business/MessageAccountList.tsx`
- Create: `components/Business/ConversationList.tsx`
- Create: `components/Business/ConversationThread.tsx`
- Modify: `components/Business/BusinessHub.tsx`
- Test: `tests/business-messaging-ui.test.ts`

- [ ] **Step 1: Test account, list, thread, reply, refresh, and reconnect regions**
- [ ] **Step 2: Build provider/account and Gmail-folder/Slack-channel navigation**
- [ ] **Step 3: Build conversation list with search and last-sync truth**
- [ ] **Step 4: Build thread reader, attachments, composer, and confirmation button**
- [ ] **Step 5: Run tests and commit**

Commit: `feat: add business message workspace`

---

### Task 6: Calendar phone import button and Polar state button

**Files:**
- Modify: `components/Calendar/CalendarView.tsx`
- Create: `components/Calendar/PhoneCalendarImport.tsx`
- Modify: `components/billing/UpgradeButton.tsx`
- Modify: `components/layout/Sidebar.tsx`
- Test: `tests/calendar-phone-import.test.ts`
- Test: `tests/polar-sidebar-button.test.ts`

**Interfaces:**
- Phone import consumes `GET /api/devices/calendar-candidates` and `POST /api/devices/calendar-candidates/import` from the mobile plan.

- [ ] **Step 1: Test the Calendar import button and sidebar billing states**

Assert `휴대폰에서 가져오기` exists, UpgradeButton appears directly before StorageStatus, and admin renders `관리자 무료 이용` instead of returning null.

- [ ] **Step 2: Add Calendar candidate drawer**

Show paired device, source calendar, event time, conflict status, selection, import result, and a connect-device empty state.

- [ ] **Step 3: Fix Polar labels and state behavior**

```tsx
const label = access.adminBypass
  ? "관리자 무료 이용"
  : paid
    ? "결제 관리"
    : "결제하기";
```

Disable admin click, use Checkout for unpaid and Portal for paid, retain error messages, and prevent duplicate requests.

- [ ] **Step 4: Run tests and commit**

Commit: `feat: add phone calendar import and billing button`

---

### Task 7: Browser and build verification

- [ ] Run: `npm test -- --test-name-pattern "auth|crm|business|calendar|polar"`
- [ ] Run: `npm run typecheck`
- [ ] Run: `npm run build`
- [ ] Verify authenticated hard refresh does not show the reported GuestChatHome hero or cards.
- [ ] Verify logged-out users receive the intended guest experience only after restore completes.
- [ ] Verify CRM at 1440px and 1024px, Business tab removal, messages, cards, meetings, calendar import, and billing states.
- [ ] Commit: `test: verify CRM and business workspace`

