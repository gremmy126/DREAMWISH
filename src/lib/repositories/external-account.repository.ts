import type { ExternalAccount } from "@/src/lib/integrations/types";
import { readJsonStore } from "@/src/lib/local-db/json-store";

type ExternalAccountDb = {
  accounts: ExternalAccount[];
};

const EMPTY_DB: ExternalAccountDb = { accounts: [] };

export async function listExternalAccounts() {
  const db = await readJsonStore<ExternalAccountDb>("external-accounts.json", EMPTY_DB);
  return Array.isArray(db.accounts) ? db.accounts : [];
}
