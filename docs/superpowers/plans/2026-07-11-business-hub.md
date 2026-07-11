# Business Hub Implementation Plan

> **Execution:** Apply `superpowers:executing-plans` inline and use test-first RED/GREEN cycles for every behavior.

**Goal:** Replace the standalone CRM entry with a responsive Business Hub that unifies overview, customers, companies, sales, mail, business cards, meetings, tasks, and reports while reusing owner-scoped CRM and verified integration data.

**Architecture:** Keep the existing application shell and treat `business` as a first-class view plus `/business/[[...section]]` route. A pure workspace summary derives company, pipeline, revenue, meeting, task, and follow-up metrics from the authenticated CRM API response. Connector-backed panels consume the authenticated integration status endpoint and never claim unverified accounts are usable.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, existing CRM API/types, integration status API, Tailwind design tokens.

---

## Task 1: Add Business navigation and route compatibility

**Files:**
- Create: `tests/business-hub.test.ts`
- Modify: `components/layout/types.ts`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `components/layout/AppShell.tsx`
- Create: `app/business/[[...section]]/page.tsx`
- Modify: `src/lib/i18n/translations.ts`

- [ ] Add failing contracts for a Business sidebar entry, `/business` catch-all route, and legacy `crm` routing into Business customers.
- [ ] Run the test suite and confirm RED under the current CRM-only navigation.
- [ ] Add the Business view and route while preserving `crm` as a backward-compatible alias.
- [ ] Make URL query/path select the requested Business section without bypassing the authenticated shell.
- [ ] Rerun and confirm GREEN.

## Task 2: Build pure Business overview calculations

**Files:**
- Modify: `tests/business-hub.test.ts`
- Create: `src/lib/business/business-workspace.ts`

- [ ] Add failing tests for unique company count, active deals, expected revenue, confirmed won revenue, weighted pipeline, open tasks, meetings, and follow-up customers.
- [ ] Implement the minimal deterministic summary from customers, activities, tasks, and deals.
- [ ] Rerun and confirm GREEN.

## Task 3: Build responsive Business Hub panels

**Files:**
- Modify: `tests/business-hub.test.ts`
- Create: `components/Business/BusinessHub.tsx`
- Modify: `components/layout/AppShell.tsx`

- [ ] Add failing UI contracts for all nine tabs, safe API response parsing, mobile wrapping, connector-state messaging, and embedded customer workspace.
- [ ] Build Overview, Companies, Sales, Mail, Business Cards, Meetings, Tasks, and Reports panels; reuse `CRMView` for Customers.
- [ ] Show provisional/confirmed revenue labels and approval-first messaging for external actions.
- [ ] Rerun and confirm GREEN.

## Task 4: Verify Business Hub

**Files:**
- Modify only files listed above if verification finds scoped issues.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and inspect the scoped diff.
