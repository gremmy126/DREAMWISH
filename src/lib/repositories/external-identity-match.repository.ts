import type { ExternalIdentityMatch } from "@/src/lib/integrations/types";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

type OwnedExternalIdentityMatch = ExternalIdentityMatch & { ownerId: string };

type ExternalIdentityMatchDb = {
  matches: OwnedExternalIdentityMatch[];
};

const EMPTY_DB: ExternalIdentityMatchDb = { matches: [] };
const FILE_NAME = "external-identity-matches.json";

export async function addExternalIdentityMatch(ownerId: string, match: ExternalIdentityMatch) {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const ownedMatch = { ...match, ownerId };
    const index = db.matches.findIndex(
      (item) => item.ownerId === ownerId && item.id === match.id
    );
    if (index >= 0) db.matches[index] = ownedMatch;
    else db.matches.unshift(ownedMatch);
    await writeDb(db);
    return ownedMatch;
  });
}

export async function listExternalIdentityMatches(ownerId: string) {
  return (await readDb()).matches.filter((item) => item.ownerId === ownerId);
}

export async function updateExternalIdentityMatchStatus(
  ownerId: string,
  id: string,
  status: ExternalIdentityMatch["status"]
) {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const match = db.matches.find((item) => item.ownerId === ownerId && item.id === id);
    if (!match) return null;
    match.status = status;
    await writeDb(db);
    return match;
  });
}

async function readDb() {
  const db = await readJsonStore<ExternalIdentityMatchDb>(FILE_NAME, EMPTY_DB);
  return { matches: Array.isArray(db.matches) ? db.matches : [] };
}

function writeDb(db: ExternalIdentityMatchDb) {
  return writeJsonStore(FILE_NAME, db);
}
