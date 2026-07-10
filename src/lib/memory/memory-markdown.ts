import fs from "node:fs/promises";
import path from "node:path";
import type { ApprovedMemory } from "@/src/lib/memory/memory.types";

const MEMORY_DIR = path.join(process.cwd(), "SecondBrain", "08_Memory", "approved");

export async function writeApprovedMemoryMarkdown(memory: Omit<ApprovedMemory, "markdownPath">) {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
  const date = memory.approvedAt.slice(0, 10);
  const fileName = `${date}-${slugify(memory.title)}-${memory.id.slice(0, 8)}.md`;
  const absolutePath = path.join(MEMORY_DIR, fileName);
  await fs.writeFile(absolutePath, renderMemoryMarkdown(memory), "utf8");
  return path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");
}

function renderMemoryMarkdown(memory: Omit<ApprovedMemory, "markdownPath">) {
  const tags = memory.signals.map((signal) => `memory/${signal}`).join(", ");
  const semanticTags = memory.tags?.join(", ") || "";
  const relatedConcepts = memory.relatedConcepts?.join(" -> ") || "";
  const relatedLinks = memory.relatedLinks?.map((link) => `${link.type}:${link.label}`).join(", ") || "";
  return `---
id: ${memory.id}
type: memory
status: approved
source: ${memory.source}
source_id: ${memory.sourceId || ""}
project_id: ${memory.projectId || ""}
category: ${memory.category || ""}
semantic_tags: ${semanticTags}
related_concepts: ${relatedConcepts}
related_links: ${relatedLinks}
importance: ${memory.importance}
recency: ${memory.recency}
frequency: ${memory.frequency}
confidence: ${memory.confidence}
approved_at: ${memory.approvedAt}
approved_by: ${memory.approvedBy}
tags: [${tags}]
---

# ${memory.title}

${memory.summary ? `## Summary\n\n${memory.summary}\n\n` : ""}${semanticTags ? `## Tags\n\n${semanticTags}\n\n` : ""}${relatedConcepts ? `## Related Concepts\n\n${relatedConcepts}\n\n` : ""}${relatedLinks ? `## Related Links\n\n${relatedLinks}\n\n` : ""}
${memory.content}

## Metadata

- Importance: ${memory.importance}
- Recency: ${memory.recency}
- Frequency: ${memory.frequency}
- Confidence: ${memory.confidence}
- Approval note: ${memory.approvalNote || "none"}
`;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54);
  return slug || "memory";
}
