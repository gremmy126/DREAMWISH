export const SIDEBAR_NAV_ORDER = ["chat", "memory", "team"] as const;

// Views that stay fully functional but are reached from quick actions or the
// Topbar profile menu instead of the sidebar.
export const HIDDEN_WORKSPACE_VIEWS = ["files", "settings"] as const;

// Stage 1 retirement: these views were removed from every menu. Their data
// stores are preserved read-only; see docs/stage-1-audit.md.
export const RETIRED_WORKSPACE_VIEWS = [
  "business",
  "crm",
  "automation",
  "calendar",
  "integrations"
] as const;

export type SidebarViewId = (typeof SIDEBAR_NAV_ORDER)[number];
export type HiddenViewId = (typeof HIDDEN_WORKSPACE_VIEWS)[number];
export type ViewId = SidebarViewId | HiddenViewId;
