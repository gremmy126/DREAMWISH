const CAPABILITY_ALIASES: Record<string, string[]> = {
  "issues:write": ["repo"],
  "pull_requests:write": ["repo"],
  "contents:write": ["repo"],
  "actions:write": ["workflow", "repo"],
  "content.read": ["notion_authorized"],
  "content.write": ["notion_authorized"],
  "comments.write": ["notion_authorized"]
  ,"files.read": ["Files.Read", "Files.Read.All", "Files.ReadWrite", "Files.ReadWrite.All", "files.metadata.read", "files.content.read"]
  ,"files.write": ["Files.ReadWrite", "Files.ReadWrite.All", "files.content.write", "sharing.write"]
};

export function hasRequiredOAuthScope(grantedScopes: string[], requiredScope: string, appId?: string) {
  if (appId === "notion" && grantedScopes.length === 0) {
    // Notion authorizes capabilities at the integration/page level instead of
    // returning a conventional OAuth scope string.
    return ["content.read", "content.write", "comments.write"].includes(requiredScope);
  }
  const granted = new Set(grantedScopes.map((scope) => scope.trim()).filter(Boolean));
  if (granted.has(requiredScope)) return true;
  if (granted.has(requiredScope.replace(/\./gu, ":"))) return true;
  if ([...granted].some((scope) => scope.endsWith(`/auth/${requiredScope}`))) return true;
  return (CAPABILITY_ALIASES[requiredScope] || []).some((scope) => granted.has(scope));
}

export function missingOAuthScopes(grantedScopes: string[], requiredScopes: string[], appId?: string) {
  return requiredScopes.filter((scope) => !hasRequiredOAuthScope(grantedScopes, scope, appId));
}
