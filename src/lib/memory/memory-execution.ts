import { randomUUID } from "node:crypto";
import {
  readMemoryDb,
  saveMemoryChangePreview
} from "@/src/lib/memory/memory-repository";
import type {
  MemoryChangeAction,
  MemoryChangePreview
} from "@/src/lib/memory/memory.types";

export async function createMemoryChangePreview(ownerId: string, input: {
  action: MemoryChangeAction;
  targetId?: string | null;
  proposedContent: string;
}) {
  if (input.targetId && input.action !== "capture") {
    const target = (await readMemoryDb()).memories.find(
      (memory) =>
        memory.ownerId === ownerId &&
        memory.id === input.targetId &&
        memory.status === "approved"
    );
    if (!target) throw new Error("MEMORY_NOT_FOUND");
  }
  const now = new Date().toISOString();
  const preview: MemoryChangePreview = {
    id: randomUUID(),
    ownerId,
    action: input.action,
    targetId: input.targetId || null,
    proposedContent: input.proposedContent,
    approvalRequired: true,
    status: "preview",
    version: 1,
    createdAt: now,
    updatedAt: now,
    history: [
      {
        at: now,
        event: "Preview created. No memory was changed.",
        actor: "system"
      }
    ]
  };
  return saveMemoryChangePreview(preview);
}

export async function undoMemoryChange(ownerId: string, previewId: string) {
  const db = await readMemoryDb();
  const preview = db.changes.find(
    (item) => item.id === previewId && item.ownerId === ownerId
  );
  if (!preview) return { ok: false, error: "Memory change preview not found" };
  const now = new Date().toISOString();
  return saveMemoryChangePreview({
    ...preview,
    status: "undone",
    version: preview.version + 1,
    updatedAt: now,
    history: [
      ...preview.history,
      {
        at: now,
        event: "Preview marked as undone. No approved memory was modified.",
        actor: "user"
      }
    ]
  }).then(() => ({ ok: true }));
}
