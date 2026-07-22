export type AgentBuildKind = "website" | "app" | "program" | "image";

export const AGENT_BUILD_KINDS = new Set<AgentBuildKind>([
  "website",
  "app",
  "program",
  "image"
]);

/** Strips markdown fences and pulls out the artifact for the requested kind. */
export function extractArtifact(raw: string, kind: AgentBuildKind): string {
  let text = raw.trim();
  const fence = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/u);
  if (fence) text = fence[1].trim();
  if (kind === "image") {
    const svg = text.match(/<svg[\s\S]*<\/svg>/iu);
    return svg ? svg[0] : "";
  }
  if (kind === "website" || kind === "app") {
    const doc = text.match(/<!doctype html>[\s\S]*/iu) || text.match(/<html[\s\S]*<\/html>/iu);
    if (doc) return doc[0];
    // Some models return only the body — wrap it so the preview still works.
    if (/<(div|main|section|body|style|script)/iu.test(text)) {
      return `<!DOCTYPE html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>\n${text}\n</body></html>`;
    }
    return "";
  }
  return text;
}
