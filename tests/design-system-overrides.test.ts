import assert from "node:assert/strict";
import {
  isEditableDesignToken,
  renderOverridesCss,
  sanitizeOverrides
} from "../src/lib/design/design-system-overrides.repository";

test("only known color tokens with strict hex values survive sanitization", () => {
  const clean = sanitizeOverrides({
    primary: { light: "#123ABC", dark: "#abcdef" },
    "radius-md": { light: "#111111", dark: "#222222" }, // not a color token
    "unknown-token": { light: "#111111", dark: "#222222" },
    success: { light: "red", dark: "#00ff00" }, // named colors rejected
    danger: { light: "#ff0000;} body{display:none", dark: "#00ff00" } // injection attempt
  });
  assert.deepEqual(Object.keys(clean), ["primary"]);
  assert.deepEqual(clean.primary, { light: "#123abc", dark: "#abcdef" });
});

test("override CSS targets both light root and dark theme selector", () => {
  const css = renderOverridesCss({ primary: { light: "#111111", dark: "#eeeeee" } });
  assert.match(css, /:root \{ --primary: #111111; \}/u);
  assert.match(css, /:root\[data-theme="dark"\] \{ --primary: #eeeeee; \}/u);
  assert.equal(renderOverridesCss({}), "");
});

test("editable token allowlist covers colors and excludes structure tokens", () => {
  assert.ok(isEditableDesignToken("primary"));
  assert.ok(isEditableDesignToken("background"));
  assert.ok(!isEditableDesignToken("radius-xl"));
  assert.ok(!isEditableDesignToken("motion-fast"));
});
