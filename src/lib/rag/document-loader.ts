import fs from "node:fs/promises";
import path from "node:path";
import type { LocalDocument, RagChunk } from "./rag.types";

const DEFAULT_SECOND_BRAIN_DIR = "SecondBrain";

export function getSecondBrainRoot() {
  return process.env.SECOND_BRAIN_PATH || path.join(process.cwd(), DEFAULT_SECOND_BRAIN_DIR);
}

export async function loadMarkdownDocuments(root = getSecondBrainRoot()): Promise<LocalDocument[]> {
  const exists = await pathExists(root);

  if (!exists) {
    throw new Error("아직 로컬 문서 저장소를 찾을 수 없습니다. SecondBrain 폴더 위치를 확인해주세요.");
  }

  const files = await listMarkdownFiles(root);
  const documents = await Promise.all(
    files.map(async (absolutePath) => {
      const raw = await fs.readFile(absolutePath, "utf8");
      const parsed = parseMarkdown(raw);
      const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");

      return {
        title: parsed.title || path.basename(absolutePath, ".md"),
        relativePath,
        absolutePath,
        updated: parsed.frontmatter.updated || null,
        tags: parsed.frontmatter.tags,
        content: parsed.body
      };
    })
  );

  return documents.filter((document) => document.content.trim().length > 0);
}

export function chunkDocuments(documents: LocalDocument[]): RagChunk[] {
  return documents.flatMap((document) => {
    const sections = splitIntoSections(document.content);
    return sections.map((content, index) => ({
      id: `${document.relativePath}#${index}`,
      title: document.title,
      path: document.relativePath,
      updated: document.updated,
      content,
      relevance: 0
    }));
  });
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);

      if (entry.isDirectory()) {
        return listMarkdownFiles(entryPath);
      }

      if (
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        !entry.name.includes(".backup.")
      ) {
        return [entryPath];
      }

      return [];
    })
  );

  return files.flat();
}

function parseMarkdown(raw: string) {
  const frontmatter: { updated?: string; tags: string[] } = { tags: [] };
  let body = raw;

  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end > -1) {
      const yaml = raw.slice(3, end).trim();
      body = raw.slice(end + 4).trim();
      const lines = yaml.split(/\r?\n/u);
      let currentKey: string | null = null;

      for (const line of lines) {
        const keyValue = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/u);
        if (keyValue) {
          currentKey = keyValue[1];
          const value = keyValue[2]?.trim();
          if (currentKey === "updated" && value) frontmatter.updated = value;
          if (currentKey === "tags" && value) frontmatter.tags.push(value);
          continue;
        }

        const listItem = line.match(/^\s*-\s*(.+)$/u);
        if (listItem && currentKey === "tags") {
          frontmatter.tags.push(listItem[1].replace(/^["']|["']$/g, ""));
        }
      }
    }
  }

  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim();

  return { frontmatter, title, body };
}

function splitIntoSections(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  const sections = normalized
    .split(/\n(?=#{1,3}\s)/u)
    .map((section) => section.trim())
    .filter(Boolean);

  const chunks = sections.length > 0 ? sections : [normalized];

  return chunks.flatMap((chunk) => {
    if (chunk.length <= 1600) return [chunk];

    const slices: string[] = [];
    for (let index = 0; index < chunk.length; index += 1400) {
      slices.push(chunk.slice(index, index + 1600).trim());
    }
    return slices.filter(Boolean);
  });
}
