# Business Hub Design

## Objective

Replace the standalone CRM navigation entry with one Business Hub that connects customers, companies, sales, revenue, mail, business cards, meetings, tasks, reports, and AI assistance. Existing CRM data is migrated in place and not deleted.

## Navigation

The main sidebar contains one `Business` entry. Inside it, responsive secondary navigation exposes:

1. Overview
2. Customers
3. Companies
4. Sales
5. Mail
6. Business Cards
7. Meetings
8. Tasks
9. Reports

The app supports `/business` and the corresponding subpaths while preserving the existing application shell and authentication gate. The former `crm` view redirects to `/business/customers`.

## Domain boundaries

Focused repositories own contacts, companies, deals/revenue, mail metadata, cards, meetings, tasks, activities, and reports. All records include `ownerId`, creation/update timestamps, and soft-delete metadata. Provider message bodies and attachments are referenced or cached according to retention settings rather than copied without limit.

The current CRM customer, activity, task, deal, insight, and audit data are normalized into the Business Hub stores through a deterministic, backed-up migration. Cross-owner reads and writes return masked not-found responses.

## Connector-backed data

- Gmail: inbox/sent/drafts/important/unread, search, labels, attachments, customer matching, AI summary, and approval-first draft/send.
- Google Drive: customer/deal/project file references and approved upload/share actions.
- Google Calendar: meetings, attendees, Meet links, and approval-first create/update/invite.
- Slack: verified workspaces, channels, messages, customer/deal association, and approval-first posting.
- Notion: page/database references and approval-first page creation.
- GitHub: project/repository context only; it remains available but is not falsely represented as a business account.

Every sync job uses the verified owner token, an incremental cursor, idempotency keys, rate-limit handling, and a sync receipt. Connector failure is isolated to its Business Hub panel.

## Overview and sales

Overview shows confirmed revenue, expected revenue, outstanding payments, active deals, new customers, today’s meetings/tasks, unread important mail, and follow-up customers. Sales distinguishes deals, expected revenue, confirmed revenue, payment status, recurring revenue, and source confidence. Bank-notification-derived revenue is always provisional until user confirmation or reconciliation.

## Customer and company context

Customer/company detail pages aggregate contact data, business cards, emails, meetings, deals, revenue, tasks, files, activities, and AI summary. Matching is explainable and requires review when email/domain/phone evidence is ambiguous.

## AI and permissions

AI may read owner-authorized Business Hub context and propose summaries, replies, tasks, meetings, and reports. External mutations follow Planner → Permission Check → Execution Preview → User Approval → Connector Execute → Execution History → Memory Update. No email, Slack post, calendar invite, file deletion, payment mutation, or customer merge happens without approval.

## UI and localization

The existing tokens, cards, spacing, and Korean/English/Japanese i18n architecture are reused. Desktop uses tables with a detail panel; tablet uses a sliding detail panel; mobile uses cards and full-screen detail routes. Loading, empty, partial-sync, expired-token, and retry states are explicit.

## Testing

Tests cover migration, owner isolation, CRUD, connector sync idempotency, customer matching, revenue calculations, approval enforcement, responsive route contracts, localization, and partial connector failures.

