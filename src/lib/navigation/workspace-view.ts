import {
  SIDEBAR_NAV_ORDER,
  type ViewId
} from "../../../components/layout/types";

const WORKSPACE_VIEWS = new Set<ViewId>(SIDEBAR_NAV_ORDER);

export function getWorkspaceViewUrl(_view: ViewId) {
  return "/";
}

export function resolveWorkspaceView(pathname: string, search: string): ViewId {
  const params = new URLSearchParams(search);
  const isOAuthReturn =
    pathname === "/" &&
    params.get("view") === "integrations" &&
    ["connected", "error", "provider"].some((key) => params.has(key));
  return isOAuthReturn ? "integrations" : "chat";
}

export function normalizeWorkspaceView(value: string | null | undefined): ViewId | null {
  return value && WORKSPACE_VIEWS.has(value as ViewId) ? value as ViewId : null;
}
