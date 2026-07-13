import { randomUUID } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

export type BusinessCardRecord = {
  id: string; ownerId: string; imageName: string; imagePath: string; mimeType: string; size: number;
  name: string; email: string; phone: string; companyName: string; position: string;
  status: "uploaded" | "analyzed" | "approved" | "rejected";
  customerId: string | null; createdAt: string; updatedAt: string;
};

type CardDb = { cards: BusinessCardRecord[] };
const FILE_NAME = "business-cards.json";
const EMPTY_DB: CardDb = { cards: [] };

export async function createBusinessCard(input: Omit<BusinessCardRecord, "id" | "status" | "customerId" | "createdAt" | "updatedAt">) {
  return withCards(async (db) => {
    const now = new Date().toISOString();
    const card: BusinessCardRecord = { ...input, id: randomUUID(), status: "analyzed", customerId: null, createdAt: now, updatedAt: now };
    db.cards.unshift(card);
    return card;
  });
}

export async function listBusinessCards(ownerId: string) {
  return (await readDb()).cards.filter((card) => card.ownerId === ownerId);
}

export async function approveBusinessCard(ownerId: string, cardId: string, customerId: string) {
  return withCards(async (db) => {
    const card = db.cards.find((item) => item.ownerId === ownerId && item.id === cardId);
    if (!card) return null;
    card.status = "approved"; card.customerId = customerId; card.updatedAt = new Date().toISOString();
    return card;
  });
}

async function readDb() {
  const db = await readJsonStore<CardDb>(FILE_NAME, EMPTY_DB);
  return { cards: Array.isArray(db.cards) ? db.cards : [] };
}

function withCards<T>(operation: (db: CardDb) => Promise<T> | T) {
  return withJsonStoreLock(FILE_NAME, async () => { const db = await readDb(); const result = await operation(db); await writeJsonStore(FILE_NAME, db); return result; });
}
