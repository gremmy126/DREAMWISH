# AI Chat Home, OAuth Callback, and Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI Chat the stable home, guarantee public DREAMWISH OAuth callback URLs on Railway, and install the approved brain logo and social sharing artwork.

**Architecture:** A single server-only public-origin resolver will build both provider redirect URIs and post-callback return URLs, with canonical DREAMWISH fallback on hosted deployments. A pure client navigation helper will keep the selected workspace view and browser URL synchronized. Branding will use a deterministic SVG brain mark plus an image-generation-derived 1200×630 social card registered explicitly in Next.js metadata.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Firebase session auth, OAuth 2.0/PKCE, Next.js Metadata API, built-in image generation, Node test runner.

## Global Constraints

- Work directly on `main` because the user explicitly requested the final changes on `gremmy126/DREAMWISH` main.
- Preserve the existing untracked `.superpowers/` directory and `h origin main` file; never stage them.
- OAuth validation order is Google Drive, Gmail, Calendar, Slack, GitHub, Notion, Discord.
- No OAuth secret, token, API key, or credential value may enter client responses, logs, screenshots, or commits.
- Hosted callbacks must never emit localhost, `0.0.0.0`, `[::]`, or Railway internal origins.
- `/` always represents AI Chat; explicit `/business/...` deep links may continue to open Business.
- The final social card is 1200×630 and uses the exact approved Korean copy.
- All production code changes follow red-green TDD.

---

### Task 1: Canonical OAuth public origin

**Files:**
- Modify: `tests/oauth-integration-flow.test.ts`
- Modify: `src/lib/oauth/oauth-redirect.ts`
- Reuse: `src/lib/site/metadata.ts`

**Interfaces:**
- Consumes: `SITE_URL`, hosted-environment signals, provider registry `redirectPath`.
- Produces: `getPublicAppUrl(requestUrl: string): string` and `buildPublicReturnUrl(requestUrl: string, params: Record<string, string>): URL`.

- [ ] **Step 1: Add failing tests for Railway internal origins**

```ts
test("hosted OAuth falls back to the canonical site when Railway exposes an internal origin", () => {
  withEnv(
    {
      APP_URL: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
      PUBLIC_APP_URL: undefined,
      NEXT_PUBLIC_SITE_URL: undefined,
      SITE_URL: undefined,
      RAILWAY_ENVIRONMENT: "production"
    },
    () => {
      assert.equal(
        getOAuthRedirectUri(
          "google",
          "https://0.0.0.0:8080/api/integrations/google/connect?service=drive"
        ),
        "https://dreamwish.co.kr/api/integrations/google/callback"
      );
    }
  );
});

test("public callback return urls never use the Railway internal origin", () => {
  withEnv({ APP_URL: undefined, RAILWAY_ENVIRONMENT: "production" }, () => {
    assert.equal(
      buildPublicReturnUrl("https://0.0.0.0:8080/api/integrations/google/callback", {
        view: "integrations",
        connected: "drive"
      }).toString(),
      "https://dreamwish.co.kr/?view=integrations&connected=drive"
    );
  });
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm.cmd test`

Expected: failure because hosted internal origins currently survive fallback or `buildPublicReturnUrl` is not exported.

- [ ] **Step 3: Implement the canonical resolver and return URL builder**

```ts
import { SITE_URL as CANONICAL_SITE_URL } from "@/src/lib/site/metadata";

export function buildPublicReturnUrl(requestUrl: string, params: Record<string, string>) {
  const url = new URL("/", getPublicAppUrl(requestUrl));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

export function getPublicAppUrl(requestUrl: string) {
  const configured = firstEnv([
    "APP_URL",
    "NEXT_PUBLIC_APP_URL",
    "PUBLIC_APP_URL",
    "NEXT_PUBLIC_SITE_URL",
    "SITE_URL"
  ]);
  if (configured) return validateAppUrl(configured, "APP_URL");
  if (isHostedDeployment()) return validateAppUrl(CANONICAL_SITE_URL, "SITE_URL");
  return validateAppUrl(new URL(requestUrl).origin, "request URL");
}
```

Extend internal-host validation to reject `0.0.0.0`, `[::]`, and `::` on hosted deployments.

- [ ] **Step 4: Run the tests and confirm GREEN**

Run: `npm.cmd test`

Expected: all tests pass, including canonical Google callback behavior.

- [ ] **Step 5: Commit the OAuth origin resolver**

```bash
git add tests/oauth-integration-flow.test.ts src/lib/oauth/oauth-redirect.ts
git commit -m "fix: canonicalize hosted OAuth origins"
```

---

### Task 2: Safe callback returns and redirect URI UX

**Files:**
- Modify: `tests/oauth-integration-flow.test.ts`
- Create: `tests/integration-redirect-ui.test.ts`
- Modify: `app/api/integrations/[connectorId]/callback/route.ts`
- Modify: `components/integrations/IntegrationCenter.tsx`

**Interfaces:**
- Consumes: `buildPublicReturnUrl`, `ConnectorAuthState.expectedRedirectUri`, `ConnectorAuthState.redirectMatches`.
- Produces: public success/error callback responses and a copyable redirect URI control.

- [ ] **Step 1: Add failing callback and UI contract tests**

```ts
test("OAuth callback route uses the canonical public return builder", async () => {
  const route = read("app/api/integrations/[connectorId]/callback/route.ts");
  assert.match(route, /buildPublicReturnUrl/u);
  assert.doesNotMatch(route, /url\.origin/u);
});

test("integration cards expose the exact callback with a copy control", async () => {
  const source = read("components/integrations/IntegrationCenter.tsx");
  assert.match(source, /expectedRedirectUri/u);
  assert.match(source, /navigator\.clipboard\.writeText/u);
  assert.match(source, /redirectMatches/u);
  assert.match(source, /Callback URI 복사/u);
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm.cmd test`

Expected: callback route still contains `url.origin`; the copy control contract is missing.

- [ ] **Step 3: Use the public builder for both callback paths**

```ts
return NextResponse.redirect(
  buildPublicReturnUrl(request.url, {
    view: "integrations",
    connected: session.service
  })
);
```

In the error path, build the same public URL with `view`, `error`, `provider`, and the sanitized `reason`.

- [ ] **Step 4: Add a compact copyable callback control**

```tsx
<button
  type="button"
  onClick={() => void copyRedirectUri(auth.expectedRedirectUri)}
  className="rounded-xl border border-app-border px-3 py-2 text-[11px] font-semibold"
>
  Callback URI 복사
</button>
```

Track only the copied URI string in component state. Catch Clipboard API failures and show a non-sensitive Korean status message.

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: all OAuth and UI contracts pass.

- [ ] **Step 6: Commit callback and integration UX**

```bash
git add tests/oauth-integration-flow.test.ts tests/integration-redirect-ui.test.ts app/api/integrations/[connectorId]/callback/route.ts components/integrations/IntegrationCenter.tsx
git commit -m "fix: return OAuth callbacks to the public app"
```

---

### Task 3: Keep AI Chat as the stable home

**Files:**
- Create: `src/lib/navigation/workspace-view.ts`
- Create: `tests/workspace-view-navigation.test.ts`
- Modify: `components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `ViewId`, browser pathname and search string.
- Produces: `resolveWorkspaceView(pathname: string, search: string): ViewId` and `getWorkspaceViewUrl(view: ViewId): string`.

- [ ] **Step 1: Add failing pure navigation tests**

```ts
test("AI Chat always maps to the root home URL", () => {
  assert.equal(getWorkspaceViewUrl("chat"), "/");
});

test("business deep links remain explicit while root resolves to chat", () => {
  assert.equal(resolveWorkspaceView("/", ""), "chat");
  assert.equal(resolveWorkspaceView("/business/customers", ""), "business");
  assert.equal(resolveWorkspaceView("/", "?view=integrations"), "integrations");
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm.cmd test`

Expected: navigation module does not exist.

- [ ] **Step 3: Implement the pure navigation helper**

```ts
export function getWorkspaceViewUrl(view: ViewId) {
  if (view === "chat") return "/";
  const normalized = view === "crm" ? "business" : view;
  return `/?view=${encodeURIComponent(normalized)}`;
}

export function resolveWorkspaceView(pathname: string, search: string): ViewId {
  const requested = new URLSearchParams(search).get("view");
  if (requested === "crm") return "business";
  if (isWorkspaceView(requested)) return requested;
  return pathname.startsWith("/business") ? "business" : "chat";
}
```

- [ ] **Step 4: Route every AppShell view change through one function**

```tsx
const navigateToView = useCallback((view: ViewId) => {
  const normalized = view === "crm" ? "business" : view;
  setActiveView(normalized);
  window.history.replaceState(null, "", getWorkspaceViewUrl(normalized));
}, []);
```

Use it for `Sidebar.onViewChange`, the DREAMWISH logo button, and `dreamwish:navigate`. Initial page restoration uses `resolveWorkspaceView` without rewriting the URL.

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: root maps to AI Chat and explicit Business deep links remain supported.

- [ ] **Step 6: Commit navigation behavior**

```bash
git add src/lib/navigation/workspace-view.ts tests/workspace-view-navigation.test.ts components/layout/AppShell.tsx
git commit -m "fix: keep AI Chat as the workspace home"
```

---

### Task 4: Generate and install DREAMWISH branding assets

**Files:**
- Create: `components/brand/BrainLogo.tsx`
- Create: `app/icon.svg`
- Create: `public/images/dreamwish-social-card.png`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `app/page.tsx`
- Modify: `tests/public-ai-home.test.ts`
- Remove after metadata migration: `app/opengraph-image.tsx`, `app/twitter-image.tsx`, `src/lib/site/social-image.tsx`

**Interfaces:**
- Consumes: approved attached image as the image-generation edit target.
- Produces: reusable `BrainLogo` component, metadata icon, and explicit 1200×630 social card metadata.

- [ ] **Step 1: Add failing brand metadata tests**

```ts
test("DREAMWISH registers the brain logo and static social card", () => {
  const page = read("app/page.tsx");
  const sidebar = read("components/layout/Sidebar.tsx");
  assert.equal(fs.existsSync("app/icon.svg"), true);
  assert.equal(fs.existsSync("public/images/dreamwish-social-card.png"), true);
  assert.match(page, /dreamwish-social-card\.png/u);
  assert.match(page, /width:\s*1200/u);
  assert.match(page, /height:\s*630/u);
  assert.match(sidebar, /BrainLogo/u);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: logo and social card assets are missing.

- [ ] **Step 3: Generate the social card with the built-in image tool**

Use the attached image as the edit target with this exact prompt:

```text
Use case: ads-marketing
Asset type: 1200x630 Open Graph and social sharing card
Primary request: Redesign the supplied DREAMWISH artwork into a cleaner premium social card while preserving its deep navy and electric violet futuristic identity.
Input images: Image 1 is the edit target and composition reference.
Composition/framing: left side contains the brain mark and short Korean headline; right side contains a polished AI Chat interface, luminous knowledge network, and a glowing brain object. Remove the lower duplicate card and the small five-feature icon row. Keep generous safe margins for social crops.
Text (verbatim): "DREAMWISH"; "당신의 모든 지식과 업무를 하나로."; "나만의 기억과 연결되는 개인두뇌 AI"
Constraints: exactly 1200x630 landscape; preserve correct Korean spelling; premium SaaS visual; clear hierarchy at thumbnail size; no other text.
Avoid: watermark, extra logos, tiny unreadable UI copy, duplicated panels, distorted devices, misspelled Korean.
```

Inspect the generated output at original resolution. If any approved text is wrong, perform one targeted edit that changes only the incorrect text. Copy the accepted file to `public/images/dreamwish-social-card.png`.

- [ ] **Step 4: Create the deterministic SVG brain logo**

Implement the same rounded brain outline as `BrainLogo.tsx` and `app/icon.svg`. The React component accepts `className` and uses `currentColor`; the metadata icon uses a violet rounded-square background and white mark.

- [ ] **Step 5: Register explicit social metadata and sidebar logo**

```ts
const socialImage = {
  url: "/images/dreamwish-social-card.png",
  width: 1200,
  height: 630,
  alt: "DREAMWISH 개인두뇌 AI"
};
```

Add `socialImage` to both `openGraph.images` and `twitter.images`, set Twitter card to `summary_large_image`, and replace the sidebar `DW` block with `<BrainLogo />`.

- [ ] **Step 6: Remove superseded dynamic image routes and run tests**

Run: `npm.cmd test`

Expected: brand metadata tests and all existing public-home tests pass.

- [ ] **Step 7: Commit branding assets**

```bash
git add app/icon.svg public/images/dreamwish-social-card.png components/brand/BrainLogo.tsx components/layout/Sidebar.tsx app/page.tsx tests/public-ai-home.test.ts app/opengraph-image.tsx app/twitter-image.tsx src/lib/site/social-image.tsx
git commit -m "feat: install DREAMWISH brain branding"
```

---

### Task 5: Full verification and main reconciliation

**Files:**
- Verify all tracked files from Tasks 1–4.
- Do not stage `.superpowers/` or `h origin main`.

**Interfaces:**
- Consumes: completed implementation and origin remote `https://github.com/gremmy126/DREAMWISH.git`.
- Produces: verified local `main` whose commit hash matches `origin/main` after push.

- [ ] **Step 1: Run the full test and static verification suite**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: every command exits 0; production build emits `/`, callback routes, robots, sitemap, and billing routes.

- [ ] **Step 2: Run local browser verification**

Verify:

- `/` displays guest AI Chat without horizontal overflow.
- Signed-in `/` resolves to AI Chat.
- Business → AI Chat changes the visible view and URL to `/` without reload.
- Integrations displays the exact Google callback and copy control.
- `/opengraph-image` metadata resolves to `/images/dreamwish-social-card.png` through page metadata.
- Browser console has no application errors.

- [ ] **Step 3: Verify the provider sequence**

Confirm generated authorization URLs use:

```text
Google Drive/Gmail/Calendar  https://dreamwish.co.kr/api/integrations/google/callback
Slack                        https://dreamwish.co.kr/api/integrations/slack/callback
GitHub                       https://dreamwish.co.kr/api/integrations/github/callback
Notion                       https://dreamwish.co.kr/api/integrations/notion/callback
Discord                      https://dreamwish.co.kr/api/integrations/discord/callback
```

- [ ] **Step 4: Fetch and compare the remote main branch**

```powershell
git fetch origin main
git log --oneline origin/main..main
git log --oneline main..origin/main
git diff --check origin/main..main
```

Expected: before push, only intentional local commits are ahead and remote has no unexpected commits.

- [ ] **Step 5: Push and prove remote equality**

```powershell
git push origin main
git fetch origin main
git rev-parse main
git rev-parse origin/main
```

Expected: the two hashes are identical. Report the final hash and preserve unrelated untracked files.
