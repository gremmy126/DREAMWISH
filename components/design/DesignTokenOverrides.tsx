"use client";

import { useEffect, useState } from "react";

// Applies the signed-in user's saved design-token overrides on top of
// globals.css. The CSS text comes from the server, where every value is
// validated as a strict hex color, so injecting it into a <style> tag is safe.
// Listens for live edits from the design-system editor so changes apply to
// the whole workspace without a reload.

export const DESIGN_TOKENS_UPDATED_EVENT = "dreamwish:design-tokens-updated";

export function DesignTokenOverrides() {
  const [css, setCss] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/design/system")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: { designSystem?: { overridesCss?: string } } | null) => {
        if (!cancelled && typeof body?.designSystem?.overridesCss === "string") {
          setCss(body.designSystem.overridesCss);
        }
      })
      .catch(() => undefined);

    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ overridesCss?: string }>).detail;
      if (typeof detail?.overridesCss === "string") setCss(detail.overridesCss);
    };
    window.addEventListener(DESIGN_TOKENS_UPDATED_EVENT, handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(DESIGN_TOKENS_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  if (!css) return null;
  return <style data-design-token-overrides>{css}</style>;
}
