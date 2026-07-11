import { randomUUID } from "node:crypto";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type KnowledgeNote = {
  ownerId: string;
  id: string;
  title: string;
  body: string;
  tags: string[];
  projectId: string | null;
  sourceFileId: string | null;
  createdAt: string;
  updatedAt: string;
};

type KnowledgeDb = {
  notes: KnowledgeNote[];
};

const EMPTY_DB: KnowledgeDb = { notes: [] };

export async function listKnowledgeNotes(ownerId: string, projectId?: string | null) {
  return (await readDb()).notes.filter(
    (note) =>
      note.ownerId === ownerId &&
      (projectId === undefined || note.projectId === projectId)
  );
}

export async function createKnowledgeNote(input: {
  ownerId: string;
  title: string;
  body: string;
  tags?: string[];
  projectId: string | null;
  sourceFileId?: string | null;
}) {
  const now = new Date().toISOString();
  const note: KnowledgeNote = {
    ownerId: input.ownerId,
    id: randomUUID(),
    title: input.title.trim() || "새 지식",
    body: input.body.trim(),
    tags: input.tags || [],
    projectId: input.projectId,
    sourceFileId: input.sourceFileId || null,
    createdAt: now,
    updatedAt: now
  };
  const db = await readDb();
  db.notes.unshift(note);
  await writeDb(db);
  return note;
}

export function buildKnowledgeGraph(notes: KnowledgeNote[]) {
  return notes.map((note, index) => ({
    id: note.id,
    title: note.title,
    x: 15 + (index % 4) * 21,
    y: 18 + Math.floor(index / 4) * 22,
    tag: note.tags[0] || "note"
  }));
}

async function readDb() {
  const db = await readJsonStore<KnowledgeDb>("knowledge.json", EMPTY_DB);
  return { notes: Array.isArray(db.notes) ? db.notes : [] };
}

function writeDb(db: KnowledgeDb) {
  return writeJsonStore("knowledge.json", db);
}
