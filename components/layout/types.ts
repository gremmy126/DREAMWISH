export const SIDEBAR_NAV_ORDER = [
  "chat",
  "memory",
  "business",
  "crm",
  "automation",
  "calendar",
  "files",
  "integrations",
  "settings"
] as const;

export type ViewId = (typeof SIDEBAR_NAV_ORDER)[number];
