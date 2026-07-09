import type { ApprovalExecutionLink } from "@/src/lib/integrations/types";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type ApprovalExecutionLinkDb = {
  links: ApprovalExecutionLink[];
};

const EMPTY_DB: ApprovalExecutionLinkDb = { links: [] };

export async function addApprovalExecutionLink(
  link: Omit<ApprovalExecutionLink, "id" | "createdAt" | "updatedAt">
) {
  const db = await readDb();
  const now = new Date().toISOString();
  const record: ApprovalExecutionLink = {
    ...link,
    id: `approval_execution_${Date.now()}`,
    createdAt: now,
    updatedAt: now
  };
  db.links.unshift(record);
  await writeDb(db);
  return record;
}

export async function listApprovalExecutionLinks() {
  return (await readDb()).links;
}

async function readDb() {
  const db = await readJsonStore<ApprovalExecutionLinkDb>("approval-execution-links.json", EMPTY_DB);
  return { links: Array.isArray(db.links) ? db.links : [] };
}

function writeDb(db: ApprovalExecutionLinkDb) {
  return writeJsonStore("approval-execution-links.json", db);
}
