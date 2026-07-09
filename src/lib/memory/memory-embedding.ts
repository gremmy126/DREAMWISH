import { createHash, randomUUID } from "node:crypto";
import type { ApprovedMemory, EmbeddingRecord } from "@/src/lib/memory/memory.types";

export function createEmbeddingRecord(memory: ApprovedMemory): EmbeddingRecord {
  const chunks = chunkText(memory.content);
  return {
    id: randomUUID(),
    memoryId: memory.id,
    textHash: createHash("sha256").update(memory.content).digest("hex"),
    vector: createLocalVector(memory.content),
    chunks,
    createdAt: new Date().toISOString()
  };
}

export function createLocalVector(text: string) {
  const vector = new Array<number>(24).fill(0);
  for (const token of tokenize(text)) {
    const hash = createHash("sha1").update(token).digest();
    const index = hash[0] % vector.length;
    vector[index] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function chunkText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += 600) {
    chunks.push(normalized.slice(index, index + 800));
  }
  return chunks;
}
