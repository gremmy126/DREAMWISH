import { randomUUID } from "node:crypto";
import {
  readMemoryDb,
  saveMemoryChangePreview
} from "@/src/lib/memory/memory-repository";
import type {
  MemoryChangeAction,
  MemoryChangePreview
} from "@/src/lib/memory/memory.types";

export async function createMemoryChangePreview(input: {
  action: MemoryChangeAction;
  targetId?: string | null;
  proposedContent: string;
}) {
  const now = new Date().toISOString();
  const preview: MemoryChangePreview = {
    id: randomUUID(),
    action: input.action,
    targetId: input.targetId || null,
    proposedContent: input.proposedContent,
    approvalRequired: true,
    status: "preview",
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

export async function undoMemoryChange(previewId: string) {
  const db = await readMemoryDb();
  const preview = db.changes.find((item) => item.id === previewId);
  if (!preview) return { ok: false, error: "Memory change preview not found" };
  const now = new Date().toISOString();
  return saveMemoryChangePreview({
    ...preview,
    status: "undone",
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
