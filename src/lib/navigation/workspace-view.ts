import type { ViewId } from "../../../components/layout/types";

const WORKSPACE_VIEWS = new Set<ViewId>([
  "chat",
  "knowledge",
  "memory",
  "business",
  "crm",
  "workflow",
  "automation",
  "calendar",
  "files",
  "integrations",
  "settings"
]);

export function getWorkspaceViewUrl(view: ViewId) {
  const normalized = view === "crm" ? "business" : view;
  if (normalized === "chat") return "/";
  return `/?view=${encodeURIComponent(normalized)}`;
}

export function resolveWorkspaceView(pathname: string, search: string): ViewId {
  const requested = normalizeWorkspaceView(new URLSearchParams(search).get("view"));
  if (requested) return requested;
  return pathname.startsWith("/business") ? "business" : "chat";
}

export function normalizeWorkspaceView(value: string | null | undefined): ViewId | null {
  if (value === "crm") return "business";
  return value && WORKSPACE_VIEWS.has(value as ViewId) ? value as ViewId : null;
}
