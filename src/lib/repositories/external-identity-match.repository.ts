import type { ExternalIdentityMatch } from "@/src/lib/integrations/types";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type ExternalIdentityMatchDb = {
  matches: ExternalIdentityMatch[];
};

const EMPTY_DB: ExternalIdentityMatchDb = { matches: [] };

export async function addExternalIdentityMatch(match: ExternalIdentityMatch) {
  const db = await readDb();
  const index = db.matches.findIndex((item) => item.id === match.id);
  if (index >= 0) db.matches[index] = match;
  else db.matches.unshift(match);
  await writeDb(db);
  return match;
}

export async function listExternalIdentityMatches() {
  return (await readDb()).matches;
}

export async function updateExternalIdentityMatchStatus(
  id: string,
  status: ExternalIdentityMatch["status"]
) {
  const db = await readDb();
  const match = db.matches.find((item) => item.id === id);
  if (!match) return null;
  match.status = status;
  await writeDb(db);
  return match;
}

async function readDb() {
  const db = await readJsonStore<ExternalIdentityMatchDb>("external-identity-matches.json", EMPTY_DB);
  return { matches: Array.isArray(db.matches) ? db.matches : [] };
}

function writeDb(db: ExternalIdentityMatchDb) {
  return writeJsonStore("external-identity-matches.json", db);
}
