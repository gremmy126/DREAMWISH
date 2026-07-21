import {
  HIDDEN_WORKSPACE_VIEWS,
  SIDEBAR_NAV_ORDER,
  type ViewId
} from "../../../components/layout/types";

const WORKSPACE_VIEWS = new Set<ViewId>([
  ...SIDEBAR_NAV_ORDER,
  ...HIDDEN_WORKSPACE_VIEWS
]);

// SEO: 각 주요 메뉴는 고유 URL을 가진다. 크롤러가 /chat, /memory, /team을
// 개별 페이지로 색인할 수 있도록 URL을 유지한다.
const VIEW_PATHS: Partial<Record<ViewId, string>> = {
  chat: "/chat",
  memory: "/memory",
  team: "/team"
};

export function getWorkspaceViewUrl(view: ViewId) {
  return VIEW_PATHS[view] || "/";
}

export function resolveWorkspaceView(pathname: string, search: string): ViewId {
  const params = new URLSearchParams(search);
  const isBillingReturn =
    params.get("view") === "settings" && params.get("billing") === "return";
  if (isBillingReturn) return "settings";

  const path = pathname.replace(/\/+$/u, "") || "/";
  if (path === "/memory") return "memory";
  if (path === "/team") return "team";
  return "chat";
}

export function normalizeWorkspaceView(value: string | null | undefined): ViewId | null {
  return value && WORKSPACE_VIEWS.has(value as ViewId) ? (value as ViewId) : null;
}
