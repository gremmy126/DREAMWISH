import type { ExternalFile } from "@/src/lib/integrations/types";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type ExternalFileDb = {
  files: ExternalFile[];
};

const EMPTY_DB: ExternalFileDb = { files: [] };

export async function addExternalFile(file: ExternalFile) {
  const db = await readDb();
  const index = db.files.findIndex((item) => item.id === file.id);
  if (index >= 0) db.files[index] = file;
  else db.files.unshift(file);
  await writeDb(db);
  return file;
}

export async function listExternalFiles() {
  return (await readDb()).files;
}

async function readDb() {
  const db = await readJsonStore<ExternalFileDb>("external-files.json", EMPTY_DB);
  return { files: Array.isArray(db.files) ? db.files : [] };
}

function writeDb(db: ExternalFileDb) {
  return writeJsonStore("external-files.json", db);
}
