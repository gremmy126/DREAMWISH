# Automation Logo and Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every registered Automation app mark with its exact supplied local logo and make the existing Automation workspace usable at desktop, laptop, tablet, and mobile widths without redesigning it.

**Architecture:** `AutomationAppDefinition.logoPath` holds one explicit local asset path and the shared `AppLogo` component is the only branded rendering path. The existing desktop structure stays intact; below 1024px the same catalog and Inspector content moves into one accessible overlay primitive that becomes a drawer at tablet widths and a bottom sheet below 640px.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.7, Tailwind CSS 3.4, React Flow 12, Node test runner.

## Global Constraints

- Add supplied `public/images` assets to Git tracking before changing Registry or UI code.
- Never construct or probe `/images/${appId}.*`; use exact filenames and extensions.
- `AutomationAppDefinition.logoPath` is the single source of truth.
- Preserve existing desktop colors, cards, nodes, edges, spacing, typography, animations, app order, categories, and workflow data.
- Use three columns at 1024px and above, drawers at 640–1023px, and bottom sheets below 640px.
- Do not merge to `main` or push before all verification passes and the user separately confirms.

---

### Task 1: Track the supplied logo assets

**Files:**
- Add: `public/images/airtable.jpg`, `public/images/asana.png`, `public/images/discord.jpg`, `public/images/dreanwishcrm.png`, `public/images/dropbox.png`, `public/images/facebook.jpg`, `public/images/github.png`, `public/images/gmail.jpg`, `public/images/googlecalendar.png`, `public/images/googledrive.png`, `public/images/googlesheet.png`, `public/images/instagram.jpg`, `public/images/linkedin.png`, `public/images/microsoftteam.jpg`, `public/images/notion.png`, `public/images/onedrive.png`, `public/images/openai.png`, `public/images/outlook.jpg`, `public/images/saleforce.png`, `public/images/slack.png`, `public/images/stripe.png`, `public/images/telegram.jpg`, `public/images/trello.png`, `public/images/wordpress.png`, `public/images/x.png`, `public/images/youtube.jpg`
- Existing tracked assets: `public/images/hubspot.jpg`, `public/images/jira.png`, `public/images/linear.jpg`, `public/images/shopify.png`

**Interfaces:**
- Consumes: exact user-supplied binary files in `D:/gremmy/public/images`.
- Produces: tracked local files referenced by Task 2 Registry definitions.

- [ ] **Step 1: Compare source and destination names, byte sizes, and SHA-256 hashes**

```powershell
Get-ChildItem D:\gremmy\public\images -File | Get-FileHash -Algorithm SHA256
Get-ChildItem D:\gremmy\.worktrees\automation-engine\public\images -File | Get-FileHash -Algorithm SHA256
```

- [ ] **Step 2: Copy only the missing supplied binaries into the feature worktree**

```powershell
Copy-Item -LiteralPath D:\gremmy\public\images\gmail.jpg -Destination D:\gremmy\.worktrees\automation-engine\public\images\gmail.jpg
```

Repeat with the explicit Add list above; do not use a wildcard or generated filename.

- [ ] **Step 3: Stage only the logo files and verify the staged list**

```powershell
git add -- public/images/airtable.jpg public/images/asana.png public/images/discord.jpg public/images/dreanwishcrm.png public/images/dropbox.png public/images/facebook.jpg public/images/github.png public/images/gmail.jpg public/images/googlecalendar.png public/images/googledrive.png public/images/googlesheet.png public/images/instagram.jpg public/images/linkedin.png public/images/microsoftteam.jpg public/images/notion.png public/images/onedrive.png public/images/openai.png public/images/outlook.jpg public/images/saleforce.png public/images/slack.png public/images/stripe.png public/images/telegram.jpg public/images/trello.png public/images/wordpress.png public/images/x.png public/images/youtube.jpg
git diff --cached --name-only
```

Expected: only the listed `public/images` assets.

- [ ] **Step 4: Commit the assets before code changes**

```powershell
git commit -m "chore: track automation app logos"
```

### Task 2: Make explicit Registry paths and shared AppLogo the only logo path

**Files:**
- Modify: `src/lib/automation/app-registry.ts`
- Create: `components/shared/AppLogo.tsx`
- Delete: `components/Automation/AutomationAppLogo.tsx`
- Modify: `tests/automation-app-registry.test.ts`
- Create: `tests/automation-app-logo.test.ts`

**Interfaces:**
- Produces: `getAutomationApp(appId): AutomationAppDefinition | null` and `AppLogo({ appId, size, color, fallbackIcon, className })`.
- Consumes: exact tracked paths from Task 1.

- [ ] **Step 1: Write failing Registry and component contract tests**

```ts
test("every branded app maps to one existing explicit local file", () => {
  for (const app of AUTOMATION_APP_DEFINITIONS) {
    assert.match(app.logoPath, /^\/images\/[A-Za-z0-9_-]+\.(png|jpg)$/u);
    assert.equal(fs.existsSync(path.join("public", app.logoPath)), true, `${app.id}: ${app.logoPath}`);
  }
});

test("AppLogo never probes guessed filenames and remembers a failed source", () => {
  const source = fs.readFileSync("components/shared/AppLogo.tsx", "utf8");
  assert.doesNotMatch(source, /app-logos|sourceIndex|candidates|\$\{appId\}/u);
  assert.match(source, /failedLogoPaths/u);
  assert.match(source, /app\.logoPath/u);
});
```

- [ ] **Step 2: Run the test suite and verify RED**

Run: `npm.cmd test`

Expected: failures because `AUTOMATION_APP_DEFINITIONS` and `components/shared/AppLogo.tsx` do not exist and Registry paths still point at `/automation-icons`.

- [ ] **Step 3: Define exact paths in each AutomationAppDefinition**

Use the mapping in `docs/superpowers/specs/2026-07-17-automation-logo-responsive-design.md`. Add the CRM definition to `AUTOMATION_APP_DEFINITIONS` with `authType: "none"`, while `AUTOMATION_APPS` remains the connectable-app list used by credential screens.

- [ ] **Step 4: Implement one-source AppLogo fallback behavior**

```tsx
const failedLogoPaths = new Set<string>();

export function AppLogo({ appId, size = 32, color = "#6d5dfc", fallbackIcon: FallbackIcon, className }: AppLogoProps) {
  const app = getAutomationApp(appId);
  const source = app?.logoPath || null;
  const [failed, setFailed] = useState(() => Boolean(source && failedLogoPaths.has(source)));
  if (source && !failed) return <img src={source} alt={`${app.label} 로고`} width={size} height={size} className={cn("shrink-0 rounded-[28%] object-contain", className)} onError={() => { failedLogoPaths.add(source); setFailed(true); }} />;
  const Icon = FallbackIcon || internalIcon(appId);
  return <span aria-label={`${app?.label || appId} 아이콘`} role="img" style={{ width: size, height: size, backgroundColor: color }}><Icon /></span>;
}
```

Use the project's existing class string style rather than introducing a new dependency for `cn`.

- [ ] **Step 5: Run tests and typecheck to verify GREEN**

Run: `npm.cmd test` and `npm.cmd run typecheck`

Expected: both pass.

- [ ] **Step 6: Commit Registry and shared logo changes**

```powershell
git add src/lib/automation/app-registry.ts components/shared/AppLogo.tsx components/Automation/AutomationAppLogo.tsx tests/automation-app-registry.test.ts tests/automation-app-logo.test.ts
git commit -m "feat: use explicit local automation logos"
```

### Task 3: Apply AppLogo to every Automation and Integrations consumer

**Files:**
- Modify: `components/Automation/AutomationView.tsx`
- Modify: `components/Automation/AutomationSecondaryViews.tsx`
- Modify: `components/Automation/ApprovalCenter.tsx`
- Modify: `components/Automation/DurableRunHistory.tsx`
- Modify: `components/integrations/IntegrationCenter.tsx`
- Modify: `components/integrations/IntegrationCard.tsx`
- Modify: `components/integrations/GmailIntegrationCard.tsx`
- Modify: `components/integrations/SlackIntegrationCard.tsx`
- Modify: `components/integrations/CalendarIntegrationCard.tsx`
- Modify: `components/integrations/KeyCredentialPanel.tsx`
- Modify: `tests/automation-operations-ui.test.ts`
- Modify: `tests/integration-redirect-ui.test.ts`

**Interfaces:**
- Consumes: `AppLogo` and `AutomationAppDefinition.logoPath` from Task 2.
- Produces: one rendering path across catalog, nodes, Inspector, approvals, executions, templates, connections, and Integration cards.

- [ ] **Step 1: Write failing source-contract tests for all required surfaces**

```ts
for (const file of requiredConsumers) {
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /AppLogo/u, file);
  assert.doesNotMatch(source, /AutomationAppLogo/u, file);
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test`

Expected: ApprovalCenter, DurableRunHistory, and Integration cards fail the shared-component assertion.

- [ ] **Step 3: Replace imports and branded Lucide props with AppLogo**

Keep existing sizes: catalog 28–30px, node and Inspector 40–48px, approval and history 20–24px, templates 28–32px. Pass the old Lucide icon as `fallbackIcon` only for non-Registry connectors.

- [ ] **Step 4: Run tests and typecheck to verify GREEN**

Run: `npm.cmd test` and `npm.cmd run typecheck`

Expected: both pass.

- [ ] **Step 5: Commit all shared-logo consumers**

```powershell
git add components tests
git commit -m "feat: share app logos across automation surfaces"
```

### Task 4: Add accessible responsive drawers and bottom sheets

**Files:**
- Create: `components/Automation/ResponsiveAutomationPanel.tsx`
- Modify: `components/Automation/AutomationView.tsx`
- Modify: `components/Automation/DurableRunHistory.tsx`
- Create: `tests/automation-responsive-layout.test.ts`

**Interfaces:**
- Produces: `ResponsiveAutomationPanel({ open, onClose, title, side, returnFocusRef, children })`.
- Consumes: existing `ModuleCatalog`, `ScenarioInspector`, and React Flow instance without changing their visual contents.

- [ ] **Step 1: Write failing responsive and accessibility contract tests**

```ts
test("Automation uses three columns at lg and overlay controls below lg", () => {
  assert.match(view, /lg:grid-cols-\[clamp\(180px,18vw,210px\)_minmax\(0,1fr\)_clamp\(260px,24vw,300px\)\]/u);
  assert.match(view, /lg:hidden/u);
  assert.match(panel, /role="dialog"|role=\{"dialog"\}/u);
  assert.match(panel, /Escape/u);
  assert.match(panel, /safe-area-inset-bottom/u);
  assert.match(panel, /100dvh/u);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test`

Expected: the overlay component and responsive contracts are absent.

- [ ] **Step 3: Implement ResponsiveAutomationPanel**

Use a fixed backdrop below `lg`, a right/left drawer from `sm` through `lg - 1`, and a bottom sheet below `sm`. On open, save `document.activeElement`, focus the first focusable control, trap Tab/Shift+Tab, close on Escape, and restore the saved element after close.

- [ ] **Step 4: Wire catalog and Inspector overlay state into AutomationView**

Add 44px `앱 추가` and `설정` controls below `lg`. Render existing desktop panels under `hidden lg:block`, render their same contents inside overlays below `lg`, and automatically open the Inspector after a node is selected on a sub-1024px viewport.

- [ ] **Step 5: Recalculate React Flow without changing visual styles**

Capture the `ReactFlowInstance` via `onInit`. On overlay open/close and a canvas `ResizeObserver` callback, call `fitView({ padding: 0.2, duration: 180 })` in `requestAnimationFrame`. Keep all existing node, edge, handle, Background, and animation classes unchanged. Hide MiniMap only below 640px.

- [ ] **Step 6: Make durable execution history card-based below 640px**

Use responsive display classes so the current row/table remains above `sm` and a stacked card with the same fields appears below `sm`.

- [ ] **Step 7: Run tests, typecheck, and lint to verify GREEN**

Run: `npm.cmd test`, `npm.cmd run typecheck`, and `npm.cmd run lint`

Expected: all pass.

- [ ] **Step 8: Commit responsive behavior**

```powershell
git add components/Automation tests/automation-responsive-layout.test.ts
git commit -m "feat: make automation canvas responsive"
```

### Task 5: Direct viewport and final verification

**Files:**
- Modify only if a failing viewport check exposes a tested defect.

**Interfaces:**
- Consumes: production build from Tasks 1–4.
- Produces: an evidence table for the eight required viewports and final command results.

- [ ] **Step 1: Build and start the production server**

Run: `npm.cmd run build`, then `npm.cmd run start`.

Expected: build exits 0 and `http://127.0.0.1:3100/` returns HTTP 200.

- [ ] **Step 2: Inspect all eight requested viewports directly**

Check 375×667, 390×844, 768×1024, 1024×768, 1280×720, 1366×768, 1440×900, and 1920×1080. Record layout mode, horizontal overflow, catalog access, Inspector access, Run/Save access, logo load failures, and React Flow reachability for each size.

- [ ] **Step 3: Run the exact final command set**

```powershell
git status --short
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Expected: no temporary files, lint/typecheck/test/build all exit 0.

- [ ] **Step 4: Report before integration**

List changed files, all 30 explicit mappings, internal fallback IDs, results for all eight viewports, and final command outcomes. Keep `codex/automation-engine` unmerged and unpushed until the user gives final confirmation.
