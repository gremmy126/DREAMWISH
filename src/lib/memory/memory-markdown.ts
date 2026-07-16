import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getDataDirectory } from "../local-db/json-store";
import type { ApprovedMemory } from "./memory.types";

export async function writeApprovedMemoryMarkdown(memory: Omit<ApprovedMemory, "markdownPath">) {
  const ownerDirectory = createHash("sha256").update(memory.ownerId).digest("hex");
  const memoryDir = path.join(getDataDirectory(), "memory-markdown", ownerDirectory);
  await fs.mkdir(memoryDir, { recursive: true });
  const date = memory.approvedAt.slice(0, 10);
  const idHash = createHash("sha256").update(memory.id).digest("hex");
  const fileName = `${date}-${slugify(memory.title)}-${idHash}.md`;
  const absolutePath = path.join(memoryDir, fileName);
  await fs.writeFile(absolutePath, renderMemoryMarkdown(memory), "utf8");
  return path.relative(getDataDirectory(), absolutePath).replace(/\\/g, "/");
}

export async function deleteApprovedMemoryMarkdown(ownerId: string, markdownPath: string) {
  if (!markdownPath) return;
  await fs.rm(resolveApprovedMemoryMarkdownPath(ownerId, markdownPath), { force: true });
}

export async function persistAfterDeletingApprovedMemoryMarkdown<T>(
  ownerId: string,
  markdownPath: string,
  persist: () => Promise<T>
): Promise<T> {
  const absolutePath = resolveApprovedMemoryMarkdownPath(ownerId, markdownPath);
  const previousBytes = await readOptionalBytes(absolutePath);
  await fs.rm(absolutePath, { force: true });
  try {
    return await persist();
  } catch (error) {
    if (previousBytes) {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, previousBytes);
    }
    throw error;
  }
}

export async function replaceApprovedMemoryMarkdown<T>(
  ownerId: string,
  previousPath: string,
  memory: Omit<ApprovedMemory, "markdownPath">,
  persist: (markdownPath: string) => Promise<T>
): Promise<T> {
  const previousAbsolutePath = resolveApprovedMemoryMarkdownPath(ownerId, previousPath);
  const previousBytes = await readOptionalBytes(previousAbsolutePath);
  const nextPath = await writeApprovedMemoryMarkdown(memory);
  const nextAbsolutePath = resolveApprovedMemoryMarkdownPath(ownerId, nextPath);
  try {
    if (nextPath !== previousPath) {
      await fs.rm(previousAbsolutePath, { force: true });
    }
    return await persist(nextPath);
  } catch (error) {
    await rollbackMarkdownReplacement({
      previousAbsolutePath,
      previousBytes,
      nextAbsolutePath,
      pathChanged: nextPath !== previousPath
    });
    throw error;
  }
}

function resolveApprovedMemoryMarkdownPath(ownerId: string, markdownPath: string) {
  if (
    !markdownPath ||
    path.isAbsolute(markdownPath) ||
    markdownPath.includes("\\") ||
    path.posix.normalize(markdownPath) !== markdownPath ||
    !markdownPath.endsWith(".md")
  ) {
    throw new Error("MEMORY_MARKDOWN_PATH_INVALID");
  }
  const ownerDirectory = createHash("sha256").update(ownerId).digest("hex");
  const ownerRoot = path.resolve(getDataDirectory(), "memory-markdown", ownerDirectory);
  const ownerPrefix = `memory-markdown/${ownerDirectory}/`;
  const ownerFileName = markdownPath.slice(ownerPrefix.length);
  if (
    markdownPath.startsWith(ownerPrefix) &&
    ownerFileName &&
    !ownerFileName.includes("/")
  ) {
    const absolutePath = path.resolve(getDataDirectory(), markdownPath);
    if (path.dirname(absolutePath) === ownerRoot) return absolutePath;
  }

  const legacyPrefix = "SecondBrain/08_Memory/approved/";
  const legacyFileName = markdownPath.slice(legacyPrefix.length);
  if (
    markdownPath.startsWith(legacyPrefix) &&
    legacyFileName &&
    !legacyFileName.includes("/")
  ) {
    const legacyRoot = path.resolve(process.cwd(), "SecondBrain", "08_Memory", "approved");
    const absolutePath = path.resolve(process.cwd(), markdownPath);
    if (path.dirname(absolutePath) === legacyRoot) return absolutePath;
  }
  throw new Error("MEMORY_MARKDOWN_PATH_INVALID");
}

async function readOptionalBytes(filePath: string) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function rollbackMarkdownReplacement(input: {
  previousAbsolutePath: string;
  previousBytes: Buffer | null;
  nextAbsolutePath: string;
  pathChanged: boolean;
}) {
  if (input.pathChanged) await fs.rm(input.nextAbsolutePath, { force: true });
  if (input.previousBytes) {
    await fs.mkdir(path.dirname(input.previousAbsolutePath), { recursive: true });
    await fs.writeFile(input.previousAbsolutePath, input.previousBytes);
  } else if (!input.pathChanged) {
    await fs.rm(input.nextAbsolutePath, { force: true });
  }
}

function renderMemoryMarkdown(memory: Omit<ApprovedMemory, "markdownPath">) {
  const tags = memory.signals.map((signal) => `memory/${signal}`).join(", ");
  const semanticTags = memory.tags?.join(", ") || "";
  const relatedConcepts = memory.relatedConcepts?.join(" -> ") || "";
  const relatedLinks = memory.relatedLinks?.map((link) => `${link.type}:${link.label}`).join(", ") || "";
  return `---
id: ${memory.id}
owner_id: ${memory.ownerId}
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
