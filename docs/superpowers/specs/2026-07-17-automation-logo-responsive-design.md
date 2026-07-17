# Automation Logo and Responsive Layout Design

## Scope

This change is limited to:

1. Replacing Automation and Integration app marks with the real local assets already supplied under `public/images`.
2. Making the existing Automation workspace usable on laptop, tablet, and mobile widths without changing the established visual design.

The existing colors, typography, spacing scale, cards, node shapes, connector lines, canvas background, animation, app order, categories, behavior, and workflow data model remain unchanged.

## Delivery and merge policy

- The supplied `public/images` logo files must be copied into the feature worktree and added to Git tracking before Registry or UI code is changed.
- All implementation remains on `codex/automation-engine` until every requested verification succeeds.
- No merge to `main` and no push may occur before the verification report is delivered.
- The branch may be merged and pushed only after the user gives a separate final confirmation.

## Canonical logo contract

`AutomationAppDefinition.logoPath` is the single source of truth for branded app logos. Each application definition stores one explicit local path using the exact existing filename and extension. Runtime filename construction, extension probing, and `/images/${appId}.*` requests are prohibited.

The shared `AppLogo` component consumes the Registry definition. It renders a fixed-size, `object-contain` image with the application name as `alt`, preserves transparent backgrounds, and never changes the surrounding card or node dimensions. A failed source is remembered for the page session and remains on the existing Lucide or initial fallback; it is not retried in a render loop.

Internal Automation tools without a real asset keep their current Lucide icons. An internal tool is never assigned another company's logo. The generic `ai` module remains an internal tool mark; the OpenAI logo is used only by the registered `openai` application.

## Explicit logo mapping

| App ID | Registry `logoPath` |
|---|---|
| `gmail` | `/images/gmail.jpg` |
| `google-sheets` | `/images/googlesheet.png` |
| `calendar` | `/images/googlecalendar.png` |
| `drive` | `/images/googledrive.png` |
| `youtube` | `/images/youtube.jpg` |
| `slack` | `/images/slack.png` |
| `notion` | `/images/notion.png` |
| `github` | `/images/github.png` |
| `discord` | `/images/discord.jpg` |
| `telegram` | `/images/telegram.jpg` |
| `outlook` | `/images/outlook.jpg` |
| `microsoft-teams` | `/images/microsoftteam.jpg` |
| `onedrive` | `/images/onedrive.png` |
| `dropbox` | `/images/dropbox.png` |
| `airtable` | `/images/airtable.jpg` |
| `trello` | `/images/trello.png` |
| `asana` | `/images/asana.png` |
| `jira` | `/images/jira.png` |
| `linear` | `/images/linear.jpg` |
| `hubspot` | `/images/hubspot.jpg` |
| `salesforce` | `/images/saleforce.png` |
| `stripe` | `/images/stripe.png` |
| `shopify` | `/images/shopify.png` |
| `wordpress` | `/images/wordpress.png` |
| `facebook` | `/images/facebook.jpg` |
| `instagram` | `/images/instagram.jpg` |
| `x` | `/images/x.png` |
| `linkedin` | `/images/linkedin.png` |
| `openai` | `/images/openai.png` |
| `crm` | `/images/dreanwishcrm.png` |

`shopify.png` is selected instead of the duplicate typo `shofify.png`. The existing filenames `saleforce.png`, `dreanwishcrm.png`, `microsoftteam.jpg`, `googlesheet.png`, `googlecalendar.png`, and `googledrive.png` are intentionally mapped exactly as supplied rather than renamed or inferred.

## Logo consumers

All branded application surfaces use the same shared component and Registry value:

- Automation module catalog and app search
- App selection surfaces
- React Flow nodes
- Scenario Inspector
- Approval preview and approval center
- Durable execution history
- Workflow templates and connection manager
- Integrations app list, connector cards, and selected connector details

Connectors that do not correspond to an Automation Registry application retain their existing Lucide icon.

## Responsive layout

### Width 1024px and above

The existing three-column composition remains visible. The catalog and Inspector use bounded `clamp()` widths while the canvas uses `minmax(0, 1fr)` and `min-width: 0`. Each side panel scrolls internally. Header controls may wrap, but Run and Save remain reachable and the workflow name truncates instead of forcing horizontal overflow.

### Width 640px through 1023px

The canvas is the default workspace. The catalog and Inspector are removed from normal document flow and opened as left and right drawers. Opening or closing a drawer does not recreate the workflow, nodes, or edges.

### Width below 640px

The canvas remains the default workspace. The application picker and Inspector open as bottom sheets. The sheets use a bounded mobile header, scrollable content, safe-area bottom padding, and `100dvh`-compatible maximum height.

## Accessible overlay behavior

The reusable responsive panel provides:

- Escape-key close
- Focus trap while open
- Focus restoration to the invoking button
- Dialog semantics and an accessible label
- A visible close control
- Touch targets of at least 44px
- Scroll containment
- `env(safe-area-inset-bottom)` padding
- Background overlay click to close

The desktop panels are unchanged semantically and visually.

## React Flow behavior

Node, edge, handle, canvas background, and animation styling remain untouched. The canvas receives only layout-safe behavior:

- Initial `fitView`
- A `ResizeObserver` or React Flow update call when the container or responsive panels change size
- A bounded node-add position based on the current viewport
- Minimap hidden below 640px and retained above it
- Existing zoom limits and controls retained, with touch-friendly control hit areas

## Mobile execution history

Durable execution data keeps the same fields. At widths below 640px, wide row layouts become stacked cards with expandable details; no data is removed. Approval preview and execution detail continue to show the registered app logo at a fixed badge size.

## Verification

Automated contract tests must prove:

- Every mapped `logoPath` names an existing tracked file.
- No runtime filename guessing or external logo URL remains.
- All Registry applications have one explicit logo path.
- The shared logo component has stable failure fallback behavior.
- Automation and Integrations consume the shared component.
- The responsive breakpoints and accessible overlay contract are present.

Direct viewport verification must cover:

- 375×667
- 390×844
- 768×1024
- 1024×768
- 1280×720
- 1366×768
- 1440×900
- 1920×1080

At each applicable width, verify logo loading, no page-level horizontal overflow, canvas reachability, app picker access, Inspector access, node selection, Run/Save access, and the correct desktop/drawer/bottom-sheet mode.

Final commands are `git status`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. The report must list changed files, every logo mapping, fallback apps, viewport results, and command outcomes before any merge or push decision.
